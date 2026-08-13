# Stacki

Visual Builder for Astro.

A Mac & Windows desktop app for editing [Astro](https://astro.build) projects
visually — with a real shell and your coding agent in the same window.

Stacki is built for developers and code-literate designers. It edits your actual
`.astro` files in your actual repo: no proprietary format, no export step, no
lock-in. Use the canvas for the parts that are faster to click, and the built-in
terminal for the parts that are faster to type.

MIT licensed — fork it, build on it, ship your own version.

## Features

### Structure

- **Pages** — browse every page in `src/pages`, create pages and folders
  (including nested routes like `blog/post-1`), drag pages between folders,
  rename folders, and delete. The panel is searchable.
- **Navigator** — the full element tree for the open page: drag to reorder or
  reparent, collapse/expand, and jump to any node. Nesting is unlimited.
- **Layouts** — choose which layout from `src/layouts` wraps each page and edit
  the layout's props.
- **Components** — every component in `src/components` appears in a searchable
  palette. Drag one into the tree, or double-click to append.
- **Component view** — double-click a component instance to open its source file
  on the canvas, edit it in place, and step back out. Nodes owned by the
  component are outlined so it's clear what you're editing.
- **Insert** — `⌘E` opens a search-driven insert palette covering components,
  HTML elements, text, expressions, loops, comments, and `<style>` / `<script>`
  blocks.

### Design

- **Style panel** — a full CSS authoring surface for the selected element:
  layout (flex, grid, positioning), sizing, spacing, typography, backgrounds and
  gradients, borders, transforms, transitions, filters, shadows, and clip-path.
- **Selectors and states** — author against classes, pseudo-classes, and
  pseudo-elements, with a picker that shows what each rule applies to.
- **Responsive and conditional styles** — add `@media`, `@container`, and
  `@supports` queries, including width, hover, pointer, color-scheme, reduced
  motion, contrast, orientation, and aspect-ratio presets.
- **Variables and tokens** — bind any property to a CSS custom property,
  browsing the variables the project already defines.
- **Style provenance** — see which stylesheet or `<style>` block each resolved
  declaration came from, and choose which source to author into.
- **Device preview** — desktop, tablet, phone, and a multi-device canvas view.

### Content

- **CMS** — create and edit Astro content collections visually. Field types
  include text, long text, number, boolean, date, color, image, link, email,
  phone, list, object, repeating objects, and references.
- **Reference fields** — link entries to other collections (single or multi),
  with the schema written back to `src/content/config.ts`.
- **Usage tracking and delete guards** — Stacki shows which pages use a
  collection or entry, and warns before a delete would break them.
- **Assets** — browse, upload, rename, and organise files under `public/`, with
  folder creation, drag-and-drop, and image thumbnails. External changes to
  `public/` refresh the listing automatically.
- **Props** — the props panel reads each component's `interface Props` /
  `Astro.props` destructure and generates typed fields. Defaults show as
  placeholders. Plain HTML elements get attribute schemas too.
- **Loops** — `.map()` blocks are editable as a data source, item name, and
  index name, so CMS-driven lists stay visual.

### Agent workflow

- **Embedded terminal** — a real project-root shell inside Stacki, from the left
  rail or with `⌥T`. Run OpenCode, Claude Code, Codex, or anything else. The
  panel is resizable, and hiding it keeps the running CLI and scrollback alive.
- **Context chips** — attach editor context to whatever you type into the
  terminal, so your agent starts with the same picture you have. Available
  sources: current page, current component, current file, selected element,
  selected files, CMS schema, git diff, console errors, and a preview
  screenshot.
- **Automatic sizing** — large context is written to a bundle file and
  referenced by path instead of pasted inline, so prompts stay small.

### Project and version control

- **Live preview** — Stacki runs `astro dev` for the open project and embeds it.
  Edits auto-save (300 ms debounce), so hot reload updates the preview as you
  type.
- **Preview selection** — click any element in the live preview to select it in
  the tree and the style panel.
- **Git & GitHub** — the branch chip in the title bar shows the current branch
  and dirty state. Switch branches, create branches, commit, push, or publish a
  brand-new repo to GitHub (via the `gh` CLI).
- **Undo/redo** — a full history stack across visual and code edits.
- **Code fallback** — markup too complex for the visual model opens in the
  built-in CodeMirror editor instead, still with live preview.
- **New project** — scaffold from Basics, Blog, Docs (Starlight), or Empty
  starters, with optional `npm install`, git init, and AI agent files.

## Running in development

```bash
npm install
npm run dev
```

`npm run dev` starts Vite (renderer hot reload) and launches Electron against it.

The embedded terminal uses the native `node-pty` module. `npm install` runs
electron-builder's dependency rebuild so the module targets Stacki's Electron
version rather than the system Node.js version.

To run against a production build of the UI:

```bash
npm start
```

## Checks

```bash
npm test              # vitest
npm run typecheck     # tsc --noEmit
npm run check:electron  # syntax-check the main-process files
```

## Packaging installers

If you're building for yourself or from a fork, use the unsigned build — it
needs no Apple Developer account and no certificates:

```bash
npm run dist:mac:unsigned   # .dmg + .zip, no signing (build on macOS)
npm run dist:win            # NSIS installer (build on Windows)
```

Output lands in `release/`. macOS will warn the first time you open an
unsigned build; right-click the app and choose Open to get past Gatekeeper.

The signed variants are for maintainers with the release certificates:

```bash
npm run dist:mac   # requires a Developer ID cert + notarization credentials
```

## Releases

Official builds are published by CI, not from anyone's laptop. Pushing a
`v*` tag runs `.github/workflows/release.yml`, which builds a signed and
notarized macOS universal build plus a Windows installer, uploads them to
the `stacki-releases` repo, and only makes the release visible once both
platforms have landed. Shipped apps auto-update from that feed via
`electron-updater`.

Signing and notarization credentials live in GitHub Actions secrets. They
are never in this repository, and GitHub does not expose them to workflows
triggered from forks — so a fork can build and run everything here, but
cannot produce a build signed with the official identity. That's intended.

If you fork this and publish your own builds, change `build.appId` and
`build.publish` in `package.json` to your own identifiers so your releases
don't collide with the official update feed.

## Contributing

Issues and pull requests are welcome. A few notes:

- `npm run dev` is all you need for day-to-day work — no credentials required.
- **Every user-facing feature ships with its README entry in the same change.**
  See [AGENTS.md](AGENTS.md) for the full working agreement — it applies to
  humans and coding agents alike.
- Please don't add workflows that use `pull_request_target`, or any workflow
  that exposes secrets to code from a fork.
- Report security issues privately to the maintainer rather than opening a
  public issue.

## Requirements

- Node.js 18+ and npm (the app shells out to `npm install` / `astro dev` for opened projects)
- `git` for version control features
- [GitHub CLI](https://cli.github.com) (`gh`), authenticated via `gh auth login`, for "Publish to GitHub"

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `P` | Pages panel |
| `Z` | Navigator |
| `⇧A` | Components |
| `J` | Assets |
| `⌥C` | CMS |
| `⌥T` | Terminal |
| `⌘E` | Insert element |
| `⌘Z` / `⇧⌘Z` | Undo / redo |

Panel shortcuts are ignored while a text field has focus. `⌥T` always works, so
the terminal stays reachable from anywhere.

## How editing works

Pages are parsed into a node tree — elements, components, text, expressions,
`.map()` loops, comments, and raw blocks — with an optional layout wrapper. The
editor writes that tree back as clean `.astro` source.

Markup the visual model can't represent falls back to the built-in code editor.
Nothing is ever rewritten destructively: if Stacki can't model a construct, it
leaves the source alone rather than guessing.
