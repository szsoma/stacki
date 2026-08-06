import { describe, expect, it, vi } from 'vitest';
import { selectedFilesResolver } from './selectedFilesResolver.js';

describe('selectedFilesResolver', () => {
  it('is unavailable without an open project', () => {
    expect(selectedFilesResolver.isAvailable({ projectPath: null })).toBe(false);
  });

  it('is available with an open project', () => {
    expect(selectedFilesResolver.isAvailable({ projectPath: '/projects/site' })).toBe(true);
  });

  it('defaults to no selected paths', () => {
    expect(selectedFilesResolver.getDefaultOptions()).toEqual({ paths: [] });
  });

  it('reads every selected file through the injected reader', async () => {
    const readProjectFile = vi.fn(async (rel) => ({
      rel,
      content: `content of ${rel}`,
      size: 42,
    }));
    const result = await selectedFilesResolver.resolve(
      { readProjectFile },
      { paths: ['src/components/Hero.astro', 'src/pages/index.astro'] },
    );
    expect(readProjectFile).toHaveBeenCalledWith('src/components/Hero.astro');
    expect(readProjectFile).toHaveBeenCalledWith('src/pages/index.astro');
    expect(result.data.files).toEqual([
      { path: 'src/components/Hero.astro', content: 'content of src/components/Hero.astro' },
      { path: 'src/pages/index.astro', content: 'content of src/pages/index.astro' },
    ]);
    expect(result.data.secretWarnings).toEqual([]);
    expect(result.estimatedCharacters).toBe(
      'content of src/components/Hero.astro'.length + 'content of src/pages/index.astro'.length,
    );
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('surfaces a secret warning found in an attached file, naming the file', async () => {
    const readProjectFile = vi.fn(async (rel) =>
      rel === '.env.example'
        ? { rel, content: 'AWS_KEY=AKIAABCDEFGHIJKLMNOP', size: 30 }
        : { rel, content: 'ordinary content', size: 17 },
    );
    const result = await selectedFilesResolver.resolve(
      { readProjectFile },
      { paths: ['.env.example', 'src/pages/index.astro'] },
    );
    expect(result.data.secretWarnings).toEqual(['AWS access key in .env.example']);
  });

  it('rejects resolving with no paths selected', async () => {
    await expect(
      selectedFilesResolver.resolve({ readProjectFile: vi.fn() }, { paths: [] }),
    ).rejects.toThrow('Select at least one file.');
  });

  it('renders each file as its own fenced Markdown block', () => {
    const snapshot = {
      data: {
        files: [
          { path: 'src/components/Hero.astro', content: '<h1>Hi</h1>' },
          { path: 'src/styles/global.css', content: 'body { margin: 0; }' },
        ],
        secretWarnings: [],
      },
    };
    const markdown = selectedFilesResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Selected files');
    expect(markdown).toContain('#### `src/components/Hero.astro`');
    expect(markdown).toContain('```astro');
    expect(markdown).toContain('<h1>Hi</h1>');
    expect(markdown).toContain('#### `src/styles/global.css`');
    expect(markdown).toContain('```css');
    expect(markdown).toContain('body { margin: 0; }');
  });

  it('renders a secret-warning callout when present', () => {
    const snapshot = {
      data: {
        files: [{ path: '.env.example', content: 'AWS_KEY=AKIAABCDEFGHIJKLMNOP' }],
        secretWarnings: ['AWS access key in .env.example'],
      },
    };
    const markdown = selectedFilesResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('Possible secret detected: AWS access key in .env.example');
  });
});
