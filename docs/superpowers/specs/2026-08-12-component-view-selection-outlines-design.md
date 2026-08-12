# Component View Selection and Blue Outlines

**Date:** 2026-08-12
**Status:** Approved design

## Goal

Restore element selection inside Stacki's component view and give users clear visual feedback by drawing blue outlines on the component-local element under the pointer and on the selected component-local element.

Normal page-view outline colors and behavior remain unchanged.

## Root Cause

The design preview currently marker-transforms page files only. The rendered page therefore exposes paths for page nodes and component host instances, but it does not expose paths for nodes declared inside imported component files.

When component view is active, the application loads the component's source model while continuing to render the complete page. Clicks inside the focused component still resolve to the page-level host path. The component-view click handler deliberately ignores that path because it cannot map it to the component model. Consequently:

- canvas clicks cannot select component-local nodes;
- hover cannot identify component-local nodes;
- the outline overlay has no component-local rectangle to draw.

## Scope

This change will:

- add scoped preview markers to editable Astro component and layout files;
- preserve the live, full-page preview while editing a component;
- map component-view hover and click events to the active component's local node paths;
- synchronize component-view canvas selection with the Navigator and inspector;
- draw a 1px blue outline on hover and a persistent 2px blue outline on selection;
- retain the focused component cutout around the page instance;
- support drilling into nested component instances;
- retain the current behavior where clicking outside the focused instance exits component view;
- preserve the terminal-panel behavior that does not reveal the Navigator when selection originates while Terminal is active.

This change will not:

- replace the live page with an isolated component preview;
- infer source nodes from DOM positions or tag names;
- alter source files in the user's Astro project;
- change page-view colors for components, loops, bound nodes, or ordinary elements;
- add new outline controls or user preferences.

## Architecture

### Scoped marker generation

The generated Vite marker plugin will continue marker-transforming editable page files and will additionally marker-transform editable Astro files used as components or layouts under the project source tree.

Each marker boundary will identify both:

- a canonical project-relative file scope; and
- the node's local index path within that file's parsed model.

The canonical scope must use normalized forward slashes so renderer, preload, and generated-plugin comparisons behave consistently on macOS and Windows. The generated marker source remains confined to Stacki's development preview; project files on disk are never rewritten.

Page markers and component markers may be nested in the rendered DOM. Their file scopes prevent identical local paths such as `0.1` from colliding.

### Preview marker runtime

The iframe preload will collect marker regions by the composite identity `(scope, path)` rather than by path alone. It will preserve occurrence tracking for repeated nodes and the existing fallback for DOM rewritten by client-side scripts.

Tracking messages from the renderer will identify:

- the active selection scope and its selected/hovered local paths;
- the page scope and page-level focus path used by the component cutout; and
- hidden paths in the active editing scope.

Hover, click, open-node, rectangle, and scroll messages will carry enough scope information to prevent a page host path from being mistaken for a component-local path.

### Renderer selection mapping

In page view, `App` will continue resolving paths against the page model.

In component view, `App` will accept hover and click events only from the active component scope and resolve their local paths against the currently loaded component model. A successful click selects the matching model node and updates the existing Navigator/inspector state.

The page-level focus path remains separate from the component-local selected path. This lets the preview simultaneously:

- dim everything outside the component instance using the page marker; and
- outline a node declared inside that component using the component marker.

Clicking outside the focused page region retains the existing back-out behavior. A click within the focused region that has no valid active-scope marker will not select an unrelated page node.

Double-clicking a nested component node will open that component for editing. The newly active component scope becomes selectable while the outermost page instance remains the visual focus, matching the current edit-stack behavior.

## Visual Behavior

Component view receives a dedicated outline-mode class so its color overrides do not affect page view.

- Hovered component-local node: 1px blue outline and blue label text.
- Selected component-local node: persistent 2px blue outline and blue label chip.
- When hover and selection target the same node, only the selected treatment is rendered.
- The existing green page-instance focus boundary and dimmed surroundings remain visible behind the component-local outline.
- Outlines remain overlay elements with `pointer-events: none`, so they never interfere with preview interaction or alter the user's page DOM.

The existing accent blue is reused for consistency with ordinary page elements. Page-view component green and loop/data-bound purple remain unchanged.

## Failure Handling

- If an Astro file cannot be parsed as an editable model, the preview plugin leaves it unmodified and the dev preview continues to render.
- If a marker scope does not match the active editing file, its events cannot select nodes in the active model.
- If a reported local path no longer exists after a source refresh, selection is left unchanged rather than falling back to a page node.
- If no component-local marker exists under a click inside the focused region, Stacki keeps component view open and does not make a false selection.
- Existing outside-focus clicks continue to close component view.

## Testing

Implementation will follow test-first development.

Automated coverage will verify:

1. Marker serialization emits distinct project-relative scopes for pages, components, and layouts without changing the source files.
2. The generated Vite plugin marker-transforms editable component files as well as page files and safely ignores uneditable files.
3. The preload marker runtime keeps equal local paths from different scopes separate and reports scoped hover, click, rectangle, occurrence, and scroll data.
4. `PreviewPane` tracks both the page focus target and the active component-local targets.
5. A component-local click selects the correct component model node.
6. A page-host click cannot be misinterpreted as a component-local selection.
7. Clicking outside the focused component exits component view.
8. Nested component nodes remain openable for deeper editing.
9. Component-view hover and selection use blue outline classes, with 1px and 2px widths respectively.
10. Page-view component, loop, bound-node, and ordinary-element colors remain unchanged.
11. Terminal stays active when a component-local canvas selection occurs while Terminal is visible.

Manual Electron verification will use a real Astro project to confirm:

- entering component view from a rendered component instance;
- hovering several internal elements produces the blue hover outline;
- clicking an internal element selects the matching Navigator row and leaves a blue selected outline;
- selecting another internal element moves the persistent outline;
- double-clicking a nested component drills into it and keeps selection working;
- clicking outside the focused instance exits component view;
- returning to page view preserves the existing outline color semantics.

The final verification gate will include the focused tests, the complete Vitest suite, Electron syntax checks, the production build, and the repository's current typecheck with any pre-existing failures clearly separated from regressions.

## Acceptance Criteria

The feature is complete when:

- every editable node rendered inside the active component can be selected from the live canvas when it has a marker-backed rendered region;
- component-local hover and selection are visibly blue;
- the selected outline remains visible after pointer movement;
- Navigator, inspector, and terminal context receive the selected component-local node;
- nested component editing and outside-click exit behave correctly;
- page-view selection and color behavior are unchanged;
- no Astro project source file is modified by preview instrumentation;
- automated and manual verification demonstrate the behavior in the Electron app.
