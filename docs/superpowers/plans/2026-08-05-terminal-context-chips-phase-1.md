# Terminal Context Chips (Phase 1: Prompt Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach the file currently open in Stacki's floating code editor, or any hand-picked project file, to a Markdown context bundle and insert it — together with a typed request — directly into the embedded terminal, without yet touching visual-editor-state chips, runtime/repo chips, secret scanning, size warnings, or file-mode delivery.

**Architecture:** A framework-agnostic `ContextSnapshot` model and a small resolver registry (pure JS, one resolver module per chip type) sit under a React hook (`useTerminalContext`) that owns chip and prompt state and composes a Markdown prompt from ready snapshots. A new `ContextChipBar` renders inside `TerminalPanel`, between its header and the xterm surface, and inserts the composed Markdown by extending the terminal's existing `stacki:terminal-menu` custom-event bridge with a new `insert` action — the same event the app menu already uses for terminal copy/paste. Reading arbitrary project files for the Selected Files chip goes through a new, narrowly scoped `context:listFiles` / `context:readFile` IPC pair that mirrors the terminal IPC's sender-validation pattern and the asset panel's project-root containment check.

**Tech Stack:** Electron 33, React 18, Vite 6, Vitest 3.2, `@testing-library/react` (including `renderHook`), the existing `@xterm/xterm` terminal panel, the existing CodeMirror-based floating code editor.

## Global Constraints

- This plan implements only spec §30 Phase 1 ("Prompt foundation"): the `ContextSnapshot` model, resolver registry, chip bar, Add-context picker, Markdown composer, terminal insertion, and the Current File + Selected Files chips.
- Out of scope for this plan (left for follow-on plans that map to spec §30 Phases 2–4): Selected Element, Current Page, Current Component, stale-state detection beyond the Current File chip, Console Errors, Git Diff, secret-content scanning, token/size warnings and thresholds, context-file (Mode B) delivery, Preview Screenshot, CMS Schema, and suggested-context ranking.
- No TypeScript: this codebase is plain JS/JSX throughout (`.js`/`.jsx`). The `ContextSnapshot` and resolver interfaces from spec §15/§17 are implemented as plain object shapes and functions, not TS interfaces.
- New renderer logic lives under `src/context/` (pure, framework-agnostic) or `src/panels/` (React components) — mirroring the existing `src/terminal/terminalLogic.js` + `src/panels/TerminalPanel.jsx` split.
- New Electron modules follow the `electron/terminalManager.js` + `electron/terminalIpc.js` split: dependency-injected pure logic in one file, thin `ipcMain` wiring with sender validation in a sibling file.
- IPC exposed to the renderer is added to the single existing `window.avb` object in `electron/preload.js`. This codebase does not use a second `window.stackiContext` global despite spec §18's naming — every new method stays on `window.avb`.
- Every shell command in this plan is `rtk`-prefixed, per the user's global tooling setup.
- Follow TDD for every task: write the failing test, confirm RED, implement, confirm GREEN, commit.

---

**Source spec:** docs/superpowers/specs/terminal-chips.md (§1–§34; this plan implements §30 Phase 1 only)

**Starting point:** create a dedicated implementation worktree from the commit containing this plan, preserve unrelated user changes, and execute each task from that worktree.

## File Structure

### New files

- `src/context/contextTypes.js` — `ContextSnapshot` factory and status/type constants (spec §15).
- `src/context/contextTypes.test.js`
- `src/context/contextResolvers.js` — resolver registry (spec §17).
- `src/context/contextResolvers.test.js`
- `src/context/currentFileResolver.js` — resolver for the file open in the floating code editor (spec §9.8).
- `src/context/currentFileResolver.test.js`
- `src/context/selectedFilesResolver.js` — resolver for hand-picked project files (spec §9.9).
- `src/context/selectedFilesResolver.test.js`
- `src/context/promptComposer.js` — Markdown prompt composition (spec §12).
- `src/context/promptComposer.test.js`
- `src/context/useTerminalContext.js` — hook owning chip/prompt state (spec §16).
- `src/context/useTerminalContext.test.js`
- `src/panels/ContextChip.jsx` — chip pill (spec §7).
- `src/panels/ContextChip.test.jsx`
- `src/panels/ContextPicker.jsx` — "Add context" menu and file picker (spec §9.9, §10).
- `src/panels/ContextPicker.test.jsx`
- `src/panels/ContextDetailsPopover.jsx` — chip details popover (spec §11).
- `src/panels/ContextDetailsPopover.test.jsx`
- `src/panels/ContextChipBar.jsx` — composes the above into the bar shown in §6's mockup.
- `src/panels/ContextChipBar.test.jsx`
- `electron/contextFiles.js` — dependency-injected file listing/reading with project-root containment and sensitive-filename blocking (spec §18, §19).
- `electron/contextFiles.test.js`
- `electron/contextIpc.js` — `context:listFiles` / `context:readFile` IPC registration.
- `electron/contextIpc.test.js`

### Modified files

- `electron/main.js` — instantiate and register the context IPC alongside the existing terminal IPC.
- `electron/preload.js` — expose `listContextFiles` / `readContextFile` on `window.avb`.
- `src/panels/TerminalPanel.jsx` — mount `ContextChipBar`, extend the `stacki:terminal-menu` handler with an `insert` action.
- `src/panels/TerminalPanel.test.jsx` — cover the new `insert` action.
- `src/App.jsx` — derive `currentFileContext` from existing `codeWin`/`fileText`/`currentPage` state and pass it plus `project.path` to `TerminalPanel`.
- `src/styles.css` — context chip bar, chip, picker, and details-popover styling.
- `package.json` — add the two new Electron files to `check:electron`.

## Task 1: Define the ContextSnapshot data model

**Files:**

- Create: `src/context/contextTypes.test.js`
- Create: `src/context/contextTypes.js`

**Interfaces:**

- Produces: `CONTEXT_CHIP_TYPES` (`{CURRENT_FILE: 'current-file', SELECTED_FILES: 'selected-files'}`), `CONTEXT_CHIP_STATUS` (`{RESOLVING, READY, STALE, ERROR}`), `estimateTokens(characterCount) -> number`, `createSnapshot({type, label, options, id}) -> ContextSnapshot`, `withReady(snapshot, {data, estimatedCharacters, sourceRevision}) -> ContextSnapshot`, `withStale(snapshot) -> ContextSnapshot`, `withError(snapshot, error) -> ContextSnapshot`.

- [ ] **Step 1: Write the failing test**

Create `src/context/contextTypes.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import {
  CONTEXT_CHIP_STATUS,
  CONTEXT_CHIP_TYPES,
  createSnapshot,
  estimateTokens,
  withError,
  withReady,
  withStale,
} from './contextTypes.js';

describe('contextTypes', () => {
  it('exposes the phase-1 chip types', () => {
    expect(CONTEXT_CHIP_TYPES.CURRENT_FILE).toBe('current-file');
    expect(CONTEXT_CHIP_TYPES.SELECTED_FILES).toBe('selected-files');
  });

  it('estimates roughly one token per four characters', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(-10)).toBe(0);
  });

  it('creates a resolving snapshot with a unique id by default', () => {
    const a = createSnapshot({ type: CONTEXT_CHIP_TYPES.CURRENT_FILE, label: 'Current file' });
    const b = createSnapshot({ type: CONTEXT_CHIP_TYPES.CURRENT_FILE, label: 'Current file' });
    expect(a.id).toEqual(expect.any(String));
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe(CONTEXT_CHIP_STATUS.RESOLVING);
    expect(a.data).toBeNull();
    expect(a.options).toEqual({});
    expect(a.capturedAt).toEqual(expect.any(String));
  });

  it('accepts an explicit id', () => {
    const snapshot = createSnapshot({ type: 'current-file', label: 'x', id: 'fixed-id' });
    expect(snapshot.id).toBe('fixed-id');
  });

  it('moves a snapshot to ready with estimated size and revision', () => {
    const snapshot = createSnapshot({ type: 'current-file', label: 'Current file' });
    const ready = withReady(snapshot, {
      data: { content: 'abcd' },
      estimatedCharacters: 4,
      sourceRevision: 'rev-1',
    });
    expect(ready.status).toBe(CONTEXT_CHIP_STATUS.READY);
    expect(ready.data).toEqual({ content: 'abcd' });
    expect(ready.sourceRevision).toBe('rev-1');
    expect(ready.estimatedCharacters).toBe(4);
    expect(ready.estimatedTokens).toBe(1);
    expect(ready.error).toBeNull();
  });

  it('marks a ready snapshot stale without discarding its data', () => {
    const ready = withReady(createSnapshot({ type: 'current-file', label: 'x' }), {
      data: { content: 'abcd' },
      estimatedCharacters: 4,
      sourceRevision: 'rev-1',
    });
    const stale = withStale(ready);
    expect(stale.status).toBe(CONTEXT_CHIP_STATUS.STALE);
    expect(stale.data).toEqual({ content: 'abcd' });
  });

  it('captures a resolve failure', () => {
    const snapshot = createSnapshot({ type: 'current-file', label: 'x' });
    const failed = withError(snapshot, new Error('disk exploded'));
    expect(failed.status).toBe(CONTEXT_CHIP_STATUS.ERROR);
    expect(failed.error).toEqual({ code: 'resolve-failed', message: 'disk exploded' });
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextTypes.test.js
~~~

Expected: FAIL because `contextTypes.js` does not exist.

- [ ] **Step 3: Implement the model**

Create `src/context/contextTypes.js`:

~~~js
export const CONTEXT_CHIP_TYPES = Object.freeze({
  CURRENT_FILE: 'current-file',
  SELECTED_FILES: 'selected-files',
});

export const CONTEXT_CHIP_STATUS = Object.freeze({
  RESOLVING: 'resolving',
  READY: 'ready',
  STALE: 'stale',
  ERROR: 'error',
});

export function estimateTokens(characterCount) {
  const chars = Math.max(0, Number(characterCount) || 0);
  return Math.ceil(chars / 4);
}

let nextSnapshotId = 0;

export function createSnapshot({ type, label, options = {}, id } = {}) {
  nextSnapshotId += 1;
  return {
    id: id || `chip-${nextSnapshotId}`,
    type,
    label,
    status: CONTEXT_CHIP_STATUS.RESOLVING,
    capturedAt: new Date().toISOString(),
    sourceRevision: null,
    estimatedCharacters: 0,
    estimatedTokens: 0,
    options,
    data: null,
    error: null,
  };
}

export function withReady(snapshot, { data, estimatedCharacters, sourceRevision }) {
  return {
    ...snapshot,
    status: CONTEXT_CHIP_STATUS.READY,
    capturedAt: new Date().toISOString(),
    data,
    sourceRevision,
    estimatedCharacters,
    estimatedTokens: estimateTokens(estimatedCharacters),
    error: null,
  };
}

export function withStale(snapshot) {
  return { ...snapshot, status: CONTEXT_CHIP_STATUS.STALE };
}

export function withError(snapshot, error) {
  return {
    ...snapshot,
    status: CONTEXT_CHIP_STATUS.ERROR,
    error: {
      code: 'resolve-failed',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}
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
rtk git commit -m "feat: add ContextSnapshot data model"
~~~

## Task 2: Build the resolver registry

**Files:**

- Create: `src/context/contextResolvers.test.js`
- Create: `src/context/contextResolvers.js`

**Interfaces:**

- Consumes: nothing from Task 1 (registry is type-agnostic).
- Produces: `registerResolver(resolver)`, `getResolver(type) -> resolver | undefined`, `listResolvers() -> resolver[]`, `clearResolvers()`. A resolver object has shape `{ type, label, isAvailable(appState), getDefaultOptions(appState), resolve(appState, options) -> Promise<{data, estimatedCharacters, sourceRevision}>, renderMarkdown(snapshot) -> string }`.

- [ ] **Step 1: Write the failing test**

Create `src/context/contextResolvers.test.js`:

~~~js
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearResolvers,
  getResolver,
  listResolvers,
  registerResolver,
} from './contextResolvers.js';

function fakeResolver(type) {
  return {
    type,
    label: `Fake ${type}`,
    isAvailable: () => true,
    getDefaultOptions: () => ({}),
    resolve: async () => ({ data: {}, estimatedCharacters: 0, sourceRevision: 'r' }),
    renderMarkdown: () => '',
  };
}

describe('contextResolvers registry', () => {
  beforeEach(() => {
    clearResolvers();
  });

  it('registers and retrieves a resolver by type', () => {
    const resolver = fakeResolver('current-file');
    registerResolver(resolver);
    expect(getResolver('current-file')).toBe(resolver);
  });

  it('returns undefined for an unregistered type', () => {
    expect(getResolver('nope')).toBeUndefined();
  });

  it('lists every registered resolver', () => {
    registerResolver(fakeResolver('current-file'));
    registerResolver(fakeResolver('selected-files'));
    expect(listResolvers().map((r) => r.type).sort()).toEqual([
      'current-file',
      'selected-files',
    ]);
  });

  it('re-registering a type replaces the previous resolver', () => {
    const first = fakeResolver('current-file');
    const second = fakeResolver('current-file');
    registerResolver(first);
    registerResolver(second);
    expect(getResolver('current-file')).toBe(second);
    expect(listResolvers()).toHaveLength(1);
  });

  it('rejects a resolver without a string type', () => {
    expect(() => registerResolver({ label: 'no type' })).toThrow(
      'Resolver must declare a string type.',
    );
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextResolvers.test.js
~~~

Expected: FAIL because `contextResolvers.js` does not exist.

- [ ] **Step 3: Implement the registry**

Create `src/context/contextResolvers.js`:

~~~js
const registry = new Map();

export function registerResolver(resolver) {
  if (!resolver || typeof resolver.type !== 'string' || !resolver.type) {
    throw new Error('Resolver must declare a string type.');
  }
  registry.set(resolver.type, resolver);
}

export function getResolver(type) {
  return registry.get(type);
}

export function listResolvers() {
  return [...registry.values()];
}

export function clearResolvers() {
  registry.clear();
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/contextResolvers.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/contextResolvers.js src/context/contextResolvers.test.js
rtk git commit -m "feat: add context resolver registry"
~~~

## Task 3: Add the Current File resolver

**Files:**

- Create: `src/context/currentFileResolver.test.js`
- Create: `src/context/currentFileResolver.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_TYPES` from Task 1.
- Produces: `currentFileResolver` matching the resolver shape from Task 2. `resolve(appState)` reads `appState.currentFile` — a plain object `{ path, title, language, content }` that Task 15 will derive from `App.jsx`'s existing `codeWin`/`codeWinValue`/`currentPage` state. No IPC: the file's text is already resident in the renderer.

- [ ] **Step 1: Write the failing test**

Create `src/context/currentFileResolver.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { currentFileResolver } from './currentFileResolver.js';

describe('currentFileResolver', () => {
  it('is unavailable when no file is open', () => {
    expect(currentFileResolver.isAvailable({ currentFile: null })).toBe(false);
  });

  it('is available when a file is open', () => {
    const appState = {
      currentFile: { path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' },
    };
    expect(currentFileResolver.isAvailable(appState)).toBe(true);
  });

  it('resolves the open file into a snapshot payload', async () => {
    const appState = {
      currentFile: {
        path: 'src/pages/index.astro',
        title: 'Frontmatter',
        language: 'javascript',
        content: 'const x = 1;',
      },
    };
    const result = await currentFileResolver.resolve(appState);
    expect(result.data).toEqual({
      path: 'src/pages/index.astro',
      title: 'Frontmatter',
      language: 'javascript',
      content: 'const x = 1;',
    });
    expect(result.estimatedCharacters).toBe('const x = 1;'.length);
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('produces a different revision when content changes', async () => {
    const base = { path: 'a.astro', title: 'a', language: 'javascript' };
    const first = await currentFileResolver.resolve({ currentFile: { ...base, content: 'one' } });
    const second = await currentFileResolver.resolve({ currentFile: { ...base, content: 'two' } });
    expect(first.sourceRevision).not.toBe(second.sourceRevision);
  });

  it('rejects resolving with no open file', async () => {
    await expect(currentFileResolver.resolve({ currentFile: null })).rejects.toThrow(
      'No file is open in the code editor.',
    );
  });

  it('renders the file as a fenced Markdown block', () => {
    const snapshot = {
      data: {
        path: 'src/pages/index.astro',
        title: 'Frontmatter',
        language: 'javascript',
        content: 'const x = 1;',
      },
    };
    const markdown = currentFileResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current file');
    expect(markdown).toContain('`src/pages/index.astro`');
    expect(markdown).toContain('```javascript');
    expect(markdown).toContain('const x = 1;');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/currentFileResolver.test.js
~~~

Expected: FAIL because `currentFileResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/currentFileResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

// Not cryptographic — only used to detect that content changed between two
// resolves, so a cheap DJB2 hash is enough and avoids a Node crypto import
// in renderer code.
function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export const currentFileResolver = {
  type: CONTEXT_CHIP_TYPES.CURRENT_FILE,
  label: 'Current file',

  isAvailable(appState) {
    return !!appState.currentFile;
  },

  getDefaultOptions() {
    return {};
  },

  async resolve(appState) {
    const file = appState.currentFile;
    if (!file) throw new Error('No file is open in the code editor.');
    return {
      data: {
        path: file.path,
        title: file.title,
        language: file.language,
        content: file.content,
      },
      estimatedCharacters: file.content.length,
      sourceRevision: `${file.path || file.title}:${file.content.length}:${hashString(file.content)}`,
    };
  },

  renderMarkdown(snapshot) {
    const { path, title, language, content } = snapshot.data;
    const heading = path ? `\`${path}\`` : title;
    return [
      '### Current file',
      '',
      `- Source: ${heading}`,
      '',
      '```' + (language || ''),
      content,
      '```',
    ].join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/currentFileResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/currentFileResolver.js src/context/currentFileResolver.test.js
rtk git commit -m "feat: add current-file context resolver"
~~~

## Task 4: Add the Selected Files resolver

**Files:**

- Create: `src/context/selectedFilesResolver.test.js`
- Create: `src/context/selectedFilesResolver.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_TYPES` from Task 1.
- Produces: `selectedFilesResolver` matching the resolver shape from Task 2. `resolve(appState, options)` reads `options.paths` (string array of project-relative paths) and calls `appState.readProjectFile(rel) -> Promise<{ rel, content, size }>` — the function Task 13 wires to `window.avb.readContextFile`. `isAvailable(appState)` checks `appState.projectPath`.

- [ ] **Step 1: Write the failing test**

Create `src/context/selectedFilesResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { selectedFilesResolver } from './selectedFilesResolver.js';

describe('selectedFilesResolver', () => {
  it('is unavailable without an open project', () => {
    expect(selectedFilesResolver.isAvailable({ projectPath: null })).toBe(false);
  });

  it('is available with an open project', () => {
    expect(selectedFilesResolver.isAvailable({ projectPath: '/projects/site' })).toBe(true);
  });

  it('defaults to no selected paths', () => {
    expect(selectedFilesResolver.getDefaultOptions()).toEqual({ paths: [] });
  });

  it('reads every selected file through the injected reader', async () => {
    const readProjectFile = vi.fn(async (rel) => ({
      rel,
      content: `content of ${rel}`,
      size: 42,
    }));
    const result = await selectedFilesResolver.resolve(
      { readProjectFile },
      { paths: ['src/components/Hero.astro', 'src/pages/index.astro'] },
    );
    expect(readProjectFile).toHaveBeenCalledWith('src/components/Hero.astro');
    expect(readProjectFile).toHaveBeenCalledWith('src/pages/index.astro');
    expect(result.data.files).toEqual([
      { path: 'src/components/Hero.astro', content: 'content of src/components/Hero.astro' },
      { path: 'src/pages/index.astro', content: 'content of src/pages/index.astro' },
    ]);
    expect(result.estimatedCharacters).toBe(
      'content of src/components/Hero.astro'.length + 'content of src/pages/index.astro'.length,
    );
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('rejects resolving with no paths selected', async () => {
    await expect(
      selectedFilesResolver.resolve({ readProjectFile: vi.fn() }, { paths: [] }),
    ).rejects.toThrow('Select at least one file.');
  });

  it('renders each file as its own fenced Markdown block', () => {
    const snapshot = {
      data: {
        files: [
          { path: 'src/components/Hero.astro', content: '<h1>Hi</h1>' },
          { path: 'src/styles/global.css', content: 'body { margin: 0; }' },
        ],
      },
    };
    const markdown = selectedFilesResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Selected files');
    expect(markdown).toContain('#### `src/components/Hero.astro`');
    expect(markdown).toContain('```astro');
    expect(markdown).toContain('<h1>Hi</h1>');
    expect(markdown).toContain('#### `src/styles/global.css`');
    expect(markdown).toContain('```css');
    expect(markdown).toContain('body { margin: 0; }');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/selectedFilesResolver.test.js
~~~

Expected: FAIL because `selectedFilesResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/selectedFilesResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

const LANGUAGE_BY_EXTENSION = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  astro: 'astro',
  json: 'json',
  md: 'markdown',
  html: 'html',
};

function languageFor(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] || '';
}

export const selectedFilesResolver = {
  type: CONTEXT_CHIP_TYPES.SELECTED_FILES,
  label: 'Selected files',

  isAvailable(appState) {
    return !!appState.projectPath;
  },

  getDefaultOptions() {
    return { paths: [] };
  },

  async resolve(appState, options) {
    const paths = options?.paths || [];
    if (paths.length === 0) throw new Error('Select at least one file.');
    const files = [];
    for (const rel of paths) {
      const result = await appState.readProjectFile(rel);
      files.push({ path: rel, content: result.content });
    }
    const estimatedCharacters = files.reduce((sum, file) => sum + file.content.length, 0);
    const sourceRevision = files.map((file) => `${file.path}:${file.content.length}`).join('|');
    return { data: { files }, estimatedCharacters, sourceRevision };
  },

  renderMarkdown(snapshot) {
    const lines = ['### Selected files', ''];
    for (const file of snapshot.data.files) {
      lines.push(`#### \`${file.path}\``, '', '```' + languageFor(file.path), file.content, '```', '');
    }
    return lines.join('\n').trimEnd();
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/selectedFilesResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/selectedFilesResolver.js src/context/selectedFilesResolver.test.js
rtk git commit -m "feat: add selected-files context resolver"
~~~

## Task 5: Compose the Markdown prompt

**Files:**

- Create: `src/context/promptComposer.test.js`
- Create: `src/context/promptComposer.js`

**Interfaces:**

- Consumes: `getResolver` from Task 2, `currentFileResolver`/`selectedFilesResolver` from Tasks 3–4 (registered inside the test).
- Produces: `composePrompt({ request, snapshots }) -> string` (spec §12's Markdown structure, Mode A / inline only — file-mode delivery is out of scope for this plan).

- [ ] **Step 1: Write the failing test**

Create `src/context/promptComposer.test.js`:

~~~js
import { beforeEach, describe, expect, it } from 'vitest';
import { clearResolvers, registerResolver } from './contextResolvers.js';
import { createSnapshot, withReady } from './contextTypes.js';
import { currentFileResolver } from './currentFileResolver.js';
import { composePrompt } from './promptComposer.js';

beforeEach(() => {
  clearResolvers();
  registerResolver(currentFileResolver);
});

function readySnapshot() {
  return withReady(createSnapshot({ type: 'current-file', label: 'Current file' }), {
    data: { path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' },
    estimatedCharacters: 12,
    sourceRevision: 'rev-1',
  });
}

describe('composePrompt', () => {
  it('composes the request alone when there are no chips', () => {
    const markdown = composePrompt({ request: 'Fix the spacing.', snapshots: [] });
    expect(markdown).toContain('## User request');
    expect(markdown).toContain('Fix the spacing.');
    expect(markdown).not.toContain('## Stacki context');
    expect(markdown).toContain('## Instructions');
    expect(markdown).toContain('Use the attached Stacki context as the primary target for this request.');
  });

  it('includes a Stacki context section for each ready snapshot', () => {
    const markdown = composePrompt({ request: 'Fix the spacing.', snapshots: [readySnapshot()] });
    expect(markdown).toContain('## Stacki context');
    expect(markdown).toContain('### Current file');
    expect(markdown).toContain('const x = 1;');
  });

  it('skips snapshots that are not ready', () => {
    const resolving = createSnapshot({ type: 'current-file', label: 'Current file' });
    const markdown = composePrompt({ request: 'Fix the spacing.', snapshots: [resolving] });
    expect(markdown).not.toContain('## Stacki context');
  });

  it('trims the request text', () => {
    const markdown = composePrompt({ request: '  Fix the spacing.  ', snapshots: [] });
    expect(markdown).toContain('## User request\n\nFix the spacing.\n');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/promptComposer.test.js
~~~

Expected: FAIL because `promptComposer.js` does not exist.

- [ ] **Step 3: Implement the composer**

Create `src/context/promptComposer.js`:

~~~js
import { CONTEXT_CHIP_STATUS } from './contextTypes.js';
import { getResolver } from './contextResolvers.js';

const INSTRUCTIONS = [
  'Use the attached Stacki context as the primary target for this request.',
  'Inspect the repository when additional implementation context is required.',
  'Do not assume that unrelated components should be changed.',
].join('\n');

export function composePrompt({ request, snapshots }) {
  const sections = snapshots
    .filter((snapshot) => snapshot.status === CONTEXT_CHIP_STATUS.READY)
    .map((snapshot) => {
      const resolver = getResolver(snapshot.type);
      return resolver ? resolver.renderMarkdown(snapshot) : '';
    })
    .filter(Boolean);

  const parts = ['## User request', '', request.trim(), ''];
  if (sections.length > 0) {
    parts.push('## Stacki context', '', sections.join('\n\n'), '');
  }
  parts.push('## Instructions', '', INSTRUCTIONS);
  return parts.join('\n');
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/promptComposer.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/promptComposer.js src/context/promptComposer.test.js
rtk git commit -m "feat: compose Markdown prompts from context snapshots"
~~~

## Task 6: Build the useTerminalContext hook

**Files:**

- Create: `src/context/useTerminalContext.test.js`
- Create: `src/context/useTerminalContext.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_STATUS`, `createSnapshot`, `withReady`, `withError`, `withStale` from Task 1; `getResolver` from Task 2; `composePrompt` from Task 5.
- Produces: `useTerminalContext(appState) -> { chips, prompt, setPrompt, addChip(type, options?), removeChip(id), refreshChip(id), composedMarkdown, insertIntoTerminal() }`. `appState` is `{ currentFile, projectPath, readProjectFile, listProjectFiles }`, rebuilt by Task 13's `ContextChipBar` on every render. `insertIntoTerminal()` dispatches a `stacki:terminal-menu` `CustomEvent` with `detail: { action: 'insert', text }` — the event Task 14 teaches `TerminalPanel` to handle — then clears the prompt (chips are kept, per spec §8's "keep context after sending" default).

- [ ] **Step 1: Write the failing test**

Create `src/context/useTerminalContext.test.js`:

~~~js
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearResolvers, registerResolver } from './contextResolvers.js';
import { CONTEXT_CHIP_STATUS } from './contextTypes.js';
import { useTerminalContext } from './useTerminalContext.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeResolver(overrides = {}) {
  return {
    type: 'fake-a',
    label: 'Fake A',
    isAvailable: () => true,
    getDefaultOptions: () => ({}),
    resolve: vi.fn(async () => ({ data: { value: 'x' }, estimatedCharacters: 1, sourceRevision: 'r1' })),
    renderMarkdown: () => '### Fake A\n\nvalue',
    ...overrides,
  };
}

describe('useTerminalContext', () => {
  beforeEach(() => {
    clearResolvers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a chip in resolving status, then moves it to ready', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    let id;
    act(() => {
      id = result.current.addChip('fake-a');
    });
    expect(result.current.chips).toHaveLength(1);
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.RESOLVING);

    await waitFor(() => {
      expect(result.current.chips.find((c) => c.id === id).status).toBe(CONTEXT_CHIP_STATUS.READY);
    });
    expect(result.current.chips[0].data).toEqual({ value: 'x' });
  });

  it('moves a chip to error status when resolve rejects', async () => {
    registerResolver(
      fakeResolver({ resolve: vi.fn(async () => { throw new Error('boom'); }) }),
    );
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => {
      expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.ERROR);
    });
    expect(result.current.chips[0].error.message).toBe('boom');
  });

  it('removes a chip by id', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    let id;
    act(() => {
      id = result.current.addChip('fake-a');
    });
    act(() => {
      result.current.removeChip(id);
    });
    expect(result.current.chips).toHaveLength(0);
  });

  it('re-resolves a chip on refresh', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({ data: { value: 'first' }, estimatedCharacters: 1, sourceRevision: 'r1' })
      .mockResolvedValueOnce({ data: { value: 'second' }, estimatedCharacters: 1, sourceRevision: 'r2' });
    registerResolver(fakeResolver({ resolve }));
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    let id;
    act(() => {
      id = result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    act(() => {
      result.current.refreshChip(id);
    });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.RESOLVING);
    await waitFor(() => expect(result.current.chips[0].data).toEqual({ value: 'second' }));
  });

  it('marks a ready current-file chip stale when the open file changes', async () => {
    registerResolver(
      fakeResolver({
        type: 'current-file',
        resolve: vi.fn(async () => ({ data: { value: 'x' }, estimatedCharacters: 1, sourceRevision: 'r1' })),
      }),
    );
    const { result, rerender } = renderHook(
      ({ appState }) => useTerminalContext(appState),
      { initialProps: { appState: { currentFile: { path: 'a.astro', content: 'one' }, projectPath: null } } },
    );

    act(() => {
      result.current.addChip('current-file');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.STALE);
  });

  it('composes the prompt from the current prompt text and ready chips, then clears the prompt on insert', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    act(() => {
      result.current.setPrompt('Fix the spacing.');
    });
    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));
    expect(result.current.composedMarkdown).toContain('Fix the spacing.');
    expect(result.current.composedMarkdown).toContain('### Fake A');

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      action: 'insert',
      text: expect.stringContaining('Fix the spacing.'),
    });
    expect(result.current.prompt).toBe('');
    window.removeEventListener('stacki:terminal-menu', listener);
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/useTerminalContext.test.js
~~~

Expected: FAIL because `useTerminalContext.js` does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/context/useTerminalContext.js`:

~~~js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTEXT_CHIP_STATUS,
  createSnapshot,
  withError,
  withReady,
  withStale,
} from './contextTypes.js';
import { getResolver } from './contextResolvers.js';
import { composePrompt } from './promptComposer.js';

function currentFileKey(currentFile) {
  if (!currentFile) return null;
  return `${currentFile.path || currentFile.title}:${currentFile.content.length}:${currentFile.content}`;
}

export function useTerminalContext(appState) {
  const [chips, setChips] = useState([]);
  const [prompt, setPrompt] = useState('');
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const previousFileKeyRef = useRef(currentFileKey(appState.currentFile));

  const resolveChip = useCallback(async (id, type, options) => {
    const resolver = getResolver(type);
    try {
      const result = await resolver.resolve(appStateRef.current, options);
      setChips((current) =>
        current.map((chip) => (chip.id === id ? withReady(chip, result) : chip)),
      );
    } catch (error) {
      setChips((current) =>
        current.map((chip) => (chip.id === id ? withError(chip, error) : chip)),
      );
    }
  }, []);

  const addChip = useCallback(
    (type, options) => {
      const resolver = getResolver(type);
      if (!resolver) throw new Error(`No resolver registered for "${type}".`);
      const resolvedOptions = options ?? resolver.getDefaultOptions(appStateRef.current);
      const snapshot = createSnapshot({ type, label: resolver.label, options: resolvedOptions });
      setChips((current) => [...current, snapshot]);
      void resolveChip(snapshot.id, type, resolvedOptions);
      return snapshot.id;
    },
    [resolveChip],
  );

  const removeChip = useCallback((id) => {
    setChips((current) => current.filter((chip) => chip.id !== id));
  }, []);

  const refreshChip = useCallback(
    (id) => {
      let target = null;
      setChips((current) =>
        current.map((chip) => {
          if (chip.id !== id) return chip;
          target = chip;
          return { ...chip, status: CONTEXT_CHIP_STATUS.RESOLVING };
        }),
      );
      if (target) void resolveChip(id, target.type, target.options);
    },
    [resolveChip],
  );

  // The floating code editor's content already lives in the renderer, so a
  // changed open-file key is enough to know the current-file chip is stale —
  // no re-read needed just to detect it.
  useEffect(() => {
    const key = currentFileKey(appState.currentFile);
    if (key !== previousFileKeyRef.current) {
      setChips((current) =>
        current.map((chip) =>
          chip.type === 'current-file' && chip.status === CONTEXT_CHIP_STATUS.READY
            ? withStale(chip)
            : chip,
        ),
      );
    }
    previousFileKeyRef.current = key;
  }, [appState.currentFile]);

  const composedMarkdown = useMemo(
    () => composePrompt({ request: prompt, snapshots: chips }),
    [prompt, chips],
  );

  const insertIntoTerminal = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('stacki:terminal-menu', {
        detail: { action: 'insert', text: composedMarkdown },
      }),
    );
    setPrompt('');
  }, [composedMarkdown]);

  return {
    chips,
    prompt,
    setPrompt,
    addChip,
    removeChip,
    refreshChip,
    composedMarkdown,
    insertIntoTerminal,
  };
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/useTerminalContext.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/useTerminalContext.js src/context/useTerminalContext.test.js
rtk git commit -m "feat: add useTerminalContext hook"
~~~

## Task 7: Add dependency-injected file listing and reading

**Files:**

- Create: `electron/contextFiles.test.js`
- Create: `electron/contextFiles.js`

**Interfaces:**

- Produces: `EXCLUDED_DIRS` (Set), `isSensitiveFilename(name) -> boolean`, `listProjectFiles(root, { fs, path }) -> string[]` (sorted, project-relative, posix-joined), `readProjectFile(root, rel, { fs, path, maxBytes }) -> { rel, content, size }`.
- This mirrors the existing `listCssFiles`/`CSS_SKIP_DIRS` walk in `electron/main.js:2233-2270` and the `assetAbs` containment check at `electron/main.js:1237-1243`, but as a standalone, dependency-injected module (like `electron/terminalManager.js`) so it can be unit-tested with a fake filesystem instead of touching real disk.

- [ ] **Step 1: Write the failing test**

Create `electron/contextFiles.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import contextFilesModule from './contextFiles.js';

const { isSensitiveFilename, listProjectFiles, readProjectFile } = contextFilesModule;

// A tiny in-memory filesystem, just deep enough for these tests: a tree of
// {name: {type:'dir', children} | {type:'file', content}} keyed by absolute
// path segments joined with '/'.
function fakeFs(tree) {
  const files = new Map(); // abs path -> content
  const dirs = new Map(); // abs path -> [{name, isDir}]

  const walk = (prefix, node) => {
    const entries = [];
    for (const [name, child] of Object.entries(node)) {
      const abs = `${prefix}/${name}`;
      if (child.type === 'dir') {
        entries.push({ name, isDir: true });
        walk(abs, child.children);
      } else {
        entries.push({ name, isDir: false });
        files.set(abs, child.content);
      }
    }
    dirs.set(prefix, entries);
  };
  walk('/project', tree);

  return {
    fs: {
      readdirSync: (dir, opts) => {
        const entries = dirs.get(dir) || [];
        if (opts?.withFileTypes) {
          return entries.map((e) => ({ name: e.name, isDirectory: () => e.isDir }));
        }
        return entries.map((e) => e.name);
      },
      statSync: (abs) => {
        if (!files.has(abs)) throw new Error(`ENOENT: ${abs}`);
        return { isFile: () => true, size: files.get(abs).length };
      },
      readFileSync: (abs) => {
        if (!files.has(abs)) throw new Error(`ENOENT: ${abs}`);
        return files.get(abs);
      },
    },
    path: {
      resolve: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      sep: '/',
      basename: (p) => p.split('/').pop(),
    },
  };
}

describe('isSensitiveFilename', () => {
  it('blocks common secret filenames', () => {
    expect(isSensitiveFilename('.env')).toBe(true);
    expect(isSensitiveFilename('.env.production')).toBe(true);
    expect(isSensitiveFilename('server.pem')).toBe(true);
    expect(isSensitiveFilename('id_rsa')).toBe(true);
    expect(isSensitiveFilename('credentials.json')).toBe(true);
    expect(isSensitiveFilename('service-account-1.json')).toBe(true);
  });

  it('allows ordinary project files', () => {
    expect(isSensitiveFilename('index.astro')).toBe(false);
    expect(isSensitiveFilename('package.json')).toBe(false);
  });
});

describe('listProjectFiles', () => {
  it('lists files recursively, excluding build/dependency directories and dotfiles', () => {
    const { fs, path } = fakeFs({
      'src': { type: 'dir', children: {
        'pages': { type: 'dir', children: {
          'index.astro': { type: 'file', content: '<h1>Hi</h1>' },
        } },
      } },
      'node_modules': { type: 'dir', children: {
        'pkg': { type: 'dir', children: { 'index.js': { type: 'file', content: '' } } },
      } },
      '.git': { type: 'dir', children: { 'HEAD': { type: 'file', content: '' } } },
      'package.json': { type: 'file', content: '{}' },
      '.env': { type: 'file', content: 'SECRET=1' },
    });

    const files = listProjectFiles('/project', { fs, path });
    expect(files).toEqual(['package.json', 'src/pages/index.astro']);
  });
});

describe('readProjectFile', () => {
  it('reads a file within the project root', () => {
    const { fs, path } = fakeFs({
      'src': { type: 'dir', children: {
        'pages': { type: 'dir', children: {
          'index.astro': { type: 'file', content: '<h1>Hi</h1>' },
        } },
      } },
    });

    const result = readProjectFile('/project', 'src/pages/index.astro', { fs, path });
    expect(result).toEqual({ rel: 'src/pages/index.astro', content: '<h1>Hi</h1>', size: '<h1>Hi</h1>'.length });
  });

  it('refuses a path that escapes the project root', () => {
    const { fs, path } = fakeFs({ 'a.txt': { type: 'file', content: 'x' } });
    expect(() => readProjectFile('/project', '../secrets.txt', { fs, path })).toThrow(
      'Invalid path: outside the open project.',
    );
  });

  it('refuses a sensitive filename even when it exists on disk', () => {
    const { fs, path } = fakeFs({ '.env': { type: 'file', content: 'SECRET=1' } });
    expect(() => readProjectFile('/project', '.env', { fs, path })).toThrow(
      'Refusing to read a sensitive file: .env',
    );
  });

  it('refuses a file larger than the configured limit', () => {
    const { fs, path } = fakeFs({ 'big.txt': { type: 'file', content: 'x'.repeat(20) } });
    expect(() => readProjectFile('/project', 'big.txt', { fs, path, maxBytes: 10 })).toThrow(
      'File too large to attach: big.txt',
    );
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextFiles.test.js
~~~

Expected: FAIL because `contextFiles.js` does not exist.

- [ ] **Step 3: Implement the module**

Create `electron/contextFiles.js`:

~~~js
const nodeFs = require('fs');
const nodePath = require('path');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'release', '.astro', '.cache', 'coverage']);

const SENSITIVE_FILENAME_PATTERNS = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /^credentials\.json$/i,
  /^service-account.*\.json$/i,
];

function isSensitiveFilename(name) {
  return SENSITIVE_FILENAME_PATTERNS.some((pattern) => pattern.test(name));
}

// Same containment rule electron/main.js uses for the asset protocol and the
// style panel (assetAbs / assertInProject): resolve to an absolute path and
// require it to stay inside the project root.
function resolveWithinRoot(root, rel, { path }) {
  const resolvedRoot = path.resolve(root);
  const abs = path.resolve(root, rel || '');
  if (abs !== resolvedRoot && !(abs + path.sep).startsWith(resolvedRoot + path.sep)) {
    throw new Error('Invalid path: outside the open project.');
  }
  return abs;
}

function listProjectFiles(root, { fs = nodeFs, path = nodePath } = {}) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
      } else {
        out.push(rel ? `${rel}/${entry.name}` : entry.name);
      }
    }
  };
  walk(root, '');
  return out.sort();
}

function readProjectFile(root, rel, { fs = nodeFs, path = nodePath, maxBytes = 1_000_000 } = {}) {
  const name = path.basename(rel || '');
  if (isSensitiveFilename(name)) {
    throw new Error(`Refusing to read a sensitive file: ${rel}`);
  }
  const abs = resolveWithinRoot(root, rel, { path });
  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error(`Not a file: ${rel}`);
  if (stat.size > maxBytes) throw new Error(`File too large to attach: ${rel}`);
  const content = fs.readFileSync(abs, 'utf8');
  return { rel, content, size: stat.size };
}

module.exports = {
  EXCLUDED_DIRS,
  isSensitiveFilename,
  listProjectFiles,
  readProjectFile,
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
rtk git commit -m "feat: add project file listing and reading for context chips"
~~~

## Task 8: Register the context IPC boundary

**Files:**

- Create: `electron/contextIpc.test.js`
- Create: `electron/contextIpc.js`

**Interfaces:**

- Consumes: `listProjectFiles`, `readProjectFile` from Task 7, as injectable defaults (same DI style as `TerminalManager`'s `loadPty`).
- Produces: `registerContextIpc({ ipcMain, isAllowedSender, getProjectRoot, listProjectFiles?, readProjectFile? }) -> unregister()`, wiring `ipcMain.handle('context:listFiles', ...)` and `ipcMain.handle('context:readFile', ...)`. Mirrors `electron/terminalIpc.js`'s `registerTerminalIpc` shape (same `isAllowedSender` contract, same rejection message style). `listProjectFiles`/`readProjectFile` default to the real `electron/contextFiles.js` functions and are overridable for testing.

- [ ] **Step 1: Write the failing test**

Create `electron/contextIpc.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import contextIpcModule from './contextIpc.js';

const { registerContextIpc } = contextIpcModule;

// contextIpc.js is plain CommonJS and requires ./contextFiles internally, so
// list/read are injected as constructor-style dependencies (same pattern as
// TerminalManager's injected loadPty) rather than mocked via vi.mock — that
// keeps the test decoupled from CJS/ESM interop details.
function setup({ projectRoot = '/projects/site' } = {}) {
  const handles = new Map();
  const ipcMain = {
    handle: vi.fn((channel, fn) => handles.set(channel, fn)),
    removeHandler: vi.fn(),
  };
  const allowed = { sender: {} };
  const denied = { sender: {} };
  const listProjectFiles = vi.fn(() => ['package.json', 'src/pages/index.astro']);
  const readProjectFile = vi.fn((_root, rel) => ({ rel, content: `content of ${rel}`, size: 10 }));
  const unregister = registerContextIpc({
    ipcMain,
    isAllowedSender: (event) => event === allowed,
    getProjectRoot: () => projectRoot,
    listProjectFiles,
    readProjectFile,
  });
  return { ipcMain, handles, allowed, denied, unregister, listProjectFiles, readProjectFile };
}

describe('context IPC', () => {
  it('registers the two context channels', () => {
    const { handles } = setup();
    expect([...handles.keys()]).toEqual(['context:listFiles', 'context:readFile']);
  });

  it('lists project files for an allowed sender', async () => {
    const { handles, allowed, listProjectFiles } = setup();
    await expect(handles.get('context:listFiles')(allowed)).resolves.toEqual({
      files: ['package.json', 'src/pages/index.astro'],
    });
    expect(listProjectFiles).toHaveBeenCalledWith('/projects/site');
  });

  it('reads a project file for an allowed sender', async () => {
    const { handles, allowed, readProjectFile } = setup();
    await expect(handles.get('context:readFile')(allowed, { rel: 'package.json' })).resolves.toEqual({
      rel: 'package.json',
      content: 'content of package.json',
      size: 10,
    });
    expect(readProjectFile).toHaveBeenCalledWith('/projects/site', 'package.json');
  });

  it('rejects an untrusted sender', async () => {
    const { handles, denied } = setup();
    await expect(handles.get('context:listFiles')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:readFile')(denied, { rel: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
  });

  it('rejects when no project is open', async () => {
    const { handles, allowed } = setup({ projectRoot: null });
    await expect(handles.get('context:listFiles')(allowed)).rejects.toThrow(
      'Open a project before attaching context.',
    );
  });

  it('unregisters both handlers', () => {
    const { ipcMain, unregister } = setup();
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:listFiles');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:readFile');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
~~~

Expected: FAIL because `contextIpc.js` does not exist.

- [ ] **Step 3: Implement the IPC registration**

Create `electron/contextIpc.js`:

~~~js
const contextFiles = require('./contextFiles');

function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
}) {
  const assertAllowed = (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Context IPC is available only to Stacki.');
    }
  };
  const requireRoot = () => {
    const root = getProjectRoot();
    if (!root) throw new Error('Open a project before attaching context.');
    return root;
  };

  const listFiles = async (event) => {
    assertAllowed(event);
    return { files: listProjectFiles(requireRoot()) };
  };
  const readFile = async (event, payload) => {
    assertAllowed(event);
    return readProjectFile(requireRoot(), payload?.rel);
  };

  ipcMain.handle('context:listFiles', listFiles);
  ipcMain.handle('context:readFile', readFile);

  return () => {
    ipcMain.removeHandler('context:listFiles');
    ipcMain.removeHandler('context:readFile');
  };
}

module.exports = { registerContextIpc };
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add electron/contextIpc.js electron/contextIpc.test.js
rtk git commit -m "feat: add secure context IPC boundary"
~~~

## Task 9: Wire context IPC into Electron and preload

**Files:**

- Modify: `electron/main.js:31-32, 536-545`
- Modify: `electron/preload.js:530-551`
- Modify: `package.json:19` (`check:electron`)

**Interfaces:**

- Consumes: `registerContextIpc` from Task 8.
- Produces: `window.avb.listContextFiles({ projectPath }) -> Promise<{files}>`, `window.avb.readContextFile({ projectPath, rel }) -> Promise<{rel, content, size}>` — Task 13's `ContextChipBar` calls these directly. `projectPath` in the payload is accepted for symmetry with other calls but unused by the handler (`getProjectRoot` on the main-process side is the source of truth, matching how `terminal:start` ignores any renderer-supplied path).

- [ ] **Step 1: Require and register the context IPC**

In `electron/main.js`, alongside the existing terminal requires:

~~~js
const { TerminalManager } = require('./terminalManager');
const { registerTerminalIpc } = require('./terminalIpc');
const { registerContextIpc } = require('./contextIpc');
~~~

Immediately after the existing `registerTerminalIpc({...})` call (`electron/main.js:536-545`), add:

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
});
~~~

- [ ] **Step 2: Expose the context API on `window.avb`**

In `electron/preload.js`, after the existing "Embedded project terminal" block (ends at `electron/preload.js:550`), add a new section:

~~~js
  // Terminal context chips
  listContextFiles: invoke('context:listFiles'),
  readContextFile: invoke('context:readFile'),
~~~

- [ ] **Step 3: Add the new Electron files to the syntax-check script**

In `package.json`, extend `check:electron`:

~~~json
"check:electron": "node --check electron/main.js && node --check electron/preload.js && node --check electron/mainPolicy.js && node --check electron/terminalManager.js && node --check electron/terminalIpc.js && node --check electron/contextFiles.js && node --check electron/contextIpc.js",
~~~

- [ ] **Step 4: Verify and commit**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js electron/contextFiles.test.js
rtk npm run check:electron
rtk npm run build
~~~

Expected: backend tests pass, every Electron entry parses, and the renderer build stays green.

Commit:

~~~bash
rtk git add electron/main.js electron/preload.js package.json
rtk git commit -m "feat: connect context chip IPC to Electron"
~~~

## Task 10: Build the ContextChip pill component

**Files:**

- Create: `src/panels/ContextChip.test.jsx`
- Create: `src/panels/ContextChip.jsx`

**Interfaces:**

- Consumes: `CloseIcon` from `src/ui/Icons.jsx` (already exists).
- Produces: `<ContextChip snapshot={ContextSnapshot} onOpenDetails={(id) => void} onRemove={(id) => void} />`.

- [ ] **Step 1: Write the failing test**

Create `src/panels/ContextChip.test.jsx`:

~~~jsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextChip from './ContextChip.jsx';

function snapshot(overrides = {}) {
  return { id: 'chip-1', type: 'current-file', label: 'Current file', status: 'ready', ...overrides };
}

describe('ContextChip', () => {
  it('shows the label and opens details on click', () => {
    const onOpenDetails = vi.fn();
    render(<ContextChip snapshot={snapshot()} onOpenDetails={onOpenDetails} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByText('Current file'));
    expect(onOpenDetails).toHaveBeenCalledWith('chip-1');
  });

  it('removes the chip on remove click without opening details', () => {
    const onOpenDetails = vi.fn();
    const onRemove = vi.fn();
    render(<ContextChip snapshot={snapshot()} onOpenDetails={onOpenDetails} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Current file' }));
    expect(onRemove).toHaveBeenCalledWith('chip-1');
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it('shows a resolving indicator', () => {
    render(<ContextChip snapshot={snapshot({ status: 'resolving' })} onOpenDetails={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('···')).toBeInTheDocument();
  });

  it('shows a stale indicator', () => {
    render(<ContextChip snapshot={snapshot({ status: 'stale' })} onOpenDetails={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  it('shows an error indicator', () => {
    render(<ContextChip snapshot={snapshot({ status: 'error' })} onOpenDetails={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextChip.test.jsx
~~~

Expected: FAIL because `ContextChip.jsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/panels/ContextChip.jsx`:

~~~jsx
import React from 'react';
import { CloseIcon } from '../ui/Icons.jsx';

const STATUS_LABEL = {
  resolving: '···',
  stale: 'Updated',
  error: 'Error',
};

export default function ContextChip({ snapshot, onOpenDetails, onRemove }) {
  const suffix = STATUS_LABEL[snapshot.status];
  return (
    <div className={`context-chip ${snapshot.status}`}>
      <button
        type="button"
        className="context-chip-label"
        onClick={() => onOpenDetails(snapshot.id)}
      >
        {snapshot.label}
        {suffix ? <span className="context-chip-status">{suffix}</span> : null}
      </button>
      <button
        type="button"
        className="context-chip-remove"
        aria-label={`Remove ${snapshot.label}`}
        onClick={() => onRemove(snapshot.id)}
      >
        <CloseIcon size={10} />
      </button>
    </div>
  );
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextChip.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/panels/ContextChip.jsx src/panels/ContextChip.test.jsx
rtk git commit -m "feat: add context chip pill component"
~~~

## Task 11: Build the ContextPicker menu

**Files:**

- Create: `src/panels/ContextPicker.test.jsx`
- Create: `src/panels/ContextPicker.jsx`

**Interfaces:**

- Produces: `<ContextPicker resolvers={[{type, label}]} onPickSimple={(type) => void} onPickFiles={(paths) => void} onListFiles={() => Promise<string[]>} onClose={() => void} />`. Two-view menu: a flat list of available resolver labels (spec §10, without the Suggested/Recent ranking, which is out of scope per the Global Constraints); clicking `selected-files` switches to a searchable, checkbox multi-select file list (spec §9.9) sourced from `onListFiles()`.

- [ ] **Step 1: Write the failing test**

Create `src/panels/ContextPicker.test.jsx`:

~~~jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextPicker from './ContextPicker.jsx';

const resolvers = [
  { type: 'current-file', label: 'Current file' },
  { type: 'selected-files', label: 'Select files' },
];

describe('ContextPicker', () => {
  it('picks a simple resolver directly', () => {
    const onPickSimple = vi.fn();
    render(
      <ContextPicker
        resolvers={resolvers}
        onPickSimple={onPickSimple}
        onPickFiles={vi.fn()}
        onListFiles={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Current file'));
    expect(onPickSimple).toHaveBeenCalledWith('current-file');
  });

  it('opens a searchable file list for Select files and confirms the selection', async () => {
    const onListFiles = vi.fn(async () => ['src/pages/index.astro', 'src/components/Hero.astro']);
    const onPickFiles = vi.fn();
    render(
      <ContextPicker
        resolvers={resolvers}
        onPickSimple={vi.fn()}
        onPickFiles={onPickFiles}
        onListFiles={onListFiles}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Select files'));
    await waitFor(() => expect(screen.getByText('src/pages/index.astro')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Search files…'), { target: { value: 'hero' } });
    expect(screen.queryByText('src/pages/index.astro')).not.toBeInTheDocument();
    expect(screen.getByText('src/components/Hero.astro')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('src/components/Hero.astro'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 file' }));
    expect(onPickFiles).toHaveBeenCalledWith(['src/components/Hero.astro']);
  });

  it('closes when clicking outside', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside" />
        <ContextPicker
          resolvers={resolvers}
          onPickSimple={vi.fn()}
          onPickFiles={vi.fn()}
          onListFiles={vi.fn()}
          onClose={onClose}
        />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalled();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextPicker.test.jsx
~~~

Expected: FAIL because `ContextPicker.jsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/panels/ContextPicker.jsx`:

~~~jsx
import React, { useEffect, useRef, useState } from 'react';

export default function ContextPicker({ resolvers, onPickSimple, onPickFiles, onListFiles, onClose }) {
  const [view, setView] = useState('menu');
  const [allFiles, setAllFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState(() => new Set());
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const openFiles = async () => {
    setView('files');
    const files = await onListFiles();
    setAllFiles(files);
  };

  const toggle = (path) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filtered = allFiles.filter((path) => path.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="dropdown context-picker" ref={wrapRef}>
      {view === 'menu' ? (
        <>
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
        <>
          <h3>Select files</h3>
          <input
            className="context-picker-search"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="context-picker-files">
            {filtered.map((path) => (
              <label key={path} className="list-item context-picker-file">
                <input type="checkbox" checked={checked.has(path)} onChange={() => toggle(path)} aria-label={path} />
                {path}
              </label>
            ))}
          </div>
          <div className="dropdown-row">
            <button type="button" disabled={checked.size === 0} onClick={() => onPickFiles([...checked])}>
              Add {checked.size} file{checked.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextPicker.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/panels/ContextPicker.jsx src/panels/ContextPicker.test.jsx
rtk git commit -m "feat: add context picker menu and file search"
~~~

## Task 12: Build the ContextDetailsPopover

**Files:**

- Create: `src/panels/ContextDetailsPopover.test.jsx`
- Create: `src/panels/ContextDetailsPopover.jsx`

**Interfaces:**

- Produces: `<ContextDetailsPopover snapshot={ContextSnapshot} markdown={string} onRefresh={(id) => void} onRemove={(id) => void} onClose={() => void} />` (spec §11).

- [ ] **Step 1: Write the failing test**

Create `src/panels/ContextDetailsPopover.test.jsx`:

~~~jsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextDetailsPopover from './ContextDetailsPopover.jsx';

function snapshot(overrides = {}) {
  return {
    id: 'chip-1',
    label: 'Current file',
    status: 'ready',
    capturedAt: '2026-08-05T14:20:31.000Z',
    estimatedTokens: 42,
    error: null,
    ...overrides,
  };
}

describe('ContextDetailsPopover', () => {
  it('shows captured time, size, and the rendered markdown for a ready snapshot', () => {
    render(
      <ContextDetailsPopover
        snapshot={snapshot()}
        markdown="### Current file\n\nconst x = 1;"
        onRefresh={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Current file')).toBeInTheDocument();
    expect(screen.getByText(/~42 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/const x = 1;/)).toBeInTheDocument();
  });

  it('shows the error message for a failed snapshot instead of a preview', () => {
    render(
      <ContextDetailsPopover
        snapshot={snapshot({ status: 'error', error: { message: 'disk exploded' } })}
        markdown=""
        onRefresh={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('disk exploded')).toBeInTheDocument();
  });

  it('calls onRefresh and onRemove with the snapshot id', () => {
    const onRefresh = vi.fn();
    const onRemove = vi.fn();
    render(
      <ContextDetailsPopover
        snapshot={snapshot()}
        markdown="x"
        onRefresh={onRefresh}
        onRemove={onRemove}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRefresh).toHaveBeenCalledWith('chip-1');
    expect(onRemove).toHaveBeenCalledWith('chip-1');
  });

  it('closes when clicking outside', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside" />
        <ContextDetailsPopover snapshot={snapshot()} markdown="x" onRefresh={vi.fn()} onRemove={vi.fn()} onClose={onClose} />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalled();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextDetailsPopover.test.jsx
~~~

Expected: FAIL because `ContextDetailsPopover.jsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/panels/ContextDetailsPopover.jsx`:

~~~jsx
import React, { useEffect, useRef } from 'react';

export default function ContextDetailsPopover({ snapshot, markdown, onRefresh, onRemove, onClose }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div className="dropdown context-details-popover" ref={wrapRef}>
      <h3>{snapshot.label}</h3>
      <div className="context-details-meta">
        Captured {new Date(snapshot.capturedAt).toLocaleTimeString()}
        {snapshot.status === 'ready' && ` · ~${snapshot.estimatedTokens} tokens`}
      </div>
      {snapshot.status === 'error' && (
        <div className="context-details-error">{snapshot.error?.message}</div>
      )}
      {snapshot.status === 'ready' && <pre className="context-details-preview">{markdown}</pre>}
      <div className="dropdown-row">
        <button type="button" onClick={() => onRefresh(snapshot.id)}>Refresh</button>
        <button type="button" onClick={() => onRemove(snapshot.id)}>Remove</button>
      </div>
    </div>
  );
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextDetailsPopover.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/panels/ContextDetailsPopover.jsx src/panels/ContextDetailsPopover.test.jsx
rtk git commit -m "feat: add context chip details popover"
~~~

## Task 13: Compose the ContextChipBar

**Files:**

- Create: `src/panels/ContextChipBar.test.jsx`
- Create: `src/panels/ContextChipBar.jsx`

**Interfaces:**

- Consumes: `useTerminalContext` (Task 6), `listResolvers`/`getResolver`/`registerResolver` (Task 2), `currentFileResolver` (Task 3), `selectedFilesResolver` (Task 4), `ContextChip` (Task 10), `ContextPicker` (Task 11), `ContextDetailsPopover` (Task 12), `window.avb.listContextFiles`/`window.avb.readContextFile` (Task 9).
- Produces: `<ContextChipBar currentFile={{path,title,language,content} | null} projectPath={string | null} />` — the component Task 14 mounts inside `TerminalPanel`. Registers `currentFileResolver` and `selectedFilesResolver` as a module-level side effect on import, so the picker always has both Phase 1 resolvers available without a separate bootstrap file.

- [ ] **Step 1: Write the failing test**

Create `src/panels/ContextChipBar.test.jsx`:

~~~jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextChipBar from './ContextChipBar.jsx';

beforeEach(() => {
  window.avb = {
    listContextFiles: vi.fn(async () => ({ files: ['src/pages/index.astro'] })),
    readContextFile: vi.fn(async ({ rel }) => ({ rel, content: `content of ${rel}`, size: 10 })),
  };
});

describe('ContextChipBar', () => {
  it('offers Current file only when a file is open, and adds it as a ready chip', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Current file')).not.toBeInTheDocument();
    expect(screen.getByText('Select files')).toBeInTheDocument();
  });

  it('adds the current file as a chip and includes it in the composed prompt', async () => {
    render(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' }}
        projectPath="/projects/site"
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Current file'));
    await waitFor(() => expect(screen.getByText('Current file')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix the spacing.' } });

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.action).toBe('insert');
    expect(listener.mock.calls[0][0].detail.text).toContain('const x = 1;');
    expect(listener.mock.calls[0][0].detail.text).toContain('Fix the spacing.');
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('adds selected files through the file picker', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Select files'));
    await waitFor(() => expect(screen.getByText('src/pages/index.astro')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('src/pages/index.astro'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 file' }));

    await waitFor(() => expect(screen.getByText('Selected files')).toBeInTheDocument());
    expect(window.avb.readContextFile).toHaveBeenCalledWith({
      projectPath: '/projects/site',
      rel: 'src/pages/index.astro',
    });
  });

  it('disables Insert into terminal until there is prompt text', () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    expect(screen.getByRole('button', { name: 'Insert into terminal' })).toBeDisabled();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: FAIL because `ContextChipBar.jsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/panels/ContextChipBar.jsx`:

~~~jsx
import React, { useCallback, useMemo, useState } from 'react';
import ContextChip from './ContextChip.jsx';
import ContextPicker from './ContextPicker.jsx';
import ContextDetailsPopover from './ContextDetailsPopover.jsx';
import { getResolver, listResolvers, registerResolver } from '../context/contextResolvers.js';
import { currentFileResolver } from '../context/currentFileResolver.js';
import { selectedFilesResolver } from '../context/selectedFilesResolver.js';
import { useTerminalContext } from '../context/useTerminalContext.js';

// Registering here (module scope, run once on import) keeps Phase 1's two
// resolvers available wherever the chip bar is mounted, without a separate
// bootstrap step. Re-registering on a hot reload is harmless — the registry
// keys by type and simply replaces the previous entry.
registerResolver(currentFileResolver);
registerResolver(selectedFilesResolver);

export default function ContextChipBar({ currentFile, projectPath }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsId, setDetailsId] = useState(null);

  const appState = useMemo(
    () => ({
      currentFile,
      projectPath,
      readProjectFile: (rel) => window.avb.readContextFile({ projectPath, rel }),
      listProjectFiles: async () => (await window.avb.listContextFiles({ projectPath })).files,
    }),
    [currentFile, projectPath],
  );

  const {
    chips,
    prompt,
    setPrompt,
    addChip,
    removeChip,
    refreshChip,
    composedMarkdown,
    insertIntoTerminal,
  } = useTerminalContext(appState);

  const availableResolvers = listResolvers().filter((resolver) => resolver.isAvailable(appState));

  const detailsChip = chips.find((chip) => chip.id === detailsId) || null;
  const detailsMarkdown = useMemo(() => {
    if (!detailsChip || detailsChip.status !== 'ready') return '';
    const resolver = getResolver(detailsChip.type);
    return resolver ? resolver.renderMarkdown(detailsChip) : '';
  }, [detailsChip]);

  const pickSimple = useCallback(
    (type) => {
      addChip(type);
      setPickerOpen(false);
    },
    [addChip],
  );

  const pickFiles = useCallback(
    (paths) => {
      addChip('selected-files', { paths });
      setPickerOpen(false);
    },
    [addChip],
  );

  return (
    <div className="context-chip-bar">
      <div className="context-chip-row">
        <div className="context-add-wrap">
          <button type="button" className="context-add-button" onClick={() => setPickerOpen((open) => !open)}>
            + Add context
          </button>
          {pickerOpen && (
            <ContextPicker
              resolvers={availableResolvers}
              onPickSimple={pickSimple}
              onPickFiles={pickFiles}
              onListFiles={appState.listProjectFiles}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
        {chips.map((chip) => (
          <div className="context-chip-wrap" key={chip.id}>
            <ContextChip
              snapshot={chip}
              onOpenDetails={(id) => setDetailsId(id === detailsId ? null : id)}
              onRemove={removeChip}
            />
            {detailsId === chip.id && (
              <ContextDetailsPopover
                snapshot={chip}
                markdown={detailsMarkdown}
                onRefresh={refreshChip}
                onRemove={(id) => {
                  removeChip(id);
                  setDetailsId(null);
                }}
                onClose={() => setDetailsId(null)}
              />
            )}
          </div>
        ))}
      </div>
      <textarea
        className="context-prompt"
        placeholder="Ask Codex to…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="context-send-row">
        <button
          type="button"
          className="context-send-button"
          disabled={!prompt.trim()}
          onClick={insertIntoTerminal}
        >
          Insert into terminal
        </button>
      </div>
    </div>
  );
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx
rtk git commit -m "feat: compose the terminal context chip bar"
~~~

## Task 14: Mount ContextChipBar in TerminalPanel and handle insert

**Files:**

- Modify: `src/panels/TerminalPanel.jsx:1-16, 355-384, 455-466`
- Modify: `src/panels/TerminalPanel.test.jsx`
- Modify: `src/styles.css` (after line 954, the end of the existing `.terminal-*` rules)

**Interfaces:**

- Consumes: `ContextChipBar` from Task 13.
- Produces: `<TerminalPanel active currentFile projectPath />` — two new props threaded through from `App.jsx` (Task 15). The existing `stacki:terminal-menu` event now also accepts `{ action: 'insert', text }`, pasted into xterm exactly like the existing `paste` action.

- [ ] **Step 1: Add a failing test for the insert action**

In `src/panels/TerminalPanel.test.jsx`, add a new `it` inside the existing `describe('TerminalPanel', ...)` block (alongside the existing copy/paste coverage):

~~~jsx
it('inserts composed context text without touching the clipboard', async () => {
  render(<TerminalPanel active />);
  await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

  window.dispatchEvent(
    new CustomEvent('stacki:terminal-menu', {
      detail: { action: 'insert', text: '## User request\n\nFix the spacing.' },
    }),
  );

  await waitFor(() =>
    expect(terminal.paste).toHaveBeenCalledWith('## User request\n\nFix the spacing.'),
  );
  expect(navigator.clipboard.readText).not.toHaveBeenCalled();
});
~~~

If `terminal.paste` is not already part of the mocked `terminalMocks.terminal` object at the top of `TerminalPanel.test.jsx`, add it: `paste: vi.fn(),` alongside the other mocked methods (`write`, `writeln`, `getSelection`, etc.).

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx
~~~

Expected: FAIL — the `insert` action is not yet handled, so `terminal.paste` is never called with the expected text.

- [ ] **Step 3: Extend the terminal-menu handler and mount the chip bar**

In `src/panels/TerminalPanel.jsx`, add the import:

~~~js
import ContextChipBar from './ContextChipBar.jsx';
~~~

Change the component signature:

~~~js
export default function TerminalPanel({ active, currentFile, projectPath }) {
~~~

In the existing `onMenu` handler (`src/panels/TerminalPanel.jsx:355-384`), add an `insert` branch before the existing `paste` branch:

~~~js
        if (
          event.detail?.action === 'insert' &&
          sessionRef.current &&
          !exitedRef.current &&
          typeof event.detail.text === 'string'
        ) {
          terminal.paste(event.detail.text);
          return;
        }

        if (
          event.detail?.action === 'paste' &&
~~~

In the returned JSX (`src/panels/TerminalPanel.jsx:455-466`), mount the chip bar between the header and the terminal surface:

~~~jsx
      <header className="terminal-header">
        <h2>Terminal</h2>
      </header>
      <ContextChipBar currentFile={currentFile} projectPath={projectPath} />
      <div className="terminal-surface" ref={hostRef} />
~~~

- [ ] **Step 4: Add chip bar styling**

Append to `src/styles.css`, after the existing `.terminal-resize-handle:focus-visible` rule (`src/styles.css:951-954`):

~~~css
.context-chip-bar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.context-chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.context-add-wrap,
.context-chip-wrap { position: relative; }
.context-add-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px dashed var(--border-strong);
  border-radius: 99px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 11.5px;
}
.context-add-button:hover { color: var(--text); border-color: var(--accent); }

.context-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 4px 0 10px;
  border-radius: 99px;
  background: var(--bg-input);
  color: var(--text-dim);
  font-size: 11.5px;
}
.context-chip.error { color: var(--red); }
.context-chip.stale { color: var(--amber); }
.context-chip-label {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.context-chip-status { font-size: 10px; color: inherit; opacity: 0.85; }
.context-chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-faint);
  cursor: pointer;
}
.context-chip-remove:hover { background: var(--bg-active); color: var(--text); }

.context-picker { top: calc(100% + 6px); left: 0; right: auto; min-width: 220px; }
.context-picker-search {
  width: 100%;
  margin: 4px 0 6px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-size: 11.5px;
}
.context-picker-files { max-height: 220px; overflow-y: auto; }
.context-picker-file {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.context-details-popover { width: 320px; }
.context-details-meta { font-size: 11px; color: var(--text-faint); }
.context-details-error { font-size: 11.5px; color: var(--red); }
.context-details-preview {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-input);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.context-prompt {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  resize: vertical;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}
.context-send-row { display: flex; justify-content: flex-end; }
.context-send-button {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.context-send-button:disabled { opacity: 0.4; cursor: default; }
~~~

- [ ] **Step 5: Run tests and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx src/panels/ContextChipBar.test.jsx
~~~

Expected: all tests pass. `TerminalPanel.test.jsx`'s existing tests must still pass unchanged — `ContextChipBar` renders `window.avb.listContextFiles`/`readContextFile` calls only when its own "Add context" / file-picker interactions happen, so it stays inert in the existing copy/paste/exit/restart tests as long as `window.avb` (already mocked with `vi.fn()`s for every other method in that file's `beforeEach`) also stubs `listContextFiles` and `readContextFile` — add both alongside the other `window.avb` mocks in `TerminalPanel.test.jsx`'s `beforeEach`:

~~~js
listContextFiles: vi.fn(async () => ({ files: [] })),
readContextFile: vi.fn(async ({ rel }) => ({ rel, content: '', size: 0 })),
~~~

- [ ] **Step 6: Commit**

~~~bash
rtk git add src/panels/TerminalPanel.jsx src/panels/TerminalPanel.test.jsx src/styles.css
rtk git commit -m "feat: mount context chip bar in the terminal panel"
~~~

## Task 15: Wire App.jsx to the current open file

**Files:**

- Modify: `src/App.jsx:1996-1997, 2223-2225`

**Interfaces:**

- Consumes: existing `codeWin`, `codeWinValue`, `isFileWin`, `currentPage` local state (`src/App.jsx:1983-1996`) — unchanged by this task.
- Produces: a `currentFileContext` value of shape `{ path, title, language, content } | null`, passed to `<TerminalPanel currentFile={currentFileContext} projectPath={project.path} />`.

- [ ] **Step 1: Derive currentFileContext**

In `src/App.jsx`, immediately after the existing `codeWinValue` computation (ends at `src/App.jsx:1996`):

~~~js
  const codeWinValue = !codeWin
    ? null
    : isFileWin
      ? fileText
      : codeWin.targetId === 'frontmatter'
        ? model
          ? frontmatterCode
          : null
        : codeWinNode?.inner ?? null;

  // What the "Current file" context chip attaches: whatever the floating
  // code editor currently has open (a public/ asset file, frontmatter, or a
  // raw <script>/<style> block), normalized to one shape so the resolver
  // doesn't need to know about codeWin's internal variants.
  const currentFileContext =
    codeWin && codeWinValue !== null
      ? {
          path: isFileWin ? codeWin.rel : (currentPage?.path ?? null),
          title: codeWin.title,
          language: codeWin.language,
          content: codeWinValue,
        }
      : null;
~~~

- [ ] **Step 2: Pass the new props to TerminalPanel**

At the existing mount site (`src/App.jsx:2223-2225`):

~~~jsx
        {terminalMounted && (
          <TerminalPanel
            key={project.path}
            active={leftTab === 'terminal'}
            currentFile={currentFileContext}
            projectPath={project.path}
          />
        )}
~~~

- [ ] **Step 3: Verify and commit**

Run:

~~~bash
rtk npm test
rtk npm run build
~~~

Expected: the full suite passes and the renderer builds.

Commit:

~~~bash
rtk git add src/App.jsx
rtk git commit -m "feat: attach the open code-editor file to terminal context"
~~~

## Task 16: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the complete automated gate**

Run:

~~~bash
rtk npm test
rtk npm run check:electron
rtk npm run build
rtk git diff --check
~~~

Expected: every test passes, every Electron entry parses, Vite builds `dist`, and there are no whitespace errors.

- [ ] **Step 2: Run the development smoke test**

Run:

~~~bash
rtk npm run dev
~~~

In Stacki:

1. Open an Astro project and open the Terminal panel (rail or `⌥T`).
2. Confirm the new context bar appears between the "Terminal" header and the shell surface, with a dashed "+ Add context" pill, an empty prompt textarea, and a disabled "Insert into terminal" button.
3. With no file open in the floating code editor, click **+ Add context** and confirm only **Select files** is offered (not **Current file**).
4. Select a node with an editable `<script>` or `<style>` block, open its code window, then reopen the terminal's **+ Add context** menu and confirm **Current file** is now offered; click it and confirm a chip appears, first briefly showing a resolving state, then settling on the file's title.
5. Click the new chip and confirm the details popover shows a captured time, an approximate token count, and a fenced Markdown preview of the file's content; click **Refresh**, then **Remove**, and confirm the chip disappears.
6. Edit the open file's text in the floating editor, and confirm the still-attached chip (if you re-added one before editing) switches to its "Updated" stale indicator.
7. Click **+ Add context → Select files**, search for a known project file, check it, click **Add 1 file**, and confirm a **Selected files** chip appears and resolves to ready.
8. Type a request into the prompt textarea, click **Insert into terminal**, and confirm the composed Markdown (request, `## Stacki context` sections for each ready chip, and the fixed `## Instructions` block) appears in the terminal's input line — pasted, not auto-submitted — and that the prompt textarea clears while the chips remain attached.
9. Press Enter in the terminal and confirm the pasted text behaves like any other typed/pasted terminal input (no special Stacki-side interception beyond the paste).
10. Switch to a different project and confirm the chip bar's state resets along with the rest of the terminal (no stale chips from the previous project).

Expected: every step behaves as described, with no console errors and no unexpected requests to `window.avb`.

- [ ] **Step 3: Confirm final scope and history**

Run:

~~~bash
rtk git status --short --branch
rtk git log --oneline --decorate -16
~~~

Expected: the implementation worktree is clean, and the log shows one focused commit per task in this plan, with no unrelated files included.
