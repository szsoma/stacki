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
});
