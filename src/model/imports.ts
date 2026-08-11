import type { PageModel } from '../types/ast';

export function collectUsedNames(model: PageModel): Set<string> {
  const used = new Set<string>();
  const walk = (list: any[]) => {
    for (const node of list) {
      if (node.name) used.add(node.name);
      if (Array.isArray(node.children)) walk(node.children);
    }
  };
  walk(model.nodes);
  return used;
}

export function pruneImports(model: PageModel): PageModel {
  const used = collectUsedNames(model);
  model.imports = model.imports.filter(
    (i) => !i.path.endsWith('.astro') || used.has(i.name)
  );
  return model;
}

export function chooseImportPath(
  model: PageModel,
  { relative, srcRelative }: { relative: string; srcRelative: string }
): string {
  if (srcRelative) {
    for (const imp of model.imports) {
      if (imp.path.startsWith('.')) continue;
      for (const marker of ['/components/', '/layouts/']) {
        const idx = imp.path.indexOf(marker);
        if (idx > 0) return imp.path.slice(0, idx + 1) + srcRelative;
      }
    }
  }
  return relative;
}
