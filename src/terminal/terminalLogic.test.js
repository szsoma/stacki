import { describe, expect, it } from 'vitest';

import {
  TERMINAL_DEFAULT_WIDTH,
  TERMINAL_MAX_RATIO,
  TERMINAL_MIN_WIDTH,
  clampTerminalWidth,
  isTerminalShortcut,
} from './terminalLogic.js';

describe('terminal panel width rules', () => {
  it('uses the specified default, minimum, and maximum ratio', () => {
    expect(TERMINAL_DEFAULT_WIDTH).toBe(480);
    expect(TERMINAL_MIN_WIDTH).toBe(320);
    expect(TERMINAL_MAX_RATIO).toBe(0.7);
  });

  it('keeps a valid default width unchanged', () => {
    expect(clampTerminalWidth(TERMINAL_DEFAULT_WIDTH, 1_000)).toBe(480);
  });

  it('clamps a low width to the 320px minimum', () => {
    expect(clampTerminalWidth(100, 1_000)).toBe(320);
  });

  it('clamps a high width to 70% of the workspace', () => {
    expect(clampTerminalWidth(900, 1_001)).toBe(700);
  });

  it('normalizes numeric inputs and keeps the minimum safe for narrow workspaces', () => {
    expect(clampTerminalWidth('479.6', '1000')).toBe(480);
    expect(clampTerminalWidth('not-a-width', 1_000)).toBe(320);
    expect(clampTerminalWidth(480, 200)).toBe(320);
  });
});

describe('terminal keyboard shortcut', () => {
  it('matches Option plus the physical T key on a Hungarian layout', () => {
    expect(
      isTerminalShortcut({
        altKey: true,
        code: 'KeyT',
        key: 'í',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
  });

  it.each([
    ['without Option', { altKey: false, code: 'KeyT' }],
    ['with Command', { altKey: true, code: 'KeyT', metaKey: true }],
    ['with Control', { altKey: true, code: 'KeyT', ctrlKey: true }],
    ['with Shift', { altKey: true, code: 'KeyT', shiftKey: true }],
    ['from a character-only match', { altKey: true, key: 't' }],
    ['from a lookalike physical key', { altKey: true, code: 'KeyI', key: 't' }],
  ])('rejects %s', (_label, event) => {
    expect(isTerminalShortcut(event)).toBe(false);
  });
});
