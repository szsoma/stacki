# Selected Element Terminal Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading automatic Preview element chip with one automatically refreshed Selected element chip that sends the exact selected node markup and its owning-component metadata to the Terminal.

**Architecture:** Keep `selectedElementResolver` as the only resolver for an exact canvas selection. `ContextChipBar` will reuse its existing Terminal-only auto-chip effect but target `selected-element`; `useTerminalContext` will reject superseded asynchronous resolutions so rapid selections cannot restore old markup. Remove the uncommitted Preview element resolver/type/ranking additions and update the tracked feature documentation.

**Tech Stack:** React 18, Zustand-backed editor context, Vitest 3, Testing Library, Electron context bridge, JavaScript/checkJs.

---

## Workspace constraints

- Execute in the current checkout. The Preview element implementation exists as overlapping uncommitted changes, including the untracked `src/context/previewElementResolver.js`; a clean worktree would not contain the code being replaced.
- Preserve unrelated changes in `package.json`, `package-lock.json`, App/history/layout tests, StructurePanel, store files, styles, CodeEditor, and Icons.
- Keep the existing `active` prop flow from `TerminalPanel` to `ContextChipBar`; it is required for Terminal-only automatic context.
- Do not stage the two pre-existing untracked implementation plans. Stage only the exact files named in each commit step and inspect the staged diff before committing.

## File map

- Modify `src/context/useTerminalContext.js`: ignore superseded async chip resolutions.
- Modify `src/context/useTerminalContext.test.js`: prove the newest refresh result wins when promises resolve out of order.
- Modify `src/panels/ContextChipBar.jsx`: remove Preview element registration and auto-add/refresh `selected-element` while active.
- Modify `src/panels/ContextChipBar.test.jsx`: cover exact paragraph context, single-chip refresh, and inactive Terminal behavior.
- Keep/commit `src/panels/TerminalPanel.jsx`: retain the already-added `active={active}` prop passed to `ContextChipBar`.
- Restore `src/context/contextTypes.js`: remove the uncommitted `PREVIEW_ELEMENT` constant.
- Modify `src/context/contextTypes.test.js`: explicitly guard that the retired type is absent.
- Restore `src/context/suggestedContext.js`: remove Preview element priority and section entries.
- Delete `src/context/previewElementResolver.js`: remove the untracked owner-file resolver.
- Modify `docs/superpowers/specs/2026-08-12-terminal-preview-selection-fix-design.md`: rename the automatic chip in the earlier tracked design.

### Task 1: Make asynchronous chip refresh latest-wins

**Files:**

- Modify: `src/context/useTerminalContext.test.js`
- Modify: `src/context/useTerminalContext.js`

- [ ] **Step 1: Write the failing out-of-order resolution test**

Add this test after `re-resolves a chip on refresh` in `src/context/useTerminalContext.test.js`:

```js
it('ignores an older resolve that finishes after a newer refresh', async () => {
  const first = deferred();
  const second = deferred();
  const resolve = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  registerResolver(fakeResolver({ resolve }));

  const { result } = renderHook(() =>
    useTerminalContext({ currentFile: null, projectPath: null }),
  );

  let id;
  act(() => {
    id = result.current.addChip('fake-a');
  });
  act(() => {
    result.current.refreshChip(id);
  });

  await act(async () => {
    second.resolve({
      data: { value: 'new selection' },
      estimatedCharacters: 13,
      sourceRevision: 'r2',
    });
    await second.promise;
  });
  expect(result.current.chips[0].data).toEqual({ value: 'new selection' });

  await act(async () => {
    first.resolve({
      data: { value: 'old selection' },
      estimatedCharacters: 13,
      sourceRevision: 'r1',
    });
    await first.promise;
  });

  expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY);
  expect(result.current.chips[0].data).toEqual({ value: 'new selection' });
  expect(result.current.chips[0].sourceRevision).toBe('r2');
});
```

- [ ] **Step 2: Run the test and verify the stale result wins before the fix**

Run:

```bash
rtk npm test -- --run src/context/useTerminalContext.test.js
```

Expected: FAIL in `ignores an older resolve that finishes after a newer refresh`; the final data is `{ value: 'old selection' }`.

- [ ] **Step 3: Add a per-chip resolve generation guard**

In `useTerminalContext`, add a ref beside `appStateRef` and guard both success and error completion:

```js
const appStateRef = useRef(appState);
const resolveGenerationRef = useRef(new Map());
appStateRef.current = appState;

const resolveChip = useCallback(async (id, type, options) => {
  const generation = (resolveGenerationRef.current.get(id) || 0) + 1;
  resolveGenerationRef.current.set(id, generation);
  const resolver = getResolver(type);
  try {
    const state = appStateRef.current;
    const result = await resolver.resolve(state, options);
    if (resolveGenerationRef.current.get(id) !== generation) return;
    const staleKey = resolver.computeStaleKey ? resolver.computeStaleKey(state) : null;
    setChips((current) =>
      current.map((chip) =>
        chip.id === id ? { ...withReady(chip, result), staleKey } : chip,
      ),
    );
  } catch (error) {
    if (resolveGenerationRef.current.get(id) !== generation) return;
    setChips((current) =>
      current.map((chip) => (chip.id === id ? withError(chip, error) : chip)),
    );
  }
}, []);
```

Also clear the generation when a chip is removed:

```js
const removeChip = useCallback((id) => {
  resolveGenerationRef.current.delete(id);
  setChips((current) => current.filter((chip) => chip.id !== id));
}, []);
```

- [ ] **Step 4: Run the hook tests**

Run:

```bash
rtk npm test -- --run src/context/useTerminalContext.test.js
```

Expected: all `useTerminalContext` tests PASS, including the out-of-order regression.

- [ ] **Step 5: Commit the latest-wins guard**

```bash
rtk git add -- src/context/useTerminalContext.js src/context/useTerminalContext.test.js
rtk git diff --cached --check
rtk git commit -m "fix: keep latest terminal context resolution"
```

### Task 2: Auto-attach the exact selected element

**Files:**

- Modify: `src/panels/ContextChipBar.test.jsx`
- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/panels/TerminalPanel.jsx`

- [ ] **Step 1: Add a paragraph fixture helper to the chip-bar test**

Add this helper below the `beforeEach` block in `src/panels/ContextChipBar.test.jsx`:

```js
function selectedParagraphContext(id, text) {
  const selectedNode = {
    id,
    kind: 'element',
    name: 'p',
    props: {},
    children: [{ id: `${id}-text`, kind: 'text', value: text, children: null }],
  };
  return {
    selectedNode,
    nodeTree: [
      {
        id: 'section',
        kind: 'component',
        name: 'Section',
        props: {},
        children: [selectedNode],
      },
    ],
    componentDefinitions: [
      { name: 'Section', path: '/projects/site/src/components/Section.astro' },
    ],
  };
}
```

- [ ] **Step 2: Write the failing automatic Selected element tests**

Add these tests to the `ContextChipBar` describe block:

```jsx
it('auto-adds the exact selected paragraph context while Terminal is active', async () => {
  const editorContext = selectedParagraphContext('intro', 'Selected paragraph text');
  window.avb.serializeNode.mockResolvedValue({
    markup: '<p>Selected paragraph text</p>',
  });

  render(
    <ContextChipBar
      active
      currentFile={null}
      projectPath="/projects/site"
      editorContext={editorContext}
    />,
  );

  await waitFor(() => {
    expect(window.avb.serializeNode).toHaveBeenCalledWith({
      node: editorContext.selectedNode,
    });
  });
  await waitFor(() => {
    expect(document.querySelector('.context-chip.ready')).not.toBeNull();
  });
  expect(document.querySelectorAll('.context-chip-wrap')).toHaveLength(1);
  expect(screen.getByText('Selected element')).toBeInTheDocument();
  expect(screen.queryByText('Preview element')).not.toBeInTheDocument();
  expect(window.avb.readContextFile).not.toHaveBeenCalled();

  fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), {
    target: { value: 'Rewrite this paragraph.' },
  });
  const listener = vi.fn();
  window.addEventListener('stacki:terminal-menu', listener);
  fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));

  expect(listener).toHaveBeenCalledTimes(1);
  const inserted = listener.mock.calls[0][0].detail.text;
  expect(inserted).toContain('<p>Selected paragraph text</p>');
  expect(inserted).toContain('Owner component: Section (`src/components/Section.astro`)');
  expect(inserted).not.toContain('content of src/components/Section.astro');
  window.removeEventListener('stacki:terminal-menu', listener);
});

it('refreshes one Selected element chip when the selection changes', async () => {
  const first = selectedParagraphContext('first', 'First paragraph');
  const second = selectedParagraphContext('second', 'Second paragraph');
  window.avb.serializeNode.mockImplementation(async ({ node }) => ({
    markup: `<p>${node.children[0].value}</p>`,
  }));

  const view = render(
    <ContextChipBar
      active
      currentFile={null}
      projectPath="/projects/site"
      editorContext={first}
    />,
  );
  await waitFor(() => expect(window.avb.serializeNode).toHaveBeenCalledTimes(1));

  view.rerender(
    <ContextChipBar
      active
      currentFile={null}
      projectPath="/projects/site"
      editorContext={second}
    />,
  );
  await waitFor(() => {
    expect(window.avb.serializeNode).toHaveBeenLastCalledWith({ node: second.selectedNode });
  });

  expect(document.querySelectorAll('.context-chip-wrap')).toHaveLength(1);
  fireEvent.click(screen.getByText('Selected element'));
  expect(await screen.findByText(/<p>Second paragraph<\/p>/)).toBeInTheDocument();
  expect(screen.queryByText(/<p>First paragraph<\/p>/)).not.toBeInTheDocument();
});

it('does not auto-add selected context while Terminal is inactive', async () => {
  const editorContext = selectedParagraphContext('intro', 'Selected paragraph text');
  render(
    <ContextChipBar
      active={false}
      currentFile={null}
      projectPath="/projects/site"
      editorContext={editorContext}
    />,
  );

  await Promise.resolve();
  expect(document.querySelectorAll('.context-chip-wrap')).toHaveLength(0);
  expect(window.avb.serializeNode).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the chip-bar tests and verify the new assertions fail**

Run:

```bash
rtk npm test -- --run src/panels/ContextChipBar.test.jsx
```

Expected: the active tests FAIL because the bar currently creates `preview-element`; the inactive test should already PASS.

- [ ] **Step 4: Switch the automatic effect to Selected element**

In `src/panels/ContextChipBar.jsx`:

1. Remove `useRef` from the React import.
2. Remove the `previewElementResolver` import and `registerResolver(previewElementResolver)` call.
3. Remove `autoChipRef` because its value is never read.
4. Replace the effect with:

```js
useEffect(() => {
  const selectedNode = appState.selectedNode;
  if (!active || !selectedNode) return;

  const existing = chips.find((chip) => chip.type === 'selected-element');
  if (existing) {
    refreshChip(existing.id);
    return;
  }

  addChip('selected-element');
}, [appState.selectedNode, active]);
```

Keep the existing `active = false` prop on `ContextChipBar`, and retain this already-added call site in `src/panels/TerminalPanel.jsx`:

```jsx
<ContextChipBar
  active={active}
  currentFile={currentFile}
  projectPath={projectPath}
  editorContext={editorContext}
  devLog={devLog}
  devUrl={devUrl}
  getPreviewRect={getPreviewRect}
/>
```

- [ ] **Step 5: Run the panel tests**

Run:

```bash
rtk npm test -- --run src/panels/ContextChipBar.test.jsx src/panels/TerminalPanel.test.jsx
```

Expected: both test files PASS. The active test inserts the paragraph markup and owner path; the refresh test shows only the second paragraph in one chip.

- [ ] **Step 6: Inspect and commit only the panel behavior**

```bash
rtk git add -- src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx src/panels/TerminalPanel.jsx
rtk git diff --cached --check
rtk git diff --cached --stat
rtk git commit -m "fix: attach selected element terminal context"
```

Expected staged scope: exactly the three files above. Do not stage unrelated panel/store/style edits.

### Task 3: Retire Preview element metadata and documentation

**Files:**

- Modify: `src/context/contextTypes.test.js`
- Restore: `src/context/contextTypes.js`
- Restore: `src/context/suggestedContext.js`
- Delete: `src/context/previewElementResolver.js`
- Modify: `docs/superpowers/specs/2026-08-12-terminal-preview-selection-fix-design.md`

- [ ] **Step 1: Add a failing retired-type assertion**

In the `exposes every registered chip type` test in `src/context/contextTypes.test.js`, add:

```js
expect(CONTEXT_CHIP_TYPES).not.toHaveProperty('PREVIEW_ELEMENT');
```

- [ ] **Step 2: Run the type test and verify it fails**

Run:

```bash
rtk npm test -- --run src/context/contextTypes.test.js
```

Expected: FAIL because `CONTEXT_CHIP_TYPES.PREVIEW_ELEMENT` still exists.

- [ ] **Step 3: Remove all Preview element implementation metadata**

Make these exact removals:

```js
// src/context/contextTypes.js — remove this property
PREVIEW_ELEMENT: 'preview-element',
```

```js
// src/context/suggestedContext.js — remove both entries
'preview-element': 9,
'preview-element': 'visual',
```

Delete the untracked file `src/context/previewElementResolver.js`. It is the obsolete resolver that reads the owning component's full file. Confirm `ContextChipBar.jsx` no longer imports or registers it after Task 2.

- [ ] **Step 4: Update the earlier tracked design terminology**

In `docs/superpowers/specs/2026-08-12-terminal-preview-selection-fix-design.md`, change only the two product-behavior references:

```md
The Selected element context feature requires the Terminal panel to remain visible while the user clicks elements in the design canvas.
```

```md
- The mounted Terminal context bar receives the new `selectedNode` and adds or refreshes its single Selected element chip.
```

Do not edit or stage the pre-existing untracked plan files; they are outside this implementation commit.

- [ ] **Step 5: Run focused context tests and an absence check**

Run:

```bash
rtk npm test -- --run src/context/contextTypes.test.js src/context/selectedElementResolver.test.js src/context/suggestedContext.test.js src/panels/ContextChipBar.test.jsx
rtk rg -n "preview-element|Preview element|PREVIEW_ELEMENT|previewElementResolver" src
```

Expected: all focused tests PASS, and `rg` exits with no matches under `src`.

- [ ] **Step 6: Commit the retirement guard and tracked documentation update**

```bash
rtk git add -- src/context/contextTypes.js src/context/contextTypes.test.js src/context/suggestedContext.js docs/superpowers/specs/2026-08-12-terminal-preview-selection-fix-design.md
rtk git diff --cached --check
rtk git diff --cached --stat
rtk git commit -m "refactor: retire preview element context"
```

Because `src/context/previewElementResolver.js` was untracked, deleting it produces no staged deletion. Verify it is absent with:

```bash
rtk rg --files src/context | rtk rg '^src/context/previewElementResolver\.js$'
```

Expected: no match.

### Task 4: Verify the complete behavior

**Files:**

- Verify only; no planned source changes.

- [ ] **Step 1: Run all focused context and Terminal tests together**

```bash
rtk npm test -- --run src/context/contextTypes.test.js src/context/contextResolvers.test.js src/context/selectedElementResolver.test.js src/context/suggestedContext.test.js src/context/useTerminalContext.test.js src/panels/ContextChipBar.test.jsx src/panels/TerminalPanel.test.jsx
```

Expected: all listed test files PASS with no unhandled promise rejection.

- [ ] **Step 2: Run repository verification gates**

```bash
rtk npm test
rtk npm run check:electron
rtk npm run typecheck
rtk npm run build
```

Expected:

- Full Vitest suite: PASS.
- Electron syntax checks: PASS.
- Production build: PASS, allowing only the repository's known large-chunk warning.
- Typecheck: record the exact result. If it still fails only in pre-existing unrelated dirty files, report those diagnostics without changing unrelated code; any diagnostic in files touched by this plan must be fixed before completion.

- [ ] **Step 3: Run a source and worktree audit**

```bash
rtk rg -n "preview-element|Preview element|PREVIEW_ELEMENT|previewElementResolver" src
rtk git diff --check
rtk git status --short
```

Expected:

- No retired Preview element references under `src`.
- No whitespace errors.
- Unrelated pre-existing dirty files and untracked plans remain untouched.

- [ ] **Step 4: Verify the workflow in the Electron app**

Run:

```bash
rtk npm run dev
```

Then:

1. Open an Astro project containing a component such as `Section.astro` with slotted paragraph content.
2. Open Terminal in the left rail.
3. Enter the component view and select the paragraph in the preview.
4. Confirm the blue selection outline remains on the paragraph and Terminal stays visible.
5. Confirm exactly one automatic chip appears and its label is `Selected element`.
6. Open the chip details and confirm the Astro block contains the selected `<p>` and its text, while the owner line names `Section` and its project-relative file path.
7. Select a second internal element and confirm the same chip refreshes without adding another chip.
8. Use `Insert into terminal` and confirm the inserted context contains the second element's markup, not the full empty `Section.astro` wrapper.
9. Switch away from Terminal, select another preview element, and confirm no automatic context chip is added in the inactive Terminal.

Expected: the selected DOM/Astro node is the primary context in both page and component view; owner component information is secondary metadata.
