import { ancestorChain, findNodeById, findParentNode, pathOfNode } from '../model/nodes';
import { getElementSchema } from '../elementSchemas.js';
import type { AppState } from './index';
import type { AstroNode, PageModel } from '../types/ast';
import type { ComponentEntry, PageEntry, PropField } from '../types/ipc';

// Selectors are read through zustand's `useStore`, which is built on
// useSyncExternalStore: it compares the previous result against the next one
// with Object.is and keeps re-rendering until the two agree. A selector that
// builds a fresh array or object on every call therefore never settles, and
// React gives up with "Maximum update depth exceeded". Everything below that
// allocates goes through `derived`, so an unchanged store hands back the
// identical reference.
//
// One cache slot is enough: every consumer reads the same store, so successive
// calls carry the same dependencies. Alternating between two stores (only the
// tests do that) stays correct — it just recomputes.
function derived<D extends readonly unknown[], R>(
  deps: (state: AppState) => D,
  compute: (state: AppState, deps: D) => R
): (state: AppState) => R {
  let lastDeps: D | null = null;
  let lastValue: R;
  return (state) => {
    const next = deps(state);
    if (
      lastDeps !== null &&
      next.length === lastDeps.length &&
      next.every((dep, i) => Object.is(dep, lastDeps![i]))
    ) {
      return lastValue;
    }
    lastDeps = next;
    lastValue = compute(state, next);
    return lastValue;
  };
}

// Shared empties, so "nothing here" is one reference rather than a new [].
const NO_SCHEMA: PropField[] = [];

/** The page frontmatter, addressed as if it were a node so it can be selected. */
export interface FrontmatterNode {
  id: 'frontmatter';
  kind: 'frontmatter';
  value: string;
}

export type SelectedNode = AstroNode | FrontmatterNode;

export const selectModel = (state: AppState): PageModel | null => {
  const ps = state.pageState;
  return ps?.editable ? ps.model : null;
};

// The frontmatter as one editable code block (imports + everything else,
// matching how the file is serialized).
export const selectFrontmatterCode = (state: AppState): string => {
  const model = selectModel(state);
  if (!model) return '';
  return [
    ...model.imports.map((i) => `import ${i.name} from '${i.path}';`),
    ...(model.extraFrontmatter ? ['', model.extraFrontmatter] : []),
  ].join('\n');
};

export const selectSelectedNode = derived(
  (state) => [selectModel(state), state.selectedId] as const,
  (state, [model, selectedId]): SelectedNode | null => {
    if (!model || !selectedId) return null;
    if (selectedId === 'frontmatter') {
      return { id: 'frontmatter', kind: 'frontmatter', value: selectFrontmatterCode(state) };
    }
    return findNodeById(model.nodes, selectedId);
  }
);

export const selectLayoutNode = (state: AppState): AstroNode | null => {
  const model = selectModel(state);
  if (!model) return null;
  return findNodeById(model.nodes, 'layout');
};

// The page may import its layout under any local name (e.g. `import Layout
// from '../layouts/BaseLayout.astro'`) — resolve the wrapper back to a scanned
// layout file name for display, pickers, and schema lookup.
export const selectCurrentLayoutName = (state: AppState): string => {
  const model = selectModel(state);
  const layoutNode = selectLayoutNode(state);
  if (!layoutNode) return '';
  const imp = model?.imports?.find((i) => i.name === layoutNode.name);
  const base = imp?.path.split('/').pop()?.replace(/\.astro$/i, '');
  if (base && state.scan.layouts.some((l) => l.name === base)) return base;
  return layoutNode.name ?? '';
};

// A layout is just a component that lives in src/layouts — it can be placed on
// a page like any other, so every "what do we know about the component named
// X" lookup has to search both lists. Components win a name collision: they're
// the more likely intent.
export const selectInsertables = derived(
  (state) => [state.scan.components, state.scan.layouts] as const,
  (_state, [components, layouts]): ComponentEntry[] => [
    ...components,
    ...layouts.filter((l) => !components.some((c) => c.name === l.name)),
  ]
);

// A component whose Props extends HTMLAttributes<"tag"> also accepts that
// element's built-in attributes — merge them in after its own props.
function schemaFor(entry: ComponentEntry | undefined): PropField[] {
  if (!entry) return NO_SCHEMA;
  const own = entry.schema || NO_SCHEMA;
  if (!entry.extendsTag) return own;
  const ownNames = new Set(own.map((f) => f.name));
  const inherited = getElementSchema(entry.extendsTag).filter(
    (f: PropField) => !ownNames.has(f.name)
  );
  return [...own, ...inherited];
}

export const selectSelectedSchema = derived(
  (state) =>
    [
      selectSelectedNode(state),
      state.selectedId,
      state.scan.layouts,
      selectInsertables(state),
      selectCurrentLayoutName(state),
    ] as const,
  (_state, [node, selectedId, layouts, insertables, layoutName]): PropField[] => {
    if (!node || node.kind === 'text' || node.kind === 'frontmatter') return NO_SCHEMA;
    if (selectedId === 'layout') {
      return schemaFor(layouts.find((l) => l.name === layoutName));
    }
    if (node.kind === 'element') return getElementSchema(node.name);
    return schemaFor(insertables.find((c) => c.name === node.name));
  }
);

// Which named slots the selection can be placed into — the slots declared by
// whatever encloses it, which is either the layout wrapper or a component.
export const selectSlotOptions = (state: AppState): string[] | null => {
  const model = selectModel(state);
  const node = selectSelectedNode(state);
  const { selectedId } = state;
  if (!model || !node || !selectedId || selectedId === 'layout') return null;
  const parent = findParentNode(model.nodes, selectedId);
  if (!parent) return null;
  if (parent.id === 'layout') {
    const layoutName = selectCurrentLayoutName(state);
    return state.scan.layouts.find((l) => l.name === layoutName)?.slots || null;
  }
  if (parent.kind === 'component') {
    return selectInsertables(state).find((c) => c.name === parent.name)?.slots || null;
  }
  return null;
};

export function pathFor(state: AppState, id: string | null): string | null {
  const model = selectModel(state);
  if (!model || !id) return null;
  const trail = pathOfNode(model.nodes, id);
  return trail ? trail.join('.') : null;
}

/**
 * How a node is named in the breadcrumb trail and in the canvas outline label.
 * Both have to agree, so a node reads the same wherever you meet it.
 */
export function nodeLabel(node: AstroNode, currentLayoutName: string): string {
  if (node.id === 'layout') return currentLayoutName || node.name || '';
  switch (node.kind) {
    case 'text':
      return 'text';
    case 'comment':
      return 'comment';
    case 'expr':
      return 'code';
    case 'map': {
      const at = node.head.indexOf('.map');
      return at > 0 ? node.head.slice(0, at + 4) : 'loop';
    }
    case 'element':
    case 'raw': {
      // First class wins; fall back to the bare tag when the element has none.
      const cls = node.props?.class;
      const first = cls && cls.type === 'string' ? cls.value.trim().split(/\s+/)[0] : null;
      return first || node.name;
    }
    default:
      return node.name ?? '';
  }
}

export interface Crumb {
  id: string | null;
  label: string;
}

// Breadcrumb trail for the canvas toolbar: page → ancestors → selection.
export const selectCrumbs = derived(
  (state) =>
    [
      selectModel(state),
      state.selectedId,
      state.currentPage,
      selectCurrentLayoutName(state),
    ] as const,
  (_state, [model, selectedId, currentPage, layoutName]): Crumb[] => {
    const crumbs: Crumb[] = [];
    if (currentPage) {
      crumbs.push({ id: null, label: currentPage.name.replace(/\.(astro|md)$/i, '') });
    }
    if (model && selectedId === 'frontmatter') {
      crumbs.push({ id: 'frontmatter', label: 'Frontmatter' });
    } else if (model && selectedId) {
      const chain = ancestorChain(model.nodes, selectedId) || [];
      crumbs.push(...chain.map((n) => ({ id: n.id, label: nodeLabel(n, layoutName) })));
    }
    return crumbs;
  }
);

export interface LinkContext {
  pages: PageEntry[];
  sectionIds: string[];
}

// Link settings (href fields): the pages a link can point at, and the ids on
// this page that anchor links can target.
export const selectLinkContext = derived(
  (state) => [selectModel(state), state.scan.pages] as const,
  (_state, [model, pages]): LinkContext => {
    const sectionIds: string[] = [];
    if (model) {
      const walk = (list: AstroNode[]) =>
        list.forEach((n) => {
          const idv = n.props?.id;
          if (idv && idv.type === 'string' && idv.value) sectionIds.push(idv.value);
          if (Array.isArray(n.children)) walk(n.children);
        });
      walk(model.nodes);
    }
    return { pages, sectionIds };
  }
);

export interface LoopContext {
  frontmatter: string;
  imports: PageModel['imports'];
  ancestorHeads: string[];
}

// In-scope data at the selection: the page's frontmatter declarations and
// imports, plus the head of every enclosing loop. Feeds the loop editor's
// source list and the content editor's expression chips.
export const selectLoopContext = derived(
  (state) => [selectModel(state), selectSelectedNode(state), state.selectedId] as const,
  (_state, [model, node, selectedId]): LoopContext | null => {
    if (!model || !node || !selectedId) return null;
    return {
      frontmatter: model.extraFrontmatter || '',
      imports: model.imports || [],
      ancestorHeads: (ancestorChain(model.nodes, selectedId) || [])
        .slice(0, -1)
        .filter((n): n is Extract<AstroNode, { kind: 'map' }> => n.kind === 'map')
        .map((n) => n.head),
    };
  }
);

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
