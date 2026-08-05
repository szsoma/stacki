# Terminal Context Chips

## Product and Technical Specification

### Status

Proposed feature for the Stacki desktop application.

### Working name

**Terminal Context Chips**

### Summary

Terminal Context Chips allow users to attach structured Stacki project context to a terminal or AI-agent prompt without manually copying file paths, source code, errors, screenshots, or component information.

A user can select one or more context chips above the terminal, write a request, and send both the request and the selected context to Codex or another supported terminal-based agent.

Example:

```text
[Selected element] [Current page] [Console errors]

Fix the spacing issue and make sure the section works on mobile.
```

Stacki resolves each selected chip into a structured context payload and inserts or references that payload in the terminal session.

The first version should focus on reliable context collection and transparent prompt composition. It should not allow agents to modify Stacki state directly.

---

# 1. Problem

An AI agent running inside Stacki currently sees the project filesystem and terminal environment, but it does not automatically understand the visual editor state.

The user must manually explain:

- which page is open
- which element is selected
- which component owns the element
- which CMS collection is relevant
- which styles are currently applied
- which runtime error occurred
- which part of the preview should be changed

This creates several problems:

- Prompts require too much manual description.
- The agent may edit the wrong component.
- The agent wastes tokens searching the repository.
- The visual and code contexts can become inconsistent.
- Users cannot easily verify which information was provided.
- Low-code users may not know which files or technical details are relevant.

Terminal Context Chips solve this by turning Stacki application state into explicit, reusable prompt context.

---

# 2. Product Goal

Allow a user to attach accurate Stacki context to an AI-agent request in one or two clicks.

The feature should make prompts:

- faster to write
- more precise
- easier to verify
- less dependent on technical knowledge
- less expensive in token usage
- safer for project-wide changes

---

# 3. Non-Goals

The initial release will not:

- give the agent direct control over the Stacki UI
- allow the agent to call Stacki commands
- automatically accept code changes
- replace Git diffs or source control
- provide a full MCP server
- continuously stream the entire application state
- automatically attach sensitive environment variables
- send context to a remote service without an explicit user action
- interpret arbitrary terminal applications

Terminal Context Chips are a context-composition feature, not an autonomous agent-control system.

---

# 4. Target Users

## Primary user

A low-code or frontend developer who:

- visually edits an Astro project in Stacki
- occasionally modifies source code
- uses Codex or another terminal-based coding agent
- understands components and CMS concepts
- does not want to manually inspect every related file

## Secondary user

A designer-developer who:

- works primarily from the visual canvas
- understands Webflow-style concepts
- wants an AI agent to handle implementation details
- may not know the exact source-file structure

---

# 5. Core User Stories

## Selected element

As a user, I can attach the currently selected visual element so the agent knows exactly which node I am discussing.

## Current page

As a user, I can attach the current page and its relevant source information so the agent does not need to locate it manually.

## Current component

As a user, I can attach the component that owns the selected element so the agent can edit the correct reusable source.

## CMS schema

As a user, I can attach one or more CMS collections so the agent understands available fields and relationships.

## Console errors

As a user, I can attach recent runtime or build errors so the agent can investigate the actual problem.

## Preview screenshot

As a user, I can attach an image of the current preview so the agent can understand visual issues.

## Git diff

As a user, I can attach the current uncommitted diff so the agent can review or continue existing work.

## File attachment

As a user, I can attach a specific project file without manually typing its path.

---

# 6. Primary Interface

The context-chip interface appears directly above the terminal prompt area.

```text
┌─────────────────────────────────────────────────────────────┐
│ Context                                                     │
│                                                             │
│ [+ Add context] [Selected element] [Current page] [Errors]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Ask Codex to fix the mobile layout...                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                          [Send to terminal] │
└─────────────────────────────────────────────────────────────┘
```

The interface contains:

1. An **Add context** control.
2. Zero or more active context chips.
3. A prompt input.
4. A send action.
5. An optional context-size indicator.

---

# 7. Context Chip States

Each chip can have one of the following states.

## Available

The context source is available and can be attached.

```text
[Current page]
```

## Active

The context source is selected and will be included in the next prompt.

```text
[Current page ×]
```

## Resolving

Stacki is collecting or processing the context.

```text
[Current page ···]
```

## Stale

The underlying state has changed since the context was captured.

```text
[Current page  Updated]
```

The user can refresh or keep the existing snapshot.

## Unavailable

The required state does not exist.

Examples:

- No selected element
- No console errors
- No Git repository
- No CMS collections

Unavailable chips should normally be hidden from the quick-access row but visible in the context menu with an explanation.

## Error

Stacki failed to resolve the context.

```text
[Current page  Error]
```

Selecting the error state shows the reason and a retry action.

---

# 8. Context Selection Model

Context should be captured as a **snapshot**, not as a live pointer.

When a chip is activated:

1. Stacki resolves the current data.
2. Stacki stores a context snapshot.
3. The chip represents that snapshot.
4. Later editor changes do not silently alter the attached data.
5. Stacki marks the chip stale when its source changes.

This ensures the user knows exactly what will be sent.

## Refresh behavior

A stale chip offers:

- **Refresh context**
- **Keep captured version**
- **Remove**

## Send behavior

After sending a prompt, active chips remain selected by default for the current terminal conversation.

A user preference may change this behavior to:

- keep context after sending
- clear context after sending

Default: **keep context after sending**.

---

# 9. Context Chip Catalogue

## 9.1 Selected Element

### Purpose

Describes the node currently selected in the Stacki visual editor.

### Availability

Available when a visual node is selected.

### Label

```text
Selected element
```

The chip may display the node name:

```text
Selected: Hero heading
```

### Included information

- Stacki node ID
- node kind
- HTML tag or component name
- user-facing label
- source file
- source location, when available
- parent hierarchy
- child summary
- props and attributes
- classes
- data attributes
- inline styles
- CMS bindings
- loop context
- associated component
- relevant markup excerpt
- relevant CSS selectors
- current viewport
- element bounding box
- optional computed-style summary

### Default size rule

Do not attach the entire page tree.

Include:

- selected node
- direct children
- ancestor path
- source excerpt
- style rules that directly affect the node

### Example payload

```json
{
  "type": "selected-element",
  "label": "Hero heading",
  "capturedAt": "2026-08-04T14:20:00.000Z",
  "data": {
    "nodeId": "c1142",
    "kind": "element",
    "tag": "h1",
    "sourceFile": "src/pages/index.astro",
    "ancestorPath": [
      "Page",
      "HeroSection",
      "hero_content",
      "h1"
    ],
    "props": {
      "class": "hero_heading"
    },
    "bindings": [],
    "sourceExcerpt": "<h1 class=\"hero_heading\">Build faster</h1>",
    "viewport": {
      "width": 1440,
      "height": 900
    }
  }
}
```

---

## 9.2 Current Page

### Purpose

Provides the source and structural context of the page currently open in Stacki.

### Availability

Available when a project page is open.

### Label

```text
Current page
```

An optional path may be shown:

```text
Page: /services
```

### Included information

- route
- source file path
- layout
- imports
- frontmatter
- top-level structure summary
- page-level props
- page-level styles
- CMS data sources
- scripts
- current parse mode
- visual-model compatibility
- relevant source excerpts

### Size limits

Default to a summarized representation.

The user can expand the chip options and choose:

- Summary
- Full page source
- Structure only
- Styles only

Default: **Summary**.

---

## 9.3 Current Component

### Purpose

Provides the source and usage context for the reusable component associated with the selected node.

### Availability

Available when:

- the selected node is a component instance, or
- the selected element is inside a known component boundary

### Included information

- component name
- file path
- component source
- prop interface
- default prop values
- slots
- imports
- local styles
- current instance props
- usage count
- other affected pages
- CMS bindings
- variants, when implemented

### Boundary rule

When an element is nested inside several component boundaries, use the nearest owning component by default.

The context menu may offer:

```text
HeroSection
MarketingLayout
Page
```

---

## 9.4 CMS Schema

### Purpose

Provides the content model used by the current page, component, or selected binding.

### Availability

Available when the project contains supported CMS data.

### Selection modes

- Relevant collections
- Selected collection
- All collections

Default: **Relevant collections**.

### Included information

- collection name
- source file
- storage format
- single or multiple item mode
- fields
- field types
- declared types
- nested objects
- repeating groups
- inferred references
- item count
- sample item
- pages and components consuming the collection
- active bindings

### Data-size rule

Include at most one sample item per collection by default.

The user can explicitly include:

- no sample data
- one item
- three items
- all items

“All items” must display a size warning.

---

## 9.5 Console Errors

### Purpose

Provides recent runtime, preview, Astro, build, or terminal errors.

### Availability

Available when captured errors exist.

### Label variants

```text
Errors: 3
Warnings: 5
```

### Included information

- error message
- error type
- timestamp
- source
- stack trace
- file and line
- related route
- related selected node, when known
- browser-console metadata
- repeated-error count

### Default filtering

Include:

- errors from the current page
- errors from the last five minutes
- maximum of 20 unique errors

Identical repeated errors should be grouped.

### User options

- Errors only
- Errors and warnings
- Current page only
- All recent errors

---

## 9.6 Preview Screenshot

### Purpose

Captures the visible preview for visual reasoning.

### Availability

Available when the preview is running.

### Capture modes

- Current viewport
- Selected element
- Full page
- Responsive set

MVP modes:

- Current viewport
- Selected element

### Included metadata

- image path
- route
- viewport dimensions
- device-pixel ratio
- scroll position
- selected-node bounding box
- capture timestamp

### Annotation

For selected-element screenshots, Stacki should draw a temporary highlight around the element.

The highlight should not alter the source project.

### Storage

Screenshots should be written to a temporary Stacki-managed directory.

Example:

```text
.stacki/tmp/context/preview-1722781200.png
```

The path must be readable by the terminal process.

Screenshots should not be committed to Git.

---

## 9.7 Git Diff

### Purpose

Provides the project’s current uncommitted changes.

### Availability

Available when:

- the project is a Git repository
- tracked or untracked changes exist

### Included information

- current branch
- repository root
- staged diff
- unstaged diff
- untracked file list
- optional recent commit summary

### User options

- All changes
- Staged changes
- Unstaged changes
- Selected files

### Safety rule

Large generated files, binaries, lockfiles, and build output should be excluded by default.

A size warning should appear when the diff exceeds the configured token budget.

---

## 9.8 Current File

### Purpose

Attaches the source file currently open in Stacki’s code editor.

### Availability

Available when the built-in code editor has an active file.

### Included information

- relative file path
- language
- complete source or selected excerpt
- unsaved state
- current cursor location
- selected text range

### Default behavior

When text is selected, attach the selection plus surrounding lines.

When no text is selected, attach a summary and the complete file if it falls below the size threshold.

---

## 9.9 Selected Files

### Purpose

Allows users to manually attach one or more project files.

### Interaction

Selecting **Add context → Files** opens a searchable file picker.

The picker supports:

- filename search
- folder filtering
- recently used files
- current Git changes
- component files
- page files
- CMS files

### Excluded paths

Hide by default:

```text
node_modules
.git
dist
release
.astro
.cache
coverage
```

Users may reveal excluded files through an advanced setting.

---

# 10. Add Context Menu

Selecting **Add context** opens a searchable menu.

```text
Add context

Suggested
  Selected element
  Current page
  Console errors

Project
  Current component
  CMS schema
  Current file
  Select files
  Git diff

Visual
  Preview screenshot

Recent
  HeroSection.astro
  CMS: Articles
  Error: Cannot read property...
```

## Suggested-context logic

Stacki should rank suggestions according to the current state.

Example priority:

1. Selected element
2. Current component
3. Current page
4. Relevant CMS collection
5. Current errors
6. Current file
7. Git diff
8. Preview screenshot

The ranking must be deterministic and local. It should not require AI.

---

# 11. Chip Details Popover

Clicking an active chip opens a details popover.

The popover contains:

- context name
- captured timestamp
- source
- estimated size
- included fields
- preview of generated context
- refresh action
- remove action
- context-specific options

Example:

```text
Selected element

Hero heading
src/pages/index.astro
Captured 14:20:31
Estimated size: 1,240 tokens

Included:
✓ Markup
✓ Ancestor path
✓ Relevant styles
✓ Current viewport
○ Computed styles

[Refresh] [Remove]
```

The user must be able to inspect the final content before sending it.

---

# 12. Prompt Composition

Context should be assembled into a predictable Markdown document.

## Generated prompt structure

```markdown
## User request

Fix the spacing issue and make sure the section works on mobile.

## Stacki context

### Selected element

- Label: Hero heading
- Source: `src/pages/index.astro`
- Node: `h1`
- Viewport: 1440 × 900

Ancestor path:

`Page > HeroSection > hero_content > h1`

Markup:

```astro
<h1 class="hero_heading">Build faster</h1>
```

Relevant styles:

```css
.hero_heading {
  max-width: 12ch;
  margin-bottom: var(--space-l);
}
```

### Current page

- Route: `/`
- Source: `src/pages/index.astro`
- Layout: `BaseLayout.astro`

Structure:

```text
BaseLayout
└─ main
   ├─ HeroSection
   ├─ LogoCloud
   └─ FeaturesSection
```

## Instructions

Use the attached Stacki context as the primary target for this request.
Inspect the repository when additional implementation context is required.
Do not assume that unrelated components should be changed.
```

---

# 13. Prompt Delivery Modes

The terminal integration should support two delivery strategies.

## Mode A: Inline prompt

The complete generated context is pasted directly into the terminal agent prompt.

Best for:

- small contexts
- text-only contexts
- simple terminal agents
- initial MVP

## Mode B: Context file

Stacki writes the context into a temporary Markdown or JSON file and inserts a short instruction into the terminal.

Example terminal prompt:

```text
Read the Stacki context at:

.stacki/tmp/context/request-1722781200.md

Then complete this request:

Fix the spacing issue and make sure the section works on mobile.
```

Best for:

- screenshots
- large diffs
- multiple files
- large CMS schemas
- terminals with poor multiline-paste handling

## Recommended default

Use a context file when:

- an image is attached
- the generated prompt exceeds 8,000 characters
- more than three files are included
- a Git diff is included

Otherwise, use inline mode.

---

# 14. Context File Format

Store generated context files inside:

```text
.stacki/tmp/context/
```

Recommended files:

```text
request-<timestamp>.md
request-<timestamp>.json
preview-<timestamp>.png
```

## Markdown file

Optimized for agent readability.

## JSON file

Optimized for future tools and programmatic integrations.

Example envelope:

```json
{
  "version": 1,
  "project": {
    "name": "example-project",
    "root": "/Users/user/projects/example-project"
  },
  "request": "Fix the spacing issue.",
  "capturedAt": "2026-08-04T14:20:00.000Z",
  "contexts": []
}
```

The Markdown file may reference the JSON file for complete machine-readable data.

---

# 15. Context Data Model

```ts
type ContextChipType =
  | "selected-element"
  | "current-page"
  | "current-component"
  | "cms-schema"
  | "console-errors"
  | "preview-screenshot"
  | "git-diff"
  | "current-file"
  | "selected-files";

type ContextChipStatus =
  | "resolving"
  | "ready"
  | "stale"
  | "error";

interface ContextSnapshot<T = unknown> {
  id: string;
  type: ContextChipType;
  label: string;
  status: ContextChipStatus;
  capturedAt: string;
  sourceRevision?: string;
  estimatedCharacters?: number;
  estimatedTokens?: number;
  options: Record<string, unknown>;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}
```

## Source revision

`sourceRevision` is used to detect stale context.

Possible revision values:

- file modification timestamp
- content hash
- current model version
- selected-node model revision
- Git index hash
- console-log sequence number

---

# 16. React State Architecture

Recommended top-level state:

```ts
interface TerminalContextState {
  chips: ContextSnapshot[];
  prompt: string;
  deliveryMode: "auto" | "inline" | "file";
  isResolving: boolean;
  lastSentRequestId?: string;
}
```

Recommended state ownership:

```text
App
└─ TerminalWorkspace
   ├─ ContextChipBar
   ├─ ContextPicker
   ├─ ContextChip
   ├─ ContextDetailsPopover
   ├─ TerminalPrompt
   └─ TerminalView
```

## Suggested hooks

```ts
useTerminalContext()
useContextSuggestions()
useContextSnapshot()
useContextStaleness()
usePromptComposer()
```

---

# 17. Context Resolver Architecture

Each context type should have its own resolver.

```ts
interface ContextResolver<TOptions, TData> {
  type: ContextChipType;

  isAvailable(
    appState: StackiAppState
  ): boolean;

  getDefaultOptions(
    appState: StackiAppState
  ): TOptions;

  resolve(
    appState: StackiAppState,
    options: TOptions
  ): Promise<TData>;

  getSourceRevision(
    appState: StackiAppState,
    options: TOptions
  ): Promise<string>;

  renderMarkdown(
    snapshot: ContextSnapshot<TData>
  ): string;
}
```

Example registry:

```ts
const contextResolvers = {
  "selected-element": selectedElementResolver,
  "current-page": currentPageResolver,
  "current-component": currentComponentResolver,
  "cms-schema": cmsSchemaResolver,
  "console-errors": consoleErrorsResolver,
  "preview-screenshot": previewScreenshotResolver,
  "git-diff": gitDiffResolver,
  "current-file": currentFileResolver,
  "selected-files": selectedFilesResolver,
};
```

This architecture allows additional context types to be added without changing the terminal feature itself.

---

# 18. Electron IPC Requirements

The renderer must not directly access arbitrary filesystem or shell operations.

Recommended IPC methods:

```ts
window.stackiContext.readFiles(paths)
window.stackiContext.getGitDiff(options)
window.stackiContext.capturePreview(options)
window.stackiContext.writeContextBundle(payload)
window.stackiContext.deleteContextBundle(id)
window.stackiContext.getFileRevision(path)
window.stackiContext.estimateContextSize(payload)
```

## IPC security

Every path passed through IPC must:

1. resolve to an absolute path
2. be checked against the current project root
3. reject path traversal
4. reject symlink escape where possible
5. enforce file-size limits
6. block sensitive files by default

---

# 19. Sensitive Data Rules

Terminal context may contain private project information. Stacki must make inclusion explicit.

## Never include automatically

```text
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
credentials.json
service-account*.json
npm tokens
API tokens
authentication cookies
Git credentials
```

## Secret detection

Before sending or writing context, scan attached text for common secret patterns.

Examples:

- private keys
- bearer tokens
- GitHub tokens
- AWS keys
- OpenAI API keys
- Webflow API tokens
- environment-variable assignments containing secret-like names

## Warning behavior

When a possible secret is detected:

```text
Potential sensitive value detected in .env.example.

[Exclude value]
[Exclude file]
[Review context]
[Send anyway]
```

“Send anyway” should require an explicit action.

---

# 20. Size and Token Management

Context Chips should help reduce unnecessary token usage.

## Estimated size

Display a rough estimate:

```text
Context: approximately 4,200 tokens
```

A precise tokenizer is not required for the MVP. Character-based estimation is acceptable:

```ts
estimatedTokens = Math.ceil(characterCount / 4);
```

## Size thresholds

Suggested defaults:

- Under 4,000 tokens: normal
- 4,000 to 12,000 tokens: warning
- Above 12,000 tokens: large-context warning
- Above 30,000 tokens: block inline mode and require context-file mode

## Reduction suggestions

When context is large, offer:

- Use page summary instead of full source
- Include relevant CMS collections only
- Exclude repeated errors
- Exclude generated files
- Include selected lines only
- Exclude lockfile changes

---

# 21. Context Relevance Rules

Context should remain focused.

## Selected element

Do not include every stylesheet in the project. Include only:

- matching selectors
- inherited custom properties
- classes on the node
- nearby page-level styles
- styles from the owning component

## Current component

Do not include all component usages by default. Include:

- usage count
- affected page list
- current instance
- at most three additional usage examples

## CMS schema

Do not include all content items by default.

## Console errors

Deduplicate repeated errors.

## Git diff

Exclude generated output and binary content.

---

# 22. Terminal Integration

The context feature should be terminal-agent agnostic.

## Supported behavior

Stacki only needs to:

1. assemble the prompt
2. place it in the active terminal input
3. optionally submit it

## Send options

The primary action should be:

```text
Send to terminal
```

A dropdown may offer:

- Insert without sending
- Insert and send

Default: **Insert without sending** during the initial release.

This gives users a final chance to inspect or modify the prompt before execution.

## Terminal capability interface

```ts
interface TerminalAdapter {
  insertText(text: string): Promise<void>;
  submit?(): Promise<void>;
  getActiveSession(): TerminalSession | null;
}
```

---

# 23. Keyboard Interaction

Suggested shortcuts:

```text
⌘⇧K     Open context picker
⌘Enter  Insert prompt into terminal
⌘⇧Enter Insert and send, when enabled
Escape  Close context picker or popover
```

Inside the context picker:

- Arrow keys move selection.
- Enter toggles a context item.
- Space toggles a context item.
- Backspace removes the last active chip when the search field is empty.

Shortcuts must be configurable later.

---

# 24. Suggested Context Automation

Stacki may suggest context, but it should not automatically attach context in the MVP.

Example:

```text
Suggested for this request:
[Selected element] [Current page]
```

Suggestion rules may use:

- current selection
- active page
- visible errors
- active code file
- prompt keywords

Initial implementation should avoid AI inference.

Simple keyword rules are sufficient:

```text
"error", "broken", "fails" → Console errors
"component", "reusable" → Current component
"CMS", "collection", "field" → CMS schema
"layout", "spacing", "responsive" → Selected element + screenshot
"review changes", "diff" → Git diff
```

Suggestions must remain optional.

---

# 25. Persistence

## Project-level preferences

Store in:

```text
.stacki/settings.json
```

Possible settings:

```json
{
  "terminalContext": {
    "keepChipsAfterSend": true,
    "defaultDeliveryMode": "auto",
    "includeComputedStyles": false,
    "includeOneCmsSample": true,
    "gitDiffIncludeUntracked": true
  }
}
```

## Session state

Active chips should persist while:

- switching terminal tabs
- opening and closing the terminal panel
- navigating between Stacki panels

Active chips should reset when:

- closing the project
- opening another project
- explicitly clearing context

Context snapshots do not need to persist after the application closes in the MVP.

---

# 26. Error Handling

## Element no longer exists

```text
The selected element no longer exists.

[Remove context]
```

## Source file changed

```text
The source file changed after this context was captured.

[Refresh] [Keep captured version]
```

## Preview unavailable

```text
The preview is not running, so a screenshot could not be captured.

[Start preview] [Remove]
```

## Git unavailable

```text
This project is not a Git repository.
```

## Context file creation failed

Fall back to inline mode when possible.

## Terminal unavailable

Keep the composed prompt and display:

```text
No active terminal session.

[Open terminal]
```

---

# 27. Accessibility Requirements

- Chips must be keyboard accessible.
- Active state must not rely on color alone.
- Each chip must have an accessible label.
- Removing a chip must be a separate accessible action.
- Popovers must manage focus correctly.
- Status changes should use an appropriate live region.
- Context-size warnings must be readable by screen readers.
- Dragging is not required for chip reordering in the MVP.
- Chip order can be changed through keyboard-accessible move actions later.

---

# 28. Analytics and Product Signals

For a local-first application, analytics should be optional and must not include context content.

Potential anonymous events:

```text
terminal_context_chip_added
terminal_context_chip_removed
terminal_context_prompt_composed
terminal_context_inline_used
terminal_context_file_used
terminal_context_size_warning
terminal_context_secret_warning
```

Allowed properties:

- chip type
- number of chips
- approximate size range
- delivery mode
- success or failure

Never collect:

- source code
- file names
- prompts
- screenshots
- CMS data
- error messages
- project names

---

# 29. MVP Scope

## Include in MVP

1. Context chip bar above the terminal.
2. Add-context menu.
3. Selected Element chip.
4. Current Page chip.
5. Current Component chip.
6. Console Errors chip.
7. Current File chip.
8. Selected Files chip.
9. Git Diff chip.
10. Context details preview.
11. Inline prompt generation.
12. Context-file generation for large payloads.
13. Stale-context detection.
14. Basic token estimation.
15. Secret-file blocking.
16. Insert into terminal without automatic submission.

## Defer until later

- Preview screenshot
- Responsive screenshot sets
- CMS schema context
- AI-based context suggestions
- direct Stacki MCP tools
- remote-agent integrations
- conversation-level context memory
- agent-specific prompt templates
- automatic context refresh
- context sharing between projects
- direct terminal submission by default

The Preview Screenshot and CMS Schema chips can be included earlier if the existing preview and CMS APIs make them low effort.

---

# 30. Proposed Development Phases

## Phase 1: Prompt foundation

Build:

- `ContextSnapshot` model
- resolver registry
- chip bar
- context picker
- Markdown composer
- terminal text insertion
- current file context
- selected files context

This validates the basic interaction without depending on visual-editor internals.

## Phase 2: Stacki-aware context

Add:

- selected element
- current page
- current component
- stale-state detection
- context previews

This creates the core product differentiation.

## Phase 3: Runtime and repository context

Add:

- console errors
- Git diff
- size estimation
- context-file delivery
- secret detection

## Phase 4: Rich visual and content context

Add:

- preview screenshot
- CMS schema
- responsive context
- suggested context

---

# 31. Acceptance Criteria

## General

- A user can add and remove context chips without affecting project files.
- Active chips clearly indicate what will be included.
- The user can inspect generated context before insertion.
- Context is not sent until the user chooses an explicit action.
- The generated prompt is readable by both humans and coding agents.

## Selected Element

- Selecting the chip captures the active Stacki node.
- The payload includes the correct source file and node information.
- Changing the selected node marks the chip stale.
- The original snapshot is not silently replaced.

## Current Page

- The chip includes the active route and source file.
- The context contains a summarized page structure.
- Full source is optional rather than automatic.

## Current Component

- The nearest component boundary is resolved correctly.
- The current instance props are included.
- The component’s source path is included.

## Console Errors

- Repeated errors are grouped.
- Error context is limited to a configurable recent period.
- Stack traces preserve file and line information.

## Git Diff

- Binary content is excluded.
- Generated directories are excluded.
- Staged and unstaged states are identified.
- Large diffs trigger a warning.

## Security

- `.env` files are blocked by default.
- Paths outside the project root cannot be attached.
- Possible secrets trigger a visible warning.
- Temporary context files are Git-ignored.

## Terminal

- The composed prompt can be inserted into the active terminal.
- Multiline content is inserted without corruption.
- The user can edit the inserted text before submitting it.
- A missing terminal session does not discard the composed prompt.

---

# 32. Example End-to-End Flow

1. The user selects a heading in the visual canvas.
2. The user opens the terminal panel.
3. Stacki displays suggested chips:

```text
[Selected element] [Current component] [Current page]
```

4. The user activates **Selected element** and **Current component**.
5. Stacki captures both contexts as snapshots.
6. The user writes:

```text
Turn this heading block into a reusable hero component. The eyebrow and description should be optional.
```

7. Stacki estimates the total context at 2,100 tokens.
8. The user selects **Insert into terminal**.
9. Stacki generates a structured Markdown prompt.
10. The prompt is inserted into the Codex terminal.
11. The user reviews it and presses Enter.
12. Codex edits the relevant project files.
13. Stacki’s existing file watcher reloads the updated project.

---

# 33. Future Compatibility

The context-chip system should be designed as the first layer of a broader Stacki agent interface.

A future Stacki MCP server could reuse the same resolvers:

```text
Context chip resolver
        ↓
Structured snapshot
        ↓
Markdown prompt today
        ↓
MCP resource tomorrow
```

Possible future mappings:

```text
Selected Element chip
→ stacki://selection/current

Current Page chip
→ stacki://page/current

CMS Schema chip
→ stacki://cms/schema

Console Errors chip
→ stacki://runtime/errors
```

The initial context model should therefore remain:

- structured
- versioned
- serializable
- independent of Codex
- independent of the terminal implementation

---

# 34. Final Product Principle

Terminal Context Chips should never hide what the agent receives.

The user must always be able to answer:

- What context is attached?
- When was it captured?
- How large is it?
- Which files are included?
- Does it contain sensitive information?
- Will it update automatically?
- What exactly will be inserted into the terminal?

The feature succeeds when a user can visually select something, attach its context, and ask for a change without manually locating or explaining the implementation.
