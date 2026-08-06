import { describe, expect, it } from 'vitest';
import { parseDevLogEntries } from './devLogParser.js';

describe('parseDevLogEntries', () => {
  it('returns nothing for empty or missing log text', () => {
    expect(parseDevLogEntries('')).toEqual([]);
    expect(parseDevLogEntries(null)).toEqual([]);
    expect(parseDevLogEntries('   \n  ')).toEqual([]);
  });

  it('ignores blocks that mention neither "error" nor "warn"', () => {
    expect(parseDevLogEntries('12:00:01 PM [vite] ready in 240 ms')).toEqual([]);
  });

  it('parses a single error block, extracting the file and line', () => {
    const log = [
      '9:14:02 PM [vite] Internal server error: Failed to resolve import "./Missing.astro" from src/pages/index.astro',
      '  at src/pages/index.astro:5:10',
    ].join('\n');
    expect(parseDevLogEntries(log)).toEqual([
      {
        type: 'error',
        message:
          '9:14:02 PM [vite] Internal server error: Failed to resolve import "./Missing.astro" from src/pages/index.astro',
        file: 'src/pages/index.astro',
        line: 5,
        count: 1,
      },
    ]);
  });

  it('parses a warning block with no location', () => {
    expect(parseDevLogEntries('[astro] Warning: Unused CSS selector .foo')).toEqual([
      { type: 'warning', message: '[astro] Warning: Unused CSS selector .foo', file: null, line: null, count: 1 },
    ]);
  });

  it('groups identical repeated blocks and counts them', () => {
    const block = 'Error: could not connect to dev server';
    const log = [block, 'unrelated ready message', block].join('\n\n');
    expect(parseDevLogEntries(log)).toEqual([
      { type: 'error', message: block, file: null, line: null, count: 2 },
    ]);
  });

  it('orders the most recently appended block first', () => {
    const log = ['Error: first problem', 'Warning: second problem'].join('\n\n');
    const entries = parseDevLogEntries(log);
    expect(entries.map((e) => e.message)).toEqual(['Warning: second problem', 'Error: first problem']);
  });

  it('caps output at 20 unique entries, keeping the most recent', () => {
    const blocks = Array.from({ length: 25 }, (_, i) => `Error: problem number ${i}`);
    const entries = parseDevLogEntries(blocks.join('\n\n'));
    expect(entries).toHaveLength(20);
    expect(entries[0].message).toBe('Error: problem number 24');
    expect(entries[19].message).toBe('Error: problem number 5');
  });
});
