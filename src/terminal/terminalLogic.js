export const TERMINAL_DEFAULT_WIDTH = 480;
export const TERMINAL_MIN_WIDTH = 320;
export const TERMINAL_MAX_RATIO = 0.7;

export function clampTerminalWidth(width, workspaceWidth) {
  const safeWorkspace = Math.max(
    TERMINAL_MIN_WIDTH,
    Number(workspaceWidth) || 0,
  );
  const maxWidth = Math.max(
    TERMINAL_MIN_WIDTH,
    Math.floor(safeWorkspace * TERMINAL_MAX_RATIO),
  );
  const normalizedWidth = Math.round(Number(width) || 0);

  return Math.min(
    maxWidth,
    Math.max(TERMINAL_MIN_WIDTH, normalizedWidth),
  );
}

export function isTerminalShortcut(event) {
  return (
    Boolean(event?.altKey) &&
    !event?.metaKey &&
    !event?.ctrlKey &&
    !event?.shiftKey &&
    event?.code === 'KeyT'
  );
}
