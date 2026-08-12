# Component View Selection and Blue Outlines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make nodes declared inside an Astro component selectable from Stacki's live component view, with blue hover and selected outlines scoped to that view.

**Architecture:** Marker-transform every editable Astro file under `src`, identify marker regions by canonical project-relative file scope plus local node path, and let the iframe report both the active component hit and the enclosing page hit. `PreviewPane` tracks component-local rectangles separately from the page-level focus rectangle, while `App` resolves only active-scope paths against the currently loaded model.

**Tech Stack:** Electron 33 preload scripts, Astro/Vite development plugin, React 18, TypeScript, Zustand, Vitest, Testing Library, jsdom, CSS.

---

## Working-Tree Constraints

The implementation starts in a dirty checkout. Preserve every pre-existing edit. In particular, `electron/preload.js`, `src/App.tsx`, `src/panels/PreviewPane.tsx`, `src/styles.css`, and `src/App.test.jsx` already contain changes from adjacent work. Never restore or replace those files wholesale. Apply narrow patches and stage only the files named in each task.

Before Task 1, run:

```bash
rtk git status --short --branch
rtk git diff -- electron/preload.js src/App.tsx src/panels/PreviewPane.tsx src/styles.css src/App.test.jsx
```

Expected: the current dirty files remain visible, including the existing Terminal selection fix and hidden-node preview work. Save this output as the overlap baseline; do not clean it.

## File Map

- Create `electron/astroParser.test.js`: regression coverage for scoped Astro and raw-HTML marker serialization.
- Modify `electron/astroParser.js`: emit scope-aware marker boundaries and compute canonical project-relative scopes.
- Modify `electron/main.js`: marker-transform all editable Astro files below `src`, not only pages, and pass scopes through raw chunk imports.
- Create `electron/previewMarkerRuntime.js`: own composite marker identities, DOM marker collection, hit-testing, occurrence tracking, rectangles, and hidden-subtree token lookup.
- Create `electron/previewMarkerRuntime.test.js`: jsdom coverage for nested page/component scopes, cloned DOM, occurrences, and rectangles.
- Modify `electron/preload.js`: use the marker runtime and send scoped preview messages.
- Create `src/model/previewScope.ts`: normalize renderer-side absolute file paths to the same project-relative scope used by the Vite plugin.
- Create `src/model/previewScope.test.ts`: macOS, Windows, outside-root, and missing-path coverage.
- Modify `src/panels/PreviewPane.tsx`: send active/page scopes, keep focus rectangles separate, and expose scoped node events.
- Create `src/panels/PreviewPane.selection.test.tsx`: component-scope tracking and message-handling coverage.
- Modify `src/App.tsx`: resolve canvas events against the active model and retain outside-focus exit behavior.
- Modify `src/App.test.jsx`: integration coverage for component-local selection, nested component opening, outside-click exit, and Terminal persistence.
- Modify `src/styles.css`: force all component-view hover/selection treatments to the existing accent blue.
- Modify `src/styles.test.js`: lock component-view color overrides without changing page-view colors.

### Task 1: Serialize Astro Markers with File Scopes

**Files:**
- Create: `electron/astroParser.test.js`
- Modify: `electron/astroParser.js:509-568`
- Modify: `electron/astroParser.js:835-862`
- Modify: `electron/main.js:1952-2014`

- [ ] **Step 1: Write failing scope serialization tests**

Create `electron/astroParser.test.js`:

```js
// @vitest-environment node

import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  markChunkHtml,
  parsePage,
  previewScopeFromFile,
  serializePageMarked,
} = require('./astroParser.js');

describe('scoped preview markers', () => {
  it('puts the same project-relative scope on both boundaries of every node', () => {
    const parsed = parsePage(`---\nconst title = 'Hello';\n---\n<section><h2>{title}</h2></section>\n`);
    expect(parsed.editable).toBe(true);

    const marked = serializePageMarked(parsed.model, 'src/components/Hero.astro');

    expect(marked).toContain(
      '<template data-avb-s="0" data-avb-scope="src/components/Hero.astro"></template>',
    );
    expect(marked).toContain(
      '<template data-avb-e="0.0" data-avb-scope="src/components/Hero.astro"></template>',
    );
  });

  it('escapes a scope before inserting it into marker attributes', () => {
    const parsed = parsePage('---\n---\n<div />\n');
    const marked = serializePageMarked(parsed.model, 'src/components/A&B"Card.astro');

    expect(marked).toContain('data-avb-scope="src/components/A&amp;B&quot;Card.astro"');
  });

  it('passes the encoded scope through raw HTML imports', () => {
    const parsed = parsePage(`---\nimport body from './body.html?raw';\n---\n<Fragment set:html={body} />\n`);
    const marked = serializePageMarked(parsed.model, 'src/components/Article.astro');

    expect(marked).toContain(
      './body.html?raw&avb=0&avbs=src%2Fcomponents%2FArticle.astro',
    );
  });

  it('uses the owning Astro scope for markers inside raw HTML chunks', () => {
    const marked = markChunkHtml(
      '<article><p>Body</p></article>',
      '0',
      false,
      'src/components/Article.astro',
    );

    expect(marked).toContain(
      '<template data-avb-s="0.0" data-avb-scope="src/components/Article.astro"></template>',
    );
  });
});

describe('previewScopeFromFile', () => {
  it('returns a forward-slash project-relative scope', () => {
    const root = path.resolve('/projects/site');
    const file = path.join(root, 'src', 'components', 'Hero.astro');

    expect(previewScopeFromFile(root, file)).toBe('src/components/Hero.astro');
  });

  it('rejects files outside the project root', () => {
    expect(
      previewScopeFromFile(path.resolve('/projects/site'), path.resolve('/projects/other.astro')),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the parser tests and verify RED**

Run:

```bash
rtk npm test -- electron/astroParser.test.js
```

Expected: FAIL because `previewScopeFromFile` is not exported, `serializePageMarked` does not accept or emit a scope, and `markChunkHtml` does not emit scoped markers.

- [ ] **Step 3: Implement scoped serialization**

In `electron/astroParser.js`, add the path helper near the marker serializer:

```js
/** @param {string} projectPath @param {string} filePath @returns {string | null} */
function previewScopeFromFile(projectPath, filePath) {
  const root = path.resolve(projectPath);
  const file = path.resolve(filePath);
  const rel = path.relative(root, file);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** @param {string} value @returns {string} */
function escapeMarkerAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function markerBoundary(edge, pathValue, scope, slotAttr = '') {
  return `<template${slotAttr} data-avb-${edge}="${pathValue}" data-avb-scope="${escapeMarkerAttr(scope)}"></template>`;
}
```

Change the marker serializers to carry `scope` through every recursive call:

```js
/** @param {PageModel} model @param {string} scope @returns {string} */
function serializePageMarked(model, scope) {
  const marks = chunkImportMarks(model);
  const lines = ['---'];
  for (const imp of model.imports) {
    const mark = /\.html\?raw$/i.test(imp.path) ? marks.get(imp.name) : null;
    const spec = mark
      ? `${imp.path}&avb=${mark.path}&avbs=${encodeURIComponent(scope)}${mark.group ? '&avbg=1' : ''}`
      : imp.path;
    lines.push(`import ${imp.name} from '${spec}';`);
  }
  if (model.extraFrontmatter) lines.push('', model.extraFrontmatter);
  lines.push('---');
  model.nodes.forEach((node, i) => serializeNodeMarked(node, '', lines, String(i), scope));
  return lines.join('\n') + '\n';
}
```

Replace `serializeNodeMarked` with the scoped form below and export `previewScopeFromFile` with the other parser functions:

```js
function serializeNodeMarked(node, indent, lines, pathValue, scope) {
  if (node.kind === 'chunk-group') return;
  const n = node;
  const slotVal = n.props?.slot;
  const slotAttr =
    slotVal && slotVal.type === 'string' && slotVal.value ? ` slot="${slotVal.value}"` : '';
  lines.push(`${indent}${markerBoundary('s', pathValue, scope, slotAttr)}`);
  if (
    (n.kind === 'component' || n.kind === 'element') &&
    !n.chunkFile &&
    !n.chunkAggregate &&
    Array.isArray(n.children) &&
    !(n.children.length > 0 && isInlineRun(n.children))
  ) {
    const attrs = serializeAttrs(n.props);
    lines.push(`${indent}<${n.name}${attrs}>`);
    n.children.forEach((child, index) =>
      serializeNodeMarked(child, indent + '  ', lines, `${pathValue}.${index}`, scope)
    );
    lines.push(`${indent}</${n.name}>`);
  } else if (node.kind === 'map') {
    lines.push(indent + '{');
    lines.push(indent + '  ' + node.head);
    (node.children || []).forEach((child, index) =>
      serializeNodeMarked(child, indent + '    ', lines, `${pathValue}.${index}`, scope)
    );
    lines.push(indent + '  ))');
    lines.push(indent + '}');
  } else {
    serializeNode(node, indent, lines);
  }
  lines.push(`${indent}${markerBoundary('e', pathValue, scope, slotAttr)}`);
}

function markChunkHtml(source, prefix, group, scope) {
  const { nodes, clean } = parseTemplate(source);
  if (!clean) return null;
  const lines = [];
  if (group) lines.push(markerBoundary('s', prefix, scope));
  nodes.forEach((node, index) =>
    serializeNodeMarked(node, '', lines, `${prefix}.${index}`, scope)
  );
  if (group) lines.push(markerBoundary('e', prefix, scope));
  return lines.join('\n') + '\n';
}
```

In the generated config inside `electron/main.js`, replace the page-only boundary with the project source boundary and pass the scope:

```js
const {
  parsePage,
  serializePageMarked,
  resolveChunks,
  markChunkHtml,
  previewScopeFromFile,
} = require(${JSON.stringify(parserPath)});
const PROJECT_DIR = ${JSON.stringify(toPosix(projectPath))};
const SRC_DIR = ${JSON.stringify(toPosix(path.join(projectPath, 'src')))};
```

Replace query parsing and the Astro-file guard in the generated `load(id)` implementation with:

```js
const params = new URLSearchParams(query);
const chunkPath = params.get('avb');
const chunkScope = params.get('avbs');
if (query && chunkPath && chunkScope) {
  try {
    const marked = markChunkHtml(
      readFileSync(file, 'utf8'),
      chunkPath,
      params.get('avbg') === '1',
      chunkScope,
    );
    return marked == null ? null : 'export default ' + JSON.stringify(marked) + ';';
  } catch {
    return null;
  }
}
if (query) return null;
if (!file.endsWith('.astro') || !file.startsWith(SRC_DIR + '/')) return null;
try {
  const scope = previewScopeFromFile(PROJECT_DIR, file);
  if (!scope) return null;
  const parsed = parsePage(readFileSync(file, 'utf8'));
  if (!parsed.editable) return null;
  resolveChunks(parsed.model, file);
  return serializePageMarked(parsed.model, scope);
} catch {
  return null;
}
```

- [ ] **Step 4: Run focused tests and Electron syntax checks**

Run:

```bash
rtk npm test -- electron/astroParser.test.js
rtk npm run check:electron
```

Expected: parser tests PASS; all Electron syntax checks PASS.

- [ ] **Step 5: Commit only scoped serialization files**

```bash
rtk git add electron/astroParser.js electron/astroParser.test.js electron/main.js
rtk git commit -m "feat: scope Astro preview markers"
```

### Task 2: Build a Testable Scoped Marker Runtime

**Files:**
- Create: `electron/previewMarkerRuntime.js`
- Create: `electron/previewMarkerRuntime.test.js`
- Modify: `electron/preload.js:210-505`

- [ ] **Step 1: Write failing marker-runtime tests**

Create `electron/previewMarkerRuntime.test.js` with `// @vitest-environment jsdom`. Build nested page/component markers in `document.body`, call `createPreviewMarkerRegistry(document).collect()`, and assert:

```js
expect(registry.nodeAt(button, 'src/components/Hero.astro')).toMatchObject({
  scope: 'src/components/Hero.astro',
  path: '0.0',
  occurrence: 0,
});
expect(registry.nodeAt(button, 'src/pages/index.astro')).toMatchObject({
  scope: 'src/pages/index.astro',
  path: '0',
  occurrence: 0,
});
```

The fixture must use this complete nesting order so both scopes own the same rendered button:

```html
<template data-avb-s="0" data-avb-scope="src/pages/index.astro"></template>
<template data-avb-s="0" data-avb-scope="src/components/Hero.astro"></template>
<template data-avb-s="0.0" data-avb-scope="src/components/Hero.astro"></template>
<button id="hero-button">Start</button>
<template data-avb-e="0.0" data-avb-scope="src/components/Hero.astro"></template>
<template data-avb-e="0" data-avb-scope="src/components/Hero.astro"></template>
<template data-avb-e="0" data-avb-scope="src/pages/index.astro"></template>
```

Add separate tests that:

- clone `#hero-button` after collection and prove both scope tokens survive on the clone;
- create two occurrences of component path `0.0` and prove `occurrence` is `1` for the second;
- stub `getBoundingClientRect()` and prove `rectsFor(scope, path)` returns only that scope's rectangle;
- prove `markerTokensForSubtrees(componentScope, ['0'])` excludes the page token.

- [ ] **Step 2: Run the runtime test and verify RED**

```bash
rtk npm test -- electron/previewMarkerRuntime.test.js
```

Expected: FAIL because `electron/previewMarkerRuntime.js` does not exist.

- [ ] **Step 3: Implement the marker registry**

Create `electron/previewMarkerRuntime.js` as a CommonJS module with this public API:

```js
// @ts-check
const MARKER_ATTR = 'data-avb-m';

function markerKey(scope, path) {
  return `${scope}\u0000${path}`;
}

function markerToken(scope, path) {
  return `${encodeURIComponent(scope)}@${path}`;
}

function createPreviewMarkerRegistry(document) {
  const regions = new Map();

  function addToken(element, scope, path) {
    const token = markerToken(scope, path);
    const tokens = new Set((element.getAttribute(MARKER_ATTR) || '').split(/\s+/).filter(Boolean));
    tokens.add(token);
    element.setAttribute(MARKER_ATTR, [...tokens].join(' '));
  }

  function collect() {
    const starts = document.querySelectorAll('template[data-avb-s][data-avb-scope]');
    for (const start of starts) {
      const path = start.getAttribute('data-avb-s');
      const scope = start.getAttribute('data-avb-scope');
      if (!path || !scope) continue;
      const run = [];
      for (let node = start.nextSibling; node; node = node.nextSibling) {
        const isEnd =
          node.nodeType === 1 &&
          node.tagName === 'TEMPLATE' &&
          node.getAttribute('data-avb-e') === path &&
          node.getAttribute('data-avb-scope') === scope;
        if (isEnd) break;
        run.push(node);
        if (node.nodeType === 1 && node.tagName !== 'TEMPLATE') addToken(node, scope, path);
      }
      const key = markerKey(scope, path);
      if (!regions.has(key)) regions.set(key, []);
      regions.get(key).push(run);
    }
    document
      .querySelectorAll('template[data-avb-s], template[data-avb-e]')
      .forEach((template) => template.remove());
  }

  function taggedPath(target, scope) {
    let element = target instanceof Element ? target : target?.parentElement || null;
    const prefix = `${encodeURIComponent(scope)}@`;
    while (element) {
      const token = (element.getAttribute(MARKER_ATTR) || '')
        .split(/\s+/)
        .find((candidate) => candidate.startsWith(prefix));
      if (token) return token.slice(prefix.length);
      element = element.parentElement;
    }
    return null;
  }

  function occurrenceOf(scope, path, target) {
    const runs = regions.get(markerKey(scope, path));
    if (!runs || runs.length < 2) return 0;
    for (let index = 0; index < runs.length; index += 1) {
      if (runs[index].some((node) =>
        node.isConnected &&
        (node === target || (node.nodeType === 1 && node.contains(target)))
      )) return index;
    }
    return 0;
  }

  function nodeAt(target, scope) {
    if (!scope) return null;
    let best = taggedPath(target, scope);
    let bestDepth = best ? best.split('.').length : -1;
    for (const [key, runs] of regions) {
      const [regionScope, path] = key.split('\u0000');
      if (regionScope !== scope || path.split('.').length <= bestDepth) continue;
      const hit = runs.some((run) => run.some((node) =>
        node.isConnected &&
        node.nodeType === 1 &&
        (node === target || node.contains(target))
      ));
      if (hit) {
        best = path;
        bestDepth = path.split('.').length;
      }
    }
    return best ? { scope, path: best, occurrence: occurrenceOf(scope, best, target) } : null;
  }

  function addNode(acc, node) {
    if (!node.isConnected) return acc;
    let box = null;
    if (node.nodeType === 1) {
      if (node.tagName === 'TEMPLATE') return acc;
      box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        for (const child of node.childNodes) acc = addNode(acc, child);
        return acc;
      }
    } else if (node.nodeType === 3 && node.textContent.trim()) {
      const range = document.createRange();
      range.selectNode(node);
      box = range.getBoundingClientRect();
    }
    if (!box || (box.width === 0 && box.height === 0)) return acc;
    if (!acc) return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    return {
      left: Math.min(acc.left, box.left),
      top: Math.min(acc.top, box.top),
      right: Math.max(acc.right, box.right),
      bottom: Math.max(acc.bottom, box.bottom),
    };
  }

  function rectsFor(scope, path) {
    const runs = regions.get(markerKey(scope, path));
    if (!runs) return null;
    const toRect = (box) => ({
      x: box.left,
      y: box.top,
      w: box.right - box.left,
      h: box.bottom - box.top,
    });
    if (runs.length === 1) {
      let box = runs[0].reduce(addNode, null);
      const token = markerToken(scope, path);
      for (const element of document.querySelectorAll(`[${MARKER_ATTR}~="${token}"]`)) {
        box = addNode(box, element);
      }
      return box ? [toRect(box)] : null;
    }
    const rects = runs
      .map((run) => run.reduce(addNode, null))
      .filter(Boolean)
      .map(toRect);
    return rects.length ? rects : null;
  }

  function markerTokensForSubtrees(scope, paths) {
    const tokens = [];
    for (const key of regions.keys()) {
      const [regionScope, path] = key.split('\u0000');
      if (regionScope !== scope) continue;
      if (paths.some((root) => path === root || path.startsWith(`${root}.`))) {
        tokens.push(markerToken(scope, path));
      }
    }
    return tokens;
  }

  return { collect, markerTokensForSubtrees, nodeAt, rectsFor };
}

module.exports = { MARKER_ATTR, createPreviewMarkerRegistry, markerKey, markerToken };
```

- [ ] **Step 4: Verify the marker runtime GREEN**

```bash
rtk npm test -- electron/previewMarkerRuntime.test.js
```

Expected: all marker runtime tests PASS.

- [ ] **Step 5: Integrate the registry into the iframe preload**

At the top of `electron/preload.js`, import:

```js
const { createPreviewMarkerRegistry, MARKER_ATTR } = require('./previewMarkerRuntime');
```

Inside the iframe branch, replace the local `regions`, collection, hit-testing, occurrence, and rectangle helpers with one registry:

```js
const markerRegistry = createPreviewMarkerRegistry(document);
let activeScope = null;
let pageScope = null;
let trackedPaths = [];
let focusPath = null;
let hiddenPaths = [];
```

`startOutlines()` must call `markerRegistry.collect()` once. `sendRects()` must report active and focus rectangles separately:

```js
const sendRects = () => {
  if (!activeScope) return;
  const rects = {};
  for (const path of trackedPaths) rects[path] = markerRegistry.rectsFor(activeScope, path);
  const focusRects =
    pageScope && focusPath ? markerRegistry.rectsFor(pageScope, focusPath) : null;
  window.parent.postMessage({ type: 'avb:rects', rects, focusRects }, '*');
};
```

Mousemove, click, and double-click must resolve both scopes and send this event shape:

```js
const activeHit = markerRegistry.nodeAt(e.target, activeScope);
const pageHit = markerRegistry.nodeAt(e.target, pageScope);
window.parent.postMessage({
  type: 'avb:click-node',
  scope: activeHit?.scope || activeScope,
  path: activeHit?.path || null,
  pagePath: pageHit?.path || null,
  occurrence: activeHit?.occurrence || 0,
}, '*');
```

Use the same fields for `avb:hover-node` and `avb:open-node`. Keep existing event prevention and design-mode guards.

Handle the new tracking message without changing the interactive-preview boundary:

```js
if (d?.type === 'avb:track' && Array.isArray(d.paths)) {
  designMode = true;
  activeScope = typeof d.activeScope === 'string' ? d.activeScope : null;
  pageScope = typeof d.pageScope === 'string' ? d.pageScope : activeScope;
  trackedPaths = d.paths;
  focusPath = typeof d.focusPath === 'string' ? d.focusPath : null;
  hiddenPaths = Array.isArray(d.hiddenPaths) ? d.hiddenPaths : [];
  updateHiddenStyles();
  sendRects();
}
```

Build hidden selectors from `markerRegistry.markerTokensForSubtrees(activeScope, hiddenPaths)` and `[${MARKER_ATTR}~="token"]`. Scroll using `markerRegistry.rectsFor(activeScope, path)`.

- [ ] **Step 6: Run runtime tests and Electron checks**

```bash
rtk npm test -- electron/previewMarkerRuntime.test.js
rtk npm run check:electron
```

Expected: all focused tests and syntax checks PASS.

- [ ] **Step 7: Commit only marker-runtime files**

```bash
rtk git add electron/previewMarkerRuntime.js electron/previewMarkerRuntime.test.js
rtk git add -p electron/preload.js
rtk git diff --cached --check
rtk git diff --cached -- electron/preload.js
rtk git commit -m "feat: resolve scoped preview marker hits"
```

Expected staged preload diff: scoped marker-runtime integration only. Exclude unrelated pre-existing hunks from the overlap baseline.

### Task 3: Track Active Component and Page Scopes in PreviewPane

**Files:**
- Create: `src/model/previewScope.ts`
- Create: `src/model/previewScope.test.ts`
- Create: `src/panels/PreviewPane.selection.test.tsx`
- Modify: `src/panels/PreviewPane.tsx:69-220`
- Modify: `src/panels/PreviewPane.tsx:381-415`

- [ ] **Step 1: Write failing renderer scope tests**

Create `src/model/previewScope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toPreviewScope } from './previewScope';

describe('toPreviewScope', () => {
  it('normalizes a macOS project path', () => {
    expect(toPreviewScope('/work/site/src/components/Hero.astro', '/work/site'))
      .toBe('src/components/Hero.astro');
  });

  it('normalizes Windows separators', () => {
    expect(toPreviewScope('C:\\work\\site\\src\\components\\Hero.astro', 'C:\\work\\site'))
      .toBe('src/components/Hero.astro');
  });

  it('rejects a sibling path with the same root prefix', () => {
    expect(toPreviewScope('/work/site-old/Hero.astro', '/work/site')).toBeNull();
  });

  it('returns null when either path is absent', () => {
    expect(toPreviewScope(null, '/work/site')).toBeNull();
    expect(toPreviewScope('/work/site/src/pages/index.astro', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run scope tests and verify RED**

```bash
rtk npm test -- src/model/previewScope.test.ts
```

Expected: FAIL because `src/model/previewScope.ts` does not exist.

- [ ] **Step 3: Implement renderer scope normalization**

Create `src/model/previewScope.ts`:

```ts
export function toPreviewScope(
  filePath: string | null | undefined,
  projectRoot: string | null | undefined,
): string | null {
  if (!filePath || !projectRoot) return null;
  const file = filePath.replace(/\\/g, '/');
  const root = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!file.startsWith(`${root}/`)) return null;
  return file.slice(root.length + 1);
}
```

Run the test again and expect PASS.

- [ ] **Step 4: Write failing PreviewPane protocol tests**

Create `src/panels/PreviewPane.selection.test.tsx`. Seed the Zustand store with `devUrl`, `devStatus: 'running'`, `device: 'desktop'`, and an editable model. Render `PreviewPane` with:

```tsx
<PreviewPane
  route="/"
  activeScope="src/components/Hero.astro"
  pageScope="src/pages/index.astro"
  focusPath="0.1"
  selPath="0.0"
  overlayInfo={() => ({
    label: 'button',
    kind: 'element',
    tag: 'button',
    nodeKind: 'element',
    isLayout: false,
    bound: false,
  })}
  onSelectNode={onSelectNode}
/>
```

After firing the iframe `load` event, spy on `iframe.contentWindow.postMessage` and expect an `avb:track` message containing:

```js
expect.objectContaining({
  type: 'avb:track',
  activeScope: 'src/components/Hero.astro',
  pageScope: 'src/pages/index.astro',
  paths: ['0.0'],
  focusPath: '0.1',
})
```

Dispatch a scoped `avb:click-node` message from that iframe and assert `onSelectNode` receives the complete hit. Dispatch this rectangle message, then assert one `.node-outline.sel` and one `.node-focus` render from their separate rectangle sets:

```js
{
  type: 'avb:rects',
  rects: { '0.0': [{ x: 10, y: 20, w: 100, h: 40 }] },
  focusRects: [{ x: 0, y: 0, w: 300, h: 200 }],
}
```

- [ ] **Step 5: Run the PreviewPane test and verify RED**

```bash
rtk npm test -- src/panels/PreviewPane.selection.test.tsx
```

Expected: FAIL because `PreviewPane` does not accept scopes or `onSelectNode`, and focus rectangles still share the active `rects` map.

- [ ] **Step 6: Implement the scoped PreviewPane protocol**

Export the event type and update props in `src/panels/PreviewPane.tsx`:

```ts
export interface PreviewNodeHit {
  scope: string | null;
  path: string | null;
  pagePath: string | null;
  occurrence: number;
}

interface PreviewPaneProps {
  activeScope?: string | null;
  pageScope?: string | null;
  onSelectNode?: (hit: PreviewNodeHit) => void;
  onOpenNode?: (hit: PreviewNodeHit) => void;
}
```

Add these four members to the existing interface; preserve all existing route, breadcrumb, refresh, device, overlay, and frame-mount members exactly as they are.

Add `focusRects` state. Accept scoped hover, click, and open messages only from the current iframe. A hover whose `scope !== activeScope` clears the component-local hover instead of displaying a page marker.

Send tracking data as:

```ts
w.postMessage({
  type: 'avb:track',
  activeScope,
  pageScope,
  paths: trackKey ? trackKey.split('|') : [],
  focusPath,
  hiddenPaths,
}, '*');
```

Render `.node-focus` from `focusRects`. Continue rendering hover/selection from the active `rects` map. Reset both maps and canvas hover when URL, refresh key, or active scope changes. Preserve click occurrence selection and scroll behavior.

- [ ] **Step 7: Verify renderer protocol GREEN**

```bash
rtk npm test -- src/model/previewScope.test.ts src/panels/PreviewPane.selection.test.tsx src/panels/storeConnected.test.tsx
```

Expected: all focused renderer tests PASS.

- [ ] **Step 8: Commit renderer protocol files**

```bash
rtk git add src/model/previewScope.ts src/model/previewScope.test.ts src/panels/PreviewPane.selection.test.tsx
rtk git add -p src/panels/PreviewPane.tsx
rtk git diff --cached --check
rtk git diff --cached -- src/panels/PreviewPane.tsx
rtk git commit -m "feat: track component preview scopes"
```

Expected staged PreviewPane diff: scoped event/rectangle protocol only. Exclude unrelated pre-existing hidden-node hunks from the overlap baseline.

### Task 4: Select Component-Local Nodes in App

**Files:**
- Modify: `src/App.test.jsx:1-260`
- Modify: `src/App.tsx:118-126`
- Modify: `src/App.tsx:1699-1750`
- Modify: `src/App.tsx:1901-1935`

- [ ] **Step 1: Write a failing component-view integration test**

Extend `src/App.test.jsx` with this fixture whose page contains `About`, whose `About` source contains a heading and nested `Card`, and whose `Card` source contains an article:

```js
function setupComponentPage() {
  const pagePath = '/projects/one/src/pages/index.astro';
  const aboutPath = '/projects/one/src/components/About.astro';
  const cardPath = '/projects/one/src/components/Card.astro';
  const models = new Map([
    [pagePath, {
      imports: [{ name: 'About', path: '../components/About.astro' }],
      extraFrontmatter: '',
      nodes: [{
        id: 'about-host',
        kind: 'component',
        name: 'About',
        props: {},
        children: null,
      }],
    }],
    [aboutPath, {
      imports: [{ name: 'Card', path: './Card.astro' }],
      extraFrontmatter: '',
      nodes: [{
        id: 'about-section',
        kind: 'element',
        name: 'section',
        props: {},
        children: [
          {
            id: 'about-heading',
            kind: 'element',
            name: 'h2',
            props: {},
            children: [{ id: 'about-text', kind: 'text', value: 'About us' }],
          },
          {
            id: 'card-host',
            kind: 'component',
            name: 'Card',
            props: {},
            children: null,
          },
        ],
      }],
    }],
    [cardPath, {
      imports: [],
      extraFrontmatter: '',
      nodes: [{
        id: 'card-article',
        kind: 'element',
        name: 'article',
        props: {},
        children: [],
      }],
    }],
  ]);

  window.avb.scanProject.mockResolvedValue({
    pages: [{ path: pagePath, name: 'index.astro', route: '/' }],
    layouts: [],
    components: [
      { path: aboutPath, name: 'About' },
      { path: cardPath, name: 'Card' },
    ],
  });
  window.avb.readPage.mockImplementation(async (filePath) => ({
    editable: true,
    model: models.get(filePath),
    source: '',
  }));
}
```

Call `setupComponentPage()` before `openProject()`. The core test sequence is:

```js
await openProject();
await waitFor(() => expect(harness.previewPaneProps?.onOpenNode).toEqual(expect.any(Function)));

await act(async () => {
  await harness.previewPaneProps.onOpenNode({
    scope: 'src/pages/index.astro',
    path: '0',
    pagePath: '0',
    occurrence: 0,
  });
});

expect(harness.previewPaneProps.activeScope).toBe('src/components/About.astro');
expect(harness.previewPaneProps.pageScope).toBe('src/pages/index.astro');

act(() => harness.previewPaneProps.onSelectNode({
  scope: 'src/components/About.astro',
  path: '0.0',
  pagePath: '0',
  occurrence: 0,
}));

await waitFor(() => {
  expect(harness.terminalPanelProps.editorContext.selectedNode)
    .toMatchObject({ id: 'about-heading', name: 'h2' });
});
```

Open Terminal before `onSelectNode` and assert it stays visible. Add tests that a hit with `scope: 'src/pages/index.astro'` cannot select a component-model node, a hit with `pagePath: '1'` exits component view, and double-clicking a nested component switches `activeScope` to its file while preserving `focusPath: '0'`.

- [ ] **Step 2: Run the App integration tests and verify RED**

```bash
rtk npm test -- src/App.test.jsx
```

Expected: new tests FAIL because App still receives path strings and component view discards every inside click.

- [ ] **Step 3: Compute page and active file scopes**

Import `toPreviewScope` in `src/App.tsx`. Next to `pageEntry`, derive:

```ts
const pageScope = toPreviewScope(pageEntry?.path, project.path);
const activeScope = toPreviewScope(currentPage?.path, project.path);
```

Pass both values to `PreviewPane`.

- [ ] **Step 4: Replace path-only handlers with scoped handlers**

Replace `onSelectPath` with `onSelectNode`:

```tsx
onSelectNode={(hit) => {
  if (focusPath) {
    const inside =
      hit.pagePath === focusPath ||
      Boolean(hit.pagePath?.startsWith(`${focusPath}.`));
    if (!inside) {
      closeComponent();
      return;
    }
    if (hit.scope !== activeScope || !hit.path) return;
  } else {
    if (!hit.path) {
      const layout = model && findNodeById(model.nodes, 'layout');
      if (layout) s().select(layout.id, { reveal: true });
      return;
    }
    if (hit.scope !== activeScope) return;
  }

  const node = model && nodeAtPath(model.nodes, hit.path.split('.').map(Number));
  if (node) s().select(node.id, { reveal: s().leftTab !== 'terminal' });
}}
```

Replace `onOpenPath` with:

```tsx
onOpenNode={(hit) => {
  if (hit.scope !== activeScope || !hit.path) return;
  const node = model && nodeAtPath(model.nodes, hit.path.split('.').map(Number));
  if (node?.kind === 'component') openComponent(node.name, hit.path);
}}
```

Keep `openComponent`'s existing `stack[last].focusPath ?? hostPath` rule so nested editing retains the outermost page focus.

- [ ] **Step 5: Verify App integration GREEN**

```bash
rtk npm test -- src/App.test.jsx src/App.history.test.jsx src/App.layout.test.jsx src/App.save.test.jsx
```

Expected: all App tests PASS, including component-local selection and Terminal persistence.

- [ ] **Step 6: Commit App integration files**

```bash
rtk git add -p src/App.tsx src/App.test.jsx
rtk git diff --cached --check
rtk git diff --cached -- src/App.tsx src/App.test.jsx
rtk git commit -m "fix: select nodes in component view"
```

Expected staged App diff: scope derivation, scoped canvas handlers, and their component-view tests. Preserve but do not accidentally stage unrelated pre-existing changes.

### Task 5: Add Blue Component-View Hover and Selection Outlines

**Files:**
- Modify: `src/panels/PreviewPane.tsx:395-412`
- Modify: `src/styles.css:2679-2728`
- Modify: `src/styles.test.js`

- [ ] **Step 1: Write failing outline-style tests**

Extend `src/styles.test.js`:

```js
function declarationsForRuleContaining(selector) {
  const rule = styles.split('}').find((candidate) => {
    const open = candidate.indexOf('{');
    return open !== -1 && candidate.slice(0, open).includes(selector);
  });
  if (!rule) throw new Error(`Missing CSS rule containing ${selector}`);
  return Object.fromEntries(
    rule
      .slice(rule.indexOf('{') + 1)
      .split(';')
      .map((declaration) => declaration.trim().split(/\s*:\s*/))
      .filter(([property, value]) => property && value),
  );
}

describe('component view outlines', () => {
  it('overrides every node kind with the accent blue only in component view', () => {
    expect(declarationsFor('\\.node-outline\\.component-edit')).toMatchObject({
      'outline-color': 'var(--accent)',
    });
    expect(declarationsFor('\\.node-outline\\.component-edit \\.node-outline-tag')).toMatchObject({
      background: 'var(--accent)',
      color: 'white',
    });
    expect(declarationsFor('\\.node-outline\\.component-edit\\.hover')).toMatchObject({
      background: 'transparent',
    });
    expect(
      declarationsFor('\\.node-outline\\.component-edit\\.hover \\.node-outline-tag'),
    ).toMatchObject({
      background: 'transparent',
      color: 'var(--accent)',
    });
  });

  it('keeps page-view component and bound-node colors unchanged', () => {
    expect(declarationsFor('\\.node-outline\\.component')).toMatchObject({
      'outline-color': 'var(--green)',
    });
    expect(declarationsForRuleContaining('.node-outline.bound')).toMatchObject({
      'outline-color': '#8b5cf6',
    });
  });
});
```

In `src/panels/PreviewPane.selection.test.tsx`, assert the active outline has `component-edit` when `activeScope !== pageScope`, and does not have it when both scopes are the page scope.

- [ ] **Step 2: Run style and preview tests and verify RED**

```bash
rtk npm test -- src/styles.test.js src/panels/PreviewPane.selection.test.tsx
```

Expected: FAIL because component-view outlines have no dedicated class or overrides.

- [ ] **Step 3: Add the component-edit outline class**

In `PreviewPane`, compute:

```ts
const componentEdit = Boolean(activeScope && pageScope && activeScope !== pageScope);
```

Append `component-edit` to hover/selected outline class names only when `componentEdit` is true.

After the existing outline color rules in `src/styles.css`, add:

```css
/* Inside component edit mode every selectable local node uses one blue
   language, regardless of whether that node is an element, component, loop,
   or bound node. Page-view colors above remain unchanged. */
.node-outline.component-edit {
  outline-color: var(--accent);
}
.node-outline.component-edit .node-outline-tag {
  background: var(--accent);
  color: white;
}
.node-outline.component-edit.hover {
  background: transparent;
}
.node-outline.component-edit.hover .node-outline-tag {
  background: transparent;
  color: var(--accent);
}
```

Retain `.node-outline.sel { outline-width: 2px; }` and the base 1px outline, which provide the required selected and hover widths.

- [ ] **Step 4: Verify outline behavior GREEN**

```bash
rtk npm test -- src/styles.test.js src/panels/PreviewPane.selection.test.tsx
```

Expected: component-view tests PASS and existing page-view color assertions PASS.

- [ ] **Step 5: Commit outline files**

```bash
rtk git add src/panels/PreviewPane.selection.test.tsx src/styles.test.js
rtk git add -p src/panels/PreviewPane.tsx src/styles.css
rtk git diff --cached --check
rtk git diff --cached -- src/panels/PreviewPane.tsx src/styles.css
rtk git commit -m "feat: show blue component view outlines"
```

Expected staged UI diff: `component-edit` class wiring and blue overrides only. Exclude unrelated pre-existing CSS and PreviewPane hunks from the overlap baseline.

### Task 6: Full Verification and Electron Runtime Test

**Files:**
- Verify only; modify a file only if a test exposes a defect, using a new RED/GREEN cycle before the fix.

- [ ] **Step 1: Run the focused selection suite**

```bash
rtk npm test -- electron/astroParser.test.js electron/previewMarkerRuntime.test.js src/model/previewScope.test.ts src/panels/PreviewPane.selection.test.tsx src/App.test.jsx src/styles.test.js
```

Expected: all focused tests PASS with no unhandled errors.

- [ ] **Step 2: Run the complete automated gate**

```bash
rtk npm test
rtk npm run check:electron
rtk npm run build
rtk npm run typecheck
```

Expected: tests, Electron checks, and build PASS. Record the exact typecheck result; if it still reports only the known checkJs migration backlog, distinguish that pre-existing output from feature regressions instead of claiming a clean typecheck.

- [ ] **Step 3: Launch the Electron app against a real Astro project**

Start Stacki through its normal development command:

```bash
rtk npm run dev
```

Open the existing `huszarok-v2` project from Recents and wait for the Astro preview to report running.

- [ ] **Step 4: Verify component-local interaction manually**

In the live page preview:

1. Double-click the rendered About component to enter component view.
2. Hover its heading, paragraph, and link. Confirm each receives a 1px blue outline and blue hover label.
3. Click the heading. Confirm its Navigator row becomes selected and a persistent 2px blue outline remains after moving the pointer away.
4. Click a different internal element. Confirm the selected outline moves rather than accumulating.
5. Open Terminal, click another internal element, and confirm Terminal stays visible and its Preview element context refreshes for the new component-local selection.
6. Double-click a nested component instance if present. Confirm its own internal nodes are selectable while the original page instance remains focused.
7. Click outside the focused page instance. Confirm component view closes.
8. In page view, confirm component hosts remain green, bound/loop nodes remain purple, and ordinary elements retain the existing blue.

- [ ] **Step 5: Inspect source and worktree integrity**

```bash
rtk git status --short
rtk git diff --check
rtk git -C /Users/soma/Documents/Projects/work/08_ai_websites/huszarok-v2 status --short
```

Expected: no source changes were written into `huszarok-v2`; the Stacki checkout contains only intended feature commits plus the user's pre-existing dirty files.

- [ ] **Step 6: Review the complete feature diff**

```bash
rtk git log --oneline --decorate -8
rtk git diff HEAD~5..HEAD -- electron/astroParser.js electron/main.js electron/previewMarkerRuntime.js electron/preload.js src/model/previewScope.ts src/panels/PreviewPane.tsx src/App.tsx src/styles.css
```

Expected: the diff contains scoped markers, scoped hit reporting, component-model selection, and component-view-only blue styling; it contains no unrelated refactor or project-source edit.
