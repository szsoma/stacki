# Selected Element Terminal Context

## Problem

The Terminal currently auto-adds a `Preview element` context chip after a canvas selection. That resolver identifies the component that owns the selected node and attaches the component's complete source file. For a selected paragraph rendered through a wrapper such as `Section.astro`, the resulting context describes the wrapper file rather than the paragraph's markup or text.

Stacki already has a `Selected element` resolver that serializes the exact selected node and includes its tag, props, ancestors, children, loop context, and owning-component path. Keeping both concepts makes the automatic chip misleading and gives the agent less precise context.

## Approved behavior

- Remove `Preview element` as a context-chip type and resolver.
- When Terminal is active and the user selects a canvas element, automatically add a single `Selected element` chip.
- When the selection changes, refresh that same chip instead of accumulating chips.
- The resolved context contains the exact selected node's serialized Astro markup, including its text when present.
- The context retains the owning component name and project-relative file path as supporting metadata.
- Selecting elements while another left panel is active does not auto-add context.
- The existing rule that canvas selection must not hide an active Terminal remains unchanged.
- Full component or page source remains available through the existing explicit context choices; it is not bundled automatically into `Selected element`.

## Design

`ContextChipBar` will transfer the current Terminal-only auto-add and refresh behavior from the `preview-element` type to `selected-element`. The effect continues to watch `selectedNode` and reuses one chip, but searches for and creates `selected-element`.

The existing `selectedElementResolver` remains the single source of truth for selected-node context. It will continue to call the renderer's `serializeNode(selectedNode)` bridge and render the exact markup alongside concise structural metadata. No second resolver will reinterpret the selection as its owner.

Remove the `PREVIEW_ELEMENT` context-type constant, resolver registration, suggestion priority/category entries, resolver file, and tests or fixtures that exist only for that type. Update terminology in active feature documentation where it describes the automatic chip.

## Data flow

1. The user selects a marked element in the page or component preview.
2. App selection state resolves that scoped preview hit to `selectedNode`.
3. If Terminal is active, `ContextChipBar` creates or refreshes its one `selected-element` chip.
4. `selectedElementResolver` serializes that exact node and captures its structural and owner metadata.
5. `Insert into terminal` renders this snapshot, so the agent receives the selected paragraph or other node rather than only its component wrapper.

## Error handling

- If selection disappears before resolution, the chip follows the existing unavailable/error behavior and no new chip is added.
- Serialization failures remain visible through the context-chip error state.
- Rapid selection changes continue to rely on the existing stale-resolution protection so an older result cannot replace the latest selection.

## Testing

Add or update focused tests to prove:

1. Selecting a paragraph while Terminal is active auto-adds `Selected element`.
2. Changing selection refreshes the same chip without duplication.
3. The inserted markdown contains the selected paragraph markup and text plus the owner component path.
4. It does not substitute the owner's complete wrapper source for the selected markup.
5. No automatic chip is added while Terminal is inactive.
6. `preview-element` is no longer registered or suggested.

Run the focused context and panel tests, then the repository's full test, Electron-check, typecheck, and build gates that are currently available.

## Out of scope

- Changing canvas selection or blue hover/selection outlines.
- Automatically attaching complete component or page files.
- Changing terminal insertion mechanics.
- Redesigning other context-chip types or ranking rules.
