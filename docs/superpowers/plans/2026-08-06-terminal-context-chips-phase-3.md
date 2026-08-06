# Terminal Context Chips (Phase 3: Runtime and Repository Context) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach the dev server's recent build/runtime errors and the project's uncommitted Git diff as context chips — on top of Phase 1/2's file, selection, page, and component chips — and make the composed prompt safe and deliverable at any size: an aggregate context-size indicator with spec-defined warning thresholds, automatic context-file (Mode B) delivery when the prompt gets too large or carries a Git diff, and a visible warning when attached text looks like it contains a secret.

**Architecture:** Two new resolvers (`consoleErrorsResolver`, `gitDiffResolver`) plug into the existing resolver registry and chip-bar UI with no new UI components, exactly like Phase 2. `consoleErrorsResolver` reads Stacki's existing rolling dev-server log text (`devLog`, already captured in `App.jsx`) through a new pure parser (`src/context/devLogParser.js`) — there is no structured browser-console-error API in this codebase, so this resolver surfaces build/dev-server errors, not live browser `console.error` calls (documented as a scoped exclusion below). `gitDiffResolver` reads a new `context:gitDiff` IPC channel that shells out to `git diff`/`git status`/`git log` through the same `runGit` primitive `electron/main.js` already uses for the Git panel, excluding lockfiles and build directories and truncating oversized diffs. A new pure `src/context/secretScan.js` module scans attached diff/file text for common secret patterns and surfaces a visible warning in the affected chip's own rendered Markdown — it warns, it never redacts or blocks sending. A new pure `src/context/contextSize.js` module turns the total composed-prompt size into a warning level for a small UI indicator in `ContextChipBar`, and decides when `useTerminalContext`'s `insertIntoTerminal` should write the composed prompt to a project-local file (`.stacki/tmp/context/request-<timestamp>.md`, via a new `context:writeContextBundle` IPC channel) and paste a short pointer to it instead of the full text — Mode B from the spec.

**Tech Stack:** Electron 33, React 18, Vite 6, Vitest 3.2, `@testing-library/react`, the existing `@xterm/xterm` terminal panel, Node's `child_process.execFile` (via `electron/main.js`'s existing `run`/`git` helpers), the project's own `git` binary (no new dependency).

## Global Constraints

- This plan implements spec §30 Phase 3 ("Runtime and repository context"): console errors, Git diff, size estimation, context-file delivery, and secret detection. Preview Screenshot, CMS Schema, responsive context, and suggested-context ranking (§30 Phase 4) are out of scope.
- **Console errors are sourced from the existing dev-server log buffer (`devLog`), not from browser `console.error`/`window.onerror`.** This codebase has no mechanism today that intercepts the preview iframe's own console or uncaught errors (confirmed by reading `electron/preload.js`'s iframe branch in full — it forwards hover/selection/resize messages only) and building one is a materially separate, riskier subsystem (a new preload interception layer plus an aggregation buffer) than anything else in this phase. `devLog` already accumulates exactly the class of message spec §9.5 asks for ("runtime, preview, Astro, build... errors") because it is the Astro/Vite dev server's own stdout/stderr, already captured by `App.jsx`'s `onDevLog` handler. Excluded from spec §9.5's "included information" for this reason: **timestamp** (the rolling text buffer carries no per-line timestamp, so "errors from the last five minutes" cannot be filtered — the buffer's own 4,000-character rolling cap is the only recency bound), **related route** and **browser-console metadata** (no per-message route association exists), and the **"Current page only" / "All recent errors" user options** (same reason). "Errors only" / "Errors and warnings" is implemented (§9.5's other two user options).
- **The dev-log parser is a heuristic, not a structured-error parser.** Astro and Vite don't expose a structured diagnostics API to this app; `devLogParser.js` classifies blank-line-separated blocks of the raw log text by whether they contain the word "error" or "warn" (case-insensitive) and best-effort extracts a `file:line` if the block contains one. This is sufficient for the chip's purpose (give an agent the recent problem text) without needing to model every tool's exact diagnostic format.
- **Git Diff has no `computeStaleKey`, matching Phase 1's `selectedFilesResolver` precedent.** `computeStaleKey(appState)` is a synchronous function called from a `useEffect` on every `appState` change (see `useTerminalContext.js`); detecting a real Git state change requires an async `git status` round trip, which the current staleness mechanism has no hook for. Building that would mean polling git on a timer — a new architecture this plan doesn't need. A user who wants fresh Git state re-clicks **Refresh** on the chip, exactly like Selected Files today.
- **Git Diff's "Selected files" scope (spec §9.7) is not implemented.** Only "All changes" (default), "Staged changes", and "Unstaged changes" are — diffing a hand-picked file subset would need the same file-picker `ContextPicker` already has for Selected Files, wired a second time for a second chip type, for a case the Selected Files chip already mostly covers (attaching a file's current contents, just not as a diff).
- **Secret-content scanning (`scanForSecrets`) is wired into `gitDiffResolver` and `selectedFilesResolver` only**, not into `currentFileResolver`, `selectedElementResolver`, `currentPageResolver`, or `currentComponentResolver`. Those four resolvers' source excerpts are already narrowly scoped to one component/page/element the user explicitly selected in the visual editor, and `currentFileResolver`/`selectedElementResolver`'s underlying reads are bounded, reviewed-by-construction snippets — not the kind of bulk, unreviewed working-tree text a Git diff or a hand-picked file list can carry. Extending the scan to all six resolvers is a one-line change per resolver if wanted later; it isn't required by this phase's acceptance criteria (§31 Security: "possible secrets trigger a visible warning" — satisfied for the two content-bulk sources).
- **Secret detection surfaces a visible Markdown warning; it does not implement spec §19's interactive `[Exclude value] [Exclude file] [Review context] [Send anyway]` picker.** The warning appears at the top of the affected chip's rendered Markdown (visible in its details popover and in the composed prompt before the user presses Enter in the terminal), satisfying "the user must always be able to answer... does it contain sensitive information?" (§34) without a new modal/gating UI.
- **`useTerminalContext`'s `deliveryMode` stays implicit ("auto" only).** Spec §16 models `deliveryMode: "auto" | "inline" | "file"` and §22 describes an "Insert without sending" / "Insert and send" dropdown; this plan implements only the automatic Mode A/B choice per §13's own "Recommended default" rule. A manual override control and the send-vs-insert dropdown are new UI affordances not required by this phase's four bullets (console errors, Git diff, size estimation, context-file delivery, secret detection) and are left for later.
- Temporary context bundles are Git-ignored **without editing the user's own project `.gitignore`**: `.stacki/tmp/context/` gets a sibling `.stacki/tmp/.gitignore` containing `*`, which Git honors regardless of what the outer project's own `.gitignore` does or doesn't list. Stacki must never rewrite a file the user's project owns.
- No TypeScript: this codebase is plain JS/JSX. New pure modules under `src/context/` follow Phase 1/2's precedent (plain objects/functions, not TS interfaces).
- New Electron logic follows the established `electron/contextFiles.js` (dependency-injected pure logic) + `electron/contextIpc.js` (thin `ipcMain` wiring with sender validation) split.
- IPC exposed to the renderer stays on the single existing `window.avb` object in `electron/preload.js`.
- Every shell command in this plan is `rtk`-prefixed, per the user's global tooling setup.
- Follow TDD for every task: write the failing test, confirm RED, implement, confirm GREEN, commit.
- Every file/line reference in this plan was read directly from the current repository state (post-Phase-2, including its later fix commits), not from either prior plan document.

---

**Source spec:** docs/superpowers/specs/terminal-chips.md (§1–§34; this plan implements §30 Phase 3 only)

**Prior work:** docs/superpowers/plans/2026-08-05-terminal-context-chips-phase-1.md and docs/superpowers/plans/2026-08-06-terminal-context-chips-phase-2.md (both merged) implemented the `ContextSnapshot` model, resolver registry, `useTerminalContext` hook, chip bar UI, per-resolver staleness, and the Current File / Selected Files / Selected Element / Current Page / Current Component resolvers this plan builds on.

**Starting point:** create a dedicated implementation worktree from the commit containing this plan, preserve unrelated user changes, and execute each task from that worktree.

## File Structure

### New files

- `src/context/secretScan.js` — `scanForSecrets(text) -> string[]`, a pure pattern scanner (spec §19).
- `src/context/secretScan.test.js`
- `src/context/devLogParser.js` — `parseDevLogEntries(rawLog) -> Array<{type, message, file, line, count}>`, parses Stacki's rolling dev-server log text.
- `src/context/devLogParser.test.js`
- `src/context/contextSize.js` — `SIZE_THRESHOLDS`, `sizeLevel(tokens)`, `shouldUseContextFile({chips, composedMarkdown})` (spec §13, §20).
- `src/context/contextSize.test.js`
- `src/context/consoleErrorsResolver.js` — resolver for recent dev-server errors/warnings (spec §9.5).
- `src/context/consoleErrorsResolver.test.js`
- `src/context/gitDiffResolver.js` — resolver for the project's uncommitted Git diff (spec §9.7).
- `src/context/gitDiffResolver.test.js`

### Modified files

- `src/context/contextTypes.js` — add `CONSOLE_ERRORS`, `GIT_DIFF` to `CONTEXT_CHIP_TYPES`.
- `src/context/contextTypes.test.js`
- `src/context/selectedFilesResolver.js` — attach `secretWarnings` to resolved data using `scanForSecrets`.
- `src/context/selectedFilesResolver.test.js`
- `src/context/useTerminalContext.js` — `insertIntoTerminal` chooses inline vs. context-file delivery via `shouldUseContextFile`.
- `src/context/useTerminalContext.test.js`
- `electron/contextFiles.js` — add `writeContextBundle(root, content, deps)`.
- `electron/contextFiles.test.js`
- `electron/contextIpc.js` — add `context:writeContextBundle` and `context:gitDiff` channels; accept injected `writeContextBundle` and `runGit`.
- `electron/contextIpc.test.js`
- `electron/preload.js` — expose `writeContextBundle`, `getGitDiff` on `window.avb`.
- `electron/main.js` — pass `runGit` into `registerContextIpc({...})`.
- `src/panels/ContextChipBar.jsx` — register the two new resolvers; merge `devLog` into `appState`; wrap `getGitDiff`/`writeContextBundle`; render a context-size indicator.
- `src/panels/ContextChipBar.test.jsx`
- `src/panels/TerminalPanel.jsx` — accept and forward a `devLog` prop.
- `src/panels/TerminalPanel.test.jsx`
- `src/App.jsx` — pass the existing `devLog` state to `<TerminalPanel>`.
- `src/styles.css` — add `.context-size-indicator` rules.

## Task 1: Add the two new chip types

**Files:**

- Modify: `src/context/contextTypes.js:1-7`
- Modify: `src/context/contextTypes.test.js:13-19`

**Interfaces:**

- Produces: `CONTEXT_CHIP_TYPES.CONSOLE_ERRORS === 'console-errors'`, `CONTEXT_CHIP_TYPES.GIT_DIFF === 'git-diff'`.

- [ ] **Step 1: Extend the failing test**

In `src/context/contextTypes.test.js`, replace the `'exposes every registered chip type'` test:

~~~js
  it('exposes every registered chip type', () => {
    expect(CONTEXT_CHIP_TYPES.CURRENT_FILE).toBe('current-file');
    expect(CONTEXT_CHIP_TYPES.SELECTED_FILES).toBe('selected-files');
    expect(CONTEXT_CHIP_TYPES.SELECTED_ELEMENT).toBe('selected-element');
    expect(CONTEXT_CHIP_TYPES.CURRENT_PAGE).toBe('current-page');
    expect(CONTEXT_CHIP_TYPES.CURRENT_COMPONENT).toBe('current-component');
    expect(CONTEXT_CHIP_TYPES.CONSOLE_ERRORS).toBe('console-errors');
    expect(CONTEXT_CHIP_TYPES.GIT_DIFF).toBe('git-diff');
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextTypes.test.js
~~~

Expected: FAIL — the two new keys are `undefined`.

- [ ] **Step 3: Extend the type map**

In `src/context/contextTypes.js`:

~~~js
export const CONTEXT_CHIP_TYPES = Object.freeze({
  CURRENT_FILE: 'current-file',
  SELECTED_FILES: 'selected-files',
  SELECTED_ELEMENT: 'selected-element',
  CURRENT_PAGE: 'current-page',
  CURRENT_COMPONENT: 'current-component',
  CONSOLE_ERRORS: 'console-errors',
  GIT_DIFF: 'git-diff',
});
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/contextTypes.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/contextTypes.js src/context/contextTypes.test.js
rtk git commit -m "feat: add phase-3 context chip types"
~~~

## Task 2: Add the secret-pattern scanner

**Files:**

- Create: `src/context/secretScan.test.js`
- Create: `src/context/secretScan.js`

**Interfaces:**

- Produces: `scanForSecrets(text: string | null | undefined) -> string[]` — a deduped list of human-readable pattern names found in `text`, in the fixed order they're checked. Returns `[]` for empty/missing input or when nothing matches.

- [ ] **Step 1: Write the failing tests**

Create `src/context/secretScan.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { scanForSecrets } from './secretScan.js';

describe('scanForSecrets', () => {
  it('returns nothing for empty or missing text', () => {
    expect(scanForSecrets('')).toEqual([]);
    expect(scanForSecrets(null)).toEqual([]);
    expect(scanForSecrets(undefined)).toEqual([]);
  });

  it('returns nothing for ordinary code', () => {
    expect(scanForSecrets('const heading = "Build faster";')).toEqual([]);
  });

  it('detects a PEM private key block', () => {
    expect(
      scanForSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----'),
    ).toEqual(['private key']);
  });

  it('detects an AWS access key', () => {
    expect(scanForSecrets('key = "AKIAABCDEFGHIJKLMNOP"')).toEqual(['AWS access key']);
  });

  it('detects a GitHub token', () => {
    expect(scanForSecrets('token: ghp_1234567890abcdefghij1234')).toEqual(['GitHub token']);
  });

  it('detects an OpenAI API key', () => {
    expect(scanForSecrets('OPENAI_KEY=sk-1234567890abcdefghij1234567890')).toEqual(['OpenAI API key']);
  });

  it('detects a bearer token', () => {
    expect(scanForSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345')).toEqual(['bearer token']);
  });

  it('detects a secret-looking environment assignment', () => {
    expect(scanForSecrets('DB_PASSWORD="hunter2345"')).toEqual(['possible secret assignment']);
  });

  it('deduplicates repeated occurrences of the same pattern', () => {
    const text = 'AKIAABCDEFGHIJKLMNOP\n...\nAKIAZZZZZZZZZZZZZZZZ';
    expect(scanForSecrets(text)).toEqual(['AWS access key']);
  });

  it('detects multiple distinct patterns in the same text, in check order', () => {
    const text = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEow==',
      '-----END PRIVATE KEY-----',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    ].join('\n');
    expect(scanForSecrets(text)).toEqual(['private key', 'bearer token']);
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/secretScan.test.js
~~~

Expected: FAIL — `secretScan.js` does not exist.

- [ ] **Step 3: Implement the scanner**

Create `src/context/secretScan.js`:

~~~js
// Cheap, deliberately over-inclusive pattern matching for the kinds of
// secrets a Git diff or a hand-picked project file can carry (spec §19).
// This is a visibility warning, not a security boundary: a match never
// redacts or blocks anything, it only adds a callout so the user sees it in
// the chip's own content before the composed prompt is sent.
const PATTERNS = [
  { name: 'private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'OpenAI API key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'bearer token', re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/ },
  {
    name: 'possible secret assignment',
    re: /\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*\s*[:=]\s*['"][^'"\s]{6,}['"]/,
  },
];

export function scanForSecrets(text) {
  if (!text) return [];
  const hits = [];
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/secretScan.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/secretScan.js src/context/secretScan.test.js
rtk git commit -m "feat: add a secret-pattern scanner for attached context text"
~~~

## Task 3: Add the dev-log parser

**Files:**

- Create: `src/context/devLogParser.test.js`
- Create: `src/context/devLogParser.js`

**Interfaces:**

- Produces: `parseDevLogEntries(rawLog: string | null | undefined) -> Array<{type: 'error'|'warning', message: string, file: string|null, line: number|null, count: number}>`. Entries are deduped by `(type, message)`, most-recently-appended block first, capped at 20.

- [ ] **Step 1: Write the failing tests**

Create `src/context/devLogParser.test.js`:

~~~js
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
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/devLogParser.test.js
~~~

Expected: FAIL — `devLogParser.js` does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/context/devLogParser.js`:

~~~js
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
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/devLogParser.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/devLogParser.js src/context/devLogParser.test.js
rtk git commit -m "feat: parse the dev-server log into console-error entries"
~~~

## Task 4: Add context-size helpers

**Files:**

- Create: `src/context/contextSize.test.js`
- Create: `src/context/contextSize.js`

**Interfaces:**

- Consumes: `estimateTokens` from `./contextTypes.js` (already exists, Phase 1).
- Produces: `SIZE_THRESHOLDS = {WARNING: 4000, LARGE: 12000, BLOCK_INLINE: 30000}` (spec §20), `sizeLevel(tokens) -> 'normal'|'warning'|'large'|'blocked'`, `shouldUseContextFile({chips, composedMarkdown}) -> boolean` (spec §13).

- [ ] **Step 1: Write the failing tests**

Create `src/context/contextSize.test.js`:

~~~js
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
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/contextSize.test.js
~~~

Expected: FAIL — `contextSize.js` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/context/contextSize.js`:

~~~js
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
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/contextSize.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/contextSize.js src/context/contextSize.test.js
rtk git commit -m "feat: add context-size thresholds and the inline-vs-file delivery decision"
~~~

## Task 5: Add context-file bundle writing

**Files:**

- Modify: `electron/contextFiles.js`
- Modify: `electron/contextFiles.test.js`
- Modify: `electron/contextIpc.js`
- Modify: `electron/contextIpc.test.js`
- Modify: `electron/preload.js:552-555`

**Interfaces:**

- Produces: `writeContextBundle(root, content, {fs, path} = {}) -> {relPath: string}` in `electron/contextFiles.js` — writes `content` to `<root>/.stacki/tmp/context/request-<Date.now()>.md`, creating the directory and a sibling `.stacki/tmp/.gitignore` (containing `*`) if missing. Throws when `content` is empty/whitespace-only.
- Produces: `window.avb.writeContextBundle({projectPath, markdown}) -> Promise<{relPath: string}>`. `registerContextIpc` gains an injectable `writeContextBundle(root, content) -> {relPath}` dependency, defaulting to `contextFiles.writeContextBundle`, matching the existing `listProjectFiles`/`readProjectFile` DI pattern. `projectPath` in the payload is accepted for symmetry with the existing `listContextFiles`/`readContextFile` calls but ignored server-side — root always comes from `getProjectRoot()`, exactly like every other context IPC channel.

- [ ] **Step 1: Extend the shared fake filesystem and write the failing tests**

In `electron/contextFiles.test.js`, extend the `fakeFs` helper's returned `fs` object (used by every `describe` block in this file) with three more methods, and add a new `describe('writeContextBundle', ...)` block. Replace the full contents of `electron/contextFiles.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import contextFilesModule from './contextFiles.js';

const { isSensitiveFilename, listProjectFiles, readProjectFile, writeContextBundle } = contextFilesModule;

// A tiny in-memory filesystem, just deep enough for these tests: a tree of
// {name: {type:'dir', children} | {type:'file', content}} keyed by absolute
// path segments joined with '/'.
function fakeFs(tree) {
  const files = new Map(); // abs path -> content
  const dirs = new Map(); // abs path -> [{name, isDir}]

  const walk = (prefix, node) => {
    const entries = [];
    for (const [name, child] of Object.entries(node)) {
      const abs = `${prefix}/${name}`;
      if (child.type === 'dir') {
        entries.push({ name, isDir: true });
        walk(abs, child.children);
      } else {
        entries.push({ name, isDir: false });
        files.set(abs, child.content);
      }
    }
    dirs.set(prefix, entries);
  };
  walk('/project', tree);

  return {
    fs: {
      readdirSync: (dir, opts) => {
        const entries = dirs.get(dir) || [];
        if (opts?.withFileTypes) {
          return entries.map((e) => ({ name: e.name, isDirectory: () => e.isDir }));
        }
        return entries.map((e) => e.name);
      },
      statSync: (abs) => {
        if (!files.has(abs)) throw new Error(`ENOENT: ${abs}`);
        return { isFile: () => true, size: files.get(abs).length };
      },
      readFileSync: (abs) => {
        if (!files.has(abs)) throw new Error(`ENOENT: ${abs}`);
        return files.get(abs);
      },
      // Sufficient for writeContextBundle's needs: it never lists a
      // directory it creates, so a real recursive-mkdir simulation isn't
      // needed — just record that the path exists.
      mkdirSync: (dir) => {
        if (!dirs.has(dir)) dirs.set(dir, []);
      },
      existsSync: (p) => files.has(p) || dirs.has(p),
      writeFileSync: (p, content) => {
        files.set(p, content);
      },
    },
    path: {
      // Normalizes '..'/'.' segments like Node's real path.resolve, so the
      // path-traversal test below genuinely exercises the containment check
      // in contextFiles.js rather than silently passing through an
      // un-normalized '/project/../secrets.txt' string.
      resolve: (...parts) => {
        const segments = parts.join('/').split('/');
        const out = [];
        for (const seg of segments) {
          if (seg === '' || seg === '.') continue;
          if (seg === '..') out.pop();
          else out.push(seg);
        }
        return `/${out.join('/')}`;
      },
      join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      sep: '/',
      basename: (p) => p.split('/').pop(),
    },
  };
}

describe('isSensitiveFilename', () => {
  it('blocks common secret filenames', () => {
    expect(isSensitiveFilename('.env')).toBe(true);
    expect(isSensitiveFilename('.env.production')).toBe(true);
    expect(isSensitiveFilename('server.pem')).toBe(true);
    expect(isSensitiveFilename('id_rsa')).toBe(true);
    expect(isSensitiveFilename('credentials.json')).toBe(true);
    expect(isSensitiveFilename('service-account-1.json')).toBe(true);
  });

  it('allows ordinary project files', () => {
    expect(isSensitiveFilename('index.astro')).toBe(false);
    expect(isSensitiveFilename('package.json')).toBe(false);
  });
});

describe('listProjectFiles', () => {
  it('lists files recursively, excluding build/dependency directories and dotfiles', () => {
    const { fs, path } = fakeFs({
      'src': { type: 'dir', children: {
        'pages': { type: 'dir', children: {
          'index.astro': { type: 'file', content: '<h1>Hi</h1>' },
        } },
      } },
      'node_modules': { type: 'dir', children: {
        'pkg': { type: 'dir', children: { 'index.js': { type: 'file', content: '' } } },
      } },
      '.git': { type: 'dir', children: { 'HEAD': { type: 'file', content: '' } } },
      'package.json': { type: 'file', content: '{}' },
      '.env': { type: 'file', content: 'SECRET=1' },
    });

    const files = listProjectFiles('/project', { fs, path });
    expect(files).toEqual(['package.json', 'src/pages/index.astro']);
  });

  it('excludes sensitive filenames that are not dotfiles, so they never appear as pickable', () => {
    const { fs, path } = fakeFs({
      'credentials.json': { type: 'file', content: '{"key":"secret"}' },
      'server.pem': { type: 'file', content: 'PEM DATA' },
      'id_rsa': { type: 'file', content: 'PRIVATE KEY' },
      'service-account-1.json': { type: 'file', content: '{}' },
      'config': { type: 'dir', children: {
        'service-account-prod.json': { type: 'file', content: '{}' },
      } },
      'package.json': { type: 'file', content: '{}' },
    });

    const files = listProjectFiles('/project', { fs, path });
    expect(files).toEqual(['package.json']);
  });
});

describe('readProjectFile', () => {
  it('reads a file within the project root', () => {
    const { fs, path } = fakeFs({
      'src': { type: 'dir', children: {
        'pages': { type: 'dir', children: {
          'index.astro': { type: 'file', content: '<h1>Hi</h1>' },
        } },
      } },
    });

    const result = readProjectFile('/project', 'src/pages/index.astro', { fs, path });
    expect(result).toEqual({ rel: 'src/pages/index.astro', content: '<h1>Hi</h1>', size: '<h1>Hi</h1>'.length });
  });

  it('refuses a path that escapes the project root', () => {
    const { fs, path } = fakeFs({ 'a.txt': { type: 'file', content: 'x' } });
    expect(() => readProjectFile('/project', '../secrets.txt', { fs, path })).toThrow(
      'Invalid path: outside the open project.',
    );
  });

  it('refuses a sensitive filename even when it exists on disk', () => {
    const { fs, path } = fakeFs({ '.env': { type: 'file', content: 'SECRET=1' } });
    expect(() => readProjectFile('/project', '.env', { fs, path })).toThrow(
      'Refusing to read a sensitive file: .env',
    );
  });

  it('refuses a file larger than the configured limit', () => {
    const { fs, path } = fakeFs({ 'big.txt': { type: 'file', content: 'x'.repeat(20) } });
    expect(() => readProjectFile('/project', 'big.txt', { fs, path, maxBytes: 10 })).toThrow(
      'File too large to attach: big.txt',
    );
  });
});

describe('writeContextBundle', () => {
  it('creates the context directory, a nested gitignore, and the bundle file', () => {
    const { fs, path } = fakeFs({});
    const result = writeContextBundle('/project', '## Stacki context', { fs, path });
    expect(result.relPath).toMatch(/^\.stacki\/tmp\/context\/request-\d+\.md$/);
    expect(fs.existsSync('/project/.stacki/tmp/.gitignore')).toBe(true);
    expect(fs.readFileSync('/project/.stacki/tmp/.gitignore')).toBe('*\n');
    expect(fs.readFileSync(`/project/${result.relPath}`)).toBe('## Stacki context');
  });

  it('does not overwrite an existing tmp gitignore', () => {
    const { fs, path } = fakeFs({
      '.stacki': { type: 'dir', children: { 'tmp': { type: 'dir', children: {
        '.gitignore': { type: 'file', content: 'custom\n' },
      } } } },
    });
    writeContextBundle('/project', 'content', { fs, path });
    expect(fs.readFileSync('/project/.stacki/tmp/.gitignore')).toBe('custom\n');
  });

  it('refuses to write empty content', () => {
    const { fs, path } = fakeFs({});
    expect(() => writeContextBundle('/project', '   ', { fs, path })).toThrow(
      'Nothing to write — the composed context is empty.',
    );
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextFiles.test.js
~~~

Expected: FAIL — `writeContextBundle` is not exported.

- [ ] **Step 3: Implement writeContextBundle**

In `electron/contextFiles.js`, add after `readProjectFile`:

~~~js
function ensureContextDir(root, { fs = nodeFs, path = nodePath } = {}) {
  const dir = path.join(root, '.stacki', 'tmp', 'context');
  fs.mkdirSync(dir, { recursive: true });
  // A nested .gitignore that excludes everything under tmp/ keeps generated
  // context bundles out of the user's repo regardless of what their own
  // top-level .gitignore does or doesn't list — Stacki must never edit a
  // file the user's project owns.
  const gitignorePath = path.join(root, '.stacki', 'tmp', '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n');
  }
  return dir;
}

function writeContextBundle(root, content, { fs = nodeFs, path = nodePath } = {}) {
  if (!content || !content.trim()) {
    throw new Error('Nothing to write — the composed context is empty.');
  }
  const dir = ensureContextDir(root, { fs, path });
  const filename = `request-${Date.now()}.md`;
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
  return { relPath: `.stacki/tmp/context/${filename}` };
}
~~~

And update the `module.exports` at the bottom:

~~~js
module.exports = {
  EXCLUDED_DIRS,
  isSensitiveFilename,
  listProjectFiles,
  readProjectFile,
  writeContextBundle,
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- electron/contextFiles.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Write the failing IPC tests**

Replace the full contents of `electron/contextIpc.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import contextIpcModule from './contextIpc.js';

const { registerContextIpc } = contextIpcModule;

// contextIpc.js is plain CommonJS and requires ./contextFiles and
// ./astroParser internally, so list/read/serialize/write are injected as
// constructor-style dependencies (same pattern as TerminalManager's injected
// loadPty) rather than mocked via vi.mock — that keeps the test decoupled
// from CJS/ESM interop details.
function setup({ projectRoot = '/projects/site' } = {}) {
  const handles = new Map();
  const ipcMain = {
    handle: vi.fn((channel, fn) => handles.set(channel, fn)),
    removeHandler: vi.fn(),
  };
  const allowed = { sender: {} };
  const denied = { sender: {} };
  const listProjectFiles = vi.fn(() => ['package.json', 'src/pages/index.astro']);
  const readProjectFile = vi.fn((_root, rel) => ({ rel, content: `content of ${rel}`, size: 10 }));
  const serializeNode = vi.fn((node) => `<${node.name}></${node.name}>`);
  const writeContextBundle = vi.fn((_root, content) => ({ relPath: `.stacki/tmp/context/request-1.md` }));
  const unregister = registerContextIpc({
    ipcMain,
    isAllowedSender: (event) => event === allowed,
    getProjectRoot: () => projectRoot,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
  });
  return {
    ipcMain,
    handles,
    allowed,
    denied,
    unregister,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
  };
}

describe('context IPC', () => {
  it('registers the four context channels', () => {
    const { handles } = setup();
    expect([...handles.keys()]).toEqual([
      'context:listFiles',
      'context:readFile',
      'context:serializeNode',
      'context:writeContextBundle',
    ]);
  });

  it('lists project files for an allowed sender', async () => {
    const { handles, allowed, listProjectFiles } = setup();
    await expect(handles.get('context:listFiles')(allowed)).resolves.toEqual({
      files: ['package.json', 'src/pages/index.astro'],
    });
    expect(listProjectFiles).toHaveBeenCalledWith('/projects/site');
  });

  it('reads a project file for an allowed sender', async () => {
    const { handles, allowed, readProjectFile } = setup();
    await expect(handles.get('context:readFile')(allowed, { rel: 'package.json' })).resolves.toEqual({
      rel: 'package.json',
      content: 'content of package.json',
      size: 10,
    });
    expect(readProjectFile).toHaveBeenCalledWith('/projects/site', 'package.json');
  });

  it('serializes a node to markup for an allowed sender', async () => {
    const { handles, allowed, serializeNode } = setup();
    const node = { id: 'h1', kind: 'element', name: 'h1' };
    await expect(handles.get('context:serializeNode')(allowed, { node })).resolves.toEqual({
      markup: '<h1></h1>',
    });
    expect(serializeNode).toHaveBeenCalledWith(node);
  });

  it('writes a context bundle for an allowed sender', async () => {
    const { handles, allowed, writeContextBundle } = setup();
    await expect(
      handles.get('context:writeContextBundle')(allowed, { markdown: '## Stacki context' }),
    ).resolves.toEqual({ relPath: '.stacki/tmp/context/request-1.md' });
    expect(writeContextBundle).toHaveBeenCalledWith('/projects/site', '## Stacki context');
  });

  it('rejects an untrusted sender', async () => {
    const { handles, denied } = setup();
    await expect(handles.get('context:listFiles')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:readFile')(denied, { rel: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:serializeNode')(denied, { node: {} })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:writeContextBundle')(denied, { markdown: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
  });

  it('rejects when no project is open', async () => {
    const { handles, allowed } = setup({ projectRoot: null });
    await expect(handles.get('context:listFiles')(allowed)).rejects.toThrow(
      'Open a project before attaching context.',
    );
  });

  it('unregisters all four handlers', () => {
    const { ipcMain, unregister } = setup();
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:listFiles');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:readFile');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:serializeNode');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:writeContextBundle');
  });
});
~~~

- [ ] **Step 6: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
~~~

Expected: FAIL — `context:writeContextBundle` is never registered.

- [ ] **Step 7: Add the handler**

Replace the full contents of `electron/contextIpc.js`:

~~~js
const contextFiles = require('./contextFiles');
const astroParser = require('./astroParser');

function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
  serializeNode = (node) => astroParser.serializeNodes([node]),
  writeContextBundle = contextFiles.writeContextBundle,
}) {
  const assertAllowed = (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Context IPC is available only to Stacki.');
    }
  };
  const requireRoot = () => {
    const root = getProjectRoot();
    if (!root) throw new Error('Open a project before attaching context.');
    return root;
  };

  const listFiles = async (event) => {
    assertAllowed(event);
    return { files: listProjectFiles(requireRoot()) };
  };
  const readFile = async (event, payload) => {
    assertAllowed(event);
    return readProjectFile(requireRoot(), payload?.rel);
  };
  const serialize = async (event, payload) => {
    assertAllowed(event);
    return { markup: serializeNode(payload?.node) };
  };
  const writeBundle = async (event, payload) => {
    assertAllowed(event);
    return writeContextBundle(requireRoot(), payload?.markdown);
  };

  ipcMain.handle('context:listFiles', listFiles);
  ipcMain.handle('context:readFile', readFile);
  ipcMain.handle('context:serializeNode', serialize);
  ipcMain.handle('context:writeContextBundle', writeBundle);

  return () => {
    ipcMain.removeHandler('context:listFiles');
    ipcMain.removeHandler('context:readFile');
    ipcMain.removeHandler('context:serializeNode');
    ipcMain.removeHandler('context:writeContextBundle');
  };
}

module.exports = { registerContextIpc };
~~~

- [ ] **Step 8: Expose it on window.avb**

In `electron/preload.js`, extend the existing "Terminal context chips" block (`electron/preload.js:552-555`):

~~~js
  // Terminal context chips
  listContextFiles: invoke('context:listFiles'),
  readContextFile: invoke('context:readFile'),
  serializeNode: invoke('context:serializeNode'),
  writeContextBundle: invoke('context:writeContextBundle'),
~~~

- [ ] **Step 9: Run tests, check:electron, and build**

Run:

~~~bash
rtk npm test -- electron/contextFiles.test.js electron/contextIpc.test.js
rtk npm run check:electron
rtk npm run build
~~~

Expected: tests pass, every Electron entry parses (no new files were added to `electron/`, so `check:electron`'s file list is unchanged), and the renderer builds.

- [ ] **Step 10: Commit**

~~~bash
rtk git add electron/contextFiles.js electron/contextFiles.test.js electron/contextIpc.js electron/contextIpc.test.js electron/preload.js
rtk git commit -m "feat: add context-file bundle writing for large-context delivery"
~~~

## Task 6: Add the Git diff IPC channel

**Files:**

- Modify: `electron/contextIpc.js`
- Modify: `electron/contextIpc.test.js`
- Modify: `electron/preload.js:552-556`
- Modify: `electron/main.js:548-557`

**Interfaces:**

- Consumes: a `runGit(root, args) -> Promise<{stdout, stderr}>` dependency (no default — required, exactly like `getProjectRoot`; `electron/main.js` passes its own existing `git()` helper). `git()` already exists at `electron/main.js:628-630` and is used by the Git panel's `git:info`/`git:commit`/etc. handlers.
- Produces: `window.avb.getGitDiff({projectPath}) -> Promise<{isRepo: true, branch, staged, unstaged, untracked: string[], recentCommits: string[], truncated: boolean}>`, or a rejection with `'This project is not a Git repository.'` when the project root isn't a Git repo. `projectPath` in the payload is accepted for symmetry but ignored server-side, same as the other context channels.

- [ ] **Step 1: Write the failing tests**

In `electron/contextIpc.test.js`, add a `runGit` fake to `setup()` and a new `describe('context:gitDiff', ...)` block. Replace the full contents of `electron/contextIpc.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import contextIpcModule from './contextIpc.js';

const { registerContextIpc } = contextIpcModule;

// contextIpc.js is plain CommonJS and requires ./contextFiles and
// ./astroParser internally, so list/read/serialize/write/git are injected as
// constructor-style dependencies (same pattern as TerminalManager's injected
// loadPty) rather than mocked via vi.mock — that keeps the test decoupled
// from CJS/ESM interop details.
function fakeRunGit(overrides = {}) {
  const defaults = {
    'rev-parse --is-inside-work-tree': { stdout: 'true\n', stderr: '' },
    'rev-parse --abbrev-ref HEAD': { stdout: 'main\n', stderr: '' },
    'diff --cached': { stdout: '', stderr: '' },
    'diff': { stdout: '', stderr: '' },
    'status --porcelain': { stdout: '', stderr: '' },
    'log -5 --oneline': { stdout: '', stderr: '' },
    ...overrides,
  };
  return vi.fn(async (_root, args) => {
    // 'diff' is keyed on just its mode (plain vs --cached) because its full
    // arg list varies with the exclude pathspec under test; every other
    // command is keyed on its complete argument list.
    const key = args[0] === 'diff' ? (args.includes('--cached') ? 'diff --cached' : 'diff') : args.join(' ');
    const canned = defaults[key];
    if (!canned) throw new Error(`unexpected git args: ${args.join(' ')}`);
    return canned;
  });
}

function setup({ projectRoot = '/projects/site', runGit = fakeRunGit() } = {}) {
  const handles = new Map();
  const ipcMain = {
    handle: vi.fn((channel, fn) => handles.set(channel, fn)),
    removeHandler: vi.fn(),
  };
  const allowed = { sender: {} };
  const denied = { sender: {} };
  const listProjectFiles = vi.fn(() => ['package.json', 'src/pages/index.astro']);
  const readProjectFile = vi.fn((_root, rel) => ({ rel, content: `content of ${rel}`, size: 10 }));
  const serializeNode = vi.fn((node) => `<${node.name}></${node.name}>`);
  const writeContextBundle = vi.fn((_root, content) => ({ relPath: `.stacki/tmp/context/request-1.md` }));
  const unregister = registerContextIpc({
    ipcMain,
    isAllowedSender: (event) => event === allowed,
    getProjectRoot: () => projectRoot,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
    runGit,
  });
  return {
    ipcMain,
    handles,
    allowed,
    denied,
    unregister,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
    runGit,
  };
}

describe('context IPC', () => {
  it('registers the five context channels', () => {
    const { handles } = setup();
    expect([...handles.keys()]).toEqual([
      'context:listFiles',
      'context:readFile',
      'context:serializeNode',
      'context:writeContextBundle',
      'context:gitDiff',
    ]);
  });

  it('lists project files for an allowed sender', async () => {
    const { handles, allowed, listProjectFiles } = setup();
    await expect(handles.get('context:listFiles')(allowed)).resolves.toEqual({
      files: ['package.json', 'src/pages/index.astro'],
    });
    expect(listProjectFiles).toHaveBeenCalledWith('/projects/site');
  });

  it('reads a project file for an allowed sender', async () => {
    const { handles, allowed, readProjectFile } = setup();
    await expect(handles.get('context:readFile')(allowed, { rel: 'package.json' })).resolves.toEqual({
      rel: 'package.json',
      content: 'content of package.json',
      size: 10,
    });
    expect(readProjectFile).toHaveBeenCalledWith('/projects/site', 'package.json');
  });

  it('serializes a node to markup for an allowed sender', async () => {
    const { handles, allowed, serializeNode } = setup();
    const node = { id: 'h1', kind: 'element', name: 'h1' };
    await expect(handles.get('context:serializeNode')(allowed, { node })).resolves.toEqual({
      markup: '<h1></h1>',
    });
    expect(serializeNode).toHaveBeenCalledWith(node);
  });

  it('writes a context bundle for an allowed sender', async () => {
    const { handles, allowed, writeContextBundle } = setup();
    await expect(
      handles.get('context:writeContextBundle')(allowed, { markdown: '## Stacki context' }),
    ).resolves.toEqual({ relPath: '.stacki/tmp/context/request-1.md' });
    expect(writeContextBundle).toHaveBeenCalledWith('/projects/site', '## Stacki context');
  });

  it('rejects an untrusted sender', async () => {
    const { handles, denied } = setup();
    await expect(handles.get('context:listFiles')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:readFile')(denied, { rel: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:serializeNode')(denied, { node: {} })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:writeContextBundle')(denied, { markdown: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:gitDiff')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
  });

  it('rejects when no project is open', async () => {
    const { handles, allowed } = setup({ projectRoot: null });
    await expect(handles.get('context:listFiles')(allowed)).rejects.toThrow(
      'Open a project before attaching context.',
    );
  });

  it('unregisters all five handlers', () => {
    const { ipcMain, unregister } = setup();
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:listFiles');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:readFile');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:serializeNode');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:writeContextBundle');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:gitDiff');
  });
});

describe('context:gitDiff', () => {
  it('returns branch, diffs, untracked files, and recent commits for an allowed sender', async () => {
    const runGit = fakeRunGit({
      'diff --cached': { stdout: 'diff --git a/staged.txt b/staged.txt\n+staged change\n', stderr: '' },
      'diff': { stdout: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n', stderr: '' },
      'status --porcelain': { stdout: '?? new-file.txt\n?? another.txt\n', stderr: '' },
      'log -5 --oneline': { stdout: 'abc123 Fix bug\ndef456 Add feature\n', stderr: '' },
    });
    const { handles, allowed } = setup({ runGit });
    await expect(handles.get('context:gitDiff')(allowed)).resolves.toEqual({
      isRepo: true,
      branch: 'main',
      staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
      unstaged: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n',
      untracked: ['new-file.txt', 'another.txt'],
      recentCommits: ['abc123 Fix bug', 'def456 Add feature'],
      truncated: false,
    });
  });

  it('excludes lockfiles and build directories from the diff pathspec', async () => {
    const runGit = fakeRunGit();
    const { handles, allowed } = setup({ runGit });
    await handles.get('context:gitDiff')(allowed);
    const diffCall = runGit.mock.calls.find((call) => call[1][0] === 'diff' && !call[1].includes('--cached'));
    expect(diffCall[1]).toEqual(
      expect.arrayContaining([
        ':(exclude)node_modules',
        ':(exclude)dist',
        ':(exclude)package-lock.json',
        ':(exclude)pnpm-lock.yaml',
        ':(exclude)yarn.lock',
      ]),
    );
  });

  it('truncates an oversized diff and reports it as truncated', async () => {
    const runGit = fakeRunGit({ 'diff': { stdout: 'x'.repeat(25000), stderr: '' } });
    const { handles, allowed } = setup({ runGit });
    const result = await handles.get('context:gitDiff')(allowed);
    expect(result.truncated).toBe(true);
    expect(result.unstaged.length).toBeLessThan(25000);
  });

  it('rejects when the project is not a Git repository', async () => {
    const { handles, allowed } = setup({
      runGit: vi.fn(async (_root, args) => {
        if (args.join(' ') === 'rev-parse --is-inside-work-tree') throw new Error('not a repo');
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      }),
    });
    await expect(handles.get('context:gitDiff')(allowed)).rejects.toThrow(
      'This project is not a Git repository.',
    );
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
~~~

Expected: FAIL — `context:gitDiff` is never registered.

- [ ] **Step 3: Add the handler**

Replace the full contents of `electron/contextIpc.js`:

~~~js
const contextFiles = require('./contextFiles');
const astroParser = require('./astroParser');

// Kept out of the diff entirely — these blow up the token cost of a diff
// without telling an agent anything about the actual change (spec §9.7's
// safety rule: exclude lockfiles and build output by default).
const DIFF_EXCLUDES = [
  'node_modules',
  'dist',
  '.astro',
  'release',
  'coverage',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];
const MAX_DIFF_CHARS = 20000;

function diffPathspec() {
  const excludes = DIFF_EXCLUDES.flatMap((p) => [`:(exclude)${p}`, `:(exclude)${p}/**`]);
  return ['--', '.', ...excludes];
}

function truncateDiff(text) {
  if (text.length <= MAX_DIFF_CHARS) return { text, truncated: false };
  const cut = text.slice(0, MAX_DIFF_CHARS);
  return { text: `${cut}\n… (truncated, ${text.length - MAX_DIFF_CHARS} more characters)`, truncated: true };
}

function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
  serializeNode = (node) => astroParser.serializeNodes([node]),
  writeContextBundle = contextFiles.writeContextBundle,
  runGit,
}) {
  const assertAllowed = (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Context IPC is available only to Stacki.');
    }
  };
  const requireRoot = () => {
    const root = getProjectRoot();
    if (!root) throw new Error('Open a project before attaching context.');
    return root;
  };

  const listFiles = async (event) => {
    assertAllowed(event);
    return { files: listProjectFiles(requireRoot()) };
  };
  const readFile = async (event, payload) => {
    assertAllowed(event);
    return readProjectFile(requireRoot(), payload?.rel);
  };
  const serialize = async (event, payload) => {
    assertAllowed(event);
    return { markup: serializeNode(payload?.node) };
  };
  const writeBundle = async (event, payload) => {
    assertAllowed(event);
    return writeContextBundle(requireRoot(), payload?.markdown);
  };
  const gitDiff = async (event) => {
    assertAllowed(event);
    const root = requireRoot();
    try {
      await runGit(root, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      throw new Error('This project is not a Git repository.');
    }

    const branch = (await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    const stagedRaw = (await runGit(root, ['diff', '--cached', ...diffPathspec()])).stdout;
    const unstagedRaw = (await runGit(root, ['diff', ...diffPathspec()])).stdout;
    const statusOut = (await runGit(root, ['status', '--porcelain'])).stdout;
    const logOut = (await runGit(root, ['log', '-5', '--oneline'])).stdout;

    const untracked = statusOut
      .split('\n')
      .filter((line) => line.startsWith('?? '))
      .map((line) => line.slice(3).replace(/^"|"$/g, ''));
    const recentCommits = logOut
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const staged = truncateDiff(stagedRaw);
    const unstaged = truncateDiff(unstagedRaw);

    return {
      isRepo: true,
      branch,
      staged: staged.text,
      unstaged: unstaged.text,
      untracked,
      recentCommits,
      truncated: staged.truncated || unstaged.truncated,
    };
  };

  ipcMain.handle('context:listFiles', listFiles);
  ipcMain.handle('context:readFile', readFile);
  ipcMain.handle('context:serializeNode', serialize);
  ipcMain.handle('context:writeContextBundle', writeBundle);
  ipcMain.handle('context:gitDiff', gitDiff);

  return () => {
    ipcMain.removeHandler('context:listFiles');
    ipcMain.removeHandler('context:readFile');
    ipcMain.removeHandler('context:serializeNode');
    ipcMain.removeHandler('context:writeContextBundle');
    ipcMain.removeHandler('context:gitDiff');
  };
}

module.exports = { registerContextIpc };
~~~

- [ ] **Step 4: Expose it on window.avb**

In `electron/preload.js`, extend the "Terminal context chips" block again:

~~~js
  // Terminal context chips
  listContextFiles: invoke('context:listFiles'),
  readContextFile: invoke('context:readFile'),
  serializeNode: invoke('context:serializeNode'),
  writeContextBundle: invoke('context:writeContextBundle'),
  getGitDiff: invoke('context:gitDiff'),
~~~

- [ ] **Step 5: Wire runGit in main.js**

In `electron/main.js`, extend the existing `registerContextIpc({...})` call (`electron/main.js:548-557`):

~~~js
registerContextIpc({
  ipcMain,
  isAllowedSender: (event) =>
    !!mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    isTrustedRendererUrl(event.senderFrame.url),
  getProjectRoot: () => openProjectRoot,
  runGit: (root, args) => git(root, args),
});
~~~

- [ ] **Step 6: Run tests, check:electron, and build**

Run:

~~~bash
rtk npm test -- electron/contextIpc.test.js
rtk npm run check:electron
rtk npm run build
~~~

Expected: tests pass, every Electron entry parses, and the renderer builds.

- [ ] **Step 7: Commit**

~~~bash
rtk git add electron/contextIpc.js electron/contextIpc.test.js electron/preload.js electron/main.js
rtk git commit -m "feat: add the context:gitDiff IPC channel"
~~~

## Task 7: Add the Console Errors resolver

**Files:**

- Create: `src/context/consoleErrorsResolver.test.js`
- Create: `src/context/consoleErrorsResolver.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_TYPES` (Task 1), `parseDevLogEntries` (Task 3).
- Produces: `consoleErrorsResolver` matching the resolver shape, plus `computeStaleKey`. `resolve(appState, options)` reads `appState.devLog` (the raw rolling log string; `ContextChipBar` merges it into `appState` in Task 11). `options.includeWarnings` (default `true`) controls whether warning-type entries are included.

- [ ] **Step 1: Write the failing test**

Create `src/context/consoleErrorsResolver.test.js`:

~~~js
import { describe, expect, it } from 'vitest';
import { consoleErrorsResolver } from './consoleErrorsResolver.js';

const LOG = ['Error: could not resolve import', 'Warning: unused CSS selector .foo'].join('\n\n');

describe('consoleErrorsResolver', () => {
  it('is unavailable when the dev log has no error or warning blocks', () => {
    expect(consoleErrorsResolver.isAvailable({ devLog: '' })).toBe(false);
    expect(consoleErrorsResolver.isAvailable({ devLog: '[vite] ready in 200ms' })).toBe(false);
  });

  it('is available when the dev log has at least one error or warning block', () => {
    expect(consoleErrorsResolver.isAvailable({ devLog: LOG })).toBe(true);
  });

  it('defaults to including warnings', () => {
    expect(consoleErrorsResolver.getDefaultOptions()).toEqual({ includeWarnings: true });
  });

  it('resolves every entry, with error and warning counts, when warnings are included', async () => {
    const result = await consoleErrorsResolver.resolve({ devLog: LOG }, { includeWarnings: true });
    expect(result.data.errorCount).toBe(1);
    expect(result.data.warningCount).toBe(1);
    expect(result.data.entries).toHaveLength(2);
    expect(result.estimatedCharacters).toBeGreaterThan(0);
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('excludes warnings when includeWarnings is false', async () => {
    const result = await consoleErrorsResolver.resolve({ devLog: LOG }, { includeWarnings: false });
    expect(result.data.entries).toHaveLength(1);
    expect(result.data.entries[0].type).toBe('error');
    expect(result.data.warningCount).toBe(0);
  });

  it('rejects resolving when nothing is available', async () => {
    await expect(consoleErrorsResolver.resolve({ devLog: '' }, { includeWarnings: true })).rejects.toThrow(
      'No console errors are available.',
    );
  });

  it('renders a heading, counts, and one line per entry as Markdown', () => {
    const snapshot = {
      data: {
        errorCount: 1,
        warningCount: 1,
        entries: [
          { type: 'error', message: 'Error: could not resolve import', file: null, line: null, count: 1 },
          {
            type: 'warning',
            message: 'Warning: unused CSS selector .foo',
            file: 'src/components/Bar.astro',
            line: 12,
            count: 3,
          },
        ],
      },
    };
    const markdown = consoleErrorsResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Console errors');
    expect(markdown).toContain('1 error, 1 warning');
    expect(markdown).toContain('**error**: Error: could not resolve import');
    expect(markdown).toContain('**warning** (`src/components/Bar.astro:12`) ×3: Warning: unused CSS selector .foo');
  });

  it('produces a different stale key when the dev log changes', () => {
    const key1 = consoleErrorsResolver.computeStaleKey({ devLog: LOG });
    const key2 = consoleErrorsResolver.computeStaleKey({ devLog: `${LOG}\n\nError: a new problem` });
    expect(key1).not.toBe(key2);
  });

  it('returns null stale key when there is no dev log', () => {
    expect(consoleErrorsResolver.computeStaleKey({ devLog: '' })).toBeNull();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/consoleErrorsResolver.test.js
~~~

Expected: FAIL — `consoleErrorsResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/consoleErrorsResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { parseDevLogEntries } from './devLogParser.js';

// Not cryptographic — only used to detect that the dev log's content changed
// between two resolves/stale-checks.
function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function filteredEntries(appState, includeWarnings) {
  const all = parseDevLogEntries(appState.devLog);
  return includeWarnings ? all : all.filter((entry) => entry.type === 'error');
}

export const consoleErrorsResolver = {
  type: CONTEXT_CHIP_TYPES.CONSOLE_ERRORS,
  label: 'Console errors',

  isAvailable(appState) {
    return parseDevLogEntries(appState.devLog).length > 0;
  },

  getDefaultOptions() {
    return { includeWarnings: true };
  },

  async resolve(appState, options) {
    const includeWarnings = options?.includeWarnings !== false;
    const entries = filteredEntries(appState, includeWarnings);
    if (entries.length === 0) throw new Error('No console errors are available.');

    const errorCount = entries.filter((entry) => entry.type === 'error').length;
    const warningCount = entries.filter((entry) => entry.type === 'warning').length;
    const data = { entries, errorCount, warningCount };
    const estimatedCharacters = entries.reduce((sum, entry) => sum + entry.message.length, 0);

    return {
      data,
      estimatedCharacters,
      sourceRevision: hashString(appState.devLog || ''),
    };
  },

  computeStaleKey(appState) {
    return appState.devLog ? hashString(appState.devLog) : null;
  },

  renderMarkdown(snapshot) {
    const { entries, errorCount, warningCount } = snapshot.data;
    const lines = [
      '### Console errors',
      '',
      `- ${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`,
      '',
    ];
    for (const entry of entries) {
      const loc = entry.file ? ` (\`${entry.file}${entry.line ? `:${entry.line}` : ''}\`)` : '';
      const countSuffix = entry.count > 1 ? ` ×${entry.count}` : '';
      lines.push(`- **${entry.type}**${loc}${countSuffix}: ${entry.message}`);
    }
    return lines.join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/consoleErrorsResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/consoleErrorsResolver.js src/context/consoleErrorsResolver.test.js
rtk git commit -m "feat: add console-errors context resolver"
~~~

## Task 8: Add the Git Diff resolver

**Files:**

- Create: `src/context/gitDiffResolver.test.js`
- Create: `src/context/gitDiffResolver.js`

**Interfaces:**

- Consumes: `CONTEXT_CHIP_TYPES` (Task 1), `scanForSecrets` (Task 2).
- Produces: `gitDiffResolver` matching the resolver shape, with **no `computeStaleKey`** (see Global Constraints). `resolve(appState, options)` reads `appState.projectPath` (for `isAvailable` only) and calls `appState.getGitDiff() -> Promise<{isRepo, branch, staged, unstaged, untracked, recentCommits, truncated}>` (Task 6's IPC, wrapped by `ContextChipBar` in Task 11). `options.scope` is `'all' | 'staged' | 'unstaged'`, default `'all'`.

- [ ] **Step 1: Write the failing test**

Create `src/context/gitDiffResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { gitDiffResolver } from './gitDiffResolver.js';

function baseAppState(overrides = {}) {
  return {
    projectPath: '/projects/site',
    getGitDiff: vi.fn(async () => ({
      isRepo: true,
      branch: 'main',
      staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
      unstaged: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n',
      untracked: ['new-file.txt'],
      recentCommits: ['abc123 Fix bug'],
      truncated: false,
    })),
    ...overrides,
  };
}

describe('gitDiffResolver', () => {
  it('is unavailable without an open project', () => {
    expect(gitDiffResolver.isAvailable({ projectPath: null })).toBe(false);
  });

  it('is available with an open project (the real Git-repo check happens on resolve)', () => {
    expect(gitDiffResolver.isAvailable({ projectPath: '/projects/site' })).toBe(true);
  });

  it('defaults to the all-changes scope', () => {
    expect(gitDiffResolver.getDefaultOptions()).toEqual({ scope: 'all' });
  });

  it('resolves branch, both diffs, untracked files, and recent commits for scope "all"', async () => {
    const appState = baseAppState();
    const result = await gitDiffResolver.resolve(appState, { scope: 'all' });
    expect(appState.getGitDiff).toHaveBeenCalled();
    expect(result.data).toEqual({
      branch: 'main',
      scope: 'all',
      staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
      unstaged: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n',
      untracked: ['new-file.txt'],
      recentCommits: ['abc123 Fix bug'],
      truncated: false,
      secretWarnings: [],
    });
    expect(result.estimatedCharacters).toBeGreaterThan(0);
  });

  it('zeroes out the unstaged diff for scope "staged"', async () => {
    const result = await gitDiffResolver.resolve(baseAppState(), { scope: 'staged' });
    expect(result.data.staged).toContain('staged change');
    expect(result.data.unstaged).toBe('');
  });

  it('zeroes out the staged diff for scope "unstaged"', async () => {
    const result = await gitDiffResolver.resolve(baseAppState(), { scope: 'unstaged' });
    expect(result.data.unstaged).toContain('unstaged change');
    expect(result.data.staged).toBe('');
  });

  it('surfaces a secret warning found in the diff text', async () => {
    const appState = baseAppState({
      getGitDiff: vi.fn(async () => ({
        isRepo: true,
        branch: 'main',
        staged: '',
        unstaged: '+AWS_KEY = "AKIAABCDEFGHIJKLMNOP"',
        untracked: [],
        recentCommits: [],
        truncated: false,
      })),
    });
    const result = await gitDiffResolver.resolve(appState, { scope: 'all' });
    expect(result.data.secretWarnings).toEqual(['AWS access key']);
  });

  it('propagates a "not a Git repository" rejection from getGitDiff', async () => {
    const appState = baseAppState({
      getGitDiff: vi.fn(async () => {
        throw new Error('This project is not a Git repository.');
      }),
    });
    await expect(gitDiffResolver.resolve(appState, { scope: 'all' })).rejects.toThrow(
      'This project is not a Git repository.',
    );
  });

  it('renders branch, commits, untracked files, and fenced diffs as Markdown', () => {
    const snapshot = {
      data: {
        branch: 'main',
        staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
        unstaged: '',
        untracked: ['new-file.txt'],
        recentCommits: ['abc123 Fix bug'],
        truncated: false,
        secretWarnings: [],
      },
    };
    const markdown = gitDiffResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Git diff');
    expect(markdown).toContain('Branch: `main`');
    expect(markdown).toContain('Recent commits: abc123 Fix bug');
    expect(markdown).toContain('Untracked files: new-file.txt');
    expect(markdown).toContain('```diff');
    expect(markdown).toContain('+staged change');
  });

  it('renders a secret-warning callout when present', () => {
    const snapshot = {
      data: {
        branch: 'main',
        staged: '',
        unstaged: '+AWS_KEY = "AKIAABCDEFGHIJKLMNOP"',
        untracked: [],
        recentCommits: [],
        truncated: false,
        secretWarnings: ['AWS access key'],
      },
    };
    const markdown = gitDiffResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('Possible secret detected (AWS access key)');
  });

  it('has no computeStaleKey — Git Diff never auto-stales', () => {
    expect(gitDiffResolver.computeStaleKey).toBeUndefined();
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/gitDiffResolver.test.js
~~~

Expected: FAIL — `gitDiffResolver.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Create `src/context/gitDiffResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { scanForSecrets } from './secretScan.js';

export const gitDiffResolver = {
  type: CONTEXT_CHIP_TYPES.GIT_DIFF,
  label: 'Git diff',

  // Optimistic: a project being open is all that's checked synchronously.
  // Whether it's actually a Git repository can only be known by calling
  // getGitDiff(), which resolve() does — a non-repo shows up as this chip's
  // ERROR status with "This project is not a Git repository." (spec §26),
  // the same generic error-chip UX every other resolver already uses.
  isAvailable(appState) {
    return !!appState.projectPath;
  },

  getDefaultOptions() {
    return { scope: 'all' };
  },

  async resolve(appState, options) {
    const scope = options?.scope || 'all';
    const result = await appState.getGitDiff();
    const staged = scope === 'unstaged' ? '' : result.staged;
    const unstaged = scope === 'staged' ? '' : result.unstaged;
    const secretWarnings = scanForSecrets(`${staged}\n${unstaged}`);

    const data = {
      branch: result.branch,
      scope,
      staged,
      unstaged,
      untracked: result.untracked,
      recentCommits: result.recentCommits,
      truncated: result.truncated,
      secretWarnings,
    };

    return {
      data,
      estimatedCharacters: staged.length + unstaged.length + result.untracked.join('').length,
      sourceRevision: `${result.branch}:${staged.length + unstaged.length}`,
    };
  },

  renderMarkdown(snapshot) {
    const { branch, staged, unstaged, untracked, recentCommits, truncated, secretWarnings } = snapshot.data;
    const lines = ['### Git diff', ''];
    if (secretWarnings.length > 0) {
      lines.push(`> ⚠️ Possible secret detected (${secretWarnings.join(', ')}) — review before sending.`, '');
    }
    lines.push(`- Branch: \`${branch}\``);
    if (recentCommits.length > 0) lines.push(`- Recent commits: ${recentCommits.join(' · ')}`);
    if (untracked.length > 0) lines.push(`- Untracked files: ${untracked.join(', ')}`);
    if (staged.trim()) lines.push('', 'Staged:', '', '```diff', staged.trim(), '```');
    if (unstaged.trim()) lines.push('', 'Unstaged:', '', '```diff', unstaged.trim(), '```');
    if (!staged.trim() && !unstaged.trim()) lines.push('', '_(no staged or unstaged changes)_');
    if (truncated) lines.push('', '_(diff truncated to keep the context a reasonable size)_');
    return lines.join('\n');
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/gitDiffResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/gitDiffResolver.js src/context/gitDiffResolver.test.js
rtk git commit -m "feat: add git-diff context resolver"
~~~

## Task 9: Surface secret warnings on the Selected Files resolver

**Files:**

- Modify: `src/context/selectedFilesResolver.js`
- Modify: `src/context/selectedFilesResolver.test.js`

**Interfaces:**

- Consumes: `scanForSecrets` (Task 2).
- Produces: `selectedFilesResolver`'s resolved `data` gains a `secretWarnings: string[]` field — deduped `"<pattern> in <path>"` strings across all attached files.

- [ ] **Step 1: Write the failing tests**

In `src/context/selectedFilesResolver.test.js`, update the "reads every selected file" test's expectation and add a new test. Replace the full contents of `src/context/selectedFilesResolver.test.js`:

~~~js
import { describe, expect, it, vi } from 'vitest';
import { selectedFilesResolver } from './selectedFilesResolver.js';

describe('selectedFilesResolver', () => {
  it('is unavailable without an open project', () => {
    expect(selectedFilesResolver.isAvailable({ projectPath: null })).toBe(false);
  });

  it('is available with an open project', () => {
    expect(selectedFilesResolver.isAvailable({ projectPath: '/projects/site' })).toBe(true);
  });

  it('defaults to no selected paths', () => {
    expect(selectedFilesResolver.getDefaultOptions()).toEqual({ paths: [] });
  });

  it('reads every selected file through the injected reader', async () => {
    const readProjectFile = vi.fn(async (rel) => ({
      rel,
      content: `content of ${rel}`,
      size: 42,
    }));
    const result = await selectedFilesResolver.resolve(
      { readProjectFile },
      { paths: ['src/components/Hero.astro', 'src/pages/index.astro'] },
    );
    expect(readProjectFile).toHaveBeenCalledWith('src/components/Hero.astro');
    expect(readProjectFile).toHaveBeenCalledWith('src/pages/index.astro');
    expect(result.data.files).toEqual([
      { path: 'src/components/Hero.astro', content: 'content of src/components/Hero.astro' },
      { path: 'src/pages/index.astro', content: 'content of src/pages/index.astro' },
    ]);
    expect(result.data.secretWarnings).toEqual([]);
    expect(result.estimatedCharacters).toBe(
      'content of src/components/Hero.astro'.length + 'content of src/pages/index.astro'.length,
    );
    expect(result.sourceRevision).toEqual(expect.any(String));
  });

  it('surfaces a secret warning found in an attached file, naming the file', async () => {
    const readProjectFile = vi.fn(async (rel) =>
      rel === '.env.example'
        ? { rel, content: 'AWS_KEY=AKIAABCDEFGHIJKLMNOP', size: 30 }
        : { rel, content: 'ordinary content', size: 17 },
    );
    const result = await selectedFilesResolver.resolve(
      { readProjectFile },
      { paths: ['.env.example', 'src/pages/index.astro'] },
    );
    expect(result.data.secretWarnings).toEqual(['AWS access key in .env.example']);
  });

  it('rejects resolving with no paths selected', async () => {
    await expect(
      selectedFilesResolver.resolve({ readProjectFile: vi.fn() }, { paths: [] }),
    ).rejects.toThrow('Select at least one file.');
  });

  it('renders each file as its own fenced Markdown block', () => {
    const snapshot = {
      data: {
        files: [
          { path: 'src/components/Hero.astro', content: '<h1>Hi</h1>' },
          { path: 'src/styles/global.css', content: 'body { margin: 0; }' },
        ],
        secretWarnings: [],
      },
    };
    const markdown = selectedFilesResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Selected files');
    expect(markdown).toContain('#### `src/components/Hero.astro`');
    expect(markdown).toContain('```astro');
    expect(markdown).toContain('<h1>Hi</h1>');
    expect(markdown).toContain('#### `src/styles/global.css`');
    expect(markdown).toContain('```css');
    expect(markdown).toContain('body { margin: 0; }');
  });

  it('renders a secret-warning callout when present', () => {
    const snapshot = {
      data: {
        files: [{ path: '.env.example', content: 'AWS_KEY=AKIAABCDEFGHIJKLMNOP' }],
        secretWarnings: ['AWS access key in .env.example'],
      },
    };
    const markdown = selectedFilesResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('Possible secret detected: AWS access key in .env.example');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/selectedFilesResolver.test.js
~~~

Expected: FAIL — `result.data.secretWarnings` is `undefined`, and the callout isn't rendered.

- [ ] **Step 3: Implement secret-warning surfacing**

Replace the full contents of `src/context/selectedFilesResolver.js`:

~~~js
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { scanForSecrets } from './secretScan.js';

const LANGUAGE_BY_EXTENSION = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  astro: 'astro',
  json: 'json',
  md: 'markdown',
  html: 'html',
};

function languageFor(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] || '';
}

export const selectedFilesResolver = {
  type: CONTEXT_CHIP_TYPES.SELECTED_FILES,
  label: 'Selected files',

  isAvailable(appState) {
    return !!appState.projectPath;
  },

  getDefaultOptions() {
    return { paths: [] };
  },

  async resolve(appState, options) {
    const paths = options?.paths || [];
    if (paths.length === 0) throw new Error('Select at least one file.');
    const files = [];
    for (const rel of paths) {
      const result = await appState.readProjectFile(rel);
      files.push({ path: rel, content: result.content });
    }
    const secretWarnings = [
      ...new Set(
        files.flatMap((file) => scanForSecrets(file.content).map((name) => `${name} in ${file.path}`)),
      ),
    ];
    const estimatedCharacters = files.reduce((sum, file) => sum + file.content.length, 0);
    const sourceRevision = files.map((file) => `${file.path}:${file.content.length}`).join('|');
    return { data: { files, secretWarnings }, estimatedCharacters, sourceRevision };
  },

  renderMarkdown(snapshot) {
    const { files, secretWarnings } = snapshot.data;
    const lines = ['### Selected files', ''];
    if (secretWarnings.length > 0) {
      lines.push(`> ⚠️ Possible secret detected: ${secretWarnings.join('; ')} — review before sending.`, '');
    }
    for (const file of files) {
      lines.push(`#### \`${file.path}\``, '', '```' + languageFor(file.path), file.content, '```', '');
    }
    return lines.join('\n').trimEnd();
  },
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/selectedFilesResolver.test.js
~~~

Expected: all tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/selectedFilesResolver.js src/context/selectedFilesResolver.test.js
rtk git commit -m "feat: surface secret warnings on the selected-files resolver"
~~~

## Task 10: Auto-choose inline vs. context-file delivery

**Files:**

- Modify: `src/context/useTerminalContext.js`
- Modify: `src/context/useTerminalContext.test.js`

**Interfaces:**

- Consumes: `shouldUseContextFile` (Task 4).
- Produces: `insertIntoTerminal()` stays a synchronous function with the same call signature and dispatched-event shape (`{action: 'insert', text}`) for the common case (`shouldUseContextFile` false — dispatches `composedMarkdown` inline, synchronously, exactly as today). When `shouldUseContextFile` is true, it instead calls `appState.writeContextBundle(composedMarkdown) -> Promise<{relPath}>` (Task 5, wrapped by `ContextChipBar` in Task 11) and dispatches a short reference message once that resolves; a failed write falls back to inline delivery (spec §26).

- [ ] **Step 1: Write the failing tests**

In `src/context/useTerminalContext.test.js`, add two new tests after the existing `'dispatches a cancelable event'` test (just before the closing `});` of the `describe` block). Insert:

~~~js
  it('writes a context-file bundle and inserts a short reference when the content is large', async () => {
    registerResolver(fakeResolver());
    const writeContextBundle = vi.fn(async () => ({ relPath: '.stacki/tmp/context/request-1.md' }));
    const { result } = renderHook(() =>
      useTerminalContext({ currentFile: null, projectPath: null, writeContextBundle }),
    );

    act(() => {
      result.current.setPrompt('x'.repeat(9000));
    });

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(writeContextBundle).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.text).toBe(
      'Read the Stacki context at:\n\n.stacki/tmp/context/request-1.md\n\nThen complete this request:\n\n' +
        'x'.repeat(9000),
    );
    expect(result.current.prompt).toBe('');
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('falls back to inline delivery when writing the context file fails', async () => {
    registerResolver(fakeResolver());
    const writeContextBundle = vi.fn(async () => {
      throw new Error('disk full');
    });
    const { result } = renderHook(() =>
      useTerminalContext({ currentFile: null, projectPath: null, writeContextBundle }),
    );

    act(() => {
      result.current.setPrompt('x'.repeat(9000));
    });

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener.mock.calls[0][0].detail.text).not.toContain('Read the Stacki context at:');
    expect(listener.mock.calls[0][0].detail.text).toContain('x'.repeat(9000));
    expect(result.current.prompt).toBe('');
    window.removeEventListener('stacki:terminal-menu', listener);
  });
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/context/useTerminalContext.test.js
~~~

Expected: FAIL — both new tests time out waiting for the listener (today's `insertIntoTerminal` always dispatches `composedMarkdown` inline and never calls `writeContextBundle`).

- [ ] **Step 3: Implement the delivery-mode decision**

Replace the full contents of `src/context/useTerminalContext.js`:

~~~js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTEXT_CHIP_STATUS,
  createSnapshot,
  withError,
  withReady,
  withStale,
} from './contextTypes.js';
import { getResolver } from './contextResolvers.js';
import { composePrompt } from './promptComposer.js';
import { shouldUseContextFile } from './contextSize.js';

export function useTerminalContext(appState) {
  const [chips, setChips] = useState([]);
  const [prompt, setPrompt] = useState('');
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  const resolveChip = useCallback(async (id, type, options) => {
    const resolver = getResolver(type);
    try {
      // Capture appStateRef.current ONCE, before the await, and reuse that
      // same snapshot for both resolve() and computeStaleKey(). appState is
      // reassigned into the ref on every render, and resolve() can await a
      // real round-trip (e.g. serializeNode's IPC call) during which the
      // user can trigger an ordinary re-render (e.g. selecting a different
      // node). Reading appStateRef.current a second time after the await
      // would compute the stale key from that NEWER state while `result`
      // still describes the OLDER one — the two would then always agree
      // (both "new"), so the chip would silently show stale data with no
      // "Updated" badge ever appearing.
      const state = appStateRef.current;
      const result = await resolver.resolve(state, options);
      const staleKey = resolver.computeStaleKey ? resolver.computeStaleKey(state) : null;
      setChips((current) =>
        current.map((chip) =>
          chip.id === id ? { ...withReady(chip, result), staleKey } : chip,
        ),
      );
    } catch (error) {
      setChips((current) =>
        current.map((chip) => (chip.id === id ? withError(chip, error) : chip)),
      );
    }
  }, []);

  const addChip = useCallback(
    (type, options) => {
      const resolver = getResolver(type);
      if (!resolver) throw new Error(`No resolver registered for "${type}".`);
      const resolvedOptions = options ?? resolver.getDefaultOptions(appStateRef.current);
      const snapshot = createSnapshot({ type, label: resolver.label, options: resolvedOptions });
      setChips((current) => [...current, snapshot]);
      void resolveChip(snapshot.id, type, resolvedOptions);
      return snapshot.id;
    },
    [resolveChip],
  );

  const removeChip = useCallback((id) => {
    setChips((current) => current.filter((chip) => chip.id !== id));
  }, []);

  const refreshChip = useCallback(
    (id) => {
      // Look up the target chip from current `chips` state rather than
      // capturing it inside the setChips updater: React 18 batches state
      // updates, so an updater passed to setChips does not run
      // synchronously in this call frame, and a `let target` closure
      // written from inside it would still be null on the next line.
      const target = chips.find((chip) => chip.id === id);
      if (!target) return;
      setChips((current) =>
        current.map((chip) =>
          chip.id === id ? { ...chip, status: CONTEXT_CHIP_STATUS.RESOLVING } : chip,
        ),
      );
      void resolveChip(id, target.type, target.options);
    },
    [chips, resolveChip],
  );

  // Each resolver may declare computeStaleKey(appState) to say what its
  // snapshot depends on. A ready chip whose resolver's current key no longer
  // matches the key captured at resolve time has had its source change from
  // under it — mark it stale so the user can refresh or keep the captured
  // version. Resolvers without computeStaleKey (e.g. Selected files, Git
  // diff) never auto-stale.
  useEffect(() => {
    setChips((current) => {
      // Bail out with the same array reference when nothing actually goes
      // stale. `.map()` unconditionally allocates a new array, and handing
      // that to setChips would change identity even when no chip changed —
      // React can't bail out of the re-render, appState's identity may be
      // freshly allocated by the caller on every one of those re-renders too
      // (e.g. an inline object literal), and the resulting render -> effect
      // -> setChips -> render cycle never terminates.
      let changed = false;
      const next = current.map((chip) => {
        if (chip.status !== CONTEXT_CHIP_STATUS.READY) return chip;
        const resolver = getResolver(chip.type);
        if (!resolver?.computeStaleKey) return chip;
        const staleKey = resolver.computeStaleKey(appState);
        if (staleKey === chip.staleKey) return chip;
        changed = true;
        return withStale(chip);
      });
      return changed ? next : current;
    });
  }, [appState]);

  const composedMarkdown = useMemo(
    () => composePrompt({ request: prompt, snapshots: chips }),
    [prompt, chips],
  );

  const insertIntoTerminal = useCallback(() => {
    const dispatch = (text) => {
      // `dispatchEvent` runs listeners synchronously, so TerminalPanel's
      // handler has already run (and called `preventDefault()` if it
      // couldn't actually paste — no live shell session) by the time this
      // returns. Only clear the prompt when the text was really delivered,
      // or the user's typed request is silently lost the moment the shell
      // exits.
      const event = new CustomEvent('stacki:terminal-menu', {
        cancelable: true,
        detail: { action: 'insert', text },
      });
      window.dispatchEvent(event);
      if (!event.defaultPrevented) {
        setPrompt('');
      }
    };

    // Deciding synchronously, and only awaiting anything on the file-
    // delivery branch, keeps the common case (small prompt, no Git diff /
    // big file-list chip) fully synchronous — existing callers dispatch and
    // assert immediately after calling this, with no render in between.
    if (!shouldUseContextFile({ chips, composedMarkdown })) {
      dispatch(composedMarkdown);
      return;
    }

    const requestText = prompt.trim();
    void appStateRef.current
      .writeContextBundle(composedMarkdown)
      .then(({ relPath }) => {
        dispatch(`Read the Stacki context at:\n\n${relPath}\n\nThen complete this request:\n\n${requestText}`);
      })
      .catch(() => {
        // Spec §26: "Context file creation failed -> Fall back to inline
        // mode when possible."
        dispatch(composedMarkdown);
      });
  }, [chips, composedMarkdown, prompt]);

  return {
    chips,
    prompt,
    setPrompt,
    addChip,
    removeChip,
    refreshChip,
    composedMarkdown,
    insertIntoTerminal,
  };
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/context/useTerminalContext.test.js
~~~

Expected: all tests pass, including the three pre-existing `insertIntoTerminal` tests (small prompt, no Git diff / big file chip — `shouldUseContextFile` stays false, so the dispatch remains synchronous exactly as before).

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/context/useTerminalContext.js src/context/useTerminalContext.test.js
rtk git commit -m "feat: auto-choose inline vs context-file delivery when inserting into the terminal"
~~~

## Task 11: Register the new resolvers and add the size indicator

**Files:**

- Modify: `src/panels/ContextChipBar.jsx`
- Modify: `src/panels/ContextChipBar.test.jsx`
- Modify: `src/styles.css`

**Interfaces:**

- Consumes: `consoleErrorsResolver` (Task 7), `gitDiffResolver` (Task 8), `estimateTokens` (existing, `contextTypes.js`), `sizeLevel` (Task 4).
- Produces: `ContextChipBar` gains a `devLog` prop (string, default `''`), merged into `appState` alongside `editorContext`. `appState` gains `getGitDiff` and `writeContextBundle`, wrapping the new IPC methods the same way `serializeNode` already wraps `context:serializeNode`. A `.context-size-indicator` element is rendered in the send row whenever at least one chip is attached.

- [ ] **Step 1: Write the failing tests**

In `src/panels/ContextChipBar.test.jsx`, extend the `beforeEach` mock and add four new tests. Replace the full contents of `src/panels/ContextChipBar.test.jsx`:

~~~jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextChipBar from './ContextChipBar.jsx';

beforeEach(() => {
  window.avb = {
    listContextFiles: vi.fn(async () => ({ files: ['src/pages/index.astro'] })),
    readContextFile: vi.fn(async ({ rel }) => ({ rel, content: `content of ${rel}`, size: 10 })),
    serializeNode: vi.fn(async ({ node }) => ({ markup: `<${node.name}></${node.name}>` })),
    getGitDiff: vi.fn(async () => ({
      isRepo: true,
      branch: 'main',
      staged: '',
      unstaged: '',
      untracked: [],
      recentCommits: [],
      truncated: false,
    })),
    writeContextBundle: vi.fn(async () => ({ relPath: '.stacki/tmp/context/request-1.md' })),
  };
});

describe('ContextChipBar', () => {
  it('offers Current file only when a file is open, and adds it as a ready chip', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Current file')).not.toBeInTheDocument();
    expect(screen.getByText('Selected files')).toBeInTheDocument();
  });

  it('adds the current file as a chip and includes it in the composed prompt', async () => {
    render(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' }}
        projectPath="/projects/site"
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Current file'));
    await waitFor(() => expect(screen.getByText('Current file')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix the spacing.' } });

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.action).toBe('insert');
    expect(listener.mock.calls[0][0].detail.text).toContain('const x = 1;');
    expect(listener.mock.calls[0][0].detail.text).toContain('Fix the spacing.');
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('adds selected files through the file picker', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Selected files'));
    await waitFor(() => expect(screen.getByText('src/pages/index.astro')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('src/pages/index.astro'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 file' }));

    await waitFor(() => expect(screen.getByText('Selected files')).toBeInTheDocument());
    expect(window.avb.readContextFile).toHaveBeenCalledWith({
      projectPath: '/projects/site',
      rel: 'src/pages/index.astro',
    });
  });

  it('disables Insert into terminal until there is prompt text', () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    expect(screen.getByRole('button', { name: 'Insert into terminal' })).toBeDisabled();
  });

  it('offers Selected element, Current page, and Current component only when editor context supports them', () => {
    const { rerender } = render(
      <ContextChipBar currentFile={null} projectPath="/projects/site" editorContext={{}} />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Selected element')).not.toBeInTheDocument();
    expect(screen.queryByText('Current page')).not.toBeInTheDocument();
    expect(screen.queryByText('Current component')).not.toBeInTheDocument();

    const selectedNode = { id: 'h1', kind: 'element', name: 'h1', props: {}, children: null };
    const nodeTree = [
      { id: 'hero', kind: 'component', name: 'HeroSection', props: {}, children: [selectedNode] },
    ];
    const componentDefinitions = [
      { name: 'HeroSection', path: '/projects/site/src/components/HeroSection.astro' },
    ];
    rerender(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{
          selectedNode,
          nodeTree,
          componentDefinitions,
          pageInfo: {
            editable: true,
            route: '/',
            path: 'src/pages/index.astro',
            layoutName: '',
            imports: [],
            frontmatter: '',
          },
        }}
      />,
    );
    expect(screen.getByText('Selected element')).toBeInTheDocument();
    expect(screen.getByText('Current page')).toBeInTheDocument();
    expect(screen.getByText('Current component')).toBeInTheDocument();
  });

  it('shows a markdown preview in the details popover for a stale chip, not just a ready one', async () => {
    const { rerender } = render(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' }}
        projectPath="/projects/site"
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Current file'));
    await waitFor(() => expect(screen.getByText('Current file')).toBeInTheDocument());

    rerender(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 2;' }}
        projectPath="/projects/site"
      />,
    );

    fireEvent.click(screen.getByText('Current file'));
    expect(await screen.findByText(/const x = 1;/)).toBeInTheDocument();
  });

  it('adds a Selected element chip and includes its serialized markup in the composed prompt', async () => {
    const selectedNode = { id: 'h1', kind: 'element', name: 'h1', props: {}, children: null };
    render(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{ selectedNode, nodeTree: [selectedNode], componentDefinitions: [] }}
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Selected element'));
    await waitFor(() => expect(screen.getByText('Selected element')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix this.' } });
    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));
    expect(listener.mock.calls[0][0].detail.text).toContain('<h1></h1>');
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('offers Console errors only when the dev log has captured problems', () => {
    const { rerender } = render(<ContextChipBar currentFile={null} projectPath="/projects/site" devLog="" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Console errors')).not.toBeInTheDocument();

    rerender(<ContextChipBar currentFile={null} projectPath="/projects/site" devLog="Error: build failed" />);
    expect(screen.getByText('Console errors')).toBeInTheDocument();
  });

  it('offers Git diff whenever a project is open', () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.getByText('Git diff')).toBeInTheDocument();
  });

  it('shows a context-size indicator only once a chip is attached, reflecting the composed size', async () => {
    const bigContent = 'x'.repeat(20000);
    render(
      <ContextChipBar
        currentFile={{ path: 'big.astro', title: 'big', language: 'astro', content: bigContent }}
        projectPath="/projects/site"
      />,
    );
    expect(screen.queryByText(/Context: ~/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Current file'));
    await waitFor(() => expect(screen.getByText('Current file')).toBeInTheDocument());

    const indicator = await screen.findByText(/Context: ~/);
    expect(indicator.className).toContain('warning');
  });

  it('writes a context-file bundle and inserts a short reference when a Git diff chip forces file delivery', async () => {
    window.avb.getGitDiff = vi.fn(async () => ({
      isRepo: true,
      branch: 'main',
      staged: '',
      unstaged: 'diff --git a/x.astro b/x.astro\n+change',
      untracked: [],
      recentCommits: [],
      truncated: false,
    }));

    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Git diff'));
    await waitFor(() => expect(screen.getByText('Git diff')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Continue this change.' } });
    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));

    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(window.avb.writeContextBundle).toHaveBeenCalledWith({
      projectPath: '/projects/site',
      markdown: expect.stringContaining('Continue this change.'),
    });
    expect(listener.mock.calls[0][0].detail.text).toBe(
      'Read the Stacki context at:\n\n.stacki/tmp/context/request-1.md\n\nThen complete this request:\n\nContinue this change.',
    );
    window.removeEventListener('stacki:terminal-menu', listener);
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: FAIL — Console errors/Git diff aren't offered, and there's no size indicator.

- [ ] **Step 3: Wire the new resolvers, appState fields, and size indicator**

Replace the full contents of `src/panels/ContextChipBar.jsx`:

~~~jsx
import React, { useCallback, useMemo, useState } from 'react';
import ContextChip from './ContextChip.jsx';
import ContextPicker from './ContextPicker.jsx';
import ContextDetailsPopover from './ContextDetailsPopover.jsx';
import { getResolver, listResolvers, registerResolver } from '../context/contextResolvers.js';
import { currentFileResolver } from '../context/currentFileResolver.js';
import { selectedFilesResolver } from '../context/selectedFilesResolver.js';
import { selectedElementResolver } from '../context/selectedElementResolver.js';
import { currentPageResolver } from '../context/currentPageResolver.js';
import { currentComponentResolver } from '../context/currentComponentResolver.js';
import { consoleErrorsResolver } from '../context/consoleErrorsResolver.js';
import { gitDiffResolver } from '../context/gitDiffResolver.js';
import { useTerminalContext } from '../context/useTerminalContext.js';
import { estimateTokens } from '../context/contextTypes.js';
import { sizeLevel } from '../context/contextSize.js';

// Registering here (module scope, run once on import) keeps every resolver
// available wherever the chip bar is mounted, without a separate bootstrap
// step. Re-registering on a hot reload is harmless — the registry keys by
// type and simply replaces the previous entry.
registerResolver(currentFileResolver);
registerResolver(selectedFilesResolver);
registerResolver(selectedElementResolver);
registerResolver(currentPageResolver);
registerResolver(currentComponentResolver);
registerResolver(consoleErrorsResolver);
registerResolver(gitDiffResolver);

const EMPTY_EDITOR_CONTEXT = {};

export default function ContextChipBar({
  currentFile,
  projectPath,
  editorContext = EMPTY_EDITOR_CONTEXT,
  devLog = '',
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsId, setDetailsId] = useState(null);

  const appState = useMemo(
    () => ({
      currentFile,
      projectPath,
      devLog,
      ...editorContext,
      readProjectFile: (rel) => window.avb.readContextFile({ projectPath, rel }),
      listProjectFiles: async () => (await window.avb.listContextFiles({ projectPath })).files,
      serializeNode: async (node) => (await window.avb.serializeNode({ node })).markup,
      getGitDiff: () => window.avb.getGitDiff({ projectPath }),
      writeContextBundle: (markdown) => window.avb.writeContextBundle({ projectPath, markdown }),
    }),
    [currentFile, projectPath, editorContext, devLog],
  );

  const {
    chips,
    prompt,
    setPrompt,
    addChip,
    removeChip,
    refreshChip,
    composedMarkdown,
    insertIntoTerminal,
  } = useTerminalContext(appState);

  const availableResolvers = listResolvers().filter((resolver) => resolver.isAvailable(appState));

  const detailsChip = chips.find((chip) => chip.id === detailsId) || null;
  const detailsMarkdown = useMemo(() => {
    // Both 'ready' and 'stale' chips carry usable `data` (withStale() never
    // clears it), so both have a preview to render — only 'resolving' and
    // 'error' chips don't.
    if (!detailsChip || !['ready', 'stale'].includes(detailsChip.status)) return '';
    const resolver = getResolver(detailsChip.type);
    return resolver ? resolver.renderMarkdown(detailsChip) : '';
  }, [detailsChip]);

  const pickSimple = useCallback(
    (type) => {
      addChip(type);
      setPickerOpen(false);
    },
    [addChip],
  );

  const pickFiles = useCallback(
    (paths) => {
      addChip('selected-files', { paths });
      setPickerOpen(false);
    },
    [addChip],
  );

  const totalTokens = estimateTokens(composedMarkdown.length);
  const sizeIndicatorLevel = sizeLevel(totalTokens);

  return (
    <div className="context-chip-bar">
      <div className="context-chip-row">
        <div className="context-add-wrap">
          <button type="button" className="context-add-button" onClick={() => setPickerOpen((open) => !open)}>
            + Add context
          </button>
          {pickerOpen && (
            <ContextPicker
              resolvers={availableResolvers}
              onPickSimple={pickSimple}
              onPickFiles={pickFiles}
              onListFiles={appState.listProjectFiles}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
        {chips.map((chip) => (
          <div className="context-chip-wrap" key={chip.id}>
            <ContextChip
              snapshot={chip}
              onOpenDetails={(id) => setDetailsId(id === detailsId ? null : id)}
              onRemove={removeChip}
            />
            {detailsId === chip.id && (
              <ContextDetailsPopover
                snapshot={chip}
                markdown={detailsMarkdown}
                onRefresh={refreshChip}
                onRemove={(id) => {
                  removeChip(id);
                  setDetailsId(null);
                }}
                onClose={() => setDetailsId(null)}
              />
            )}
          </div>
        ))}
      </div>
      <textarea
        className="context-prompt"
        placeholder="Ask Codex to…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="context-send-row">
        {chips.length > 0 && (
          <span className={`context-size-indicator ${sizeIndicatorLevel}`}>
            Context: ~{totalTokens.toLocaleString()} tokens
          </span>
        )}
        <button
          type="button"
          className="context-send-button"
          disabled={!prompt.trim()}
          onClick={insertIntoTerminal}
        >
          Insert into terminal
        </button>
      </div>
    </div>
  );
}
~~~

- [ ] **Step 4: Add the size-indicator styles**

In `src/styles.css`, add after the existing `.context-send-row { display: flex; justify-content: flex-end; }` rule (`src/styles.css:1075`):

~~~css
.context-size-indicator {
  margin-right: auto;
  align-self: center;
  font-size: 11px;
  color: var(--text-faint);
}
.context-size-indicator.warning { color: var(--amber); }
.context-size-indicator.large,
.context-size-indicator.blocked { color: var(--red); }
~~~

- [ ] **Step 5: Run tests and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/ContextChipBar.test.jsx
~~~

Expected: all tests pass, including every pre-existing test (rendering `<ContextChipBar>` with no `devLog` at all must still work — the default parameter covers that).

- [ ] **Step 6: Commit**

~~~bash
rtk git add src/panels/ContextChipBar.jsx src/panels/ContextChipBar.test.jsx src/styles.css
rtk git commit -m "feat: register phase-3 resolvers and show a context-size indicator"
~~~

## Task 12: Thread devLog from App.jsx to the chip bar

**Files:**

- Modify: `src/panels/TerminalPanel.jsx:36` (props) and `:482` (ContextChipBar mount)
- Modify: `src/panels/TerminalPanel.test.jsx`
- Modify: `src/App.jsx:2297-2305` (TerminalPanel mount)

**Interfaces:**

- Consumes: the existing `devLog` state in `App.jsx` (`src/App.jsx:364`, already updated by the existing `onDevLog`/`onDevExit` handlers — no change to how it's produced).
- Produces: `<TerminalPanel devLog={...} />` forwards to `<ContextChipBar devLog={...} />` unchanged.

- [ ] **Step 1: Write the failing test**

In `src/panels/TerminalPanel.test.jsx`, find the existing test(s) that render `<TerminalPanel active editorContext={...} />` and mount `ContextChipBar`'s presence (the Phase 2 test verifying `editorContext` threading — search for `'forwards editorContext'` or similar). Add a new test alongside it:

~~~jsx
  it('forwards devLog to the context chip bar', async () => {
    render(<TerminalPanel active currentFile={null} projectPath="/projects/site" devLog="Error: build failed" />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.getByText('Console errors')).toBeInTheDocument();
  });
~~~

(Match this test's imports/setup — `render`, `screen`, `fireEvent` — to whatever this file already imports from `@testing-library/react`; it already renders `<TerminalPanel>` and clicks `+ Add context` in its existing Phase 2 tests, so no new setup is needed.)

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx
~~~

Expected: FAIL — `Console errors` is never offered because `devLog` isn't forwarded yet.

- [ ] **Step 3: Forward devLog**

In `src/panels/TerminalPanel.jsx`, update the component's props destructuring at line 36:

~~~js
export default function TerminalPanel({ active, currentFile, projectPath, editorContext, devLog }) {
~~~

And update the `<ContextChipBar>` mount at line 482:

~~~jsx
        <ContextChipBar currentFile={currentFile} projectPath={projectPath} editorContext={editorContext} devLog={devLog} />
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx
~~~

Expected: all tests pass.

- [ ] **Step 5: Wire App.jsx**

In `src/App.jsx`, update the `<TerminalPanel>` mount (`src/App.jsx:2297-2305`):

~~~jsx
        {terminalMounted && (
          <TerminalPanel
            key={project.path}
            active={leftTab === 'terminal'}
            currentFile={currentFileContext}
            projectPath={project.path}
            editorContext={editorContext}
            devLog={devLog}
          />
        )}
~~~

- [ ] **Step 6: Verify and commit**

Run:

~~~bash
rtk npm test
rtk npm run build
~~~

Expected: the full suite passes and the renderer builds. (`App.jsx` has no per-feature unit tests of its own, matching Phase 1/2 precedent — the new resolvers and the chip bar's use of `devLog` are already covered by Tasks 7 and 11's unit and integration tests; this step confirms App.jsx's own wiring compiles and doesn't break anything else.)

Commit:

~~~bash
rtk git add src/panels/TerminalPanel.jsx src/panels/TerminalPanel.test.jsx src/App.jsx
rtk git commit -m "feat: thread the dev-server log into the terminal context chip bar"
~~~

## Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the complete automated gate**

Run:

~~~bash
rtk npm test
rtk npm run check:electron
rtk npm run build
rtk git diff --check
~~~

Expected: every test passes, every Electron entry parses, Vite builds `dist`, and there are no whitespace errors.

- [ ] **Step 2: Run the development smoke test**

Run:

~~~bash
rtk npm run dev
~~~

In Stacki, in a project that is a Git repository with at least one uncommitted change:

1. Open the project and open the Terminal panel.
2. Cause a build error (e.g. reference a missing import in a page) and confirm the dev server log shows it. Click **+ Add context** and confirm **Console errors** is now offered; add it and confirm the chip's details popover shows the error message. Fix the error and confirm the chip goes stale.
3. Click **+ Add context → Git diff**; confirm the chip's details show the current branch, any untracked files, recent commits, and the real diff text for your uncommitted change.
4. Make a change that introduces something matching a secret pattern (e.g. add a line `AWS_KEY=AKIAABCDEFGHIJKLMNOP` to a tracked file), refresh the Git diff chip, and confirm its rendered content shows a "Possible secret detected" callout.
5. Attach several chips and a long request until the **Context: ~N tokens** indicator turns amber, then red; confirm the color matches the size.
6. With the Git diff chip attached, type a request and click **Insert into terminal**; confirm the terminal receives a short "Read the Stacki context at: .stacki/tmp/context/request-*.md" message instead of the full diff, and confirm that file exists under the project's `.stacki/tmp/context/` directory with the full composed Markdown inside it.
7. Confirm `git status` in that project does not show the `.stacki/tmp/` directory as untracked (its own nested `.gitignore` excludes it).
8. Remove the Git diff chip, attach only a short Current file chip and a short request, click **Insert into terminal**, and confirm the full Markdown is still pasted directly (Mode A, unchanged from Phase 2).
9. In a project that is not a Git repository, click **+ Add context → Git diff** and confirm the chip settles into its Error state with "This project is not a Git repository."

Expected: every step behaves as described, with no console errors and no unexpected `window.avb` calls.

- [ ] **Step 3: Confirm final scope and history**

Run:

~~~bash
rtk git status --short --branch
rtk git log --oneline --decorate -14
~~~

Expected: the implementation worktree is clean, and the log shows one focused commit per task in this plan, with no unrelated files included.
