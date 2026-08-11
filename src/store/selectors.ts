import { ancestorChain, findNodeById, findParentNode, pathOfNode } from '../model/nodes';
import type { AppState } from './index';
import type { AstroNode, PageModel } from '../types/ast';

export const selectModel = (state: AppState): PageModel | null => {
  const ps = state.pageState;
  return ps?.editable ? ps.model : null;
};

export const selectFrontmatterCode = (state: AppState): string => {
  const model = selectModel(state);
  if (!model) return '';
  const imports = model.imports
    .map((i) => `import ${i.name} from '${i.path}';`)
    .join('\n');
  return imports + (model.extraFrontmatter ? '\n' + model.extraFrontmatter : '');
};

export const selectSelectedNode = (state: AppState): AstroNode | null => {
  const model = selectModel(state);
  if (!model || !state.selectedId) return null;
  return findNodeById(model.nodes, state.selectedId);
};

export const selectLayoutNode = (state: AppState): AstroNode | null => {
  const model = selectModel(state);
  if (!model) return null;
  return findNodeById(model.nodes, 'layout');
};

export const selectCurrentLayoutName = (state: AppState): string => {
  const model = selectModel(state);
  const layoutNode = selectLayoutNode(state);
  if (!layoutNode) return '';
  const imp = model?.imports?.find((i) => i.name === layoutNode.name);
  const base = imp?.path.split('/').pop()?.replace(/\.astro$/i, '');
  if (base && state.scan.layouts.some((l) => l.name === base)) return base;
  return layoutNode.name ?? '';
};

export function pathFor(state: AppState, id: string | null): string | null {
  const model = selectModel(state);
  if (!model || !id) return null;
  const trail = pathOfNode(model.nodes, id);
  return trail ? trail.join('.') : null;
}

export const selectCrumbs = (state: AppState): { name: string; path: string | null }[] => {
  const model = selectModel(state);
  if (!model || !state.selectedId) return [];
  const chain = ancestorChain(model.nodes, state.selectedId);
  if (!chain) return [];
  return chain.map((n) => ({
    name: 'name' in n && n.name ? n.name : n.kind,
    path: pathFor(state, n.id),
  }));
};

export const selectInsertables = (
  state: AppState
): { name: string; path: string; hasRest?: boolean }[] => {
  const components = state.scan.components.map((c) => ({
    name: c.name,
    path: c.path,
    hasRest: c.hasRest,
  }));
  const layouts = state.scan.layouts
    .filter((l) => !components.some((c) => c.name === l.name))
    .map((l) => ({
      name: l.name,
      path: l.path,
      hasRest: l.hasRest,
    }));
  return [...components, ...layouts];
};

export const selectLinkContext = (state: AppState): { sectionIds: string[] } => {
  const model = selectModel(state);
  if (!model) return { sectionIds: [] };
  const ids: string[] = [];
  const walk = (nodes: AstroNode[]) => {
    for (const n of nodes) {
      if ((n.kind === 'element' || n.kind === 'component') && n.props?.id?.type === 'string') {
        ids.push(n.props.id.value);
      }
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  walk(model.nodes);
  return { sectionIds: ids };
};

export const selectLoopContext = (
  state: AppState
): { loopVars: string[]; mapId: string | null } => {
  const model = selectModel(state);
  if (!model || !state.selectedId) return { loopVars: [], mapId: null };
  // Find ancestor loop variables and the nearest map node.
  const vars: string[] = [];
  let mapId: string | null = null;
  const chain = ancestorChain(model.nodes, state.selectedId);
  if (chain) {
    for (const n of chain) {
      if (n.kind === 'map' && n.head) {
        const m = n.head.match(
          /\.map\(\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\)/
        );
        if (m) {
          if (m[1]) vars.push(m[1]);
          if (m[2]) vars.push(m[2]);
          mapId = n.id;
        }
      }
    }
  }
  return { loopVars: vars, mapId };
};

export const selectAllowAttrs = (state: AppState): boolean => {
  const node = selectSelectedNode(state);
  if (!node) return false;
  if (node.kind === 'element') return true;
  if ('dynamicTag' in node && node.dynamicTag) return true;
  return (
    node.kind === 'component' &&
    !!selectInsertables(state).find((c) => c.name === node.name)?.hasRest
  );
};

export const selectSelectedSchema = (
  state: AppState
): { name: string; type: string; optional?: boolean; values?: string[] }[] => {
  const node = selectSelectedNode(state);
  if (!node || node.kind === 'text' || node.kind === 'comment' || node.kind === 'expr') return [];
  const name = node.kind === 'component' || node.kind === 'element' ? node.name : '';
  const entry = state.scan.components.find((c) => c.name === name);
  return entry?.schema || [];
};

export const selectSlotOptions = (state: AppState): string[] | null => {
  const model = selectModel(state);
  if (!model || !state.selectedId || state.selectedId === 'layout') return null;
  const parent = findParentNode(model.nodes, state.selectedId);
  if (!parent || !('name' in parent)) return null;
  const entry = state.scan.components.find((c) => c.name === parent.name);
  return entry?.slots ?? null;
};
