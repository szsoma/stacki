import { describe, expect, it } from 'vitest';
import { toPreviewScope } from './previewScope';

describe('toPreviewScope', () => {
  it('returns a project-relative scope for macOS paths', () => {
    expect(toPreviewScope('/work/site/src/components/Hero.astro', '/work/site')).toBe(
      'src/components/Hero.astro'
    );
  });

  it('normalizes Windows separators', () => {
    expect(toPreviewScope('C:\\work\\site\\src\\pages\\index.astro', 'C:\\work\\site\\')).toBe(
      'src/pages/index.astro'
    );
  });

  it('rejects sibling paths that merely share the project-root prefix', () => {
    expect(toPreviewScope('/work/site-old/src/pages/index.astro', '/work/site')).toBeNull();
  });

  it('returns null when either path is missing', () => {
    expect(toPreviewScope(null, '/work/site')).toBeNull();
    expect(toPreviewScope('/work/site/src/pages/index.astro', null)).toBeNull();
  });

  it('compares Windows drive paths case-insensitively while preserving relative casing', () => {
    expect(toPreviewScope('C:\\Work\\SITE\\src\\Components\\Hero.astro', 'c:\\work\\site')).toBe(
      'src/Components/Hero.astro'
    );
  });

  it('resolves dot segments within the project root', () => {
    expect(toPreviewScope('/work/site/src/pages/../components/Hero.astro', '/work/site/.')).toBe(
      'src/components/Hero.astro'
    );
  });

  it('rejects lexical escapes outside the project root', () => {
    expect(toPreviewScope('/work/site/src/../../outside.astro', '/work/site')).toBeNull();
  });

  it('collapses repeated separators', () => {
    expect(toPreviewScope('/work//site///src/components/Hero.astro', '/work/site/')).toBe(
      'src/components/Hero.astro'
    );
  });

  it('returns null when the file path equals the project root', () => {
    expect(toPreviewScope('/work/site/', '/work/site')).toBeNull();
  });
});
