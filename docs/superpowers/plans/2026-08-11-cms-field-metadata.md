# CMS Field Metadata — Required & Description

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let CMS users mark fields as required and add descriptions, persisted in `.stacki/cms.json`, with UI in the schema editor and advisory validation on item save.

**Architecture:** The existing `.stacki/cms.json` metadata file stores per-collection field overrides. A plain string like `"phone": "phone"` is a type-override only. This plan extends the same entries to carry `required` (boolean) and `description` (string or null). The `withDeclaredTypes()` function in `CmsView.jsx` already reads metadata — it's extended to merge these new properties. The schema editor (`FieldSchema` component) gains a required checkbox and description text field per field row. The item editor shows a warning inline when a required field is empty on save.

**Tech Stack:** Plain JS/JSX (the CMS code is JS, not TS), no new dependencies.

---

## Global Constraints

- **Backwards compatibility**: A metadata value of `"phone"` (plain string) must still work. The read path handles both shapes.
- **No IPC changes**: `cms:meta` and `cms:setMeta` already read/write `.stacki/cms.json`.
- **`_id` exclusion**: The `_id` field is never shown, never in `fieldsOf`, never in metadata.
- **Nested fields**: Dotted paths like `profile.bio` work identically.
- **Required validation is advisory**: Flag empty required fields with an inline warning, but never block the save.

---

### Task 1: Extend `withDeclaredTypes()` to merge `required` + `description`

**Files:**
- Modify: `src/panels/CmsView.jsx:886-897`

The function currently only reads `type` and `collection` from metadata entries.

- [ ] **Step 1: Replace `withDeclaredTypes()`**

In `src/panels/CmsView.jsx`, replace lines 886-897 (the `withDeclaredTypes` function and its companion `STRUCTURAL` constant) with:

```jsx
const STRUCTURAL = /* existing, keep */ ['object', 'objects', 'list', 'boolean', 'number'];

function withDeclaredTypes(fields, declared, path) {
  if (!declared) return fields.map((f) => ({ ...f, required: false, description: null }));
  return fields.map((field) => {
    const dotted = [...path, field.key].join('.');
    const entry = declared[dotted];
    if (!entry) return { ...field, required: false, description: null };

    const entryObj = typeof entry === 'object' ? entry : { type: entry };
    const chosenType = entryObj.type || field.type;
    const forces = chosenType === 'reference' || chosenType === 'multiReference';
    const type = (!forces && STRUCTURAL.includes(field.type)) ? field.type : chosenType;
    const refCollection = entryObj.collection || undefined;
    const required = entryObj.required === true;
    const description = entryObj.description || null;

    return { ...field, type, refCollection, required, description };
  });
}
```

- [ ] **Step 2: Verify existing behavior by running tests**

Run: `npx vitest run --reporter=verbose`
Expected: All existing tests pass (withDeclaredTypes now adds `required: false, description: null` to every field, but no code reads those yet).

- [ ] **Step 3: Commit**

```bash
git add src/panels/CmsView.jsx
git commit -m "feat(cms): extend withDeclaredTypes() to merge required and description from metadata"
```

---

### Task 2: Add metadata mutation callbacks to CmsView

**Files:**
- Modify: `src/panels/CmsView.jsx` (CmsView component and CmsSettings props)

- [ ] **Step 1: Add `toggleRequired` and `setDescription` callbacks in CmsView**

In `CmsView` (the component starting at line 96), insert these two functions after `saveDeclared` (after line 325):

```jsx
const toggleRequired = (path, key, value) => {
  const dotted = [...path, key].join('.');
  const existing = declared[dotted];
  const entry = existing
    ? (typeof existing === 'object' ? existing : { type: existing })
    : { type: fieldsAt(items, path).find((f) => f.key === key)?.type || 'text' };
  saveDeclared({ ...declared, [dotted]: { ...entry, required: value } });
};

const setDescription = (path, key, description) => {
  const dotted = [...path, key].join('.');
  const existing = declared[dotted];
  const entry = existing
    ? (typeof existing === 'object' ? existing : { type: existing })
    : { type: fieldsAt(items, path).find((f) => f.key === key)?.type || 'text' };
  saveDeclared({
    ...declared,
    [dotted]: { ...entry, description: description || null },
  });
};
```

- [ ] **Step 2: Pass new callbacks to `<CmsSettings>`**

In the `settings` branch render block (line 372-392), add the two new props to `<CmsSettings>`:

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
  onToggleRequired={toggleRequired}
  onSetDescription={setDescription}
/>
```

- [ ] **Step 3: Accept new props in `CmsSettings`**

Find the `CmsSettings` function (starts around line 597). Add `onToggleRequired` and `onSetDescription` to the destructured props:

```jsx
function CmsSettings({
  // ... existing props ...
  onToggleRequired,
  onSetDescription,
}) {
```

- [ ] **Step 4: Thread new callbacks into `FieldSchema` via ops**

Inside `CmsSettings`, build the `ops` object that gets spread into `FieldSchema`. Find where `ops` is constructed (it's spread inline in the `<FieldSchema ... {...ops} />` call around line 650). The callbacks like `onAddField`, `onRenameField` etc. are already passed to `FieldSchema` via a spread:

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
  onToggleRequired={onToggleRequired}
  onSetDescription={onSetDescription}
/>
```

(If the code uses a spread of an `ops` object, add the props there instead.)

Also update the nested `FieldSchema` call (around line 858 inside the recursive FieldSchema render) to pass through `onToggleRequired` and `onSetDescription`.

- [ ] **Step 5: Commit**

```bash
git add src/panels/CmsView.jsx
git commit -m "feat(cms): add toggleRequired and setDescription callbacks to metadata pipeline"
```

---

### Task 3: Add required toggle + description input to the schema editor

**Files:**
- Modify: `src/panels/CmsView.jsx` (FieldSchema component, ~lines 737-878)

- [ ] **Step 1: Update FieldSchema to receive new callbacks**

In the `FieldSchema` function signature (line 737), add `onToggleRequired` and `onSetDescription` to the rest parameters. Currently it uses `...ops`:

No change needed if the callbacks are in `...ops`.

- [ ] **Step 2: Add description-visibility state**

In `FieldSchema`, add state for which field's description input is focused:

```jsx
// At line ~740, inside FieldSchema but after existing state declarations:
const [descFocus, setDescFocus] = useState(null); // dotted path of field with description input open
```

- [ ] **Step 3: Update the field-row JSX**

Find the field row rendering inside `FieldSchema` (the `.cms-schema-field` divs inside the `fields.map(...)` loop, roughly lines 795-868). Each field row currently shows:
- Drag handle
- Editable key label (inline `<input>` that calls `ops.onRenameField`)
- Type badge (read-only, `<span className="cms-schema-type">`)
- Delete button

Update each field row to include the required toggle and description input. The new structure for each field row (replace the content between the drag icon and delete button):

```jsx
<div className="cms-schema-field-info">
  <div className="cms-schema-field-row">
    {!path.length ? (
      <span draggable ...><DragIcon ... /></span>
    ) : null}
    <span className="cms-schema-key">
      {field.key !== info.value ? <span className="cms-schema-key-match">{field.key}</span> : field.key}
    </span>
    <span className="cms-schema-type" title="A field's type is set when it's created">
      <Icon size={13} />
      {info.label}
    </span>
    <label className="cms-schema-required" title="Warn when empty on save">
      <input
        type="checkbox"
        checked={field.required || false}
        onChange={() => ops.onToggleRequired(path, field.key, !field.required)}
      />
      Required
    </label>
  </div>
  {field.description || descFocus === dotted ? (
    <div className="cms-schema-description">
      <input
        type="text"
        value={field.description || ''}
        placeholder="Help text shown when editing"
        onFocus={() => setDescFocus(dotted)}
        onBlur={() => { if (!field.description) setDescFocus(null); }}
        onChange={(e) => ops.onSetDescription(path, field.key, e.target.value)}
      />
    </div>
  ) : (
    <button
      className="ghost cms-schema-add-desc"
      onClick={() => setDescFocus(dotted)}
    >
      + Add description
    </button>
  )}
</div>
```

The `dotted` variable needs to be computed for each field: `const dotted = [...path, field.key].join('.');`

- [ ] **Step 4: Pass new callbacks through nested FieldSchema calls**

Find the nested `<FieldSchema .../>` call inside the filed render loop (around line 858, for nested object/objects types). Ensure `onToggleRequired` and `onSetDescription` are spread into it.

- [ ] **Step 5: Commit**

```bash
git add src/panels/CmsView.jsx
git commit -m "feat(cms): add required toggle and description input to schema editor UI"
```

---

### Task 4: Show required-field warnings in the item editor

**Files:**
- Modify: `src/panels/CmsView.jsx` (the item-detail view, ~lines 535-545)

- [ ] **Step 1: Compute which fields are empty-but-required**

In the item detail render block (lines 535-545), after the `fields.map(...)` call, add a check for empty required fields. Wrap the `fields.map` with a `useMemo` or compute inline:

In the render block where `fields` is mapped to `<FieldRow>` components (lines 538-545), add a warning banner when there are empty required fields:

```jsx
{item && isPlainObject(item) && (() => {
  const emptyRequired = fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = item[f.key];
      return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    })
    .map((f) => f.label);

  return (
    <div className="cms-card">
      <h3>{single ? collection.label : 'Basic info'}</h3>
      {emptyRequired.length > 0 && (
        <div className="cms-required-warning">
          Missing required {emptyRequired.length === 1 ? 'field' : 'fields'}:{' '}
          {emptyRequired.join(', ')}
        </div>
      )}
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          label={field.label}
          type={item[field.key] === undefined ? field.type : bestType(field.type, item[field.key])}
          value={item[field.key]}
          onChange={(v) => setItemValue(field.key, v)}
          projectPath={project.path}
          refCollection={field.refCollection}
          declared={declared}
          path={[field.key]}
          resolveCollection={resolveCollection}
        />
      ))}
    </div>
  );
})()}
```

- [ ] **Step 2: Add CSS for the warning and schema controls**

Add to `src/styles.css` (at the end of the CMS section):

```css
.cms-schema-required {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  cursor: default;
  user-select: none;
}
.cms-schema-required input[type="checkbox"] {
  margin: 0;
  accent-color: var(--accent);
}
.cms-schema-description {
  padding-left: 20px;
}
.cms-schema-description-input {
  width: 100%;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface-input);
  color: var(--text);
}
.cms-schema-description-input::placeholder {
  color: var(--text-muted);
  font-style: italic;
}
.cms-schema-add-desc {
  font-size: 11px;
  padding: 2px 8px;
  margin-left: 20px;
}
.cms-required-warning {
  background: var(--surface-warning);
  border-left: 3px solid var(--warning);
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text);
  border-radius: 4px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/panels/CmsView.jsx src/styles.css
git commit -m "feat(cms): show required-field warnings in item editor"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All existing tests pass.

- [ ] **Step 2: Manual verification checklist**

1. Open a CMS collection with some fields
2. Go to Settings
3. Toggle "Required" on a field — verify the `.stacki/cms.json` file is updated
4. Type a description — verify it persists in `.stacki/cms.json`
5. Go back to item editing — clear a required field, verify the warning banner appears
6. Re-open the CMS settings — verify required/description survive a reload

- [ ] **Step 3: Commit any final fixes**

```bash
git add -u
git commit -m "chore(cms): finalize field metadata feature"
```
