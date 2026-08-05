import { describe, expect, it } from 'vitest';
import { currentFileResolver } from './currentFileResolver.js';

describe('currentFileResolver', () => {
  it('is unavailable when no file is open', () => {
    expect(currentFileResolver.isAvailable({ currentFile: null })).toBe(false);
  });

  it('is available when a file is open', () => {
    const appState = {
      currentFile: { path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' },
    };
    expect(currentFileResolver.isAvailable(appState)).toBe(true);
  });

  it('resolves the open file into a snapshot payload', async () => {
    const appState = {
      currentFile: {
        path: 'src/pages/index.astro',
        title: 'Frontmatter',
        language: 'javascript',
        content: 'const x = 1;',
      },
    };
    const result = await currentFileResolver.resolve(appState);
    expect(result.data).toEqual({
      path: 'src/pages/index.astro',
      title: 'Frontmatter',
      language: 'javascript',
      content: 'const x = 1;',
    });
    expect(result.estimatedCharacters).toBe('const x = 1;'.length);
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('produces a different revision when content changes', async () => {
    const base = { path: 'a.astro', title: 'a', language: 'javascript' };
    const first = await currentFileResolver.resolve({ currentFile: { ...base, content: 'one' } });
    const second = await currentFileResolver.resolve({ currentFile: { ...base, content: 'two' } });
    expect(first.sourceRevision).not.toBe(second.sourceRevision);
  });

  it('rejects resolving with no open file', async () => {
    await expect(currentFileResolver.resolve({ currentFile: null })).rejects.toThrow(
      'No file is open in the code editor.',
    );
  });

  it('renders the file as a fenced Markdown block', () => {
    const snapshot = {
      data: {
        path: 'src/pages/index.astro',
        title: 'Frontmatter',
        language: 'javascript',
        content: 'const x = 1;',
      },
    };
    const markdown = currentFileResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current file');
    expect(markdown).toContain('`src/pages/index.astro`');
    expect(markdown).toContain('```javascript');
    expect(markdown).toContain('const x = 1;');
  });
});
