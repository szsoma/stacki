import { describe, expect, it } from 'vitest';
import type { PageModel } from '../types/ast';
import { chooseImportPath, collectUsedNames, pruneImports } from './imports';

function model(overrides: Partial<PageModel> = {}): PageModel {
  return {
    imports: [
      { name: 'BaseLayout', path: '../layouts/BaseLayout.astro' },
      { name: 'Card', path: '../components/Card.astro' },
    ],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'layout',
        kind: 'component',
        name: 'BaseLayout',
        props: {},
        children: [],
      },
    ],
    ...overrides,
  };
}

describe('collectUsedNames', () => {
  it('collects component names in use', () => {
    expect([...collectUsedNames(model())]).toContain('BaseLayout');
  });
  it('does not collect an import that is never placed', () => {
    expect([...collectUsedNames(model())]).not.toContain('Card');
  });
});

describe('pruneImports', () => {
  it('drops imports no node references', () => {
    const pruned = pruneImports(model());
    expect(pruned.imports.map((i) => i.name)).toEqual(['BaseLayout']);
  });
  it('keeps every import when all are used', () => {
    const m = model();
    m.nodes[0].children = [
      { id: 'c1', kind: 'component', name: 'Card', props: {}, children: [] },
    ] as any;
    expect(pruneImports(m).imports).toHaveLength(2);
  });
});

describe('chooseImportPath', () => {
  it('matches the style the page already uses', () => {
    const relativeStyle = model();
    expect(
      chooseImportPath(relativeStyle, {
        relative: '../components/New.astro',
        srcRelative: '@/components/New.astro',
      })
    ).toBe('../components/New.astro');
  });
});
