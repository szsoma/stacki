// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { CONTEXT_CHIP_STATUS } from './contextTypes.js';
import { getResolver } from './contextResolvers.js';

const INSTRUCTIONS = [
  'Use the attached Stacki context as the primary target for this request.',
  'Inspect the repository when additional implementation context is required.',
  'Do not assume that unrelated components should be changed.',
].join('\n');

const STALE_NOTE = '_(captured earlier — may be out of date; refresh in Stacki if needed)_';

// Both READY and STALE snapshots carry usable `data` from their last
// successful resolve (withStale() only flips `status`, it never clears
// `data` — see contextTypes.js). RESOLVING/ERROR snapshots have no usable
// data (null, or an in-progress/failed resolve) and stay excluded.
const INCLUDABLE_STATUSES = new Set([CONTEXT_CHIP_STATUS.READY, CONTEXT_CHIP_STATUS.STALE]);

/**
 * @param {{ request: any, snapshots: any[] }} args
 */
export function composePrompt({ request, snapshots }) {
  const sections = snapshots
    .filter((snapshot) => INCLUDABLE_STATUSES.has(snapshot.status))
    .map((snapshot) => {
      const resolver = getResolver(snapshot.type);
      if (!resolver) return '';
      const rendered = resolver.renderMarkdown(snapshot);
      return snapshot.status === CONTEXT_CHIP_STATUS.STALE
        ? `${rendered}\n\n${STALE_NOTE}`
        : rendered;
    })
    .filter(Boolean);

  const parts = ['## User request', '', request.trim(), ''];
  if (sections.length > 0) {
    parts.push('## Stacki context', '', sections.join('\n\n'), '');
  }
  parts.push('## Instructions', '', INSTRUCTIONS);
  return parts.join('\n');
}
