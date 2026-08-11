import type { AstroNode, PageModel } from '../types/ast';

export function findNodeById(nodes: AstroNode[], id: string): AstroNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (Array.isArray(node.children)) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParentList(
  model: PageModel,
  id: string
): { list: AstroNode[]; index: number } | null {
  const search = (list: AstroNode[]): { list: AstroNode[]; index: number } | null => {
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

export function isDescendantOf(candidateParent: AstroNode, id: string): boolean {
  if (!Array.isArray(candidateParent.children)) return false;
  return !!findNodeById(candidateParent.children, id) || candidateParent.id === id;
}

export function pathOfNode(nodes: AstroNode[], id: string, trail: number[] = []): number[] | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return [...trail, i];
    if (Array.isArray(n.children)) {
      const p = pathOfNode(n.children, id, [...trail, i]);
      if (p) return p;
    }
  }
  return null;
}

export function ancestorChain(
  nodes: AstroNode[],
  id: string,
  trail: AstroNode[] = []
): AstroNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [...trail, node];
    if (Array.isArray(node.children)) {
      const r = ancestorChain(node.children, id, [...trail, node]);
      if (r) return r;
    }
  }
  return null;
}

export function nodeAtPath(nodes: AstroNode[], trail: number[]): AstroNode | null {
  let list: AstroNode[] | null = nodes;
  let node: AstroNode | null = null;
  for (const i of trail) {
    node = list?.[i] ?? null;
    if (!node) return null;
    list = Array.isArray(node.children) ? node.children : [];
  }
  return node;
}

export function findParentNode(nodes: AstroNode[], id: string): AstroNode | null {
  for (const n of nodes) {
    if (!Array.isArray(n.children)) continue;
    if (n.children.some((c) => c.id === id)) return n;
    const found = findParentNode(n.children, id);
    if (found) return found;
  }
  return null;
}
