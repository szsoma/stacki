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

// Hashes the selected node's *entire* subtree (not just its own shallow
// fields) so that editing something nested arbitrarily deep inside the
// selection — e.g. a grandchild text node's value — changes this key.
// JSON.stringify already recurses through `node.children`, so passing the
// real children array (rather than just its length) is enough; no manual
// deep-walk needed.
function nodeRevisionKey(node) {
  if (!node) return null;
  const json = JSON.stringify({
    id: node.id,
    kind: node.kind,
    name: node.name,
    props: node.props,
    children: node.children,
  });
  return `${node.id}:${hashString(json)}`;
}

// Ancestor identities (id/name/kind) plus the owning component's identity —
// covers a renamed ancestor or a moved/renamed owner component, neither of
// which touches the selected node's own subtree and so wouldn't otherwise
// change nodeRevisionKey. Only used by computeStaleKey: resolve()'s
// sourceRevision doesn't need this since ancestors/owner aren't part of the
// serialized markup it hashes.
function contextRevisionKey(appState, selectedNode) {
  const { nodeTree = [], componentDefinitions = [], loopContext } = appState;
  const chain = ancestorChain(nodeTree, selectedNode.id);
  const ancestors = chain.slice(0, -1).map((node) => ({ id: node.id, name: node.name, kind: node.kind }));
  const owner = findOwningComponent(nodeTree, selectedNode.id, componentDefinitions);
  const json = JSON.stringify({
    ancestors,
    owner: owner ? { name: owner.definition.name, path: owner.definition.path } : null,
    loopVariables: loopContext?.ancestorHeads || [],
  });
  return hashString(json);
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
    const { selectedNode } = appState;
    if (!selectedNode) return null;
    return `${nodeRevisionKey(selectedNode)}:${contextRevisionKey(appState, selectedNode)}`;
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
