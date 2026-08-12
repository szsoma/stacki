// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
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
import { previewScreenshotResolver } from '../context/previewScreenshotResolver.js';
import { cmsSchemaResolver } from '../context/cmsSchemaResolver.js';
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
registerResolver(previewScreenshotResolver);
registerResolver(cmsSchemaResolver);

const EMPTY_EDITOR_CONTEXT = {};

export default function ContextChipBar({
  currentFile,
  projectPath,
  editorContext = EMPTY_EDITOR_CONTEXT,
  devLog = '',
  devUrl = null,
  getPreviewRect = null,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsId, setDetailsId] = useState(null);

  const appState = useMemo(
    () => ({
      currentFile,
      projectPath,
      devLog,
      devUrl,
      getPreviewRect,
      ...editorContext,
      readProjectFile: (rel) => window.avb.readContextFile({ projectPath, rel }),
      listProjectFiles: async () => (await window.avb.listContextFiles({ projectPath })).files,
      serializeNode: async (node) => (await window.avb.serializeNode({ node })).markup,
      getGitDiff: () => window.avb.getGitDiff({ projectPath }),
      writeContextBundle: (markdown) => window.avb.writeContextBundle({ projectPath, markdown }),
      capturePreview: (rect) => window.avb.capturePreview({ projectPath, ...rect }),
    }),
    [currentFile, projectPath, editorContext, devLog, devUrl, getPreviewRect],
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

  const suggestedChips = useMemo(() => {
    if (chips.length > 0 || prompt.trim()) return [];
    return availableResolvers.slice(0, 3);
  }, [availableResolvers, chips.length, prompt]);

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
              prompt={prompt}
              onPickSimple={pickSimple}
              onPickFiles={pickFiles}
              onListFiles={appState.listProjectFiles}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
        {chips.length === 0 && suggestedChips.length > 0 && (
          <>
            {suggestedChips.map((resolver) => (
              <button
                key={resolver.type}
                type="button"
                className="context-suggested-chip"
                onClick={() => addChip(resolver.type)}
              >
                {resolver.label}
              </button>
            ))}
          </>
        )}
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
