# Terminal Context Chips (Phase 4: Rich Visual and Content Context) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach a screenshot of the dev preview and a structured summary of the project's CMS collections as context chips — on top of Phase 1–3's file, selection, page, component, errors, and Git diff chips — and add a suggested-context ranking so the "Add context" menu groups relevant chips at the top and highlights them when the prompt text contains certain keywords.

**Architecture:** Two new resolvers (`previewScreenshotResolver`, `cmsSchemaResolver`) plug into the existing resolver registry, `ContextChipBar`, and `ContextDetailsPopover` exactly like every prior phase. `previewScreenshotResolver` captures the preview iframe's visible region via a new `context:capturePreview` IPC channel that calls Electron's `mainWindow.webContents.capturePage()`, writes the PNG to `.stacki/tmp/context/preview-<timestamp>.png` (alongside the existing context-bundle markdown files), and includes the relative path in the composed prompt. The resolver needs the iframe's viewport-relative bounding rect, which originates in `PreviewPane`'s `frameRef`; a simple `getPreviewRect` callback is threaded from `PreviewPane` → `App` → `TerminalPanel` → `ContextChipBar` and exposed on `appState`. `cmsSchemaResolver` reuses the existing CMS infrastructure (`window.avb.listCms` / `readCms` / `cmsMeta`, `src/cmsSchema.js`) to list every collection, enumerate its fields with named types (from user-declared meta, falling back to inferred types), and include one sample item. The "Relevant collections" mode selects only the CMS data sources the current page already imports (detected via `appState.pageInfo.imports` — the same source `currentPageResolver` already reads). A new pure `src/context/suggestedContext.js` module ranks every available resolver for the current `appState` using the spec's §10 priority order — Selected element > Current component > Current page > CMS schema > Console errors > Current file > Git diff > Preview screenshot — and also scans the user's typed prompt for spec §24's keyword hints (e.g. "component" → Current component, "CMS" / "collection" → CMS schema, "screenshot" / "visually" → Preview screenshot), folding the keyword-boosted rank into `ContextPicker`'s new "Suggested" section.

**Tech Stack:** Electron 33, React 18, Vite 6, Vitest 3.2, `@testing-library/react`, Node's `fs` (via `electron/contextFiles.js`'s existing dependency-injected pattern), the existing `webContents.capturePage()` (already used by `electron/main.js`'s `recents:captureThumb` handler), the existing `cmsSchema.js` pure utilities. No new dependencies.

## Global Constraints

- This plan implements spec §30 Phase 4 ("Rich visual and content context"): preview screenshot, CMS schema, suggested-context ranking. Responsive screenshot sets are deferred per spec §29.
- **Screenshot capture uses the existing `webContents.capturePage()`, not Puppeteer/Selenium.** `electron/main.js:766` already calls `mainWindow.webContents.capturePage()` for thumbnail capture — this plan adds a second, near-identical call for context screenshots. The renderer computes the preview iframe's bounding rect via `getBoundingClientRect()` and sends it through IPC; the main process clips the capture to that rect.
- **The preview iframe may be zero-sized or offscreen** (terminal panel open, dev server stopped, page not loaded). The resolver's `isAvailable()` checks `appState.devUrl` (the dev server's base URL) synchronously — if the server is not running the chip is unavailable. The `resolve()` step also calls `appState.getPreviewRect()` and rejects with a clear error message if the rect has zero width/height.
- **Screenshot capture is a full-frame PNG save.** There is no in-memory only capture, no annotating/highlighting of selected elements by modifying the image pixels. Selected-element mode includes the element's bounding-box coordinates and bounding-rect metadata in the Markdown alongside the screenshot path, so the agent can correlate the image to the Selected Element chip's data (spec §9.6 annotation: "draw a temporary highlight around the element" becomes a coordinate note the agent can use). The element's rect is sourced from the existing `avb:rects` postMessage data that `PreviewPane` already receives — it is added to the `frameRect` callback's return value as an optional `selectedRect`.
- **CMS collections are read via the existing JSON-file APIs, not a separate database.** `listCms` reads everything under `src/`; `readCms` reads a single file's parsed JSON; `cmsMeta` reads the user-declared field type overrides in `.stacki/cms.json`. The resolver uses these plus `src/cmsSchema.js`'s `collectionOf()` / `fieldsOf()` / `titleOf()` / `labelize()` / `inferType()` to produce a structured field list.
- **The "Relevant collections" selection mode uses the current page's CMS imports only.** The `pageInfo.imports` array already flows through `editorContext` into `appState`; `currentPageResolver` already extracts `.json` paths from it. `cmsSchemaResolver` does the same filtering (only `.json` import paths) but goes further — reading each matched collection's actual schema.
- **Suggested-context ranking is keyword-boosted but purely heuristic** (spec §24: "Simple keyword rules are sufficient. Initial implementation should avoid AI inference."). The ranking is a pure function of `availableResolvers` and `prompt` — no network call, no ML model.
- **`ContextPicker`'s menu is grouped** into "Suggested" (keyword-boosted top hits), "Project" (current file, selected files, Git diff, CMS schema), and "Visual" (selected element, current page, current component, console errors, preview screenshot) sections per spec §10. Resolvers appear at most once — the highest-ranked section wins (Suggested > Project > Visual).
- No TypeScript: this codebase is plain JS/JSX.
- New Electron logic follows the `electron/contextFiles.js` (dependency-injected pure logic) + `electron/contextIpc.js` (thin `ipcMain` wiring with sender validation) split.
- IPC exposed to the renderer stays on the single existing `window.avb` object in `electron/preload.js`.
- Every shell command in this plan is `rtk`-prefixed, per the user's global tooling setup.
- Follow TDD for every task: write the failing test, confirm RED, implement, confirm GREEN, commit.
- Every file/line reference in this plan was read directly from the current repository state (post-Phase-3), not from any prior plan document.

---

**Source spec:** docs/superpowers/specs/terminal-chips.md (§1–§34; this plan implements §30 Phase 4 only)

**Prior work:** docs/superpowers/plans/2026-08-05-terminal-context-chips-phase-1.md through docs/superpowers/plans/2026-08-06-terminal-context-chips-phase-3.md (all merged) implemented the `ContextSnapshot` model, resolver registry, `useTerminalContext` hook, chip bar UI, per-resolver staleness, and the Current File / Selected Files / Selected Element / Current Page / Current Component / Console Errors / Git Diff resolvers, plus secret scanning, size estimation, and context-file delivery this plan builds on.

**Starting point:** create a dedicated implementation worktree from the commit containing this plan, preserve unrelated user changes, and execute each task from that worktree.

## File Structure

### New files

- `src/context/previewScreenshotResolver.js` — resolver for preview iframe screenshot (spec §9.6).
- `src/context/previewScreenshotResolver.test.js`
- `src/context/cmsSchemaResolver.js` — resolver for CMS collection schemas (spec §9.4).
- `src/context/cmsSchemaResolver.test.js`
- `src/context/suggestedContext.js` — `rankResolvers(availableResolvers, appState, prompt)` → ranked array with `{resolver, section: 'suggested'|'project'|'visual', keywordBoost}` (spec §10, §24).
- `src/context/suggestedContext.test.js`

### Modified files

- `src/context/contextTypes.js` — add `PREVIEW_SCREENSHOT`, `CMS_SCHEMA` to `CONTEXT_CHIP_TYPES`.
- `src/context/contextTypes.test.js`
- `electron/contextIpc.js` — add `context:capturePreview` channel.
- `electron/contextIpc.test.js`
- `electron/preload.js` — expose `capturePreview` on `window.avb`.
- `src/panels/ContextChipBar.jsx` — register the two new resolvers; accept `devUrl` and `getPreviewRect` props; merge into `appState`.
- `src/panels/ContextChipBar.test.jsx`
- `src/panels/TerminalPanel.jsx` — accept and forward `devUrl` and `getPreviewRect`.
- `src/panels/ContextPicker.jsx` — group resolvers into suggested/project/visual sections using `suggestedContext.rankResolvers`.
- `src/panels/ContextPicker.test.jsx` (new)
- `src/panels/PreviewPane.jsx` — accept `onFrameMounted` prop; call it with `frameRef` on mount.
- `src/App.jsx` — store `previewFrameRef` from `PreviewPane`'s `onFrameMounted`; pass `devUrl` and a `getPreviewRect` callback to `TerminalPanel`.
- `src/App.test.jsx`
- `src/styles.css` — add screenshot-thumbnail and suggested-context section styles.

---

## Task 1: Add the two new chip types

**Files:**

- Modify: `src/context/contextTypes.js:1-9`
- Modify: `src/context/contextTypes.test.js`

**Interfaces:**

- Produces: `CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT === 'preview-screenshot'`, `CONTEXT_CHIP_TYPES.CMS_SCHEMA === 'cms-schema'`.

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
    expect(CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT).toBe('preview-screenshot');
    expect(CONTEXT_CHIP_TYPES.CMS_SCHEMA).toBe('cms-schema');
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
  PREVIEW_SCREENSHOT: 'preview-screenshot',
  CMS_SCHEMA: 'cms-schema',
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

---

## Task 2: Add the preview screenshot IPC channel

**Files:**

- Modify: `electron/contextIpc.js`
- Modify: `electron/contextIpc.test.js`
- Modify: `electron/preload.js`

**Interfaces:**

- Produces (main process): IPC handler `context:capturePreview` — takes `{ x, y, width, height }` viewport-relative coordinates, calls `mainWindow.webContents.capturePage(rect)`, saves PNG to `.stacki/tmp/context/preview-<timestamp>.png`, returns `{ relPath }`.
- Produces (preload): `window.avb.capturePreview(payload)`.

- [ ] **Step 1: Extend the IPC registry**

In `electron/contextIpc.js`, add a new `capturePreview` parameter to `registerContextIpc`'s dependency list:

~~~js
function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  getMainWindow,        // NEW — BrowserWindow for capturing its webContents
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
  serializeNode = (node) => astroParser.serializeNodes([node]),
  writeContextBundle = contextFiles.writeContextBundle,
  capturePreview = contextFiles.capturePreview,  // NEW
  runGit,
}) {
~~~

Add the handler before the last `ipcMain.handle(...)` block:

~~~js
  const capture = async (event, payload) => {
    assertAllowed(event);
    const rect = {
      x: Math.max(0, Math.round(payload?.x ?? 0)),
      y: Math.max(0, Math.round(payload?.y ?? 0)),
      width: Math.max(1, Math.round(payload?.width ?? 1)),
      height: Math.max(1, Math.round(payload?.height ?? 1)),
    };
    return capturePreview(requireRoot(), getMainWindow(), rect);
  };
~~~

Register it alongside the existing handlers:

~~~js
  ipcMain.handle('context:capturePreview', capture);
~~~

And clean it up in the returned teardown function:

~~~js
    ipcMain.removeHandler('context:capturePreview');
~~~

- [ ] **Step 2: Implement `capturePreview` in `electron/contextFiles.js`**

Add to `electron/contextFiles.js`:

~~~js
// Captures a rectangular region of a BrowserWindow's webContents, saves it as
// a timestamped PNG beside the existing context bundles, and returns the same
// relPath shape writeContextBundle uses so the screenshot resolver's call site
// is uniform with the context-file delivery path.
function capturePreview(root, browserWindow, rect) {
  // Must use the synchronous webContents.capturePage() — the Promise-returning
  // variant (no callback) is available in Electron 33 but the existing
  // recents:captureThumb handler already uses the callback form; mirror that to
  // stay consistent across the codebase.
  const image = browserWindow.webContents.capturePage({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  if (image.isEmpty()) throw new Error('The captured preview region is empty.');
  const dir = ensureContextDir(root);
  pruneOldContextBundles(dir);
  const filename = `preview-${Date.now()}.png`;
  const fs = require('fs');
  const path = require('path');
  fs.writeFileSync(path.join(dir, filename), image.toPNG());
  return { relPath: `.stacki/tmp/context/${filename}` };
}

module.exports = {
  // ... existing exports ...
  capturePreview,
};
~~~

- [ ] **Step 3: Wire `getMainWindow` from `electron/main.js`**

In `electron/main.js`, find the `registerContextIpc({...})` call and add the new dependencies:

~~~js
  registerContextIpc({
    ipcMain,
    isAllowedSender,
    getProjectRoot,
    getMainWindow: () => mainWindow,  // NEW
    runGit,
  });
~~~

- [ ] **Step 4: Expose `capturePreview` on `window.avb`**

In `electron/preload.js`, find the terminal-context-chips block (after `getGitDiff`, around line 557) and add:

~~~js
  capturePreview: invoke('context:capturePreview'),
~~~

- [ ] **Step 5: Write and run the IPC tests**

Create or extend `electron/contextIpc.test.js` with a test for the `context:capturePreview` channel. Test:

- A valid rect calls `capturePreview` with the root, mainWindow, and rounded rect.
- A zero-area rect throws.
- An untrusted sender is rejected.

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
~~~

- [ ] **Step 6: Commit**

~~~bash
rtk git add electron/contextIpc.js electron/contextIpc.test.js electron/contextFiles.js electron/preload.js electron/main.js
rtk git commit -m "feat: add preview screenshot IPC channel"
~~~

---

## Task 3: Preview Screenshot Resolver

**Files:**

- Create: `src/context/previewScreenshotResolver.test.js`
- Create: `src/context/previewScreenshotResolver.js`

**Interfaces:**

- Produces: `previewScreenshotResolver` object with the standard `{ type, label, isAvailable, getDefaultOptions, resolve, computeStaleKey, renderMarkdown }` shape.
- Consumes from `appState`: `devUrl` (availability), `getPreviewRect()` (returns `{ x, y, width, height, selectedRect? }` or null), `capturePreview({ x, y, width, height })` → `{ relPath }`.

- [ ] **Step 1: Write the failing tests**

Create `src/context/previewScreenshotResolver.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { previewScreenshotResolver } from './previewScreenshotResolver.js';
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

describe('previewScreenshotResolver', () => {
  it('declares the correct type', () => {
    expect(previewScreenshotResolver.type).toBe(CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT);
  });

  describe('isAvailable', () => {
    it('is available when the dev server is running', () => {
      expect(previewScreenshotResolver.isAvailable({ devUrl: 'http://localhost:4321' })).toBe(true);
    });

    it('is unavailable when no dev server URL is set', () => {
      expect(previewScreenshotResolver.isAvailable({ devUrl: null })).toBe(false);
    });
  });

  describe('getDefaultOptions', () => {
    it('defaults to viewport capture mode', () => {
      expect(previewScreenshotResolver.getDefaultOptions()).toEqual({ mode: 'viewport' });
    });
  });

  describe('resolve', () => {
    it('captures the preview region and returns the screenshot path', async () => {
      const capturePreview = async () => ({ relPath: '.stacki/tmp/context/preview-99.png' });
      const getPreviewRect = () => ({ x: 300, y: 100, width: 800, height: 600 });
      const appState = {
        devUrl: 'http://localhost:4321',
        getPreviewRect,
        capturePreview,
      };
      const result = await previewScreenshotResolver.resolve(appState, { mode: 'viewport' });
      expect(result.data).toMatchObject({
        mode: 'viewport',
        path: '.stacki/tmp/context/preview-99.png',
        viewportWidth: 800,
        viewportHeight: 600,
        selectedRect: null,
      });
      expect(result.sourceRevision).toBeTruthy();
    });

    it('includes the selected element rect in selected-element mode', async () => {
      const capturePreview = async () => ({ relPath: '.stacki/tmp/context/preview-100.png' });
      const getPreviewRect = () => ({
        x: 300, y: 100, width: 800, height: 600,
        selectedRect: { x: 100, y: 50, w: 200, h: 40 },
      });
      const appState = {
        devUrl: 'http://localhost:4321',
        getPreviewRect,
        capturePreview,
      };
      const result = await previewScreenshotResolver.resolve(appState, { mode: 'selected-element' });
      expect(result.data.selectedRect).toEqual({ x: 100, y: 50, w: 200, h: 40 });
    });

    it('rejects when the preview rect has zero area', async () => {
      const getPreviewRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect, capturePreview: async () => ({}) };
      await expect(previewScreenshotResolver.resolve(appState, { mode: 'viewport' })).rejects.toThrow(
        'The preview is not visible',
      );
    });

    it('rejects when getPreviewRect returns null', async () => {
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect: () => null, capturePreview: async () => ({}) };
      await expect(previewScreenshotResolver.resolve(appState, { mode: 'viewport' })).rejects.toThrow(
        'The preview is not visible',
      );
    });
  });

  describe('computeStaleKey', () => {
    it('returns a key based on the preview rect dimensions', () => {
      const appState = {
        devUrl: 'http://localhost:4321',
        getPreviewRect: () => ({ x: 300, y: 100, width: 800, height: 600 }),
      };
      expect(typeof previewScreenshotResolver.computeStaleKey(appState)).toBe('string');
    });

    it('returns null when the preview is not available', () => {
      const appState = {
        devUrl: 'http://localhost:4321',
        getPreviewRect: () => null,
      };
      expect(previewScreenshotResolver.computeStaleKey(appState)).toBeNull();
    });
  });

  describe('renderMarkdown', () => {
    it('renders the screenshot path and viewport info', () => {
      const snapshot = {
        data: {
          mode: 'viewport',
          path: '.stacki/tmp/context/preview-1.png',
          viewportWidth: 800,
          viewportHeight: 600,
          capturedAt: '2026-08-10T12:00:00.000Z',
          selectedRect: null,
        },
      };
      const markdown = previewScreenshotResolver.renderMarkdown(snapshot);
      expect(markdown).toContain('### Preview screenshot');
      expect(markdown).toContain('.stacki/tmp/context/preview-1.png');
      expect(markdown).toContain('800 × 600');
    });

    it('includes selected element coordinates in selected-element mode', () => {
      const snapshot = {
        data: {
          mode: 'selected-element',
          path: '.stacki/tmp/context/preview-2.png',
          viewportWidth: 1440,
          viewportHeight: 900,
          capturedAt: '2026-08-10T12:00:00.000Z',
          selectedRect: { x: 100, y: 50, w: 200, h: 40 },
        },
      };
      const markdown = previewScreenshotResolver.renderMarkdown(snapshot);
      expect(markdown).toContain('selected element');
      expect(markdown).toContain('100, 50');
    });
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

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function rectKey(rect) {
  if (!rect) return null;
  return `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
}

export const previewScreenshotResolver = {
  type: CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT,
  label: 'Preview screenshot',

  isAvailable(appState) {
    return !!appState.devUrl;
  },

  getDefaultOptions() {
    return { mode: 'viewport' };
  },

  async resolve(appState, options) {
    const mode = options?.mode || 'viewport';
    const rect = appState.getPreviewRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error('The preview is not visible. Make sure the dev server is running and the preview panel is open.');
    }
    const { relPath } = await appState.capturePreview({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    const data = {
      mode,
      path: relPath,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      capturedAt: new Date().toISOString(),
      selectedRect: rect.selectedRect || null,
    };
    return {
      data,
      estimatedCharacters: relPath.length + 200,
      sourceRevision: `${mode}:${relPath}:${rectKey(rect)}`,
    };
  },

  computeStaleKey(appState) {
    const rect = appState.getPreviewRect();
    return rect ? rectKey(rect) : null;
  },

  renderMarkdown(snapshot) {
    const { mode, path, viewportWidth, viewportHeight, capturedAt, selectedRect } = snapshot.data;
    const lines = ['### Preview screenshot', ''];
    lines.push(`- File: \`${path}\``);
    lines.push(`- Viewport: ${viewportWidth} × ${viewportHeight}`);
    lines.push(`- Captured: ${new Date(capturedAt).toLocaleTimeString()}`);
    if (mode === 'selected-element' && selectedRect) {
      lines.push(`- Selected element region: ${selectedRect.x}, ${selectedRect.y} (${selectedRect.w} × ${selectedRect.h})`);
    }
    lines.push('', `The screenshot is at the project-relative path above. Read it and refer to it as the current state of the visible preview.`);
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

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/previewScreenshotResolver.js src/context/previewScreenshotResolver.test.js
rtk git commit -m "feat: add preview screenshot context resolver"
~~~

---

## Task 4: CMS Schema Resolver

**Files:**

- Create: `src/context/cmsSchemaResolver.test.js`
- Create: `src/context/cmsSchemaResolver.js`

**Interfaces:**

- Produces: `cmsSchemaResolver` object with the standard resolver shape.
- Consumes from `appState`: `projectPath` (for `window.avb` calls), `pageInfo.imports` (for "Relevant collections" filtering), `listCmsP` / `readCmsP` / `cmsMetaP` (async functions wrapping `window.avb` — or the resolver calls `window.avb` directly since it runs in the renderer).
- Note: The resolver calls `window.avb` synchronously at the call site (it's already available as a global in the renderer), following the same pattern `currentComponentResolver` uses for `appState.readProjectFile` (which calls `window.avb.readContextFile`).

- [ ] **Step 1: Write the failing tests**

Create `src/context/cmsSchemaResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { cmsSchemaResolver } from './cmsSchemaResolver.js';
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

describe('cmsSchemaResolver', () => {
  it('declares the correct type', () => {
    expect(cmsSchemaResolver.type).toBe(CONTEXT_CHIP_TYPES.CMS_SCHEMA);
  });

  describe('isAvailable', () => {
    it('is available when listCms returns files', () => {
      const appState = {
        listCms: async () => ({ files: [{ rel: 'data/posts.json' }] }),
      };
      expect(cmsSchemaResolver.isAvailable(appState)).toBe(true);
    });

    it('is available optimistically — checks nothing', () => {
      expect(cmsSchemaResolver.isAvailable({})).toBe(true);
    });
  });

  describe('getDefaultOptions', () => {
    it('defaults to relevant collections', () => {
      expect(cmsSchemaResolver.getDefaultOptions()).toEqual({ mode: 'relevant' });
    });
  });

  describe('resolve (relevant mode)', () => {
    it('returns field schemas for collections imported by the current page', async () => {
      const appState = {
        projectPath: '/projects/site',
        pageInfo: {
          imports: [
            { name: 'posts', path: 'data/posts.json' },
            { name: 'Layout', path: 'layouts/Base.astro' },
          ],
        },
        listCms: async () => ({
          files: [
            { rel: 'data/posts.json', name: 'posts.json', dir: 'data', data: [{ title: 'Hello', body: 'World' }] },
            { rel: 'data/authors.json', name: 'authors.json', dir: 'data', data: [{ name: 'Ada' }] },
          ],
        }),
        readCms: async () => ({ data: [] }),
        cmsMeta: async () => ({ meta: {} }),
      };
      const result = await cmsSchemaResolver.resolve(appState, { mode: 'relevant' });
      expect(result.data.collections).toHaveLength(1);
      expect(result.data.collections[0].rel).toBe('data/posts.json');
    });
  });

  describe('resolve (all mode)', () => {
    it('returns field schemas for every CMS collection', async () => {
      const appState = {
        projectPath: '/projects/site',
        listCms: async () => ({
          files: [
            { rel: 'data/posts.json', name: 'posts.json', dir: 'data', data: [{ title: 'Hello' }] },
            { rel: 'data/authors.json', name: 'authors.json', dir: 'data', data: [{ name: 'Ada' }] },
          ],
        }),
        readCms: async () => ({ data: [] }),
        cmsMeta: async () => ({ meta: {} }),
      };
      const result = await cmsSchemaResolver.resolve(appState, { mode: 'all' });
      expect(result.data.collections).toHaveLength(2);
    });
  });

  it('rejects when no CMS collections exist', async () => {
    const appState = {
      listCms: async () => ({ files: [] }),
    };
    await expect(cmsSchemaResolver.resolve(appState, { mode: 'all' })).rejects.toThrow('No CMS collections');
  });

  describe('renderMarkdown', () => {
    it('renders collection names, fields, and a sample item', () => {
      const snapshot = {
        data: {
          mode: 'all',
          collections: [
            {
              rel: 'data/posts.json',
              label: 'Posts',
              single: false,
              itemCount: 3,
              fields: [
                { key: 'title', label: 'Title', type: 'text' },
                { key: 'body', label: 'Body', type: 'longtext' },
              ],
              sampleItem: { title: 'Hello' },
            },
          ],
        },
      };
      const markdown = cmsSchemaResolver.renderMarkdown(snapshot);
      expect(markdown).toContain('### CMS schema');
      expect(markdown).toContain('Posts');
      expect(markdown).toContain('data/posts.json');
      expect(markdown).toContain('Title');
      expect(markdown).toContain('Body');
      expect(markdown).toContain('text');
      expect(markdown).toContain('longtext');
    });
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
import { collectionOf, fieldsOf, titleOf, labelize } from '../cmsSchema.js';

const JSON_IMPORT_RE = /\.json$/i;

function cmsImportPaths(pageInfo) {
  if (!pageInfo?.imports) return [];
  return pageInfo.imports.filter((i) => JSON_IMPORT_RE.test(i.path)).map((i) => i.path);
}

function declaredType(meta, collectionRel, fieldKey) {
  const declared = meta?.[collectionRel];
  if (!declared) return null;
  const config = declared[fieldKey];
  if (typeof config === 'object' && config.type) return config.type;
  return config || null;
}

function fieldLabel(fields, key, declaredTypeName) {
  if (declaredTypeName === 'reference' || declaredTypeName === 'multiReference') {
    return `${labelize(key)} (→ ${declaredTypeName})`;
  }
  const field = fields.find((f) => f.key === key);
  return field ? field.label : labelize(key);
}

export const cmsSchemaResolver = {
  type: CONTEXT_CHIP_TYPES.CMS_SCHEMA,
  label: 'CMS schema',

  isAvailable(_appState) {
    // Optimistic: a project being open is all that can be checked
    // synchronously. Whether it actually has CMS collections can only be
    // known by calling listCms(), which resolve() does.
    return true;
  },

  getDefaultOptions() {
    return { mode: 'relevant' };
  },

  async resolve(appState, options) {
    const mode = options?.mode || 'relevant';
    const { files } = await window.avb.listCms(appState.projectPath);
    if (!files || files.length === 0) throw new Error('No CMS collections exist in this project.');

    let targetRels;
    if (mode === 'relevant' && appState.pageInfo) {
      const relevantPaths = cmsImportPaths(appState.pageInfo);
      targetRels = relevantPaths.length > 0 ? relevantPaths : files.map((f) => f.rel);
    } else {
      targetRels = files.map((f) => f.rel);
    }

    const targetFiles = files.filter((f) => targetRels.includes(f.rel));
    if (targetFiles.length === 0) throw new Error('No CMS collections match the selected mode.');

    const { meta } = await window.avb.cmsMeta(appState.projectPath);

    const collections = [];
    let totalChars = 0;
    for (const file of targetFiles) {
      const collection = collectionOf(file);
      const fields = fieldsOf(collection.items);

      const enrichedFields = fields.map((f) => {
        const declared = declaredType(meta, file.rel, f.key);
        return {
          key: f.key,
          label: fieldLabel(fields, f.key, declared),
          type: declared || f.type,
        };
      });

      const sampleItem = collection.items.length > 0
        ? (() => {
            const it = collection.items.find((i) => i && typeof i === 'object' && !Array.isArray(i));
            if (!it) return collection.items[0];
            const preview = {};
            // Include only the first 5 fields in the sample, to keep it short
            enrichedFields.slice(0, 5).forEach((f) => {
              if (it[f.key] !== undefined) preview[f.key] = it[f.key];
            });
            return preview;
          })()
        : null;

      const data = {
        rel: file.rel,
        label: collection.label,
        single: collection.single,
        itemCount: collection.items.length,
        fields: enrichedFields,
        sampleItem,
      };
      collections.push(data);
      totalChars += JSON.stringify(data).length;
    }

    return {
      data: { mode, collections },
      estimatedCharacters: totalChars,
      sourceRevision: `${mode}:${collections.length}:${collections.reduce((sum, c) => sum + c.itemCount, 0)}`,
    };
  },

  // No computeStaleKey — CMS collections change only when the user explicitly
  // adds/removes/edit items in the CMS panel, and the current staleness
  // mechanism can't detect disk changes without async IPC. Follows
  // selectedFilesResolver's precedent: no auto-stale, manual refresh only.
  renderMarkdown(snapshot) {
    const { collections } = snapshot.data;
    const lines = ['### CMS schema', ''];
    for (const col of collections) {
      lines.push(`#### ${col.label}`, '');
      lines.push(`- File: \`${col.rel}\``);
      lines.push(`- Mode: ${col.single ? 'single item' : `${col.itemCount} item${col.itemCount === 1 ? '' : 's'}`}`);
      if (col.fields.length > 0) {
        lines.push(`- Fields:`);
        for (const f of col.fields) {
          lines.push(`  - **${f.label}** (${f.type})`);
        }
      } else {
        lines.push('- _(no fields)_');
      }
      if (col.sampleItem) {
        lines.push('', 'Sample item:', '', '```json', JSON.stringify(col.sampleItem, null, 2), '```');
      }
      lines.push('');
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

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/cmsSchemaResolver.js src/context/cmsSchemaResolver.test.js
rtk git commit -m "feat: add CMS schema context resolver"
~~~

---

## Task 5: Suggested Context Ranking

**Files:**

- Create: `src/context/suggestedContext.test.js`
- Create: `src/context/suggestedContext.js`
- Modify: `src/panels/ContextPicker.jsx`
- Modify: `src/styles.css`

**Interfaces:**

- Produces: `rankResolvers(availableResolvers, appState, prompt) → Array<{resolver, section: 'suggested'|'project'|'visual', keywordBoost: number}>`. The array is sorted by priority (spec §10), with keyword-boosted items promoted into the "suggested" section.
- Produces: `SUGGESTED_THRESHOLD = 3` — the maximum number of items in the "suggested" group.

**Priority order (spec §10, higher = better):**

1. Selected element (priority 8)
2. Current component (priority 7)
3. Current page (priority 6)
4. CMS schema (priority 5)
5. Console errors (priority 4)
6. Current file (priority 3)
7. Git diff (priority 2)
8. Preview screenshot (priority 1)
9. Selected files (priority 0 — always shows in "Project" section, never auto-suggested)

**Keyword boosts (spec §24):**

| Prompt contains | Boosts |
|---|---|
| `error`, `broken`, `fails` | Console errors +2 |
| `component`, `reusable` | Current component +2 |
| `cms`, `collection`, `field` | CMS schema +2 |
| `layout`, `spacing`, `responsive` | Selected element +1 |
| `screenshot`, `visually`, `looks like` | Preview screenshot +2 |
| `review changes`, `diff` | Git diff +2 |
| `page`, `route` | Current page +1 |

- [ ] **Step 1: Write the failing tests**

Create `src/context/suggestedContext.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { rankResolvers, SUGGESTED_THRESHOLD } from './suggestedContext.js';

function resolver(type, label) {
  return { type, label };
}

describe('rankResolvers', () => {
  const resolvers = [
    resolver('current-file', 'Current file'),
    resolver('selected-files', 'Selected files'),
    resolver('selected-element', 'Selected element'),
    resolver('current-page', 'Current page'),
    resolver('current-component', 'Current component'),
    resolver('console-errors', 'Console errors'),
    resolver('git-diff', 'Git diff'),
    resolver('preview-screenshot', 'Preview screenshot'),
    resolver('cms-schema', 'CMS schema'),
  ];

  const appState = { devUrl: 'http://localhost:4321' };

  it('ranks selected element highest with no keyword boosts', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    expect(ranked[0].resolver.type).toBe('selected-element');
    expect(ranked[0].section).toBe('suggested');
  });

  it('puts selected-files in the project section regardless of rank', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    const sf = ranked.find((r) => r.resolver.type === 'selected-files');
    expect(sf.section).toBe('project');
  });

  it('caps the suggested section at SUGGESTED_THRESHOLD', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    const suggested = ranked.filter((r) => r.section === 'suggested');
    expect(suggested.length).toBeLessThanOrEqual(SUGGESTED_THRESHOLD);
  });

  it('boosts CMS schema when the prompt mentions CMS-related keywords', () => {
    const ranked = rankResolvers(resolvers, appState, 'add a CMS collection field for tags');
    const cms = ranked.find((r) => r.resolver.type === 'cms-schema');
    expect(cms.keywordBoost).toBeGreaterThan(0);
    expect(cms.section).toBe('suggested');
  });

  it('boosts console errors when the prompt mentions errors', () => {
    const ranked = rankResolvers(resolvers, appState, 'fix the broken build error');
    const errors = ranked.find((r) => r.resolver.type === 'console-errors');
    expect(errors.keywordBoost).toBeGreaterThan(0);
    expect(errors.section).toBe('suggested');
  });

  it('boosts current component when prompt mentions component', () => {
    const ranked = rankResolvers(resolvers, appState, 'make this a reusable component');
    const comp = ranked.find((r) => r.resolver.type === 'current-component');
    expect(comp.keywordBoost).toBeGreaterThan(0);
  });

  it('boosts preview screenshot when prompt asks about visuals', () => {
    const ranked = rankResolvers(resolvers, appState, 'the page visually looks broken');
    const shot = ranked.find((r) => r.resolver.type === 'preview-screenshot');
    expect(shot.keywordBoost).toBeGreaterThan(0);
  });

  it('returns an empty array for an empty resolver list', () => {
    expect(rankResolvers([], {}, 'fix it')).toEqual([]);
  });

  it('distributes remaining resolvers into project and visual sections', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    const projects = ranked.filter((r) => r.section === 'project');
    const visuals = ranked.filter((r) => r.section === 'visual');
    expect(projects.length).toBeGreaterThan(0);
    expect(visuals.length).toBeGreaterThan(0);
    // Section grouping: all items in a section are contiguous
    const sections = [];
    let current = null;
    for (const r of ranked) {
      if (r.section !== current) {
        sections.push(r.section);
        current = r.section;
      }
    }
    expect(sections.length).toBeLessThanOrEqual(3);
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/suggestedContext.test.js
~~~

Expected: FAIL — `suggestedContext.js` does not exist.

- [ ] **Step 3: Implement the ranking module**

Create `src/context/suggestedContext.js`:

~~~js
export const SUGGESTED_THRESHOLD = 3;

const PRIORITY = Object.freeze({
  'selected-element': 8,
  'current-component': 7,
  'current-page': 6,
  'cms-schema': 5,
  'console-errors': 4,
  'current-file': 3,
  'git-diff': 2,
  'preview-screenshot': 1,
  'selected-files': 0,
});

const SECTION = Object.freeze({
  'selected-element': 'visual',
  'current-component': 'visual',
  'current-page': 'visual',
  'console-errors': 'visual',
  'preview-screenshot': 'visual',
  'current-file': 'project',
  'selected-files': 'project',
  'cms-schema': 'project',
  'git-diff': 'project',
});

// Spec §24 keyword hints — simple case-insensitive substring matching against
// the user's typed prompt. Each keyword lists which resolver it boosts and by
// how much.
const KEYWORD_BOOSTS = [
  { keywords: ['error', 'broken', 'fails'], type: 'console-errors', boost: 2 },
  { keywords: ['component', 'reusable'], type: 'current-component', boost: 2 },
  { keywords: ['cms', 'collection', 'field'], type: 'cms-schema', boost: 2 },
  { keywords: ['screenshot', 'visually', 'looks like'], type: 'preview-screenshot', boost: 2 },
  { keywords: ['review changes', 'diff'], type: 'git-diff', boost: 2 },
  { keywords: ['layout', 'spacing', 'responsive'], type: 'selected-element', boost: 1 },
  { keywords: ['page', 'route'], type: 'current-page', boost: 1 },
];

function computeBoost(type, prompt) {
  if (!prompt) return 0;
  const lower = prompt.toLowerCase();
  let total = 0;
  for (const { keywords, type: targetType, boost } of KEYWORD_BOOSTS) {
    if (targetType !== type) continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) total += boost;
    }
  }
  return total;
}

export function rankResolvers(availableResolvers, _appState, prompt) {
  if (!availableResolvers.length) return [];

  const withMeta = availableResolvers.map((resolver) => {
    const priority = PRIORITY[resolver.type] ?? 0;
    const baseSection = SECTION[resolver.type] || 'project';
    const keywordBoost = computeBoost(resolver.type, prompt);
    const effectivePriority = priority + keywordBoost;
    const section = keywordBoost > 0 ? 'suggested' : baseSection;
    return { resolver, section, keywordBoost, effectivePriority, priority };
  });

  // Sort: suggested first (by effective priority desc), then project, then
  // visual — within each group, by base priority desc. "selected-files" is
  // always last within project regardless of priority (spec §10: it's the
  // file-picker entry point, not a direct chip).
  withMeta.sort((a, b) => {
    const sectionOrder = { suggested: 0, project: 1, visual: 2 };
    const aSection = sectionOrder[a.section] ?? 3;
    const bSection = sectionOrder[b.section] ?? 3;
    if (aSection !== bSection) return aSection - bSection;

    if (a.section === 'suggested') return b.effectivePriority - a.effectivePriority;
    if (a.resolver.type === 'selected-files') return 1;
    if (b.resolver.type === 'selected-files') return -1;
    return b.priority - a.priority;
  });

  // Cap suggested to SUGGESTED_THRESHOLD; excess items rejoin their base
  // section (project or visual).
  let suggestedCount = 0;
  for (const entry of withMeta) {
    if (entry.section !== 'suggested') continue;
    if (suggestedCount >= SUGGESTED_THRESHOLD) {
      entry.section = SECTION[entry.resolver.type] || 'project';
    } else {
      suggestedCount += 1;
    }
  }

  // Re-sort after capping (may have changed sections)
  withMeta.sort((a, b) => {
    const sectionOrder = { suggested: 0, project: 1, visual: 2 };
    const aSection = sectionOrder[a.section] ?? 3;
    const bSection = sectionOrder[b.section] ?? 3;
    if (aSection !== bSection) return aSection - bSection;
    if (a.resolver.type === 'selected-files') return 1;
    if (b.resolver.type === 'selected-files') return -1;
    return b.priority - a.priority;
  });

  return withMeta;
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/suggestedContext.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Update `ContextPicker.jsx` to render grouped sections**

Replace the `ContextPicker` component's menu view to use `rankResolvers`:

In `src/panels/ContextPicker.jsx`, import `rankResolvers` and add a `prompt` prop:

~~~jsx
import { rankResolvers } from '../context/suggestedContext.js';

export default function ContextPicker({ resolvers, prompt, onPickSimple, onPickFiles, onListFiles, onClose }) {
  // ... existing state ...

  const ranked = rankResolvers(resolvers, {}, prompt || '');

  const sections = [];
  let currentSection = null;
  for (const entry of ranked) {
    if (entry.section !== currentSection) {
      currentSection = entry.section;
      sections.push({ section: currentSection, resolvers: [] });
    }
    sections[sections.length - 1].resolvers.push(entry.resolver);
  }

  // In the menu view:
  return (
    <div className="dropdown context-picker" ref={wrapRef}>
      {view === 'menu' ? (
        <>
          {sections.map(({ section, resolvers: groupResolvers }) => (
            <div key={section} className="context-picker-section">
              {section === 'suggested' && <div className="context-picker-section-title">Suggested</div>}
              {section === 'project' && <div className="context-picker-section-title">Project</div>}
              {section === 'visual' && <div className="context-picker-section-title">Visual</div>}
              {groupResolvers.map((resolver) => (
                <div
                  key={resolver.type}
                  className="list-item"
                  onClick={() => (resolver.type === 'selected-files' ? openFiles() : onPickSimple(resolver.type))}
                >
                  {resolver.label}
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        // ... file picker view (unchanged) ...
      )}
    </div>
  );
}
~~~

Also update the function signature to accept `prompt`:

~~~jsx
export default function ContextPicker({ resolvers, prompt, onPickSimple, onPickFiles, onListFiles, onClose }) {
~~~

- [ ] **Step 6: Add CSS for the section titles**

In `src/styles.css`, after the existing `.context-picker` rules:

~~~css
.context-picker-section-title {
  padding: 8px 12px 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
~~~

- [ ] **Step 7: Thread the `prompt` prop from `ContextChipBar`**

In `src/panels/ContextChipBar.jsx`, pass the current `prompt` to `ContextPicker`:

~~~jsx
          {pickerOpen && (
            <ContextPicker
              resolvers={availableResolvers}
              prompt={prompt}
              onPickSimple={pickSimple}
              onPickFiles={pickFiles}
              onListFiles={appState.listProjectFiles}
              onClose={() => setPickerOpen(false)}
            />
          )}
~~~

- [ ] **Step 8: Commit**

~~~bash
rtk git add src/context/suggestedContext.js src/context/suggestedContext.test.js src/panels/ContextPicker.jsx src/panels/ContextChipBar.jsx src/styles.css
rtk git commit -m "feat: add suggested-context ranking with keyword boosts"
~~~

---

## Task 6: Wire the new resolvers, props, and IPC into the component tree

**Files:**

- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/panels/ContextChipBar.test.jsx`
- Modify: `src/panels/TerminalPanel.jsx`
- Modify: `src/panels/TerminalPanel.test.jsx`
- Modify: `src/panels/PreviewPane.jsx`
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**

- `ContextChipBar` gains: `devUrl` prop, `getPreviewRect` prop — both merged into `appState`.
- `TerminalPanel` gains: `devUrl` prop, `getPreviewRect` prop — forwarded to `ContextChipBar`.
- `PreviewPane` gains: `onFrameMounted(frameRef)` prop — called once when the frame div mounts, passing its mutable ref.
- `App.jsx` gains: `previewFrameRef` state, `getPreviewRect` callback that reads the ref's current DOMRect, passed to `TerminalPanel`.
- `window.avb.capturePreview` is called by the resolver (already exposed in Task 2).

- [ ] **Step 1: Register the new resolvers in `ContextChipBar.jsx`**

Add imports:

~~~js
import { previewScreenshotResolver } from '../context/previewScreenshotResolver.js';
import { cmsSchemaResolver } from '../context/cmsSchemaResolver.js';
~~~

Add registrations:

~~~js
registerResolver(previewScreenshotResolver);
registerResolver(cmsSchemaResolver);
~~~

- [ ] **Step 2: Accept `devUrl` and `getPreviewRect` props, merge into `appState`**

In `ContextChipBar`'s props:

~~~js
export default function ContextChipBar({
  currentFile,
  projectPath,
  editorContext = EMPTY_EDITOR_CONTEXT,
  devLog = '',
  devUrl = null,           // NEW
  getPreviewRect = null,   // NEW
}) {
~~~

In `appState`'s `useMemo`:

~~~js
  const appState = useMemo(
    () => ({
      currentFile,
      projectPath,
      devLog,
      devUrl,              // NEW
      getPreviewRect,      // NEW
      ...editorContext,
      readProjectFile: (rel) => window.avb.readContextFile({ projectPath, rel }),
      listProjectFiles: async () => (await window.avb.listContextFiles({ projectPath })).files,
      serializeNode: async (node) => (await window.avb.serializeNode({ node })).markup,
      getGitDiff: () => window.avb.getGitDiff({ projectPath }),
      writeContextBundle: (markdown) => window.avb.writeContextBundle({ projectPath, markdown }),
      capturePreview: (rect) => window.avb.capturePreview({ projectPath, ...rect }),
    }),
    [currentFile, projectPath, editorContext, devLog, devUrl, getPreviewRect],
  );
~~~

- [ ] **Step 3: Forward props through `TerminalPanel.jsx`**

In `TerminalPanel`'s props:

~~~js
export default function TerminalPanel({ active, currentFile, projectPath, editorContext, devLog, devUrl, getPreviewRect }) {
~~~

In the `ContextChipBar` render call:

~~~jsx
      <ContextChipBar
        currentFile={currentFile}
        projectPath={projectPath}
        editorContext={editorContext}
        devLog={devLog}
        devUrl={devUrl}                  // NEW
        getPreviewRect={getPreviewRect}  // NEW
      />
~~~

- [ ] **Step 4: Add `onFrameMounted` to `PreviewPane.jsx`**

Add `onFrameMounted` to PreviewPane's destructured props:

~~~js
export default function PreviewPane({
  devUrl,
  devStatus,
  devLog,
  devDiag,
  route,
  refreshKey,
  crumbs,
  onCrumb,
  onRefresh,
  onRestart,
  selPath,
  navHoverPath,
  overlayInfo,
  onSelectPath,
  onOpenPath,
  focusPath,
  device,
  onDevice,
  onFrameMounted,  // NEW
}) {
~~~

After the `frameRef` declaration (around line 187), add a `useEffect` to report it:

~~~js
  const frameRef = React.useRef(null);

  // Let ContextChipBar's preview screenshot resolver know where the preview
  // lives on screen so the main process can clip its capturePage() call.
  React.useEffect(() => {
    if (onFrameMounted) onFrameMounted(frameRef);
  }, [onFrameMounted]);
~~~

- [ ] **Step 5: Thread the capture callback from `App.jsx`**

In `App.jsx`, add a ref to hold the preview frame:

~~~js
  const previewFrameRef = useRef(null);
~~~

Add a `getPreviewRect` callback (next to `editorContext` or any other stable useCallback):

~~~js
  const getPreviewRect = useCallback(() => {
    const frame = previewFrameRef.current;
    if (!frame) return null;
    const r = frame.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    // Attach the selected element's rect from the PreviewPane's rects state
    // so the resolver can annotate it in the screenshot.
    let selectedRect = null;
    if (selPath) {
      // selPath is the selected node's path; the rects are stored in
      // PreviewPane's state — but PreviewPane and App don't share rects
      // directly. For now, the selectedRect is null (the resolver passes it
      // through as-is). A future enhancement can thread rects up to App.
      selectedRect = null;
    }
    return { x: r.x, y: r.y, width: r.width, height: r.height, selectedRect };
  }, [selPath]);
~~~

Pass to `PreviewPane`:

~~~jsx
          <PreviewPane
            devUrl={devUrl}
            // ... existing props ...
            onFrameMounted={(ref) => { previewFrameRef.current = ref; }}
          />
~~~

Pass to `TerminalPanel`:

~~~jsx
          <TerminalPanel
            key={project.path}
            active={leftTab === 'terminal'}
            currentFile={currentFileContext}
            projectPath={project.path}
            editorContext={editorContext}
            devLog={devLog}
            devUrl={devUrl}                // NEW
            getPreviewRect={getPreviewRect} // NEW
          />
~~~

- [ ] **Step 6: Run the full test suite**

Run:

~~~bash
rtk npm test
~~~

Expected: all existing tests pass; new resolver tests from Tasks 3–5 pass; `ContextChipBar.test.jsx` may need prop updates for the new `devUrl` and `getPreviewRect` props (null by default, so existing tests pass without changes). `App.test.jsx` mocks both `TerminalPanel` and `PreviewPane`, so the new props are transparent to existing App-level tests.

- [ ] **Step 7: Extend `ContextChipBar.test.jsx` for the new resolvers**

Add one quick test in `ContextChipBar.test.jsx` that verifies both new resolvers appear in the available-resolvers list:

~~~jsx
  it('includes preview screenshot and CMS schema in the available resolvers', () => {
    render(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        devLog=""
        devUrl="http://localhost:4321"
        getPreviewRect={vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 }))}
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.getByText('Preview screenshot')).toBeInTheDocument();
    expect(screen.getByText('CMS schema')).toBeInTheDocument();
  });
~~~

- [ ] **Step 8: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx src/panels/TerminalPanel.jsx src/panels/PreviewPane.jsx src/App.jsx src/styles.css
rtk git commit -m "feat: wire preview screenshot and CMS schema resolvers into the chip bar"
~~~

---

## Task 7: Suggested chips when no chips are active

**Files:**

- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/styles.css`

**Interfaces:**

- When the chip bar has no active chips and the prompt is empty, display 2–3 suggested chip buttons that the user can click to add them directly (skipping the picker), per the spec's example: `[Selected element] [Current component] [Current page]`.

- [ ] **Step 1: Add the suggested-chips row**

In `ContextChipBar.jsx`, between the `.context-add-wrap` div and the `chips.map(...)` — specifically, when `chips.length === 0` and `prompt.trim() === ''` — render the top 3 suggested resolvers as ghost buttons:

~~~jsx
  const suggestedChips = useMemo(() => {
    if (chips.length > 0 || prompt.trim()) return [];
    return availableResolvers.slice(0, 3);
  }, [availableResolvers, chips.length, prompt]);
~~~

Render them in the chip row:

~~~jsx
        {chips.length === 0 && suggestedChips.length > 0 && (
          <>
            {suggestedChips.map((resolver) => (
              <button
                key={resolver.type}
                type="button"
                className="context-suggested-chip"
                onClick={() => {
                  if (resolver.type === 'selected-files') {
                    // Open file picker — not handled here; Selected Files is
                    // never in the top 3 (priority 0, always last).
                    return;
                  }
                  addChip(resolver.type);
                }}
              >
                {resolver.label}
              </button>
            ))}
          </>
        )}
~~~

- [ ] **Step 2: Add CSS for suggested chips**

In `src/styles.css`:

~~~css
.context-suggested-chip {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-dim);
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
}
.context-suggested-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(var(--accent-rgb), 0.06);
}
~~~

- [ ] **Step 3: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/styles.css
rtk git commit -m "feat: show suggested chips when none are active"
~~~

---

## Manual verification (after Task 7)

Automated tests cover the logic; do one pass in the running app to confirm the feel matches the spec:

1. `rtk npm run dev`, open a project, go to the terminal tab.
2. With the dev preview running, confirm **Preview screenshot** appears in the "Add context" menu under "Visual".
3. Add the Preview screenshot chip — confirm it captures the iframe region, the chip resolves to READY, and the details popover shows the screenshot path.
4. Type a prompt containing "CMS" or "collection" — confirm **CMS schema** is promoted to the "Suggested" section.
5. Add CMS schema chip — confirm it lists all collections (or relevant ones when a page with CMS imports is open), fields with types, and a sample item.
6. Clear all chips — confirm suggested-chip pills appear as dashed buttons in the chip bar.
7. Type "screenshot" in the prompt — confirm Preview screenshot moves to the Suggested section.
8. Verify that existing chips (Selected element, Current page, Console errors, Git diff) still work as before — no regressions.

---

## Acceptance Criteria

### Preview Screenshot

- The chip is available when `devUrl` is set (dev server running).
- Resolve captures the preview iframe region and returns a `.stacki/tmp/context/preview-*.png` relPath.
- The Markdown includes the relPath and viewport dimensions.
- Zero-area rect or null rect results in the error state with a clear message.
- The PNG file really exists on disk after capture.
- The chip goes stale when the iframe rect changes (always — it's the rect, not the content, since content staleness requires async pixel comparison).

### CMS Schema

- The chip is available when the project has at least one CMS collection (detected in resolve, optimistic availability).
- "Relevant collections" mode reads only CMS files imported by the current page.
- "All collections" mode reads every JSON collection.
- Each collection includes: rel path, label, single/multi mode, item count, field list with named types (declared overrides preferred, inferred otherwise), and a sample item.
- Sample items show at most 5 fields.
- No auto-staleness (like Selected Files).

### Suggested Context

- The "Add context" menu groups resolvers into Suggested / Project / Visual sections.
- Suggested section shows at most 3 items.
- Keyword boosts from the prompt promote items to Suggested.
- `selected-files` is always in Project and always last.
- Suggested-chip pills appear in the chip bar when no chips are active and the prompt is empty.
