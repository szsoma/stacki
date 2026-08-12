// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { summarizeNode } from './nodeTree.js';

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// Hashes the page's own fields plus the shallow, one-line-per-top-level-node
// summaries (via summarizeNode) — the SAME shallow summaries resolve() puts
// into `data.structure`. Hashing the raw top-level node tree instead (which
// JSON.stringify would recurse through, including nested children) would
// make this key sensitive to changes resolve()'s output can't see — e.g. a
// grandchild's text or props changing — marking the chip stale for an edit
// that a refresh would produce byte-identical data for. Only changes that
// actually alter a top-level summary (e.g. a top-level node's id, kind, or
// label — the label folds in an element's first CSS class, see
// summarizeNode) should change this key.
function pageRevisionKey(pageInfo, nodeTree) {
  if (!pageInfo?.editable) return null;
  const json = JSON.stringify({
    path: pageInfo.path,
    layoutName: pageInfo.layoutName,
    imports: pageInfo.imports,
    frontmatter: pageInfo.frontmatter,
    structure: (nodeTree || []).map(summarizeNode),
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
