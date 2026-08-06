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
