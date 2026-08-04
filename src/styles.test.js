// @vitest-environment node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  fileURLToPath(new URL('./styles.css', import.meta.url)),
  'utf8',
);

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

describe('terminal title styles', () => {
  it('keeps the terminal title typography aligned with the CMS title', () => {
    const terminalTitle = declarationsFor('\\.terminal-header h2');
    const cmsTitle = declarationsFor('\\.panel-header h2');

    for (const property of [
      'font-size',
      'font-weight',
      'color',
      'letter-spacing',
    ]) {
      expect(terminalTitle[property]).toBe(cmsTitle[property]);
    }
  });
});
