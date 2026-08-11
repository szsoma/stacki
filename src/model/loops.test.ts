import { describe, expect, it } from 'vitest';
import type { AstroNode } from '../types/ast';
import { loopVarsAt, parseLoopHead, splitMapHead } from './loops';

describe('splitMapHead', () => {
  it('parses a head with item and index', () => {
    const r = splitMapHead('items.map((item, i) => (');
    expect(r).toEqual({ data: 'items', item: 'item', index: 'i' });
  });
  it('parses a head with item only', () => {
    const r = splitMapHead('items.map((item) => (');
    expect(r).toEqual({ data: 'items', item: 'item', index: '' });
  });
  it('returns null for a non-map head', () => {
    expect(splitMapHead('not a map')).toBeNull();
  });
});

describe('parseLoopHead', () => {
  it('parses a map expression', () => {
    const r = parseLoopHead('posts.map((post, idx) => (');
    expect(r?.item).toBe('post');
    expect(r?.index).toBe('idx');
    expect(r?.data).toBe('posts');
  });
  it('returns null for invalid input', () => {
    expect(parseLoopHead('')).toBeNull();
  });
});

describe('loopVarsAt', () => {
  it('returns variables from ancestor loops', () => {
    const nodes: AstroNode[] = [
      {
        id: 'a',
        kind: 'map',
        head: 'items.map((item, i) => (',
        children: [
          {
            id: 'b',
            kind: 'map',
            head: 'item.variants.map((variant) => (',
            children: [{ id: 'target', kind: 'text', value: 'hi' }],
          },
        ],
      },
    ];
    expect(loopVarsAt(nodes, 'target')).toEqual(['item', 'i', 'variant']);
  });
  it('returns empty array for a top-level node', () => {
    const nodes: AstroNode[] = [
      { id: 'root', kind: 'element', name: 'div', props: {}, children: [] },
    ];
    expect(loopVarsAt(nodes, 'root')).toEqual([]);
  });
});
