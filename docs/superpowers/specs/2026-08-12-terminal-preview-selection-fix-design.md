# Terminal Preview Selection Fix

## Problem

The Selected element context feature requires the Terminal panel to remain visible while the user clicks elements in the design canvas. The current canvas-selection handler calls the store with `select(id, { reveal: true })`. In the selection store, `reveal: true` also sets `leftTab` to `navigator`, so the first canvas click replaces the Terminal panel with Navigator. The selection changes, but the workflow becomes unusable because the Terminal and its context chip disappear.

## Approved behavior

- When Terminal is the active left panel, clicking a marked element in the design canvas selects that element without changing the active left panel.
- The mounted Terminal context bar receives the new `selectedNode` and adds or refreshes its single Selected element chip.
- When any other left panel is active, canvas selection keeps the existing reveal behavior and switches to Navigator so the selected row is visible.
- Empty-canvas and component-focus behavior remain unchanged except for the same Terminal-preservation rule when a real selectable node is resolved.

## Implementation

Keep the change at the canvas-to-store boundary in `App.tsx`. When a preview path resolves to a model node, request Navigator reveal only when the current `leftTab` is not `terminal`. Do not change the global meaning of the selection store's `reveal` option because Navigator keyboard and direct reveal callers rely on it.

## Testing

Add an App-level regression test that uses the PreviewPane seam to simulate a canvas selection while Terminal is active. Assert that:

1. The selected node changes to the clicked node.
2. Terminal remains active and visible.
3. Existing non-Terminal canvas selection still reveals Navigator.

Run the focused regression test, the full Vitest suite, Electron syntax checks, the production build, and a real Electron runtime probe against an Astro project.

## Out of scope

This fix does not redesign context-chip insertion, resolver error handling, or concurrent chip refreshes. Those remain separate findings from the feature review.
