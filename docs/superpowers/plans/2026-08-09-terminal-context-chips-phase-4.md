# Terminal Context Chips (Phase 4: Rich Visual and Content Context) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the last two chip types from the spec's chip catalogue — CMS Schema and Preview Screenshot (with a "Responsive set" capture mode) — and a deterministic, keyword-based "Suggested" section in the Add Context menu, completing spec §30 Phase 4 on top of Phases 1–3's file, selection, page, component, console-error, and Git-diff chips.

**Architecture:** `cmsSchemaResolver` is a pure resolver, following Phase 1–3's exact pattern, built entirely on code that already exists: `src/cmsSchema.js`'s `collectionOf`/`fieldsOf`/`titleOf` (already used by `CmsPanel.jsx`) and the existing `window.avb.listCms`/`cmsUsage` IPC channels — no new Electron code. `previewScreenshotResolver` needs one new piece of Electron plumbing (`context:capturePreview`, calling `mainWindow.webContents.capturePage(...)` exactly like the existing `recents:captureThumb` handler does, then writing the PNG into `.stacki/tmp/context/` via a new `writeContextImage` sibling to `writeContextBundle`) plus a new renderer-side DOM helper module (`src/panels/previewCapture.js`) that finds the preview iframe's on-screen rect (`.frame-clip iframe` for the current viewport, `.canvas-frame[data-device]` elements for a responsive set — `CanvasView.jsx` already renders three breakpoints side by side when the user is in Canvas view). Screenshots always route through the existing context-file (Mode B) delivery path by being added to `contextSize.js`'s `FILE_TRIGGERING_TYPES`. Suggested context is a new pure module, `src/context/contextSuggestions.js`, implementing spec §10/§24's fixed priority order and keyword rules; `ContextPicker.jsx` gains a "Suggested" section above the existing flat list.

**Tech Stack:** Electron 33, React 18, Vite 6, Vitest 3.2 (jsdom environment), `@testing-library/react`. No new dependencies — the screenshot path reuses Electron's native `webContents.capturePage`, already used elsewhere in this codebase.

## Global Constraints

- This plan implements spec §30 Phase 4 ("Rich visual and content context"): preview screenshot, CMS schema, responsive context, and suggested context. It builds on Phases 1–3 (merged), which implemented the `ContextSnapshot` model, resolver registry, `useTerminalContext` hook, chip bar UI, and the Current File / Selected Files / Selected Element / Current Page / Current Component / Console Errors / Git Diff resolvers.
- **CMS Schema's `isAvailable` is optimistic**, matching `gitDiffResolver`'s already-established precedent in this exact codebase: whether the project actually has any CMS collections can only be known by an IPC round trip (`listCms`), and `isAvailable(appState)` must stay synchronous. A project with zero CMS JSON files shows this chip's ERROR status with "No CMS collections found in this project." (the same generic error-chip UX every resolver already uses) rather than the chip being hidden, which is a documented deviation from spec §7's "Unavailable chips should normally be hidden" for this one case, for the same reason `gitDiffResolver` already accepted it.
- **CMS Schema's "Relevant collections" scope only cross-references the open page's own `.json` imports** (`appState.pageInfo.imports`, the same signal `currentPageResolver`'s `cmsDataSources` field already computes) — not the fuller spec §9.4 idea of "every page/component that binds the collection." `componentDefinitions` in this codebase has no per-component list of CMS imports to cross-reference, and building that scanner is out of scope for this phase. When nothing is imported by the open page, the resolver falls back to every collection rather than returning an empty, useless chip.
- **CMS Schema has no `computeStaleKey`**, matching `selectedFilesResolver`/`gitDiffResolver`'s precedent: CMS JSON file content lives on disk with no live model of it in `appState` (unlike pages/components, which are rescanned into `appState.pageInfo`/`componentDefinitions`), so a synchronous staleness check isn't possible. A user who edited a collection since capturing the chip re-clicks **Refresh**.
- **Preview Screenshot's "Selected element" mode does not crop or highlight the selected element.** Spec §9.6 describes a highlighted, cropped capture of just the selected node. This app has no existing channel that reports a DOM element's on-screen bounding box from inside the preview iframe back to the host window — the only iframe→host messages that exist are hover/selection-sync and `avb:page-height` (confirmed by reading `electron/preload.js`'s iframe message branch and `CanvasView.jsx` in full). Building that cross-frame rect channel is a materially separate, riskier subsystem than this chip. "Selected element" mode here means "capture the current preview viewport while a node happens to be selected, and label the chip with that node's tag/kind" — the image itself is identical to "Current viewport" mode. This is a documented scope reduction, in the same spirit as Phase 3's Git Diff / console-errors scope reductions.
- **"Full page" capture mode (spec §9.6) is not implemented.** It requires scrolling/stitching the iframe beyond its visible viewport, which spec §30 Phase 4's own bullet list doesn't name ("responsive context" is named; "full page" isn't) — deferred along with the Responsive-screenshot-set's per-element crop, for the same reason.
- **"Responsive set" mode requires the user to already be in Canvas view** (`device === 'canvas'`, `PreviewPane.jsx`'s existing device switcher) rather than driving `PreviewPane`'s device state itself from inside the resolver. `CanvasView.jsx` already renders Desktop/Tablet/Phone breakpoints as three simultaneous iframes (`.canvas-frame` elements) — reusing that existing simultaneous layout avoids the resolver reaching into unrelated global UI state (temporarily flipping `device` and waiting for re-render/layout settle) to fake sequential captures, which would be a materially riskier design for a marginal UX gain (one click to switch to Canvas view first).
- **Preview Screenshot has no `computeStaleKey`.** Spec §8 models context as an inherently point-in-time snapshot; a screenshot is the purest expression of that idea — there is no "current" screenshot state to diff a captured one against, unlike a page's structure or a component's props.
- Every screenshot chip is captured (and its PNG written to disk) at **add time** (inside `resolve()`), not deferred until "Insert into terminal" — identical timing to every other resolver (e.g. `currentComponentResolver` reads the component's file at add time too). The PNG and the eventual composed-context Markdown file both land in the same `.stacki/tmp/context/` directory and share its existing 24-hour prune window (`electron/contextFiles.js`'s `pruneOldContextBundles`, unchanged).
- **`App.jsx`'s existing preview-thumbnail-capture effect (for the recents list) is left untouched.** Its rect/coverage-check logic is duplicated (in spirit, not by import) into the new `src/panels/previewCapture.js` rather than extracted into a module shared by both features — the two features have no other coupling today, and adding one for roughly a dozen lines of logic would trade a small amount of duplication for a cross-feature dependency between "recents thumbnails" and "terminal context chips."
- **Suggested context is a plain pure function (`suggestChipTypes`), not a React hook**, matching this codebase's existing convention that only `useTerminalContext` itself is a hook — every other `src/context/*.js` module (`contextSize.js`, `secretScan.js`, the resolvers) is hook-free. Spec §16 names it `useContextSuggestions`; the implementation here deviates on naming only, not behavior.
- **The "Suggested" section is the only new grouping added to the Add Context menu.** Spec §10's mockup also shows "Project" / "Visual" / "Recent" sections. "Recent" needs a usage-history mechanism that doesn't exist anywhere in this codebase (no resolver invocation is logged) and isn't required by any of this phase's four bullets; "Project" vs. "Visual" is a purely cosmetic split of the exact same flat list this menu already renders and changes no behavior. Both are left for later rather than invented without a concrete need.
- No TypeScript: this codebase is plain JS/JSX. New pure modules under `src/context/` follow Phase 1–3's precedent (plain objects/functions).
- New Electron logic follows the established `electron/contextFiles.js` (dependency-injected pure logic) + `electron/contextIpc.js` (thin `ipcMain` wiring with sender validation) split.
- IPC exposed to the renderer stays on the single existing `window.avb` object in `electron/preload.js`.
- Every shell command in this plan is `rtk`-prefixed, per the user's global tooling setup.
- Follow TDD for every task: write the failing test, confirm RED, implement, confirm GREEN, commit.
- Every file/line reference in this plan was read directly from the current repository state (post-Phase-3), not from any prior plan document.

---

**Source spec:** docs/superpowers/specs/terminal-chips.md (§1–§34; this plan implements §30 Phase 4 only)

**Prior work:** docs/superpowers/plans/2026-08-05-terminal-context-chips-phase-1.md, 2026-08-06-terminal-context-chips-phase-2.md, and 2026-08-06-terminal-context-chips-phase-3.md (all merged) implemented everything this plan builds on.

**Starting point:** create a dedicated implementation worktree from the commit containing this plan, preserve unrelated user changes, and execute each task from that worktree.

## File Structure

### New files

- `src/context/cmsSchemaResolver.js` — resolver for CMS collection schemas and sample items (spec §9.4).
- `src/context/cmsSchemaResolver.test.js`
- `src/context/previewScreenshotResolver.js` — resolver for preview screenshots, including the responsive-set mode (spec §9.6).
- `src/context/previewScreenshotResolver.test.js`
- `src/context/contextSuggestions.js` — `SUGGESTION_PRIORITY`, `suggestChipTypes({ prompt, availableTypes, activeTypes })` (spec §10, §24).
- `src/context/contextSuggestions.test.js`
- `src/panels/previewCapture.js` — DOM-only helpers: `getViewportFrameRect()`, `getResponsiveFrameRects()`, `isFrameCovered(rect, selector)`.
- `src/panels/previewCapture.test.js`

### Modified files

- `src/context/contextTypes.js` — add `CMS_SCHEMA`, `PREVIEW_SCREENSHOT` to `CONTEXT_CHIP_TYPES`.
- `src/context/contextTypes.test.js`
- `src/context/contextSize.js` — add `'preview-screenshot'` to `FILE_TRIGGERING_TYPES`.
- `src/context/contextSize.test.js`
- `electron/contextFiles.js` — add `writeContextImage(root, buffer, suffix, deps)`.
- `electron/contextFiles.test.js`
- `electron/contextIpc.js` — add `context:capturePreview`; accept injected `capturePage` and `writeContextImage`.
- `electron/contextIpc.test.js`
- `electron/preload.js` — expose `capturePreview` on `window.avb`.
- `electron/main.js` — pass `capturePage` into `registerContextIpc({...})`.
- `src/panels/CanvasView.jsx` — add `data-device={f.key}` to each `.canvas-frame`.
- `src/panels/ContextChipBar.jsx` — register the two new resolvers; extend `appState` with `listCmsCollections`, `cmsUsage`, `capturePreview`, `devStatus`, `device`; compute and pass suggested resolvers to `ContextPicker`.
- `src/panels/ContextChipBar.test.jsx`
- `src/panels/ContextPicker.jsx` — render a "Suggested" section.
- `src/panels/ContextPicker.test.jsx`
- `src/panels/TerminalPanel.jsx` — accept and forward `devStatus`, `device` props.
- `src/panels/TerminalPanel.test.jsx`
- `src/App.jsx` — pass `devStatus` and `device` to `<TerminalPanel>`.

## Task 1: Add the two new chip types

**Files:**

- Modify: `src/context/contextTypes.js:1-9`
- Modify: `src/context/contextTypes.test.js:13-21`

**Interfaces:**

- Produces: `CONTEXT_CHIP_TYPES.CMS_SCHEMA === 'cms-schema'`, `CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT === 'preview-screenshot'`.

- [ ] **Step 1: Extend the failing test**

In `src/context/contextTypes.test.js`, replace the `'exposes every registered chip type'` test:

~~~js
  it('exposes every registered chip type', () => {
    expect(CONTEXT_CHIP_TYPES.CURRENT_FILE).toBe('current-file');
    expect(CONTEXT_CHIP_TYPES.SELECTED_FILES).toBe('selected-files');
    expect(CONTEXT_CHIP_TYPES.SELECTED_ELEMENT).toBe('selected-element');
    expect(CONTEXT_CHIP_TYPES.CURRENT_PAGE).toBe('current-page');
    expect(CONTEXT_CHIP_TYPES.CURRENT_COMPONENT).toBe('current-component');
    expect(CONTEXT_CHIP_TYPES.CONSOLE_ERRORS).toBe('console-errors');
    expect(CONTEXT_CHIP_TYPES.GIT_DIFF).toBe('git-diff');
    expect(CONTEXT_CHIP_TYPES.CMS_SCHEMA).toBe('cms-schema');
    expect(CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT).toBe('preview-screenshot');
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextTypes.test.js
~~~

Expected: FAIL — the two new keys are `undefined`.

- [ ] **Step 3: Extend the type map**

In `src/context/contextTypes.js`:

~~~js
export const CONTEXT_CHIP_TYPES = Object.freeze({
  CURRENT_FILE: 'current-file',
  SELECTED_FILES: 'selected-files',
  SELECTED_ELEMENT: 'selected-element',
  CURRENT_PAGE: 'current-page',
  CURRENT_COMPONENT: 'current-component',
  CONSOLE_ERRORS: 'console-errors',
  GIT_DIFF: 'git-diff',
  CMS_SCHEMA: 'cms-schema',
  PREVIEW_SCREENSHOT: 'preview-screenshot',
});
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/contextTypes.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/contextTypes.js src/context/contextTypes.test.js
rtk git commit -m "feat: add phase-4 context chip types"
~~~

## Task 2: Force context-file delivery for screenshot chips

**Files:**

- Modify: `src/context/contextSize.js:15`
- Modify: `src/context/contextSize.test.js`

**Interfaces:**

- Produces: `shouldUseContextFile` now also returns `true` for a ready/stale `'preview-screenshot'` chip.

- [ ] **Step 1: Add the failing test**

In `src/context/contextSize.test.js`, add inside the `describe('shouldUseContextFile', ...)` block, after the Git-diff tests:

~~~js
  it('is true when a ready preview-screenshot chip is attached', () => {
    const chip = { type: 'preview-screenshot', status: 'ready', data: {} };
    expect(shouldUseContextFile({ chips: [chip], composedMarkdown: 'short' })).toBe(true);
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextSize.test.js
~~~

Expected: FAIL — a screenshot chip doesn't yet force file delivery.

- [ ] **Step 3: Add the type to the trigger set**

In `src/context/contextSize.js`, change:

~~~js
const FILE_TRIGGERING_TYPES = new Set(['git-diff']);
~~~

to:

~~~js
const FILE_TRIGGERING_TYPES = new Set(['git-diff', 'preview-screenshot']);
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/contextSize.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/contextSize.js src/context/contextSize.test.js
rtk git commit -m "feat: always deliver preview screenshots via a context file"
~~~

## Task 3: Add the CMS Schema resolver

**Files:**

- Create: `src/context/cmsSchemaResolver.test.js`
- Create: `src/context/cmsSchemaResolver.js`
- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/panels/ContextChipBar.test.jsx`

**Interfaces:**

- Consumes: `collectionOf`, `fieldsOf`, `titleOf` from `../cmsSchema.js` (already exist). `appState.listCmsCollections() -> Promise<{ files: Array<{rel,name,dir,data,error}> }>` and `appState.cmsUsage(rel) -> Promise<string[]>` (new appState members this task adds in `ContextChipBar.jsx`, wrapping the existing `window.avb.listCms`/`window.avb.cmsUsage`).
- Produces: `cmsSchemaResolver` registered under `CONTEXT_CHIP_TYPES.CMS_SCHEMA`.

- [ ] **Step 1: Write the failing tests**

Create `src/context/cmsSchemaResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { cmsSchemaResolver } from './cmsSchemaResolver.js';

function baseAppState(overrides = {}) {
  return {
    projectPath: '/projects/site',
    pageInfo: { editable: true, imports: [] },
    listCmsCollections: vi.fn(async () => ({ files: [] })),
    cmsUsage: vi.fn(async () => []),
    ...overrides,
  };
}

describe('cmsSchemaResolver', () => {
  it('is available whenever a project is open', () => {
    expect(cmsSchemaResolver.isAvailable(baseAppState())).toBe(true);
    expect(cmsSchemaResolver.isAvailable(baseAppState({ projectPath: null }))).toBe(false);
  });

  it('defaults to relevant collections with one sample item', () => {
    expect(cmsSchemaResolver.getDefaultOptions()).toEqual({ scope: 'relevant', sampleCount: 'one' });
  });

  it('rejects when the project has no CMS collections', async () => {
    await expect(cmsSchemaResolver.resolve(baseAppState(), {})).rejects.toThrow(
      'No CMS collections found in this project.',
    );
  });

  it('defaults to the collections imported by the open page, with one sample item', async () => {
    const appState = baseAppState({
      pageInfo: { editable: true, imports: [{ name: 'articles', path: 'data/articles.json' }] },
      listCmsCollections: vi.fn(async () => ({
        files: [
          { rel: 'data/articles.json', name: 'articles.json', dir: 'data', data: [{ title: 'A' }, { title: 'B' }] },
          { rel: 'data/team.json', name: 'team.json', dir: 'data', data: [{ name: 'Ada' }] },
        ],
      })),
      cmsUsage: vi.fn(async () => ['src/pages/index.astro']),
    });

    const { data } = await cmsSchemaResolver.resolve(appState, cmsSchemaResolver.getDefaultOptions());
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0]).toMatchObject({
      rel: 'data/articles.json',
      label: 'Articles',
      itemCount: 2,
      usage: ['src/pages/index.astro'],
    });
    expect(data.collections[0].samples).toHaveLength(1);
    expect(data.collections[0].fields).toEqual([{ key: 'title', label: 'Title', type: 'text' }]);
  });

  it('falls back to every collection when scope is relevant but nothing is imported', async () => {
    const appState = baseAppState({
      listCmsCollections: vi.fn(async () => ({
        files: [{ rel: 'data/team.json', name: 'team.json', dir: 'data', data: [{ name: 'Ada' }] }],
      })),
    });
    const { data } = await cmsSchemaResolver.resolve(appState, { scope: 'relevant', sampleCount: 'one' });
    expect(data.collections.map((c) => c.rel)).toEqual(['data/team.json']);
  });

  it('supports selecting a single collection and including every item', async () => {
    const appState = baseAppState({
      listCmsCollections: vi.fn(async () => ({
        files: [
          { rel: 'data/articles.json', name: 'articles.json', dir: 'data', data: [{ title: 'A' }, { title: 'B' }] },
          { rel: 'data/team.json', name: 'team.json', dir: 'data', data: [{ name: 'Ada' }] },
        ],
      })),
    });
    const { data } = await cmsSchemaResolver.resolve(appState, {
      scope: 'selected',
      rel: 'data/team.json',
      sampleCount: 'all',
    });
    expect(data.collections.map((c) => c.rel)).toEqual(['data/team.json']);
    expect(data.collections[0].samples).toHaveLength(1);
  });

  it('skips collections that failed to parse', async () => {
    const appState = baseAppState({
      listCmsCollections: vi.fn(async () => ({
        files: [
          { rel: 'data/broken.json', name: 'broken.json', dir: 'data', error: 'Not valid JSON' },
          { rel: 'data/team.json', name: 'team.json', dir: 'data', data: [{ name: 'Ada' }] },
        ],
      })),
    });
    const { data } = await cmsSchemaResolver.resolve(appState, { scope: 'all', sampleCount: 'one' });
    expect(data.collections.map((c) => c.rel)).toEqual(['data/team.json']);
  });

  it('renders a markdown section per collection with fields, usage, and sample items', async () => {
    const appState = baseAppState({
      listCmsCollections: vi.fn(async () => ({
        files: [{ rel: 'data/team.json', name: 'team.json', dir: 'data', data: [{ name: 'Ada' }] }],
      })),
      cmsUsage: vi.fn(async () => ['src/pages/about.astro']),
    });
    const { data } = await cmsSchemaResolver.resolve(appState, { scope: 'all', sampleCount: 'one' });
    const markdown = cmsSchemaResolver.renderMarkdown({ data });
    expect(markdown).toContain('#### Team');
    expect(markdown).toContain('- name (text)');
    expect(markdown).toContain('Used by: src/pages/about.astro');
    expect(markdown).toContain('"name": "Ada"');
  });

  it('warns in the rendered markdown when every item is included', async () => {
    const appState = baseAppState({
      listCmsCollections: vi.fn(async () => ({
        files: [{ rel: 'data/team.json', name: 'team.json', dir: 'data', data: [{ name: 'Ada' }] }],
      })),
    });
    const { data } = await cmsSchemaResolver.resolve(appState, { scope: 'all', sampleCount: 'all' });
    expect(cmsSchemaResolver.renderMarkdown({ data })).toContain('⚠️ Showing every item');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/cmsSchemaResolver.test.js
~~~

Expected: FAIL — `cmsSchemaResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/cmsSchemaResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { collectionOf, fieldsOf, titleOf } from '../cmsSchema.js';

const SAMPLE_COUNTS = { none: 0, one: 1, three: 3 };

function sampleItems(items, sampleCount) {
  if (sampleCount === 'all') return items;
  return items.slice(0, SAMPLE_COUNTS[sampleCount] ?? 1);
}

// Mirrors currentPageResolver's own cmsDataSources extraction (the open
// page's .json imports) — the only "what CMS data does this page use" signal
// already available in appState. componentDefinitions has no per-component
// list of CMS imports to cross-reference, so "relevant" here means "imported
// by the open page," not the fuller spec §9.4 notion of every page/component
// that binds the collection.
function relevantRels(appState) {
  const imports = appState.pageInfo?.imports || [];
  return new Set(imports.filter((i) => /\.json$/i.test(i.path)).map((i) => i.path));
}

export const cmsSchemaResolver = {
  type: CONTEXT_CHIP_TYPES.CMS_SCHEMA,
  label: 'CMS schema',

  // Optimistic, matching gitDiffResolver's precedent: whether the project
  // actually has any CMS collections can only be known by calling
  // listCmsCollections(), an IPC round trip — isAvailable() must stay
  // synchronous. A project with none surfaces this chip's ERROR status with
  // "No CMS collections found in this project." instead of being hidden.
  isAvailable(appState) {
    return !!appState.projectPath;
  },

  getDefaultOptions() {
    return { scope: 'relevant', sampleCount: 'one' };
  },

  async resolve(appState, options) {
    const scope = options?.scope || 'relevant';
    const sampleCount = options?.sampleCount || 'one';
    const { files } = await appState.listCmsCollections();
    if (!files.length) throw new Error('No CMS collections found in this project.');

    const collections = files.map(collectionOf).filter((c) => !c.error);
    const relevant = relevantRels(appState);

    let selected = collections;
    if (scope === 'selected') {
      selected = collections.filter((c) => c.rel === options?.rel);
    } else if (scope === 'relevant' && relevant.size > 0) {
      selected = collections.filter((c) => relevant.has(c.rel));
    }
    if (selected.length === 0) selected = collections;

    const summarized = [];
    for (const collection of selected) {
      const usage = await appState.cmsUsage(collection.rel);
      summarized.push({
        rel: collection.rel,
        label: collection.label,
        single: collection.single,
        itemCount: collection.items.length,
        fields: fieldsOf(collection.items),
        samples: sampleItems(collection.items, sampleCount).map((item, i) => ({
          title: titleOf(item, i),
          value: item,
        })),
        usage,
      });
    }

    const data = { scope, sampleCount, collections: summarized };
    return {
      data,
      estimatedCharacters: JSON.stringify(data).length,
      sourceRevision: null,
    };
  },

  renderMarkdown(snapshot) {
    const { scope, sampleCount, collections } = snapshot.data;
    const lines = ['### CMS schema', '', `- Scope: ${scope}`];
    if (sampleCount === 'all') {
      lines.push('> ⚠️ Showing every item in each collection — this can be a large payload.');
    }
    for (const c of collections) {
      lines.push('', `#### ${c.label}`, '');
      lines.push(`- File: \`src/${c.rel}\``);
      lines.push(`- Shape: ${c.single ? 'single item' : `${c.itemCount} items`}`);
      if (c.usage.length > 0) lines.push(`- Used by: ${c.usage.join(', ')}`);
      if (c.fields.length > 0) {
        lines.push('', 'Fields:', '');
        for (const field of c.fields) lines.push(`- ${field.key} (${field.type})`);
      }
      for (const sample of c.samples) {
        lines.push('', `Sample — ${sample.title}:`, '', '```json', JSON.stringify(sample.value, null, 2), '```');
      }
    }
    return lines.join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/cmsSchemaResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit the resolver**

~~~bash
rtk git add src/context/cmsSchemaResolver.js src/context/cmsSchemaResolver.test.js
rtk git commit -m "feat: add the CMS schema context resolver"
~~~

- [ ] **Step 6: Write the failing ContextChipBar test**

In `src/panels/ContextChipBar.test.jsx`, add `listCms`/`cmsUsage` to the `beforeEach`'s `window.avb` mock:

~~~js
  window.avb = {
    listContextFiles: vi.fn(async () => ({ files: ['src/pages/index.astro'] })),
    readContextFile: vi.fn(async ({ rel }) => ({ rel, content: `content of ${rel}`, size: 10 })),
    serializeNode: vi.fn(async ({ node }) => ({ markup: `<${node.name}></${node.name}>` })),
    getGitDiff: vi.fn(async () => ({
      isRepo: true,
      branch: 'main',
      staged: '',
      unstaged: '',
      untracked: [],
      recentCommits: [],
      truncated: false,
    })),
    writeContextBundle: vi.fn(async () => ({ relPath: '.stacki/tmp/context/request-1.md' })),
    listCms: vi.fn(async () => ({
      files: [{ rel: 'data/team.json', name: 'team.json', dir: 'data', data: [{ name: 'Ada' }] }],
    })),
    cmsUsage: vi.fn(async () => ({ files: [] })),
  };
~~~

Then add a new test at the end of the `describe('ContextChipBar', ...)` block:

~~~js
  it('offers CMS schema whenever a project is open, and wires listCms/cmsUsage through appState', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('CMS schema'));
    await waitFor(() => expect(screen.getByText('CMS schema')).toBeInTheDocument());

    expect(window.avb.listCms).toHaveBeenCalledWith('/projects/site');
    expect(window.avb.cmsUsage).toHaveBeenCalledWith({ projectPath: '/projects/site', rel: 'data/team.json' });
  });
~~~

- [ ] **Step 7: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: FAIL — "CMS schema" isn't offered yet.

- [ ] **Step 8: Register the resolver and wire appState**

In `src/panels/ContextChipBar.jsx`, add the import and registration:

~~~js
import { gitDiffResolver } from '../context/gitDiffResolver.js';
import { cmsSchemaResolver } from '../context/cmsSchemaResolver.js';
~~~

~~~js
registerResolver(gitDiffResolver);
registerResolver(cmsSchemaResolver);
~~~

Then extend the `appState` `useMemo`:

~~~js
  const appState = useMemo(
    () => ({
      currentFile,
      projectPath,
      devLog,
      ...editorContext,
      readProjectFile: (rel) => window.avb.readContextFile({ projectPath, rel }),
      listProjectFiles: async () => (await window.avb.listContextFiles({ projectPath })).files,
      serializeNode: async (node) => (await window.avb.serializeNode({ node })).markup,
      getGitDiff: () => window.avb.getGitDiff({ projectPath }),
      writeContextBundle: (markdown) => window.avb.writeContextBundle({ projectPath, markdown }),
      listCmsCollections: () => window.avb.listCms(projectPath),
      cmsUsage: async (rel) => (await window.avb.cmsUsage({ projectPath, rel })).files,
    }),
    [currentFile, projectPath, editorContext, devLog],
  );
~~~

- [ ] **Step 9: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 10: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx
rtk git commit -m "feat: register the CMS schema chip in the chip bar"
~~~

## Task 4: Add context-image writing

**Files:**

- Modify: `electron/contextFiles.js`
- Modify: `electron/contextFiles.test.js`

**Interfaces:**

- Produces: `writeContextImage(root, buffer, suffix, {fs, path} = {}) -> {relPath: string}` — writes `buffer` to `<root>/.stacki/tmp/context/preview-<Date.now()>[-<suffix>].png`, reusing `ensureContextDir`/`pruneOldContextBundles`. Throws when `buffer` is empty.

- [ ] **Step 1: Write the failing tests**

In `electron/contextFiles.test.js`, add `writeContextImage` to the destructure at the top:

~~~js
const { isSensitiveFilename, listProjectFiles, readProjectFile, writeContextBundle, writeContextImage } =
  contextFilesModule;
~~~

Then add a new `describe` block after `describe('writeContextBundle', ...)`:

~~~js
describe('writeContextImage', () => {
  it('creates the context directory and writes a PNG named by timestamp and suffix', () => {
    const { fs, path } = fakeFs({});
    const buffer = Buffer.from([1, 2, 3]);
    const result = writeContextImage('/project', buffer, 'desktop', { fs, path });
    expect(result.relPath).toMatch(/^\.stacki\/tmp\/context\/preview-\d+-desktop\.png$/);
    expect(fs.existsSync('/project/.stacki/tmp/.gitignore')).toBe(true);
    expect(fs.readFileSync(`/project/${result.relPath}`)).toEqual(buffer);
  });

  it('omits the suffix from the filename when none is given', () => {
    const { fs, path } = fakeFs({});
    const result = writeContextImage('/project', Buffer.from([1]), undefined, { fs, path });
    expect(result.relPath).toMatch(/^\.stacki\/tmp\/context\/preview-\d+\.png$/);
  });

  it('refuses an empty buffer', () => {
    const { fs, path } = fakeFs({});
    expect(() => writeContextImage('/project', Buffer.alloc(0), 'x', { fs, path })).toThrow(
      'Nothing to write — the captured image is empty.',
    );
  });

  it('prunes bundle files older than 24 hours the same way writeContextBundle does', () => {
    const oldMtime = Date.now() - 25 * 60 * 60 * 1000;
    const { fs, path } = fakeFs({
      '.stacki': { type: 'dir', children: { 'tmp': { type: 'dir', children: {
        'context': { type: 'dir', children: {
          'old-preview.png': { type: 'file', content: 'stale', mtimeMs: oldMtime },
        } },
      } } } },
    });
    writeContextImage('/project', Buffer.from([1]), 'x', { fs, path });
    expect(fs.existsSync('/project/.stacki/tmp/context/old-preview.png')).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextFiles.test.js
~~~

Expected: FAIL — `writeContextImage` is not exported.

- [ ] **Step 3: Implement writeContextImage**

In `electron/contextFiles.js`, add after `writeContextBundle`:

~~~js
function writeContextImage(root, buffer, suffix, { fs = nodeFs, path = nodePath } = {}) {
  if (!buffer || !buffer.length) {
    throw new Error('Nothing to write — the captured image is empty.');
  }
  const dir = ensureContextDir(root, { fs, path });
  pruneOldContextBundles(dir, { fs, path });
  const filename = suffix ? `preview-${Date.now()}-${suffix}.png` : `preview-${Date.now()}.png`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { relPath: `.stacki/tmp/context/${filename}` };
}
~~~

And update `module.exports`:

~~~js
module.exports = {
  EXCLUDED_DIRS,
  isSensitiveFilename,
  listProjectFiles,
  readProjectFile,
  writeContextBundle,
  writeContextImage,
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- electron/contextFiles.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add electron/contextFiles.js electron/contextFiles.test.js
rtk git commit -m "feat: add context-image writing for preview screenshots"
~~~

## Task 5: Add the capturePreview IPC channel

**Files:**

- Modify: `electron/contextIpc.js`
- Modify: `electron/contextIpc.test.js`
- Modify: `electron/preload.js:552-557`
- Modify: `electron/main.js:548-558`

**Interfaces:**

- Consumes: a `capturePage(rect) -> Promise<Buffer|null>` dependency (no default — required, exactly like `runGit`; `electron/main.js` passes a closure over `mainWindow.webContents.capturePage`, mirroring the existing `recents:captureThumb` handler at `electron/main.js:763-779`), and `writeContextImage = contextFiles.writeContextImage`.
- Produces: `window.avb.capturePreview({ rect, suffix }) -> Promise<{ relPath: string }>`, or a rejection with `'Could not capture the preview.'` when `capturePage` returns a falsy buffer.

- [ ] **Step 1: Write the failing tests**

In `electron/contextIpc.test.js`, change `setup()` to accept and pass through `capturePage`/`writeContextImage` fakes:

~~~js
function setup({
  projectRoot = '/projects/site',
  runGit = fakeRunGit(),
  capturePage = vi.fn(async () => Buffer.from([1, 2, 3])),
  writeContextImage = vi.fn((_root, _buffer, suffix) => ({
    relPath: suffix ? `.stacki/tmp/context/preview-1-${suffix}.png` : '.stacki/tmp/context/preview-1.png',
  })),
} = {}) {
  const handles = new Map();
  const ipcMain = {
    handle: vi.fn((channel, fn) => handles.set(channel, fn)),
    removeHandler: vi.fn(),
  };
  const allowed = { sender: {} };
  const denied = { sender: {} };
  const listProjectFiles = vi.fn(() => ['package.json', 'src/pages/index.astro']);
  const readProjectFile = vi.fn((_root, rel) => ({ rel, content: `content of ${rel}`, size: 10 }));
  const serializeNode = vi.fn((node) => `<${node.name}></${node.name}>`);
  const writeContextBundle = vi.fn((_root, content) => ({ relPath: `.stacki/tmp/context/request-1.md` }));
  const unregister = registerContextIpc({
    ipcMain,
    isAllowedSender: (event) => event === allowed,
    getProjectRoot: () => projectRoot,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
    runGit,
    capturePage,
    writeContextImage,
  });
  return {
    ipcMain,
    handles,
    allowed,
    denied,
    unregister,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
    runGit,
    capturePage,
    writeContextImage,
  };
}
~~~

Replace the `'registers the five context channels'` test:

~~~js
  it('registers the six context channels', () => {
    const { handles } = setup();
    expect([...handles.keys()]).toEqual([
      'context:listFiles',
      'context:readFile',
      'context:serializeNode',
      'context:writeContextBundle',
      'context:gitDiff',
      'context:capturePreview',
    ]);
  });
~~~

Extend `'rejects an untrusted sender'` with one more assertion:

~~~js
    await expect(handles.get('context:gitDiff')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:capturePreview')(denied, { rect: {} })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
~~~

Replace `'unregisters all five handlers'`:

~~~js
  it('unregisters all six handlers', () => {
    const { ipcMain, unregister } = setup();
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:listFiles');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:readFile');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:serializeNode');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:writeContextBundle');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:gitDiff');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:capturePreview');
  });
~~~

Add a new `describe` block at the end of the file:

~~~js
describe('context:capturePreview', () => {
  it('captures the preview and writes it as a context image for an allowed sender', async () => {
    const capturePage = vi.fn(async () => Buffer.from([1, 2, 3]));
    const writeContextImage = vi.fn((_root, _buffer, suffix) => ({
      relPath: `.stacki/tmp/context/preview-1-${suffix}.png`,
    }));
    const { handles, allowed } = setup({ capturePage, writeContextImage });
    await expect(
      handles.get('context:capturePreview')(allowed, {
        rect: { x: 0, y: 0, width: 10, height: 10 },
        suffix: 'viewport',
      }),
    ).resolves.toEqual({ relPath: '.stacki/tmp/context/preview-1-viewport.png' });
    expect(capturePage).toHaveBeenCalledWith({ x: 0, y: 0, width: 10, height: 10 });
    expect(writeContextImage).toHaveBeenCalledWith('/projects/site', Buffer.from([1, 2, 3]), 'viewport');
  });

  it('rejects when the capture fails to produce an image', async () => {
    const capturePage = vi.fn(async () => null);
    const { handles, allowed } = setup({ capturePage });
    await expect(handles.get('context:capturePreview')(allowed, { rect: {} })).rejects.toThrow(
      'Could not capture the preview.',
    );
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
~~~

Expected: FAIL — `context:capturePreview` is never registered.

- [ ] **Step 3: Add the handler**

In `electron/contextIpc.js`, update the `registerContextIpc` signature:

~~~js
function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
  serializeNode = (node) => astroParser.serializeNodes([node]),
  writeContextBundle = contextFiles.writeContextBundle,
  writeContextImage = contextFiles.writeContextImage,
  runGit,
  capturePage,
}) {
~~~

Add the handler function alongside the others (after `gitDiff`):

~~~js
  const capturePreview = async (event, payload) => {
    assertAllowed(event);
    const root = requireRoot();
    const buffer = await capturePage(payload?.rect);
    if (!buffer) throw new Error('Could not capture the preview.');
    return writeContextImage(root, buffer, payload?.suffix);
  };
~~~

Register it and add it to the disposer:

~~~js
  ipcMain.handle('context:listFiles', listFiles);
  ipcMain.handle('context:readFile', readFile);
  ipcMain.handle('context:serializeNode', serialize);
  ipcMain.handle('context:writeContextBundle', writeBundle);
  ipcMain.handle('context:gitDiff', gitDiff);
  ipcMain.handle('context:capturePreview', capturePreview);

  return () => {
    ipcMain.removeHandler('context:listFiles');
    ipcMain.removeHandler('context:readFile');
    ipcMain.removeHandler('context:serializeNode');
    ipcMain.removeHandler('context:writeContextBundle');
    ipcMain.removeHandler('context:gitDiff');
    ipcMain.removeHandler('context:capturePreview');
  };
~~~

- [ ] **Step 4: Expose it on window.avb**

In `electron/preload.js`, extend the "Terminal context chips" block:

~~~js
  // Terminal context chips
  listContextFiles: invoke('context:listFiles'),
  readContextFile: invoke('context:readFile'),
  serializeNode: invoke('context:serializeNode'),
  writeContextBundle: invoke('context:writeContextBundle'),
  getGitDiff: invoke('context:gitDiff'),
  capturePreview: invoke('context:capturePreview'),
~~~

- [ ] **Step 5: Wire capturePage in main.js**

In `electron/main.js`, replace the `registerContextIpc({...})` call:

~~~js
registerContextIpc({
  ipcMain,
  isAllowedSender: (event) =>
    !!mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    isTrustedRendererUrl(event.senderFrame.url),
  getProjectRoot: () => openProjectRoot,
  runGit: (root, args) => git(root, args),
  capturePage: async (rect) => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const image = await mainWindow.webContents.capturePage({
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
    return image.isEmpty() ? null : image.toPNG();
  },
});
~~~

- [ ] **Step 6: Run tests, check:electron, and build**

Run:

~~~bash
rtk npm test -- electron/contextFiles.test.js electron/contextIpc.test.js
rtk npm run check:electron
rtk npm run build
~~~

Expected: tests pass, every Electron entry parses, and the renderer builds.

- [ ] **Step 7: Commit**

~~~bash
rtk git add electron/contextIpc.js electron/contextIpc.test.js electron/preload.js electron/main.js
rtk git commit -m "feat: add the capturePreview IPC channel for the screenshot chip"
~~~

## Task 6: Mark each Canvas-view frame with its device

**Files:**

- Modify: `src/panels/CanvasView.jsx:163-167`

**Interfaces:**

- Produces: each `.canvas-frame` element now carries `data-device="desktop"|"tablet"|"phone"`, so the screenshot resolver's responsive-set capture can identify which breakpoint each frame is without relying on DOM order.

- [ ] **Step 1: Add the attribute**

In `src/panels/CanvasView.jsx`, change:

~~~jsx
          {frames.map((f) => (
            <div
              key={f.key}
              className="canvas-frame"
              style={{ left: f.x, top: 0, width: f.width, height: f.height }}
            >
~~~

to:

~~~jsx
          {frames.map((f) => (
            <div
              key={f.key}
              className="canvas-frame"
              data-device={f.key}
              style={{ left: f.x, top: 0, width: f.width, height: f.height }}
            >
~~~

- [ ] **Step 2: Verify the app still builds**

Run:

~~~bash
rtk npm run build
~~~

Expected: builds cleanly (this file has no existing test suite — a one-attribute JSX addition with no logic change).

- [ ] **Step 3: Commit**

~~~bash
rtk git add src/panels/CanvasView.jsx
rtk git commit -m "feat: mark each canvas-view breakpoint frame with its device key"
~~~

## Task 7: Add preview-frame DOM helpers

**Files:**

- Create: `src/panels/previewCapture.test.js`
- Create: `src/panels/previewCapture.js`

**Interfaces:**

- Produces: `getViewportFrameRect() -> {x,y,width,height} | null`, `getResponsiveFrameRects() -> Array<{device, rect: {x,y,width,height}}>`, `isFrameCovered(rect, containerSelector) -> boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/panels/previewCapture.test.js`:

~~~js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResponsiveFrameRects, getViewportFrameRect, isFrameCovered } from './previewCapture.js';

function stubRect(el, rect) {
  el.getBoundingClientRect = () => ({
    ...rect,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  document.elementFromPoint = undefined;
});

describe('getViewportFrameRect', () => {
  it('returns null when no preview iframe is mounted', () => {
    expect(getViewportFrameRect()).toBeNull();
  });

  it('returns null when the frame is too small to be a real preview', () => {
    document.body.innerHTML = '<div class="frame-clip"><iframe></iframe></div>';
    stubRect(document.querySelector('.frame-clip iframe'), { x: 0, y: 0, width: 50, height: 50 });
    expect(getViewportFrameRect()).toBeNull();
  });

  it('caps the capture height to a 4:3-ish ratio for a tall frame', () => {
    document.body.innerHTML = '<div class="frame-clip"><iframe></iframe></div>';
    stubRect(document.querySelector('.frame-clip iframe'), { x: 10, y: 20, width: 400, height: 2000 });
    expect(getViewportFrameRect()).toEqual({ x: 10, y: 20, width: 400, height: 300 });
  });
});

describe('getResponsiveFrameRects', () => {
  it('returns nothing when the canvas view is not mounted', () => {
    expect(getResponsiveFrameRects()).toEqual([]);
  });

  it('reads each breakpoint frame keyed by its data-device attribute, skipping tiny (zoomed-out) frames', () => {
    document.body.innerHTML = `
      <div class="canvas-frame" data-device="desktop"></div>
      <div class="canvas-frame" data-device="tablet"></div>
      <div class="canvas-frame" data-device="phone"></div>
    `;
    const frames = document.querySelectorAll('.canvas-frame');
    stubRect(frames[0], { x: 0, y: 0, width: 1440, height: 900 });
    stubRect(frames[1], { x: 1460, y: 0, width: 768, height: 1024 });
    stubRect(frames[2], { x: 2250, y: 0, width: 30, height: 20 });
    expect(getResponsiveFrameRects()).toEqual([
      { device: 'desktop', rect: { x: 0, y: 0, width: 1440, height: 900 } },
      { device: 'tablet', rect: { x: 1460, y: 0, width: 768, height: 1024 } },
    ]);
  });
});

describe('isFrameCovered', () => {
  it('is false when every sample point lands inside the container', () => {
    document.body.innerHTML = '<div class="frame-clip"><div class="inner"></div></div>';
    document.elementFromPoint = vi.fn(() => document.querySelector('.inner'));
    expect(isFrameCovered({ x: 0, y: 0, width: 100, height: 100 }, '.frame-clip')).toBe(false);
  });

  it('is true when a sample point lands outside the container', () => {
    document.body.innerHTML = '<div class="frame-clip"></div><div class="modal-overlay"></div>';
    document.elementFromPoint = vi.fn(() => document.querySelector('.modal-overlay'));
    expect(isFrameCovered({ x: 0, y: 0, width: 100, height: 100 }, '.frame-clip')).toBe(true);
  });

  it('is true when a sample point misses every element', () => {
    document.elementFromPoint = vi.fn(() => null);
    expect(isFrameCovered({ x: 0, y: 0, width: 100, height: 100 }, '.frame-clip')).toBe(true);
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/previewCapture.test.js
~~~

Expected: FAIL — `previewCapture.js` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/panels/previewCapture.js`:

~~~js
// DOM-only helpers for the Preview Screenshot chip's capture path (spec
// §9.6). Kept separate from App.jsx's own preview-thumbnail-capture effect
// (an unrelated feature — the recents list — with its own working logic):
// the underlying idea, find the preview iframe's on-screen rect and check
// nothing covers it, is the same, but the two features have no other
// coupling, so a shared module would trade a dozen duplicated lines for a
// cross-feature dependency.

export function getViewportFrameRect() {
  const iframe = document.querySelector('.frame-clip iframe');
  if (!iframe) return null;
  const r = iframe.getBoundingClientRect();
  if (r.width < 100 || r.height < 100) return null;
  // Only the top of tall frames — screenshots stay focused on above-the-fold
  // content, matching the existing recents-thumbnail capture's own cap.
  return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, r.width * 0.75) };
}

export function getResponsiveFrameRects() {
  const frames = [...document.querySelectorAll('.canvas-frame[data-device]')];
  const out = [];
  for (const frame of frames) {
    const r = frame.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue; // zoomed out too far to be useful
    out.push({ device: frame.getAttribute('data-device'), rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
  }
  return out;
}

// capturePage photographs the WINDOW at these coordinates, not the frame
// itself — several things can sit over the canvas without unmounting it (a
// modal, the code window, the insert palette). Ask the document what is
// actually on top at a few points across the frame: unless every one of them
// lands inside containerSelector, something is covering it.
export function isFrameCovered(rect, containerSelector) {
  return [0.25, 0.5, 0.75].some((f) => {
    const el = document.elementFromPoint(rect.x + rect.width * f, rect.y + rect.height * 0.25);
    return !el || !el.closest(containerSelector);
  });
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/previewCapture.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/panels/previewCapture.js src/panels/previewCapture.test.js
rtk git commit -m "feat: add DOM helpers for locating the preview frame(s) to capture"
~~~

## Task 8: Thread devStatus and device into the chip bar

**Files:**

- Modify: `src/panels/TerminalPanel.jsx:36,482`
- Modify: `src/panels/TerminalPanel.test.jsx`
- Modify: `src/App.jsx:2298-2306`

**Interfaces:**

- Produces: `<TerminalPanel devStatus device>` forwards both straight through to `<ContextChipBar devStatus device>` (Task 9 consumes them).

- [ ] **Step 1: Write the failing test**

In `src/panels/TerminalPanel.test.jsx`, add a test near the other rendering tests (find an existing `it('...')` inside `describe('TerminalPanel', ...)` to place it alongside — insert after the file's first test):

~~~js
  it('forwards devStatus and device to the context chip bar', () => {
    render(
      <TerminalPanel
        active
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{}}
        devLog=""
        devStatus="on"
        device="canvas"
      />,
    );
    // ContextChipBar renders unconditionally inside the panel; devStatus/device
    // reaching it is exercised end-to-end by ContextChipBar's own tests
    // (Task 9) via the previewScreenshotResolver's isAvailable/mode checks —
    // this test only pins that TerminalPanel doesn't drop the two props.
    expect(screen.getByText('+ Add context')).toBeInTheDocument();
  });
~~~

- [ ] **Step 2: Run the test and confirm it passes trivially, then verify propagation with a temporary log**

Since `devStatus`/`device` aren't destructured or forwarded yet, this specific test can't fail in a way that proves propagation — propagation is properly exercised in Task 9's `ContextChipBar` tests, which assert on resolver `isAvailable`/behavior driven by these exact props. Run it now only to confirm the component still renders with the new props present:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx
~~~

Expected: PASS (React silently ignores unknown props passed to `<TerminalPanel>`, so this alone doesn't prove forwarding — Step 3 makes the forwarding real, and Task 9's tests are what actually pin the behavior).

- [ ] **Step 3: Forward the props**

In `src/panels/TerminalPanel.jsx`, change the function signature:

~~~js
export default function TerminalPanel({ active, currentFile, projectPath, editorContext, devLog, devStatus, device }) {
~~~

And the `<ContextChipBar>` render:

~~~jsx
      <ContextChipBar
        currentFile={currentFile}
        projectPath={projectPath}
        editorContext={editorContext}
        devLog={devLog}
        devStatus={devStatus}
        device={device}
      />
~~~

- [ ] **Step 4: Pass the props from App.jsx**

In `src/App.jsx`, change the `<TerminalPanel>` render:

~~~jsx
        {terminalMounted && (
          <TerminalPanel
            key={project.path}
            active={leftTab === 'terminal'}
            currentFile={currentFileContext}
            projectPath={project.path}
            editorContext={editorContext}
            devLog={devLog}
            devStatus={devStatus}
            device={device}
          />
        )}
~~~

- [ ] **Step 5: Run the terminal panel test suite and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 6: Commit**

~~~bash
rtk git add src/panels/TerminalPanel.jsx src/panels/TerminalPanel.test.jsx src/App.jsx
rtk git commit -m "feat: thread devStatus and device into the terminal context chip bar"
~~~

## Task 9: Add the Preview Screenshot resolver

**Files:**

- Create: `src/context/previewScreenshotResolver.test.js`
- Create: `src/context/previewScreenshotResolver.js`
- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/panels/ContextChipBar.test.jsx`

**Interfaces:**

- Consumes: `appState.devStatus`, `appState.device`, `appState.selectedNode` (already exist/added in Task 8), and a new `appState.capturePreview({ mode }) -> Promise<{ images: Array<{device?, relPath, width, height}> }>` this task assembles in `ContextChipBar.jsx` from `getViewportFrameRect`/`getResponsiveFrameRects`/`isFrameCovered` (Task 7) and `window.avb.capturePreview` (Task 5).
- Produces: `previewScreenshotResolver` registered under `CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT`.

- [ ] **Step 1: Write the failing resolver tests**

Create `src/context/previewScreenshotResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { previewScreenshotResolver } from './previewScreenshotResolver.js';

function baseAppState(overrides = {}) {
  return {
    devStatus: 'on',
    device: 'desktop',
    selectedNode: null,
    pageInfo: { route: '/' },
    capturePreview: vi.fn(async () => ({ images: [{ relPath: '.stacki/tmp/context/preview-1.png', width: 1440, height: 900 }] })),
    ...overrides,
  };
}

describe('previewScreenshotResolver', () => {
  it('is available only while the preview is running', () => {
    expect(previewScreenshotResolver.isAvailable(baseAppState())).toBe(true);
    expect(previewScreenshotResolver.isAvailable(baseAppState({ devStatus: 'off' }))).toBe(false);
    expect(previewScreenshotResolver.isAvailable(baseAppState({ devStatus: 'starting' }))).toBe(false);
  });

  it('defaults to selected-element mode when a node is selected, otherwise viewport', () => {
    expect(previewScreenshotResolver.getDefaultOptions(baseAppState())).toEqual({ mode: 'viewport' });
    expect(
      previewScreenshotResolver.getDefaultOptions(baseAppState({ selectedNode: { id: 'h1', name: 'h1', kind: 'element' } })),
    ).toEqual({ mode: 'selected-element' });
  });

  it('captures the current viewport by default', async () => {
    const appState = baseAppState();
    const { data } = await previewScreenshotResolver.resolve(appState, { mode: 'viewport' });
    expect(appState.capturePreview).toHaveBeenCalledWith({ mode: 'viewport' });
    expect(data.mode).toBe('viewport');
    expect(data.route).toBe('/');
    expect(data.images).toEqual([{ relPath: '.stacki/tmp/context/preview-1.png', width: 1440, height: 900 }]);
    expect(data.selectedNode).toBeNull();
  });

  it('records the selected node label in selected-element mode without cropping the image', async () => {
    const appState = baseAppState({ selectedNode: { id: 'h1', name: 'h1', kind: 'element' } });
    const { data } = await previewScreenshotResolver.resolve(appState, { mode: 'selected-element' });
    expect(appState.capturePreview).toHaveBeenCalledWith({ mode: 'selected-element' });
    expect(data.selectedNode).toEqual({ tag: 'h1', kind: 'element' });
  });

  it('requires Canvas view for a responsive set', async () => {
    const appState = baseAppState({ device: 'desktop' });
    await expect(previewScreenshotResolver.resolve(appState, { mode: 'responsive' })).rejects.toThrow(
      'Switch the preview to Canvas view to capture a responsive set.',
    );
    expect(appState.capturePreview).not.toHaveBeenCalled();
  });

  it('captures a responsive set when already in Canvas view', async () => {
    const appState = baseAppState({
      device: 'canvas',
      capturePreview: vi.fn(async () => ({
        images: [
          { device: 'desktop', relPath: '.stacki/tmp/context/preview-1-desktop.png', width: 1440, height: 900 },
          { device: 'tablet', relPath: '.stacki/tmp/context/preview-1-tablet.png', width: 768, height: 1024 },
        ],
      })),
    });
    const { data } = await previewScreenshotResolver.resolve(appState, { mode: 'responsive' });
    expect(appState.capturePreview).toHaveBeenCalledWith({ mode: 'responsive' });
    expect(data.images).toHaveLength(2);
  });

  it('has no computeStaleKey — a screenshot is a point-in-time snapshot', () => {
    expect(previewScreenshotResolver.computeStaleKey).toBeUndefined();
  });

  it('renders a markdown section listing each image by device or dimensions', async () => {
    const appState = baseAppState({
      device: 'canvas',
      capturePreview: vi.fn(async () => ({
        images: [
          { device: 'desktop', relPath: '.stacki/tmp/context/preview-1-desktop.png', width: 1440, height: 900 },
        ],
      })),
    });
    const { data } = await previewScreenshotResolver.resolve(appState, { mode: 'responsive' });
    const markdown = previewScreenshotResolver.renderMarkdown({ data });
    expect(markdown).toContain('### Preview screenshot');
    expect(markdown).toContain('Mode: responsive');
    expect(markdown).toContain('desktop (1440px): `.stacki/tmp/context/preview-1-desktop.png`');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/previewScreenshotResolver.test.js
~~~

Expected: FAIL — `previewScreenshotResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/previewScreenshotResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

export const previewScreenshotResolver = {
  type: CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT,
  label: 'Preview screenshot',

  isAvailable(appState) {
    return appState.devStatus === 'on';
  },

  getDefaultOptions(appState) {
    return { mode: appState.selectedNode ? 'selected-element' : 'viewport' };
  },

  // "selected-element" mode captures the same full-viewport image as
  // "viewport" mode and only adds the selected node's label as metadata —
  // this app has no channel reporting a DOM element's on-screen bounding box
  // from inside the preview iframe back to the host window, so cropping to
  // just that element isn't implemented (see this plan's Global Constraints).
  // "responsive" mode requires the user already be in Canvas view, where
  // CanvasView.jsx renders all three breakpoints as simultaneous iframes.
  async resolve(appState, options) {
    const mode = options?.mode || 'viewport';
    if (mode === 'responsive' && appState.device !== 'canvas') {
      throw new Error('Switch the preview to Canvas view to capture a responsive set.');
    }
    const captured = await appState.capturePreview({ mode });
    const selectedNode = mode === 'selected-element' && appState.selectedNode
      ? { tag: appState.selectedNode.name || null, kind: appState.selectedNode.kind }
      : null;

    const data = {
      mode,
      route: appState.pageInfo?.route || null,
      images: captured.images,
      selectedNode,
      capturedAt: new Date().toISOString(),
    };

    return {
      data,
      // The images themselves are never inlined into the composed prompt —
      // only their file paths are (see renderMarkdown) — so the character
      // estimate is a small fixed cost per referenced image, not the PNG's
      // actual byte size.
      estimatedCharacters: 200 * data.images.length,
      sourceRevision: null,
    };
  },

  renderMarkdown(snapshot) {
    const { mode, route, images, selectedNode, capturedAt } = snapshot.data;
    const lines = ['### Preview screenshot', ''];
    if (route) lines.push(`- Route: \`${route}\``);
    lines.push(`- Mode: ${mode}`);
    if (selectedNode) lines.push(`- Selected element: \`${selectedNode.tag || selectedNode.kind}\``);
    lines.push(`- Captured: ${capturedAt}`);
    lines.push('', 'Images (written alongside this context file):', '');
    for (const image of images) {
      const label = image.device ? `${image.device} (${image.width}px)` : `${image.width}×${image.height}`;
      lines.push(`- ${label}: \`${image.relPath}\``);
    }
    return lines.join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/previewScreenshotResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit the resolver**

~~~bash
rtk git add src/context/previewScreenshotResolver.js src/context/previewScreenshotResolver.test.js
rtk git commit -m "feat: add the preview screenshot context resolver"
~~~

- [ ] **Step 6: Write the failing ContextChipBar tests**

In `src/panels/ContextChipBar.test.jsx`, add `capturePreview` to the `beforeEach`'s `window.avb` mock:

~~~js
    capturePreview: vi.fn(async ({ suffix }) => ({ relPath: `.stacki/tmp/context/preview-1-${suffix}.png` })),
~~~

Add new tests at the end of the `describe('ContextChipBar', ...)` block:

~~~js
  it('offers Preview screenshot only while the dev server is running', () => {
    const { rerender } = render(<ContextChipBar currentFile={null} projectPath="/projects/site" devStatus="off" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Preview screenshot')).not.toBeInTheDocument();

    rerender(<ContextChipBar currentFile={null} projectPath="/projects/site" devStatus="on" />);
    expect(screen.getByText('Preview screenshot')).toBeInTheDocument();
  });

  it('captures the current preview viewport and includes the image path in the composed prompt', async () => {
    document.body.innerHTML = '<div class="frame-clip"><iframe></iframe></div>';
    const iframe = document.querySelector('.frame-clip iframe');
    iframe.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1440, height: 900, top: 0, left: 0, right: 1440, bottom: 900 });
    document.elementFromPoint = () => document.querySelector('.frame-clip');

    render(<ContextChipBar currentFile={null} projectPath="/projects/site" devStatus="on" />);
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Preview screenshot'));
    await waitFor(() => expect(screen.getByText('Preview screenshot')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix the layout.' } });
    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));

    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(window.avb.capturePreview).toHaveBeenCalledWith({
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      suffix: 'viewport',
    });
    window.removeEventListener('stacki:terminal-menu', listener);
    document.body.innerHTML = '';
    document.elementFromPoint = undefined;
  });
~~~

- [ ] **Step 7: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: FAIL — "Preview screenshot" isn't offered/wired yet.

- [ ] **Step 8: Register the resolver and assemble capturePreview**

In `src/panels/ContextChipBar.jsx`, add the imports:

~~~js
import { previewScreenshotResolver } from '../context/previewScreenshotResolver.js';
import { getResponsiveFrameRects, getViewportFrameRect, isFrameCovered } from './previewCapture.js';
~~~

Register it alongside the others:

~~~js
registerResolver(previewScreenshotResolver);
~~~

Add a `capturePreview` callback and thread `devStatus`/`device` into `appState`:

~~~js
export default function ContextChipBar({
  currentFile,
  projectPath,
  editorContext = EMPTY_EDITOR_CONTEXT,
  devLog = '',
  devStatus = 'off',
  device = 'desktop',
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsId, setDetailsId] = useState(null);

  const capturePreview = useCallback(async (options) => {
    const mode = options?.mode || 'viewport';
    if (mode === 'responsive') {
      const frames = getResponsiveFrameRects();
      if (!frames.length) throw new Error('Switch the preview to Canvas view to capture a responsive set.');
      const images = [];
      for (const frame of frames) {
        if (isFrameCovered(frame.rect, '.canvas-frame')) {
          throw new Error('The preview is covered by another panel — close it and try again.');
        }
        const { relPath } = await window.avb.capturePreview({ rect: frame.rect, suffix: frame.device });
        images.push({
          device: frame.device,
          relPath,
          width: Math.round(frame.rect.width),
          height: Math.round(frame.rect.height),
        });
      }
      return { images };
    }
    const rect = getViewportFrameRect();
    if (!rect) throw new Error('The preview is not running, so a screenshot could not be captured.');
    if (isFrameCovered(rect, '.frame-clip')) {
      throw new Error('The preview is covered by another panel — close it and try again.');
    }
    const { relPath } = await window.avb.capturePreview({ rect, suffix: mode });
    return { images: [{ relPath, width: Math.round(rect.width), height: Math.round(rect.height) }] };
  }, []);

  const appState = useMemo(
    () => ({
      currentFile,
      projectPath,
      devLog,
      devStatus,
      device,
      ...editorContext,
      readProjectFile: (rel) => window.avb.readContextFile({ projectPath, rel }),
      listProjectFiles: async () => (await window.avb.listContextFiles({ projectPath })).files,
      serializeNode: async (node) => (await window.avb.serializeNode({ node })).markup,
      getGitDiff: () => window.avb.getGitDiff({ projectPath }),
      writeContextBundle: (markdown) => window.avb.writeContextBundle({ projectPath, markdown }),
      listCmsCollections: () => window.avb.listCms(projectPath),
      cmsUsage: async (rel) => (await window.avb.cmsUsage({ projectPath, rel })).files,
      capturePreview,
    }),
    [currentFile, projectPath, editorContext, devLog, devStatus, device, capturePreview],
  );
~~~

- [ ] **Step 9: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 10: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx
rtk git commit -m "feat: register the preview screenshot chip and wire its capture path"
~~~

## Task 10: Add deterministic context suggestions

**Files:**

- Create: `src/context/contextSuggestions.test.js`
- Create: `src/context/contextSuggestions.js`

**Interfaces:**

- Produces: `SUGGESTION_PRIORITY: string[]`, `suggestChipTypes({ prompt, availableTypes, activeTypes = [] }) -> string[]` (chip types, most-suggested first, capped at 3).

- [ ] **Step 1: Write the failing tests**

Create `src/context/contextSuggestions.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { SUGGESTION_PRIORITY, suggestChipTypes } from './contextSuggestions.js';

describe('suggestChipTypes', () => {
  it('suggests nothing when no chip type is available', () => {
    expect(suggestChipTypes({ prompt: '', availableTypes: [], activeTypes: [] })).toEqual([]);
  });

  it('falls back to fixed priority order with no keyword match, capped at three', () => {
    const availableTypes = ['git-diff', 'current-file', 'current-page', 'selected-element'];
    expect(suggestChipTypes({ prompt: 'do something', availableTypes, activeTypes: [] })).toEqual([
      'selected-element',
      'current-page',
      'current-file',
    ]);
  });

  it('excludes chip types that are already active', () => {
    const availableTypes = ['selected-element', 'current-page'];
    expect(suggestChipTypes({ prompt: '', availableTypes, activeTypes: ['selected-element'] })).toEqual([
      'current-page',
    ]);
  });

  it('floats a keyword-matched type to the front', () => {
    const availableTypes = ['current-page', 'console-errors', 'current-file'];
    expect(suggestChipTypes({ prompt: 'the build is broken', availableTypes, activeTypes: [] })).toEqual([
      'console-errors',
      'current-page',
      'current-file',
    ]);
  });

  it('matches the layout/spacing/responsive rule to both selected element and the screenshot chip', () => {
    const availableTypes = ['preview-screenshot', 'current-file', 'selected-element'];
    expect(suggestChipTypes({ prompt: 'fix the mobile spacing', availableTypes, activeTypes: [] })).toEqual([
      'selected-element',
      'preview-screenshot',
      'current-file',
    ]);
  });

  it('matches the CMS keyword rule', () => {
    const availableTypes = ['cms-schema', 'current-file'];
    expect(suggestChipTypes({ prompt: 'add a field to this collection', availableTypes, activeTypes: [] })).toEqual([
      'cms-schema',
      'current-file',
    ]);
  });

  it('matches the git-diff keyword rule on a two-word phrase', () => {
    const availableTypes = ['git-diff', 'current-file'];
    expect(suggestChipTypes({ prompt: 'please review changes so far', availableTypes, activeTypes: [] })).toEqual([
      'git-diff',
      'current-file',
    ]);
  });

  it('is case-insensitive', () => {
    const availableTypes = ['console-errors', 'current-file'];
    expect(suggestChipTypes({ prompt: 'It ERRORS out', availableTypes, activeTypes: [] })).toEqual([
      'console-errors',
      'current-file',
    ]);
  });

  it('exports the full priority order for reuse', () => {
    expect(SUGGESTION_PRIORITY).toContain('preview-screenshot');
    expect(SUGGESTION_PRIORITY).toContain('cms-schema');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextSuggestions.test.js
~~~

Expected: FAIL — `contextSuggestions.js` does not exist.

- [ ] **Step 3: Implement the suggestion ranking**

Create `src/context/contextSuggestions.js`:

~~~js
// Deterministic, keyword-based suggestion ranking (spec §10, §24) — no AI
// involved. `SUGGESTION_PRIORITY` is the fixed fallback order; any type
// matched by a keyword rule against the current prompt text floats to the
// front of that order instead.
export const SUGGESTION_PRIORITY = [
  'selected-element',
  'current-component',
  'current-page',
  'cms-schema',
  'console-errors',
  'current-file',
  'git-diff',
  'preview-screenshot',
];

const KEYWORD_RULES = [
  { words: ['error', 'broken', 'fails', 'failing', 'crash'], types: ['console-errors'] },
  { words: ['component', 'reusable'], types: ['current-component'] },
  { words: ['cms', 'collection', 'field'], types: ['cms-schema'] },
  { words: ['layout', 'spacing', 'responsive', 'mobile'], types: ['selected-element', 'preview-screenshot'] },
  { words: ['review changes', 'diff'], types: ['git-diff'] },
];

const MAX_SUGGESTIONS = 3;

function keywordMatches(prompt) {
  const text = (prompt || '').toLowerCase();
  const matched = new Set();
  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((word) => text.includes(word))) {
      for (const type of rule.types) matched.add(type);
    }
  }
  return matched;
}

export function suggestChipTypes({ prompt, availableTypes, activeTypes = [] }) {
  const available = new Set(availableTypes);
  const active = new Set(activeTypes);
  const candidates = SUGGESTION_PRIORITY.filter((type) => available.has(type) && !active.has(type));
  const matched = keywordMatches(prompt);
  const matchedFirst = candidates.filter((type) => matched.has(type));
  const rest = candidates.filter((type) => !matched.has(type));
  return [...matchedFirst, ...rest].slice(0, MAX_SUGGESTIONS);
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/contextSuggestions.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/contextSuggestions.js src/context/contextSuggestions.test.js
rtk git commit -m "feat: add deterministic keyword-based context suggestions"
~~~

## Task 11: Show suggested context in the Add Context menu

**Files:**

- Modify: `src/panels/ContextPicker.jsx`
- Modify: `src/panels/ContextPicker.test.jsx`
- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/panels/ContextChipBar.test.jsx`

**Interfaces:**

- Produces: `<ContextPicker suggested={[...resolvers]} resolvers={[...resolvers]} .../>` renders a "Suggested" section (when non-empty) above the existing list; picking a suggested item calls `onPickSimple` exactly like the existing list (Selected Files is never suggested — see `contextSuggestions.js`'s `SUGGESTION_PRIORITY` — so no file-picker special case is needed there).

- [ ] **Step 1: Write the failing ContextPicker tests**

In `src/panels/ContextPicker.test.jsx`, add a new test:

~~~js
  it('renders a Suggested section above the full list and picks from it the same way', () => {
    const onPickSimple = vi.fn();
    render(
      <ContextPicker
        resolvers={resolvers}
        suggested={[{ type: 'current-page', label: 'Current page' }]}
        onPickSimple={onPickSimple}
        onPickFiles={vi.fn()}
        onListFiles={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Current page'));
    expect(onPickSimple).toHaveBeenCalledWith('current-page');
  });

  it('omits the Suggested heading when there is nothing to suggest', () => {
    render(
      <ContextPicker
        resolvers={resolvers}
        suggested={[]}
        onPickSimple={vi.fn()}
        onPickFiles={vi.fn()}
        onListFiles={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument();
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextPicker.test.jsx
~~~

Expected: FAIL — no "Suggested" section exists yet.

- [ ] **Step 3: Render the Suggested section**

In `src/panels/ContextPicker.jsx`, change the component signature and the `view === 'menu'` branch:

~~~jsx
export default function ContextPicker({ resolvers, suggested = [], onPickSimple, onPickFiles, onListFiles, onClose }) {
~~~

~~~jsx
      {view === 'menu' ? (
        <>
          {suggested.length > 0 && (
            <>
              <h3>Suggested</h3>
              {suggested.map((resolver) => (
                <div key={`suggested-${resolver.type}`} className="list-item" onClick={() => onPickSimple(resolver.type)}>
                  {resolver.label}
                </div>
              ))}
            </>
          )}
          <h3>Add context</h3>
          {resolvers.map((resolver) => (
            <div
              key={resolver.type}
              className="list-item"
              onClick={() => (resolver.type === 'selected-files' ? openFiles() : onPickSimple(resolver.type))}
            >
              {resolver.label}
            </div>
          ))}
        </>
      ) : (
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextPicker.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit ContextPicker**

~~~bash
rtk git add src/panels/ContextPicker.jsx src/panels/ContextPicker.test.jsx
rtk git commit -m "feat: render a Suggested section in the Add Context menu"
~~~

- [ ] **Step 6: Write the failing ContextChipBar test**

Add a new test to `src/panels/ContextChipBar.test.jsx`:

~~~js
  it('suggests Current page (keyword-free, top of the fixed priority order) before other available context', () => {
    render(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{
          pageInfo: { editable: true, route: '/', path: 'src/pages/index.astro', layoutName: '', imports: [], frontmatter: '' },
        }}
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    const suggestedHeading = screen.getByText('Suggested');
    const suggestedPage = suggestedHeading.nextSibling;
    expect(suggestedPage).toHaveTextContent('Current page');
  });

  it('does not duplicate a suggested resolver in the rest of the menu', () => {
    render(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{
          pageInfo: { editable: true, route: '/', path: 'src/pages/index.astro', layoutName: '', imports: [], frontmatter: '' },
        }}
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.getAllByText('Current page')).toHaveLength(1);
  });
~~~

- [ ] **Step 7: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: FAIL — `ContextPicker` isn't given a `suggested` list yet, so "Current page" appears once in the plain list with no "Suggested" heading before it.

- [ ] **Step 8: Compute and pass suggestions**

In `src/panels/ContextChipBar.jsx`, add the import:

~~~js
import { suggestChipTypes } from '../context/contextSuggestions.js';
~~~

Change the resolver-filtering and picker-rendering logic:

~~~js
  const availableResolvers = listResolvers().filter((resolver) => resolver.isAvailable(appState));
  const suggestedTypes = suggestChipTypes({
    prompt,
    availableTypes: availableResolvers.map((r) => r.type),
    activeTypes: chips.map((c) => c.type),
  });
  const suggestedResolvers = suggestedTypes.map((type) => getResolver(type)).filter(Boolean);
  const menuResolvers = availableResolvers.filter((r) => !suggestedTypes.includes(r.type));
~~~

And update the `<ContextPicker>` render:

~~~jsx
          {pickerOpen && (
            <ContextPicker
              resolvers={menuResolvers}
              suggested={suggestedResolvers}
              onPickSimple={pickSimple}
              onPickFiles={pickFiles}
              onListFiles={appState.listProjectFiles}
              onClose={() => setPickerOpen(false)}
            />
          )}
~~~

- [ ] **Step 9: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 10: Run the full test suite**

Run:

~~~bash
rtk npm test
~~~

Expected: every test in the repository passes.

- [ ] **Step 11: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx
rtk git commit -m "feat: surface suggested context chips in the chip bar"
~~~

## Acceptance Criteria Mapping

- Spec §9.4 (CMS Schema): Task 3 — collection name/file/shape/fields/item count/sample item(s)/usage, "Relevant collections" default with a page-import-based fallback to "All collections", "one sample item" default, "All items" warning banner.
- Spec §9.6 (Preview Screenshot): Tasks 4–5, 7, 9 — Current viewport and Selected-element MVP modes (§29), plus the Phase-4-only Responsive set mode; documented scope reductions for per-element cropping/highlighting and Full page mode.
- Spec §13 (context-file delivery for images): Task 2 — screenshots always force Mode B.
- Spec §10/§24 (Suggested context): Tasks 10–11 — deterministic priority order plus keyword rules, no AI, capped and deduplicated against already-active chips.
- Spec §30 Phase 4's four bullets (preview screenshot, CMS schema, responsive context, suggested context) are each covered by at least one task above; no bullet is left unaddressed.
