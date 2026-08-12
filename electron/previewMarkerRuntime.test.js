// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const preloadSource = fs.readFileSync(path.join(process.cwd(), 'electron/preload.js'), 'utf8');
const sourceMatch = preloadSource.match(
  /\/\* PREVIEW_MARKER_RUNTIME_START \*\/([\s\S]*?)\/\* PREVIEW_MARKER_RUNTIME_END \*\//
);
/** @typedef {{
 *   MARKER_ATTR: string,
 *   createPreviewMarkerRegistry: (document: Document) => {
 *     collect: () => void,
 *     markerTokensForSubtrees: (scope: string, paths: string[]) => string[],
 *     nodeAt: (target: Node, scope: string) => {scope: string, path: string, occurrence: number} | null,
 *     rectsFor: (scope: string, path: string) => {x: number, y: number, w: number, h: number}[] | null,
 *   },
 *   markerKey: (scope: string, path: string) => string,
 *   markerToken: (scope: string, path: string) => string,
 * }} PreviewMarkerRuntime */

/** @type {PreviewMarkerRuntime} */
const previewMarkerRuntime = sourceMatch
  ? Function(
      'Buffer',
      `${sourceMatch[1]}; return { MARKER_ATTR, createPreviewMarkerRegistry, markerKey, markerToken };`
    )(Buffer)
  : /** @type {PreviewMarkerRuntime} */ ({});

const {
  MARKER_ATTR,
  createPreviewMarkerRegistry,
  markerToken,
} = previewMarkerRuntime;

const PAGE_SCOPE = 'src/pages/index.astro';
const COMPONENT_SCOPE = 'src/components/Hero.astro';

/** @param {string} edge @param {string} path @param {string} scope */
const marker = (edge, path, scope) =>
  `<template data-avb-${edge}="${path}" data-avb-scope="${scope}"></template>`;

/** @param {ParentNode} root @param {string} selector */
const mustQuery = (root, selector) => {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing fixture element: ${selector}`);
  return element;
};

/**
 * @param {Element} element
 * @param {{left: number, top: number, right: number, bottom: number}} rect
 */
const setRect = (element, { left, top, right, bottom }) => {
  element.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  });
};

describe('preview marker registry', () => {
  /** @type {ReturnType<PreviewMarkerRuntime['createPreviewMarkerRegistry']>} */
  let registry;

  beforeEach(() => {
    document.body.innerHTML = [
      marker('s', '0', PAGE_SCOPE),
      '<section id="page">',
      marker('s', '0', COMPONENT_SCOPE),
      '<div id="component">',
      marker('s', '0.0', COMPONENT_SCOPE),
      '<button id="first">First</button>',
      marker('e', '0.0', COMPONENT_SCOPE),
      marker('s', '0.0', COMPONENT_SCOPE),
      '<button id="second">Second</button>',
      marker('e', '0.0', COMPONENT_SCOPE),
      '</div>',
      marker('e', '0', COMPONENT_SCOPE),
      '</section>',
      marker('e', '0', PAGE_SCOPE),
    ].join('');
    registry = createPreviewMarkerRegistry(document);
    registry.collect();
  });

  it('is sourced inline from the sandbox-compatible preload', () => {
    expect(sourceMatch).not.toBeNull();
    expect(preloadSource).not.toMatch(/require\(['"]\.\/previewMarkerRuntime/);
    expect(createPreviewMarkerRegistry).toBeTypeOf('function');
  });

  it('resolves the deepest component path in the requested scope', () => {
    expect(registry.nodeAt(mustQuery(document, '#first'), COMPONENT_SCOPE)).toEqual({
      scope: COMPONENT_SCOPE,
      path: '0.0',
      occurrence: 0,
    });
  });

  it('resolves the containing page path independently', () => {
    expect(registry.nodeAt(mustQuery(document, '#first'), PAGE_SCOPE)).toEqual({
      scope: PAGE_SCOPE,
      path: '0',
      occurrence: 0,
    });
  });

  it('retains both scope tokens on clones and unions them into a single run', () => {
    const page = mustQuery(document, '#page');
    const clone = /** @type {HTMLElement} */ (page.cloneNode(true));
    clone.id = 'page-clone';
    document.body.appendChild(clone);

    expect((mustQuery(clone, '#first').getAttribute(MARKER_ATTR) || '').split(' ')).toEqual(
      expect.arrayContaining([markerToken(PAGE_SCOPE, '0'), markerToken(COMPONENT_SCOPE, '0')])
    );
    expect(registry.nodeAt(mustQuery(clone, '#first'), COMPONENT_SCOPE)).toEqual({
      scope: COMPONENT_SCOPE,
      path: '0.0',
      occurrence: 0,
    });

    setRect(page, { left: 10, top: 20, right: 110, bottom: 80 });
    setRect(clone, { left: 150, top: 10, right: 250, bottom: 90 });
    expect(registry.rectsFor(PAGE_SCOPE, '0')).toEqual([
      { x: 10, y: 10, w: 240, h: 80 },
    ]);
  });

  it('reports the second occurrence for repeated component paths', () => {
    expect(registry.nodeAt(mustQuery(document, '#second'), COMPONENT_SCOPE)).toEqual({
      scope: COMPONENT_SCOPE,
      path: '0.0',
      occurrence: 1,
    });
  });

  it('keeps a clone of the second occurrence in occurrence 1 and unions its rectangle', () => {
    const first = mustQuery(document, '#first');
    const second = mustQuery(document, '#second');
    const clone = /** @type {HTMLElement} */ (second.cloneNode(true));
    clone.id = 'second-clone';
    document.body.appendChild(clone);
    setRect(first, { left: 0, top: 0, right: 100, bottom: 30 });
    setRect(second, { left: 0, top: 40, right: 100, bottom: 70 });
    setRect(clone, { left: 120, top: 35, right: 220, bottom: 75 });

    expect(registry.nodeAt(clone, COMPONENT_SCOPE)).toEqual({
      scope: COMPONENT_SCOPE,
      path: '0.0',
      occurrence: 1,
    });
    expect(registry.rectsFor(COMPONENT_SCOPE, '0.0')).toEqual([
      { x: 0, y: 0, w: 100, h: 30 },
      { x: 0, y: 35, w: 220, h: 40 },
    ]);
  });

  it('resolves tagged element hits without scanning unrelated recorded regions', () => {
    document.body.innerHTML = Array.from(
      { length: 50 },
      (_, index) =>
        `${marker('s', String(index), PAGE_SCOPE)}<div></div>${marker('e', String(index), PAGE_SCOPE)}`
    ).join('');
    registry = createPreviewMarkerRegistry(document);
    registry.collect();
    const target = mustQuery(document.body, 'div:last-child');
    let reads = 0;
    const originalGetAttribute = target.getAttribute.bind(target);
    target.getAttribute = (...args) => {
      reads++;
      return originalGetAttribute(...args);
    };

    expect(registry.nodeAt(target, PAGE_SCOPE)).toMatchObject({
      scope: PAGE_SCOPE,
      path: '49',
    });
    expect(reads).toBeLessThanOrEqual(2);
  });

  it('isolates rects by scope for paths with the same local value', () => {
    const page = mustQuery(document, '#page');
    const component = mustQuery(document, '#component');
    setRect(page, { left: 0, top: 0, right: 300, bottom: 200 });
    setRect(component, { left: 25, top: 30, right: 275, bottom: 170 });

    expect(registry.rectsFor(PAGE_SCOPE, '0')).toEqual([{ x: 0, y: 0, w: 300, h: 200 }]);
    expect(registry.rectsFor(COMPONENT_SCOPE, '0')).toEqual([
      { x: 25, y: 30, w: 250, h: 140 },
    ]);
  });

  it('returns subtree tokens only for the requested scope', () => {
    expect(registry.markerTokensForSubtrees(COMPONENT_SCOPE, ['0'])).toEqual([
      markerToken(COMPONENT_SCOPE, '0'),
      markerToken(COMPONENT_SCOPE, '0.0'),
    ]);
    expect(registry.markerTokensForSubtrees(COMPONENT_SCOPE, ['0'])).not.toContain(
      markerToken(PAGE_SCOPE, '0')
    );
  });
});
