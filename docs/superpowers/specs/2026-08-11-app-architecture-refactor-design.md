# App Architecture Refactor — Design

**Date:** 2026-08-11
**Status:** Approved, pending implementation plan

## Problem

Three coupled problems in the renderer:

1. **`src/App.jsx` is 2,625 lines.** It holds ~45 `useState`/`useRef` declarations, ~60
   `useCallback` mutation handlers, a hand-rolled undo/redo stack, every `window.avb`
   IPC subscription, ~180 lines of derived-value computation, and a ~350-line JSX
   render — in one component.

2. **Prop drilling.** `PreviewPane` takes 20 props, `PropsPanel` 19, `StructurePanel` 16.
   Most are not state: they are values derived in `App`'s render body from
   `pageState.model` and `selectedId`.

3. **No typechecking anywhere.** There is no `tsconfig.json`. `src/style-panel/` has
   50+ `.tsx` files, but Vite strips their types without checking them — they are
   type-*annotated*, not type-*checked*. `App.jsx` (2,625 lines) and
   `electron/astroParser.js` (807 lines) are plain JS.

## Constraints

These are properties of the current codebase that the design must respect.

- **`electron/` has no build step.** `electron/astroParser.js` is CommonJS, `require`d
  at runtime by `electron/main.js`, listed in `build.asarUnpack`, and read by absolute
  path at `electron/main.js:1964` for injection into the Astro dev server. Converting it
  to `.ts` means introducing a compile pipeline for the main process and changing
  packaging — out of scope.
- **`src/` already compiles TypeScript.** Vite handles `.tsx` today. Renderer files can
  be renamed freely.
- **The test suite is a real safety net, but not over `App.jsx`.** 367 test files pass.
  `src/App.test.jsx` is 363 lines with 6 tests, covering only terminal integration and
  the "current file" context chip. Undo, save debounce, layout change, and paste are
  untested.
- **CI runs on tags only.** `.github/workflows/release.yml` is the sole workflow; there
  is no pull-request check running `npm test`.
- **`.worktrees/` is not excluded from vitest.** A bare `npx vitest run` collects 293
  files and reports 160 failures, all from worktree copies. The working tree has an
  uncommitted `vite.config.mjs` change adding `test.exclude` for `.claude` and
  `.superpowers` but not `.worktrees`.

## Non-goals

- No behavior changes. Any observable difference in the app is a bug, not an improvement.
- No visual or UX changes.
- No changes to `electron/main.js` beyond JSDoc type annotations.
- No packaging, signing, or release-pipeline changes.
- No refactoring of `CmsView.jsx` (1,508 lines) or `PropsPanel.jsx` (1,331 lines)
  internals. They are rewired to the store; their internals stay as they are.

## Architecture

### State layer: Zustand slices

```
src/store/
  index.ts            createAppStore, typed useAppStore, shallow helpers
  projectSlice.ts     project, scan, projectClasses
  documentSlice.ts    currentPage, editStack, pageState, dirty, save scheduling
  historySlice.ts     past, future, pushHistory, undo, redo
  selectionSlice.ts   selectedId, hoverNodeId, revealTick
  previewSlice.ts     devUrl, devStatus, devLog, devDiag, refreshKey, device, inPreview
  uiSlice.ts          leftTab, rightTab, codeWin, insertOpen, busy, toast, assetPick, cms*
  selectors.ts        derived values (see below)
  mutations.ts        pure (model, args) => model edit functions
```

Zustand is chosen over React Context for two reasons specific to this app:

- **Selector subscriptions.** The app hosts a live Astro dev-server iframe and a
  CodeMirror editor. With a single Context, a keystroke in `PropsPanel` re-renders every
  consumer. With selectors, `PreviewPane` re-renders only when preview state changes.
- **Testability outside React.** Slice reducers and `mutations.ts` become plain
  functions, unit-testable with no render harness. This matters because the mutation
  logic is where the bugs live.

### What does *not* go in the store

IPC subscriptions and effects stay in React, extracted into focused hooks:

```
src/hooks/
  useProjectWatcher.ts    window.avb.onFsChanged, onAssetsChanged, onCmsChanged
  useDevServer.ts         startPreview, diagnose, dev-server lifecycle
  useKeyboardShortcuts.ts undo/redo/insert/escape/copy/paste key handling
  useAutoSave.ts          the 300ms debounce + flushSave wiring
```

Zustand stores do not own subscription lifecycles cleanly. Keeping `window.avb.on*`
wiring in hooks preserves React's mount/unmount semantics and keeps the store a pure
state container.

### Derived values become selectors

These are computed in `App.jsx`'s render body today and passed down as props. They are
functions of `(model, selectedId, scan)` and belong in `selectors.ts`:

`model`, `frontmatterCode`, `selectedNode`, `layoutNode`, `currentLayoutName`,
`selectedSchema`, `slotOptions`, `loopContext`, `linkContext`, `sectionIds`, `crumbs`,
`pathFor`, `overlayInfo`, `focusPath`, `codeWinNode`, `codeWinValue`,
`currentFileContext`, `editorContext`, `insertables`.

This is the mechanism by which prop drilling ends. `PreviewPane`'s 20 props are
substantially these; once they are selectors, the component selects what it needs and
the prop list collapses.

### Mutations become pure functions

Today's `mutateModel(fn, immediate, coalesceKey)` performs three steps: `pushHistory` →
`structuredClone` + apply → `scheduleSave`. That structure is correct and survives.

What changes: the ~25 edit handlers (`setProp`, `renameProp`, `changeElementTag`,
`setNodeText`, `setNodeContent`, `setNodeInline`, `setFrontmatter`, `moveNode`,
`removeNode`, `copyNode`, `duplicateNode`, `pasteNode`, `addComponent`, `insertItem`,
`changeLayout`, …) become pure `(model, args) => model` functions in `mutations.ts`.
The store action stays the thin three-step wrapper.

The helper functions currently at module scope in `App.jsx` (`findNodeById`,
`findParentList`, `isDescendantOf`, `pathOfNode`, `ancestorChain`, `nodeAtPath`,
`splitMapHead`, `renameLoopVar`, `collectUsedNames`, `pruneImports`, `chooseImportPath`,
`parseLoopHead`, `disconnectDependentLoops`, `loopVarsAt`, `stripLostBindings`,
`insertIntoModel`) move to `src/model/` as the shared vocabulary those mutations use.

**Two behavioral contracts must be preserved exactly:**

- Undo coalescing: consecutive edits with the same `coalesceKey` within **800 ms**
  collapse into one undo step; `null` key never coalesces; history caps at **100** entries.
- Save debounce: **300 ms** for typing, `setTimeout(0)` for immediate saves (the zero
  timeout exists so React commits state before `flushSave` reads the model).

### Mirror refs are deleted

`pageStateRef`, `selectedIdRef`, `editStackRef`, `inPreviewRef`, `projectRef`,
`devLogRef`, `cmsOpenRef`, and `scheduleSaveRef` exist only so callbacks and IPC
listeners can read current state without re-subscribing. `store.getState()` does this
natively. The refs and their synchronizing assignments are removed.

`previewFrameRef`, `previewIframeRef`, `previewPathRef`, `saveTimer`, `fileSaveTimer`,
`rightTabRefs`, `tabBeforePick`, `tabSelRef`, and `layoutSeq` are genuine DOM/timer refs
and stay in components.

### Layout decomposition

```
src/layout/
  AppShell.tsx     the .app root, composes the below
  TitleBar.tsx     project name, page switcher, dev status, preview toggle, GitChip
  LeftDock.tsx     LeftRail + the active left panel
  RightDock.tsx    style/settings tabs + StylePanel/PropsPanel
  Overlays.tsx     CodeWindow, InsertSearch, BusyOverlay, Toast, asset picker
```

`App.tsx` retains: the welcome/no-project branch, the effect hooks, and `<AppShell />`.

### TypeScript

- `tsconfig.json` at repo root: `strict: true`, `allowJs: true`, `checkJs: false`,
  `noEmit: true`, `jsx: react-jsx`.
- `npm run typecheck` → `tsc --noEmit`.
- **Enabling this immediately typechecks the 50+ never-checked `.tsx` files in
  `src/style-panel/`.** A batch of pre-existing errors is expected. Triaging them is an
  explicit step, not a mid-refactor surprise.
- `src/types/ast.d.ts` — `AstroNode`, `PageModel`, `PropSchema`, `ImportDecl`, and the
  node-kind union, written from `astroParser`'s actual shapes. Shared by both processes.
- `electron/astroParser.js` — stays CommonJS. Gains `// @ts-check` and JSDoc annotations
  referencing `ast.d.ts`. Full type coverage, zero packaging risk, `check:electron`
  keeps working.
- `src/types/ipc.d.ts` — declares the `window.avb` surface (~90 methods from
  `electron/preload.js`), with a **drift test** asserting that the key set exported by
  `preload.js` equals the key set declared in the `.d.ts`, so the two cannot silently
  diverge.

## Testing strategy

**Character tests first.** Before any code moves, add tests to `src/App.test.jsx` (or a
sibling) pinning the behavior that exists only in `App.jsx` and is currently untested:

- Undo coalescing inside and outside the 800 ms window
- Redo stack cleared on a new edit
- Save debounce: typing batches, discrete edits flush immediately
- Layout change rewrites imports and prunes the old one
- Paste resolves the import path for a node copied from another page
- Component enter/exit restores the previous selection and page

These are written against current behavior and must stay green through every phase.

**Per-layer tests as work lands:**

- `src/model/*.test.ts` — node helpers, pure, no React
- `src/store/mutations.test.ts` — each edit as `(model, args) => model`
- `src/store/*Slice.test.ts` — slice reducers via `createAppStore()` directly
- `src/store/selectors.test.ts` — derived values against fixture models
- Panel tests render against a seeded store rather than a hand-built prop bag

## Sequencing

Types land before the risky refactor, so the store extraction is typechecked as it
happens.

- **Phase 0 — Foundation.** `tsconfig.json`, `npm run typecheck`, a PR CI workflow
  running `typecheck` + `test` + `check:electron`, the `.worktrees` vitest exclusion, and
  the character tests. No production code changes.
- **Phase 1 — Types.** `ast.d.ts`, `@ts-check` on `astroParser.js`, `ipc.d.ts` with the
  drift test, and triage of the newly-surfaced `style-panel` errors.
- **Phase 2 — Store.** Extract `src/model/`, then `mutations.ts`, then slices, then
  selectors. `App.jsx` becomes a consumer of the store while keeping its current
  structure.
- **Phase 3 — Panels.** Rewire panels to selectors, delete prop drilling, decompose the
  render into `src/layout/`.

Each phase merges independently with the suite green.

## Risks

| Risk | Mitigation |
| --- | --- |
| Re-render regressions in the preview iframe | Selector-based subscriptions; verify iframe does not remount on unrelated state changes |
| Undo/save timing subtly changes | Character tests pin the 800 ms / 300 ms / 0 ms contracts before any move |
| `style-panel` type errors block Phase 0 | Phase 0 lands with `checkJs: false`; `style-panel` triage is scoped to Phase 1 and may use targeted `@ts-expect-error` with follow-up issues |
| `electron/` packaging breaks | `electron/` is never renamed or compiled; `check:electron` runs in CI |
| Large diff is hard to review | Four phases, each independently mergeable and green |
