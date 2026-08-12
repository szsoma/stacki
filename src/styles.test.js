// @vitest-environment node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  fileURLToPath(new URL('./styles.css', import.meta.url)),
  'utf8',
);

/** @param {string} selector */
function declarationsFor(selector) {
  const match = styles.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);

  return Object.fromEntries(
    match[1]
      .split(';')
      .map((declaration) => declaration.trim().split(/\s*:\s*/))
      .filter(([property, value]) => property && value),
  );
}

/** @param {string} selector */
function declarationsForRuleContaining(selector) {
  for (const match of styles.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((part) => part.trim());
    if (!selectors.includes(selector)) continue;

    return Object.fromEntries(
      match[2]
        .split(';')
        .map((declaration) => declaration.trim().split(/\s*:\s*/))
        .filter(([property, value]) => property && value),
    );
  }

  throw new Error(`Missing CSS rule containing ${selector}`);
}

describe('terminal title styles', () => {
  it('keeps the terminal title typography aligned with the CMS title', () => {
    const terminalTitle = declarationsFor('\\.terminal-header h2');
    const panelTitle = declarationsFor('\\.panel-header h2');

    expect(terminalTitle).toEqual(panelTitle);
  });
});

describe('canvas node outline styles', () => {
  it('uses the accent outline and tag treatment in component edit mode', () => {
    expect(declarationsFor('\\.node-outline\\.component-edit')).toMatchObject({
      'outline-color': 'var(--accent)',
    });
    expect(declarationsFor('\\.node-outline\\.component-edit \\.node-outline-tag')).toMatchObject({
      background: 'var(--accent)',
      color: 'white',
    });
    expect(declarationsFor('\\.node-outline\\.component-edit\\.hover')).toMatchObject({
      background: 'transparent',
    });
    expect(declarationsFor('\\.node-outline\\.component-edit\\.hover \\.node-outline-tag')).toMatchObject({
      background: 'transparent',
      color: 'var(--accent)',
    });
  });

  it('keeps base, selected, and page-view outline colors unchanged', () => {
    expect(declarationsFor('\\.node-outline')).toMatchObject({ outline: '1px solid var(--accent)' });
    expect(declarationsFor('\\.node-outline\\.sel')).toMatchObject({ 'outline-width': '2px' });
    expect(declarationsFor('\\.node-outline\\.component')).toMatchObject({
      'outline-color': 'var(--green)',
    });
    expect(declarationsForRuleContaining('.node-outline.bound')).toMatchObject({
      'outline-color': '#8b5cf6',
    });
    expect(declarationsForRuleContaining('.node-outline.map')).toMatchObject({
      'outline-color': '#8b5cf6',
    });
  });
});
