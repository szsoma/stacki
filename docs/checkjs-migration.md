# checkJs migration
`checkJs` is on. Every `.js`/`.jsx` file in the repo is type-checked against
`strict` unless it opts out with a first-line
`// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md`.

That opt-out is the backlog, not the norm: it exists so `npm run typecheck`
stays green while the remaining files are migrated one at a time, and so a
**newly added** `.js` file is checked by default rather than silently
escaping. Nothing outside this list is allowed to carry `@ts-nocheck`.

## Migrating a file

1. Delete the `@ts-nocheck` line.
2. Run `npm run typecheck` and fix what it reports — annotate parameters and
   refs with JSDoc (`/** @param {string} name */`,
   `/** @type {React.RefObject<HTMLDivElement | null>} */`) rather than
   widening to `any`.
3. Typing a module usually surfaces fresh errors in its callers, because
   their arguments stop being `any`. Those are real findings — fix them
   rather than reverting.
4. Delete its row below.

## Remaining

83 files, 1925 errors at the time of writing.

| Errors | File |
| ---: | --- |
| 207 | `src/panels/CmsView.jsx` |
| 189 | `electron/main.js` |
| 93 | `src/panels/TerminalPanel.test.jsx` |
| 89 | `src/ui/Icons.jsx` |
| 82 | `src/panels/GitChip.jsx` |
| 73 | `src/ui/RichContent.jsx` |
| 64 | `electron/preload.js` |
| 61 | `src/panels/PagesPanel.jsx` |
| 60 | `src/cmsSchema.js` |
| 58 | `src/panels/TerminalPanel.jsx` |
| 45 | `src/panels/CanvasView.jsx` |
| 41 | `electron/terminalManager.test.js` |
| 39 | `electron/contextFiles.test.js` |
| 38 | `src/panels/WelcomeScreen.jsx` |
| 33 | `src/panels/CmsReferenceField.jsx` |
| 32 | `src/context/useTerminalContext.js` |
| 32 | `src/panels/AssetsPanel.jsx` |
| 29 | `src/context/useTerminalContext.test.js` |
| 29 | `src/panels/CmsPanel.jsx` |
| 26 | `src/dataSuggest.js` |
| 24 | `src/App.test.jsx` |
| 23 | `src/ui/Dropdown.jsx` |
| 22 | `electron/contextIpc.js` |
| 22 | `electron/terminalManager.js` |
| 22 | `src/panels/CmsView.test.jsx` |
| 21 | `src/ui/AssetThumb.jsx` |
| 20 | `src/panels/PalettePanel.jsx` |
| 19 | `src/panels/ContextChipBar.jsx` |
| 18 | `electron/cmsRefs.js` |
| 18 | `electron/contextFiles.js` |
| 18 | `electron/terminalIpc.js` |
| 18 | `src/ui/PageSwitcher.jsx` |
| 16 | `src/context/cmsSchemaResolver.js` |
| 16 | `src/context/nodeTree.js` |
| 16 | `src/panels/CmsDeleteGuard.jsx` |
| 16 | `src/panels/ContextPicker.jsx` |
| 16 | `src/ui/LeftRail.jsx` |
| 14 | `src/ui/CodeWindow.jsx` |
| 14 | `src/ui/WelcomeBackground.jsx` |
| 13 | `src/panels/ContextChipBar.test.jsx` |
| 12 | `src/context/suggestedContext.js` |
| 12 | `src/ui/AssetField.jsx` |
| 12 | `src/ui/ClassInput.jsx` |
| 11 | `src/context/contextTypes.js` |
| 10 | `src/context/currentPageResolver.js` |
| 10 | `src/context/selectedElementResolver.js` |
| 10 | `src/context/suggestedContext.test.js` |
| 9 | `src/App.save.test.jsx` |
| 9 | `src/ui/LinkField.jsx` |
| 8 | `src/assetPick.js` |
| 8 | `src/cmsReferences.js` |
| 8 | `src/context/consoleErrorsResolver.js` |
| 7 | `electron/mainPolicy.js` |
| 7 | `src/App.layout.test.jsx` |
| 7 | `src/context/cmsSchemaResolver.test.js` |
| 7 | `src/context/currentComponentResolver.js` |
| 7 | `src/context/previewScreenshotResolver.js` |
| 7 | `src/panels/ContextDetailsPopover.jsx` |
| 6 | `electron/contextIpc.test.js` |
| 6 | `electron/terminalIpc.test.js` |
| 6 | `src/context/contextTypes.test.js` |
| 6 | `src/context/currentFileResolver.js` |
| 6 | `src/context/nodeTree.test.js` |
| 6 | `src/context/selectedFilesResolver.js` |
| 6 | `src/ui/ExprInput.jsx` |
| 6 | `src/ui/InsertSearch.jsx` |
| 4 | `src/context/promptComposer.test.js` |
| 3 | `src/panels/ContextChip.jsx` |
| 3 | `src/panels/ContextPicker.test.jsx` |
| 2 | `src/App.history.test.jsx` |
| 2 | `src/context/contextResolvers.test.js` |
| 2 | `src/context/promptComposer.js` |
| 2 | `src/context/secretScan.test.js` |
| 2 | `src/terminal/terminalLogic.test.js` |
| 2 | `src/ui/StyleEditor.jsx` |
| 1 | `electron/mainPolicy.test.js` |
| 1 | `src/context/devLogParser.test.js` |
| 1 | `src/context/gitDiffResolver.test.js` |
| 1 | `src/elementSchemas.js` |
| 1 | `src/terminal/terminalLogic.js` |
| 1 | `src/test/setup.js` |
| 1 | `src/ui/AutoTextarea.jsx` |
| 1 | `src/ui/CodeEditor.jsx` |
