// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { describe, expect, it } from 'vitest';
import {
  CONTEXT_CHIP_STATUS,
  CONTEXT_CHIP_TYPES,
  createSnapshot,
  estimateTokens,
  withError,
  withReady,
  withStale,
} from './contextTypes.js';

describe('contextTypes', () => {
  it('exposes every registered chip type', () => {
    expect(CONTEXT_CHIP_TYPES.CURRENT_FILE).toBe('current-file');
    expect(CONTEXT_CHIP_TYPES.SELECTED_FILES).toBe('selected-files');
    expect(CONTEXT_CHIP_TYPES.SELECTED_ELEMENT).toBe('selected-element');
    expect(CONTEXT_CHIP_TYPES.CURRENT_PAGE).toBe('current-page');
    expect(CONTEXT_CHIP_TYPES.CURRENT_COMPONENT).toBe('current-component');
    expect(CONTEXT_CHIP_TYPES.CONSOLE_ERRORS).toBe('console-errors');
    expect(CONTEXT_CHIP_TYPES.GIT_DIFF).toBe('git-diff');
    expect(CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT).toBe('preview-screenshot');
    expect(CONTEXT_CHIP_TYPES.CMS_SCHEMA).toBe('cms-schema');
  });

  it('estimates roughly one token per four characters', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(-10)).toBe(0);
  });

  it('creates a resolving snapshot with a unique id by default', () => {
    const a = createSnapshot({ type: CONTEXT_CHIP_TYPES.CURRENT_FILE, label: 'Current file' });
    const b = createSnapshot({ type: CONTEXT_CHIP_TYPES.CURRENT_FILE, label: 'Current file' });
    expect(a.id).toEqual(expect.any(String));
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe(CONTEXT_CHIP_STATUS.RESOLVING);
    expect(a.data).toBeNull();
    expect(a.options).toEqual({});
    expect(a.capturedAt).toEqual(expect.any(String));
  });

  it('accepts an explicit id', () => {
    const snapshot = createSnapshot({ type: 'current-file', label: 'x', id: 'fixed-id' });
    expect(snapshot.id).toBe('fixed-id');
  });

  it('moves a snapshot to ready with estimated size and revision', () => {
    const snapshot = createSnapshot({ type: 'current-file', label: 'Current file' });
    const ready = withReady(snapshot, {
      data: { content: 'abcd' },
      estimatedCharacters: 4,
      sourceRevision: 'rev-1',
    });
    expect(ready.status).toBe(CONTEXT_CHIP_STATUS.READY);
    expect(ready.data).toEqual({ content: 'abcd' });
    expect(ready.sourceRevision).toBe('rev-1');
    expect(ready.estimatedCharacters).toBe(4);
    expect(ready.estimatedTokens).toBe(1);
    expect(ready.error).toBeNull();
  });

  it('marks a ready snapshot stale without discarding its data', () => {
    const ready = withReady(createSnapshot({ type: 'current-file', label: 'x' }), {
      data: { content: 'abcd' },
      estimatedCharacters: 4,
      sourceRevision: 'rev-1',
    });
    const stale = withStale(ready);
    expect(stale.status).toBe(CONTEXT_CHIP_STATUS.STALE);
    expect(stale.data).toEqual({ content: 'abcd' });
  });

  it('captures a resolve failure', () => {
    const snapshot = createSnapshot({ type: 'current-file', label: 'x' });
    const failed = withError(snapshot, new Error('disk exploded'));
    expect(failed.status).toBe(CONTEXT_CHIP_STATUS.ERROR);
    expect(failed.error).toEqual({ code: 'resolve-failed', message: 'disk exploded' });
  });
});
