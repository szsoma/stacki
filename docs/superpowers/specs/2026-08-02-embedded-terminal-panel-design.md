# Embedded Terminal Panel Design

**Date:** 2026-08-02
**Status:** Approved for implementation planning

## Goal

Add one fully interactive terminal to Stacki's left rail so a user can run
OpenCode, Codex, Claude Code, or any other CLI inside the currently open Astro
project without leaving the application.

## Scope

This version provides exactly one terminal session for the open project. The
session starts the user's shell and does not automatically launch a coding
tool. Multiple terminal tabs, toolbar actions, terminal profiles, split panes,
and persisted terminal preferences are outside this version.

## User Experience

### Opening and closing

- Add a Terminal icon directly below CMS in the existing left rail.
- Clicking the icon or pressing `Option+T` toggles the terminal panel.
- Detect the shortcut with `altKey` and the physical `KeyT` code so it works
  on a Hungarian keyboard, where the character reported by the key event can
  differ.
- The shortcut remains available while the design canvas iframe or terminal
  has focus. Stacki consumes it rather than forwarding it to the shell.
- All other keystrokes remain local to the terminal while the terminal has
  focus; Stacki's page-editing shortcuts must not intercept them.

### Panel layout

- The terminal is a left panel beside the existing 44px rail. It does not
  replace the canvas or the right settings panel.
- Its initial width is 480px.
- A pointer-draggable handle on its right edge resizes it between 320px and
  70% of the available workspace width.
- The chosen width lasts only for the current terminal/project session. A
  project change or application restart resets it to 480px.
- The panel contains a `Terminal` header and the terminal surface. It has no
  additional toolbar buttons in this version.
- Hiding the panel removes its width from the layout. Reopening it restores
  the same session, scrollback, session-only width, and keyboard focus.

### Shell behavior

- Create the shell lazily the first time the panel opens.
- Start it in the root of the current Astro project.
- On macOS and other Unix systems, use the user's configured login shell. On
  Windows, use the configured system shell through `COMSPEC`.
- Reuse Stacki's repaired tool `PATH` so CLI programs installed through common
  package managers and version managers remain available when Stacki was
  launched from Finder or the Dock.
- Do not type or execute an initial command.
- Preserve the shell process and xterm scrollback while the panel is hidden.
- When the shell exits, retain the scrollback and append
  `Terminal exited — press Enter to restart`. The next Enter starts a fresh
  shell in the same project instead of creating an automatic respawn loop.
- Dispose of the shell when the project changes, the BrowserWindow closes, or
  Stacki quits.

## Architecture

### Renderer terminal

Use `@xterm/xterm` for terminal emulation and `@xterm/addon-fit` to translate
the visible panel dimensions into terminal columns and rows. A dedicated
`TerminalPanel` owns:

- xterm creation, configuration, focus, and disposal;
- the xterm screen buffer and scrollback;
- input forwarding;
- output and exit subscriptions;
- the exited/retry state;
- fit operations after opening and panel resizing; and
- the drag-resize interaction.

Once created for a project, the component remains mounted when hidden so its
screen buffer is not reconstructed. A `ResizeObserver` fits xterm only when
the panel has non-zero visible dimensions. After each successful fit, the
renderer sends the resulting positive integer columns and rows to the PTY.

### Main-process PTY

Use `node-pty` in Electron's main process. Keep PTY ownership out of the
renderer and add a focused terminal manager with one active session. The
manager is responsible for:

- validating that a project is open;
- spawning the platform shell with the open project root as `cwd`;
- applying the repaired process environment;
- forwarding output and exit events;
- accepting input and validated resize requests;
- restarting an exited session; and
- killing and releasing the PTY on project/window/application teardown.

Every started shell receives a new opaque session identifier. Output and exit
events include that identifier, and the renderer ignores events that do not
belong to its active session. This prevents delayed events from an exited or
previous-project shell from appearing in the current terminal.

### IPC boundary

Extend the existing context-isolated preload bridge with terminal-specific
methods only:

- start the terminal for the currently open project with initial columns and
  rows;
- write terminal input;
- resize the active PTY;
- restart an exited PTY;
- dispose the active PTY; and
- subscribe/unsubscribe to terminal output, exit, and error events.

Do not expose `ipcRenderer`, `node-pty`, filesystem APIs, or a generic command
execution method. The main process derives the working directory from
Stacki's current open-project state instead of accepting an arbitrary `cwd`.
Terminal IPC is accepted only from Stacki's main renderer; the preview iframe
continues to receive no application API.

### Data flow

```text
xterm keyboard input
  -> restricted preload method
  -> Electron main process
  -> node-pty shell

node-pty output
  -> session-tagged Electron event
  -> TerminalPanel
  -> xterm.write()

panel or window resize
  -> FitAddon.fit()
  -> xterm columns and rows
  -> validated node-pty.resize()
```

## Keyboard Integration

The left-rail shortcut handler recognizes `Option+T` before its normal
editable-field guard so the shortcut works while xterm's hidden textarea has
focus. The preview preload forwards the same physical shortcut to the parent
window, using Stacki's existing `avb:shortcut` message path. The parent then
routes both direct and forwarded shortcut events through one terminal-toggle
function.

Opening the panel schedules fit and focus after layout has committed. Hiding
it does not synthesize terminal input or alter the running foreground process.

## Error Handling and Safety

- A shell startup error is written into the terminal panel as a concise,
  actionable message followed by `Press Enter to retry`.
- An error or normal exit changes the session to an exited state; input is not
  sent to a dead PTY.
- Enter in the exited state requests one restart. Concurrent start/restart
  requests coalesce so they cannot create duplicate shells.
- Resize requests are ignored until xterm reports positive integer dimensions
  and are clamped again in the main process.
- PTY output is terminal data passed to `xterm.write()` and is never inserted
  as HTML.
- Late data and exit events are discarded by session identifier.
- Project changes dispose of the old PTY before a terminal can start for the
  new project.

## Packaging

Add `@xterm/xterm`, `@xterm/addon-fit`, and `node-pty` as application
dependencies. Because `node-pty` contains native binaries:

- rebuild application dependencies for Electron after installation with
  electron-builder's application-dependency installer;
- unpack the `node-pty` native files from ASAR;
- configure the macOS universal build to retain the correct architecture-
  specific `.node` binaries; and
- exercise both the unsigned packaged macOS application and the existing
  Windows packaging workflow.

Development success alone is not sufficient evidence because a native module
can work under the development Node/Electron installation and fail after
packaging.

## Verification

### Automated coverage

- Test the terminal manager with a fake PTY dependency: start, input, resize,
  exit, restart, project change, explicit disposal, and duplicate-start
  suppression.
- Test stale session event rejection.
- Test width clamping at the 320px minimum, 480px default, and 70% maximum.
- Test direct and iframe-forwarded Hungarian-layout `Option+T` detection.
- Run Stacki's production renderer build.

### Manual development smoke test

1. Open an Astro project and toggle the panel through both the rail icon and
   `Option+T`.
2. Confirm `pwd` reports the project root.
3. Confirm ANSI colors, interactive input, cursor movement, scrolling, and
   terminal selection work.
4. Resize the panel and window; confirm content reflows and the running shell
   receives the new terminal size.
5. Hide and reopen the panel; confirm the foreground process and scrollback
   remain intact.
6. Run OpenCode and confirm its full-screen interface accepts keyboard input
   and redraws correctly.
7. Exit the shell, verify the exit message, and press Enter to restart it.
8. Switch projects and confirm the old process is gone and the next terminal
   starts in the new root at 480px wide.

### Packaged smoke test

Build and launch the unsigned macOS application, then repeat shell startup,
input, resize, OpenCode launch, exit/restart, and application shutdown. Confirm
that no PTY process remains after Stacki quits. The Windows release build must
also complete with the native dependency included.

## Acceptance Criteria

- A Terminal rail item exists directly below CMS.
- The rail item and Hungarian-layout `Option+T` both toggle the panel.
- The panel opens at 480px, can be resized from 320px to 70% of the workspace,
  and does not persist its width beyond the project session.
- One real interactive shell runs in the current project root.
- OpenCode can run as an interactive full-screen CLI inside Stacki.
- Hiding the panel preserves the process and scrollback.
- Shell exit requires an explicit Enter to restart.
- Project changes and application shutdown terminate the PTY cleanly.
- The feature works in a packaged macOS build and remains compatible with the
  Windows packaging target.
