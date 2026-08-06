# Terminal Context Chips (Phase 2: Stacki-Aware Context) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach the currently selected visual-editor element, the currently open page, or the component that owns the current selection as context chips — on top of Phase 1's Current File and Selected Files chips — so an agent prompt can reference exactly which node, page, or component is under discussion, with each chip going stale automatically when the thing it snapshotted changes.

**Architecture:** Three new resolvers (`selectedElementResolver`, `currentPageResolver`, `currentComponentResolver`) plug into Phase 1's existing resolver registry and chip-bar UI without any new UI components — `ContextChip`, `ContextPicker`, and `ContextDetailsPopover` already render any registered resolver generically. Two small pure-JS modules (`src/context/nodeTree.js`, `src/context/projectPaths.js`) give the new resolvers tree-walking and path-conversion helpers without depending on `src/App.jsx`. `App.jsx` derives one new `editorContext` object from state it already computes (`selectedNode`, `model`, `currentPage`, `insertables`) and passes it down through `TerminalPanel` to `ContextChipBar`, which merges it into the resolver-facing `appState`. A new `context:serializeNode` IPC channel reuses Electron main's already-imported `serializeNodes` (from `electron/astroParser.js`) so the Selected Element chip can show real, canonical Astro/HTML markup instead of a hand-rolled re-implementation in the renderer. Phase 1's current-file-only staleness check in `useTerminalContext` is generalized into a per-resolver `computeStaleKey(appState)` hook so all four snapshot-backed resolvers (current file, selected element, current page, current component) get automatic stale detection through one mechanism.

**Tech Stack:** Electron 33, React 18, Vite 6, Vitest 3.2, `@testing-library/react` (including `renderHook`), the existing `@xterm/xterm` terminal panel, the existing hand-written Astro parser/serializer in `electron/astroParser.js`.

## Global Constraints

- This plan implements spec §30 Phase 2 ("Stacki-aware context"): selected element, current page, current component, and stale-state detection. "Context previews" (the fifth Phase 2 bullet) needs no new work — `ContextDetailsPopover` already renders any resolver's `renderMarkdown(snapshot)` generically.
- Out of scope, left for later plans mapping to spec §30 Phases 3–4: Console Errors, Git Diff, size-estimation refinement beyond Phase 1's `estimateTokens`, context-file (Mode B) delivery, secret-content scanning, Preview Screenshot, CMS Schema, and suggested-context ranking.
- Within §9.1–9.3's own "included information" lists, this plan deliberately excludes items that have no backing data source in this codebase today (confirmed by reading `electron/astroParser.js` in full and the visual-editor state in `src/App.jsx`): node **source line/column** (the parser is a regex/string scanner with no position tracking — nodes carry no `line`/`col`/offset fields), element **bounding box** and **viewport** (no live-preview-iframe measurement bridge exists), **computed-style summary** and CSS-cascade-aware **"style rules that directly affect this node"** (the real mechanism, `src/style-panel/lib/cascade.ts`'s `computeRuleModel`, is async and depends on a parsed-stylesheet `TreeView` that isn't available outside the Style panel — wiring it in is a separate, larger effort), structured **CMS bindings** on a node (no `node.binding`/`node.cmsRef` field exists; bindings are purely conventional `{type:'expr'}` props matched by static heuristics), a full **prop-interface merge** for elements that extend an HTML tag (`getElementSchema`/`schemaFor` in `App.jsx` do this for the Props panel UI; duplicating it here is unnecessary — the component's own declared `schema` is enough context for an agent), and **"other affected pages"** for Current Component (`scan.components[].instances` is a count only; listing the actual pages would require a new main-process scan).
- Current Page implements spec §9.2's **Summary** mode only (the spec's own default). Full page source / Structure only / Styles only mode-switching is deferred — adding it would need new picker UI with no functional payoff beyond what Summary plus the existing Current File chip (which can already attach the frontmatter or a raw block) already covers.
- No TypeScript: this codebase is plain JS/JSX. Follow Phase 1's precedent — pure resolver/helper modules under `src/context/` as plain objects and functions, not TS interfaces.
- New Electron logic follows the `electron/contextFiles.js` + `electron/contextIpc.js` split already established: dependency-injected pure logic, thin `ipcMain` wiring with sender validation.
- IPC exposed to the renderer stays on the single existing `window.avb` object in `electron/preload.js`.
- Every shell command in this plan is `rtk`-prefixed, per the user's global tooling setup.
- Follow TDD for every task: write the failing test, confirm RED, implement, confirm GREEN, commit.
- Every file/line reference in this plan was read directly from the current repository state (post-Phase-1), not from the Phase 1 plan document — the Phase 1 plan's own code samples had already drifted slightly from what was actually implemented (e.g. `currentFileResolver`'s `kind` field, `useTerminalContext`'s cancelable-event handling) by the time this plan was written.

---

**Source spec:** docs/superpowers/specs/terminal-chips.md (§1–§34; this plan implements §30 Phase 2 only)

**Prior work:** docs/superpowers/plans/2026-08-05-terminal-context-chips-phase-1.md implemented §30 Phase 1 (already merged) — the `ContextSnapshot` model, resolver registry, `useTerminalContext` hook, chip bar UI, and the Current File / Selected Files resolvers this plan builds on.

**Starting point:** create a dedicated implementation worktree from the commit containing this plan, preserve unrelated user changes, and execute each task from that worktree.

## File Structure

### New files

- `src/context/nodeTree.js` — pure tree helpers shared by the new resolvers: `findNodeById`, `ancestorChain`, `summarizeNode`, `childSummaries`, `findOwningComponent`.
- `src/context/nodeTree.test.js`
- `src/context/projectPaths.js` — `toProjectRelativePath(root, absolutePath)`, converting the scanner's absolute component/layout paths into the project-relative form every resolver's data uses.
- `src/context/projectPaths.test.js`
- `src/context/selectedElementResolver.js` — resolver for the currently selected visual node (spec §9.1).
- `src/context/selectedElementResolver.test.js`
- `src/context/currentPageResolver.js` — resolver for the currently open page, Summary mode (spec §9.2).
- `src/context/currentPageResolver.test.js`
- `src/context/currentComponentResolver.js` — resolver for the component/layout owning the current selection (spec §9.3).
- `src/context/currentComponentResolver.test.js`

### Modified files

- `src/context/contextTypes.js` — add `SELECTED_ELEMENT`, `CURRENT_PAGE`, `CURRENT_COMPONENT` to `CONTEXT_CHIP_TYPES`.
- `src/context/contextTypes.test.js`
- `src/context/useTerminalContext.js` — generalize the current-file-only staleness effect into a per-resolver `computeStaleKey(appState)` mechanism.
- `src/context/useTerminalContext.test.js`
- `src/context/currentFileResolver.js` — implement `computeStaleKey` using the existing revision-hash logic.
- `src/context/currentFileResolver.test.js`
- `electron/contextIpc.js` — add a `context:serializeNode` channel.
- `electron/contextIpc.test.js`
- `electron/preload.js` — expose `serializeNode` on `window.avb`.
- `src/panels/ContextChipBar.jsx` — register the three new resolvers; merge a new `editorContext` prop into `appState`; wrap `context:serializeNode`.
- `src/panels/ContextChipBar.test.jsx`
- `src/panels/TerminalPanel.jsx` — accept and forward an `editorContext` prop.
- `src/panels/TerminalPanel.test.jsx`
- `src/App.jsx` — derive `editorContext` from existing `selectedNode`/`model`/`currentPage`/`insertables` state and pass it to `TerminalPanel`.

## Task 1: Add the three new chip types

**Files:**

- Modify: `src/context/contextTypes.js:1-4`
- Modify: `src/context/contextTypes.test.js:13-16`

**Interfaces:**

- Produces: `CONTEXT_CHIP_TYPES.SELECTED_ELEMENT === 'selected-element'`, `CONTEXT_CHIP_TYPES.CURRENT_PAGE === 'current-page'`, `CONTEXT_CHIP_TYPES.CURRENT_COMPONENT === 'current-component'`.

- [ ] **Step 1: Extend the failing test**

In `src/context/contextTypes.test.js`, replace the `'exposes the phase-1 chip types'` test:

~~~js
  it('exposes every registered chip type', () => {
    expect(CONTEXT_CHIP_TYPES.CURRENT_FILE).toBe('current-file');
    expect(CONTEXT_CHIP_TYPES.SELECTED_FILES).toBe('selected-files');
    expect(CONTEXT_CHIP_TYPES.SELECTED_ELEMENT).toBe('selected-element');
    expect(CONTEXT_CHIP_TYPES.CURRENT_PAGE).toBe('current-page');
    expect(CONTEXT_CHIP_TYPES.CURRENT_COMPONENT).toBe('current-component');
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextTypes.test.js
~~~

Expected: FAIL — the three new keys are `undefined`.

- [ ] **Step 3: Extend the type map**

In `src/context/contextTypes.js`:

~~~js
export const CONTEXT_CHIP_TYPES = Object.freeze({
  CURRENT_FILE: 'current-file',
  SELECTED_FILES: 'selected-files',
  SELECTED_ELEMENT: 'selected-element',
  CURRENT_PAGE: 'current-page',
  CURRENT_COMPONENT: 'current-component',
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
rtk git commit -m "feat: add phase-2 context chip types"
~~~

## Task 2: Generalize resolver staleness detection

**Files:**

- Modify: `src/context/useTerminalContext.js`
- Modify: `src/context/useTerminalContext.test.js:105-124`
- Modify: `src/context/currentFileResolver.js`
- Modify: `src/context/currentFileResolver.test.js`

**Interfaces:**

- Consumes: nothing new.
- Produces: an optional resolver method `computeStaleKey(appState) -> string | null`. When a resolver defines it, `useTerminalContext` stores the key returned at resolve time on the chip (`chip.staleKey`) and, whenever `appState` changes, recomputes it for every `READY` chip of that resolver's type — a mismatch demotes the chip to `STALE`. Resolvers without `computeStaleKey` never auto-stale (Phase 1's `selectedFilesResolver` keeps this behavior unchanged). `currentFileResolver` gains `computeStaleKey`, replacing the hook's old current-file-only special case.

- [ ] **Step 1: Replace the current-file-only stale test with the generic mechanism's tests**

In `src/context/useTerminalContext.test.js`, replace the `'marks a ready current-file chip stale when the open file changes'` test (lines 105-124) with:

~~~js
  it('marks a ready chip stale when its resolver-reported key changes', async () => {
    registerResolver(
      fakeResolver({
        resolve: vi.fn(async () => ({ data: { value: 'x' }, estimatedCharacters: 1, sourceRevision: 'r1' })),
        computeStaleKey: (appState) => appState.currentFile?.content ?? null,
      }),
    );
    const { result, rerender } = renderHook(
      ({ appState }) => useTerminalContext(appState),
      { initialProps: { appState: { currentFile: { path: 'a.astro', content: 'one' }, projectPath: null } } },
    );

    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.STALE);
  });

  it('never auto-stales a chip whose resolver has no computeStaleKey', async () => {
    registerResolver(fakeResolver());
    const { result, rerender } = renderHook(
      ({ appState }) => useTerminalContext(appState),
      { initialProps: { appState: { currentFile: { path: 'a.astro', content: 'one' }, projectPath: null } } },
    );

    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY);
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/useTerminalContext.test.js
~~~

Expected: FAIL — the first new test finds the chip still `READY` (the hook only special-cases `type === 'current-file'` today, and this fake resolver's type is `'fake-a'`).

- [ ] **Step 3: Generalize the hook**

Replace the full contents of `src/context/useTerminalContext.js`:

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

export function useTerminalContext(appState) {
  const [chips, setChips] = useState([]);
  const [prompt, setPrompt] = useState('');
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  const resolveChip = useCallback(async (id, type, options) => {
    const resolver = getResolver(type);
    try {
      const result = await resolver.resolve(appStateRef.current, options);
      const staleKey = resolver.computeStaleKey
        ? resolver.computeStaleKey(appStateRef.current)
        : null;
      setChips((current) =>
        current.map((chip) =>
          chip.id === id ? { ...withReady(chip, result), staleKey } : chip,
        ),
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
      // Look up the target chip from current `chips` state rather than
      // capturing it inside the setChips updater: React 18 batches state
      // updates, so an updater passed to setChips does not run
      // synchronously in this call frame, and a `let target` closure
      // written from inside it would still be null on the next line.
      const target = chips.find((chip) => chip.id === id);
      if (!target) return;
      setChips((current) =>
        current.map((chip) =>
          chip.id === id ? { ...chip, status: CONTEXT_CHIP_STATUS.RESOLVING } : chip,
        ),
      );
      void resolveChip(id, target.type, target.options);
    },
    [chips, resolveChip],
  );

  // Each resolver may declare computeStaleKey(appState) to say what its
  // snapshot depends on. A ready chip whose resolver's current key no longer
  // matches the key captured at resolve time has had its source change from
  // under it — mark it stale so the user can refresh or keep the captured
  // version. Resolvers without computeStaleKey (e.g. Selected files) never
  // auto-stale.
  useEffect(() => {
    setChips((current) =>
      current.map((chip) => {
        if (chip.status !== CONTEXT_CHIP_STATUS.READY) return chip;
        const resolver = getResolver(chip.type);
        if (!resolver?.computeStaleKey) return chip;
        const staleKey = resolver.computeStaleKey(appState);
        if (staleKey === chip.staleKey) return chip;
        return withStale(chip);
      }),
    );
  }, [appState]);

  const composedMarkdown = useMemo(
    () => composePrompt({ request: prompt, snapshots: chips }),
    [prompt, chips],
  );

  const insertIntoTerminal = useCallback(() => {
    // `dispatchEvent` runs listeners synchronously, so TerminalPanel's
    // handler has already run (and called `preventDefault()` if it couldn't
    // actually paste — no live shell session) by the time this returns.
    // Only clear the prompt when the text was really delivered, or the
    // user's typed request is silently lost the moment the shell exits.
    const event = new CustomEvent('stacki:terminal-menu', {
      cancelable: true,
      detail: { action: 'insert', text: composedMarkdown },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) {
      setPrompt('');
    }
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

Expected: all tests pass, including the rest of the existing suite (add/remove/refresh/error/compose/insert behaviors are unchanged).

- [ ] **Step 5: Add a failing test for currentFileResolver's own computeStaleKey**

In `src/context/currentFileResolver.test.js`, add a new `it` inside `describe('currentFileResolver', ...)`:

~~~js
  it('computes a stale key from the open file, matching what resolve captures', async () => {
    const appState = {
      currentFile: { path: 'a.astro', title: 'a', language: 'javascript', content: 'const x = 1;', kind: 'fragment' },
    };
    const result = await currentFileResolver.resolve(appState);
    expect(currentFileResolver.computeStaleKey(appState)).toBe(result.sourceRevision);
    expect(currentFileResolver.computeStaleKey({ currentFile: null })).toBeNull();
  });
~~~

- [ ] **Step 6: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/currentFileResolver.test.js
~~~

Expected: FAIL — `currentFileResolver.computeStaleKey` is not a function.

- [ ] **Step 7: Implement computeStaleKey, sharing the revision-key logic with resolve**

Replace the full contents of `src/context/currentFileResolver.js`:

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

function fileRevisionKey(file) {
  return `${file.path || file.title}:${file.content.length}:${hashString(file.content)}`;
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
        kind: file.kind,
      },
      estimatedCharacters: file.content.length,
      sourceRevision: fileRevisionKey(file),
    };
  },

  computeStaleKey(appState) {
    return appState.currentFile ? fileRevisionKey(appState.currentFile) : null;
  },

  renderMarkdown(snapshot) {
    const { path, title, language, content, kind } = snapshot.data;
    // `kind === 'fragment'` means `content` is only a piece of the file
    // (frontmatter, or one <script>/<style> block) — the heading has to say
    // so, or an agent reading just the path could mistake the fragment for
    // the whole file and rewrite it destructively.
    const heading =
      kind === 'fragment' && path
        ? `\`${path}\` (${title} fragment)`
        : path
          ? `\`${path}\``
          : title;
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

- [ ] **Step 8: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/currentFileResolver.test.js src/context/useTerminalContext.test.js
~~~

Expected: all tests pass.

- [ ] **Step 9: Commit**

~~~bash
rtk git add src/context/useTerminalContext.js src/context/useTerminalContext.test.js src/context/currentFileResolver.js src/context/currentFileResolver.test.js
rtk git commit -m "feat: generalize context chip staleness to any resolver"
~~~

## Task 3: Add node-tree and project-path pure helpers

**Files:**

- Create: `src/context/nodeTree.test.js`
- Create: `src/context/nodeTree.js`
- Create: `src/context/projectPaths.test.js`
- Create: `src/context/projectPaths.js`

**Interfaces:**

- Produces: `findNodeById(nodes, id) -> node | null`, `ancestorChain(nodes, id) -> node[]` (root → … → node, inclusive; `[]` if not found), `summarizeNode(node) -> {kind, label}`, `childSummaries(node) -> {kind, label}[]` (direct children only), `findOwningComponent(nodes, id, componentDefinitions) -> {node, definition} | null` (nearest `kind:'component'` ancestor, inclusive of the node itself, whose `name` matches a definition's `name`), `toProjectRelativePath(root, absolutePath) -> string | null`.
- These mirror the private, unexported tree helpers already in `src/App.jsx:60-127` (same tree shape: `{id, kind, name?, props?, children?}`, `children === null` for self-closing) and the private `toProjectRelativePath` in `src/App.jsx:341-349` — reimplemented here so `src/context/` resolvers don't depend on the large `App.jsx` component module.

- [ ] **Step 1: Write the failing tests**

Create `src/context/nodeTree.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import {
  ancestorChain,
  childSummaries,
  findNodeById,
  findOwningComponent,
  summarizeNode,
} from './nodeTree.js';

const TREE = [
  {
    id: 'layout',
    kind: 'component',
    name: 'MarketingLayout',
    props: {},
    children: [
      {
        id: 'hero',
        kind: 'component',
        name: 'HeroSection',
        props: {},
        children: [
          {
            id: 'h1',
            kind: 'element',
            name: 'h1',
            props: { class: { type: 'string', value: 'hero_heading' } },
            children: [{ id: 'txt', kind: 'text', value: 'Build faster', children: null }],
          },
          { id: 'p', kind: 'element', name: 'p', props: {}, children: null },
        ],
      },
    ],
  },
];

describe('findNodeById', () => {
  it('finds a nested node by id', () => {
    expect(findNodeById(TREE, 'h1')?.name).toBe('h1');
  });

  it('returns null when the id is not in the tree', () => {
    expect(findNodeById(TREE, 'missing')).toBeNull();
  });
});

describe('ancestorChain', () => {
  it('returns root through the node, inclusive', () => {
    expect(ancestorChain(TREE, 'h1').map((n) => n.id)).toEqual(['layout', 'hero', 'h1']);
  });

  it('returns just the node when it is at the root', () => {
    expect(ancestorChain(TREE, 'layout').map((n) => n.id)).toEqual(['layout']);
  });

  it('returns an empty array when the id is not found', () => {
    expect(ancestorChain(TREE, 'missing')).toEqual([]);
  });
});

describe('summarizeNode', () => {
  it('summarizes an element with its first class', () => {
    expect(summarizeNode(findNodeById(TREE, 'h1'))).toEqual({ kind: 'element', label: 'h1.hero_heading' });
  });

  it('summarizes an element with no class as the bare tag', () => {
    expect(summarizeNode(findNodeById(TREE, 'p'))).toEqual({ kind: 'element', label: 'p' });
  });

  it('summarizes a component by name', () => {
    expect(summarizeNode(findNodeById(TREE, 'hero'))).toEqual({ kind: 'component', label: 'HeroSection' });
  });

  it('summarizes and truncates a long text node', () => {
    expect(summarizeNode({ kind: 'text', value: 'Build faster' })).toEqual({ kind: 'text', label: 'Build faster' });
    expect(summarizeNode({ kind: 'text', value: 'x'.repeat(80) }).label.endsWith('…')).toBe(true);
  });

  it('summarizes an expr node', () => {
    expect(summarizeNode({ kind: 'expr', value: 'service.title' })).toEqual({ kind: 'expr', label: 'service.title' });
  });

  it('summarizes a comment node', () => {
    expect(summarizeNode({ kind: 'comment', value: ' TODO ' })).toEqual({ kind: 'comment', label: 'TODO' });
  });

  it('summarizes a map node by its loop source up to .map', () => {
    expect(summarizeNode({ kind: 'map', head: 'items.map((item) => (' })).toEqual({ kind: 'map', label: 'items.map' });
  });

  it('summarizes a raw node by its tag', () => {
    expect(summarizeNode({ kind: 'raw', name: 'style' })).toEqual({ kind: 'raw', label: '<style>' });
  });

  it('falls back to kind and name for anything else', () => {
    expect(summarizeNode({ kind: 'chunk-group', name: 'chunk' })).toEqual({ kind: 'chunk-group', label: 'chunk' });
  });

  it('handles a missing node', () => {
    expect(summarizeNode(null)).toEqual({ kind: 'unknown', label: '(missing)' });
  });
});

describe('childSummaries', () => {
  it('summarizes direct children only', () => {
    expect(childSummaries(findNodeById(TREE, 'hero'))).toEqual([
      { kind: 'element', label: 'h1.hero_heading' },
      { kind: 'element', label: 'p' },
    ]);
  });

  it('returns an empty array for a self-closing node', () => {
    expect(childSummaries(findNodeById(TREE, 'p'))).toEqual([]);
  });

  it('returns an empty array for a missing node', () => {
    expect(childSummaries(null)).toEqual([]);
  });
});

describe('findOwningComponent', () => {
  const definitions = [
    { name: 'HeroSection', path: '/project/src/components/HeroSection.astro' },
    { name: 'MarketingLayout', path: '/project/src/layouts/MarketingLayout.astro', isLayout: true },
  ];

  it('returns the nearest matching component ancestor', () => {
    const owner = findOwningComponent(TREE, 'h1', definitions);
    expect(owner.definition.name).toBe('HeroSection');
  });

  it('returns the node itself when it is a matching component', () => {
    const owner = findOwningComponent(TREE, 'hero', definitions);
    expect(owner.node.id).toBe('hero');
    expect(owner.definition.name).toBe('HeroSection');
  });

  it('falls back to an outer component when the nearer one has no matching definition', () => {
    const owner = findOwningComponent(TREE, 'h1', [definitions[1]]);
    expect(owner.definition.name).toBe('MarketingLayout');
  });

  it('returns null when no ancestor is a component', () => {
    const flatTree = [{ id: 'div', kind: 'element', name: 'div', props: {}, children: null }];
    expect(findOwningComponent(flatTree, 'div', definitions)).toBeNull();
  });

  it('returns null when no component ancestor has a matching definition', () => {
    expect(findOwningComponent(TREE, 'h1', [])).toBeNull();
  });

  it('returns null when the id is not found', () => {
    expect(findOwningComponent(TREE, 'missing', definitions)).toBeNull();
  });
});
~~~

Create `src/context/projectPaths.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { toProjectRelativePath } from './projectPaths.js';

describe('toProjectRelativePath', () => {
  it('strips the project root and any leading slash', () => {
    expect(
      toProjectRelativePath('/projects/site', '/projects/site/src/components/Hero.astro'),
    ).toBe('src/components/Hero.astro');
  });

  it('returns the input unchanged when there is no root', () => {
    expect(toProjectRelativePath(null, '/projects/site/x.astro')).toBe('/projects/site/x.astro');
  });

  it('returns null for a missing path', () => {
    expect(toProjectRelativePath('/projects/site', null)).toBeNull();
  });

  it('leaves an already-relative path unchanged', () => {
    expect(toProjectRelativePath('/projects/site', 'src/x.astro')).toBe('src/x.astro');
  });
});
~~~

- [ ] **Step 2: Run the tests and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/nodeTree.test.js src/context/projectPaths.test.js
~~~

Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement the helpers**

Create `src/context/nodeTree.js`:

~~~js
// Pure helpers over the visual-editor node tree (model.nodes), shared by the
// Selected Element and Current Page resolvers. src/App.jsx has its own
// private, unexported copies of the same tree walks — these are separate,
// resolver-facing versions so src/context/ has no dependency on the large
// App.jsx component module.

export function findNodeById(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return node;
    if (Array.isArray(node.children)) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Root → … → node, inclusive. Empty array when the id isn't found.
export function ancestorChain(nodes, id) {
  for (const node of nodes || []) {
    if (node.id === id) return [node];
    if (Array.isArray(node.children)) {
      const rest = ancestorChain(node.children, id);
      if (rest.length > 0) return [node, ...rest];
    }
  }
  return [];
}

function truncate(text, max = 60) {
  const value = String(text ?? '').trim().replace(/\s+/g, ' ');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function firstClass(node) {
  const cls = node.props?.class;
  return cls && cls.type === 'string' ? cls.value.trim().split(/\s+/)[0] : null;
}

// A one-line {kind, label} description of a node, independent of any panel
// component so it can be reused by resolvers without pulling in React.
export function summarizeNode(node) {
  if (!node) return { kind: 'unknown', label: '(missing)' };
  switch (node.kind) {
    case 'text':
      return { kind: 'text', label: truncate(node.value) };
    case 'expr':
      return { kind: 'expr', label: truncate(node.value) };
    case 'comment':
      return { kind: 'comment', label: truncate(node.value) };
    case 'map': {
      const at = node.head.indexOf('.map');
      return { kind: 'map', label: truncate(at > 0 ? node.head.slice(0, at + 4) : node.head) };
    }
    case 'raw':
      return { kind: 'raw', label: `<${node.name}>` };
    case 'component':
      return { kind: 'component', label: node.name };
    case 'element': {
      const cls = firstClass(node);
      return { kind: 'element', label: cls ? `${node.name}.${cls}` : node.name };
    }
    default:
      return { kind: node.kind, label: node.name || node.kind };
  }
}

// Direct children only, each summarized — not a deep walk.
export function childSummaries(node) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children.map(summarizeNode);
}

// Nearest owning component: the node itself if it's a component instance,
// otherwise the nearest kind:'component' ancestor (this also matches a
// placed layout, since layouts and components share the same node kind and
// are treated identically elsewhere in the app). Skips a component-kind
// ancestor whose name has no matching scanned definition and keeps walking
// outward, so an unresolvable inner name still lets an outer match through.
// Returns null when nothing in the chain matches.
export function findOwningComponent(nodes, id, componentDefinitions) {
  const chain = ancestorChain(nodes, id);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const node = chain[i];
    if (node.kind !== 'component') continue;
    const definition = (componentDefinitions || []).find((c) => c.name === node.name);
    if (definition) return { node, definition };
  }
  return null;
}
~~~

Create `src/context/projectPaths.js`:

~~~js
// Converts an absolute path (as returned by the project scanner —
// electron/main.js's listAstroFiles walks with path.join from an absolute
// project root) into the project-relative form every resolver's data uses.
// Mirrors the private toProjectRelativePath in src/App.jsx:341-349.
export function toProjectRelativePath(root, absolutePath) {
  if (!absolutePath) return null;
  if (!root) return absolutePath;
  let rel = absolutePath;
  if (rel.startsWith(root)) {
    rel = rel.slice(root.length);
  }
  return rel.replace(/^[\\/]+/, '');
}
~~~

- [ ] **Step 4: Run the tests and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/nodeTree.test.js src/context/projectPaths.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/nodeTree.js src/context/nodeTree.test.js src/context/projectPaths.js src/context/projectPaths.test.js
rtk git commit -m "feat: add node-tree and project-path helpers for context resolvers"
~~~

## Task 4: Add the context:serializeNode IPC channel

**Files:**

- Modify: `electron/contextIpc.js`
- Modify: `electron/contextIpc.test.js`
- Modify: `electron/preload.js:552-554`

**Interfaces:**

- Consumes: `serializeNodes` from `electron/astroParser.js` (already required in `electron/main.js:19-28`; `electron/contextIpc.js` requires it directly, mirroring its existing `require('./contextFiles')`).
- Produces: `window.avb.serializeNode({node}) -> Promise<{markup: string}>`. `registerContextIpc` gains an injectable `serializeNode(node) -> string` dependency (default: `(node) => astroParser.serializeNodes([node])`), matching the existing `listProjectFiles`/`readProjectFile` DI pattern.

- [ ] **Step 1: Write the failing tests**

In `electron/contextIpc.test.js`, change the `setup()` helper to inject `serializeNode` and update the two tests that assert the full channel/handler set:

~~~js
import { describe, expect, it, vi } from 'vitest';
import contextIpcModule from './contextIpc.js';

const { registerContextIpc } = contextIpcModule;

// contextIpc.js is plain CommonJS and requires ./contextFiles and
// ./astroParser internally, so list/read/serialize are injected as
// constructor-style dependencies (same pattern as TerminalManager's injected
// loadPty) rather than mocked via vi.mock — that keeps the test decoupled
// from CJS/ESM interop details.
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
  const serializeNode = vi.fn((node) => `<${node.name}></${node.name}>`);
  const unregister = registerContextIpc({
    ipcMain,
    isAllowedSender: (event) => event === allowed,
    getProjectRoot: () => projectRoot,
    listProjectFiles,
    readProjectFile,
    serializeNode,
  });
  return { ipcMain, handles, allowed, denied, unregister, listProjectFiles, readProjectFile, serializeNode };
}

describe('context IPC', () => {
  it('registers the three context channels', () => {
    const { handles } = setup();
    expect([...handles.keys()]).toEqual(['context:listFiles', 'context:readFile', 'context:serializeNode']);
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

  it('serializes a node to markup for an allowed sender', async () => {
    const { handles, allowed, serializeNode } = setup();
    const node = { id: 'h1', kind: 'element', name: 'h1' };
    await expect(handles.get('context:serializeNode')(allowed, { node })).resolves.toEqual({
      markup: '<h1></h1>',
    });
    expect(serializeNode).toHaveBeenCalledWith(node);
  });

  it('rejects an untrusted sender', async () => {
    const { handles, denied } = setup();
    await expect(handles.get('context:listFiles')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:readFile')(denied, { rel: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:serializeNode')(denied, { node: {} })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
  });

  it('rejects when no project is open', async () => {
    const { handles, allowed } = setup({ projectRoot: null });
    await expect(handles.get('context:listFiles')(allowed)).rejects.toThrow(
      'Open a project before attaching context.',
    );
  });

  it('unregisters all three handlers', () => {
    const { ipcMain, unregister } = setup();
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:listFiles');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:readFile');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:serializeNode');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
~~~

Expected: FAIL — `context:serializeNode` is never registered.

- [ ] **Step 3: Add the handler**

Replace the full contents of `electron/contextIpc.js`:

~~~js
const contextFiles = require('./contextFiles');
const astroParser = require('./astroParser');

function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
  serializeNode = (node) => astroParser.serializeNodes([node]),
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
  const serialize = async (event, payload) => {
    assertAllowed(event);
    return { markup: serializeNode(payload?.node) };
  };

  ipcMain.handle('context:listFiles', listFiles);
  ipcMain.handle('context:readFile', readFile);
  ipcMain.handle('context:serializeNode', serialize);

  return () => {
    ipcMain.removeHandler('context:listFiles');
    ipcMain.removeHandler('context:readFile');
    ipcMain.removeHandler('context:serializeNode');
  };
}

module.exports = { registerContextIpc };
~~~

- [ ] **Step 4: Expose it on window.avb**

In `electron/preload.js`, extend the existing "Terminal context chips" block (`electron/preload.js:552-554`):

~~~js
  // Terminal context chips
  listContextFiles: invoke('context:listFiles'),
  readContextFile: invoke('context:readFile'),
  serializeNode: invoke('context:serializeNode'),
~~~

- [ ] **Step 5: Run tests, check:electron, and build**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
rtk npm run check:electron
rtk npm run build
~~~

Expected: tests pass, every Electron entry parses (no new files were added to `electron/`, so `check:electron`'s file list is unchanged), and the renderer builds.

- [ ] **Step 6: Commit**

~~~bash
rtk git add electron/contextIpc.js electron/contextIpc.test.js electron/preload.js
rtk git commit -m "feat: add context:serializeNode IPC channel"
~~~

## Task 5: Add the Selected Element resolver

**Files:**

- Create: `src/context/selectedElementResolver.test.js`
- Create: `src/context/selectedElementResolver.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_TYPES` (Task 1), `ancestorChain`/`childSummaries`/`findOwningComponent`/`summarizeNode` (Task 3), `toProjectRelativePath` (Task 3).
- Produces: `selectedElementResolver` matching the resolver shape, plus `computeStaleKey`. `resolve(appState)` reads `appState.selectedNode` (a raw tree node, `{id, kind, name, props, children}`), `appState.nodeTree` (the page's `model.nodes`, for ancestor/owner lookups), `appState.componentDefinitions` (`[...scan.components, ...scan.layouts]`), `appState.loopContext` (the existing `{frontmatter, imports, ancestorHeads}` object App.jsx already computes at selection time), `appState.projectPath`, and `appState.serializeNode(node) -> Promise<string>` (Task 4's IPC, wrapped by `ContextChipBar` in Task 8).

- [ ] **Step 1: Write the failing test**

Create `src/context/selectedElementResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { selectedElementResolver } from './selectedElementResolver.js';

const TREE = [
  {
    id: 'hero',
    kind: 'component',
    name: 'HeroSection',
    props: {},
    children: [
      {
        id: 'h1',
        kind: 'element',
        name: 'h1',
        props: { class: { type: 'string', value: 'hero_heading' } },
        children: [{ id: 'txt', kind: 'text', value: 'Build faster', children: null }],
      },
    ],
  },
];

const DEFINITIONS = [{ name: 'HeroSection', path: '/projects/site/src/components/HeroSection.astro' }];

function baseAppState(overrides = {}) {
  return {
    selectedNode: TREE[0].children[0],
    nodeTree: TREE,
    componentDefinitions: DEFINITIONS,
    projectPath: '/projects/site',
    loopContext: { ancestorHeads: [] },
    serializeNode: vi.fn(async () => '<h1 class="hero_heading">Build faster</h1>\n'),
    ...overrides,
  };
}

describe('selectedElementResolver', () => {
  it('is unavailable when nothing is selected', () => {
    expect(selectedElementResolver.isAvailable(baseAppState({ selectedNode: null }))).toBe(false);
  });

  it('is available when a node is selected', () => {
    expect(selectedElementResolver.isAvailable(baseAppState())).toBe(true);
  });

  it('resolves ancestors, children, owner component, loop context, and serialized markup', async () => {
    const appState = baseAppState();
    const result = await selectedElementResolver.resolve(appState);
    expect(appState.serializeNode).toHaveBeenCalledWith(TREE[0].children[0]);
    expect(result.data).toEqual({
      id: 'h1',
      kind: 'element',
      tag: 'h1',
      props: { class: { type: 'string', value: 'hero_heading' } },
      ancestors: [{ kind: 'component', label: 'HeroSection' }],
      children: [{ kind: 'text', label: 'Build faster' }],
      ownerComponent: { name: 'HeroSection', path: 'src/components/HeroSection.astro' },
      loopVariables: [],
      markup: '<h1 class="hero_heading">Build faster</h1>\n',
    });
    expect(result.estimatedCharacters).toBeGreaterThan(0);
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('includes loop context from the app state', async () => {
    const appState = baseAppState({ loopContext: { ancestorHeads: ['items.map((item) => ('] } });
    const result = await selectedElementResolver.resolve(appState);
    expect(result.data.loopVariables).toEqual(['items.map((item) => (']);
  });

  it('rejects resolving with nothing selected', async () => {
    await expect(selectedElementResolver.resolve(baseAppState({ selectedNode: null }))).rejects.toThrow(
      'No element is selected.',
    );
  });

  it('renders tag, ancestors, owner, props, children, and markup as Markdown', () => {
    const snapshot = {
      data: {
        id: 'h1',
        kind: 'element',
        tag: 'h1',
        props: { class: { type: 'string', value: 'hero_heading' } },
        ancestors: [{ kind: 'component', label: 'HeroSection' }],
        children: [{ kind: 'text', label: 'Build faster' }],
        ownerComponent: { name: 'HeroSection', path: 'src/components/HeroSection.astro' },
        loopVariables: [],
        markup: '<h1 class="hero_heading">Build faster</h1>',
      },
    };
    const markdown = selectedElementResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Selected element');
    expect(markdown).toContain('Element: `h1` (element)');
    expect(markdown).toContain('Ancestor path: HeroSection');
    expect(markdown).toContain('Owner component: HeroSection (`src/components/HeroSection.astro`)');
    expect(markdown).toContain('Children: Build faster');
    expect(markdown).toContain('```astro');
    expect(markdown).toContain('<h1 class="hero_heading">Build faster</h1>');
  });

  it('produces a different stale key when the selected node changes', () => {
    const key1 = selectedElementResolver.computeStaleKey(baseAppState());
    const key2 = selectedElementResolver.computeStaleKey(
      baseAppState({ selectedNode: { ...TREE[0].children[0], props: {} } }),
    );
    expect(key1).not.toBe(key2);
  });

  it('returns null stale key when nothing is selected', () => {
    expect(selectedElementResolver.computeStaleKey(baseAppState({ selectedNode: null }))).toBeNull();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/selectedElementResolver.test.js
~~~

Expected: FAIL — `selectedElementResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/selectedElementResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { ancestorChain, childSummaries, findOwningComponent, summarizeNode } from './nodeTree.js';
import { toProjectRelativePath } from './projectPaths.js';

// Not cryptographic — only used to detect that the selected node's own data
// changed between two resolves/stale-checks.
function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function nodeRevisionKey(node) {
  if (!node) return null;
  const json = JSON.stringify({
    id: node.id,
    kind: node.kind,
    name: node.name,
    props: node.props,
    childCount: node.children?.length ?? null,
  });
  return `${node.id}:${hashString(json)}`;
}

export const selectedElementResolver = {
  type: CONTEXT_CHIP_TYPES.SELECTED_ELEMENT,
  label: 'Selected element',

  isAvailable(appState) {
    return !!appState.selectedNode;
  },

  getDefaultOptions() {
    return {};
  },

  async resolve(appState) {
    const { selectedNode, nodeTree = [], componentDefinitions = [], loopContext, projectPath, serializeNode } = appState;
    if (!selectedNode) throw new Error('No element is selected.');

    const chain = ancestorChain(nodeTree, selectedNode.id);
    const ancestors = chain.slice(0, -1).map(summarizeNode);
    const children = childSummaries(selectedNode);
    const owner = findOwningComponent(nodeTree, selectedNode.id, componentDefinitions);
    const markup = await serializeNode(selectedNode);

    const data = {
      id: selectedNode.id,
      kind: selectedNode.kind,
      tag: selectedNode.name || null,
      props: selectedNode.props || {},
      ancestors,
      children,
      ownerComponent: owner
        ? { name: owner.definition.name, path: toProjectRelativePath(projectPath, owner.definition.path) }
        : null,
      loopVariables: loopContext?.ancestorHeads || [],
      markup,
    };

    const estimatedCharacters = markup.length + JSON.stringify(data.props).length;
    return {
      data,
      estimatedCharacters,
      sourceRevision: `${nodeRevisionKey(selectedNode)}:${hashString(markup)}`,
    };
  },

  computeStaleKey(appState) {
    return nodeRevisionKey(appState.selectedNode);
  },

  renderMarkdown(snapshot) {
    const { tag, kind, props, ancestors, children, ownerComponent, loopVariables, markup } = snapshot.data;
    const lines = ['### Selected element', ''];
    lines.push(`- Element: \`${tag || kind}\` (${kind})`);
    if (ancestors.length > 0) {
      lines.push(`- Ancestor path: ${ancestors.map((a) => a.label).join(' → ')}`);
    }
    if (ownerComponent) {
      lines.push(`- Owner component: ${ownerComponent.name} (\`${ownerComponent.path}\`)`);
    }
    if (loopVariables.length > 0) {
      lines.push(`- Loop context: ${loopVariables.join(' / ')}`);
    }
    const propEntries = Object.entries(props || {});
    if (propEntries.length > 0) {
      lines.push(`- Props: ${propEntries.map(([name, prop]) => `${name}=${prop?.value ?? '{…}'}`).join(', ')}`);
    }
    if (children.length > 0) {
      lines.push(`- Children: ${children.map((c) => c.label).join(', ')}`);
    }
    lines.push('', '```astro', markup.trim(), '```');
    return lines.join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/selectedElementResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/selectedElementResolver.js src/context/selectedElementResolver.test.js
rtk git commit -m "feat: add selected-element context resolver"
~~~

## Task 6: Add the Current Page resolver

**Files:**

- Create: `src/context/currentPageResolver.test.js`
- Create: `src/context/currentPageResolver.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_TYPES` (Task 1), `summarizeNode` (Task 3).
- Produces: `currentPageResolver` matching the resolver shape, plus `computeStaleKey`. `resolve(appState)` reads `appState.pageInfo` (`{editable, route, path, layoutName, imports, frontmatter} | null`, App.jsx-derived from `pageState`/`currentPage`/`model` in Task 9) and `appState.nodeTree` (top-level structure only — a shallow map, not a deep walk).

- [ ] **Step 1: Write the failing test**

Create `src/context/currentPageResolver.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { currentPageResolver } from './currentPageResolver.js';

const NODE_TREE = [
  { id: 'layout', kind: 'component', name: 'MarketingLayout', props: {}, children: [] },
];

function baseAppState(overrides = {}) {
  return {
    pageInfo: {
      editable: true,
      route: '/services',
      path: 'src/pages/services.astro',
      layoutName: 'MarketingLayout',
      imports: [
        { name: 'Hero', path: '../components/Hero.astro' },
        { name: 'clients', path: '../data/clients.json' },
      ],
      frontmatter: 'const title = "Services";',
    },
    nodeTree: NODE_TREE,
    ...overrides,
  };
}

describe('currentPageResolver', () => {
  it('is unavailable when no editable page is open', () => {
    expect(currentPageResolver.isAvailable(baseAppState({ pageInfo: null }))).toBe(false);
    expect(currentPageResolver.isAvailable(baseAppState({ pageInfo: { editable: false } }))).toBe(false);
  });

  it('is available for an editable page', () => {
    expect(currentPageResolver.isAvailable(baseAppState())).toBe(true);
  });

  it('resolves route, source, layout, imports, CMS sources, frontmatter, and structure', async () => {
    const result = await currentPageResolver.resolve(baseAppState());
    expect(result.data).toEqual({
      route: '/services',
      path: 'src/pages/services.astro',
      layoutName: 'MarketingLayout',
      imports: [
        { name: 'Hero', path: '../components/Hero.astro' },
        { name: 'clients', path: '../data/clients.json' },
      ],
      cmsDataSources: ['../data/clients.json'],
      frontmatter: 'const title = "Services";',
      structure: [{ kind: 'component', label: 'MarketingLayout' }],
    });
  });

  it('rejects resolving a non-editable page', async () => {
    await expect(
      currentPageResolver.resolve(baseAppState({ pageInfo: { editable: false } })),
    ).rejects.toThrow('No editable page is open.');
  });

  it('renders route, layout, imports, CMS sources, frontmatter, and structure as Markdown', () => {
    const snapshot = {
      data: {
        route: '/services',
        path: 'src/pages/services.astro',
        layoutName: 'MarketingLayout',
        imports: [{ name: 'Hero', path: '../components/Hero.astro' }],
        cmsDataSources: ['../data/clients.json'],
        frontmatter: 'const title = "Services";',
        structure: [{ kind: 'component', label: 'MarketingLayout' }],
      },
    };
    const markdown = currentPageResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current page');
    expect(markdown).toContain('Route: `/services`');
    expect(markdown).toContain('Layout: MarketingLayout');
    expect(markdown).toContain('Imports: Hero');
    expect(markdown).toContain('CMS data sources: ../data/clients.json');
    expect(markdown).toContain('const title = "Services";');
    expect(markdown).toContain('- component: MarketingLayout');
  });

  it('changes stale key when the page structure changes', () => {
    const key1 = currentPageResolver.computeStaleKey(baseAppState());
    const key2 = currentPageResolver.computeStaleKey(
      baseAppState({
        nodeTree: [...NODE_TREE, { id: 'extra', kind: 'element', name: 'div', props: {}, children: null }],
      }),
    );
    expect(key1).not.toBe(key2);
  });

  it('returns null stale key when no editable page is open', () => {
    expect(currentPageResolver.computeStaleKey(baseAppState({ pageInfo: null }))).toBeNull();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/currentPageResolver.test.js
~~~

Expected: FAIL — `currentPageResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/currentPageResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { summarizeNode } from './nodeTree.js';

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function pageRevisionKey(pageInfo, nodeTree) {
  if (!pageInfo?.editable) return null;
  const json = JSON.stringify({
    path: pageInfo.path,
    layoutName: pageInfo.layoutName,
    imports: pageInfo.imports,
    frontmatter: pageInfo.frontmatter,
    topLevelIds: (nodeTree || []).map((n) => n.id),
  });
  return hashString(json);
}

export const currentPageResolver = {
  type: CONTEXT_CHIP_TYPES.CURRENT_PAGE,
  label: 'Current page',

  isAvailable(appState) {
    return !!appState.pageInfo?.editable;
  },

  getDefaultOptions() {
    return {};
  },

  async resolve(appState) {
    const info = appState.pageInfo;
    if (!info?.editable) throw new Error('No editable page is open.');
    const imports = info.imports || [];
    const cmsDataSources = imports.filter((i) => /\.json$/i.test(i.path)).map((i) => i.path);
    const structure = (appState.nodeTree || []).map(summarizeNode);
    const data = {
      route: info.route,
      path: info.path,
      layoutName: info.layoutName || null,
      imports,
      cmsDataSources,
      frontmatter: info.frontmatter || '',
      structure,
    };
    const estimatedCharacters = JSON.stringify(data).length;
    return {
      data,
      estimatedCharacters,
      sourceRevision: `${info.path}:${pageRevisionKey(info, appState.nodeTree)}`,
    };
  },

  computeStaleKey(appState) {
    return pageRevisionKey(appState.pageInfo, appState.nodeTree);
  },

  renderMarkdown(snapshot) {
    const { route, path, layoutName, imports, cmsDataSources, frontmatter, structure } = snapshot.data;
    const lines = ['### Current page', ''];
    if (route) lines.push(`- Route: \`${route}\``);
    if (path) lines.push(`- Source: \`${path}\``);
    if (layoutName) lines.push(`- Layout: ${layoutName}`);
    if (imports.length > 0) lines.push(`- Imports: ${imports.map((i) => i.name).join(', ')}`);
    if (cmsDataSources.length > 0) lines.push(`- CMS data sources: ${cmsDataSources.join(', ')}`);
    if (frontmatter) {
      lines.push('', 'Frontmatter:', '', '```javascript', frontmatter, '```');
    }
    if (structure.length > 0) {
      lines.push('', 'Structure:');
      for (const node of structure) lines.push(`- ${node.kind}: ${node.label}`);
    }
    return lines.join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/currentPageResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/currentPageResolver.js src/context/currentPageResolver.test.js
rtk git commit -m "feat: add current-page context resolver"
~~~

## Task 7: Add the Current Component resolver

**Files:**

- Create: `src/context/currentComponentResolver.test.js`
- Create: `src/context/currentComponentResolver.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_TYPES` (Task 1), `findOwningComponent` (Task 3), `toProjectRelativePath` (Task 3).
- Produces: `currentComponentResolver` matching the resolver shape, plus `computeStaleKey`. `resolve(appState)` reuses `appState.selectedNode`/`nodeTree`/`componentDefinitions` (same fields Task 5 reads) to find the owning component, then reads its file through the existing Phase 1 `appState.readProjectFile(rel) -> Promise<{rel, content, size}>`.

- [ ] **Step 1: Write the failing test**

Create `src/context/currentComponentResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { currentComponentResolver } from './currentComponentResolver.js';

const TREE = [
  {
    id: 'hero',
    kind: 'component',
    name: 'HeroSection',
    props: {},
    children: [{ id: 'h1', kind: 'element', name: 'h1', props: {}, children: null }],
  },
];

const DEFINITIONS = [
  {
    name: 'HeroSection',
    path: '/projects/site/src/components/HeroSection.astro',
    schema: [{ name: 'title', type: 'string' }],
    slots: ['default'],
    instances: 3,
  },
];

function baseAppState(overrides = {}) {
  return {
    selectedNode: { id: 'h1', kind: 'element', name: 'h1' },
    nodeTree: TREE,
    componentDefinitions: DEFINITIONS,
    projectPath: '/projects/site',
    readProjectFile: vi.fn(async (rel) => ({ rel, content: `content of ${rel}` })),
    ...overrides,
  };
}

describe('currentComponentResolver', () => {
  it('is unavailable when nothing is selected', () => {
    expect(currentComponentResolver.isAvailable(baseAppState({ selectedNode: null }))).toBe(false);
  });

  it('is unavailable when the selection has no owning component', () => {
    expect(currentComponentResolver.isAvailable(baseAppState({ componentDefinitions: [] }))).toBe(false);
  });

  it('is available when the selection is inside a known component', () => {
    expect(currentComponentResolver.isAvailable(baseAppState())).toBe(true);
  });

  it('resolves the owning component, reading its file by project-relative path', async () => {
    const appState = baseAppState();
    const result = await currentComponentResolver.resolve(appState);
    expect(appState.readProjectFile).toHaveBeenCalledWith('src/components/HeroSection.astro');
    expect(result.data).toEqual({
      name: 'HeroSection',
      path: 'src/components/HeroSection.astro',
      isLayout: false,
      schema: [{ name: 'title', type: 'string' }],
      slots: ['default'],
      extendsTag: null,
      instances: 3,
      source: 'content of src/components/HeroSection.astro',
    });
  });

  it('rejects resolving when there is no owning component', async () => {
    await expect(currentComponentResolver.resolve(baseAppState({ selectedNode: null }))).rejects.toThrow(
      'The selection is not inside a known component.',
    );
  });

  it('renders name, file, usage, slots, props, and source as Markdown', () => {
    const snapshot = {
      data: {
        name: 'HeroSection',
        path: 'src/components/HeroSection.astro',
        isLayout: false,
        schema: [{ name: 'title', type: 'string' }],
        slots: ['default'],
        extendsTag: null,
        instances: 3,
        source: '---\nconst { title } = Astro.props;\n---\n<h1>{title}</h1>',
      },
    };
    const markdown = currentComponentResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current component');
    expect(markdown).toContain('Name: HeroSection');
    expect(markdown).toContain('`src/components/HeroSection.astro`');
    expect(markdown).toContain('Used 3 times in this project');
    expect(markdown).toContain('Slots: default');
    expect(markdown).toContain('Props: title (string)');
    expect(markdown).toContain('```astro');
    expect(markdown).toContain('<h1>{title}</h1>');
  });

  it('keys staleness on the owning component identity', () => {
    const appState = baseAppState();
    expect(currentComponentResolver.computeStaleKey(appState)).toBe(
      'HeroSection:/projects/site/src/components/HeroSection.astro',
    );
    expect(currentComponentResolver.computeStaleKey(baseAppState({ selectedNode: null }))).toBeNull();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/currentComponentResolver.test.js
~~~

Expected: FAIL — `currentComponentResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/currentComponentResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { findOwningComponent } from './nodeTree.js';
import { toProjectRelativePath } from './projectPaths.js';

function resolveOwner(appState) {
  if (!appState.selectedNode) return null;
  return findOwningComponent(appState.nodeTree || [], appState.selectedNode.id, appState.componentDefinitions || []);
}

export const currentComponentResolver = {
  type: CONTEXT_CHIP_TYPES.CURRENT_COMPONENT,
  label: 'Current component',

  isAvailable(appState) {
    return !!resolveOwner(appState);
  },

  getDefaultOptions() {
    return {};
  },

  async resolve(appState) {
    const owner = resolveOwner(appState);
    if (!owner) throw new Error('The selection is not inside a known component.');
    const rel = toProjectRelativePath(appState.projectPath, owner.definition.path);
    const file = await appState.readProjectFile(rel);
    const data = {
      name: owner.definition.name,
      path: rel,
      isLayout: !!owner.definition.isLayout,
      schema: owner.definition.schema || [],
      slots: owner.definition.slots || [],
      extendsTag: owner.definition.extendsTag || null,
      instances: owner.definition.instances ?? null,
      source: file.content,
    };
    return {
      data,
      estimatedCharacters: file.content.length,
      sourceRevision: `${rel}:${file.content.length}`,
    };
  },

  computeStaleKey(appState) {
    const owner = resolveOwner(appState);
    return owner ? `${owner.definition.name}:${owner.definition.path}` : null;
  },

  renderMarkdown(snapshot) {
    const { name, path, isLayout, schema, slots, extendsTag, instances, source } = snapshot.data;
    const lines = ['### Current component', ''];
    lines.push(`- Name: ${name}${isLayout ? ' (layout)' : ''}`);
    lines.push(`- File: \`${path}\``);
    if (typeof instances === 'number') {
      lines.push(`- Used ${instances} time${instances === 1 ? '' : 's'} in this project`);
    }
    if (extendsTag) lines.push(`- Extends: built-in \`<${extendsTag}>\` attributes`);
    if (slots.length > 0) lines.push(`- Slots: ${slots.join(', ')}`);
    if (schema.length > 0) {
      lines.push(
        `- Props: ${schema.map((f) => `${f.name} (${f.type}${f.optional ? ', optional' : ''})`).join(', ')}`,
      );
    }
    lines.push('', '```astro', source.trim(), '```');
    return lines.join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/currentComponentResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/currentComponentResolver.js src/context/currentComponentResolver.test.js
rtk git commit -m "feat: add current-component context resolver"
~~~

## Task 8: Register the new resolvers and thread editorContext through the chip bar

**Files:**

- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/panels/ContextChipBar.test.jsx`
- Modify: `src/panels/TerminalPanel.jsx:36, 482` (component signature and the `<ContextChipBar>` mount)
- Modify: `src/panels/TerminalPanel.test.jsx` (the `window.avb` mock in `beforeEach`, plus one new test)

**Interfaces:**

- Consumes: `selectedElementResolver` (Task 5), `currentPageResolver` (Task 6), `currentComponentResolver` (Task 7).
- Produces: `<ContextChipBar currentFile projectPath editorContext={{selectedNode, nodeTree, loopContext, componentDefinitions, pageInfo} | undefined} />` and `<TerminalPanel active currentFile projectPath editorContext />` — the `editorContext` prop Task 9 wires from `App.jsx`. Missing fields inside `editorContext` (or an omitted `editorContext` entirely) simply make the corresponding resolver's `isAvailable` return `false`, so every existing Phase 1 call site keeps working unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/panels/ContextChipBar.test.jsx`, add `serializeNode` to the `beforeEach` mock and add two new tests:

~~~jsx
beforeEach(() => {
  window.avb = {
    listContextFiles: vi.fn(async () => ({ files: ['src/pages/index.astro'] })),
    readContextFile: vi.fn(async ({ rel }) => ({ rel, content: `content of ${rel}`, size: 10 })),
    serializeNode: vi.fn(async ({ node }) => ({ markup: `<${node.name}></${node.name}>` })),
  };
});
~~~

Then, inside `describe('ContextChipBar', ...)`, add:

~~~jsx
  it('offers Selected element, Current page, and Current component only when editor context supports them', () => {
    const { rerender } = render(
      <ContextChipBar currentFile={null} projectPath="/projects/site" editorContext={{}} />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Selected element')).not.toBeInTheDocument();
    expect(screen.queryByText('Current page')).not.toBeInTheDocument();
    expect(screen.queryByText('Current component')).not.toBeInTheDocument();

    const selectedNode = { id: 'h1', kind: 'element', name: 'h1', props: {}, children: null };
    const nodeTree = [
      { id: 'hero', kind: 'component', name: 'HeroSection', props: {}, children: [selectedNode] },
    ];
    const componentDefinitions = [
      { name: 'HeroSection', path: '/projects/site/src/components/HeroSection.astro' },
    ];
    rerender(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{
          selectedNode,
          nodeTree,
          componentDefinitions,
          pageInfo: {
            editable: true,
            route: '/',
            path: 'src/pages/index.astro',
            layoutName: '',
            imports: [],
            frontmatter: '',
          },
        }}
      />,
    );
    expect(screen.getByText('Selected element')).toBeInTheDocument();
    expect(screen.getByText('Current page')).toBeInTheDocument();
    expect(screen.getByText('Current component')).toBeInTheDocument();
  });

  it('adds a Selected element chip and includes its serialized markup in the composed prompt', async () => {
    const selectedNode = { id: 'h1', kind: 'element', name: 'h1', props: {}, children: null };
    render(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{ selectedNode, nodeTree: [selectedNode], componentDefinitions: [] }}
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Selected element'));
    await waitFor(() => expect(screen.getByText('Selected element')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix this.' } });
    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));
    expect(listener.mock.calls[0][0].detail.text).toContain('<h1></h1>');
    window.removeEventListener('stacki:terminal-menu', listener);
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: FAIL — the three new resolvers aren't registered, and `ContextChipBar` doesn't accept an `editorContext` prop yet.

- [ ] **Step 3: Register the resolvers and merge editorContext into appState**

In `src/panels/ContextChipBar.jsx`, add the three imports after the existing resolver imports and register them alongside Phase 1's two:

~~~js
import { selectedElementResolver } from '../context/selectedElementResolver.js';
import { currentPageResolver } from '../context/currentPageResolver.js';
import { currentComponentResolver } from '../context/currentComponentResolver.js';
~~~

~~~js
registerResolver(currentFileResolver);
registerResolver(selectedFilesResolver);
registerResolver(selectedElementResolver);
registerResolver(currentPageResolver);
registerResolver(currentComponentResolver);

const EMPTY_EDITOR_CONTEXT = {};
~~~

Change the component signature and the `appState` memo:

~~~js
export default function ContextChipBar({ currentFile, projectPath, editorContext = EMPTY_EDITOR_CONTEXT }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsId, setDetailsId] = useState(null);

  const appState = useMemo(
    () => ({
      currentFile,
      projectPath,
      ...editorContext,
      readProjectFile: (rel) => window.avb.readContextFile({ projectPath, rel }),
      listProjectFiles: async () => (await window.avb.listContextFiles({ projectPath })).files,
      serializeNode: async (node) => (await window.avb.serializeNode({ node })).markup,
    }),
    [currentFile, projectPath, editorContext],
  );
~~~

The rest of `ContextChipBar.jsx` is unchanged — `availableResolvers`, the picker, the chip list, and the prompt/send row already work generically over whatever resolvers are registered.

- [ ] **Step 4: Thread editorContext through TerminalPanel**

In `src/panels/TerminalPanel.jsx`, change the component signature (line 36):

~~~js
export default function TerminalPanel({ active, currentFile, projectPath, editorContext }) {
~~~

And the `<ContextChipBar>` mount (line 482):

~~~jsx
      <ContextChipBar currentFile={currentFile} projectPath={projectPath} editorContext={editorContext} />
~~~

- [ ] **Step 5: Add serializeNode to TerminalPanel's window.avb mock, and a threading test**

In `src/panels/TerminalPanel.test.jsx`, add to the `window.avb` object inside `beforeEach` (alongside the existing `listContextFiles`/`readContextFile`):

~~~js
    serializeNode: vi.fn(async ({ node }) => ({ markup: `<${node.name}></${node.name}>` })),
~~~

Then add a new test inside `describe('TerminalPanel sizing and terminal menu', ...)` (or any existing `describe` block — it exercises rendering, not sizing specifically, so a new small `describe` is also fine):

~~~jsx
describe('TerminalPanel editor context', () => {
  it('threads editorContext through to the context chip bar', async () => {
    const selectedNode = { id: 'h1', kind: 'element', name: 'h1', props: {}, children: null };
    render(
      <TerminalPanel
        active
        editorContext={{ selectedNode, nodeTree: [selectedNode], componentDefinitions: [] }}
      />,
    );
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.getByText('Selected element')).toBeInTheDocument();
  });
});
~~~

- [ ] **Step 6: Run tests and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx src/panels/TerminalPanel.test.jsx
~~~

Expected: all tests pass, including every pre-existing test in both files (rendering `<TerminalPanel active />` with no `editorContext` at all must still work — `ContextChipBar`'s default parameter covers that).

- [ ] **Step 7: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx src/panels/TerminalPanel.jsx src/panels/TerminalPanel.test.jsx
rtk git commit -m "feat: register phase-2 resolvers and thread editor context into the terminal panel"
~~~

## Task 9: Wire App.jsx to the visual-editor context

**Files:**

- Modify: `src/App.jsx` (new block after the existing `currentFileContext` derivation at `src/App.jsx:2024-2035`; mount-site update at `src/App.jsx:2262-2269`)

**Interfaces:**

- Consumes: existing `selectedNode` (`src/App.jsx:1886-1891`), `model` (`src/App.jsx:1875`), `currentPage` (state), `currentLayoutName` (`src/App.jsx:1896-1902`), `insertables` (`src/App.jsx:408-411`), `loopContext` (`src/App.jsx:1948-1958`), `project` (state), and the existing module-scope `toProjectRelativePath` (`src/App.jsx:341-349`) — none of these change.
- Produces: an `editorContext` value of shape `{selectedNode, nodeTree, loopContext, componentDefinitions, pageInfo}`, passed to `<TerminalPanel editorContext={editorContext} />`.

- [ ] **Step 1: Derive editorContext**

In `src/App.jsx`, immediately after the existing `currentFileContext` block (ends at `src/App.jsx:2035`, right before `const openCodeWindow = () => {`):

~~~js
  // What the Selected Element / Current Page / Current Component context
  // chips read: the raw node tree, the current selection (excluding the
  // synthetic frontmatter pseudo-node, which isn't a real visual element),
  // the page's editable-model info, and every known component/layout
  // definition for "which component owns this node" lookups.
  const editorContext = {
    selectedNode: selectedNode && selectedNode.kind !== 'frontmatter' ? selectedNode : null,
    nodeTree: model?.nodes ?? [],
    loopContext,
    componentDefinitions: insertables,
    pageInfo: model
      ? {
          editable: true,
          route: currentPage?.route ?? null,
          path: toProjectRelativePath(currentPage?.path ?? null, project?.path ?? null),
          layoutName: currentLayoutName,
          imports: model.imports || [],
          frontmatter: model.extraFrontmatter || '',
        }
      : null,
  };
~~~

- [ ] **Step 2: Pass editorContext to TerminalPanel**

At the existing mount site (`src/App.jsx:2262-2269`):

~~~jsx
        {terminalMounted && (
          <TerminalPanel
            key={project.path}
            active={leftTab === 'terminal'}
            currentFile={currentFileContext}
            projectPath={project.path}
            editorContext={editorContext}
          />
        )}
~~~

- [ ] **Step 3: Verify and commit**

Run:

~~~bash
rtk npm test
rtk npm run build
~~~

Expected: the full suite passes and the renderer builds. (`App.jsx` has no per-feature unit tests of its own, matching Phase 1's Task 15 precedent — the new resolvers and the chip bar's use of `editorContext` are already covered by Tasks 5–8's unit and integration tests; this step confirms App.jsx's own wiring compiles and doesn't break anything else.)

Commit:

~~~bash
rtk git add src/App.jsx
rtk git commit -m "feat: attach the visual editor's selection, page, and component context to the terminal"
~~~

## Task 10: Full verification pass

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

1. Open an Astro project, select a node on the canvas (e.g. a heading inside a placed component), and open the Terminal panel.
2. Click **+ Add context** and confirm **Selected element**, **Current page**, and **Current component** are all offered (in addition to Phase 1's **Current file** and **Selected files**).
3. Click **Selected element**; confirm a chip appears, briefly resolving, then settling on the element's label. Open its details popover and confirm it shows an ancestor path, the owning component (if any), and a fenced `astro` code block with the element's real serialized markup (not a JSON dump).
4. Select a different element on the canvas and confirm the still-attached **Selected element** chip switches to its "Updated" stale indicator; click **Refresh** and confirm it re-resolves to the new selection.
5. Click **+ Add context → Current page**; confirm the chip's details show the route, source path, layout name, imports, and a top-level structure list. Edit the page (e.g. add a node) and confirm the chip goes stale.
6. With a component instance selected on the canvas (or an element nested inside one), click **+ Add context → Current component**; confirm the chip's details show the component's name, file path, usage count, slots, prop schema, and its real source code.
7. Select an element with no owning component (e.g. directly under the page with no layout) and confirm **Current component** disappears from **+ Add context** — no chip is offered when there's no known owner.
8. Type a request, click **Insert into terminal**, and confirm the composed Markdown includes a `## Stacki context` section per attached chip, each with its own `###` heading, in the order the chips were added.
9. Switch to a different project and confirm the chip bar resets (no stale selection/page/component chips carried over).

Expected: every step behaves as described, with no console errors and no unexpected `window.avb` calls.

- [ ] **Step 3: Confirm final scope and history**

Run:

~~~bash
rtk git status --short --branch
rtk git log --oneline --decorate -12
~~~

Expected: the implementation worktree is clean, and the log shows one focused commit per task in this plan, with no unrelated files included.
