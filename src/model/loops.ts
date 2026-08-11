import type { AstroNode } from '../types/ast';

const MAP_HEAD_RE = /^([\s\S]+?)\.map\(\s*\(\s*([\w$]+)\s*(?:,\s*([\w$]+)\s*)?\)\s*=>\s*\($/;

export function splitMapHead(head: string): { data: string; item: string; index: string } | null {
  const m = String(head).trim().match(MAP_HEAD_RE);
  return m ? { data: m[1].trim(), item: m[2], index: m[3] || '' } : null;
}

const renameIdent = (code: string, from: string, to: string): string =>
  String(code ?? '').replace(new RegExp(`(?<![.\\w$])${from}(?![\\w$])`, 'g'), to);

const renameInBraces = (text: string, from: string, to: string): string =>
  String(text ?? '').replace(/\{([^{}]*)\}/g, (_, inner) => `{${renameIdent(inner, from, to)}}`);

export function renameLoopVar(nodes: AstroNode[], from: string, to: string): void {
  for (const n of nodes) {
    if (n.kind === 'map') {
      const p = splitMapHead(n.head);
      if (p) {
        const data = renameIdent(p.data, from, to);
        if (data !== p.data) {
          n.head = `${data}.map((${p.item}${p.index ? `, ${p.index}` : ''}) => (`;
        }
        if (p.item === from || p.index === from) continue;
      } else {
        n.head = renameIdent(n.head, from, to);
      }
    } else if (n.kind === 'expr') {
      n.value = renameIdent(n.value, from, to);
    } else if (n.kind === 'text') {
      n.value = renameInBraces(n.value, from, to);
    }
    for (const [key, v] of Object.entries(n.props || {})) {
      if (v?.type === 'expr') n.props![key] = { ...v, value: renameIdent(v.value, from, to) };
    }
    if (Array.isArray(n.children)) renameLoopVar(n.children, from, to);
  }
}

export function parseLoopHead(
  head: string
): { data: string; item: string; index: string } | null {
  const m = String(head || '').match(
    /^([\s\S]*?)\.map\(\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\)\s*=>\s*\($/
  );
  return m ? { data: m[1].trim(), item: m[2], index: m[3] || '' } : null;
}

const readsVar = (expr: string, v: string): boolean =>
  new RegExp(`(^|[^\\w$.])${v}\\b`).test(String(expr || ''));

export function disconnectDependentLoops(list: AstroNode[], vars: string[]): void {
  for (const n of list || []) {
    if (!Array.isArray(n.children)) continue;
    if (n.kind === 'map') {
      const h = parseLoopHead(n.head);
      if (h && vars.some((v) => readsVar(h.data, v))) {
        n.head = `[].map((${h.item}${h.index ? `, ${h.index}` : ''}) => (`;
      }
      const shadowed = new Set([h?.item, h?.index].filter(Boolean));
      const rest = vars.filter((v) => !shadowed.has(v));
      if (rest.length) disconnectDependentLoops(n.children, rest);
    } else {
      disconnectDependentLoops(n.children, vars);
    }
  }
}

export function loopVarsAt(nodes: AstroNode[], id: string): string[] {
  const vars: string[] = [];
  const walk = (list: AstroNode[], scope: string[]): boolean => {
    for (const n of list) {
      if (n.id === id) {
        vars.push(...scope);
        return true;
      }
      if (Array.isArray(n.children)) {
        const next =
          n.kind === 'map'
            ? [
                ...scope,
                ...[parseLoopHead(n.head)?.item, parseLoopHead(n.head)?.index].filter(
                  Boolean
                ) as string[],
              ]
            : scope;
        if (walk(n.children, next)) return true;
      }
    }
    return false;
  };
  walk(nodes, []);
  return [...new Set(vars)];
}

const UNBOUND_TEXT = 'content';

export function stripLostBindings(node: AstroNode, vars: string[]): number {
  if (!vars.length) return 0;
  let removed = 0;
  const walk = (n: AstroNode) => {
    for (const [k, v] of Object.entries(n.props || {})) {
      if (v?.type === 'expr' && vars.some((x) => readsVar(v.value, x))) {
        delete n.props![k];
        removed++;
      }
    }
    if (n.kind === 'expr' && vars.some((x) => readsVar(n.value, x))) {
      removed++;
      (n as any).kind = 'text';
      (n as any).value = UNBOUND_TEXT;
      delete (n as any).head;
      delete (n as any).children;
      return;
    }
    if (n.kind === 'text' && n.value.includes('{')) {
      const next = n.value.replace(/\{([^{}]*)\}/g, (whole, inner) =>
        vars.some((x) => readsVar(inner, x)) ? UNBOUND_TEXT : whole
      );
      if (next !== n.value) {
        removed++;
        n.value = next;
      }
    }
    if (n.kind === 'map') {
      const h = parseLoopHead(n.head);
      if (h && vars.some((x) => readsVar(h.data, x))) {
        n.head = `[].map((${h.item}${h.index ? `, ${h.index}` : ''}) => (`;
        removed++;
      }
    }
    if (Array.isArray(n.children)) {
      n.children.forEach(walk);
      n.children = n.children.filter((c) => !(c as any).__drop);
    }
  };
  walk(node);
  return removed;
}
