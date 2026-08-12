// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function rectKey(rect) {
  if (!rect) return null;
  return `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
}

export const previewScreenshotResolver = {
  type: CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT,
  label: 'Preview screenshot',

  isAvailable(appState) {
    return !!appState.devUrl;
  },

  getDefaultOptions() {
    return { mode: 'viewport' };
  },

  async resolve(appState, options) {
    const mode = options?.mode || 'viewport';
    const rect = appState.getPreviewRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error('The preview is not visible. Make sure the dev server is running and the preview panel is open.');
    }
    const { relPath } = await appState.capturePreview({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    const data = {
      mode, path: relPath, viewportWidth: rect.width, viewportHeight: rect.height,
      capturedAt: new Date().toISOString(), selectedRect: rect.selectedRect || null,
    };
    return { data, estimatedCharacters: relPath.length + 200, sourceRevision: `${mode}:${relPath}:${rectKey(rect)}` };
  },

  computeStaleKey(appState) {
    const rect = appState.getPreviewRect();
    return rect ? rectKey(rect) : null;
  },

  renderMarkdown(snapshot) {
    const { mode, path, viewportWidth, viewportHeight, capturedAt, selectedRect } = snapshot.data;
    const lines = ['### Preview screenshot', '', `- File: \`${path}\``, `- Viewport: ${viewportWidth} × ${viewportHeight}`, `- Captured: ${new Date(capturedAt).toLocaleTimeString()}`];
    if (mode === 'selected-element' && selectedRect) {
      lines.push(`- selected element region: ${selectedRect.x}, ${selectedRect.y} (${selectedRect.w} × ${selectedRect.h})`);
    }
    lines.push('', 'The screenshot is at the project-relative path above. Read it and refer to it as the current state of the visible preview.');
    return lines.join('\n');
  },
};
