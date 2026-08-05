import { CONTEXT_CHIP_STATUS } from './contextTypes.js';
import { getResolver } from './contextResolvers.js';

const INSTRUCTIONS = [
  'Use the attached Stacki context as the primary target for this request.',
  'Inspect the repository when additional implementation context is required.',
  'Do not assume that unrelated components should be changed.',
].join('\n');

export function composePrompt({ request, snapshots }) {
  const sections = snapshots
    .filter((snapshot) => snapshot.status === CONTEXT_CHIP_STATUS.READY)
    .map((snapshot) => {
      const resolver = getResolver(snapshot.type);
      return resolver ? resolver.renderMarkdown(snapshot) : '';
    })
    .filter(Boolean);

  const parts = ['## User request', '', request.trim(), ''];
  if (sections.length > 0) {
    parts.push('## Stacki context', '', sections.join('\n\n'), '');
  }
  parts.push('## Instructions', '', INSTRUCTIONS);
  return parts.join('\n');
}
