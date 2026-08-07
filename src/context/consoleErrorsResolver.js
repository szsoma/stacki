import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { parseDevLogEntries } from './devLogParser.js';

// Not cryptographic — only used to detect that the dev log's content changed
// between two resolves/stale-checks.
function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function filteredEntries(appState, includeWarnings) {
  const all = parseDevLogEntries(appState.devLog);
  return includeWarnings ? all : all.filter((entry) => entry.type === 'error');
}

export const consoleErrorsResolver = {
  type: CONTEXT_CHIP_TYPES.CONSOLE_ERRORS,
  label: 'Console errors',

  isAvailable(appState) {
    return parseDevLogEntries(appState.devLog).length > 0;
  },

  getDefaultOptions() {
    return { includeWarnings: true };
  },

  async resolve(appState, options) {
    const includeWarnings = options?.includeWarnings !== false;
    const entries = filteredEntries(appState, includeWarnings);
    if (entries.length === 0) throw new Error('No console errors are available.');

    const errorCount = entries.filter((entry) => entry.type === 'error').length;
    const warningCount = entries.filter((entry) => entry.type === 'warning').length;
    const data = { entries, errorCount, warningCount };
    const estimatedCharacters = entries.reduce((sum, entry) => sum + entry.message.length, 0);

    return {
      data,
      estimatedCharacters,
      // Hash the *parsed* entries, not the raw devLog string: App.jsx
      // appends every dev-server log chunk unthrottled (build progress, HMR
      // messages, "ready in Nms"), and most of that traffic never shows up
      // in the chip's rendered content at all. Hashing the raw string made
      // this chip flip to STALE within seconds of being attached even
      // though nothing it actually displays had changed — the same
      // false-positive staleness bug fixed for other resolvers by scoping
      // their stale-key hash to what they render. Hash the *unfiltered*
      // parse (not the includeWarnings-filtered `entries` above) so this
      // stays comparable to computeStaleKey()'s hash across an
      // includeWarnings option change.
      sourceRevision: hashString(JSON.stringify(parseDevLogEntries(appState.devLog))),
    };
  },

  computeStaleKey(appState) {
    return appState.devLog ? hashString(JSON.stringify(parseDevLogEntries(appState.devLog))) : null;
  },

  renderMarkdown(snapshot) {
    const { entries, errorCount, warningCount } = snapshot.data;
    const lines = [
      '### Console errors',
      '',
      `- ${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`,
      '',
    ];
    for (const entry of entries) {
      const loc = entry.file ? ` (\`${entry.file}${entry.line ? `:${entry.line}` : ''}\`)` : '';
      const countSuffix = entry.count > 1 ? ` ×${entry.count}` : '';
      lines.push(`- **${entry.type}**${loc}${countSuffix}: ${entry.message}`);
    }
    return lines.join('\n');
  },
};
