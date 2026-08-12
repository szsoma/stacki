const MARKER_ATTR = 'data-avb-m';
const OCCURRENCE_ATTR = 'data-avb-mo';
const KEY_DELIMITER = '\u0000';

const markerKey = (scope, path) => `${scope}${KEY_DELIMITER}${path}`;

const encodeScope = (scope) =>
  Buffer.from(String(scope), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const markerToken = (scope, path) => `avb-${encodeScope(scope)}-${path}`;

const createPreviewMarkerRegistry = (doc = document) => {
  const regions = new Map();
  const markers = new Map();
  const markerByToken = new Map();
  const occurrenceByToken = new Map();

  const tagElement = (element, attribute, token) => {
    const tokens = new Set((element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean));
    tokens.add(token);
    element.setAttribute(attribute, [...tokens].join(' '));
  };

  const collect = () => {
    regions.clear();
    markers.clear();
    markerByToken.clear();
    occurrenceByToken.clear();
    const starts = doc.querySelectorAll('template[data-avb-s][data-avb-scope]');
    for (const start of starts) {
      const path = start.getAttribute('data-avb-s');
      const scope = start.getAttribute('data-avb-scope');
      const key = markerKey(scope, path);
      const token = markerToken(scope, path);
      const occurrence = regions.get(key)?.length || 0;
      const occurrenceToken = `${token}-occ-${occurrence}`;
      const run = [];
      let sameMarkerDepth = 0;
      for (let node = start.nextSibling; node; node = node.nextSibling) {
        if (node.nodeType === 1 && node.tagName === 'TEMPLATE') {
          const nodeScope = node.getAttribute('data-avb-scope');
          if (nodeScope === scope && node.getAttribute('data-avb-s') === path) {
            sameMarkerDepth++;
          } else if (nodeScope === scope && node.getAttribute('data-avb-e') === path) {
            if (sameMarkerDepth === 0) break;
            sameMarkerDepth--;
          }
        }
        run.push(node);
        if (node.nodeType === 1 && node.tagName !== 'TEMPLATE') {
          tagElement(node, MARKER_ATTR, token);
          tagElement(node, OCCURRENCE_ATTR, occurrenceToken);
          for (const descendant of node.querySelectorAll(`*:not(template)`)) {
            tagElement(descendant, MARKER_ATTR, token);
            tagElement(descendant, OCCURRENCE_ATTR, occurrenceToken);
          }
        }
      }
      if (!regions.has(key)) regions.set(key, []);
      regions.get(key).push(run);
      const marker = { key, scope, path, token };
      markers.set(key, marker);
      markerByToken.set(token, marker);
      occurrenceByToken.set(occurrenceToken, { key, occurrence });
    }
    doc
      .querySelectorAll('template[data-avb-s], template[data-avb-e]')
      .forEach((template) => template.remove());
  };

  const tokenElements = (attribute, token) =>
    [...doc.querySelectorAll(`[${attribute}~="${token}"]`)];

  const occurrenceOf = (scope, path, target) => {
    const runs = regions.get(markerKey(scope, path));
    if (!runs || runs.length < 2) return 0;
    for (let index = 0; index < runs.length; index++) {
      for (const node of runs[index]) {
        if (!node.isConnected) continue;
        if (node === target || (node.nodeType === 1 && node.contains(target))) return index;
      }
    }
    return 0;
  };

  const nodeAt = (target, scope) => {
    if (!target || !scope) return null;
    let best = null;
    if (target.nodeType === 1) {
      for (let element = target; element; element = element.parentElement) {
        const occurrenceTokens = (element.getAttribute(OCCURRENCE_ATTR) || '')
          .split(/\s+/)
          .filter(Boolean);
        for (const token of (element.getAttribute(MARKER_ATTR) || '').split(/\s+/)) {
          const marker = markerByToken.get(token);
          if (!marker || marker.scope !== scope) continue;
          const depth = marker.path.split('.').length;
          if (best && depth <= best.depth) continue;
          const occurrenceMarker = occurrenceTokens
            .map((value) => occurrenceByToken.get(value))
            .find((value) => value?.key === marker.key);
          best = {
            ...marker,
            depth,
            occurrence: occurrenceMarker?.occurrence ?? occurrenceOf(scope, marker.path, target),
          };
        }
      }
    } else {
      for (const marker of markers.values()) {
        if (marker.scope !== scope) continue;
        const depth = marker.path.split('.').length;
        if (best && depth <= best.depth) continue;
        const runs = regions.get(marker.key) || [];
        const hit = runs.some((run) =>
          run.some(
            (node) =>
              node.isConnected &&
              (node === target || (node.nodeType === 1 && node.contains(target)))
          )
        );
        if (hit) {
          best = {
            ...marker,
            depth,
            occurrence: occurrenceOf(scope, marker.path, target),
          };
        }
      }
    }
    return best
      ? { scope, path: best.path, occurrence: best.occurrence }
      : null;
  };

  const addNode = (acc, node) => {
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
      const range = doc.createRange();
      range.selectNode(node);
      if (typeof range.getBoundingClientRect === 'function') box = range.getBoundingClientRect();
    }
    if (!box || (box.width === 0 && box.height === 0)) return acc;
    if (!acc) return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    return {
      left: Math.min(acc.left, box.left),
      top: Math.min(acc.top, box.top),
      right: Math.max(acc.right, box.right),
      bottom: Math.max(acc.bottom, box.bottom),
    };
  };

  const toRect = (box) => ({
    x: box.left,
    y: box.top,
    w: box.right - box.left,
    h: box.bottom - box.top,
  });

  const rectsFor = (scope, path) => {
    const key = markerKey(scope, path);
    const runs = regions.get(key);
    const marker = markers.get(key);
    if (!runs || !marker) return null;
    if (runs.length === 1) {
      let acc = runs[0].reduce(addNode, null);
      for (const element of tokenElements(MARKER_ATTR, marker.token)) acc = addNode(acc, element);
      return acc ? [toRect(acc)] : null;
    }
    const rects = [];
    for (let occurrence = 0; occurrence < runs.length; occurrence++) {
      let acc = runs[occurrence].reduce(addNode, null);
      const occurrenceToken = `${marker.token}-occ-${occurrence}`;
      for (const element of tokenElements(OCCURRENCE_ATTR, occurrenceToken)) {
        acc = addNode(acc, element);
      }
      if (acc) rects.push(toRect(acc));
    }
    return rects.length ? rects : null;
  };

  const markerTokensForSubtrees = (scope, paths) => {
    const roots = Array.isArray(paths) ? paths : [];
    return [...markers.values()]
      .filter(
        (marker) =>
          marker.scope === scope &&
          roots.some((path) => marker.path === path || marker.path.startsWith(`${path}.`))
      )
      .map((marker) => marker.token);
  };

  return { collect, markerTokensForSubtrees, nodeAt, rectsFor };
};

module.exports = { MARKER_ATTR, createPreviewMarkerRegistry, markerKey, markerToken };
