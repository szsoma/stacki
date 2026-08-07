import { describe, expect, it } from 'vitest';
import { consoleErrorsResolver } from './consoleErrorsResolver.js';

const LOG = ['Error: could not resolve import', 'Warning: unused CSS selector .foo'].join('\n\n');

describe('consoleErrorsResolver', () => {
  it('is unavailable when the dev log has no error or warning blocks', () => {
    expect(consoleErrorsResolver.isAvailable({ devLog: '' })).toBe(false);
    expect(consoleErrorsResolver.isAvailable({ devLog: '[vite] ready in 200ms' })).toBe(false);
  });

  it('is available when the dev log has at least one error or warning block', () => {
    expect(consoleErrorsResolver.isAvailable({ devLog: LOG })).toBe(true);
  });

  it('defaults to including warnings', () => {
    expect(consoleErrorsResolver.getDefaultOptions()).toEqual({ includeWarnings: true });
  });

  it('resolves every entry, with error and warning counts, when warnings are included', async () => {
    const result = await consoleErrorsResolver.resolve({ devLog: LOG }, { includeWarnings: true });
    expect(result.data.errorCount).toBe(1);
    expect(result.data.warningCount).toBe(1);
    expect(result.data.entries).toHaveLength(2);
    expect(result.estimatedCharacters).toBeGreaterThan(0);
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('excludes warnings when includeWarnings is false', async () => {
    const result = await consoleErrorsResolver.resolve({ devLog: LOG }, { includeWarnings: false });
    expect(result.data.entries).toHaveLength(1);
    expect(result.data.entries[0].type).toBe('error');
    expect(result.data.warningCount).toBe(0);
  });

  it('rejects resolving when nothing is available', async () => {
    await expect(consoleErrorsResolver.resolve({ devLog: '' }, { includeWarnings: true })).rejects.toThrow(
      'No console errors are available.',
    );
  });

  it('renders a heading, counts, and one line per entry as Markdown', () => {
    const snapshot = {
      data: {
        errorCount: 1,
        warningCount: 1,
        entries: [
          { type: 'error', message: 'Error: could not resolve import', file: null, line: null, count: 1 },
          {
            type: 'warning',
            message: 'Warning: unused CSS selector .foo',
            file: 'src/components/Bar.astro',
            line: 12,
            count: 3,
          },
        ],
      },
    };
    const markdown = consoleErrorsResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Console errors');
    expect(markdown).toContain('1 error, 1 warning');
    expect(markdown).toContain('**error**: Error: could not resolve import');
    expect(markdown).toContain('**warning** (`src/components/Bar.astro:12`) ×3: Warning: unused CSS selector .foo');
  });

  it('produces a different stale key when a new error/warning block is appended', () => {
    const key1 = consoleErrorsResolver.computeStaleKey({ devLog: LOG });
    const key2 = consoleErrorsResolver.computeStaleKey({ devLog: `${LOG}\n\nError: a new problem` });
    expect(key1).not.toBe(key2);
  });

  it('keeps the same stale key when the dev log grows with non-error/warning noise', () => {
    // Build progress, HMR chatter, and "ready in Nms" lines are appended to
    // devLog unthrottled but never show up in the chip's parsed entries —
    // the stale key must be scoped to what actually gets rendered, or the
    // chip would flip to stale within seconds of being attached.
    const key1 = consoleErrorsResolver.computeStaleKey({ devLog: LOG });
    const key2 = consoleErrorsResolver.computeStaleKey({ devLog: `${LOG}\n\n[vite] ready in 200ms` });
    expect(key1).toBe(key2);
  });

  it('returns null stale key when there is no dev log', () => {
    expect(consoleErrorsResolver.computeStaleKey({ devLog: '' })).toBeNull();
  });
});
