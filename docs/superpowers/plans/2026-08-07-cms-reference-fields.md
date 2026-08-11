# CMS Reference & Multi-reference Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Webflow-style Reference and Multi-reference field types to Stacki's JSON-collection CMS, so one collection's items can link to items in another (or the same) collection.

**Architecture:** Every collection item gets a lazily-assigned hidden `_id`. A reference/multi-reference field stores that id (or an array of them) on the item, with its target collection recorded in the existing `.stacki/cms.json` declared-schema file. A new pure module (`cmsReferences.js`) finds every item across the project that points at a given id, which powers a blocking delete-guard dialog reused for both single-item and whole-collection deletes.

**Tech Stack:** React 18, Vitest + @testing-library/react + jsdom (existing project setup, no new dependencies).

## Global Constraints

- No Electron/IPC changes — every task builds on the `cms:list`, `cms:read`, `cms:write`, `cms:meta`, `cms:setMeta`, `cms:usage`, `cms:delete` handlers that already exist in `electron/main.js` and are already exposed on `window.avb` via `electron/preload.js`.
- `_id` is never shown as an editable field, never used as an item's displayed title, and is regenerated (not copied) when an item is duplicated.
- A field's type is fixed once created — this already holds for every existing type and continues to hold for Reference/Multi-reference.
- No generated helper code for resolving references inside `.astro` pages — resolution only happens inside the CMS editor itself, per the approved design spec (`docs/superpowers/specs/2026-08-07-cms-reference-fields-design.md`).
- Follow existing test conventions: mock `window.avb` with `vi.fn()` in `beforeEach`, use `@testing-library/react`'s `render`/`fireEvent`/`screen`/`waitFor`/`within`.

---

## Task 1: Item identity in `cmsSchema.js`

**Files:**
- Modify: `src/cmsSchema.js`
- Test: `src/cmsSchema.test.js` (new file)

**Interfaces:**
- Produces: `genId(): string`, `ensureIds(items: any[]): { items: any[], changed: boolean }` — both exported from `src/cmsSchema.js`. Later tasks (5, 6) call `ensureIds` to lazily assign ids to a target collection before it can be picked from.
- Modifies existing behavior: `fieldsOf`, `titleOf`, and `duplicateItem` all now treat `_id` as invisible/internal.

- [ ] **Step 1: Write the failing tests**

Create `src/cmsSchema.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cmsSchema.test.js`
Expected: FAIL — `genId`/`ensureIds` are not exported yet, and the `_id`/duplicate assertions fail against current behavior.

- [ ] **Step 3: Implement `genId` and `ensureIds`**

In `src/cmsSchema.js`, add near the top (after the existing regex constants, before `isPlainObject`... actually anywhere above their first use is fine — add directly after the `isPlainObject` definition):

```js
// A short id stable enough to link items across collections. Not
// cryptographically unique — collision odds within one project's item count
// are negligible, and it's never shown to the user.
export function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// Gives every plain-object item a permanent `_id` if it doesn't have one yet.
// Reference fields link to this rather than to an item's position, which
// changes as items are reordered, added, or removed.
export function ensureIds(items) {
  let changed = false;
  const next = items.map((item) => {
    if (!isPlainObject(item) || item._id) return item;
    changed = true;
    return { ...item, _id: genId() };
  });
  return { items: next, changed };
}
```

- [ ] **Step 4: Exclude `_id` from `fieldsOf`**

In `fieldsOf`, find:

```js
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (!types.has(key)) {
```

Change to:

```js
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (key === '_id') continue;
      if (!types.has(key)) {
```

- [ ] **Step 5: Exclude `_id` from `titleOf`'s fallback**

Find:

```js
  for (const v of Object.values(item)) {
    if (typeof v === 'string' && v.trim() && v.length <= 60) return v.trim();
  }
```

Change to:

```js
  for (const [key, v] of Object.entries(item)) {
    if (key === '_id') continue;
    if (typeof v === 'string' && v.trim() && v.length <= 60) return v.trim();
  }
```

- [ ] **Step 6: Regenerate `_id` in `duplicateItem`**

Find:

```js
export function duplicateItem(item) {
  const copy = JSON.parse(JSON.stringify(item));
  if (isPlainObject(copy)) {
    for (const key of ['slug', 'id']) {
```

Change to:

```js
export function duplicateItem(item) {
  const copy = JSON.parse(JSON.stringify(item));
  if (isPlainObject(copy)) {
    if (copy._id) copy._id = genId();
    for (const key of ['slug', 'id']) {
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/cmsSchema.test.js`
Expected: PASS (all `genId`/`ensureIds`/`fieldsOf`/`titleOf`/`duplicateItem` tests green).

- [ ] **Step 8: Commit**

```bash
git add src/cmsSchema.js src/cmsSchema.test.js
git commit -m "feat: give CMS items a lazy hidden id for reference fields to link to"
```

---

## Task 2: Addressed traversal in `cmsSchema.js`

Reference fields can live nested inside a Group or Repeater. Clearing one dangling reference (Task 6/7's "Remove anyway") must touch exactly one occurrence — not every item that happens to share the same field path. This task adds a position-aware variant of the existing `objectsAt`.

**Files:**
- Modify: `src/cmsSchema.js`
- Test: `src/cmsSchema.test.js`

**Interfaces:**
- Consumes: `isPlainObject` (already in this file).
- Produces: `addressesAt(items, path): { itemIndex: number, steps: (string|number)[], obj: object }[]` and `setAtAddress(items, itemIndex, steps, key, value): any[]` — both exported from `src/cmsSchema.js`. Task 3's `cmsReferences.js` calls both.

- [ ] **Step 1: Write the failing tests**

Append to `src/cmsSchema.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cmsSchema.test.js`
Expected: FAIL — `addressesAt`/`setAtAddress` are not exported yet.

- [ ] **Step 3: Implement `addressesAt` and `setAtAddress`**

Add to `src/cmsSchema.js`, right after the existing `objectsAt` function:

```js
// Like objectsAt, but remembers how to get back to each object: which
// top-level item it came from, and the chain of object keys / array indices
// beneath it. Used to edit or clear a single nested occurrence of a field
// without touching every other item that happens to share the same path.
export function addressesAt(items, path) {
  let current = items
    .map((item, itemIndex) => (isPlainObject(item) ? { itemIndex, steps: [], obj: item } : null))
    .filter(Boolean);
  for (const key of path) {
    const next = [];
    for (const { itemIndex, steps, obj } of current) {
      const value = obj[key];
      if (Array.isArray(value)) {
        value.forEach((entry, i) => {
          if (isPlainObject(entry)) next.push({ itemIndex, steps: [...steps, key, i], obj: entry });
        });
      } else if (isPlainObject(value)) {
        next.push({ itemIndex, steps: [...steps, key], obj: value });
      }
    }
    current = next;
  }
  return current;
}

// Rebuilds one item so the object living at `steps` gets `[key]: value`,
// copying only the objects/arrays along the way — every other item, and
// everything else in this item, keeps its original reference.
export function setAtAddress(items, itemIndex, steps, key, value) {
  const setIn = (node, rest) => {
    if (!rest.length) return { ...node, [key]: value };
    const [head, ...tail] = rest;
    if (typeof head === 'number') {
      const arr = [...node];
      arr[head] = setIn(arr[head], tail);
      return arr;
    }
    return { ...node, [head]: setIn(node[head], tail) };
  };
  return items.map((item, i) => (i === itemIndex ? setIn(item, steps) : item));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/cmsSchema.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cmsSchema.js src/cmsSchema.test.js
git commit -m "feat: add addressed traversal for editing one nested occurrence of a field"
```

---

## Task 3: Cross-collection reference index (`cmsReferences.js`)

**Files:**
- Create: `src/cmsReferences.js`
- Test: `src/cmsReferences.test.js` (new file)

**Interfaces:**
- Consumes: `addressesAt`, `setAtAddress`, `collectionOf`, `labelize`, `titleOf` from `src/cmsSchema.js` (Tasks 1–2 and pre-existing).
- Produces:
  - `declaredReferenceFields(meta): { collectionRel, path, fieldKey, fieldLabel, type, targetRel }[]`
  - `findIncomingReferences({ files, meta, targetRel, targetIds }): Hit[]` where `Hit = { collectionRel, collectionLabel, itemIndex, itemId, itemTitle, fieldKey, fieldLabel, type, steps, matchedIds }`
  - `clearIncomingReference(items, hit): any[]`

  Task 6 and 7 call `findIncomingReferences` (wrapped in a `loadDeleteGuard` helper that also assigns missing `itemId`s) and `clearIncomingReference`.

- [ ] **Step 1: Write the failing tests**

Create `src/cmsReferences.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/cmsReferences.test.js`
Expected: FAIL — `src/cmsReferences.js` doesn't exist yet.

- [ ] **Step 3: Implement `src/cmsReferences.js`**

```js
import { addressesAt, collectionOf, labelize, setAtAddress, titleOf } from './cmsSchema.js';

// Every reference/multi-reference field declared anywhere in the project,
// flattened with enough to find and clear one: which collection it lives in,
// the nesting path to the objects that carry it, the field's own key, and
// which collection it points at.
export function declaredReferenceFields(meta) {
  const fields = [];
  for (const [collectionRel, declared] of Object.entries(meta || {})) {
    for (const [dottedPath, config] of Object.entries(declared || {})) {
      if (!config || typeof config !== 'object') continue;
      if (config.type !== 'reference' && config.type !== 'multiReference') continue;
      const segments = dottedPath.split('.');
      const fieldKey = segments[segments.length - 1];
      fields.push({
        collectionRel,
        path: segments.slice(0, -1),
        fieldKey,
        fieldLabel: labelize(fieldKey),
        type: config.type,
        targetRel: config.collection,
      });
    }
  }
  return fields;
}

// Every item, anywhere in the project, whose reference/multi-reference field
// currently points at one of `targetIds` inside `targetRel`. Used to block a
// delete until every one of these is resolved.
export function findIncomingReferences({ files, meta, targetRel, targetIds }) {
  const ids = new Set(targetIds);
  if (!ids.size) return [];
  const byRel = new Map(files.map((f) => [f.rel, f]));
  const hits = [];
  for (const field of declaredReferenceFields(meta)) {
    if (field.targetRel !== targetRel) continue;
    const file = byRel.get(field.collectionRel);
    if (!file || file.error || file.data === undefined) continue;
    const collection = collectionOf(file);
    for (const address of addressesAt(collection.items, field.path)) {
      const value = address.obj[field.fieldKey];
      const matched =
        field.type === 'multiReference'
          ? Array.isArray(value)
            ? value.filter((v) => ids.has(v))
            : []
          : ids.has(value)
            ? [value]
            : [];
      if (!matched.length) continue;
      hits.push({
        collectionRel: field.collectionRel,
        collectionLabel: collection.label,
        itemIndex: address.itemIndex,
        itemId: collection.items[address.itemIndex]?._id ?? null,
        itemTitle: titleOf(collection.items[address.itemIndex], address.itemIndex),
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        type: field.type,
        steps: address.steps,
        matchedIds: matched,
      });
    }
  }
  return hits;
}

// Clears one hit's reference — the whole value for a Reference field, or just
// the matched id(s) out of the array for a Multi-reference field.
export function clearIncomingReference(items, hit) {
  let node = items[hit.itemIndex];
  for (const step of hit.steps) node = node[step];
  const current = node[hit.fieldKey];
  const value =
    hit.type === 'multiReference'
      ? Array.isArray(current)
        ? current.filter((v) => !hit.matchedIds.includes(v))
        : []
      : '';
  return setAtAddress(items, hit.itemIndex, hit.steps, hit.fieldKey, value);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/cmsReferences.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cmsReferences.js src/cmsReferences.test.js
git commit -m "feat: find and clear cross-collection CMS references"
```

---

## Task 4: Reference field types, declared config, and the field-creation UI

Registers Reference/Multi-reference as real field types: two new tiles in the type picker, a "pick a target collection" step in between choosing the type and naming it, and declared-schema storage that records which collection a reference field targets.

**Files:**
- Modify: `src/ui/Icons.jsx`
- Modify: `src/panels/CmsView.jsx`
- Modify: `src/cmsSchema.js`
- Test: `src/panels/CmsView.test.jsx` (new file)

**Interfaces:**
- Produces (in `CmsView.jsx`): `withDeclaredTypes(fields, declared, path)` now returns fields with `.refCollection` set for reference/multi-reference fields, and always lets a declared `reference`/`multiReference` win over inferred structure. `addFieldAt(path, key, type, targetCollectionRel)` — 4th parameter added. `CmsSettings` now fetches and owns a `collections` list, threaded to `FieldSchema` → `AddFieldRow` → `NewFieldDialog`.
- Consumes (Task 5 depends on this): `field.refCollection` on the objects `withDeclaredTypes` returns.

- [ ] **Step 1: Write the failing test**

Create `src/panels/CmsView.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CmsView from './CmsView.jsx';

const project = { path: '/projects/site' };

// files: { [rel]: data }. meta: { [rel]: declared }. Both are mutated in
// place by the mocked write handlers, the same way the real files on disk
// would be, so a test can make one call and then assert on the shared state.
function mockAvb({ files = {}, meta = {} } = {}) {
  window.avb = {
    readCms: vi.fn(async ({ rel }) => ({ data: files[rel] })),
    writeCms: vi.fn(async ({ rel, data }) => {
      files[rel] = data;
      return { ok: true };
    }),
    cmsMeta: vi.fn(async () => ({ meta })),
    setCmsMeta: vi.fn(async ({ rel, fields }) => {
      if (fields && Object.keys(fields).length) meta[rel] = fields;
      else delete meta[rel];
      return { ok: true };
    }),
    onCmsChanged: vi.fn(() => () => {}),
    listCms: vi.fn(async () => ({
      files: Object.entries(files).map(([rel, data]) => ({
        rel,
        name: rel.split('/').pop(),
        dir: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '',
        data,
      })),
    })),
    cmsUsage: vi.fn(async () => ({ files: [] })),
    deleteCms: vi.fn(async () => ({ ok: true })),
  };
  return { files, meta };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('creating a reference field', () => {
  it('lets you pick a target collection and stores it in the declared config', async () => {
    mockAvb({
      files: { 'data/posts.json': [{ title: 'Hello' }], 'data/authors.json': [{ name: 'Ada' }] },
    });
    render(<CmsView project={project} rel="data/posts.json" settings showToast={vi.fn()} />);

    fireEvent.click(await screen.findByText('Add field'));
    fireEvent.click(await screen.findByText('Reference'));
    fireEvent.click(await screen.findByText('Authors'));

    const dialog = (await screen.findByText('New Reference field')).closest('.modal');
    fireEvent.change(within(dialog).getByPlaceholderText('e.g. Reference'), { target: { value: 'Author' } });
    fireEvent.click(within(dialog).getByText('Add field'));

    await waitFor(() =>
      expect(window.avb.setCmsMeta).toHaveBeenCalledWith({
        projectPath: project.path,
        rel: 'data/posts.json',
        fields: { author: { type: 'reference', collection: 'data/authors.json' } },
      })
    );
    expect(await screen.findByText('Reference → Authors')).toBeInTheDocument();
  });

  it('lets you pick a target collection for a multi-reference field', async () => {
    mockAvb({
      files: { 'data/posts.json': [{ title: 'Hello' }], 'data/tags.json': [{ name: 'News' }] },
    });
    render(<CmsView project={project} rel="data/posts.json" settings showToast={vi.fn()} />);

    fireEvent.click(await screen.findByText('Add field'));
    fireEvent.click(await screen.findByText('Multi-reference'));
    fireEvent.click(await screen.findByText('Tags'));

    const dialog = (await screen.findByText('New Multi-reference field')).closest('.modal');
    fireEvent.change(within(dialog).getByPlaceholderText('e.g. Multi-reference'), { target: { value: 'Tags' } });
    fireEvent.click(within(dialog).getByText('Add field'));

    await waitFor(() =>
      expect(window.avb.setCmsMeta).toHaveBeenCalledWith({
        projectPath: project.path,
        rel: 'data/posts.json',
        fields: { tags: { type: 'multiReference', collection: 'data/tags.json' } },
      })
    );
    expect(await screen.findByText('Multi-reference → Tags')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: FAIL — there is no "Reference" tile in the type grid yet.

- [ ] **Step 3: Add `ReferenceIcon` and `MultiReferenceIcon`**

In `src/ui/Icons.jsx`, insert directly before the final `export function elementIcon(...)`:

```jsx
export const ReferenceIcon = (p) => (
  <I {...p}>
    <path d="M6.8 9.2 9.2 6.8" />
    <path d="M7.6 4.4 9 3a2.3 2.3 0 0 1 3.3 3.3L11 7.6" />
    <path d="M8.4 11.6 7 13a2.3 2.3 0 0 1-3.3-3.3L5 8.4" />
  </I>
);

export const MultiReferenceIcon = (p) => (
  <I {...p}>
    <path d="M6.8 9.2 9.2 6.8" />
    <path d="M7.6 4.4 9 3a2.3 2.3 0 0 1 3.3 3.3L11 7.6" />
    <path d="M8.4 11.6 7 13a2.3 2.3 0 0 1-3.3-3.3L5 8.4" />
    <circle cx="13" cy="3" r="1.6" fill="currentColor" stroke="none" />
  </I>
);
```

- [ ] **Step 4: Register the two new field types in `CmsView.jsx`**

In the icon import block near the top of `src/panels/CmsView.jsx`, add `ReferenceIcon, MultiReferenceIcon,` to the list imported from `'../ui/Icons.jsx'`.

Find `FIELD_TYPES`:

```js
const FIELD_TYPES = [
  { value: 'text', label: 'Text', Icon: VariableTextSizeIcon, hint: 'A short line' },
  { value: 'longtext', label: 'Long text', Icon: ParagraphIcon, hint: 'A paragraph' },
  { value: 'number', label: 'Number', Icon: FieldNumberIcon, hint: 'A figure' },
  { value: 'boolean', label: 'Toggle', Icon: SwitchIcon, hint: 'On or off' },
  { value: 'image', label: 'Image', Icon: ElementImageIcon, hint: 'From your assets' },
  { value: 'date', label: 'Date', Icon: CalendarIcon, hint: 'A calendar date' },
  { value: 'link', label: 'Link', Icon: ElementLinkIcon, hint: 'A web address' },
  { value: 'email', label: 'Email', Icon: MailIcon, hint: 'An address' },
  { value: 'phone', label: 'Phone', Icon: PhoneCallIcon, hint: 'A number to call' },
  { value: 'color', label: 'Color', Icon: DropletIcon, hint: 'A hex value' },
  { value: 'list', label: 'List of text', Icon: ElementListDefaultIcon, hint: 'Tags, bullets' },
  { value: 'object', label: 'Group', Icon: BracesIcon, hint: 'Fields kept together' },
  { value: 'objects', label: 'Repeating items', Icon: RepeatIcon, hint: 'A list of entries' },
];
```

Replace with:

```js
const FIELD_TYPES = [
  { value: 'text', label: 'Text', Icon: VariableTextSizeIcon, hint: 'A short line' },
  { value: 'longtext', label: 'Long text', Icon: ParagraphIcon, hint: 'A paragraph' },
  { value: 'number', label: 'Number', Icon: FieldNumberIcon, hint: 'A figure' },
  { value: 'boolean', label: 'Toggle', Icon: SwitchIcon, hint: 'On or off' },
  { value: 'image', label: 'Image', Icon: ElementImageIcon, hint: 'From your assets' },
  { value: 'date', label: 'Date', Icon: CalendarIcon, hint: 'A calendar date' },
  { value: 'link', label: 'Link', Icon: ElementLinkIcon, hint: 'A web address' },
  { value: 'email', label: 'Email', Icon: MailIcon, hint: 'An address' },
  { value: 'phone', label: 'Phone', Icon: PhoneCallIcon, hint: 'A number to call' },
  { value: 'color', label: 'Color', Icon: DropletIcon, hint: 'A hex value' },
  { value: 'list', label: 'List of text', Icon: ElementListDefaultIcon, hint: 'Tags, bullets' },
  { value: 'object', label: 'Group', Icon: BracesIcon, hint: 'Fields kept together' },
  { value: 'objects', label: 'Repeating items', Icon: RepeatIcon, hint: 'A list of entries' },
  { value: 'reference', label: 'Reference', Icon: ReferenceIcon, hint: 'Link to one item' },
  { value: 'multiReference', label: 'Multi-reference', Icon: MultiReferenceIcon, hint: 'Link to many items' },
];
```

- [ ] **Step 5: `emptyValueFor` defaults a multi-reference to an empty array**

In `src/cmsSchema.js`, find:

```js
export function emptyValueFor(type) {
  if (type === 'boolean') return false;
  if (type === 'number') return 0;
  if (type === 'list' || type === 'objects') return [];
  if (type === 'object') return {};
  return '';
}
```

Change to:

```js
export function emptyValueFor(type) {
  if (type === 'boolean') return false;
  if (type === 'number') return 0;
  if (type === 'list' || type === 'objects' || type === 'multiReference') return [];
  if (type === 'object') return {};
  return '';
}
```

- [ ] **Step 6: Let a declared reference/multi-reference type win outright, and expose `refCollection`**

In `CmsView.jsx`, find:

```js
function withDeclaredTypes(fields, declared, path) {
  if (!declared) return fields;
  return fields.map((field) => {
    const chosen = declared[[...path, field.key].join('.')];
    if (!chosen || STRUCTURAL.includes(field.type)) return field;
    return { ...field, type: chosen };
  });
}
```

Replace with:

```js
function withDeclaredTypes(fields, declared, path) {
  if (!declared) return fields;
  return fields.map((field) => {
    const chosen = declared[[...path, field.key].join('.')];
    if (!chosen) return field;
    const chosenType = typeof chosen === 'object' ? chosen.type : chosen;
    const refCollection = typeof chosen === 'object' ? chosen.collection : undefined;
    const forces = chosenType === 'reference' || chosenType === 'multiReference';
    if (!forces && STRUCTURAL.includes(field.type)) return field;
    return { ...field, type: chosenType, refCollection };
  });
}
```

- [ ] **Step 7: `bestType` never lets a reference/multi-reference field fall back to inference**

Find:

```js
function bestType(collectionType, value) {
  const own = inferType(value);
```

Replace with:

```js
function bestType(collectionType, value) {
  if (collectionType === 'reference' || collectionType === 'multiReference') return collectionType;
  const own = inferType(value);
```

- [ ] **Step 8: `addFieldAt` accepts and stores a target collection**

Find:

```js
  const addFieldAt = (path, key, type) => {
    if (!key) return;
    if (fieldsAt(items, path).some((f) => f.key === key)) return;
    saveDeclared({ ...declared, [[...path, key].join('.')]: type });
    commit(applyToItems(items, path, putKey(key, type)));
  };
```

Replace with:

```js
  const addFieldAt = (path, key, type, targetCollection) => {
    if (!key) return;
    if (fieldsAt(items, path).some((f) => f.key === key)) return;
    const config = type === 'reference' || type === 'multiReference' ? { type, collection: targetCollection } : type;
    saveDeclared({ ...declared, [[...path, key].join('.')]: config });
    commit(applyToItems(items, path, putKey(key, type)));
  };
```

- [ ] **Step 9: `CmsSettings` fetches the project's collections**

Find the `CmsSettings` function signature and its opening:

```js
function CmsSettings({
  collection,
  items,
  declared,
  saved,
  project,
  showToast,
  onDeleted,
  onAddField,
  onRenameField,
  onRemoveField,
  onReorderFields,
  onDone,
}) {
  return (
```

Replace with:

```js
function CmsSettings({
  collection,
  items,
  declared,
  saved,
  project,
  showToast,
  onDeleted,
  onAddField,
  onRenameField,
  onRemoveField,
  onReorderFields,
  onDone,
}) {
  const [collections, setCollections] = useState([]);
  useEffect(() => {
    let cancelled = false;
    window.avb.listCms(project.path).then(({ files }) => {
      if (!cancelled) setCollections((files || []).map(collectionOf));
    });
    return () => {
      cancelled = true;
    };
  }, [project.path]);

  return (
```

- [ ] **Step 10: Thread `collections` into `FieldSchema`**

Find the `<FieldSchema ... />` call inside `CmsSettings`:

```jsx
          <FieldSchema
            items={items}
            declared={declared}
            path={[]}
            onAddField={onAddField}
            onRenameField={onRenameField}
            onRemoveField={onRemoveField}
            onReorderFields={onReorderFields}
          />
```

Replace with:

```jsx
          <FieldSchema
            items={items}
            declared={declared}
            path={[]}
            collections={collections}
            onAddField={onAddField}
            onRenameField={onRenameField}
            onRemoveField={onRemoveField}
            onReorderFields={onReorderFields}
          />
```

- [ ] **Step 11: `FieldSchema` forwards `collections`, and shows the target collection on a reference row**

Find the `FieldSchema` function signature:

```js
function FieldSchema({ items, declared, path, ...ops }) {
```

It already spreads `...ops` for `onAddField`/`onRenameField`/`onRemoveField`/`onReorderFields`/(now)`collections` — no change needed to the signature itself, since `collections` will simply flow through `ops.collections`. Find the nested recursive call:

```jsx
            {nested && open && (
              <div className="cms-schema-nested">
                <FieldSchema
                  items={items}
                  declared={declared}
                  path={[...path, field.key]}
                  {...ops}
                />
              </div>
            )}
```

This already spreads `{...ops}`, so `collections` reaches nested levels automatically — no change needed here either.

Find the schema-type label span:

```jsx
              <span className="cms-schema-type" title="A field's type is set when it's created">
                <Icon size={13} />
                {info.label}
              </span>
```

Replace with:

```jsx
              <span className="cms-schema-type" title="A field's type is set when it's created">
                <Icon size={13} />
                {info.label}
                {field.refCollection &&
                  ` → ${ops.collections?.find((c) => c.rel === field.refCollection)?.label || field.refCollection}`}
              </span>
```

Find the `<AddFieldRow ... />` call at the bottom of `FieldSchema`:

```jsx
      <AddFieldRow compact={path.length > 0} onAdd={(key, type) => ops.onAddField(path, key, type)} />
```

Replace with:

```jsx
      <AddFieldRow
        compact={path.length > 0}
        collections={ops.collections}
        onAdd={(key, type, targetCollection) => ops.onAddField(path, key, type, targetCollection)}
      />
```

- [ ] **Step 12: `AddFieldRow` forwards `collections` to the dialog**

Find:

```js
function AddFieldRow({ onAdd, compact }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`cms-add ${compact ? 'compact' : ''}`} onClick={() => setOpen(true)}>
        <PlusIcon size={11} /> Add field
      </button>
      {open && (
        <NewFieldDialog
          onAdd={(key, type) => {
            onAdd(key, type);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

Replace with:

```js
function AddFieldRow({ onAdd, compact, collections }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`cms-add ${compact ? 'compact' : ''}`} onClick={() => setOpen(true)}>
        <PlusIcon size={11} /> Add field
      </button>
      {open && (
        <NewFieldDialog
          collections={collections}
          onAdd={(key, type, targetCollection) => {
            onAdd(key, type, targetCollection);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 13: `NewFieldDialog` adds the target-collection step**

Find the whole `NewFieldDialog` function and replace it entirely:

```js
// Pick the type first — it decides what the field can hold, and it can't be
// changed afterwards — then name it. Reference/multi-reference types add a
// step in between: which collection the field points at.
function NewFieldDialog({ onAdd, onClose, collections = [] }) {
  const [type, setType] = useState(null);
  const [targetCollection, setTargetCollection] = useState(null);
  const [name, setName] = useState('');
  const overlayRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelectorAll('.cms-modal-overlay');
      if (open[open.length - 1] !== overlayRef.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const info = type ? typeInfo(type) : null;
  const isRef = type === 'reference' || type === 'multiReference';
  const needsCollection = isRef && !targetCollection;
  const submit = () => {
    const key = keyFor(name);
    if (key) onAdd(key, type, targetCollection);
  };

  const back = () => {
    if (needsCollection || !isRef) {
      setType(null);
      setTargetCollection(null);
    } else {
      setTargetCollection(null);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="modal-overlay cms-modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal cms-modal cms-type-modal">
        <div className="modal-header cms-modal-header">
          {type && (
            <button className="ghost" title="Back" onClick={back}>
              <ChevronLeftIcon size={13} />
            </button>
          )}
          <span>
            {!type
              ? 'Choose a field type'
              : needsCollection
                ? `Link to which collection?`
                : `New ${info.label} field`}
          </span>
          <button className="ghost" title="Close" onClick={onClose}>
            <CloseIcon size={12} />
          </button>
        </div>

        {!type ? (
          <div className="cms-type-grid">
            {FIELD_TYPES.map(({ value, label, Icon, hint }) => (
              <button key={value} className="cms-type-tile" onClick={() => setType(value)}>
                <Icon size={18} />
                <span className="cms-type-name">{label}</span>
                <span className="cms-type-hint">{hint}</span>
              </button>
            ))}
          </div>
        ) : needsCollection ? (
          <div className="modal-body cms-ref-collection-list">
            {collections.length === 0 && (
              <div className="cms-empty-inline">No other collections yet.</div>
            )}
            {collections.map((c) => (
              <button key={c.rel} className="cms-ref-option" onClick={() => setTargetCollection(c.rel)}>
                {c.label}
                <span className="cms-collection-count">
                  {c.single ? '1 item' : `${c.items.length} items`}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="modal-body">
              <div>
                <label>Name</label>
                <input
                  autoFocus
                  value={name}
                  placeholder={`e.g. ${info.label === 'Text' ? 'Subtitle' : info.label}`}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit();
                  }}
                />
              </div>
              {keyFor(name) && (
                <div className="cms-note" style={{ margin: 0 }}>
                  Your code reads this as <code>{keyFor(name)}</code>.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="primary" onClick={submit} disabled={!keyFor(name)}>
                Add field
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Run the test to verify it passes**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: PASS.

- [ ] **Step 15: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — nothing else in the suite touches `FIELD_TYPES`, `withDeclaredTypes`, `bestType`, `addFieldAt`, `CmsSettings`, `AddFieldRow`, or `NewFieldDialog`.

- [ ] **Step 16: Commit**

```bash
git add src/ui/Icons.jsx src/panels/CmsView.jsx src/cmsSchema.js src/panels/CmsView.test.jsx
git commit -m "feat: add Reference/Multi-reference field types with a target-collection picker"
```

---

## Task 5: Editing reference values

Adds the actual value-editing controls (a combobox for Reference, a chip picker for Multi-reference), and fixes a pre-existing gap where fields nested inside a Group or Repeater never applied declared types — harmless for existing types (inference degrades to a plain text box), but fatal for a reference field, which has no inferred fallback at all.

**Files:**
- Create: `src/panels/CmsReferenceField.jsx`
- Modify: `src/panels/CmsView.jsx`
- Modify: `src/ui/Icons.jsx`
- Modify: `src/styles.css`
- Test: `src/panels/CmsView.test.jsx`

**Interfaces:**
- Produces: `ReferenceControl`, `MultiReferenceControl` (named exports of `src/panels/CmsReferenceField.jsx`), each `{ value, onChange, collectionRel, resolveCollection }` where `resolveCollection: (rel: string) => Promise<items>`.
- Consumes: `titleOf` from `cmsSchema.js`; `genId`/`ensureIds`/`collectionOf`/`reassemble` (already imported or from Task 1) inside `CmsView.jsx`'s new `resolveCollection`.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/CmsView.test.jsx`:

```jsx
describe('editing a reference value', () => {
  it('picks an item, shows its title, and can clear it', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', author: '' }],
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />);

    fireEvent.click(await screen.findByText('Choose item'));
    fireEvent.click(await screen.findByText('Ada'));
    expect(await screen.findByText('Ada')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Clear'));
    await waitFor(() => expect(screen.queryByText('Ada')).not.toBeInTheDocument());
  });

  it('shows a missing-item state for a dangling id', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', author: 'ghost' }],
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />);
    expect(await screen.findByText('Missing item')).toBeInTheDocument();
  });

  it('resolves a reference field nested inside a group', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', seo: { reviewer: '' } }],
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
      },
      meta: { 'data/posts.json': { 'seo.reviewer': { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />);
    fireEvent.click(await screen.findByText('Choose item'));
    fireEvent.click(await screen.findByText('Ada'));
    expect(await screen.findByText('Ada')).toBeInTheDocument();
  });
});

describe('editing a multi-reference value', () => {
  it('adds a chip and can remove it', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', tags: ['t1'] }],
        'data/tags.json': [{ _id: 't1', name: 'News' }, { _id: 't2', name: 'Launch' }],
      },
      meta: { 'data/posts.json': { tags: { type: 'multiReference', collection: 'data/tags.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />);

    expect(await screen.findByText('News')).toBeInTheDocument();

    fireEvent.click(await screen.findByText('Add'));
    fireEvent.click(await screen.findByText('Launch'));
    expect(await screen.findByText('Launch')).toBeInTheDocument();

    const chip = (await screen.findByText('News')).closest('.cms-ref-chip');
    fireEvent.click(within(chip).getByTitle('Remove'));
    await waitFor(() => expect(screen.queryByText('News')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: FAIL — there is no "Choose item" control and nested fields don't resolve declared types yet.

- [ ] **Step 3: Add `WarningIcon` and `SearchIcon` import**

`SearchIcon` already exists in `src/ui/Icons.jsx` (used by `InsertSearch.jsx`) — no change needed for it. Add `WarningIcon` in `src/ui/Icons.jsx`, right after `SearchIcon`:

```jsx
export const WarningIcon = (p) => (
  <I {...p}>
    <path d="M8 2.3 14.2 13a1 1 0 0 1-.87 1.5H2.67A1 1 0 0 1 1.8 13L8 2.3Z" />
    <path d="M8 6.3v3" />
    <path d="M8 11.6h.01" strokeWidth="2" />
  </I>
);
```

- [ ] **Step 4: Create `src/panels/CmsReferenceField.jsx`**

```jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloseIcon, PlusIcon, SearchIcon, WarningIcon } from '../ui/Icons.jsx';
import { titleOf } from '../cmsSchema.js';

const MISSING = Symbol('missing-item');

// Resolves a target collection's items once on mount (so a chip can show its
// title right away) and again each time the picker opens, so it reflects
// items added moments ago.
function useResolvedItems(collectionRel, resolveCollection) {
  const [items, setItems] = useState(null); // null while loading
  const reload = useCallback(() => {
    if (!collectionRel) {
      setItems([]);
      return;
    }
    resolveCollection(collectionRel).then(setItems);
  }, [collectionRel, resolveCollection]);
  useEffect(() => {
    reload();
  }, [reload]);
  return [items, reload];
}

function resolveTitle(items, id) {
  if (items == null) return null;
  const index = items.findIndex((it) => it._id === id);
  return index < 0 ? MISSING : titleOf(items[index], index);
}

function Chip({ id, items, onRemove }) {
  const title = resolveTitle(items, id);
  return (
    <span className={`cms-ref-chip ${title === MISSING ? 'missing' : ''}`}>
      {title === MISSING && <WarningIcon size={11} />}
      {title === MISSING ? 'Missing item' : (title ?? '…')}
      <button className="ghost" title="Remove" onClick={onRemove}>
        <CloseIcon size={10} />
      </button>
    </span>
  );
}

export function ReferenceControl({ value, onChange, collectionRel, resolveCollection }) {
  const [open, setOpen] = useState(false);
  const [items, reload] = useResolvedItems(collectionRel, resolveCollection);

  return (
    <div className="cms-ref">
      {value && <Chip id={value} items={items} onRemove={() => onChange('')} />}
      <button
        className="cms-add"
        onClick={() => {
          reload();
          setOpen(true);
        }}
      >
        <PlusIcon size={11} /> {value ? 'Change' : 'Choose item'}
      </button>
      {open && (
        <ReferencePickerDialog
          items={items}
          multiple={false}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function MultiReferenceControl({ value, onChange, collectionRel, resolveCollection }) {
  const [open, setOpen] = useState(false);
  const [items, reload] = useResolvedItems(collectionRel, resolveCollection);

  return (
    <div className="cms-ref cms-ref-multi">
      {value.length > 0 && (
        <div className="cms-ref-chips">
          {value.map((id) => (
            <Chip key={id} id={id} items={items} onRemove={() => onChange(value.filter((v) => v !== id))} />
          ))}
        </div>
      )}
      <button
        className="cms-add"
        onClick={() => {
          reload();
          setOpen(true);
        }}
      >
        <PlusIcon size={11} /> Add
      </button>
      {open && (
        <ReferencePickerDialog
          items={items}
          selectedIds={value}
          multiple
          onPick={(id) => onChange([...value, id])}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ReferencePickerDialog({ items, selectedIds = [], multiple, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const overlayRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelectorAll('.cms-modal-overlay');
      if (open[open.length - 1] !== overlayRef.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = (items || []).filter((it, i) => {
    if (multiple && selectedIds.includes(it._id)) return false;
    const q = query.trim().toLowerCase();
    return !q || titleOf(it, i).toLowerCase().includes(q);
  });

  return (
    <div
      ref={overlayRef}
      className="modal-overlay cms-modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal cms-modal cms-ref-modal">
        <div className="modal-header cms-modal-header">
          <span>Choose {multiple ? 'items' : 'an item'}</span>
          <button className="ghost" title="Close" onClick={onClose}>
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="cms-ref-search">
          <SearchIcon size={13} />
          <input autoFocus value={query} placeholder="Search…" onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="cms-ref-list">
          {items == null && <div className="cms-empty-inline">Loading…</div>}
          {items != null &&
            list.map((it, i) => (
              <button key={it._id} className="cms-ref-option" onClick={() => onPick(it._id)}>
                {titleOf(it, i)}
              </button>
            ))}
          {items != null && list.length === 0 && (
            <div className="cms-empty-inline">
              {items.length === 0 ? 'No items in this collection yet.' : 'No matches.'}
            </div>
          )}
        </div>
        {multiple && (
          <div className="modal-footer cms-modal-footer">
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `resolveCollection` into `CmsView`**

In `src/panels/CmsView.jsx`, add `ensureIds` to the `cmsSchema.js` import list, and import the two new controls:

```js
import { ReferenceControl, MultiReferenceControl } from './CmsReferenceField.jsx';
```

Find the `flush`/`flushRef` block (right after `commit` is defined further down is fine too) and add, near the other `useCallback`s inside the `CmsView` component body (directly after the `load` callback's `useEffect` block, before `const fields = useMemo(...)`):

```js
  // Resolves a target collection's items for a reference picker, assigning
  // any of them a hidden `_id` (and persisting it) the first time they're
  // actually linkable. If the target is the collection currently open here,
  // the new ids are merged into local state too, so the next save doesn't
  // overwrite the file and drop them again.
  const resolveCollection = useCallback(
    async (targetRel) => {
      const { data } = await window.avb.readCms({ projectPath: project.path, rel: targetRel });
      const name = targetRel.slice(targetRel.lastIndexOf('/') + 1);
      const dir = targetRel.includes('/') ? targetRel.slice(0, targetRel.lastIndexOf('/')) : '';
      const col = collectionOf({ rel: targetRel, name, dir, data });
      const { items: withIds, changed } = ensureIds(col.items);
      if (!changed) return col.items;
      await window.avb.writeCms({ projectPath: project.path, rel: targetRel, data: reassemble(col, withIds) });
      if (targetRel === rel) {
        const merge = (arr) =>
          arr.map((it, i) => (isPlainObject(it) && !it._id && withIds[i]?._id ? { ...it, _id: withIds[i]._id } : it));
        setItems((prev) => {
          if (pending.current) pending.current = merge(pending.current);
          return merge(prev);
        });
      }
      return withIds;
    },
    [project.path, rel]
  );
```

- [ ] **Step 6: Thread `declared`/`path`/`resolveCollection` through `FieldRow`/`FieldControl`, and add the two new branches**

Find `FieldRow`:

```js
function FieldRow({ label, type, value, onChange, projectPath, depth = 0 }) {
  // Typing an 81st character turns a text field into a paragraph one, and
  // swapping <input> for <textarea> mid-word would take the caret with it.
  // The control only changes shape while the field is idle.
  const [focused, setFocused] = useState(false);
  const shown = useRef(type);
  if (!focused) shown.current = type;

  return (
    <div
      className={`cms-field ${shown.current}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="cms-field-head">
        <label>{label}</label>
      </div>
      <FieldControl
        type={shown.current}
        value={value}
        onChange={onChange}
        projectPath={projectPath}
        depth={depth}
      />
    </div>
  );
}
```

Replace with:

```js
function FieldRow({
  label,
  type,
  value,
  onChange,
  projectPath,
  depth = 0,
  refCollection,
  declared,
  path,
  resolveCollection,
}) {
  // Typing an 81st character turns a text field into a paragraph one, and
  // swapping <input> for <textarea> mid-word would take the caret with it.
  // The control only changes shape while the field is idle.
  const [focused, setFocused] = useState(false);
  const shown = useRef(type);
  if (!focused) shown.current = type;

  return (
    <div
      className={`cms-field ${shown.current}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="cms-field-head">
        <label>{label}</label>
      </div>
      <FieldControl
        type={shown.current}
        value={value}
        onChange={onChange}
        projectPath={projectPath}
        depth={depth}
        refCollection={refCollection}
        declared={declared}
        path={path}
        resolveCollection={resolveCollection}
      />
    </div>
  );
}
```

Find `FieldControl`'s signature and its `object`/`objects` branches:

```js
function FieldControl({ type, value, onChange, projectPath, depth }) {
```

Replace with:

```js
function FieldControl({ type, value, onChange, projectPath, depth, refCollection, declared, path, resolveCollection }) {
```

Find:

```js
  if (type === 'object') {
    return (
      <GroupEditor
        value={isPlainObject(value) ? value : {}}
        onChange={onChange}
        projectPath={projectPath}
        depth={depth + 1}
      />
    );
  }

  if (type === 'objects') {
    return (
      <RepeaterEditor
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
        projectPath={projectPath}
        depth={depth + 1}
      />
    );
  }

  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}
```

Replace with:

```js
  if (type === 'object') {
    return (
      <GroupEditor
        value={isPlainObject(value) ? value : {}}
        onChange={onChange}
        projectPath={projectPath}
        depth={depth + 1}
        declared={declared}
        path={path}
        resolveCollection={resolveCollection}
      />
    );
  }

  if (type === 'objects') {
    return (
      <RepeaterEditor
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
        projectPath={projectPath}
        depth={depth + 1}
        declared={declared}
        path={path}
        resolveCollection={resolveCollection}
      />
    );
  }

  if (type === 'reference') {
    return (
      <ReferenceControl
        value={value ?? ''}
        onChange={onChange}
        collectionRel={refCollection}
        resolveCollection={resolveCollection}
      />
    );
  }

  if (type === 'multiReference') {
    return (
      <MultiReferenceControl
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
        collectionRel={refCollection}
        resolveCollection={resolveCollection}
      />
    );
  }

  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}
```

- [ ] **Step 7: Fix `GroupEditor` to respect declared types (needed for nested reference fields)**

Find:

```js
// A nested object: its keys become fields one level in.
function GroupEditor({ value, onChange, projectPath, depth }) {
  const fields = fieldsOf([value]);
  return (
    <div className="cms-group-box">
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          label={field.label}
          type={field.type}
          value={value[field.key]}
          projectPath={projectPath}
          depth={depth}
          onChange={(v) => onChange({ ...value, [field.key]: v })}
        />
      ))}
      {fields.length === 0 && <div className="cms-empty-inline">Empty group.</div>}
    </div>
  );
}
```

Replace with:

```js
// A nested object: its keys become fields one level in.
function GroupEditor({ value, onChange, projectPath, depth, declared, path, resolveCollection }) {
  const fields = withDeclaredTypes(fieldsOf([value]), declared, path);
  return (
    <div className="cms-group-box">
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          label={field.label}
          type={field.type}
          value={value[field.key]}
          projectPath={projectPath}
          depth={depth}
          refCollection={field.refCollection}
          declared={declared}
          path={[...path, field.key]}
          resolveCollection={resolveCollection}
          onChange={(v) => onChange({ ...value, [field.key]: v })}
        />
      ))}
      {fields.length === 0 && <div className="cms-empty-inline">Empty group.</div>}
    </div>
  );
}
```

- [ ] **Step 8: Thread the same through `RepeaterEditor` and fix `NestedItemDialog`**

Find `RepeaterEditor`'s signature and its `<NestedItemDialog ... />` call:

```js
function RepeaterEditor({ value, onChange, projectPath, depth }) {
```

Replace with:

```js
function RepeaterEditor({ value, onChange, projectPath, depth, declared, path, resolveCollection }) {
```

Find:

```jsx
      {openIndex != null && value[openIndex] !== undefined && (
        <NestedItemDialog
          entry={value[openIndex]}
          title={titleOf(value[openIndex], openIndex)}
          projectPath={projectPath}
          depth={depth}
          onChange={(next) => {
            const copy = [...value];
            copy[openIndex] = next;
            onChange(copy);
          }}
          onDelete={() => removeAt(openIndex)}
          onClose={() => setOpenIndex(null)}
        />
      )}
```

Replace with:

```jsx
      {openIndex != null && value[openIndex] !== undefined && (
        <NestedItemDialog
          entry={value[openIndex]}
          title={titleOf(value[openIndex], openIndex)}
          projectPath={projectPath}
          depth={depth}
          declared={declared}
          path={path}
          resolveCollection={resolveCollection}
          onChange={(next) => {
            const copy = [...value];
            copy[openIndex] = next;
            onChange(copy);
          }}
          onDelete={() => removeAt(openIndex)}
          onClose={() => setOpenIndex(null)}
        />
      )}
```

Find `NestedItemDialog`:

```js
function NestedItemDialog({ entry, title, projectPath, depth, onChange, onDelete, onClose }) {
  const overlayRef = useRef(null);
  const fields = fieldsOf([entry]);
```

Replace with:

```js
function NestedItemDialog({ entry, title, projectPath, depth, declared, path, resolveCollection, onChange, onDelete, onClose }) {
  const overlayRef = useRef(null);
  const fields = withDeclaredTypes(fieldsOf([entry]), declared, path);
```

Find the `fields.map` inside `NestedItemDialog`'s body:

```jsx
          {fields.map((field) => (
            <FieldRow
              key={field.key}
              label={field.label}
              type={field.type}
              value={entry[field.key]}
              projectPath={projectPath}
              depth={depth}
              onChange={(v) => onChange({ ...entry, [field.key]: v })}
            />
          ))}
```

Replace with:

```jsx
          {fields.map((field) => (
            <FieldRow
              key={field.key}
              label={field.label}
              type={field.type}
              value={entry[field.key]}
              projectPath={projectPath}
              depth={depth}
              refCollection={field.refCollection}
              declared={declared}
              path={[...path, field.key]}
              resolveCollection={resolveCollection}
              onChange={(v) => onChange({ ...entry, [field.key]: v })}
            />
          ))}
```

- [ ] **Step 9: Pass `declared`/`path`/`resolveCollection` from the top-level item render**

Find the top-level fields render in `CmsView`'s main return:

```jsx
          {item && isPlainObject(item) && (
            <div className="cms-card">
              <h3>{single ? collection.label : 'Basic info'}</h3>
              {fields.map((field) => (
                <FieldRow
                  key={field.key}
                  label={field.label}
                  type={
                    item[field.key] === undefined
                      ? field.type
                      : bestType(field.type, item[field.key])
                  }
                  value={item[field.key]}
                  projectPath={project.path}
                  onChange={(v) => setItemValue(field.key, v)}
                />
              ))}
```

Replace with:

```jsx
          {item && isPlainObject(item) && (
            <div className="cms-card">
              <h3>{single ? collection.label : 'Basic info'}</h3>
              {fields.map((field) => (
                <FieldRow
                  key={field.key}
                  label={field.label}
                  type={
                    item[field.key] === undefined
                      ? field.type
                      : bestType(field.type, item[field.key])
                  }
                  value={item[field.key]}
                  projectPath={project.path}
                  refCollection={field.refCollection}
                  declared={declared}
                  path={[field.key]}
                  resolveCollection={resolveCollection}
                  onChange={(v) => setItemValue(field.key, v)}
                />
              ))}
```

- [ ] **Step 10: Add the CSS for chips, the picker dialog, and the collection-picker list**

Append to `src/styles.css`, after the existing `.cms-color` rules at the end of the CMS section:

```css
.cms-ref { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.cms-ref-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cms-ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-dim);
}
.cms-ref-chip.missing { color: var(--red); border-color: rgba(255, 69, 58, 0.4); }
.cms-ref-chip .ghost { padding: 1px; color: var(--text-faint); }
.cms-ref-chip .ghost:hover { color: var(--red); background: transparent; }

.cms-ref-modal { width: 420px; }
.cms-ref-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px 6px;
  color: var(--text-faint);
}
.cms-ref-search input { flex: 1; }
.cms-ref-list {
  max-height: 44vh;
  overflow-y: auto;
  padding: 4px 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cms-ref-option {
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--text-dim);
  background: transparent;
}
.cms-ref-option:hover { background: var(--bg-hover); color: var(--text); }

.cms-ref-collection-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px 16px;
}
.cms-ref-collection-list .cms-ref-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border);
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: PASS.

- [ ] **Step 12: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — `GroupEditor`/`NestedItemDialog` now compute their fields via `withDeclaredTypes` instead of bare `fieldsOf`, which only changes behavior for fields that have an explicitly declared type; nothing in the existing suite exercises that path today.

- [ ] **Step 13: Commit**

```bash
git add src/panels/CmsReferenceField.jsx src/panels/CmsView.jsx src/ui/Icons.jsx src/styles.css src/panels/CmsView.test.jsx
git commit -m "feat: edit reference and multi-reference field values, including nested ones"
```

---

## Task 6: Blocked item delete, with cross-collection navigation

**Files:**
- Create: `src/panels/CmsDeleteGuard.jsx`
- Modify: `src/panels/CmsView.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `src/panels/CmsView.test.jsx`

**Interfaces:**
- Produces (`CmsDeleteGuard.jsx`, default export): `<CmsDeleteGuard title message hits files projectPath onShowInstance onConfirm onCancel />`.
- Produces (`CmsView.jsx`, module scope): `async function loadDeleteGuard(projectPath, targetRel, targetIds): Promise<{ hits, files }>` — Task 7 reuses this for the collection-delete flow.
- Produces (`CmsView.jsx`, new props): `jumpItemId`, `onJumpHandled`, `onJumpToItem` — set by `App.jsx`.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/CmsView.test.jsx`:

```jsx
describe('deleting an item that is referenced elsewhere', () => {
  it('blocks the delete until the reference is resolved', async () => {
    mockAvb({
      files: {
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
        'data/posts.json': [{ title: 'Hello', author: 'a1' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/authors.json" showToast={vi.fn()} />);

    fireEvent.click(await screen.findByTitle('Delete item'));
    expect(await screen.findByText('This item is referenced elsewhere')).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(screen.getByText('Remove anyway'));
    await waitFor(() => expect(deleteButton).not.toBeDisabled());
  });

  it('deletes immediately when nothing references the item', async () => {
    mockAvb({ files: { 'data/authors.json': [{ name: 'Ada' }] } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CmsView project={project} rel="data/authors.json" showToast={vi.fn()} />);
    fireEvent.click(await screen.findByTitle('Delete item'));
    await waitFor(() => expect(window.avb.writeCms).toHaveBeenCalled(), { timeout: 2000 });
  });
});

describe('jumping to a referencing item', () => {
  it('selects the item matching jumpItemId once it is loaded, then reports it handled', async () => {
    mockAvb({
      files: { 'data/authors.json': [{ _id: 'a1', name: 'Ada' }, { _id: 'a2', name: 'Grace' }] },
    });
    const onJumpHandled = vi.fn();
    render(
      <CmsView
        project={project}
        rel="data/authors.json"
        showToast={vi.fn()}
        jumpItemId="a2"
        onJumpHandled={onJumpHandled}
      />
    );
    await waitFor(() => expect(screen.getByText('Grace').closest('.cms-item')).toHaveClass('on'));
    expect(onJumpHandled).toHaveBeenCalled();
  });

  it('Show instance calls onJumpToItem with the referencing collection and item', async () => {
    mockAvb({
      files: {
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
        'data/posts.json': [{ _id: 'p1', title: 'Hello', author: 'a1' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    const onJumpToItem = vi.fn();
    render(
      <CmsView project={project} rel="data/authors.json" showToast={vi.fn()} onJumpToItem={onJumpToItem} />
    );
    fireEvent.click(await screen.findByTitle('Delete item'));
    fireEvent.click(await screen.findByText('Show instance'));
    expect(onJumpToItem).toHaveBeenCalledWith('data/posts.json', 'p1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: FAIL — deleting still goes straight through `window.confirm`.

- [ ] **Step 3: Create `src/panels/CmsDeleteGuard.jsx`**

```jsx
import React, { useRef, useState } from 'react';
import { CheckIcon, CloseIcon, TrashIcon, WarningIcon } from '../ui/Icons.jsx';
import { clearIncomingReference } from '../cmsReferences.js';
import { collectionOf, reassemble } from '../cmsSchema.js';

const keyOf = (hit) => [hit.collectionRel, hit.itemIndex, ...hit.steps, hit.fieldKey].join(':');

// Blocks a delete until every item elsewhere in the project that references
// what's about to disappear has been resolved — either repointed by hand
// (Show instance) or cleared on the spot (Remove anyway). `hits` and `files`
// are a snapshot taken when the delete was attempted; each hit disappears
// from the list the moment its reference is cleared.
export default function CmsDeleteGuard({
  title,
  message,
  hits: initialHits,
  files,
  projectPath,
  onShowInstance,
  onConfirm,
  onCancel,
}) {
  const [hits, setHits] = useState(initialHits);
  const [busyKey, setBusyKey] = useState(null);
  const filesRef = useRef(files);

  const removeAnyway = async (hit) => {
    const key = keyOf(hit);
    setBusyKey(key);
    const file = filesRef.current.find((f) => f.rel === hit.collectionRel);
    const collection = collectionOf(file);
    const nextItems = clearIncomingReference(collection.items, hit);
    const data = reassemble(collection, nextItems);
    await window.avb.writeCms({ projectPath, rel: hit.collectionRel, data });
    filesRef.current = filesRef.current.map((f) => (f.rel === hit.collectionRel ? { ...f, data } : f));
    setHits((prev) => prev.filter((h) => keyOf(h) !== key));
    setBusyKey(null);
  };

  return (
    <div
      className="modal-overlay cms-modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="modal cms-modal cms-guard-modal">
        <div className="modal-header cms-modal-header">
          <span>{title}</span>
          <button className="ghost" title="Close" onClick={onCancel}>
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="modal-body cms-guard-body">
          <p className="cms-note" style={{ margin: 0 }}>
            {message}
          </p>
          {hits.length > 0 && (
            <div className="cms-guard-list">
              {hits.map((hit) => (
                <div key={keyOf(hit)} className="cms-guard-row">
                  <WarningIcon size={13} />
                  <span className="cms-guard-row-text">
                    <strong>{hit.itemTitle}</strong> in {hit.collectionLabel} — "{hit.fieldLabel}"
                  </span>
                  <span className="cms-guard-row-actions">
                    <button className="ghost" title="Go to this item" onClick={() => onShowInstance(hit)}>
                      Show instance
                    </button>
                    <button
                      className="ghost danger"
                      title="Remove this reference"
                      disabled={busyKey === keyOf(hit)}
                      onClick={() => removeAnyway(hit)}
                    >
                      Remove anyway
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {hits.length === 0 && (
            <div className="cms-guard-clear">
              <CheckIcon size={12} /> Nothing references this anymore.
            </div>
          )}
        </div>
        <div className="modal-footer cms-modal-footer">
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="ghost danger" disabled={hits.length > 0} onClick={onConfirm}>
            <TrashIcon size={12} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add its CSS**

Append to `src/styles.css`, after the block added in Task 5:

```css
.cms-guard-modal { width: 520px; }
.cms-guard-body { display: flex; flex-direction: column; gap: 10px; }
.cms-guard-list { display: flex; flex-direction: column; gap: 4px; max-height: 40vh; overflow-y: auto; }
.cms-guard-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 69, 58, 0.3);
  border-radius: 8px;
  background: rgba(255, 69, 58, 0.08);
  color: var(--text-dim);
}
.cms-guard-row svg { color: var(--red); flex-shrink: 0; }
.cms-guard-row-text { flex: 1; min-width: 0; font-size: 11.5px; line-height: 1.4; }
.cms-guard-row-text strong { color: var(--text); font-weight: 600; }
.cms-guard-row-actions { display: flex; gap: 4px; opacity: 0; flex-shrink: 0; }
.cms-guard-row:hover .cms-guard-row-actions { opacity: 1; }
.cms-guard-row-actions .ghost { font-size: 11px; padding: 3px 6px; color: var(--text-dim); }
.cms-guard-row-actions .ghost.danger:hover { color: var(--red); background: rgba(255, 69, 58, 0.14); }
.cms-guard-clear { display: flex; align-items: center; gap: 6px; color: var(--green); font-size: 11.5px; }
```

- [ ] **Step 5: Add `loadDeleteGuard` and wire `removeItem` in `CmsView.jsx`**

Add `findIncomingReferences` to the imports (new import line, alongside the existing `cmsSchema.js` import block):

```js
import { findIncomingReferences } from '../cmsReferences.js';
import CmsDeleteGuard from './CmsDeleteGuard.jsx';
```

Add this module-level helper below `withDeclaredTypes`/`bestType` (near the other free functions, before `FieldRow`):

```js
// Computes the blocking list for a delete: every other item in the project
// referencing the id(s) about to disappear, assigning any of those
// referencing items their own hidden id if they don't have one yet — a "Show
// instance" jump needs something stable to select.
async function loadDeleteGuard(projectPath, targetRel, targetIds) {
  if (!targetIds.length) return { hits: [], files: [] };
  const [{ files }, { meta }] = await Promise.all([
    window.avb.listCms(projectPath),
    window.avb.cmsMeta(projectPath),
  ]);
  let hits = findIncomingReferences({ files, meta, targetRel, targetIds });
  const relsNeedingIds = [...new Set(hits.filter((h) => !h.itemId).map((h) => h.collectionRel))];
  for (const collectionRel of relsNeedingIds) {
    const file = files.find((f) => f.rel === collectionRel);
    const collection = collectionOf(file);
    const { items: nextItems, changed } = ensureIds(collection.items);
    if (changed) {
      const data = reassemble(collection, nextItems);
      await window.avb.writeCms({ projectPath, rel: collectionRel, data });
      file.data = data;
    }
  }
  if (relsNeedingIds.length) {
    hits = hits.map((hit) => {
      if (hit.itemId) return hit;
      const file = files.find((f) => f.rel === hit.collectionRel);
      const collection = collectionOf(file);
      return { ...hit, itemId: collection.items[hit.itemIndex]?._id || null };
    });
  }
  return { hits, files };
}
```

- [ ] **Step 6: Accept the new props and add `deleteGuard` state**

Find the `CmsView` function's prop list:

```js
export default function CmsView({
  project,
  rel,
  hidden,
  settings,
  showToast,
  onSaved,
  onCloseSettings,
  onDeleted,
  onClose,
}) {
```

Replace with:

```js
export default function CmsView({
  project,
  rel,
  hidden,
  settings,
  showToast,
  onSaved,
  onCloseSettings,
  onDeleted,
  onClose,
  jumpItemId,
  onJumpHandled,
  onJumpToItem,
}) {
```

Find the state declarations near the top of the component (after `const [declared, setDeclared] = useState({});`) and add:

```js
  const [deleteGuard, setDeleteGuard] = useState(null); // { hits, files, onConfirm } while a blocked delete is open
```

- [ ] **Step 7: Add the jump-to-item effect**

Add this `useEffect` right after the `fields = useMemo(...)` block:

```js
  // "Show instance" (from a blocked delete elsewhere) asks to select a
  // specific item once its collection has loaded. Only clears the request
  // once the item is actually found — items may still belong to the
  // previous collection for a render or two while the new one loads.
  useEffect(() => {
    if (!jumpItemId) return;
    const index = items.findIndex((it) => isPlainObject(it) && it._id === jumpItemId);
    if (index < 0) return;
    setSel(index);
    setQuery('');
    onJumpHandled?.();
  }, [jumpItemId, items, onJumpHandled]);
```

- [ ] **Step 8: Rewrite `removeItem`**

Find:

```js
  const removeItem = () => {
    if (!window.confirm(`Delete “${titleOf(item, sel)}”?`)) return;
    const next = items.filter((_, i) => i !== sel);
    commit(next);
    setSel(Math.max(0, Math.min(sel, next.length - 1)));
  };
```

Replace with:

```js
  const doRemoveItem = () => {
    const next = items.filter((_, i) => i !== sel);
    commit(next);
    setSel(Math.max(0, Math.min(sel, next.length - 1)));
  };

  const removeItem = async () => {
    const targetId = isPlainObject(item) ? item._id : null;
    const { hits, files } = targetId
      ? await loadDeleteGuard(project.path, rel, [targetId])
      : { hits: [], files: [] };
    if (!hits.length) {
      if (!window.confirm(`Delete “${titleOf(item, sel)}”?`)) return;
      doRemoveItem();
      return;
    }
    setDeleteGuard({ hits, files, onConfirm: doRemoveItem });
  };
```

- [ ] **Step 9: Render the guard dialog**

Find the closing of the main (non-settings) `.cms-view` return — the end of the `<div className="cms-detail">...</div>` block, right before the function's final `</div>\n  );\n}`:

```jsx
      </div>
    </div>
  );
}

// Collection settings — the shape of the data rather than its content.
```

Replace with:

```jsx
      </div>

      {deleteGuard && (
        <CmsDeleteGuard
          title="This item is referenced elsewhere"
          message="Resolve every reference below before deleting it — repoint it by hand, or remove the reference on the spot."
          hits={deleteGuard.hits}
          files={deleteGuard.files}
          projectPath={project.path}
          onShowInstance={(hit) => {
            setDeleteGuard(null);
            onJumpToItem?.(hit.collectionRel, hit.itemId);
          }}
          onConfirm={() => {
            deleteGuard.onConfirm();
            setDeleteGuard(null);
          }}
          onCancel={() => setDeleteGuard(null)}
        />
      )}
    </div>
  );
}

// Collection settings — the shape of the data rather than its content.
```

- [ ] **Step 10: Wire navigation state in `App.jsx`**

In `src/App.jsx`, find:

```js
const [cmsSettings, setCmsSettings] = useState(false); // editing that collection's fields
```

Add directly after it:

```js
const [cmsJump, setCmsJump] = useState(null); // { rel, itemId } — CmsView selects it once, then clears it
```

Find the `<CmsView ... />` render block:

```jsx
          {cmsRel && (
            <CmsView
              project={project}
              rel={cmsRel}
              hidden={leftTab !== 'cms'}
              settings={cmsSettings}
              showToast={showToast}
              onSaved={() => setCmsTick((t) => t + 1)}
              onCloseSettings={() => setCmsSettings(false)}
              onDeleted={() => {
                setCmsRel(null);
                setCmsSettings(false);
              }}
              onClose={() => setCmsRel(null)}
            />
          )}
```

Replace with:

```jsx
          {cmsRel && (
            <CmsView
              project={project}
              rel={cmsRel}
              hidden={leftTab !== 'cms'}
              settings={cmsSettings}
              showToast={showToast}
              onSaved={() => setCmsTick((t) => t + 1)}
              onCloseSettings={() => setCmsSettings(false)}
              onDeleted={() => {
                setCmsRel(null);
                setCmsSettings(false);
              }}
              onClose={() => setCmsRel(null)}
              jumpItemId={cmsJump && cmsJump.rel === cmsRel ? cmsJump.itemId : null}
              onJumpHandled={() => setCmsJump(null)}
              onJumpToItem={(jumpRel, itemId) => {
                setCmsSettings(false);
                setLeftTab('cms');
                setCmsRel(jumpRel);
                setCmsJump({ rel: jumpRel, itemId });
              }}
            />
          )}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: PASS.

- [ ] **Step 12: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS. `App.test.jsx` never touches the CMS panel, so it's unaffected by the new `cmsJump` state and props.

- [ ] **Step 13: Commit**

```bash
git add src/panels/CmsDeleteGuard.jsx src/panels/CmsView.jsx src/App.jsx src/styles.css src/panels/CmsView.test.jsx
git commit -m "feat: block deleting a referenced CMS item until its references are resolved"
```

---

## Task 7: Blocked collection delete

Reuses `CmsDeleteGuard` and `loadDeleteGuard` from Task 6 for the collection-level delete, sitting above the existing (non-blocking) "N Astro pages import this" note.

**Files:**
- Modify: `src/panels/CmsView.jsx`
- Test: `src/panels/CmsView.test.jsx`

**Interfaces:**
- Consumes: `loadDeleteGuard` (Task 6), `CmsDeleteGuard` (Task 6), the `collections` state already fetched in `CmsSettings` (Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/CmsView.test.jsx`:

```jsx
describe('deleting a collection whose items are referenced elsewhere', () => {
  it('blocks the delete until the reference is resolved', async () => {
    mockAvb({
      files: {
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
        'data/posts.json': [{ title: 'Hello', author: 'a1' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/authors.json" settings showToast={vi.fn()} />);

    fireEvent.click(await screen.findByText('Delete Authors'));
    expect(await screen.findByText('Items in this collection are referenced elsewhere')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('falls back to the plain confirm when nothing references it', async () => {
    mockAvb({ files: { 'data/authors.json': [{ name: 'Ada' }] } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <CmsView project={project} rel="data/authors.json" settings showToast={vi.fn()} onDeleted={vi.fn()} />
    );
    fireEvent.click(await screen.findByText('Delete Authors'));
    await waitFor(() => expect(window.avb.deleteCms).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: FAIL — deleting a collection still goes straight to the usage-informational confirm.

- [ ] **Step 3: Wire the guard into `CmsSettings`**

Find `CmsSettings`'s prop list (already modified in Task 4):

```js
function CmsSettings({
  collection,
  items,
  declared,
  saved,
  project,
  showToast,
  onDeleted,
  onAddField,
  onRenameField,
  onRemoveField,
  onReorderFields,
  onDone,
}) {
  const [collections, setCollections] = useState([]);
```

Replace with:

```js
function CmsSettings({
  collection,
  items,
  declared,
  saved,
  project,
  showToast,
  onDeleted,
  onAddField,
  onRenameField,
  onRemoveField,
  onReorderFields,
  onJumpToItem,
  onDone,
}) {
  const [collections, setCollections] = useState([]);
  const [deleteGuard, setDeleteGuard] = useState(null);
```

Find the danger card's delete button:

```jsx
        <div className="cms-card cms-danger">
          <h3>Delete collection</h3>
          <p className="cms-note">
            Moves src/{collection.rel} to the Trash. Pages that import it keep working — they
            switch to an empty list.
          </p>
          <button className="ghost danger" onClick={() => deleteCollection(collection, project, showToast, onDeleted)}>
            <TrashIcon size={12} /> Delete {collection.label}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Replace with:

```jsx
        <div className="cms-card cms-danger">
          <h3>Delete collection</h3>
          <p className="cms-note">
            Moves src/{collection.rel} to the Trash. Pages that import it keep working — they
            switch to an empty list.
          </p>
          <button
            className="ghost danger"
            onClick={async () => {
              const targetIds = items.filter(isPlainObject).map((it) => it._id).filter(Boolean);
              const { hits, files } = targetIds.length
                ? await loadDeleteGuard(project.path, collection.rel, targetIds)
                : { hits: [], files: [] };
              if (hits.length) {
                setDeleteGuard({ hits, files });
                return;
              }
              deleteCollection(collection, project, showToast, onDeleted);
            }}
          >
            <TrashIcon size={12} /> Delete {collection.label}
          </button>
        </div>
      </div>

      {deleteGuard && (
        <CmsDeleteGuard
          title="Items in this collection are referenced elsewhere"
          message="Resolve every reference below before deleting the collection — repoint it by hand, or remove the reference on the spot."
          hits={deleteGuard.hits}
          files={deleteGuard.files}
          projectPath={project.path}
          onShowInstance={(hit) => {
            setDeleteGuard(null);
            onJumpToItem?.(hit.collectionRel, hit.itemId);
          }}
          onConfirm={() => {
            setDeleteGuard(null);
            deleteCollection(collection, project, showToast, onDeleted);
          }}
          onCancel={() => setDeleteGuard(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Pass `onJumpToItem` into `CmsSettings`**

Find where `CmsView` renders `<CmsSettings ... />` (in the `if (settings) return (...)` branch):

```jsx
        <CmsSettings
          collection={collection}
          items={items}
          declared={declared}
          saved={saved}
          project={project}
          showToast={showToast}
          onDeleted={onDeleted}
          onAddField={addFieldAt}
          onRenameField={renameFieldAt}
          onRemoveField={removeFieldAt}
          onReorderFields={reorderFieldsAt}
          onDone={onCloseSettings}
        />
```

Replace with:

```jsx
        <CmsSettings
          collection={collection}
          items={items}
          declared={declared}
          saved={saved}
          project={project}
          showToast={showToast}
          onDeleted={onDeleted}
          onAddField={addFieldAt}
          onRenameField={renameFieldAt}
          onRemoveField={removeFieldAt}
          onReorderFields={reorderFieldsAt}
          onJumpToItem={onJumpToItem}
          onDone={onCloseSettings}
        />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/panels/CmsView.test.jsx`
Expected: PASS.

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/panels/CmsView.jsx src/panels/CmsView.test.jsx
git commit -m "feat: block deleting a CMS collection until incoming references are resolved"
```

---

## Manual verification (after Task 7)

Automated tests cover the logic; do one pass in the running app to confirm the feel matches the spec:

1. `npm run dev`, open a project, go to the CMS tab.
2. Create two collections (e.g. "Authors" and "Posts"), add a couple of items to each.
3. In Posts' settings, add a Reference field targeting Authors, and a Multi-reference field targeting Authors (or a third collection).
4. On a Post item, set the Reference and add a few Multi-reference chips; confirm the picker search works and chips show real titles.
5. Delete the Author item a Post currently references — confirm the blocked-delete dialog appears, "Show instance" jumps to that Post, "Remove anyway" clears it and enables Delete.
6. Try deleting the whole Authors collection while a Post still references one of its items — confirm the same guard appears there too, alongside the existing "N pages import this" note.
7. Delete an item/collection nothing references — confirm the plain, un-blocked confirm still appears exactly as before.
