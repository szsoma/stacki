import { describe, expect, it } from 'vitest';
import {
  ancestorChain,
  childSummaries,
  findNodeById,
  findOwningComponent,
  summarizeNode,
} from './nodeTree.js';

const TREE = [
  {
    id: 'layout',
    kind: 'component',
    name: 'MarketingLayout',
    props: {},
    children: [
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
          { id: 'p', kind: 'element', name: 'p', props: {}, children: null },
        ],
      },
    ],
  },
];

describe('findNodeById', () => {
  it('finds a nested node by id', () => {
    expect(findNodeById(TREE, 'h1')?.name).toBe('h1');
  });

  it('returns null when the id is not in the tree', () => {
    expect(findNodeById(TREE, 'missing')).toBeNull();
  });
});

describe('ancestorChain', () => {
  it('returns root through the node, inclusive', () => {
    expect(ancestorChain(TREE, 'h1').map((n) => n.id)).toEqual(['layout', 'hero', 'h1']);
  });

  it('returns just the node when it is at the root', () => {
    expect(ancestorChain(TREE, 'layout').map((n) => n.id)).toEqual(['layout']);
  });

  it('returns an empty array when the id is not found', () => {
    expect(ancestorChain(TREE, 'missing')).toEqual([]);
  });
});

describe('summarizeNode', () => {
  it('summarizes an element with its first class', () => {
    expect(summarizeNode(findNodeById(TREE, 'h1'))).toEqual({ kind: 'element', label: 'h1.hero_heading' });
  });

  it('summarizes an element with no class as the bare tag', () => {
    expect(summarizeNode(findNodeById(TREE, 'p'))).toEqual({ kind: 'element', label: 'p' });
  });

  it('summarizes a component by name', () => {
    expect(summarizeNode(findNodeById(TREE, 'hero'))).toEqual({ kind: 'component', label: 'HeroSection' });
  });

  it('summarizes and truncates a long text node', () => {
    expect(summarizeNode({ kind: 'text', value: 'Build faster' })).toEqual({ kind: 'text', label: 'Build faster' });
    expect(summarizeNode({ kind: 'text', value: 'x'.repeat(80) }).label.endsWith('…')).toBe(true);
  });

  it('summarizes an expr node', () => {
    expect(summarizeNode({ kind: 'expr', value: 'service.title' })).toEqual({ kind: 'expr', label: 'service.title' });
  });

  it('summarizes a comment node', () => {
    expect(summarizeNode({ kind: 'comment', value: ' TODO ' })).toEqual({ kind: 'comment', label: 'TODO' });
  });

  it('summarizes a map node by its loop source up to .map', () => {
    expect(summarizeNode({ kind: 'map', head: 'items.map((item) => (' })).toEqual({ kind: 'map', label: 'items.map' });
  });

  it('summarizes a raw node by its tag', () => {
    expect(summarizeNode({ kind: 'raw', name: 'style' })).toEqual({ kind: 'raw', label: '<style>' });
  });

  it('falls back to kind and name for anything else', () => {
    expect(summarizeNode({ kind: 'chunk-group', name: 'chunk' })).toEqual({ kind: 'chunk-group', label: 'chunk' });
  });

  it('handles a missing node', () => {
    expect(summarizeNode(null)).toEqual({ kind: 'unknown', label: '(missing)' });
  });
});

describe('childSummaries', () => {
  it('summarizes direct children only', () => {
    expect(childSummaries(findNodeById(TREE, 'hero'))).toEqual([
      { kind: 'element', label: 'h1.hero_heading' },
      { kind: 'element', label: 'p' },
    ]);
  });

  it('returns an empty array for a self-closing node', () => {
    expect(childSummaries(findNodeById(TREE, 'p'))).toEqual([]);
  });

  it('returns an empty array for a missing node', () => {
    expect(childSummaries(null)).toEqual([]);
  });
});

describe('findOwningComponent', () => {
  const definitions = [
    { name: 'HeroSection', path: '/project/src/components/HeroSection.astro' },
    { name: 'MarketingLayout', path: '/project/src/layouts/MarketingLayout.astro', isLayout: true },
  ];

  it('returns the nearest matching component ancestor', () => {
    const owner = findOwningComponent(TREE, 'h1', definitions);
    expect(owner.definition.name).toBe('HeroSection');
  });

  it('returns the node itself when it is a matching component', () => {
    const owner = findOwningComponent(TREE, 'hero', definitions);
    expect(owner.node.id).toBe('hero');
    expect(owner.definition.name).toBe('HeroSection');
  });

  it('falls back to an outer component when the nearer one has no matching definition', () => {
    const owner = findOwningComponent(TREE, 'h1', [definitions[1]]);
    expect(owner.definition.name).toBe('MarketingLayout');
  });

  it('returns null when no ancestor is a component', () => {
    const flatTree = [{ id: 'div', kind: 'element', name: 'div', props: {}, children: null }];
    expect(findOwningComponent(flatTree, 'div', definitions)).toBeNull();
  });

  it('returns null when no component ancestor has a matching definition', () => {
    expect(findOwningComponent(TREE, 'h1', [])).toBeNull();
  });

  it('returns null when the id is not found', () => {
    expect(findOwningComponent(TREE, 'missing', definitions)).toBeNull();
  });
});
