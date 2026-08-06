import { beforeEach, describe, expect, it } from 'vitest';
import { clearResolvers, registerResolver } from './contextResolvers.js';
import { createSnapshot, withError, withReady, withStale } from './contextTypes.js';
import { currentFileResolver } from './currentFileResolver.js';
import { composePrompt } from './promptComposer.js';

beforeEach(() => {
  clearResolvers();
  registerResolver(currentFileResolver);
});

function readySnapshot() {
  return withReady(createSnapshot({ type: 'current-file', label: 'Current file' }), {
    data: { path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' },
    estimatedCharacters: 12,
    sourceRevision: 'rev-1',
  });
}

describe('composePrompt', () => {
  it('composes the request alone when there are no chips', () => {
    const markdown = composePrompt({ request: 'Fix the spacing.', snapshots: [] });
    expect(markdown).toContain('## User request');
    expect(markdown).toContain('Fix the spacing.');
    expect(markdown).not.toContain('## Stacki context');
    expect(markdown).toContain('## Instructions');
    expect(markdown).toContain('Use the attached Stacki context as the primary target for this request.');
  });

  it('includes a Stacki context section for each ready snapshot', () => {
    const markdown = composePrompt({ request: 'Fix the spacing.', snapshots: [readySnapshot()] });
    expect(markdown).toContain('## Stacki context');
    expect(markdown).toContain('### Current file');
    expect(markdown).toContain('const x = 1;');
  });

  it('skips snapshots that are not ready', () => {
    const resolving = createSnapshot({ type: 'current-file', label: 'Current file' });
    const markdown = composePrompt({ request: 'Fix the spacing.', snapshots: [resolving] });
    expect(markdown).not.toContain('## Stacki context');
  });

  it('includes a stale snapshot (with a freshness note) alongside a ready one', () => {
    const stale = withStale(readySnapshot());
    const markdown = composePrompt({ request: 'Fix the spacing.', snapshots: [stale] });
    expect(markdown).toContain('## Stacki context');
    expect(markdown).toContain('### Current file');
    expect(markdown).toContain('const x = 1;');
    expect(markdown).toContain('captured earlier — may be out of date');
  });

  it('excludes resolving and error snapshots even alongside an included stale one', () => {
    const resolving = createSnapshot({ type: 'current-file', label: 'Current file' });
    const errored = withError(
      createSnapshot({ type: 'current-file', label: 'Current file' }),
      new Error('boom'),
    );
    const stale = withStale(readySnapshot());
    const markdown = composePrompt({
      request: 'Fix the spacing.',
      snapshots: [resolving, errored, stale],
    });
    // Only the stale snapshot's single rendered section should appear —
    // resolving/error snapshots contributed nothing.
    const occurrences = markdown.split('### Current file').length - 1;
    expect(occurrences).toBe(1);
    expect(markdown).toContain('captured earlier — may be out of date');
  });

  it('trims the request text', () => {
    const markdown = composePrompt({ request: '  Fix the spacing.  ', snapshots: [] });
    expect(markdown).toContain('## User request\n\nFix the spacing.\n');
  });
});
