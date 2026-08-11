import type { PageModel, PropValue } from '../types/ast';
import { findNodeById } from '../model/nodes';

export function setProp(
  model: PageModel,
  nodeId: string,
  propName: string,
  value: PropValue | undefined
): PageModel {
  const node = findNodeById(model.nodes, nodeId);
  if (!node || !('props' in node)) return model;
  if (!node.props) node.props = {};
  if (value === undefined) delete node.props[propName];
  else node.props[propName] = value;
  return model;
}

export function renameProp(
  model: PageModel,
  nodeId: string,
  oldName: string,
  newName: string
): PageModel {
  if (!newName || newName === oldName) return model;
  const node = findNodeById(model.nodes, nodeId);
  if (!node || !node.props || !(oldName in node.props)) return model;
  const entries = Object.entries(node.props);
  const idx = entries.findIndex(([k]) => k === oldName);
  if (idx === -1) return model;
  const reordered: Record<string, PropValue> = {};
  for (const [k, v] of entries) {
    if (k === oldName) reordered[newName] = v;
    else reordered[k] = v;
  }
  node.props = reordered;
  return model;
}

export function removeNode(model: PageModel, nodeId: string): PageModel {
  const search = (list: any[]) => {
    const index = list.findIndex((n: any) => n.id === nodeId);
    if (index !== -1) {
      list.splice(index, 1);
      return true;
    }
    for (const node of list) {
      if (Array.isArray(node.children) && search(node.children)) return true;
    }
    return false;
  };
  search(model.nodes);
  return model;
}

export function setNodeText(
  model: PageModel,
  nodeId: string,
  text: string
): PageModel {
  const node = findNodeById(model.nodes, nodeId);
  if (node && node.kind === 'text') {
    node.value = text;
  }
  return model;
}

export function changeElementTag(
  model: PageModel,
  nodeId: string,
  newTag: string
): PageModel {
  const node = findNodeById(model.nodes, nodeId);
  if (node && (node.kind === 'element' || node.kind === 'component')) {
    node.name = newTag;
  }
  return model;
}

export function setNodeContent(
  model: PageModel,
  nodeId: string,
  children: any[]
): PageModel {
  const node = findNodeById(model.nodes, nodeId);
  if (node && 'children' in node) {
    node.children = children;
  }
  return model;
}

export function setNodeInline(
  model: PageModel,
  nodeId: string,
  nodes: any[]
): PageModel {
  return setNodeContent(model, nodeId, nodes);
}

export function setFrontmatter(
  model: PageModel,
  extraFrontmatter: string
): PageModel {
  model.extraFrontmatter = extraFrontmatter;
  return model;
}

export function moveNode(
  model: PageModel,
  nodeId: string,
  target: { parentId: string | null; index: number }
): PageModel {
  const sourceList = findParentListInModel(model, nodeId);
  if (!sourceList) return model;
  const node = sourceList.list[sourceList.index];
  sourceList.list.splice(sourceList.index, 1);
  if (target.parentId === null) {
    model.nodes.splice(target.index, 0, node);
  } else {
    const parent = findNodeById(model.nodes, target.parentId);
    if (parent && 'children' in parent) {
      if (!Array.isArray(parent.children)) parent.children = [];
      parent.children.splice(target.index, 0, node);
    } else {
      model.nodes.splice(target.index, 0, node);
    }
  }
  return model;
}

function findParentListInModel(model: PageModel, id: string): { list: any[]; index: number } | null {
  const search = (list: any[]): { list: any[]; index: number } | null => {
    const index = list.findIndex((n) => n.id === id);
    if (index !== -1) return { list, index };
    for (const node of list) {
      if (Array.isArray(node.children)) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  };
  return search(model.nodes);
}

export function duplicateNode(
  model: PageModel,
  nodeId: string
): PageModel {
  const found = findParentListInModel(model, nodeId);
  if (!found) return model;
  const node = found.list[found.index];
  const clone = structuredClone(node);
  clone.id = generateNewId(model);
  found.list.splice(found.index + 1, 0, clone);
  return model;
}

export function insertIntoModel(
  model: PageModel,
  node: any,
  parentId: string | null,
  index: number
): PageModel {
  if (parentId === null) {
    model.nodes.splice(index, 0, node);
  } else {
    const parent = findNodeById(model.nodes, parentId);
    if (parent && 'children' in parent) {
      if (!Array.isArray(parent.children)) parent.children = [];
      parent.children.splice(index, 0, node);
    }
  }
  return model;
}

export function wrapInLayout(
  model: PageModel,
  layoutName: string,
  importPath: string
): PageModel {
  const existing = findNodeById(model.nodes, 'layout');
  if (existing && 'name' in existing) {
    existing.name = layoutName;
  } else {
    model.nodes = [
      { id: 'layout', kind: 'component', name: layoutName, props: {}, children: model.nodes },
    ];
  }
  if (!model.imports.some((i) => i.name === layoutName)) {
    model.imports.push({ name: layoutName, path: importPath });
  }
  return model;
}

export function unwrapLayout(model: PageModel): PageModel {
  const found = findParentListInModel(model, 'layout');
  if (found) {
    const node = found.list[found.index];
    const kids = Array.isArray(node.children) ? node.children : [];
    found.list.splice(found.index, 1, ...kids);
  }
  return model;
}

export function renameLayout(
  model: PageModel,
  layoutName: string,
  importPath: string
): PageModel {
  return wrapInLayout(model, layoutName, importPath);
}

function generateNewId(model: PageModel): string {
  let max = 0;
  const walk = (list: any[]) => {
    for (const n of list) {
      const num = parseInt((n.id || '').replace(/\D/g, ''), 10);
      if (num > max) max = num;
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  walk(model.nodes);
  return `n${max + 1}`;
}
