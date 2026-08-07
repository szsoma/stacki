# CMS Reference & Multi-reference Fields Design

**Date:** 2026-08-07
**Status:** Approved for implementation planning

## Goal

Stacki's CMS (`src/cmsSchema.js`, `src/panels/CmsPanel.jsx`, `src/panels/CmsView.jsx`,
`electron/main.js`'s `cms:*` handlers) treats every `.json` file under `src/` as
a schema-inferred collection with typed fields (text, number, image, date,
link, email, phone, color, list, object, objects/repeater). There is no way
for one collection to point at items in another, the way Webflow's CMS
supports Reference (single link) and Multi-reference (many links) fields.

This adds those two field types: a way for an item in one collection to link
to one or many items in another (or the same) collection, edited with a
searchable picker, and safely guarded on deletion so a link can't silently go
stale without the user being told.

## Scope

In scope: the two new field types, the identity system they need, the picker
UI, and the delete-guard flow for both single items and whole collections.

Out of scope (YAGNI for this version): resolving references inside the
developer's `.astro` code (no generated helper — resolving an id to an item is
ordinary JS the developer already writes, same as any other prop today),
drag-reordering a multi-reference's selected chips, and reference fields
targeting Astro's native `src/content` collections specifically (this system
already treats every `.json` under `src/` uniformly regardless of folder, and
that doesn't change here).

## Data model

### Item identity

Reference fields need something stable to point at. Items are plain JSON
objects today with no id. Every item gets a hidden `_id` — a short random
string — but only lazily: it's assigned the first time the item actually needs
to be linkable (a picker needs to resolve/list items in that collection, or a
reference is set to point at it), not eagerly for every collection in the
project. A collection nobody ever references keeps its current on-disk shape
exactly as it is today.

- `_id` is excluded from `fieldsOf()` — it's never listed as an editable field
  or shown in Collection Settings.
- `_id` is excluded from `titleOf()`'s fallback string search, so it can never
  become an item's displayed title.
- `duplicateItem()` generates a **new** `_id` for the copy. A duplicate must
  not share identity with the item it was copied from.
- Ids are scoped to their own collection's file, not global — a reference
  field's target collection is part of the field's own declared schema, so an
  id alone never needs to encode which file it came from.

### Field types and storage

Two new entries in `FIELD_TYPES` (`src/panels/CmsView.jsx`): **Reference** and
**Multi-reference**. Like every existing type, a field's type is fixed once
created — it's declared, not inferred, so retyping it would mean rewriting
every item's value with no way to recover the original shape.

- **Reference** stores a single `_id` string on the item (empty string when
  unset): `item.author = "a1b2c3d4"`.
- **Multi-reference** stores an array of `_id` strings: `item.contributors =
  ["a1b2c3d4", "f9e8d7c6"]`.
- The **target collection** is part of the field's declared config in
  `.stacki/cms.json`, not part of the item data. Today a declared entry is a
  bare type string (`{ "author": "text" }`). A declared value becomes either a
  string (unchanged, for every existing type) or an object
  `{ "type": "reference" | "multiReference", "collection": "<rel of target
  file>" }`.
- Reference/multi-reference types can never be inferred from raw data alone —
  a lone id string looks like plain text, an id array looks like a `list`.
  They exist purely because they were declared, the same way `phone` already
  has to be declared over inference's default guess of `text`.
  `withDeclaredTypes()` and `bestType()` in `CmsView.jsx` must let a declared
  `reference`/`multiReference` win outright over the inferred shape, the same
  way `image`/`date` already override structural inference today (currently
  `STRUCTURAL` would let an array's inferred `list` beat a declared
  `multiReference` — that has to be special-cased alongside the existing
  `image`/`date` overrides).
- Self-referencing collections are allowed — a collection can declare a
  reference field that targets itself (e.g. Posts having a "Related posts"
  field pointing back at Posts).
- Reference fields can be added at any nesting level `FieldSchema` already
  supports (top-level item, inside a Group, inside Repeating items) — no
  special restriction beyond what other field types already allow.

## Creating a reference field

`NewFieldDialog`'s flow today is: pick a type from the grid → name it → done.
Reference types insert one step in the middle:

1. Pick **Reference** or **Multi-reference** from the type grid (two new
   tiles, link/chain icon).
2. **Pick the target collection** — the project's collections (fetched the
   same way `CmsPanel` already does, via `listCms` + `collectionOf`), shown as
   a list with label and item count. The current collection is included (self
   -reference).
3. Name the field, same as today.

If the project has no other collections yet, the type tiles are still
clickable but the collection-picker step shows "No other collections yet"
with a way to go back — there's nothing to link to until a second collection
exists.

## Editing a reference value

`FieldControl` gets two new branches, both needing the *live* target
collection's items to resolve id → title:

- **Reference**: a searchable combobox. Closed state shows the picked item's
  title (via `titleOf`) as a pill with a clear (×) button. Opening it shows a
  search box and the target collection's items; picking one sets the id and
  closes the picker. If the stored id doesn't match any current item, the
  pill reads **"Missing item"** in a warning style and is still clearable.
- **Multi-reference**: the same search/list picker, but picking adds to an
  array instead of replacing, and already-picked items are excluded from the
  pickable list. Selected items render as a row of chips (title + × to
  remove), in pick order. No drag-reorder in this version.

To resolve titles, `CmsView` loads a target collection's items on demand
(existing `readCms` IPC) whenever a reference/multi-reference field is
present, and threads a small `resolveCollection(rel)` lookup down through
`FieldRow` → `FieldControl`, the same way `projectPath` is already threaded
through `GroupEditor`, `RepeaterEditor`, and `NestedItemDialog`. The picker
re-fetches its target collection each time it opens, so it reflects items
added moments earlier.

## Blocked deletes — referencing items must be resolved first

Applies to deleting a single item (`removeItem` in `CmsView.jsx`) and to
deleting a whole collection (`deleteCollection`).

**Detection**: a reference index built from data already loaded in memory —
every collection's declared fields (`.stacki/cms.json`, read in full via the
existing `cms:meta` handler which already returns every collection's
declarations at once) identifies which fields are `reference`/`multiReference`
and which collection they target. Scanning those collections' items (at the
field's declared nesting path, via the existing `objectsAt`) for the id(s)
about to disappear produces the list of "referencing items." This is pure data
already available to the renderer — no new IPC needed, implemented as a pure
function in `cmsSchema.js` alongside `objectsAt`/`fieldsAt`.

**If nothing references the item/collection**: unchanged from today — the
existing plain `window.confirm` (item delete) or the existing informational
confirm dialog (collection delete, still showing "N Astro pages import this")
goes through as before.

**If something does reference it**: instead of the plain confirm, a dialog
lists every referencing item — collection label, item title, field name. Each
row, only on hover, reveals two icon buttons:

- **Show instance** — closes the dialog and navigates the app straight to
  that item (switches the open collection and selects that item), so the
  user can inspect it or repoint the reference by hand. Implemented via a new
  App-level jump: `App.jsx` already lifts `cmsRel`/`cmsSettings` as state, so
  this adds a "focus this item" instruction (collection rel + item `_id`)
  that `CmsView` consumes on load to select the right item by id rather than
  by index (index isn't stable across collections/time).
- **Remove anyway** — clears just that one reference (unsets it for a
  Reference field, drops just this id for a Multi-reference field), writes it
  immediately through the normal collection-write path, and the row
  disappears from the list right away.

The dialog's **Delete** button stays disabled while the list is non-empty.
Once every row is gone — via "Remove anyway" or because the user manually
repointed it elsewhere and it dropped off on re-check — Delete becomes
clickable. It still isn't automatic; the user presses it explicitly.

For a collection delete, this blocking list sits above the existing
non-blocking "N Astro pages import this" note, which continues to not gate
anything (that path already degrades gracefully to an empty array on delete).

## Testing

- `cmsSchema.js`: unit tests for `_id` assignment/exclusion from
  `fieldsOf`/`titleOf`, `duplicateItem` generating a fresh id, and the new
  reference-index function (finds a referencing item across collections, at a
  nested path, and correctly finds nothing once cleared).
- `CmsView.jsx`: tests for the type-declaration precedence
  (`withDeclaredTypes`/`bestType` letting reference/multiReference win over
  structural inference), the field-creation collection-picker step, the
  reference/multi-reference pickers (select, clear, missing-item state), and
  the blocked-delete dialog (button disabled/enabled transitions, "Remove
  anyway" delisting a row, "Show instance" navigation).
