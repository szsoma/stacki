// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import previewMarkerRuntime from './previewMarkerRuntime.js';

const {
  MARKER_ATTR,
  createPreviewMarkerRegistry,
  markerToken,
} = previewMarkerRuntime;

const PAGE_SCOPE = 'src/pages/index.astro';
const COMPONENT_SCOPE = 'src/components/Hero.astro';

const marker = (edge, path, scope) =>
  `<template data-avb-${edge}="${path}" data-avb-scope="${scope}"></template>`;

const setRect = (element, { left, top, right, bottom }) => {
  element.getBoundingClientRect = () => ({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  });
};

describe('preview marker registry', () => {
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

  it('resolves the deepest component path in the requested scope', () => {
    expect(registry.nodeAt(document.querySelector('#first'), COMPONENT_SCOPE)).toEqual({
      scope: COMPONENT_SCOPE,
      path: '0.0',
      occurrence: 0,
    });
  });

  it('resolves the containing page path independently', () => {
    expect(registry.nodeAt(document.querySelector('#first'), PAGE_SCOPE)).toEqual({
      scope: PAGE_SCOPE,
      path: '0',
      occurrence: 0,
    });
  });

  it('retains both scope tokens on clones and unions them into a single run', () => {
    const page = document.querySelector('#page');
    const clone = page.cloneNode(true);
    clone.id = 'page-clone';
    document.body.appendChild(clone);

    expect(clone.querySelector('#first').getAttribute(MARKER_ATTR).split(' ')).toEqual(
      expect.arrayContaining([markerToken(PAGE_SCOPE, '0'), markerToken(COMPONENT_SCOPE, '0')])
    );
    expect(registry.nodeAt(clone.querySelector('#first'), COMPONENT_SCOPE)).toEqual({
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
    expect(registry.nodeAt(document.querySelector('#second'), COMPONENT_SCOPE)).toEqual({
      scope: COMPONENT_SCOPE,
      path: '0.0',
      occurrence: 1,
    });
  });

  it('keeps a clone of the second occurrence in occurrence 1 and unions its rectangle', () => {
    const first = document.querySelector('#first');
    const second = document.querySelector('#second');
    const clone = second.cloneNode(true);
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
    const target = document.body.lastElementChild;
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
    const page = document.querySelector('#page');
    const component = document.querySelector('#component');
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
