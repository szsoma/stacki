# Terminal Preview Selection Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Terminal panel visible when the user selects an element from the design canvas so the Preview element context chip can refresh.

**Architecture:** Preserve the selection store's existing global `reveal` contract. Make the canvas-to-store adapter in `App.tsx` conditional: canvas clicks request Navigator reveal everywhere except while Terminal is the active left panel. Cover the behavior at the App integration boundary by driving the captured `PreviewPane.onSelectPath` callback and inspecting the captured `TerminalPanel` props.

**Tech Stack:** React 18, Zustand 5, Vitest 3, Testing Library, Electron 33, Vite 6.

**Workspace note:** Execute in the current checkout because the Preview element feature is still an uncommitted dependency here. Preserve all unrelated dirty-tree edits and do not commit without explicit user authorization.

---

### Task 1: Reproduce the Terminal-closing canvas selection

**Files:**
- Modify: `src/App.test.jsx:9-70`
- Test: `src/App.test.jsx`

- [x] **Step 1: Capture the PreviewPane integration props in the existing App harness**

Extend the hoisted harness:

```jsx
const harness = vi.hoisted(() => ({
  menu: new Map(),
  openProject: null,
  terminalPanelProps: null,
  previewPaneProps: null,
}));
```

Replace the current PreviewPane mock with a prop-capturing mock while retaining the design iframe used by the shortcut tests:

```jsx
vi.mock('./panels/PreviewPane.tsx', () => ({
  default: (props) => {
    harness.previewPaneProps = props;
    return (
      <div className="preview-frame-wrap">
        <iframe title="Design preview" />
      </div>
    );
  },
}));
```

Reset `harness.previewPaneProps = null` in both `beforeEach` blocks that already reset the terminal harness.

- [x] **Step 2: Add the failing Terminal-preservation regression test**

Inside `describe('App terminal integration')`, add:

```jsx
it('keeps Terminal visible when an element is selected from the design canvas', async () => {
  const section = {
    id: 'section-1',
    kind: 'element',
    name: 'section',
    props: {},
    children: [],
  };
  window.avb.scanProject.mockResolvedValue({
    pages: [{ path: '/projects/one/src/pages/index.astro', name: 'index.astro', route: '/' }],
    layouts: [],
    components: [],
  });
  window.avb.readPage.mockResolvedValue({
    editable: true,
    model: { imports: [], extraFrontmatter: '', nodes: [section] },
    source: '<section></section>',
  });

  await openProject();
  await waitFor(() => expect(harness.previewPaneProps?.onSelectPath).toEqual(expect.any(Function)));

  fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
  const terminalPanel = screen.getByLabelText('Terminal panel integration');
  expect(terminalPanel.hidden).toBe(false);

  act(() => harness.previewPaneProps.onSelectPath('0'));

  await waitFor(() => {
    expect(harness.terminalPanelProps.editorContext.selectedNode).toMatchObject({ id: 'section-1' });
  });
  expect(terminalPanel.hidden).toBe(false);
});
```

- [x] **Step 3: Run the regression test and verify RED**

Run:

```bash
rtk npx vitest run src/App.test.jsx -t "keeps Terminal visible when an element is selected from the design canvas"
```

Expected: FAIL at `expect(terminalPanel.hidden).toBe(false)` after the canvas selection because `select(..., { reveal: true })` changes `leftTab` to `navigator`.

---

### Task 2: Preserve Terminal at the canvas-selection boundary

**Files:**
- Modify: `src/App.tsx:1925-1928`
- Test: `src/App.test.jsx`

- [x] **Step 1: Make Navigator reveal conditional on the active left tab**

Change only the resolved-node branch in `PreviewPane.onSelectPath`:

```tsx
const n = model && nodeAtPath(model.nodes, p.split('.').map(Number));
if (n) {
  s().select(n.id, { reveal: s().leftTab !== 'terminal' });
}
```

This keeps the global `SelectionSlice.select` behavior intact and prevents the canvas click from replacing an active Terminal panel.

- [x] **Step 2: Run the focused regression test and verify GREEN**

Run:

```bash
rtk npx vitest run src/App.test.jsx -t "keeps Terminal visible when an element is selected from the design canvas"
```

Expected: PASS; the captured Terminal props contain `section-1` and the mounted Terminal panel remains visible.

- [x] **Step 3: Add a non-Terminal reveal regression test**

Add a second integration test using the same page setup. Switch the left rail to Pages before invoking `onSelectPath('0')`, then assert Navigator becomes active and the section row is selected:

```jsx
it('continues revealing Navigator for canvas selections outside Terminal', async () => {
  const section = {
    id: 'section-1',
    kind: 'element',
    name: 'section',
    props: {},
    children: [],
  };
  window.avb.scanProject.mockResolvedValue({
    pages: [{ path: '/projects/one/src/pages/index.astro', name: 'index.astro', route: '/' }],
    layouts: [],
    components: [],
  });
  window.avb.readPage.mockResolvedValue({
    editable: true,
    model: { imports: [], extraFrontmatter: '', nodes: [section] },
    source: '<section></section>',
  });

  await openProject();
  await waitFor(() => expect(harness.previewPaneProps?.onSelectPath).toEqual(expect.any(Function)));
  fireEvent.click(screen.getByRole('button', { name: 'Pages' }));

  act(() => harness.previewPaneProps.onSelectPath('0'));

  await waitFor(() => expect(screen.getByText('section').closest('.structure-node')).toHaveClass('selected'));
  expect(screen.getByRole('button', { name: 'Navigator' })).toHaveAttribute('aria-pressed', 'true');
});
```

- [x] **Step 4: Run all App integration tests**

Run:

```bash
rtk npx vitest run src/App.test.jsx
```

Expected: all tests in `src/App.test.jsx` pass.

---

### Task 3: Verify the complete repository and Electron behavior

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/App.test.jsx`

- [x] **Step 1: Run the focused context and Terminal suite**

Run:

```bash
rtk npx vitest run src/App.test.jsx src/panels/ContextChipBar.test.jsx src/panels/TerminalPanel.test.jsx src/context/useTerminalContext.test.js
```

Expected: all focused tests pass with zero failures.

- [x] **Step 2: Run the full automated gate**

Run each command independently:

```bash
rtk npm test
rtk npm run check:electron
rtk npm run build
rtk git diff --check
```

Expected: Vitest, Electron syntax checks, production build, and whitespace validation pass. The existing Vite large-chunk warning may remain.

- [x] **Step 3: Run the repository typecheck as a diagnostic**

Run:

```bash
rtk npm run typecheck
```

Expected: report the actual result. Do not attribute pre-existing `App.tsx`, i18n, PropsPanel, or StructurePanel errors to this fix unless the new diff introduces them.

- [x] **Step 4: Verify the real Electron workflow**

Launch the development app with remote diagnostics, open a real Astro project, and exercise:

1. Select an element in the canvas with Navigator active and confirm Navigator reveals the row.
2. Open Terminal.
3. Click a different canvas element and confirm Terminal remains visible.
4. Confirm the Preview element chip appears or refreshes to the new selection.

Expected: the Terminal panel stays active across the second click and the selected element reaches `TerminalPanel.editorContext`.

- [x] **Step 5: Review the final diff**

Run:

```bash
rtk git diff -- src/App.tsx src/App.test.jsx
rtk git status --short
```

Expected: only the intended conditional reveal and regression-test changes are attributable to this fix; unrelated user-owned changes remain preserved.
