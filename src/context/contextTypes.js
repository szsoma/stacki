export const CONTEXT_CHIP_TYPES = Object.freeze({
  CURRENT_FILE: 'current-file',
  SELECTED_FILES: 'selected-files',
  SELECTED_ELEMENT: 'selected-element',
  CURRENT_PAGE: 'current-page',
  CURRENT_COMPONENT: 'current-component',
  CONSOLE_ERRORS: 'console-errors',
  GIT_DIFF: 'git-diff',
});

export const CONTEXT_CHIP_STATUS = Object.freeze({
  RESOLVING: 'resolving',
  READY: 'ready',
  STALE: 'stale',
  ERROR: 'error',
});

export function estimateTokens(characterCount) {
  const chars = Math.max(0, Number(characterCount) || 0);
  return Math.ceil(chars / 4);
}

let nextSnapshotId = 0;

export function createSnapshot({ type, label, options = {}, id } = {}) {
  nextSnapshotId += 1;
  return {
    id: id || `chip-${nextSnapshotId}`,
    type,
    label,
    status: CONTEXT_CHIP_STATUS.RESOLVING,
    capturedAt: new Date().toISOString(),
    sourceRevision: null,
    estimatedCharacters: 0,
    estimatedTokens: 0,
    options,
    data: null,
    error: null,
  };
}

export function withReady(snapshot, { data, estimatedCharacters, sourceRevision }) {
  return {
    ...snapshot,
    status: CONTEXT_CHIP_STATUS.READY,
    capturedAt: new Date().toISOString(),
    data,
    sourceRevision,
    estimatedCharacters,
    estimatedTokens: estimateTokens(estimatedCharacters),
    error: null,
  };
}

export function withStale(snapshot) {
  return { ...snapshot, status: CONTEXT_CHIP_STATUS.STALE };
}

export function withError(snapshot, error) {
  return {
    ...snapshot,
    status: CONTEXT_CHIP_STATUS.ERROR,
    error: {
      code: 'resolve-failed',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}
