import { describe, expect, it } from 'vitest';
import { clearIncomingReference, declaredReferenceFields, findIncomingReferences } from './cmsReferences.js';

const meta = {
  'data/posts.json': {
    author: { type: 'reference', collection: 'data/authors.json' },
    tags: { type: 'multiReference', collection: 'data/tags.json' },
    title: 'text',
  },
  'data/authors.json': {},
};

describe('declaredReferenceFields', () => {
  it('flattens every declared reference/multiReference field across collections', () => {
    expect(declaredReferenceFields(meta)).toEqual([
      {
        collectionRel: 'data/posts.json',
        path: [],
        fieldKey: 'author',
        fieldLabel: 'Author',
        type: 'reference',
        targetRel: 'data/authors.json',
      },
      {
        collectionRel: 'data/posts.json',
        path: [],
        fieldKey: 'tags',
        fieldLabel: 'Tags',
        type: 'multiReference',
        targetRel: 'data/tags.json',
      },
    ]);
  });

  it('ignores plain declared types', () => {
    expect(declaredReferenceFields({ 'data/posts.json': { title: 'text' } })).toEqual([]);
  });
});

describe('findIncomingReferences', () => {
  const files = [
    {
      rel: 'data/posts.json',
      name: 'posts.json',
      dir: 'data',
      data: [
        { _id: 'p1', title: 'First', author: 'a1', tags: ['t1', 't2'] },
        { _id: 'p2', title: 'Second', author: 'a2', tags: [] },
      ],
    },
    {
      rel: 'data/authors.json',
      name: 'authors.json',
      dir: 'data',
      data: [{ _id: 'a1', name: 'Ada' }, { _id: 'a2', name: 'Grace' }],
    },
  ];

  it('finds a single-reference field pointing at the target id', () => {
    const hits = findIncomingReferences({ files, meta, targetRel: 'data/authors.json', targetIds: ['a1'] });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      collectionRel: 'data/posts.json',
      itemIndex: 0,
      itemId: 'p1',
      itemTitle: 'First',
      fieldKey: 'author',
      type: 'reference',
      matchedIds: ['a1'],
    });
  });

  it('finds a multi-reference field containing one of the target ids', () => {
    const hits = findIncomingReferences({ files, meta, targetRel: 'data/tags.json', targetIds: ['t1'] });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ itemIndex: 0, fieldKey: 'tags', type: 'multiReference', matchedIds: ['t1'] });
  });

  it('returns nothing when no item references the target id', () => {
    expect(findIncomingReferences({ files, meta, targetRel: 'data/authors.json', targetIds: ['a9'] })).toEqual([]);
  });

  it('returns nothing for an empty target id list', () => {
    expect(findIncomingReferences({ files, meta, targetRel: 'data/authors.json', targetIds: [] })).toEqual([]);
  });
});

describe('clearIncomingReference', () => {
  it('unsets a single-reference field', () => {
    const items = [{ _id: 'p1', author: 'a1' }];
    const hit = { itemIndex: 0, steps: [], fieldKey: 'author', type: 'reference', matchedIds: ['a1'] };
    expect(clearIncomingReference(items, hit)[0].author).toBe('');
  });

  it('drops only the matched id from a multi-reference array', () => {
    const items = [{ _id: 'p1', tags: ['t1', 't2'] }];
    const hit = { itemIndex: 0, steps: [], fieldKey: 'tags', type: 'multiReference', matchedIds: ['t1'] };
    expect(clearIncomingReference(items, hit)[0].tags).toEqual(['t2']);
  });
});
