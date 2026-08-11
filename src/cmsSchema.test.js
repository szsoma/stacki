import { describe, expect, it } from 'vitest';
import { duplicateItem, ensureIds, fieldsOf, genId, titleOf } from './cmsSchema.js';

describe('genId', () => {
  it('returns a short, lowercase alphanumeric string', () => {
    const id = genId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it('is different across calls', () => {
    expect(genId()).not.toBe(genId());
  });
});

describe('ensureIds', () => {
  it('assigns a fresh _id to every plain-object item missing one', () => {
    const { items, changed } = ensureIds([{ name: 'A' }, { name: 'B' }]);
    expect(changed).toBe(true);
    expect(items[0]._id).toBeTruthy();
    expect(items[1]._id).toBeTruthy();
    expect(items[0]._id).not.toBe(items[1]._id);
  });

  it('leaves an existing _id untouched', () => {
    const { items, changed } = ensureIds([{ _id: 'keep-me', name: 'A' }]);
    expect(changed).toBe(false);
    expect(items[0]._id).toBe('keep-me');
  });

  it('reports unchanged when every item already has an id', () => {
    const { changed } = ensureIds([{ _id: 'a' }, { _id: 'b' }]);
    expect(changed).toBe(false);
  });

  it('leaves non-object items (a list of plain strings) alone', () => {
    const { items, changed } = ensureIds(['Halcyon', 'Verdant']);
    expect(changed).toBe(false);
    expect(items).toEqual(['Halcyon', 'Verdant']);
  });
});

describe('fieldsOf', () => {
  it('never lists _id as an editable field', () => {
    const fields = fieldsOf([{ _id: 'a1', name: 'Ada' }]);
    expect(fields.map((f) => f.key)).toEqual(['name']);
  });
});

describe('titleOf', () => {
  it('does not use _id as a fallback title', () => {
    const title = titleOf({ _id: 'a1b2c3d4', note: 'x' }, 0);
    expect(title).not.toBe('a1b2c3d4');
  });
});

describe('duplicateItem', () => {
  it('gives the copy a new id, distinct from the source', () => {
    const copy = duplicateItem({ _id: 'orig-id', name: 'Ada' });
    expect(copy._id).toBeTruthy();
    expect(copy._id).not.toBe('orig-id');
  });

  it('leaves items without an id as they were', () => {
    const copy = duplicateItem({ name: 'Ada' });
    expect(copy._id).toBeUndefined();
  });
});
