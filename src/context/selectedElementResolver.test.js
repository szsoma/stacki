import { describe, expect, it, vi } from 'vitest';
import { selectedElementResolver } from './selectedElementResolver.js';

const TREE = [
  {
    id: 'hero',
    kind: 'component',
    name: 'HeroSection',
    props: {},
    children: [
      {
        id: 'h1',
        kind: 'element',
        name: 'h1',
        props: { class: { type: 'string', value: 'hero_heading' } },
        children: [{ id: 'txt', kind: 'text', value: 'Build faster', children: null }],
      },
    ],
  },
];

const DEFINITIONS = [{ name: 'HeroSection', path: '/projects/site/src/components/HeroSection.astro' }];

function baseAppState(overrides = {}) {
  return {
    selectedNode: TREE[0].children[0],
    nodeTree: TREE,
    componentDefinitions: DEFINITIONS,
    projectPath: '/projects/site',
    loopContext: { ancestorHeads: [] },
    serializeNode: vi.fn(async () => '<h1 class="hero_heading">Build faster</h1>\n'),
    ...overrides,
  };
}

describe('selectedElementResolver', () => {
  it('is unavailable when nothing is selected', () => {
    expect(selectedElementResolver.isAvailable(baseAppState({ selectedNode: null }))).toBe(false);
  });

  it('is available when a node is selected', () => {
    expect(selectedElementResolver.isAvailable(baseAppState())).toBe(true);
  });

  it('resolves ancestors, children, owner component, loop context, and serialized markup', async () => {
    const appState = baseAppState();
    const result = await selectedElementResolver.resolve(appState);
    expect(appState.serializeNode).toHaveBeenCalledWith(TREE[0].children[0]);
    expect(result.data).toEqual({
      id: 'h1',
      kind: 'element',
      tag: 'h1',
      props: { class: { type: 'string', value: 'hero_heading' } },
      ancestors: [{ kind: 'component', label: 'HeroSection' }],
      children: [{ kind: 'text', label: 'Build faster' }],
      ownerComponent: { name: 'HeroSection', path: 'src/components/HeroSection.astro' },
      loopVariables: [],
      markup: '<h1 class="hero_heading">Build faster</h1>\n',
    });
    expect(result.estimatedCharacters).toBeGreaterThan(0);
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('includes loop context from the app state', async () => {
    const appState = baseAppState({ loopContext: { ancestorHeads: ['items.map((item) => ('] } });
    const result = await selectedElementResolver.resolve(appState);
    expect(result.data.loopVariables).toEqual(['items.map((item) => (']);
  });

  it('rejects resolving with nothing selected', async () => {
    await expect(selectedElementResolver.resolve(baseAppState({ selectedNode: null }))).rejects.toThrow(
      'No element is selected.',
    );
  });

  it('resolves ownerComponent as null when no owning component is found', async () => {
    const NO_OWNER_TREE = [{ id: 'p1', kind: 'element', name: 'p', props: {}, children: [] }];
    const appState = baseAppState({ nodeTree: NO_OWNER_TREE, selectedNode: NO_OWNER_TREE[0] });
    const result = await selectedElementResolver.resolve(appState);
    expect(result.data.ownerComponent).toBeNull();
  });

  it('uses the active component as owner for a component-local node tree', async () => {
    const paragraph = {
      id: 'section-copy',
      kind: 'element',
      name: 'p',
      props: {},
      children: [{ id: 'section-copy-text', kind: 'text', value: 'Component copy' }],
    };
    const localTree = [{
      id: 'section-root',
      kind: 'element',
      name: 'section',
      props: {},
      children: [paragraph],
    }];
    const appState = baseAppState({
      selectedNode: paragraph,
      nodeTree: localTree,
      currentComponent: { name: 'Section', path: '/projects/site/src/components/Section.astro' },
      serializeNode: vi.fn(async () => '<p>Component copy</p>'),
    });

    const result = await selectedElementResolver.resolve(appState);
    const markdown = selectedElementResolver.renderMarkdown({ data: result.data });

    expect(result.data.ownerComponent).toEqual({
      name: 'Section',
      path: 'src/components/Section.astro',
    });
    expect(markdown).toContain('Owner component: Section (`src/components/Section.astro`)');
  });

  it('renders tag, ancestors, owner, props, children, and markup as Markdown', () => {
    const snapshot = {
      data: {
        id: 'h1',
        kind: 'element',
        tag: 'h1',
        props: { class: { type: 'string', value: 'hero_heading' } },
        ancestors: [{ kind: 'component', label: 'HeroSection' }],
        children: [{ kind: 'text', label: 'Build faster' }],
        ownerComponent: { name: 'HeroSection', path: 'src/components/HeroSection.astro' },
        loopVariables: [],
        markup: '<h1 class="hero_heading">Build faster</h1>',
      },
    };
    const markdown = selectedElementResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Selected element');
    expect(markdown).toContain('Element: `h1` (element)');
    expect(markdown).toContain('Ancestor path: HeroSection');
    expect(markdown).toContain('Owner component: HeroSection (`src/components/HeroSection.astro`)');
    expect(markdown).toContain('Children: Build faster');
    expect(markdown).toContain('```astro');
    expect(markdown).toContain('<h1 class="hero_heading">Build faster</h1>');
  });

  it('produces a different stale key when the selected node changes', () => {
    const key1 = selectedElementResolver.computeStaleKey(baseAppState());
    const key2 = selectedElementResolver.computeStaleKey(
      baseAppState({ selectedNode: { ...TREE[0].children[0], props: {} } }),
    );
    expect(key1).not.toBe(key2);
  });

  it('returns null stale key when nothing is selected', () => {
    expect(selectedElementResolver.computeStaleKey(baseAppState({ selectedNode: null }))).toBeNull();
  });

  it('detects staleness when a descendant deep inside the selected subtree changes', async () => {
    // Select the whole 'hero' component (not the leaf h1) so the mutation
    // below lands two levels down ('hero' -> 'h1' -> 'txt'), leaving
    // 'hero's own shallow fields (name/props/child count) untouched — only
    // a full-subtree hash catches this kind of edit.
    const heroAppState = baseAppState({ selectedNode: TREE[0] });
    await selectedElementResolver.resolve(heroAppState);
    const keyAtResolve = selectedElementResolver.computeStaleKey(heroAppState);

    const mutatedHero = {
      ...TREE[0],
      children: [
        {
          ...TREE[0].children[0],
          children: [{ ...TREE[0].children[0].children[0], value: 'Ship faster' }],
        },
      ],
    };
    const keyAfterEdit = selectedElementResolver.computeStaleKey(
      baseAppState({ selectedNode: mutatedHero }),
    );

    expect(keyAfterEdit).not.toBe(keyAtResolve);
  });

  it('produces a different stale key when an ancestor is renamed', () => {
    const key1 = selectedElementResolver.computeStaleKey(baseAppState());
    const renamedTree = [{ ...TREE[0], name: 'HeroSectionRenamed' }];
    const key2 = selectedElementResolver.computeStaleKey(baseAppState({ nodeTree: renamedTree }));
    expect(key1).not.toBe(key2);
  });

  it('produces a different stale key when an ancestor element-node has its class changed', () => {
    // summarizeNode() folds an element's first CSS class into its label
    // (e.g. `div.hero_heading` vs `div.hero_heading_renamed`), and
    // resolve() renders ancestors via summarizeNode() into `data.ancestors`
    // — so the stale key must react the same way, or the displayed
    // ancestor path can drift from the key that's supposed to guard it.
    const classedTree = [
      {
        id: 'wrap',
        kind: 'element',
        name: 'div',
        props: { class: { type: 'string', value: 'hero_heading' } },
        children: [TREE[0].children[0]],
      },
    ];
    const key1 = selectedElementResolver.computeStaleKey(baseAppState({ nodeTree: classedTree }));
    const renamedClassTree = [
      {
        ...classedTree[0],
        props: { class: { type: 'string', value: 'hero_heading_renamed' } },
      },
    ];
    const key2 = selectedElementResolver.computeStaleKey(baseAppState({ nodeTree: renamedClassTree }));
    expect(key1).not.toBe(key2);
  });

  it('produces a different stale key when the owner component moves', () => {
    const key1 = selectedElementResolver.computeStaleKey(baseAppState());
    const movedDefinitions = [
      { name: 'HeroSection', path: '/projects/site/src/components/moved/HeroSection.astro' },
    ];
    const key2 = selectedElementResolver.computeStaleKey(
      baseAppState({ componentDefinitions: movedDefinitions }),
    );
    expect(key1).not.toBe(key2);
  });

  it('produces a different stale key when loop context changes', () => {
    const key1 = selectedElementResolver.computeStaleKey(baseAppState());
    const key2 = selectedElementResolver.computeStaleKey(
      baseAppState({ loopContext: { ancestorHeads: ['items.map((item) => ('] } }),
    );
    expect(key1).not.toBe(key2);
  });

  it('does not flicker stale immediately after resolving (same appState, same key)', async () => {
    const appState = baseAppState();
    await selectedElementResolver.resolve(appState);
    const staleKeyAtResolve = selectedElementResolver.computeStaleKey(appState);
    const staleKeyImmediatelyAfter = selectedElementResolver.computeStaleKey(appState);
    expect(staleKeyImmediatelyAfter).toBe(staleKeyAtResolve);
  });
});
