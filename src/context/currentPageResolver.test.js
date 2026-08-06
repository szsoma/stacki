import { describe, expect, it } from 'vitest';
import { currentPageResolver } from './currentPageResolver.js';

const NODE_TREE = [
  { id: 'layout', kind: 'component', name: 'MarketingLayout', props: {}, children: [] },
];

function baseAppState(overrides = {}) {
  return {
    pageInfo: {
      editable: true,
      route: '/services',
      path: 'src/pages/services.astro',
      layoutName: 'MarketingLayout',
      imports: [
        { name: 'Hero', path: '../components/Hero.astro' },
        { name: 'clients', path: '../data/clients.json' },
      ],
      frontmatter: 'const title = "Services";',
    },
    nodeTree: NODE_TREE,
    ...overrides,
  };
}

describe('currentPageResolver', () => {
  it('is unavailable when no editable page is open', () => {
    expect(currentPageResolver.isAvailable(baseAppState({ pageInfo: null }))).toBe(false);
    expect(currentPageResolver.isAvailable(baseAppState({ pageInfo: { editable: false } }))).toBe(false);
  });

  it('is available for an editable page', () => {
    expect(currentPageResolver.isAvailable(baseAppState())).toBe(true);
  });

  it('resolves route, source, layout, imports, CMS sources, frontmatter, and structure', async () => {
    const result = await currentPageResolver.resolve(baseAppState());
    expect(result.data).toEqual({
      route: '/services',
      path: 'src/pages/services.astro',
      layoutName: 'MarketingLayout',
      imports: [
        { name: 'Hero', path: '../components/Hero.astro' },
        { name: 'clients', path: '../data/clients.json' },
      ],
      cmsDataSources: ['../data/clients.json'],
      frontmatter: 'const title = "Services";',
      structure: [{ kind: 'component', label: 'MarketingLayout' }],
    });
  });

  it('rejects resolving a non-editable page', async () => {
    await expect(
      currentPageResolver.resolve(baseAppState({ pageInfo: { editable: false } })),
    ).rejects.toThrow('No editable page is open.');
  });

  it('renders route, layout, imports, CMS sources, frontmatter, and structure as Markdown', () => {
    const snapshot = {
      data: {
        route: '/services',
        path: 'src/pages/services.astro',
        layoutName: 'MarketingLayout',
        imports: [{ name: 'Hero', path: '../components/Hero.astro' }],
        cmsDataSources: ['../data/clients.json'],
        frontmatter: 'const title = "Services";',
        structure: [{ kind: 'component', label: 'MarketingLayout' }],
      },
    };
    const markdown = currentPageResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current page');
    expect(markdown).toContain('Route: `/services`');
    expect(markdown).toContain('Layout: MarketingLayout');
    expect(markdown).toContain('Imports: Hero');
    expect(markdown).toContain('CMS data sources: ../data/clients.json');
    expect(markdown).toContain('const title = "Services";');
    expect(markdown).toContain('- component: MarketingLayout');
  });

  it('changes stale key when the page structure changes', () => {
    const key1 = currentPageResolver.computeStaleKey(baseAppState());
    const key2 = currentPageResolver.computeStaleKey(
      baseAppState({
        nodeTree: [...NODE_TREE, { id: 'extra', kind: 'element', name: 'div', props: {}, children: null }],
      }),
    );
    expect(key1).not.toBe(key2);
  });

  it('returns null stale key when no editable page is open', () => {
    expect(currentPageResolver.computeStaleKey(baseAppState({ pageInfo: null }))).toBeNull();
  });

  it('detects staleness when a nested descendant changes without touching any top-level id', () => {
    // Mutate props deep inside a child of the top-level 'layout' node,
    // without adding/removing top-level nodes or changing any top-level
    // node's id. A stale key derived only from `topLevelIds` would miss
    // this; hashing the full top-level node content (including nested
    // children) catches it.
    const deepTree = [
      {
        id: 'layout',
        kind: 'component',
        name: 'MarketingLayout',
        props: {},
        children: [
          {
            id: 'hero',
            kind: 'component',
            name: 'Hero',
            props: {},
            children: [{ id: 'h1', kind: 'element', name: 'h1', props: { class: { type: 'string', value: 'a' } }, children: [] }],
          },
        ],
      },
    ];
    const appState = baseAppState({ nodeTree: deepTree });
    const keyBefore = currentPageResolver.computeStaleKey(appState);

    const mutatedTree = [
      {
        ...deepTree[0],
        children: [
          {
            ...deepTree[0].children[0],
            children: [
              {
                ...deepTree[0].children[0].children[0],
                props: { class: { type: 'string', value: 'b' } },
              },
            ],
          },
        ],
      },
    ];
    const keyAfter = currentPageResolver.computeStaleKey(baseAppState({ nodeTree: mutatedTree }));

    expect(keyAfter).not.toBe(keyBefore);
  });

  it('does not flicker stale immediately after resolving (same appState, same key)', async () => {
    const appState = baseAppState();
    const result = await currentPageResolver.resolve(appState);
    const staleKeyAtResolve = currentPageResolver.computeStaleKey(appState);
    expect(result.sourceRevision).toContain(staleKeyAtResolve);
    const staleKeyImmediatelyAfter = currentPageResolver.computeStaleKey(appState);
    expect(staleKeyImmediatelyAfter).toBe(staleKeyAtResolve);
  });
});
