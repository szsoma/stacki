import { describe, expect, it } from 'vitest';
import { SIZE_THRESHOLDS, shouldUseContextFile, sizeLevel } from './contextSize.js';

describe('sizeLevel', () => {
  it('is normal at and below the warning threshold', () => {
    expect(sizeLevel(0)).toBe('normal');
    expect(sizeLevel(SIZE_THRESHOLDS.WARNING)).toBe('normal');
  });

  it('is warning above the warning threshold and at or below large', () => {
    expect(sizeLevel(SIZE_THRESHOLDS.WARNING + 1)).toBe('warning');
    expect(sizeLevel(SIZE_THRESHOLDS.LARGE)).toBe('warning');
  });

  it('is large above the large threshold and at or below block-inline', () => {
    expect(sizeLevel(SIZE_THRESHOLDS.LARGE + 1)).toBe('large');
    expect(sizeLevel(SIZE_THRESHOLDS.BLOCK_INLINE)).toBe('large');
  });

  it('is blocked above the block-inline threshold', () => {
    expect(sizeLevel(SIZE_THRESHOLDS.BLOCK_INLINE + 1)).toBe('blocked');
  });
});

describe('shouldUseContextFile', () => {
  it('is false for a small prompt with no chips', () => {
    expect(shouldUseContextFile({ chips: [], composedMarkdown: 'short prompt' })).toBe(false);
  });

  it('is true once the composed markdown exceeds 8,000 characters', () => {
    expect(shouldUseContextFile({ chips: [], composedMarkdown: 'x'.repeat(8001) })).toBe(true);
    expect(shouldUseContextFile({ chips: [], composedMarkdown: 'x'.repeat(8000) })).toBe(false);
  });

  it('is true when the Selected files chip has more than three files', () => {
    const chip = { type: 'selected-files', status: 'ready', data: { files: [{}, {}, {}, {}] } };
    expect(shouldUseContextFile({ chips: [chip], composedMarkdown: 'short' })).toBe(true);
  });

  it('is false when the Selected files chip has three or fewer files', () => {
    const chip = { type: 'selected-files', status: 'ready', data: { files: [{}, {}, {}] } };
    expect(shouldUseContextFile({ chips: [chip], composedMarkdown: 'short' })).toBe(false);
  });

  it('is true when a ready Git diff chip is attached', () => {
    const chip = { type: 'git-diff', status: 'ready', data: {} };
    expect(shouldUseContextFile({ chips: [chip], composedMarkdown: 'short' })).toBe(true);
  });

  it('is true when a stale Git diff chip is attached', () => {
    const chip = { type: 'git-diff', status: 'stale', data: {} };
    expect(shouldUseContextFile({ chips: [chip], composedMarkdown: 'short' })).toBe(true);
  });

  it('ignores a Git diff chip that is still resolving or failed', () => {
    const resolving = { type: 'git-diff', status: 'resolving', data: null };
    const errored = { type: 'git-diff', status: 'error', data: null };
    expect(shouldUseContextFile({ chips: [resolving], composedMarkdown: 'short' })).toBe(false);
    expect(shouldUseContextFile({ chips: [errored], composedMarkdown: 'short' })).toBe(false);
  });
});
