// Astro/Vite dev-server output has no structured error API — Stacki already
// captures it as one rolling plain-text buffer (App.jsx's `devLog`, ANSI-
// stripped, capped to the last 4,000 characters via its onDevLog handler).
// This module turns that free text into the entries the Console Errors chip
// needs, using simple heuristics rather than parsing each tool's exact
// diagnostic format: blank-line-separated blocks, classified by whether they
// mention "error" or "warn" (case-insensitive), with a best-effort
// `file:line` extracted from the block when present. There is no per-message
// timestamp in this text stream, so unlike the spec's "last five minutes"
// filter, every parsed entry is treated as current — the rolling buffer
// itself is already a recency bound (older text falls off the back of it as
// the dev server keeps running).
const LOCATION_RE = /((?:[\w-]+\/)+[\w-]+\.(?:astro|jsx?|tsx?|css|mjs|cjs|json)):(\d+)/;
const MAX_ENTRIES = 20;

/** @param {string} rawLog */
export function parseDevLogEntries(rawLog) {
  const text = String(rawLog || '').trim();
  if (!text) return [];

  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const byKey = new Map();
  const order = [];

  for (const block of blocks) {
    const isError = /error/i.test(block);
    const isWarning = !isError && /warn/i.test(block);
    if (!isError && !isWarning) continue;

    const type = isError ? 'error' : 'warning';
    const message = block.split('\n')[0].trim();
    const location = block.match(LOCATION_RE);
    const key = `${type}:${message}`;

    if (byKey.has(key)) {
      byKey.get(key).count += 1;
    } else {
      byKey.set(key, {
        type,
        message,
        file: location ? location[1] : null,
        line: location ? Number(location[2]) : null,
        count: 1,
      });
      order.push(key);
    }
  }

  // The buffer is append-only, so later blocks are more recent — surface the
  // most recent unique entries first, capped to keep the chip focused.
  return order
    .slice()
    .reverse()
    .map((key) => byKey.get(key))
    .slice(0, MAX_ENTRIES);
}
