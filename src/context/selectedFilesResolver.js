import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { scanForSecrets } from './secretScan.js';

const LANGUAGE_BY_EXTENSION = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  astro: 'astro',
  json: 'json',
  md: 'markdown',
  html: 'html',
};

function languageFor(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] || '';
}

export const selectedFilesResolver = {
  type: CONTEXT_CHIP_TYPES.SELECTED_FILES,
  label: 'Selected files',

  isAvailable(appState) {
    return !!appState.projectPath;
  },

  getDefaultOptions() {
    return { paths: [] };
  },

  async resolve(appState, options) {
    const paths = options?.paths || [];
    if (paths.length === 0) throw new Error('Select at least one file.');
    const files = [];
    for (const rel of paths) {
      const result = await appState.readProjectFile(rel);
      files.push({ path: rel, content: result.content });
    }
    const secretWarnings = [
      ...new Set(
        files.flatMap((file) => scanForSecrets(file.content).map((name) => `${name} in ${file.path}`)),
      ),
    ];
    const estimatedCharacters = files.reduce((sum, file) => sum + file.content.length, 0);
    const sourceRevision = files.map((file) => `${file.path}:${file.content.length}`).join('|');
    return { data: { files, secretWarnings }, estimatedCharacters, sourceRevision };
  },

  renderMarkdown(snapshot) {
    const { files, secretWarnings } = snapshot.data;
    const lines = ['### Selected files', ''];
    if (secretWarnings.length > 0) {
      lines.push(`> ⚠️ Possible secret detected: ${secretWarnings.join('; ')} — review before sending.`, '');
    }
    for (const file of files) {
      lines.push(`#### \`${file.path}\``, '', '```' + languageFor(file.path), file.content, '```', '');
    }
    return lines.join('\n').trimEnd();
  },
};
