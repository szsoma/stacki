import { describe, expect, it } from 'vitest';
import { currentFileResolver } from './currentFileResolver.js';

describe('currentFileResolver', () => {
  it('is unavailable when no file is open', () => {
    expect(currentFileResolver.isAvailable({ currentFile: null })).toBe(false);
  });

  it('is available when a file is open', () => {
    const appState = {
      currentFile: { path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;', kind: 'fragment' },
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
        kind: 'fragment',
      },
    };
    const result = await currentFileResolver.resolve(appState);
    expect(result.data).toEqual({
      path: 'src/pages/index.astro',
      title: 'Frontmatter',
      language: 'javascript',
      content: 'const x = 1;',
      kind: 'fragment',
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

  it('renders a whole file as a fenced Markdown block', () => {
    const snapshot = {
      data: {
        path: 'public/styles/site.css',
        title: 'site.css',
        language: 'css',
        content: 'body { color: red; }',
        kind: 'file',
      },
    };
    const markdown = currentFileResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current file');
    expect(markdown).toContain('`public/styles/site.css`');
    expect(markdown).not.toContain('fragment');
    expect(markdown).toContain('```css');
    expect(markdown).toContain('body { color: red; }');
  });

  it('renders a fragment with a label indicating it is not the whole file', () => {
    const snapshot = {
      data: {
        path: 'src/pages/index.astro',
        title: 'Frontmatter',
        language: 'javascript',
        content: 'const x = 1;',
        kind: 'fragment',
      },
    };
    const markdown = currentFileResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current file');
    expect(markdown).toContain('`src/pages/index.astro` (Frontmatter fragment)');
    expect(markdown).toContain('```javascript');
    expect(markdown).toContain('const x = 1;');
  });

  it('falls back to the title when a fragment has no path', () => {
    const snapshot = {
      data: {
        path: null,
        title: '<style>',
        language: 'css',
        content: 'a { color: blue; }',
        kind: 'fragment',
      },
    };
    const markdown = currentFileResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('- Source: <style>');
  });
});
