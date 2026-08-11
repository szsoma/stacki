import { describe, expect, it } from 'vitest';
import type { PageModel } from '../types/ast';
import {
  ancestorChain,
  findNodeById,
  findParentList,
  findParentNode,
  isDescendantOf,
  nodeAtPath,
  pathOfNode,
} from './nodes';

function model(): PageModel {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'layout',
        kind: 'component',
        name: 'BaseLayout',
        props: {},
        children: [
          {
            id: 'a',
            kind: 'element',
            name: 'section',
            props: {},
            children: [
              { id: 'b', kind: 'element', name: 'h1', props: {}, children: [] },
              { id: 'c', kind: 'text', value: 'hello' },
            ],
          },
        ],
      },
    ],
  };
}

describe('findNodeById', () => {
  it('finds a nested node', () => {
    expect(findNodeById(model().nodes, 'b')?.kind).toBe('element');
  });
  it('returns null for an unknown id', () => {
    expect(findNodeById(model().nodes, 'nope')).toBeNull();
  });
  it('handles self-closing nodes whose children are null', () => {
    const nodes = [
      { id: 'img', kind: 'element' as const, name: 'img', props: {}, children: null },
    ];
    expect(findNodeById(nodes, 'img')?.id).toBe('img');
    expect(findNodeById(nodes, 'x')).toBeNull();
  });
});

describe('findParentList', () => {
  it('returns the owning array and index', () => {
    const m = model();
    const found = findParentList(m, 'c');
    expect(found?.index).toBe(1);
    expect(found?.list).toHaveLength(2);
  });
  it('returns the top-level list for a root node', () => {
    const m = model();
    expect(findParentList(m, 'layout')?.index).toBe(0);
  });
});

describe('pathOfNode / nodeAtPath', () => {
  it('round-trips a nested node', () => {
    const m = model();
    const path = pathOfNode(m.nodes, 'b');
    expect(path).toEqual([0, 0, 0]);
    expect(nodeAtPath(m.nodes, path!)?.id).toBe('b');
  });
  it('returns null for a path that runs off the tree', () => {
    expect(nodeAtPath(model().nodes, [0, 9])).toBeNull();
  });
});

describe('ancestorChain', () => {
  it('lists root-to-node inclusive', () => {
    expect(ancestorChain(model().nodes, 'b')?.map((n) => n.id)).toEqual([
      'layout',
      'a',
      'b',
    ]);
  });
});

describe('isDescendantOf', () => {
  it('is true for a nested id and false for a sibling', () => {
    const root = model().nodes[0];
    expect(isDescendantOf(root, 'b')).toBe(true);
    expect(isDescendantOf(root, 'zzz')).toBe(false);
  });
});

describe('findParentNode', () => {
  it('returns the immediate parent', () => {
    expect(findParentNode(model().nodes, 'b')?.id).toBe('a');
  });
  it('returns null for a top-level node', () => {
    expect(findParentNode(model().nodes, 'layout')).toBeNull();
  });
});
