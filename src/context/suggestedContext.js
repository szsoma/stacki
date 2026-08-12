// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
export const SUGGESTED_THRESHOLD = 3;

const PRIORITY = Object.freeze({
  'selected-element': 8,
  'current-component': 7,
  'current-page': 6,
  'cms-schema': 5,
  'console-errors': 4,
  'current-file': 3,
  'git-diff': 2,
  'preview-screenshot': 1,
  'selected-files': 0,
});

const SECTION = Object.freeze({
  'selected-element': 'visual',
  'current-component': 'visual',
  'current-page': 'visual',
  'console-errors': 'visual',
  'preview-screenshot': 'visual',
  'current-file': 'project',
  'selected-files': 'project',
  'cms-schema': 'project',
  'git-diff': 'project',
});

const KEYWORD_BOOSTS = [
  { keywords: ['error', 'broken', 'fails'], type: 'console-errors', boost: 2 },
  { keywords: ['component', 'reusable'], type: 'current-component', boost: 2 },
  { keywords: ['cms', 'collection', 'field'], type: 'cms-schema', boost: 2 },
  { keywords: ['screenshot', 'visually', 'looks like'], type: 'preview-screenshot', boost: 2 },
  { keywords: ['review changes', 'diff'], type: 'git-diff', boost: 2 },
  { keywords: ['layout', 'spacing', 'responsive'], type: 'selected-element', boost: 1 },
  { keywords: ['page', 'route'], type: 'current-page', boost: 1 },
];

function computeBoost(type, prompt) {
  if (!prompt) return 0;
  const lower = prompt.toLowerCase();
  let total = 0;
  for (const { keywords, type: targetType, boost } of KEYWORD_BOOSTS) {
    if (targetType !== type) continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) total += boost;
    }
  }
  return total;
}

export function rankResolvers(availableResolvers, _appState, prompt) {
  if (!availableResolvers.length) return [];

  const withMeta = availableResolvers.map((resolver) => {
    const priority = PRIORITY[resolver.type] ?? 0;
    const baseSection = SECTION[resolver.type] || 'project';
    const keywordBoost = computeBoost(resolver.type, prompt);
    const effectivePriority = priority + keywordBoost;
    return { resolver, section: baseSection, keywordBoost, effectivePriority, priority };
  });

  const sorted = [...withMeta].sort((a, b) => b.effectivePriority - a.effectivePriority);
  let suggestedCount = 0;
  for (const entry of sorted) {
    if (entry.resolver.type === 'selected-files') continue;
    if (suggestedCount >= SUGGESTED_THRESHOLD) break;
    entry.section = 'suggested';
    suggestedCount++;
  }

  withMeta.sort((a, b) => {
    const sectionOrder = { suggested: 0, project: 1, visual: 2 };
    const aSection = sectionOrder[a.section] ?? 3;
    const bSection = sectionOrder[b.section] ?? 3;
    if (aSection !== bSection) return aSection - bSection;
    if (a.resolver.type === 'selected-files') return 1;
    if (b.resolver.type === 'selected-files') return -1;
    return b.priority - a.priority;
  });

  return withMeta;
}
