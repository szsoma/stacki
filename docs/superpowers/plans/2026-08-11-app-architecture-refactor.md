# App Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `src/App.jsx` (2,625 lines) into a typed Zustand store plus composed layout components, eliminating prop drilling, with zero behavior change.

**Architecture:** State moves into seven Zustand slices; model edits become pure `(model, args) => model` functions; values currently computed in `App`'s render body become selectors, which is what removes the prop drilling. IPC subscriptions stay in React as focused hooks. TypeScript is added as `strict` typechecking over `src/`, while `electron/` keeps shipping raw CommonJS and gains types via `// @ts-check` + JSDoc.

**Tech Stack:** React 18, Vite 6, Vitest 3, Zustand 5, TypeScript 5, Electron 33.

**Design doc:** `docs/superpowers/specs/2026-08-11-app-architecture-refactor-design.md`

## Global Constraints

- **No behavior changes.** Any observable difference in the running app is a bug. Every task ends with the full suite green.
- **`electron/` is never renamed, compiled, or bundled.** It ships as raw CommonJS. `electron/astroParser.js` is `require`d at runtime, listed in `build.asarUnpack`, and read by absolute path at `electron/main.js:1964`.
- **Undo coalescing contract:** consecutive edits sharing a `coalesceKey` within **800 ms** collapse into one undo step; a `null` key never coalesces; `past` caps at **100** entries.
- **Save debounce contract:** **300 ms** for typing; `setTimeout(…, 0)` for immediate saves. The zero timeout exists so React commits state before `flushSave` reads it — do not replace it with a direct call.
- **Node 22** (matches `.github/workflows/release.yml`).
- **Tests run with** `npx vitest run`. Never `npx vitest` (watch mode) in an agent session.
- Commit messages use the repo's existing style: `feat:`, `refactor:`, `test:`, `chore:`.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `tsconfig.json` | Strict typecheck config for `src/`; `noEmit` |
| `.github/workflows/ci.yml` | PR check: typecheck + test + check:electron |
| `src/types/ast.d.ts` | `AstroNode`, `PageModel`, `PropValue`, `ImportDecl` — shared with `electron/` |
| `src/types/ipc.d.ts` | `window.avb` surface declaration |
| `src/types/ipc.test.ts` | Drift test: preload keys === declared keys |
| `src/model/nodes.ts` | Tree lookups: find, path, ancestors, descendants |
| `src/model/imports.ts` | Import bookkeeping: collect, prune, choose path |
| `src/model/loops.ts` | `.map()` head parsing, loop vars, binding cleanup |
| `src/store/index.ts` | `createAppStore`, `useAppStore`, `getState` |
| `src/store/projectSlice.ts` | project, scan, projectClasses |
| `src/store/selectionSlice.ts` | selectedId, hoverNodeId, revealTick |
| `src/store/uiSlice.ts` | leftTab, rightTab, codeWin, insertOpen, busy, toast, assetPick, cms* |
| `src/store/previewSlice.ts` | devUrl, devStatus, devLog, devDiag, refreshKey, device, inPreview |
| `src/store/documentSlice.ts` | currentPage, editStack, pageState, dirty |
| `src/store/historySlice.ts` | past, future, pushHistory, undo, redo |
| `src/store/mutations.ts` | Pure model edits |
| `src/store/selectors.ts` | Derived values |
| `src/hooks/useProjectWatcher.ts` | `onFsChanged` / `onAssetsChanged` / `onCmsChanged` |
| `src/hooks/useDevServer.ts` | dev-server lifecycle + diagnostics |
| `src/hooks/useKeyboardShortcuts.ts` | menu + key handling |
| `src/hooks/useAutoSave.ts` | debounce + `flushSave` |
| `src/layout/AppShell.tsx` | `.app` root composition |
| `src/layout/TitleBar.tsx` | title, page switcher, dev status, preview toggle |
| `src/layout/LeftDock.tsx` | `LeftRail` + active left panel |
| `src/layout/RightDock.tsx` | style/settings tabs |
| `src/layout/Overlays.tsx` | CodeWindow, InsertSearch, BusyOverlay, Toast |

**Modified:** `vite.config.mjs`, `package.json`, `src/App.jsx` → `src/App.tsx`, `electron/astroParser.js` (JSDoc only), `src/panels/*.jsx`.

---

## Phase 0 — Foundation

### Task 1: Typecheck config and test-scope fix

**Files:**
- Create: `tsconfig.json`
- Modify: `vite.config.mjs:19`, `package.json:20` (scripts block)

**Interfaces:**
- Produces: `npm run typecheck` → `tsc --noEmit`, exit 0 on a clean tree.

- [ ] **Step 1: Fix the vitest scope so the suite is trustworthy**

A bare `npx vitest run` currently collects `.worktrees/` copies and reports 160 failing files. The working tree already has an uncommitted `test.exclude` addition; extend it. Vitest's `exclude` **replaces** the default, so the defaults must be restated.

In `vite.config.mjs`, replace the `test` block:

```js
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    clearMocks: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**',
      '**/.claude/**',
      '**/.superpowers/**',
    ],
  },
```

- [ ] **Step 2: Verify the suite is now clean**

Run: `npx vitest run --reporter=dot`
Expected: PASS, 0 failures. Before this change the same command reported `160 failed | 133 passed`.

- [ ] **Step 3: Install TypeScript**

```bash
npm install --save-dev typescript@^5.7.0
```

- [ ] **Step 4: Create `tsconfig.json`**

`checkJs` is `false` so this task does not turn 2,625 lines of `App.jsx` into an error wall. `allowJs` admits `.js` to the program so `.ts` files can import from them. `.tsx` files are checked regardless — that is deliberate, and it is why Task 9 exists.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*", "electron/**/*"],
  "exclude": ["node_modules", "dist", "release", ".worktrees"]
}
```

- [ ] **Step 5: Add the script**

In `package.json`, add to `scripts`:

```json
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 6: Run it and record the baseline**

Run: `npm run typecheck 2>&1 | tail -40`
Expected: errors, all originating in `src/style-panel/*.tsx` — those files have never been checked. **Do not fix them here.** Capture the count:

```bash
npm run typecheck 2>&1 | grep -c "error TS" > /tmp/ts-baseline.txt
```

Task 9 drives this to zero. If any error comes from a file outside `src/style-panel/`, stop and report it — that is unexpected.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json package.json package-lock.json vite.config.mjs
git commit -m "chore: add strict tsconfig and scope vitest away from worktrees"
```

---

### Task 2: Pull-request CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run typecheck` from Task 1.
- Produces: a required check on every PR.

There is currently no PR CI — `release.yml` triggers on `v*` tags only. Every later task in this plan relies on "the suite is green" being enforced somewhere other than an agent's memory.

- [ ] **Step 1: Write the workflow**

`typecheck` is `continue-on-error` until Task 9 clears the `style-panel` backlog; Task 9's final step removes that line.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check:electron
      - run: npx vitest run
      - name: Typecheck
        # Non-blocking until the style-panel backlog is cleared (Task 9).
        continue-on-error: true
        run: npm run typecheck
```

- [ ] **Step 2: Verify locally**

Run: `npm run check:electron && npx vitest run --reporter=dot`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: run typecheck, tests and electron syntax check on PRs"
```

---

### Task 3: Character tests — undo/redo coalescing

**Files:**
- Create: `src/App.history.test.jsx`

**Interfaces:**
- Produces: the regression net for the 800 ms coalesce window and the 100-entry cap. Every later task must keep these green.

These tests describe behavior that today lives only in `App.jsx:685-755` and has no coverage. They must be written **before** any code moves, and must not be modified by later tasks — if a later task makes one fail, the refactor is wrong, not the test.

- [ ] **Step 1: Write the failing test file**

The harness mirrors `src/App.test.jsx:7-110`. `readPage` returns an editable model so the props panel renders a real field to type into.

```jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';

const harness = vi.hoisted(() => ({ menu: new Map() }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => {};

vi.mock('./panels/WelcomeScreen.jsx', () => ({
  default: ({ onOpen }) => (
    <button type="button" onClick={() => onOpen('/projects/one')}>
      Open project
    </button>
  ),
}));
vi.mock('./panels/TerminalPanel.jsx', () => ({ default: () => null }));
vi.mock('./panels/PreviewPane.jsx', () => ({
  default: () => <div className="preview-frame-wrap" />,
}));
vi.mock('./panels/GitChip.jsx', () => ({ default: () => null }));

// A minimal editable page: one <section> with a single string prop.
function makeModel() {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'n1',
        kind: 'element',
        name: 'section',
        props: { id: { type: 'string', value: 'hero' } },
        children: [],
      },
    ],
  };
}

let writePage;

function setupAvb() {
  const subscribe = vi.fn(() => vi.fn());
  writePage = vi.fn(async () => ({ ok: true }));
  window.avb = {
    addRecent: vi.fn(),
    hasNodeModules: vi.fn(async () => true),
    listProjectClasses: vi.fn(async () => []),
    listStyleFiles: vi.fn(async () => ({ files: [] })),
    nativeCopy: vi.fn(),
    nativePaste: vi.fn(),
    onDevExit: subscribe,
    onDevLog: subscribe,
    onFsChanged: subscribe,
    onMenu: vi.fn((name, callback) => {
      harness.menu.set(name, callback);
      return vi.fn();
    }),
    onProgress: subscribe,
    scanProject: vi.fn(async () => ({
      pages: [{ name: 'index', path: '/projects/one/src/pages/index.astro', route: '/' }],
      layouts: [],
      components: [],
    })),
    readPage: vi.fn(async () => ({ editable: true, model: makeModel(), source: '' })),
    writePage,
    writePageRaw: vi.fn(async () => ({ ok: true })),
    startDevServer: vi.fn(async () => ({ url: 'http://localhost:4321', external: false })),
    watchProject: vi.fn(),
  };
}

async function openProjectWithPage() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
  await screen.findByTitle('Dev server: on');
  // Select the section so the settings panel exposes its `id` field.
  fireEvent.click(await screen.findByText('section'));
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  return screen.findByDisplayValue('hero');
}

describe('App undo history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.menu.clear();
    setupAvb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses same-key edits inside the 800ms window into one undo step', async () => {
    const field = await openProjectWithPage();

    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'heroAB' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'heroABC' } });
    await vi.advanceTimersByTimeAsync(400);

    // One undo returns all the way to the original value, not to 'heroAB'.
    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByDisplayValue('hero')).toBeInTheDocument());
  });

  it('keeps edits separated by more than 800ms as distinct undo steps', async () => {
    const field = await openProjectWithPage();

    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(900);
    fireEvent.change(field, { target: { value: 'heroAB' } });
    await vi.advanceTimersByTimeAsync(400);

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByDisplayValue('heroA')).toBeInTheDocument());

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByDisplayValue('hero')).toBeInTheDocument());
  });

  it('redoes an undone edit and clears the redo stack on a fresh edit', async () => {
    const field = await openProjectWithPage();

    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(900);

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByDisplayValue('hero')).toBeInTheDocument());

    harness.menu.get('redo')();
    await waitFor(() => expect(screen.getByDisplayValue('heroA')).toBeInTheDocument());

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByDisplayValue('hero')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('hero'), { target: { value: 'branch' } });
    await vi.advanceTimersByTimeAsync(900);

    // Redo after a new edit is a no-op — the future was discarded.
    harness.menu.get('redo')();
    await waitFor(() => expect(screen.getByDisplayValue('branch')).toBeInTheDocument());
  });

  it('resets history when a different file is opened', async () => {
    const field = await openProjectWithPage();
    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(900);

    // Re-opening the page clears past/future (App.jsx openFile).
    fireEvent.click(screen.getByRole('button', { name: /pages/i }));
    fireEvent.click(await screen.findByText('index'));
    await screen.findByDisplayValue('hero');

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByDisplayValue('hero')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it — expect failures to be about selectors, not behavior**

Run: `npx vitest run src/App.history.test.jsx`

These tests target *existing* behavior, so they should pass once the queries match the real DOM. The likely failures are `getByText('section')` and the settings-tab query not matching the actual markup.

**Fix the queries, never the assertions.** Inspect the real accessible names:

```bash
npx vitest run src/App.history.test.jsx --reporter=verbose 2>&1 | head -60
```

Adjust `openProjectWithPage` until all four pass. If a *timing* assertion fails, that is a genuine discovery about current behavior — record it in the test as a comment and match reality.

- [ ] **Step 3: Verify all four pass**

Run: `npx vitest run src/App.history.test.jsx`
Expected: `4 passed`.

- [ ] **Step 4: Commit**

```bash
git add src/App.history.test.jsx
git commit -m "test: pin undo coalescing, redo and history-reset behavior"
```

---

### Task 4: Character tests — save debounce

**Files:**
- Create: `src/App.save.test.jsx`

**Interfaces:**
- Consumes: the `setupAvb` / `openProjectWithPage` harness shape from Task 3.
- Produces: the regression net for the 300 ms / 0 ms save contract.

- [ ] **Step 1: Write the test file**

Copy the mock block and `makeModel` verbatim from Task 3's file (the engineer may be reading tasks out of order — do not import across test files), then:

```jsx
describe('App save scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.menu.clear();
    setupAvb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches keystrokes into a single write after 300ms of quiet', async () => {
    const field = await openProjectWithPage();

    fireEvent.change(field, { target: { value: 'a' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'ab' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'abc' } });

    // Still inside the debounce window: nothing written yet.
    expect(writePage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(writePage).toHaveBeenCalledTimes(1));
    expect(writePage.mock.calls[0][0].model.nodes[0].props.id.value).toBe('abc');
  });

  it('writes the model, not the raw source, for an editable page', async () => {
    const field = await openProjectWithPage();
    fireEvent.change(field, { target: { value: 'z' } });
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(writePage).toHaveBeenCalled());
    expect(window.avb.writePageRaw).not.toHaveBeenCalled();
    expect(writePage.mock.calls[0][0]).toHaveProperty('pagePath');
  });

  it('does not write when nothing is dirty', async () => {
    await openProjectWithPage();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writePage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and adjust queries only**

Run: `npx vitest run src/App.save.test.jsx`
Expected: `3 passed` after query fixes. As in Task 3, fix selectors, never assertions.

- [ ] **Step 3: Commit**

```bash
git add src/App.save.test.jsx
git commit -m "test: pin save debounce and dirty-tracking behavior"
```

---

### Task 5: Character tests — layout change and import bookkeeping

**Files:**
- Create: `src/App.layout.test.jsx`

**Interfaces:**
- Produces: the regression net for `changeLayout` (`src/App.jsx:1702-1750`) — the most intricate untested mutation. Task 11 (`imports.ts`) and Task 16 (`mutations.ts`) both depend on this staying green.

- [ ] **Step 1: Write the test file**

Copy the mock block from Task 3, then replace `scanProject`, `readPage`, and add `importPathFor`:

```jsx
function makeUnwrappedModel() {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [
      { id: 'n1', kind: 'element', name: 'h1', props: {}, children: [] },
    ],
  };
}

function setupAvbWithLayouts() {
  setupAvb();
  window.avb.scanProject = vi.fn(async () => ({
    pages: [{ name: 'index', path: '/projects/one/src/pages/index.astro', route: '/' }],
    layouts: [
      { name: 'BaseLayout', path: '/projects/one/src/layouts/BaseLayout.astro', schema: [], slots: [] },
      { name: 'BlogLayout', path: '/projects/one/src/layouts/BlogLayout.astro', schema: [], slots: [] },
    ],
    components: [],
  }));
  window.avb.readPage = vi.fn(async () => ({
    editable: true,
    model: makeUnwrappedModel(),
    source: '',
  }));
  window.avb.importPathFor = vi.fn(async () => ({
    relative: '../layouts/BaseLayout.astro',
    srcRelative: '@/layouts/BaseLayout.astro',
  }));
}

describe('App layout changes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.menu.clear();
    setupAvbWithLayouts();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wraps an unwrapped page and adds the layout import', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    await screen.findByTitle('Dev server: on');

    const picker = await screen.findByLabelText(/layout/i);
    fireEvent.change(picker, { target: { value: 'BaseLayout' } });
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(writePage).toHaveBeenCalled());
    const { model } = writePage.mock.calls.at(-1)[0];
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].id).toBe('layout');
    expect(model.nodes[0].name).toBe('BaseLayout');
    // The original content is now the wrapper's children.
    expect(model.nodes[0].children[0].name).toBe('h1');
    expect(model.imports).toContainEqual(
      expect.objectContaining({ name: 'BaseLayout' })
    );
  });

  it('unwraps back to bare content and prunes the now-unused import', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    await screen.findByTitle('Dev server: on');

    const picker = await screen.findByLabelText(/layout/i);
    fireEvent.change(picker, { target: { value: 'BaseLayout' } });
    await vi.advanceTimersByTimeAsync(400);

    fireEvent.change(screen.getByLabelText(/layout/i), { target: { value: '' } });
    await vi.advanceTimersByTimeAsync(400);

    const { model } = writePage.mock.calls.at(-1)[0];
    expect(model.nodes[0].name).toBe('h1');
    expect(model.imports).toHaveLength(0);
  });

  it('renames the wrapper in place when switching between layouts', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    await screen.findByTitle('Dev server: on');

    fireEvent.change(await screen.findByLabelText(/layout/i), {
      target: { value: 'BaseLayout' },
    });
    await vi.advanceTimersByTimeAsync(400);
    fireEvent.change(screen.getByLabelText(/layout/i), { target: { value: 'BlogLayout' } });
    await vi.advanceTimersByTimeAsync(400);

    const { model } = writePage.mock.calls.at(-1)[0];
    expect(model.nodes[0].name).toBe('BlogLayout');
    // The old layout's import is gone; only the new one remains.
    expect(model.imports.map((i) => i.name)).toEqual(['BlogLayout']);
  });
});
```

- [ ] **Step 2: Run and adjust queries only**

Run: `npx vitest run src/App.layout.test.jsx`

The layout picker lives in `PropsPanel` behind the settings tab and may need `getByRole('combobox')` rather than `getByLabelText`. Fix the query. If the third test reveals that the old import is *not* pruned, that is current behavior — change the assertion to match and leave a comment saying so.

- [ ] **Step 3: Run the whole suite**

Run: `npx vitest run --reporter=dot`
Expected: PASS, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add src/App.layout.test.jsx
git commit -m "test: pin layout wrap, unwrap and import pruning behavior"
```

---

## Phase 1 — Types

### Task 6: Shared AST types

**Files:**
- Create: `src/types/ast.d.ts`

**Interfaces:**
- Produces: `AstroNode`, `PageModel`, `PropValue`, `ImportDecl`, `NodeKind`. Consumed by Tasks 7, 10, 11, 16, 18.

Types are written from the shapes `electron/astroParser.js` actually produces (`parseTemplate` at `electron/astroParser.js:141-249`, `parseAttrs` at `:35-49`, `parsePage` at `:285-346`).

- [ ] **Step 1: Write the declarations**

```ts
// Shapes produced by electron/astroParser.js. Kept in src/ so the renderer
// can import them normally; electron/ reaches them via JSDoc import().

export type PropValue =
  | { type: 'string'; value: string }
  | { type: 'expr'; value: string }
  | { type: 'bare' };

export type Props = Record<string, PropValue>;

export interface ImportDecl {
  name: string;
  path: string;
}

export type NodeKind =
  | 'element'
  | 'component'
  | 'text'
  | 'comment'
  | 'expr'
  | 'raw'
  | 'raw-line'
  | 'map';

interface NodeBase {
  id: string;
  kind: NodeKind;
}

/** A DOM element or an imported component. `children: null` = self-closing. */
export interface ElementNode extends NodeBase {
  kind: 'element' | 'component';
  name: string;
  props: Props;
  children: AstroNode[] | null;
  /** Capitalized tag with no matching import — `const Tag = tag`. */
  dynamicTag?: boolean;
}

export interface TextNode extends NodeBase {
  kind: 'text';
  value: string;
}

export interface CommentNode extends NodeBase {
  kind: 'comment';
  value: string;
}

/** An opaque `{...}` expression that is not a recognized `.map()`. */
export interface ExprNode extends NodeBase {
  kind: 'expr';
  value: string;
}

/** `<style>` / `<script>` — inner text captured verbatim, never parsed. */
export interface RawNode extends NodeBase {
  kind: 'raw';
  name: string;
  props: Props;
  inner: string;
}

/** Doctype and similar single-line passthroughs. */
export interface RawLineNode extends NodeBase {
  kind: 'raw-line';
  value: string;
}

/** A recognized `{items.map((item, i) => (...))}` loop. */
export interface MapNode extends NodeBase {
  kind: 'map';
  head: string;
  children: AstroNode[];
}

export type AstroNode =
  | ElementNode
  | TextNode
  | CommentNode
  | ExprNode
  | RawNode
  | RawLineNode
  | MapNode;

export interface PageModel {
  imports: ImportDecl[];
  extraFrontmatter: string;
  nodes: AstroNode[];
}

/** What window.avb.readPage resolves to. */
export type PageState =
  | { editable: true; model: PageModel; source?: string; dirty?: boolean }
  | { editable: false; reason: string; source: string; dirty?: boolean };
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck 2>&1 | grep "src/types" || echo "no ast.d.ts errors"`
Expected: `no ast.d.ts errors`.

- [ ] **Step 3: Commit**

```bash
git add src/types/ast.d.ts
git commit -m "feat: declare shared Astro AST types"
```

---

### Task 7: Typecheck astroParser without compiling it

**Files:**
- Modify: `electron/astroParser.js` (JSDoc annotations only — no logic changes)

**Interfaces:**
- Consumes: `src/types/ast.d.ts` from Task 6.
- Produces: a typechecked `astroParser` that still ships as raw CommonJS.

`electron/astroParser.js` must remain CommonJS: `electron/main.js:28` requires it, `electron/main.js:1964` reads it by absolute path, and `package.json` `asarUnpack`s it. This task adds types with **zero** runtime change.

- [ ] **Step 1: Add the pragma and typedef imports at the top of the file**

Insert after the existing header comment, before `const fs = require('fs')` (currently `electron/astroParser.js:16`):

```js
// @ts-check
/**
 * @typedef {import('../src/types/ast').AstroNode} AstroNode
 * @typedef {import('../src/types/ast').PageModel} PageModel
 * @typedef {import('../src/types/ast').Props} Props
 * @typedef {import('../src/types/ast').PropValue} PropValue
 * @typedef {import('../src/types/ast').ImportDecl} ImportDecl
 */
```

- [ ] **Step 2: Annotate the exported functions**

Add a JSDoc block above each. The full set, with the signatures they must declare:

```js
/** @param {string} attrString @returns {Props} */
function parseAttrs(attrString) { /* unchanged */ }

/** @param {Props} props @returns {string} */
function serializeAttrs(props) { /* unchanged */ }

/** @param {string} str @returns {{ nodes: AstroNode[], clean: boolean }} */
function parseTemplate(str) { /* unchanged */ }

/**
 * @param {string} source
 * @returns {{ editable: true, model: PageModel } | { editable: false, reason: string }}
 */
function parsePage(source) { /* unchanged */ }

/** @param {PageModel} model @returns {string} */
function serializePage(model) { /* unchanged */ }

/** @param {PageModel} model @returns {string} */
function serializePageMarked(model) { /* unchanged */ }

/** @param {AstroNode[]} nodes @returns {string} */
function serializeNodes(nodes) { /* unchanged */ }

/** @param {PageModel} model @param {string} pagePath @returns {PageModel} */
function resolveChunks(model, pagePath) { /* unchanged */ }

/** @param {string} source @param {string} prefix @param {string} group @returns {string} */
function markChunkHtml(source, prefix, group) { /* unchanged */ }
```

For `parsePropSchema`, `parseExtendsTag`, and `parseSlots`, read the current return statements and annotate what they actually return. Do not guess.

- [ ] **Step 3: Enable checking for this one file**

`checkJs` stays globally `false`. The `// @ts-check` pragma opts this file in on its own.

Run: `npm run typecheck 2>&1 | grep "electron/astroParser"`
Expected: some errors. This is the point of the task — fix them **with annotations, never by changing logic.**

Common fixes:
- Implicit `any` parameters on internal helpers → add `@param` JSDoc.
- `str.match(...)` possibly-null → the code already guards with `fm ? … : …`; if TS cannot see it, add `@type` on the local.
- Discriminated-union narrowing on `node.kind` → these are real. If a branch reads `node.name` on a kind that has no `name`, that is a latent bug; report it rather than casting it away.

- [ ] **Step 4: Verify no behavior changed**

Run: `npx vitest run --reporter=dot && npm run check:electron`
Expected: PASS and exit 0. `node --check` proves the file is still valid CommonJS.

- [ ] **Step 5: Verify astroParser is clean**

Run: `npm run typecheck 2>&1 | grep -c "electron/astroParser"`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add electron/astroParser.js
git commit -m "feat: typecheck astroParser via @ts-check and JSDoc"
```

---

### Task 8: Declare the IPC surface with a drift test

**Files:**
- Create: `src/types/ipc.d.ts`, `src/types/ipc.test.ts`

**Interfaces:**
- Consumes: `src/types/ast.d.ts`.
- Produces: a typed `window.avb`; every store slice and hook in Phase 2 relies on it.

- [ ] **Step 1: List the real surface**

```bash
node -e "const p=require('./electron/preload.js')" 2>/dev/null || \
  grep -oE '^  ([a-zA-Z][a-zA-Z0-9]*):' electron/preload.js | tr -d ' :' | sort
```

Use the printed list as the authoritative set. There are roughly 90 entries.

- [ ] **Step 2: Write the declaration**

Declare every key from Step 1. The pattern, with the ones this plan depends on typed precisely and the remainder given honest signatures:

```ts
import type { PageModel, PageState } from './ast';

export interface ScanResult {
  pages: PageEntry[];
  layouts: ComponentEntry[];
  components: ComponentEntry[];
}

export interface PageEntry {
  name: string;
  path: string;
  route?: string;
  kind?: 'page' | 'component';
  focusPath?: string;
}

export interface ComponentEntry {
  name: string;
  path: string;
  schema?: PropField[];
  slots?: string[];
  extendsTag?: string;
  hasRest?: boolean;
}

export interface PropField {
  name: string;
  type: string;
  optional?: boolean;
  values?: string[];
}

/** Cleanup function returned by every on* subscription. */
export type Unsubscribe = () => void;

export interface AvbApi {
  // Project
  openProjectDialog(): Promise<string | null>;
  newProjectDialog(): Promise<string | null>;
  scaffoldProject(path: string): Promise<unknown>;
  createAstroProject(path: string): Promise<unknown>;
  hasNodeModules(path: string): Promise<boolean>;
  installDeps(path: string): Promise<unknown>;
  scanProject(path: string): Promise<ScanResult>;
  listProjectClasses(path: string): Promise<string[]>;
  watchProject(path: string): void;

  // Pages
  readPage(path: string): Promise<PageState>;
  writePage(args: { pagePath: string; model: PageModel }): Promise<unknown>;
  writePageRaw(args: { pagePath: string; source: string }): Promise<unknown>;
  createPage(args: Record<string, unknown>): Promise<{ pagePath: string }>;
  deletePage(path: string): Promise<unknown>;
  movePage(args: Record<string, unknown>): Promise<unknown>;
  createPageFolder(args: Record<string, unknown>): Promise<unknown>;
  renamePageFolder(args: Record<string, unknown>): Promise<unknown>;
  deletePageFolder(args: Record<string, unknown>): Promise<unknown>;
  importPathFor(args: unknown): Promise<{ relative: string; srcRelative: string }>;

  // Dev server
  startDevServer(path: string): Promise<{ url: string; external: boolean }>;
  stopDevServer(): Promise<unknown>;
  diagnoseDev(path: string): Promise<unknown>;

  // Subscriptions
  onFsChanged(cb: (e: { files: string[] }) => void): Unsubscribe;
  onAssetsChanged(cb: (e: unknown) => void): Unsubscribe;
  onCmsChanged(cb: (e: unknown) => void): Unsubscribe;
  onDevLog(cb: (chunk: string) => void): Unsubscribe;
  onDevExit(cb: (e: unknown) => void): Unsubscribe;
  onProgress(cb: (e: unknown) => void): Unsubscribe;
  onMenu(name: string, cb: () => void): Unsubscribe;

  openExternal(url: string): void;

  // Remaining surface — fill in from the Step 1 list. Give each an honest
  // signature; `(...args: unknown[]) => Promise<unknown>` is acceptable for
  // methods this refactor does not touch, but every key must be present or
  // the drift test in ipc.test.ts fails.
  [key: string]: unknown;
}

declare global {
  interface Window {
    avb: AvbApi;
  }
}

export {};
```

- [ ] **Step 3: Write the drift test**

This is what stops the declaration rotting. It parses `preload.js` as text rather than importing it, because `preload.js` calls `contextBridge`, which does not exist outside Electron.

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function keysFrom(source: string, startMarker: string): string[] {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const body = source.slice(start);
  const keys = new Set<string>();
  for (const m of body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)) {
    keys.add(m[1]);
  }
  return [...keys].sort();
}

describe('window.avb declaration', () => {
  it('declares every method preload.js exposes', () => {
    const preload = readFileSync(resolve(here, '../../electron/preload.js'), 'utf8');
    const decl = readFileSync(resolve(here, './ipc.d.ts'), 'utf8');

    const exposed = keysFrom(preload, 'contextBridge.exposeInMainWorld');
    const declared = new Set(
      [...decl.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)[(<?:]/gm)].map((m) => m[1])
    );

    const missing = exposed.filter((k) => !declared.has(k));
    expect(missing, `ipc.d.ts is missing: ${missing.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/types/ipc.test.ts`
Expected: FAIL initially, listing every method still missing from `ipc.d.ts`. Add them to the declaration until it passes. Adjust `keysFrom`'s marker if `preload.js` uses a different bridge call — read the file to confirm.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/types/ipc.test.ts && npm run typecheck 2>&1 | grep -c "src/types"`
Expected: PASS and `0`.

- [ ] **Step 6: Commit**

```bash
git add src/types/ipc.d.ts src/types/ipc.test.ts
git commit -m "feat: declare window.avb surface with a preload drift test"
```

---

### Task 9: Clear the style-panel type backlog

**Files:**
- Modify: `src/style-panel/**/*.tsx` (annotations only), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `tsconfig.json` from Task 1.
- Produces: `npm run typecheck` exits 0, and CI enforces it.

These 50+ files have never been typechecked. Task 1 recorded the baseline error count in `/tmp/ts-baseline.txt`.

- [ ] **Step 1: Group the errors by file**

```bash
npm run typecheck 2>&1 | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

- [ ] **Step 2: Fix them file by file, committing per file**

Rules, in priority order:

1. **Add the missing annotation.** Implicit-`any` props and untyped callback params are the bulk of it. Write the real type.
2. **Narrow, don't cast.** Prefer a guard over `as`.
3. **`@ts-expect-error` is a last resort** and requires a comment naming the reason:
   ```ts
   // @ts-expect-error CodeMirror's Decoration.range is typed too narrowly upstream.
   ```
   `@ts-expect-error` fails the build if the error goes away, so it cannot rot silently. Never use `@ts-ignore`.
4. **If an error reveals a real bug, stop and report it.** Do not silence it.

After each file:

```bash
npx vitest run --reporter=dot
git add src/style-panel/<file>.tsx && git commit -m "fix(types): annotate <file>"
```

- [ ] **Step 3: Verify zero errors**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 4: Make CI enforce it**

In `.github/workflows/ci.yml`, delete these two lines from the Typecheck step:

```yaml
        # Non-blocking until the style-panel backlog is cleared (Task 9).
        continue-on-error: true
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: make typecheck a blocking CI check"
```

---

## Phase 2 — Store

### Task 10: Extract node-tree helpers

**Files:**
- Create: `src/model/nodes.ts`, `src/model/nodes.test.ts`
- Modify: `src/App.jsx:60-137` (delete the moved functions, import them instead)

**Interfaces:**
- Consumes: `AstroNode`, `PageModel` from `src/types/ast.d.ts`.
- Produces:
  - `findNodeById(nodes: AstroNode[], id: string): AstroNode | null`
  - `findParentList(model: PageModel, id: string): { list: AstroNode[]; index: number } | null`
  - `isDescendantOf(candidateParent: AstroNode, id: string): boolean`
  - `pathOfNode(nodes: AstroNode[], id: string, trail?: number[]): number[] | null`
  - `ancestorChain(nodes: AstroNode[], id: string, trail?: AstroNode[]): AstroNode[] | null`
  - `nodeAtPath(nodes: AstroNode[], trail: number[]): AstroNode | null`
  - `findParentNode(nodes: AstroNode[], id: string): AstroNode | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { PageModel } from '../types/ast';
import {
  ancestorChain,
  findNodeById,
  findParentList,
  findParentNode,
  isDescendantOf,
  nodeAtPath,
  pathOfNode,
} from './nodes';

function model(): PageModel {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'layout',
        kind: 'component',
        name: 'BaseLayout',
        props: {},
        children: [
          {
            id: 'a',
            kind: 'element',
            name: 'section',
            props: {},
            children: [
              { id: 'b', kind: 'element', name: 'h1', props: {}, children: [] },
              { id: 'c', kind: 'text', value: 'hello' },
            ],
          },
        ],
      },
    ],
  };
}

describe('findNodeById', () => {
  it('finds a nested node', () => {
    expect(findNodeById(model().nodes, 'b')?.kind).toBe('element');
  });
  it('returns null for an unknown id', () => {
    expect(findNodeById(model().nodes, 'nope')).toBeNull();
  });
  it('handles self-closing nodes whose children are null', () => {
    const nodes = [
      { id: 'img', kind: 'element' as const, name: 'img', props: {}, children: null },
    ];
    expect(findNodeById(nodes, 'img')?.id).toBe('img');
    expect(findNodeById(nodes, 'x')).toBeNull();
  });
});

describe('findParentList', () => {
  it('returns the owning array and index', () => {
    const m = model();
    const found = findParentList(m, 'c');
    expect(found?.index).toBe(1);
    expect(found?.list).toHaveLength(2);
  });
  it('returns the top-level list for a root node', () => {
    const m = model();
    expect(findParentList(m, 'layout')?.index).toBe(0);
  });
});

describe('pathOfNode / nodeAtPath', () => {
  it('round-trips a nested node', () => {
    const m = model();
    const path = pathOfNode(m.nodes, 'b');
    expect(path).toEqual([0, 0, 0]);
    expect(nodeAtPath(m.nodes, path!)?.id).toBe('b');
  });
  it('returns null for a path that runs off the tree', () => {
    expect(nodeAtPath(model().nodes, [0, 9])).toBeNull();
  });
});

describe('ancestorChain', () => {
  it('lists root-to-node inclusive', () => {
    expect(ancestorChain(model().nodes, 'b')?.map((n) => n.id)).toEqual([
      'layout',
      'a',
      'b',
    ]);
  });
});

describe('isDescendantOf', () => {
  it('is true for a nested id and false for a sibling', () => {
    const root = model().nodes[0];
    expect(isDescendantOf(root, 'b')).toBe(true);
    expect(isDescendantOf(root, 'zzz')).toBe(false);
  });
});

describe('findParentNode', () => {
  it('returns the immediate parent', () => {
    expect(findParentNode(model().nodes, 'b')?.id).toBe('a');
  });
  it('returns null for a top-level node', () => {
    expect(findParentNode(model().nodes, 'layout')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/model/nodes.test.ts`
Expected: FAIL — `Failed to resolve import "./nodes"`.

- [ ] **Step 3: Move the implementations**

Copy the bodies of `findNodeById`, `findParentList`, `isDescendantOf`, `pathOfNode`, `ancestorChain`, and `nodeAtPath` **verbatim** from `src/App.jsx:60-137` into `src/model/nodes.ts`. Add `export` and the type annotations from the Interfaces block above. Also move `findParentNode` from `src/App.jsx:1926-1934` (it is currently defined inside the component body).

Do not "improve" the algorithms. Verbatim means verbatim.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/model/nodes.test.ts`
Expected: PASS.

- [ ] **Step 5: Point App.jsx at the new module**

Delete the moved function declarations from `src/App.jsx` and add near the other imports:

```js
import {
  ancestorChain,
  findNodeById,
  findParentList,
  findParentNode,
  isDescendantOf,
  nodeAtPath,
  pathOfNode,
} from './model/nodes.ts';
```

- [ ] **Step 6: Verify nothing broke**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS and exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/model/nodes.ts src/model/nodes.test.ts src/App.jsx
git commit -m "refactor: extract node-tree helpers into typed src/model/nodes"
```

---

### Task 11: Extract import and loop helpers

**Files:**
- Create: `src/model/imports.ts`, `src/model/imports.test.ts`, `src/model/loops.ts`, `src/model/loops.test.ts`
- Modify: `src/App.jsx:139-340` (delete moved functions, import instead)

**Interfaces:**
- Consumes: `findNodeById`, `ancestorChain` from `src/model/nodes.ts` (Task 10).
- Produces:
  - `imports.ts`: `collectUsedNames(model: PageModel): Set<string>`, `pruneImports(model: PageModel): PageModel`, `chooseImportPath(model: PageModel, paths: { relative: string; srcRelative: string }): string`
  - `loops.ts`: `splitMapHead(head: string): { source: string; item: string; index: string | null } | null`, `parseLoopHead(head: string)`, `renameLoopVar(nodes: AstroNode[], from: string, to: string): void`, `disconnectDependentLoops(list: AstroNode[], vars: string[]): void`, `loopVarsAt(nodes: AstroNode[], id: string): string[]`, `stripLostBindings(node: AstroNode, vars: string[]): void`

Before writing tests, read the current implementations at `src/App.jsx:139-340` and derive the exact return shapes. The signatures above name the functions; the shapes must come from the code.

- [ ] **Step 1: Write `src/model/imports.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { PageModel } from '../types/ast';
import { chooseImportPath, collectUsedNames, pruneImports } from './imports';

function model(overrides: Partial<PageModel> = {}): PageModel {
  return {
    imports: [
      { name: 'BaseLayout', path: '../layouts/BaseLayout.astro' },
      { name: 'Card', path: '../components/Card.astro' },
    ],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'layout',
        kind: 'component',
        name: 'BaseLayout',
        props: {},
        children: [],
      },
    ],
    ...overrides,
  };
}

describe('collectUsedNames', () => {
  it('collects component names in use', () => {
    expect([...collectUsedNames(model())]).toContain('BaseLayout');
  });
  it('does not collect an import that is never placed', () => {
    expect([...collectUsedNames(model())]).not.toContain('Card');
  });
});

describe('pruneImports', () => {
  it('drops imports no node references', () => {
    const pruned = pruneImports(model());
    expect(pruned.imports.map((i) => i.name)).toEqual(['BaseLayout']);
  });
  it('keeps every import when all are used', () => {
    const m = model();
    m.nodes[0].children = [
      { id: 'c1', kind: 'component', name: 'Card', props: {}, children: [] },
    ];
    expect(pruneImports(m).imports).toHaveLength(2);
  });
});

describe('chooseImportPath', () => {
  it('matches the style the page already uses', () => {
    const relativeStyle = model();
    expect(
      chooseImportPath(relativeStyle, {
        relative: '../components/New.astro',
        srcRelative: '@/components/New.astro',
      })
    ).toBe('../components/New.astro');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/model/imports.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Move `collectUsedNames`, `pruneImports`, `chooseImportPath`**

Copy verbatim from `src/App.jsx:183-220` into `src/model/imports.ts`, add `export` and types.

Note: `pruneImports` currently mutates and returns nothing (it is called for effect inside `mutateModel`). Keep that behavior but also `return model` so the signature above holds — callers that ignore the return value are unaffected.

- [ ] **Step 4: Run it**

Run: `npx vitest run src/model/imports.test.ts`
Expected: PASS. If `chooseImportPath`'s heuristic differs from the test's expectation, **the test is wrong** — read the implementation and correct the test.

- [ ] **Step 5: Write `src/model/loops.test.ts`**

Read `splitMapHead` (`src/App.jsx:139-153`) and `parseLoopHead` (`:221-237`) first, then write tests covering: a head with both item and index (`items.map((item, i) =>`), a head with item only, a head that does not parse, and `loopVarsAt` returning the accumulated vars for a node nested two loops deep. Use the same fixture style as Task 10.

- [ ] **Step 6: Move the loop helpers**

Copy `splitMapHead`, `renameLoopVar`, `parseLoopHead`, `disconnectDependentLoops`, `loopVarsAt`, and `stripLostBindings` verbatim from `src/App.jsx:139-340` into `src/model/loops.ts`.

- [ ] **Step 7: Point App.jsx at both modules and delete the originals**

```js
import { chooseImportPath, collectUsedNames, pruneImports } from './model/imports.ts';
import {
  disconnectDependentLoops,
  loopVarsAt,
  parseLoopHead,
  renameLoopVar,
  splitMapHead,
  stripLostBindings,
} from './model/loops.ts';
```

- [ ] **Step 8: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS and exit 0. `src/App.jsx` should now be roughly 2,340 lines.

- [ ] **Step 9: Commit**

```bash
git add src/model/ src/App.jsx
git commit -m "refactor: extract import and loop helpers into typed src/model"
```

---

### Task 12: Store skeleton and project slice

**Files:**
- Create: `src/store/index.ts`, `src/store/projectSlice.ts`, `src/store/projectSlice.test.ts`

**Interfaces:**
- Consumes: `ScanResult`, `PageEntry`, `ComponentEntry` from `src/types/ipc.d.ts` (Task 8).
- Produces:
  - `createAppStore(): StoreApi<AppState>` — a fresh store, for tests
  - `useAppStore` — the app-wide bound hook
  - `getState()` / `setState()` re-exports, replacing the mirror refs
  - `ProjectSlice`: `project`, `scan`, `projectClasses`, `setProject`, `setScan`, `setProjectClasses`

- [ ] **Step 1: Install Zustand**

```bash
npm install zustand@^5.0.0
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createAppStore } from './index';

describe('projectSlice', () => {
  it('starts with no project', () => {
    const store = createAppStore();
    expect(store.getState().project).toBeNull();
    expect(store.getState().scan).toEqual({ pages: [], layouts: [], components: [] });
  });

  it('sets the project', () => {
    const store = createAppStore();
    store.getState().setProject({ path: '/p', name: 'p' });
    expect(store.getState().project).toEqual({ path: '/p', name: 'p' });
  });

  it('replaces the scan wholesale', () => {
    const store = createAppStore();
    const scan = {
      pages: [{ name: 'index', path: '/p/src/pages/index.astro', route: '/' }],
      layouts: [],
      components: [],
    };
    store.getState().setScan(scan);
    expect(store.getState().scan.pages).toHaveLength(1);
  });

  it('gives each created store independent state', () => {
    const a = createAppStore();
    const b = createAppStore();
    a.getState().setProject({ path: '/a', name: 'a' });
    expect(b.getState().project).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/store/projectSlice.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 4: Write the slice**

`src/store/projectSlice.ts`:

```ts
import type { StateCreator } from 'zustand';
import type { ScanResult } from '../types/ipc';

export interface Project {
  path: string;
  name: string;
}

export interface ProjectSlice {
  project: Project | null;
  scan: ScanResult;
  projectClasses: string[];
  setProject: (project: Project | null) => void;
  setScan: (scan: ScanResult) => void;
  setProjectClasses: (classes: string[]) => void;
}

export const emptyScan: ScanResult = { pages: [], layouts: [], components: [] };

export const createProjectSlice: StateCreator<ProjectSlice, [], [], ProjectSlice> = (
  set
) => ({
  project: null,
  scan: emptyScan,
  projectClasses: [],
  setProject: (project) => set({ project }),
  setScan: (scan) => set({ scan }),
  setProjectClasses: (projectClasses) => set({ projectClasses }),
});
```

- [ ] **Step 5: Write the store root**

`src/store/index.ts`. `createAppStore` exists so each test gets a clean store; the app uses the single `useAppStore`.

```ts
import { create, createStore, useStore } from 'zustand';
import { createProjectSlice, type ProjectSlice } from './projectSlice';

export type AppState = ProjectSlice;

const initializer = (...args: Parameters<typeof createProjectSlice>): AppState => ({
  ...createProjectSlice(...args),
});

/** A fresh, isolated store. Tests use this; the app uses useAppStore. */
export const createAppStore = () => createStore<AppState>()(initializer);

export const useAppStore = create<AppState>()(initializer);

/** Read current state outside React — replaces App.jsx's mirror refs. */
export const getState = () => useAppStore.getState();
export const setState = useAppStore.setState;
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run src/store/projectSlice.test.ts`
Expected: `4 passed`.

- [ ] **Step 7: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS and exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/store/ package.json package-lock.json
git commit -m "feat: add zustand store skeleton with project slice"
```

---

### Task 13: Selection and UI slices

**Files:**
- Create: `src/store/selectionSlice.ts`, `src/store/uiSlice.ts`, `src/store/uiSlice.test.ts`
- Modify: `src/store/index.ts`

**Interfaces:**
- Consumes: `AppState` from Task 12.
- Produces:
  - `SelectionSlice`: `selectedId: string | null`, `hoverNodeId: string | null`, `revealTick: number`, `select(id, opts?: { reveal?: boolean })`, `setHoverNode(id)`, `reveal()`
  - `UiSlice`: `leftTab`, `rightTab`, `codeWin`, `insertOpen`, `busy`, `toast`, `assetPick`, `cmsRel`, `cmsTick`, `cmsSettings`, `cmsJump`, plus setters and `showToast(msg, kind?)`

`select(id, { reveal: true })` folds together the three-call sequence that appears throughout `App.jsx` (`setSelectedId`, `setLeftTab('navigator')`, `setRevealTick(t => t + 1)` — see `src/App.jsx:2430-2443`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createAppStore } from './index';

describe('selectionSlice', () => {
  it('selects a node', () => {
    const store = createAppStore();
    store.getState().select('n1');
    expect(store.getState().selectedId).toBe('n1');
  });

  it('bumps revealTick and switches to the navigator when reveal is asked for', () => {
    const store = createAppStore();
    const before = store.getState().revealTick;
    store.getState().select('n1', { reveal: true });
    expect(store.getState().revealTick).toBe(before + 1);
    expect(store.getState().leftTab).toBe('navigator');
  });

  it('leaves the tab alone for a plain selection', () => {
    const store = createAppStore();
    store.getState().setLeftTab('pages');
    store.getState().select('n1');
    expect(store.getState().leftTab).toBe('pages');
  });
});

describe('uiSlice', () => {
  afterEach(() => vi.useRealTimers());

  it('defaults to the navigator and the style tab', () => {
    const store = createAppStore();
    expect(store.getState().leftTab).toBe('navigator');
    expect(store.getState().rightTab).toBe('style');
  });

  it('shows a toast and clears it after 2.5s', () => {
    vi.useFakeTimers();
    const store = createAppStore();
    store.getState().showToast('saved', 'info');
    expect(store.getState().toast).toEqual({ msg: 'saved', kind: 'info' });
    vi.advanceTimersByTime(2500);
    expect(store.getState().toast).toBeNull();
  });

  it('defaults the toast kind to info', () => {
    vi.useFakeTimers();
    const store = createAppStore();
    store.getState().showToast('hi');
    expect(store.getState().toast?.kind).toBe('info');
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npx vitest run src/store/uiSlice.test.ts`
Expected: FAIL — `select is not a function`.

- [ ] **Step 3: Read the current toast timeout before implementing**

The 2500 ms in the test above is an assumption. Check `src/App.jsx:471-476` (`showToast`) for the real value and correct the test if it differs. The contract is whatever the code does today.

- [ ] **Step 4: Write both slices**

`src/store/selectionSlice.ts`:

```ts
import type { StateCreator } from 'zustand';
import type { UiSlice } from './uiSlice';

export interface SelectionSlice {
  selectedId: string | null;
  hoverNodeId: string | null;
  revealTick: number;
  select: (id: string | null, opts?: { reveal?: boolean }) => void;
  setHoverNode: (id: string | null) => void;
  reveal: () => void;
}

export const createSelectionSlice: StateCreator<
  SelectionSlice & UiSlice,
  [],
  [],
  SelectionSlice
> = (set) => ({
  selectedId: null,
  hoverNodeId: null,
  revealTick: 0,
  select: (id, opts) =>
    set((s) =>
      opts?.reveal
        ? { selectedId: id, leftTab: 'navigator', revealTick: s.revealTick + 1 }
        : { selectedId: id }
    ),
  setHoverNode: (hoverNodeId) => set({ hoverNodeId }),
  reveal: () => set((s) => ({ revealTick: s.revealTick + 1 })),
});
```

`src/store/uiSlice.ts` follows the same shape. Declare each field with the type implied by its `App.jsx` initializer comment (`src/App.jsx:370-398`) — for example `leftTab: 'pages' | 'navigator' | 'components' | 'assets' | 'cms' | 'terminal' | null`, `busy: string | null`, `toast: { msg: string; kind: string } | null`. Port `showToast` verbatim, including its timeout value.

- [ ] **Step 5: Compose them in `src/store/index.ts`**

```ts
export type AppState = ProjectSlice & SelectionSlice & UiSlice;

const initializer: StateCreator<AppState> = (...a) => ({
  ...createProjectSlice(...a),
  ...createSelectionSlice(...a),
  ...createUiSlice(...a),
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/store/`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run --reporter=dot && npm run typecheck
git add src/store/
git commit -m "feat: add selection and ui store slices"
```

---

### Task 14: Preview slice

**Files:**
- Create: `src/store/previewSlice.ts`, `src/store/previewSlice.test.ts`
- Modify: `src/store/index.ts`

**Interfaces:**
- Produces: `PreviewSlice`: `devUrl: string | null`, `devStatus: 'off' | 'starting' | 'on'`, `devLog: string`, `devDiag: unknown`, `refreshKey: number`, `device: 'desktop' | 'tablet' | 'phone' | 'canvas'`, `inPreview: boolean`, `previewSrc: string | null`, plus `setDevUrl`, `setDevStatus`, `appendDevLog`, `setDevDiag`, `refresh()`, `setDevice`, `enterPreview`, `exitPreview`.

`appendDevLog` replaces the `devLogRef` mirror at `src/App.jsx:416`. Read `src/App.jsx:1444-1470` for the log-trimming behavior (there is a cap) and port it exactly.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createAppStore } from './index';

describe('previewSlice', () => {
  it('starts off with no url', () => {
    const store = createAppStore();
    expect(store.getState().devStatus).toBe('off');
    expect(store.getState().devUrl).toBeNull();
    expect(store.getState().device).toBe('desktop');
  });

  it('bumps refreshKey on refresh', () => {
    const store = createAppStore();
    const before = store.getState().refreshKey;
    store.getState().refresh();
    expect(store.getState().refreshKey).toBe(before + 1);
  });

  it('accumulates dev log chunks', () => {
    const store = createAppStore();
    store.getState().appendDevLog('one\n');
    store.getState().appendDevLog('two\n');
    expect(store.getState().devLog).toBe('one\ntwo\n');
  });

  it('enters and exits preview', () => {
    const store = createAppStore();
    store.getState().enterPreview();
    expect(store.getState().inPreview).toBe(true);
    store.getState().exitPreview();
    expect(store.getState().inPreview).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm it fails, then implement**

Run: `npx vitest run src/store/previewSlice.test.ts` → FAIL. Write the slice, compose it into `AppState`, rerun → PASS.

`enterPreview`/`exitPreview` in `App.jsx:1422-1443` also touch `previewSrc` and `previewPathRef`. The **ref** stays in the component (it is a DOM ref); only the state moves.

- [ ] **Step 3: Verify and commit**

```bash
npx vitest run --reporter=dot && npm run typecheck
git add src/store/
git commit -m "feat: add preview store slice"
```

---

### Task 15: Document and history slices

**Files:**
- Create: `src/store/documentSlice.ts`, `src/store/historySlice.ts`, `src/store/historySlice.test.ts`
- Modify: `src/store/index.ts`

**Interfaces:**
- Consumes: `PageModel`, `PageState` from `src/types/ast.d.ts`; `PageEntry` from `src/types/ipc.d.ts`.
- Produces:
  - `DocumentSlice`: `currentPage: PageEntry | null`, `editStack: PageEntry[]`, `pageState: PageState | null`, `setCurrentPage`, `setEditStack`, `setPageState`, `markClean()`
  - `HistorySlice`: `past: Snapshot[]`, `future: Snapshot[]`, `lastPush: number`, `lastKey: string | null`, `pushHistory(coalesceKey?: string | null)`, `undo()`, `redo()`, `resetHistory()`, `canUndo()`, `canRedo()`
  - `type Snapshot = { kind: 'model'; model: PageModel } | { kind: 'source'; source: string }`

**This is the highest-risk task in the plan.** The 800 ms coalesce window, the 100-entry cap, and the `future`-clearing rule are behavioral contracts. Tasks 3's tests must stay green.

`applySnapshot` in `App.jsx:711-727` also clears the selection when the restored model no longer contains the selected node, and calls `scheduleSaveRef.current(true)`. In the store, the selection clearing moves into `applySnapshot`; the save call is left to the caller — `useAutoSave` (Task 19) subscribes to `pageState` and schedules the write. Do not call save from inside the history slice.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { PageModel } from '../types/ast';
import { createAppStore } from './index';

function model(id: string): PageModel {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [{ id: 'n1', kind: 'element', name: 'section', props: { id: { type: 'string', value: id } }, children: [] }],
  };
}

function seeded() {
  const store = createAppStore();
  store.getState().setPageState({ editable: true, model: model('a'), dirty: false });
  return store;
}

describe('historySlice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses same-key pushes inside 800ms', () => {
    const store = seeded();
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(100);
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(100);
    store.getState().pushHistory('prop:n1:id');
    expect(store.getState().past).toHaveLength(1);
  });

  it('does not collapse once 800ms has elapsed', () => {
    const store = seeded();
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(801);
    store.getState().pushHistory('prop:n1:id');
    expect(store.getState().past).toHaveLength(2);
  });

  it('never collapses a null key', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    store.getState().pushHistory(null);
    expect(store.getState().past).toHaveLength(2);
  });

  it('does not collapse across different keys', () => {
    const store = seeded();
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(10);
    store.getState().pushHistory('prop:n1:class');
    expect(store.getState().past).toHaveLength(2);
  });

  it('caps past at 100 entries, dropping the oldest', () => {
    const store = seeded();
    for (let i = 0; i < 120; i += 1) {
      store.getState().pushHistory(null);
    }
    expect(store.getState().past).toHaveLength(100);
  });

  it('clears the future on a new push', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    store.getState().undo();
    expect(store.getState().future).toHaveLength(1);
    store.getState().pushHistory(null);
    expect(store.getState().future).toHaveLength(0);
  });

  it('snapshots deeply so later mutation cannot corrupt history', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    const live = store.getState().pageState as { model: PageModel };
    live.model.nodes[0].props.id = { type: 'string', value: 'MUTATED' };
    store.getState().undo();
    const restored = store.getState().pageState as { model: PageModel };
    expect(restored.model.nodes[0].props.id).toEqual({ type: 'string', value: 'a' });
  });

  it('undo and redo are no-ops on empty stacks', () => {
    const store = seeded();
    expect(() => store.getState().undo()).not.toThrow();
    expect(() => store.getState().redo()).not.toThrow();
    expect(store.getState().past).toHaveLength(0);
  });

  it('clears the selection when the restored model lost the selected node', () => {
    const store = seeded();
    store.getState().select('gone');
    store.getState().pushHistory(null);
    store.getState().undo();
    expect(store.getState().selectedId).toBeNull();
  });

  it('keeps the selection when the restored model still has the node', () => {
    const store = seeded();
    store.getState().select('n1');
    store.getState().pushHistory(null);
    store.getState().undo();
    expect(store.getState().selectedId).toBe('n1');
  });

  it('resetHistory empties both stacks', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    store.getState().resetHistory();
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().future).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npx vitest run src/store/historySlice.test.ts`
Expected: FAIL — `pushHistory is not a function`.

- [ ] **Step 3: Write `documentSlice.ts`**

Straight field-holder; `markClean` sets `pageState.dirty = false`, matching `flushSave`'s tail at `src/App.jsx:583`.

- [ ] **Step 4: Write `historySlice.ts`**

Port `snapshotOf`, `pushHistory`, `applySnapshot`, `undo`, and `redo` from `src/App.jsx:685-755`. The `historyRef` object becomes four store fields. `structuredClone` stays — it is what makes the deep-snapshot test pass.

```ts
import type { StateCreator } from 'zustand';
import type { PageModel, PageState } from '../types/ast';
import { findNodeById } from '../model/nodes';
import type { DocumentSlice } from './documentSlice';
import type { SelectionSlice } from './selectionSlice';

export type Snapshot =
  | { kind: 'model'; model: PageModel }
  | { kind: 'source'; source: string };

const COALESCE_MS = 800;
const MAX_HISTORY = 100;

export interface HistorySlice {
  past: Snapshot[];
  future: Snapshot[];
  lastPush: number;
  lastKey: string | null;
  pushHistory: (coalesceKey?: string | null) => void;
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function snapshotOf(state: PageState): Snapshot {
  return state.editable
    ? { kind: 'model', model: structuredClone(state.model) }
    : { kind: 'source', source: state.source };
}

export const createHistorySlice: StateCreator<
  HistorySlice & DocumentSlice & SelectionSlice,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  past: [],
  future: [],
  lastPush: 0,
  lastKey: null,

  pushHistory: (coalesceKey = null) => {
    const state = get().pageState;
    if (!state) return;
    const { past, lastKey, lastPush } = get();
    const now = Date.now();
    const coalesce =
      coalesceKey !== null &&
      coalesceKey === lastKey &&
      now - lastPush < COALESCE_MS &&
      past.length > 0;

    const nextPast = coalesce ? past : [...past, snapshotOf(state)].slice(-MAX_HISTORY);
    set({ past: nextPast, future: [], lastKey: coalesceKey, lastPush: now });
  },

  undo: () => {
    const { past, future, pageState } = get();
    if (!past.length || !pageState) return;
    const entry = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [...future, snapshotOf(pageState)],
      lastKey: null,
      lastPush: 0,
    });
    applySnapshot(set, get, entry);
  },

  redo: () => {
    const { past, future, pageState } = get();
    if (!future.length || !pageState) return;
    const entry = future[future.length - 1];
    set({
      future: future.slice(0, -1),
      past: [...past, snapshotOf(pageState)],
      lastKey: null,
      lastPush: 0,
    });
    applySnapshot(set, get, entry);
  },

  resetHistory: () => set({ past: [], future: [], lastPush: 0, lastKey: null }),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
});

function applySnapshot(
  set: (partial: Partial<HistorySlice & DocumentSlice & SelectionSlice>) => void,
  get: () => HistorySlice & DocumentSlice & SelectionSlice,
  entry: Snapshot
) {
  const current = get().pageState;
  if (!current) return;
  if (entry.kind === 'model') {
    set({
      pageState: {
        ...current,
        editable: true,
        model: structuredClone(entry.model),
        dirty: true,
      } as PageState,
    });
    const id = get().selectedId;
    if (id && id !== 'layout' && !findNodeById(entry.model.nodes ?? [], id)) {
      set({ selectedId: null });
    }
  } else {
    set({ pageState: { ...current, source: entry.source, dirty: true } as PageState });
  }
}
```

- [ ] **Step 5: Compose and run**

Add both slices to `AppState` in `src/store/index.ts`.

Run: `npx vitest run src/store/historySlice.test.ts`
Expected: `11 passed`.

Note the cap: the original used `past.push()` then `if (past.length > 100) past.shift()`, which caps at 100. `.slice(-100)` matches. Verify the cap test passes; if it reports 101, re-read the original.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run --reporter=dot && npm run typecheck
git add src/store/
git commit -m "feat: add document and history store slices"
```

---

### Task 16: Pure model mutations

**Files:**
- Create: `src/store/mutations.ts`, `src/store/mutations.test.ts`

**Interfaces:**
- Consumes: `src/model/nodes.ts`, `src/model/imports.ts`, `src/model/loops.ts`.
- Produces: pure `(model, args) => PageModel` functions, one per edit. Task 17 wires them to the store.

Names must match the current `App.jsx` handlers exactly so Task 17's rewiring is mechanical:
`setProp`, `renameProp`, `changeElementTag`, `setNodeText`, `setNodeContent`, `setNodeInline`, `setFrontmatter`, `moveNode`, `removeNode`, `duplicateNode`, `insertIntoModel`, `wrapInLayout`, `unwrapLayout`, `renameLayout`.

Each takes the model **already cloned** by the caller and may mutate it freely — that matches `mutateModel`'s existing `fn(structuredClone(s.model))` contract at `src/App.jsx:770-782`.

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(m.nodes[0].children![0].props.class).toEqual({ type: 'string', value: 'title' });
  });
  it('deletes the prop when the value is undefined', () => {
    const m = setProp(model(), 'a', 'id', undefined);
    expect(m.nodes[0].props).not.toHaveProperty('id');
  });
  it('is a no-op for an unknown node', () => {
    const m = setProp(model(), 'zzz', 'id', { type: 'string', value: 'x' });
    expect(m.nodes[0].props.id).toEqual({ type: 'string', value: 'hero' });
  });
  it('creates the props bag when a node has none', () => {
    const m = setProp(model(), 'b', 'id', { type: 'string', value: 'x' });
    expect(m.nodes[0].children![0].props.id).toEqual({ type: 'string', value: 'x' });
  });
});

describe('renameProp', () => {
  it('preserves the value and its position', () => {
    const m = renameProp(model(), 'a', 'id', 'data-id');
    expect(Object.keys(m.nodes[0].props)).toEqual(['data-id']);
    expect(m.nodes[0].props['data-id']).toEqual({ type: 'string', value: 'hero' });
  });
  it('is a no-op when the new name is empty or unchanged', () => {
    expect(Object.keys(renameProp(model(), 'a', 'id', '').nodes[0].props)).toEqual(['id']);
    expect(Object.keys(renameProp(model(), 'a', 'id', 'id').nodes[0].props)).toEqual(['id']);
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
```

- [ ] **Step 2: Confirm it fails**

Run: `npx vitest run src/store/mutations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Port the mutation bodies**

For each handler in `src/App.jsx`, lift the function passed to `mutateModel` into a named export. `setProp` is the template:

```ts
import type { PageModel, PropValue } from '../types/ast';
import { findNodeById } from '../model/nodes';

/** Mutates and returns `model`. Callers pass an already-cloned model. */
export function setProp(
  model: PageModel,
  nodeId: string,
  propName: string,
  value: PropValue | undefined
): PageModel {
  const node = findNodeById(model.nodes, nodeId);
  if (!node || !('props' in node)) return model;
  if (!node.props) node.props = {};
  if (value === undefined) delete node.props[propName];
  else node.props[propName] = value;
  return model;
}
```

Source lines to lift from: `setProp` `:1521-1537`, `renameProp` `:1540-1560`, `changeElementTag` `:1562-1596`, `setNodeText` `:1598-1632`, `setFrontmatter` `:1634-1656`, `setNodeContent` `:1658-1677`, `setNodeInline` `:1679-1699`, `moveNode` `:888-928`, `removeNode` `:930-951`, `duplicateNode` `:982-1006`, `insertIntoModel` `:2586-2601`.

`changeLayout` (`:1702-1750`) is async — it awaits `importPathFor`. Split it: the pure parts become `wrapInLayout(model, layoutName, importPath)`, `unwrapLayout(model)`, and `renameLayout(model, layoutName, importPath)`; the `await` stays in the store action (Task 17).

Add tests for each ported function following the pattern above. Every function needs at least a happy path and a no-op path.

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/store/mutations.test.ts && npm run typecheck`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/store/mutations.ts src/store/mutations.test.ts
git commit -m "feat: extract model edits as pure, tested mutations"
```

---

### Task 17: Wire App.jsx to the store

**Files:**
- Modify: `src/App.jsx` (large), `src/store/documentSlice.ts`

**Interfaces:**
- Consumes: every slice from Tasks 12-16.
- Produces: an `App.jsx` that reads and writes the store, with all mirror refs deleted. Its JSX and prop-passing are **unchanged** — Phase 3 handles those.

This is the largest single diff. Do it in the sub-steps below and run the full suite after each, so a regression is attributable.

- [ ] **Step 1: Add `mutateModel` and `setRawSource` to `documentSlice.ts`**

```ts
mutateModel: (
  fn: (model: PageModel) => PageModel,
  immediate = false,
  coalesceKey: string | null = null
) => {
  get().pushHistory(coalesceKey);
  const state = get().pageState;
  if (!state || !state.editable) return;
  set({
    pageState: { ...state, model: fn(structuredClone(state.model)), dirty: true },
  });
  get().scheduleSave(immediate);
},
```

`scheduleSave` lands on the document slice too, holding its timer id in a module-scoped variable rather than a ref. Port the body from `src/App.jsx:756-768` unchanged, keeping `300` and `0`.

- [ ] **Step 2: Replace the useState declarations**

Delete `src/App.jsx:352-398`'s `useState` calls and read from the store instead. Use one selector per field so a change to `devLog` does not re-render on `selectedId`:

```js
const project = useAppStore((s) => s.project);
const scan = useAppStore((s) => s.scan);
const pageState = useAppStore((s) => s.pageState);
const selectedId = useAppStore((s) => s.selectedId);
// …one line per field
```

Grab actions once — they are stable identities, so this does not subscribe to anything:

```js
const { setProject, setScan, select, showToast, mutateModel } = useAppStore.getState();
```

- [ ] **Step 3: Run the suite**

Run: `npx vitest run --reporter=dot`
Expected: PASS. If Task 3/4/5's tests fail here, the store wiring changed behavior — fix the wiring, not the tests.

- [ ] **Step 4: Delete the mirror refs**

Remove `pageStateRef`, `selectedIdRef`, `editStackRef`, `inPreviewRef`, `projectRef`, `devLogRef`, `cmsOpenRef`, and `scheduleSaveRef` (`src/App.jsx:415-425`, `:852`, `:728`, `:1254`) along with their assignment lines. Replace every read with `getState()`:

```js
// Before: const { currentPage: page, pageState: state } = pageStateRef.current;
const { currentPage: page, pageState: state } = getState();
```

**Keep** `previewFrameRef`, `previewIframeRef`, `previewPathRef`, `saveTimer`, `fileSaveTimer`, `rightTabRefs`, `tabBeforePick`, `tabSelRef`, `layoutSeq` — those are DOM handles and timer ids, not state mirrors.

- [ ] **Step 5: Run the suite again**

Run: `npx vitest run --reporter=dot`
Expected: PASS.

- [ ] **Step 6: Replace the mutation handlers with store calls**

Each `useCallback` that wrapped a `mutateModel(fn, …)` becomes a call into `src/store/mutations.ts`:

```js
const setProp = useCallback(
  (nodeId, propName, value, immediate = false) =>
    mutateModel((m) => mutations.setProp(m, nodeId, propName, value), immediate, `prop:${nodeId}:${propName}`),
  [mutateModel]
);
```

The coalesce keys must match the originals character for character — `prop:${nodeId}:${propName}`, `'raw-source'`, and the `true`/`null` immediates. A changed key silently changes undo granularity, and Task 3's tests will catch only some of it.

- [ ] **Step 7: Full verification**

Run: `npx vitest run --reporter=dot && npm run typecheck && npm run check:electron`
Expected: all PASS.

- [ ] **Step 8: Manual smoke test**

The automated tests do not cover the live preview. Run the app and confirm by hand:

```bash
npm run dev
```

- Open a project; the page tree renders.
- Edit a prop; the preview iframe updates and does **not** flash or remount.
- Cmd+Z / Cmd+Shift+Z undo and redo.
- Switch pages; undo history resets.
- Enter and exit full preview.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx src/store/
git commit -m "refactor: move App state into the zustand store and drop mirror refs"
```

---

### Task 18: Derived selectors

**Files:**
- Create: `src/store/selectors.ts`, `src/store/selectors.test.ts`
- Modify: `src/App.jsx:1877-2053` (replace inline computation with selector calls)

**Interfaces:**
- Consumes: `AppState`, `src/model/nodes.ts`, `src/elementSchemas.js`.
- Produces, each as `(state: AppState) => T`:
  `selectModel`, `selectFrontmatterCode`, `selectSelectedNode`, `selectLayoutNode`, `selectCurrentLayoutName`, `selectSelectedSchema`, `selectSlotOptions`, `selectLoopContext`, `selectLinkContext`, `selectCrumbs`, `selectInsertables`, plus `pathFor(state, id)` and `overlayInfo(state, path)`.

This is the task that ends prop drilling — Phase 3 consumes these directly.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createAppStore } from './index';
import {
  selectCurrentLayoutName,
  selectInsertables,
  selectLinkContext,
  selectModel,
  selectSelectedNode,
} from './selectors';

function seeded() {
  const store = createAppStore();
  store.getState().setScan({
    pages: [{ name: 'index', path: '/p/src/pages/index.astro', route: '/' }],
    layouts: [{ name: 'BaseLayout', path: '/p/src/layouts/BaseLayout.astro' }],
    components: [{ name: 'Card', path: '/p/src/components/Card.astro' }],
  });
  store.getState().setPageState({
    editable: true,
    dirty: false,
    model: {
      imports: [{ name: 'Layout', path: '../layouts/BaseLayout.astro' }],
      extraFrontmatter: '',
      nodes: [
        {
          id: 'layout',
          kind: 'component',
          name: 'Layout',
          props: {},
          children: [
            {
              id: 'a',
              kind: 'element',
              name: 'section',
              props: { id: { type: 'string', value: 'hero' } },
              children: [],
            },
          ],
        },
      ],
    },
  });
  return store;
}

describe('selectors', () => {
  it('returns null model when the page is not editable', () => {
    const store = createAppStore();
    store.getState().setPageState({ editable: false, reason: 'raw', source: '<p/>' });
    expect(selectModel(store.getState())).toBeNull();
  });

  it('resolves the layout name through its local import alias', () => {
    // The page imports BaseLayout.astro as `Layout`; the picker must show
    // the scanned file name, not the alias.
    expect(selectCurrentLayoutName(seeded())).toBe('BaseLayout');
  });

  it('returns the selected node', () => {
    const store = seeded();
    store.getState().select('a');
    expect(selectSelectedNode(store.getState())?.name).toBe('section');
  });

  it('returns null when nothing is selected', () => {
    expect(selectSelectedNode(seeded().getState())).toBeNull();
  });

  it('collects section ids for anchor links', () => {
    expect(selectLinkContext(seeded().getState()).sectionIds).toEqual(['hero']);
  });

  it('lists components before layouts so components win a name collision', () => {
    const names = selectInsertables(seeded().getState()).map((c) => c.name);
    expect(names).toEqual(['Card', 'BaseLayout']);
  });
});
```

Note: `selectCurrentLayoutName(seeded())` in the second test takes the store, not the state — fix that call to `selectCurrentLayoutName(seeded().getState())` when you run it.

- [ ] **Step 2: Confirm it fails**

Run: `npx vitest run src/store/selectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Port the computations verbatim**

Lift each from `src/App.jsx`, changing only the input from closure variables to `state`:

| Selector | Source |
| --- | --- |
| `selectModel` | `:1877` |
| `selectFrontmatterCode` | `:1881-1887` |
| `selectSelectedNode` | `:1888-1893` |
| `selectLayoutNode` | `:1894` |
| `selectCurrentLayoutName` | `:1898-1906` |
| `selectSelectedSchema` | `:1907-1925` (includes the `schemaFor` helper) |
| `selectSlotOptions` | `:1936-1948` |
| `selectLoopContext` | `:1950-1962` |
| `selectLinkContext` | `:1964-1975` |
| `selectCrumbs` | `:1977-2003`, `:2144-2154` |
| `selectInsertables` | `:410-413` |
| `pathFor` | `:2155-2163` |
| `overlayInfo` | `:2189-2234` |

`selectSelectedSchema` and `selectSlotOptions` are non-trivial — `schemaFor` merges an element's built-in schema when a component declares `extends HTMLAttributes<"tag">`. Copy the logic exactly.

- [ ] **Step 4: Memoize the expensive ones**

`selectCrumbs`, `selectSelectedSchema`, and `selectInsertables` walk the tree. Wrap them so referential equality holds between renders:

```ts
import { useShallow } from 'zustand/react/shallow';
// In components: useAppStore(useShallow(selectCrumbs))
```

For selectors returning fresh objects each call (`selectLinkContext`, `selectLoopContext`), consumers **must** use `useShallow` or they will re-render on every store change. Note this in a comment above each such selector.

- [ ] **Step 5: Replace App.jsx's inline computations**

Delete `src/App.jsx:1877-2053`'s inline derivations and call the selectors instead. The props being passed down do not change yet.

- [ ] **Step 6: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS and exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/store/selectors.ts src/store/selectors.test.ts src/App.jsx
git commit -m "feat: extract derived values as memoizable store selectors"
```

---

## Phase 3 — Panels and layout

### Task 19: Extract effect hooks

**Files:**
- Create: `src/hooks/useProjectWatcher.ts`, `src/hooks/useDevServer.ts`, `src/hooks/useAutoSave.ts`, `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: the store and `window.avb`.
- Produces: `useProjectWatcher()`, `useDevServer()`, `useAutoSave()`, `useKeyboardShortcuts()` — each takes no arguments and returns `void`, reading everything from the store.

Effects stay in React because `window.avb.on*` subscriptions need mount/unmount lifecycles. Moving them out of `App.jsx` is what makes the component readable.

- [ ] **Step 1: Move the file-watcher effect**

`src/App.jsx:796-851` (`onFsChanged`) becomes `useProjectWatcher`. It reads `getState().project` rather than closing over `projectRef`:

```ts
import { useEffect } from 'react';
import { getState } from '../store';

export function useProjectWatcher() {
  useEffect(() => {
    const off = window.avb.onFsChanged(async ({ files }) => {
      const project = getState().project;
      if (!project) return;
      // …body unchanged from App.jsx:798-850
    });
    return off;
  }, []);
}
```

The empty dependency array is correct **because** the callback reads through `getState()`. Do not add dependencies.

- [ ] **Step 2: Run the suite**

Run: `npx vitest run --reporter=dot`
Expected: PASS.

- [ ] **Step 3: Move the dev-server effects**

`src/App.jsx:1444-1470` (`onDevLog`, `onDevExit`), `:436-444` (`diagnose`), and `:513-539` (`startPreview`) become `useDevServer`.

- [ ] **Step 4: Move the auto-save effect**

`useAutoSave` owns the debounce timer and `flushSave` (`src/App.jsx:575-589`, `:756-768`). It subscribes to `pageState.dirty` and schedules the write. **Keep the `setTimeout(…, 0)` for immediate saves** — the comment at `:753-755` explains why, and Task 4's tests enforce it.

- [ ] **Step 5: Move the shortcut effects**

`src/App.jsx:1087-1144`, `:1357-1421`, `:1457-1520` (menu handlers, key handlers, preview `postMessage` shortcuts) become `useKeyboardShortcuts`.

- [ ] **Step 6: Call them from App**

```js
useProjectWatcher();
useDevServer();
useAutoSave();
useKeyboardShortcuts();
```

- [ ] **Step 7: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS and exit 0. Then `npm run dev` and repeat Task 17 Step 8's manual smoke test — these effects are what the automated tests cover least.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/ src/App.jsx
git commit -m "refactor: extract IPC and shortcut effects into focused hooks"
```

---

### Task 20: PreviewPane off props

**Files:**
- Modify: `src/panels/PreviewPane.jsx` → `src/panels/PreviewPane.tsx`, `src/App.jsx:2394-2500`
- Modify: `src/App.test.jsx:62-68` (the `PreviewPane` mock)

**Interfaces:**
- Consumes: `selectCrumbs`, `pathFor`, `overlayInfo`, `selectModel` (Task 18); `previewSlice` (Task 14).
- Produces: `<PreviewPane onSelectPath={fn} onRestart={fn} />` — two props, down from 20.

`onSelectPath` and `onRestart` stay as props: `onSelectPath` (`src/App.jsx:2410-2450`) closes over component-focus logic that calls `closeComponent`, and `onRestart` calls the dev-server lifecycle. Both are behavior, not state.

- [ ] **Step 1: Rename and add types**

```bash
git mv src/panels/PreviewPane.jsx src/panels/PreviewPane.tsx
```

- [ ] **Step 2: Replace the props with selectors**

Delete these 18 from the signature and read them from the store inside the component:

`devUrl`, `devStatus`, `devLog`, `devDiag`, `route`, `refreshKey`, `crumbs`, `onCrumb`, `onRefresh`, `selPath`, `navHoverPath`, `overlayInfo`, `focusPath`, `device`, `onDevice`, and the remaining three visible at `src/App.jsx:2394-2409`.

```tsx
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store';
import { overlayInfo, pathFor, selectCrumbs } from '../store/selectors';

interface PreviewPaneProps {
  onSelectPath: (path: string | null) => void;
  onRestart: () => void;
}

export default function PreviewPane({ onSelectPath, onRestart }: PreviewPaneProps) {
  const devUrl = useAppStore((s) => s.devUrl);
  const devStatus = useAppStore((s) => s.devStatus);
  const devLog = useAppStore((s) => s.devLog);
  const devDiag = useAppStore((s) => s.devDiag);
  const refreshKey = useAppStore((s) => s.refreshKey);
  const device = useAppStore((s) => s.device);
  const crumbs = useAppStore(useShallow(selectCrumbs));
  const selPath = useAppStore((s) => pathFor(s, s.selectedId));
  const navHoverPath = useAppStore((s) => pathFor(s, s.hoverNodeId));
  const { setDevice, refresh, select } = useAppStore.getState();
  // …render unchanged, with onCrumb → select, onRefresh → refresh, onDevice → setDevice
}
```

- [ ] **Step 3: Update the call site**

`src/App.jsx:2394` becomes:

```jsx
<PreviewPane onSelectPath={handleSelectPath} onRestart={() => startPreview(project.path)} />
```

with `handleSelectPath` holding the body currently inlined at `:2410-2450`.

- [ ] **Step 4: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS. `src/App.test.jsx`'s mock replaces the whole module, so it needs no change — but confirm it still resolves the `.tsx` path (Vite resolves extensionless mocks; the mock uses `'./panels/PreviewPane.jsx'`, which will **fail** after the rename). Update that string to `'./panels/PreviewPane.tsx'` in `src/App.test.jsx` and in the Task 3/4/5 test files.

- [ ] **Step 5: Manual check — the re-render regression risk**

Run `npm run dev`. Type into a prop field and confirm the preview iframe does not remount (the page does not flash). This is the specific regression selectors are meant to prevent; a full-tree re-render would remount the iframe.

- [ ] **Step 6: Commit**

```bash
git add src/panels/PreviewPane.tsx src/App.jsx src/App.test.jsx src/App.*.test.jsx
git commit -m "refactor: PreviewPane reads from the store instead of 20 props"
```

---

### Task 21: StructurePanel off props

**Files:**
- Modify: `src/panels/StructurePanel.jsx` → `.tsx`, `src/App.jsx:2337-2393`

**Interfaces:**
- Produces: `<StructurePanel onOpenComponent={fn} onDropComponent={fn} />`.

Of the 16 current props (`src/panels/StructurePanel.jsx:29-46`): `pageState`, `layouts`, `currentLayoutName`, `selectedId`, `revealTick`, `hasClipboard` become selectors; `onSelect`, `onHoverNode`, `onChangeLayout`, `onMoveNode`, `onRemoveNode`, `onCopyNode`, `onDuplicateNode`, `onPasteNode`, `onRawChange` become store actions. `onOpenComponent` and `onDropComponent` stay props — both are async and touch `importPathFor`.

- [ ] **Step 1: Rename, convert, and type the local state**

```bash
git mv src/panels/StructurePanel.jsx src/panels/StructurePanel.tsx
```

`dropTarget` (`:47`) and the collapse-override map (`:49`) are local component state and stay as `useState`. Type them:

```tsx
type DropTarget = { parentId: string; index: number } | { intoId: string } | null;
const [dropTarget, setDropTarget] = useState<DropTarget>(null);
```

- [ ] **Step 2: Swap props for store reads**

```tsx
const pageState = useAppStore((s) => s.pageState);
const layouts = useAppStore((s) => s.scan.layouts);
const currentLayoutName = useAppStore(selectCurrentLayoutName);
const selectedId = useAppStore((s) => s.selectedId);
const revealTick = useAppStore((s) => s.revealTick);
const { select, setHoverNode, changeLayout, moveNode, removeNode, copyNode,
        duplicateNode, pasteNode, setRawSource } = useAppStore.getState();
```

- [ ] **Step 3: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual check**

`npm run dev`, then: drag a palette item onto a gap and onto a node row; reorder an existing node; collapse and expand; select a node and confirm the row scrolls into view.

- [ ] **Step 5: Commit**

```bash
git add src/panels/StructurePanel.tsx src/App.jsx
git commit -m "refactor: StructurePanel reads from the store instead of 16 props"
```

---

### Task 22: PropsPanel and StylePanel off props

**Files:**
- Modify: `src/panels/PropsPanel.jsx`, `src/panels/StylePanel.jsx`, `src/App.jsx:2504-2560`

**Interfaces:**
- Produces: `<PropsPanel onOpenCode={fn} />` and `<StylePanel />`.

`PropsPanel` is 1,331 lines. **Do not restructure its internals** — only replace its 19-prop signature with store reads. Its `allowAttrs` computation (`src/App.jsx:2523-2532`) moves into a `selectAllowAttrs` selector in `src/store/selectors.ts`; add a test for it alongside Task 18's.

- [ ] **Step 1: Add `selectAllowAttrs` to selectors**

```ts
/** An element, a dynamic tag, or a component that spreads ...rest takes attributes. */
export const selectAllowAttrs = (state: AppState): boolean => {
  const node = selectSelectedNode(state);
  if (!node) return false;
  if (node.kind === 'element') return true;
  if ('dynamicTag' in node && node.dynamicTag) return true;
  return (
    node.kind === 'component' &&
    !!selectInsertables(state).find((c) => c.name === node.name)?.hasRest
  );
};
```

Add a test covering all four branches.

- [ ] **Step 2: Convert both panels to store reads**

`PropsPanel` keeps `onOpenCode` as a prop (it drives `codeWin`, which is a UI concern App owns). Everything else — `node`, `isLayout`, `layouts`, `currentLayoutName`, `schema`, `slotOptions`, `loopContext`, `linkContext`, `projectClasses`, `allowAttrs`, `projectPath`, and the nine `on*` handlers — comes from the store.

`StylePanel` takes zero props: `project`, `model`, `node`, and `device` are all selectors, and `onWriteStyleNode`/`onSelectNode` are store actions.

- [ ] **Step 3: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual check**

`npm run dev`: edit a prop, rename a prop, change an element's tag, switch layouts, and edit a style — each must still update the preview.

- [ ] **Step 5: Commit**

```bash
git add src/panels/PropsPanel.jsx src/panels/StylePanel.jsx src/store/selectors.ts src/store/selectors.test.ts src/App.jsx
git commit -m "refactor: PropsPanel and StylePanel read from the store"
```

---

### Task 23: Decompose the render tree

**Files:**
- Create: `src/layout/AppShell.tsx`, `src/layout/TitleBar.tsx`, `src/layout/LeftDock.tsx`, `src/layout/RightDock.tsx`, `src/layout/Overlays.tsx`
- Modify: `src/App.jsx:2240-2585`

**Interfaces:**
- Produces: `<AppShell />`, taking no props. All five components read from the store.

The ~350-line JSX at `src/App.jsx:2240-2585` splits along the boundaries already visible in its markup.

- [ ] **Step 1: Extract `TitleBar.tsx`**

`src/App.jsx:2242-2302` — the `.titlebar` div: project name, back button / `PageSwitcher`, dev-status dot, refresh, url, external-open, preview toggle, `GitChip`.

`GitChip` keeps its four props (`project`, `showToast`, `flushSave`, `onWorktreeChanged`) for now — it is self-contained and not in this refactor's scope.

- [ ] **Step 2: Run the suite**

Run: `npx vitest run --reporter=dot`
Expected: PASS.

- [ ] **Step 3: Extract `LeftDock.tsx`**

`src/App.jsx:2304-2393` — `LeftRail`, the mounted `TerminalPanel`, and the `leftTab` switch over `PagesPanel` / `StructurePanel` / `PalettePanel` / `AssetsPanel` / `CmsPanel`.

- [ ] **Step 4: Extract `RightDock.tsx`**

`src/App.jsx:2500-2560` — the style/settings tab strip plus `StylePanel` and `PropsPanel`. The tab-indicator refs (`rightTabRefs`, `rightTabInd`) move with it; they are DOM measurements and belong here, not in the store.

- [ ] **Step 5: Extract `Overlays.tsx`**

`src/App.jsx:2562-2584` — `CodeWindow`, `InsertSearch`, `BusyOverlay`, `Toast`, and the asset picker.

- [ ] **Step 6: Compose `AppShell.tsx`**

```tsx
export default function AppShell() {
  return (
    <div className="app">
      <TitleBar />
      <div className="main">
        <LeftDock />
        <PreviewPane onSelectPath={/* … */} onRestart={/* … */} />
        <RightDock />
      </div>
      <Overlays />
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx vitest run --reporter=dot && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Manual check**

`npm run dev` and walk every panel: each left tab, both right tabs, the code window, insert search, and a toast.

- [ ] **Step 9: Commit**

```bash
git add src/layout/ src/App.jsx
git commit -m "refactor: split the App render into composed layout components"
```

---

### Task 24: Convert App to TypeScript and close out

**Files:**
- Modify: `src/App.jsx` → `src/App.tsx`, `src/main.jsx`, `tsconfig.json`

**Interfaces:**
- Produces: a typed `App.tsx` under 300 lines, with `checkJs` enabled repo-wide.

- [ ] **Step 1: Rename and fix imports**

```bash
git mv src/App.jsx src/App.tsx
```

Update `src/main.jsx`'s import and the `import App from './App.jsx'` line in `src/App.test.jsx`, `src/App.history.test.jsx`, `src/App.save.test.jsx`, and `src/App.layout.test.jsx`.

- [ ] **Step 2: Type what remains**

`App.tsx` should now hold only: the welcome/no-project branch, the four hook calls, the handful of async handlers that stay props (`handleSelectPath`, `openComponent`, `closeComponent`, `addComponent`, `insertItem`), and `<AppShell />`.

Also move `cleanError` (`src/App.jsx:2615`) and `stripAnsi` (`:2620`) to `src/model/errors.ts` — `cleanError` is exported and used elsewhere, so grep for its importers and update them:

```bash
grep -rn "cleanError" src/ --include=*.jsx --include=*.tsx --include=*.js --include=*.ts
```

- [ ] **Step 3: Enable checkJs repo-wide**

In `tsconfig.json`, set `"checkJs": true`. Fix whatever surfaces in the remaining `.js`/`.jsx` files, using Task 9's rules. If the backlog is large, do it in per-file commits.

- [ ] **Step 4: Full verification**

```bash
npm run typecheck
npx vitest run --reporter=dot
npm run check:electron
npm run build
```

Expected: all four succeed. `npm run build` matters — it proves Vite still bundles after the renames.

- [ ] **Step 5: Confirm the goals were met**

```bash
wc -l src/App.tsx                          # target: < 300
grep -c "useState" src/App.tsx             # target: 0
grep -n "Ref = useRef" src/App.tsx         # target: DOM refs only
```

Report the actual numbers. If `App.tsx` is still over 300 lines, say what is left in it rather than forcing a split.

- [ ] **Step 6: Manual regression pass**

`npm run dev`, then exercise: open project, edit props, undo/redo, drag in the navigator, change layout, open a component and back out, CMS view, terminal, assets, full preview, and the code window.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: convert App to TypeScript and enable checkJs repo-wide"
```

---

## Self-Review

**Spec coverage:**

| Design section | Task(s) |
| --- | --- |
| Store shape — 7 slices | 12, 13, 14, 15 |
| Effects stay in React as hooks | 19 |
| Derived values become selectors | 18, 22 |
| Mutations become pure functions | 16 |
| `src/model/` shared vocabulary | 10, 11 |
| Mirror refs deleted | 17 |
| Layout decomposition | 23 |
| tsconfig, strict, typecheck script | 1 |
| `ast.d.ts` | 6 |
| `@ts-check` on astroParser | 7 |
| `ipc.d.ts` + drift test | 8 |
| style-panel triage | 9 |
| Character tests | 3, 4, 5 |
| `.worktrees` vitest fix | 1 |
| PR CI | 2, 9 |
| Undo 800 ms / 100-cap contract | 3, 15 |
| Save 300 ms / 0 ms contract | 4, 19 |

No gaps.

**Known sharp edges, called out where they occur:**

- Tasks 3-5's queries are written against markup not read in full; each says to fix the query, never the assertion.
- Task 18's second test calls `selectCurrentLayoutName(seeded())` instead of `seeded().getState()`; the step notes it.
- Task 9's scope depends on the Task 1 baseline count, which is unknown until Task 1 runs.
- Task 20 changes `src/App.test.jsx`'s mock path after the `.jsx` → `.tsx` rename; missing this breaks the existing terminal tests.

**Type consistency:** `findNodeById`, `pruneImports`, `chooseImportPath`, `mutateModel`, `pushHistory`, `select`, `showToast`, and the `select*` selector names are used identically across Tasks 10-24. `PageModel`, `AstroNode`, `PropValue`, `PageState`, `ScanResult`, `PageEntry`, and `ComponentEntry` all trace to Tasks 6 and 8.
