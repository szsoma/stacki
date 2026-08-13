# Working agreement

This file is the contract for anyone changing this repo — human or coding agent.
`CLAUDE.md` points here. Read it before your first edit.

## What Stacki is

A desktop app for developers and code-literate designers who build Astro sites.
It edits the real `.astro` files in the user's real repo — no proprietary
format, no export step. The canvas handles what is faster to click (page and
site structure, CMS schemas, styling); the embedded terminal hands the rest to
the user's coding agent with editor context attached.

**We are not rebuilding Webflow or Framer.** When a feature could go either
way, choose the version that makes a developer faster, not the version that
hides the code from a non-developer. Generating clean, idiomatic, hand-editable
Astro output matters more than covering every visual case.

## Non-negotiable: features ship with docs

**When you add, remove, or meaningfully change a user-facing feature, update
`README.md` in the same change.** Not in a follow-up commit. Not "later."

- New capability → add or extend its bullet under the right `## Features`
  subsection (Structure, Design, Content, Agent workflow, Project and version
  control).
- New keyboard shortcut → add a row to the shortcuts table.
- New requirement, script, or build step → update Requirements / Checks /
  Packaging.
- Removed or renamed feature → delete or correct the stale entry. A wrong
  README is worse than a thin one.

"User-facing" means a user could notice it: UI, shortcuts, CLI behaviour, file
formats written to their project, setup requirements. Pure refactors, internal
types, and test-only changes do not need a README entry.

Before you call a task done, re-read your README diff and check it describes
what the code actually does.

## Commands

```bash
npm run dev             # Vite + Electron, hot reload
npm test                # vitest (single run)
npm run test:watch      # vitest watch
npm run typecheck       # tsc --noEmit — strict, checkJs on
npm run check:electron  # node --check over the main-process files
```

CI (`.github/workflows/ci.yml`) runs `check:electron`, `vitest run`, and
`typecheck` on every PR and push to `main`. All three must pass. Run them
locally before you claim a change is finished — do not report success on
unverified work.

## Repo map

```
electron/          Main process. CommonJS, NO build step.
  main.js          Window, menus, dev server, fs/git/CMS/asset IPC
  preload.js       The context-isolated window.avb bridge
  astroParser.js   .astro <-> node-tree parser + serializer
  terminal*.js     node-pty session manager and its IPC
src/
  App.tsx          Root component, effects, IPC wiring
  store/           Zustand slices, pure mutations, selectors
  model/           Pure node-tree helpers (no React)
  panels/          Left/right dock panels
  style-panel/     The CSS authoring surface
  context/         Terminal context chip resolvers
  ui/              Shared widgets
  i18n/en.json     Every user-facing string
docs/superpowers/  specs/ (design docs) and plans/ (implementation plans)
```

## Conventions

**TypeScript is strict and `checkJs` is on.** Every `.js`/`.jsx` file is
type-checked unless it carries the first-line opt-out documented in
`docs/checkjs-migration.md`. That opt-out is a shrinking backlog — never add it
to a new file, and prefer removing one from a file you are already editing.

**`electron/` has no compile step.** It is CommonJS, `require`d at runtime, and
`astroParser.js` is read by absolute path and listed in `build.asarUnpack`.
Do not convert it to TypeScript or add a bundler to it. Type it with
`// @ts-check` and JSDoc instead.

**The IPC surface is closed.** Renderer code talks to the main process only
through `window.avb`. Never expose `ipcRenderer`, raw `fs`, or a generic command
runner. New methods go in `electron/preload.js` *and* `src/types/ipc.d.ts` —
a drift test fails if the two disagree.

**State lives in the store.** Derived values are selectors in
`src/store/selectors.ts`, edits are pure `(model, args) => model` functions in
`src/store/mutations.ts`. Do not add new `useState` in `App.tsx` for anything
that belongs in a slice. Two timing contracts are load-bearing: undo coalescing
at 800 ms (history caps at 100) and the 300 ms save debounce.

**All user-facing strings go through i18n.** Import `useT` from
`src/i18n/I18nContext.jsx` and add the key to `src/i18n/en.json`. No hardcoded
copy in components.

**Never rewrite a user's source destructively.** If the parser cannot model a
construct, fall back to the code editor and leave the file alone. Guessing is
worse than declining.

## Tests

Vitest + Testing Library, jsdom. Test files sit next to their subject
(`foo.ts` → `foo.test.ts`).

Write the failing test first, watch it fail, then implement. Pure logic
(`model/`, `store/`, `context/`) is tested without a render harness — keep it
that way by keeping logic out of components. Panels render against a seeded
store, not a hand-built prop bag.

## Commits

Conventional prefixes, lowercase imperative, no trailing period:

```
feat: enable component view node selection
fix: include component owner in selected context
refactor: retire preview element context
docs: define selected element terminal context
```

Commit early and often. Do not commit or push unless the user asked.

## Design docs and plans

Non-trivial work starts with a design doc in `docs/superpowers/specs/` and an
implementation plan in `docs/superpowers/plans/`, both dated
`YYYY-MM-DD-<name>.md`. Check whether one already exists before planning
anything — several features here were designed before they were built.

## Security

- Never commit signing material, tokens, or `.env` files.
- Never add a workflow using `pull_request_target` or one that exposes secrets
  to fork code.
- The preview iframe gets no application API. Keep it that way.
