import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { summarizeNode } from './nodeTree.js';

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// Hashes the page's own fields plus the *entire* top-level node tree
// (not just each top-level node's id) so that editing anything inside a
// top-level node's subtree — a nested element's props, a deep descendant's
// text — changes this key, not only additions/removals of top-level nodes.
// JSON.stringify already recurses through each node's `children`, so
// passing the real top-level array (rather than a list of ids) is enough;
// no manual deep-walk needed.
function pageRevisionKey(pageInfo, nodeTree) {
  if (!pageInfo?.editable) return null;
  const json = JSON.stringify({
    path: pageInfo.path,
    layoutName: pageInfo.layoutName,
    imports: pageInfo.imports,
    frontmatter: pageInfo.frontmatter,
    topLevel: nodeTree || [],
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
