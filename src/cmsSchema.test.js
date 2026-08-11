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

import { addressesAt, setAtAddress } from './cmsSchema.js';

describe('addressesAt', () => {
  it('addresses top-level items directly when path is empty', () => {
    const items = [{ name: 'A' }, { name: 'B' }];
    expect(addressesAt(items, [])).toEqual([
      { itemIndex: 0, steps: [], obj: items[0] },
      { itemIndex: 1, steps: [], obj: items[1] },
    ]);
  });

  it('addresses a nested group at a one-level path', () => {
    const items = [{ team: { lead: 'Ada' } }];
    expect(addressesAt(items, ['team'])).toEqual([
      { itemIndex: 0, steps: ['team'], obj: { lead: 'Ada' } },
    ]);
  });

  it('addresses every entry of a nested repeater, with its array index', () => {
    const items = [{ team: [{ lead: 'Ada' }, { lead: 'Grace' }] }];
    expect(addressesAt(items, ['team'])).toEqual([
      { itemIndex: 0, steps: ['team', 0], obj: { lead: 'Ada' } },
      { itemIndex: 0, steps: ['team', 1], obj: { lead: 'Grace' } },
    ]);
  });

  it('skips items where the path does not resolve to an object', () => {
    const items = [{ team: 'not an object' }, { team: { lead: 'Ada' } }];
    expect(addressesAt(items, ['team'])).toEqual([
      { itemIndex: 1, steps: ['team'], obj: { lead: 'Ada' } },
    ]);
  });
});

describe('setAtAddress', () => {
  it('sets a key on the top-level item', () => {
    const items = [{ name: 'A' }, { name: 'B' }];
    const next = setAtAddress(items, 0, [], 'name', 'Ada');
    expect(next[0]).toEqual({ name: 'Ada' });
    expect(next[1]).toBe(items[1]);
  });

  it('sets a key inside a nested group without disturbing siblings', () => {
    const items = [{ team: { lead: 'Ada', size: 3 } }];
    const next = setAtAddress(items, 0, ['team'], 'lead', 'Grace');
    expect(next[0].team).toEqual({ lead: 'Grace', size: 3 });
  });

  it('sets a key on one entry of a repeater without touching the others', () => {
    const items = [{ team: [{ lead: 'Ada' }, { lead: 'Grace' }] }];
    const next = setAtAddress(items, 0, ['team', 0], 'lead', 'Margaret');
    expect(next[0].team).toEqual([{ lead: 'Margaret' }, { lead: 'Grace' }]);
    expect(next[0].team[1]).toBe(items[0].team[1]);
  });

  it('leaves every other item in the collection untouched', () => {
    const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const next = setAtAddress(items, 1, [], 'name', 'BB');
    expect(next[0]).toBe(items[0]);
    expect(next[2]).toBe(items[2]);
  });
});
