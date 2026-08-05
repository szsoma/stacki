import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

// Not cryptographic — only used to detect that content changed between two
// resolves, so a cheap DJB2 hash is enough and avoids a Node crypto import
// in renderer code.
function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export const currentFileResolver = {
  type: CONTEXT_CHIP_TYPES.CURRENT_FILE,
  label: 'Current file',

  isAvailable(appState) {
    return !!appState.currentFile;
  },

  getDefaultOptions() {
    return {};
  },

  async resolve(appState) {
    const file = appState.currentFile;
    if (!file) throw new Error('No file is open in the code editor.');
    return {
      data: {
        path: file.path,
        title: file.title,
        language: file.language,
        content: file.content,
      },
      estimatedCharacters: file.content.length,
      sourceRevision: `${file.path || file.title}:${file.content.length}:${hashString(file.content)}`,
    };
  },

  renderMarkdown(snapshot) {
    const { path, title, language, content } = snapshot.data;
    const heading = path ? `\`${path}\`` : title;
    return [
      '### Current file',
      '',
      `- Source: ${heading}`,
      '',
      '```' + (language || ''),
      content,
      '```',
    ].join('\n');
  },
};
