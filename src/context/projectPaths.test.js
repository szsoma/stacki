import { describe, expect, it } from 'vitest';
import { toProjectRelativePath } from './projectPaths.js';

describe('toProjectRelativePath', () => {
  it('strips the project root and any leading slash', () => {
    expect(
      toProjectRelativePath('/projects/site', '/projects/site/src/components/Hero.astro'),
    ).toBe('src/components/Hero.astro');
  });

  it('returns the input unchanged when there is no root', () => {
    expect(toProjectRelativePath(null, '/projects/site/x.astro')).toBe('/projects/site/x.astro');
  });

  it('returns null for a missing path', () => {
    expect(toProjectRelativePath('/projects/site', null)).toBeNull();
  });

  it('leaves an already-relative path unchanged', () => {
    expect(toProjectRelativePath('/projects/site', 'src/x.astro')).toBe('src/x.astro');
  });
});
