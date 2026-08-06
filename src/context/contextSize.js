export const SIZE_THRESHOLDS = Object.freeze({
  WARNING: 4000,
  LARGE: 12000,
  BLOCK_INLINE: 30000,
});

export function sizeLevel(tokens) {
  if (tokens > SIZE_THRESHOLDS.BLOCK_INLINE) return 'blocked';
  if (tokens > SIZE_THRESHOLDS.LARGE) return 'large';
  if (tokens > SIZE_THRESHOLDS.WARNING) return 'warning';
  return 'normal';
}

const READY_STATUSES = new Set(['ready', 'stale']);
const FILE_TRIGGERING_TYPES = new Set(['git-diff']);

// Spec §13's "Recommended default": switch to writing a context file instead
// of pasting the full prompt inline once it gets large, or once it carries
// content (a Git diff, more than a few files) that a terminal's paste
// handling struggles with. Spec §20 separately blocks inline delivery
// outright above SIZE_THRESHOLDS.BLOCK_INLINE tokens (~120,000 characters) —
// that's already far past the 8,000-character trigger below, so no separate
// token check is needed here; BLOCK_INLINE still matters for sizeLevel()'s
// 'blocked' indicator.
export function shouldUseContextFile({ chips, composedMarkdown }) {
  if (composedMarkdown.length > 8000) return true;

  const filesChip = chips.find((chip) => chip.type === 'selected-files' && READY_STATUSES.has(chip.status));
  if ((filesChip?.data?.files?.length ?? 0) > 3) return true;

  return chips.some((chip) => FILE_TRIGGERING_TYPES.has(chip.type) && READY_STATUSES.has(chip.status));
}
