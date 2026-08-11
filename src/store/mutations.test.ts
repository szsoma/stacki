import { describe, expect, it } from 'vitest';
import type { PageModel } from '../types/ast';
import { removeNode, renameProp, setNodeText, setProp } from './mutations';

function model(): PageModel {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'a',
        kind: 'element',
        name: 'section',
        props: { id: { type: 'string', value: 'hero' } },
        children: [
          { id: 'b', kind: 'element', name: 'h1', props: {}, children: [] },
          { id: 'c', kind: 'text', value: 'hello' },
        ],
      },
    ],
  };
}

describe('setProp', () => {
  it('sets a prop on a nested node', () => {
    const m = setProp(model(), 'b', 'class', { type: 'string', value: 'title' });
    expect(m.nodes[0].children![0].props!.class).toEqual({ type: 'string', value: 'title' });
  });
  it('deletes the prop when the value is undefined', () => {
    const m = setProp(model(), 'a', 'id', undefined);
    expect(m.nodes[0].props!).not.toHaveProperty('id');
  });
  it('is a no-op for an unknown node', () => {
    const m = setProp(model(), 'zzz', 'id', { type: 'string', value: 'x' });
    expect(m.nodes[0].props!.id).toEqual({ type: 'string', value: 'hero' });
  });
  it('creates the props bag when a node has none', () => {
    const m = setProp(model(), 'b', 'id', { type: 'string', value: 'x' });
    expect(m.nodes[0].children![0].props!.id).toEqual({ type: 'string', value: 'x' });
  });
});

describe('renameProp', () => {
  it('preserves the value and its position', () => {
    const m = renameProp(model(), 'a', 'id', 'data-id');
    expect(Object.keys(m.nodes[0].props!)).toEqual(['data-id']);
    expect(m.nodes[0].props!['data-id']).toEqual({ type: 'string', value: 'hero' });
  });
  it('is a no-op when the new name is empty or unchanged', () => {
    expect(Object.keys(renameProp(model(), 'a', 'id', '').nodes[0].props!)).toEqual(['id']);
    expect(Object.keys(renameProp(model(), 'a', 'id', 'id').nodes[0].props!)).toEqual(['id']);
  });
});

describe('removeNode', () => {
  it('removes a child and leaves its siblings', () => {
    const m = removeNode(model(), 'b');
    expect(m.nodes[0].children!.map((n) => n.id)).toEqual(['c']);
  });
  it('is a no-op for an unknown id', () => {
    expect(removeNode(model(), 'zzz').nodes[0].children).toHaveLength(2);
  });
});

describe('setNodeText', () => {
  it('replaces a text node value', () => {
    const m = setNodeText(model(), 'c', 'goodbye');
    expect((m.nodes[0].children![1] as { value: string }).value).toBe('goodbye');
  });
});
