// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { describe, expect, it } from 'vitest';
import { rankResolvers, SUGGESTED_THRESHOLD } from './suggestedContext.js';

function resolver(type, label) {
  return { type, label };
}

describe('rankResolvers', () => {
  const resolvers = [
    resolver('current-file', 'Current file'),
    resolver('selected-files', 'Selected files'),
    resolver('selected-element', 'Selected element'),
    resolver('current-page', 'Current page'),
    resolver('current-component', 'Current component'),
    resolver('console-errors', 'Console errors'),
    resolver('git-diff', 'Git diff'),
    resolver('preview-screenshot', 'Preview screenshot'),
    resolver('cms-schema', 'CMS schema'),
  ];

  const appState = { devUrl: 'http://localhost:4321' };

  it('ranks selected element highest with no keyword boosts', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    expect(ranked[0].resolver.type).toBe('selected-element');
    expect(ranked[0].section).toBe('suggested');
  });

  it('puts selected-files in the project section regardless of rank', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    const sf = ranked.find((r) => r.resolver.type === 'selected-files');
    expect(sf.section).toBe('project');
  });

  it('caps the suggested section at SUGGESTED_THRESHOLD', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    const suggested = ranked.filter((r) => r.section === 'suggested');
    expect(suggested.length).toBeLessThanOrEqual(SUGGESTED_THRESHOLD);
  });

  it('boosts CMS schema when the prompt mentions CMS-related keywords', () => {
    const ranked = rankResolvers(resolvers, appState, 'add a CMS collection field for tags');
    const cms = ranked.find((r) => r.resolver.type === 'cms-schema');
    expect(cms.keywordBoost).toBeGreaterThan(0);
    expect(cms.section).toBe('suggested');
  });

  it('boosts console errors when the prompt mentions errors', () => {
    const ranked = rankResolvers(resolvers, appState, 'fix the broken build error');
    const errors = ranked.find((r) => r.resolver.type === 'console-errors');
    expect(errors.keywordBoost).toBeGreaterThan(0);
    expect(errors.section).toBe('suggested');
  });

  it('boosts current component when prompt mentions component', () => {
    const ranked = rankResolvers(resolvers, appState, 'make this a reusable component');
    const comp = ranked.find((r) => r.resolver.type === 'current-component');
    expect(comp.keywordBoost).toBeGreaterThan(0);
  });

  it('boosts preview screenshot when prompt asks about visuals', () => {
    const ranked = rankResolvers(resolvers, appState, 'the page visually looks broken');
    const shot = ranked.find((r) => r.resolver.type === 'preview-screenshot');
    expect(shot.keywordBoost).toBeGreaterThan(0);
  });

  it('returns an empty array for an empty resolver list', () => {
    expect(rankResolvers([], {}, 'fix it')).toEqual([]);
  });

  it('distributes remaining resolvers into project and visual sections', () => {
    const ranked = rankResolvers(resolvers, appState, '');
    const projects = ranked.filter((r) => r.section === 'project');
    const visuals = ranked.filter((r) => r.section === 'visual');
    expect(projects.length).toBeGreaterThan(0);
    expect(visuals.length).toBeGreaterThan(0);
    // Section grouping: all items in a section are contiguous
    const sections = [];
    let current = null;
    for (const r of ranked) {
      if (r.section !== current) {
        sections.push(r.section);
        current = r.section;
      }
    }
    expect(sections.length).toBeLessThanOrEqual(3);
  });
});
