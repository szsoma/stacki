import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useT } from './i18n/I18nContext.jsx';
import WelcomeScreen from './panels/WelcomeScreen.jsx';
import PagesPanel from './panels/PagesPanel.jsx';
import PalettePanel from './panels/PalettePanel.jsx';
import StructurePanel from './panels/StructurePanel.tsx';
import PropsPanel from './panels/PropsPanel.tsx';
import StylePanel from './panels/StylePanel.tsx';
import PreviewPane from './panels/PreviewPane.tsx';
import type { PreviewNodeHit } from './panels/PreviewPane.tsx';
import GitChip from './panels/GitChip.jsx';
import LeftRail from './ui/LeftRail.jsx';
import CodeWindow from './ui/CodeWindow.jsx';
import PageSwitcher from './ui/PageSwitcher.jsx';
import InsertSearch from './ui/InsertSearch.jsx';
import AssetsPanel from './panels/AssetsPanel.jsx';
import CmsPanel from './panels/CmsPanel.jsx';
import CmsView from './panels/CmsView.jsx';
import TerminalPanel from './panels/TerminalPanel.jsx';
import { getElementSchema, GLOBAL_ATTRS, canContainTag } from './elementSchemas.js';
import { onAssetRequest, clearAssetRequest } from './assetPick.js';
import { isDataBound } from './bindings.js';
import {
  PreviewIcon,
  RefreshIcon,
  ExternalIcon,
  ChevronLeftIcon,
  ElementComponentIcon,
} from './ui/Icons.jsx';

let idCounter = 1000;
const newId = () => `c${idCounter++}`;

// Where an insert or move lands: a slot in some parent's children, or null
// to append at the end of the page.
interface DropTarget {
  parentId: string | null;
  index: number;
}

// One row of the insert palette: a scanned component/layout, a plain HTML
// tag, or one of the structural nodes (loop, comment, text, expression,
// <style>/<script>) that have no tag of their own.
interface InsertItem {
  type: 'component' | 'element' | 'map' | 'comment' | 'text' | 'expr' | 'style' | 'script';
  name?: string;
  tag?: string;
  label?: string;
}



// HTML elements that can never have children.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Placeholder copy for newly inserted text elements, so they're visible on the
// canvas straight away instead of collapsing to a zero-height box.
const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius ' +
  'enim in eros elementum tristique. Duis cursus, mi quis viverra ornare, eros ' +
  'dolor interdum nulla, ut commodo diam libero vitae erat. Aenean faucibus nibh ' +
  'et justo cursus id rutrum lorem imperdiet. Nunc ut sem vitae risus tristique ' +
  'posuere.';
const DEFAULT_TEXT = {
  h1: 'Heading',
  h2: 'Heading',
  h3: 'Heading',
  h4: 'Heading',
  h5: 'Heading',
  h6: 'Heading',
  p: LOREM,
};

import {
  findNodeById,
  findParentList,
  isDescendantOf,
  nodeAtPath,
  pathOfNode,
} from './model/nodes.ts';
import { toPreviewScope } from './model/previewScope.ts';
import type { AstroNode, PageModel, Props, PropValue } from './types/ast';
import type { PageEntry, PropField } from './types/ipc';
import type { LeftTab, RightTab } from './store/uiSlice';
import type { PreviewSlice } from './store/previewSlice';

type PreviewDevice = PreviewSlice['device'];

import { chooseImportPath, pruneImports } from './model/imports.ts';
import {
  disconnectDependentLoops,
  loopVarsAt,
  parseLoopHead,
  renameLoopVar,
  stripLostBindings,
} from './model/loops.ts';
import type { LoopRename } from './model/loops.ts';

import { useAppStore, getState, setState } from './store/index.ts';
import {
  nodeLabel,
  pathFor as pathForNode,
  selectCrumbs,
  selectCurrentLayoutName,
  selectFrontmatterCode,
  selectInsertables,
  selectLoopContext,
  selectModel,
  selectSelectedNode,
} from './store/selectors';

// Strips the project root off an absolute filesystem path so it reads like
// the project-relative paths the Selected Files chip already uses (and so a
// prompt heading into the terminal never leaks the user's home directory).
// Both paths are produced by Node's `path` module in the main process on the
// same OS as the renderer, so they share the same separator convention.
function toProjectRelativePath(absolutePath: string | null, projectRoot: string | null): string | null {
  if (!absolutePath) return null;
  if (!projectRoot) return absolutePath;
  let rel = absolutePath;
  if (rel.startsWith(projectRoot)) {
    rel = rel.slice(projectRoot.length);
  }
  return rel.replace(/^[\\/]+/, '');
}

export default function App() {
  const project = useAppStore((s) => s.project);
  const scan = useAppStore((s) => s.scan);
  const currentPage = useAppStore((s) => s.currentPage);
  const editStack = useAppStore((s) => s.editStack);
  const pageState = useAppStore((s) => s.pageState);
  const selectedId = useAppStore((s) => s.selectedId);
  const hoverNodeId = useAppStore((s) => s.hoverNodeId);
  const devUrl = useAppStore((s) => s.devUrl);
  const devStatus = useAppStore((s) => s.devStatus);
  const devLog = useAppStore((s) => s.devLog);
  const busy = useAppStore((s) => s.busy);
  const toast = useAppStore((s) => s.toast);
  const refreshKey = useAppStore((s) => s.refreshKey);
  const leftTab = useAppStore((s) => s.leftTab);
  const cmsRel = useAppStore((s) => s.cmsRel);
  const cmsTick = useAppStore((s) => s.cmsTick);
  const cmsSettings = useAppStore((s) => s.cmsSettings);
  const cmsJump = useAppStore((s) => s.cmsJump);
  const inPreview = useAppStore((s) => s.inPreview);
  const previewSrc = useAppStore((s) => s.previewSrc);
  const codeWin = useAppStore((s) => s.codeWin);
  const rightTab = useAppStore((s) => s.rightTab);
  const assetPick = useAppStore((s) => s.assetPick);
  const insertOpen = useAppStore((s) => s.insertOpen);
  const saveError = useAppStore((s) => s.saveError);

  // Local-only state (not in store)
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [fileText, setFileText] = useState('');
  const [rightTabInd, setRightTabInd] = useState<{ left: number; width: number } | null>(null);

  // DOM / UI refs (local)
  const previewFrameRef = useRef<HTMLElement | null>(null);
  const openCodeWindowRef = useRef<(() => boolean) | null>(null);
  const rightTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabBeforePick = useRef<LeftTab>(null);
  const previewPathRef = useRef<string | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  // The copied node travels with the loop variables it referenced, so pasting
  // it somewhere those are out of scope can strip the bindings that broke.
  const nodeClipboardRef = useRef<{ node: AstroNode; vars: string[] } | null>(null);
  const cmsOpenRef = useRef(false);
  const layoutSeq = useRef(0);
  const tabSelRef = useRef<string | null>(null);
  const fileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationSeq = useRef(0);
  const projectLoadSeq = useRef(0);

  const s = getState;

  useEffect(() => () => {
    // Captured debounce persistence covers React remount/unmount only; renderer
    // process shutdown requires a separate Electron main-process protocol.
    if (!s().dirty) s().cancelScheduledSave();
  }, [s]);

  // Every page/asset operation below is reachable only from panels that exist
  // once a project is open, so the project is never null by the time one runs.
  const projectPath = () => s().project!.path;

  const selectLeftTab = useCallback((id: NonNullable<LeftTab>) => {
    if (id === 'terminal') setTerminalMounted(true);
    s().setLeftTab(s().leftTab === id ? null : id);
  }, [s]);

  // Everything the page can hold, and everything derived from the open
  // document, comes off the store as selectors — the panels below read the
  // same ones, so there is one definition of each rather than a copy here and
  // a copy there.
  const insertables = useAppStore(selectInsertables);
  const model = useAppStore(selectModel);
  const frontmatterCode = useAppStore(selectFrontmatterCode);
  const selectedNode = useAppStore(selectSelectedNode);
  const currentLayoutName = useAppStore(selectCurrentLayoutName);
  const loopContext = useAppStore(selectLoopContext);
  const crumbs = useAppStore(selectCrumbs);

  const t = useT();

  // ----------------------------------------------------------------
  // Toasts & events
  // ----------------------------------------------------------------

  const diagnose = useCallback(() => {
    const p = s().project?.path;
    if (!p) return;
    window.avb
      .diagnoseDev(p)
      .then((d) => s().setDevDiag(d))
      .catch(() => s().setDevDiag(null));
  }, [s]);

  const endAssetPick = useCallback(() => {
    clearAssetRequest();
    s().setAssetPick(null);
    const st = s();
    s().setLeftTab(st.leftTab === 'assets' && tabBeforePick.current ? tabBeforePick.current : st.leftTab);
    tabBeforePick.current = null;
  }, [s]);

  useEffect(() => {
    return onAssetRequest((req: any) => {
      if (!req) return;
      s().setAssetPick({
        ...req,
        onPick: (rel: string) => {
          req.onPick(rel);
          endAssetPick();
        },
      });
      const cur = s().leftTab;
      if (cur !== 'assets') tabBeforePick.current = cur;
      s().setLeftTab('assets');
    });
  }, [endAssetPick]);

  const showToast = useCallback((msg: string, kind: string = 'info') => {
    s().showToast(msg, kind);
  }, [s]);

  useEffect(() => {
    if (!saveError) return;
    showToast(saveError, 'error');
    s().clearSaveError();
  }, [saveError, showToast, s]);

  useEffect(() => {
    // @ts-expect-error IPC callback shape differs from declared type.
    const offProgress = window.avb.onProgress(({ message }: { message: any }) => s().setBusy(message || null));
    // @ts-expect-error IPC callback shape differs from declared type.
    const offExit = window.avb.onDevExit(({ log }: { log: any }) => {
      s().setDevStatus('off');
      s().setDevUrl(null);
      if (log) s().setDevLog(log);
      diagnose();
    });
    const offLog = window.avb.onDevLog((chunk) => {
      s().appendDevLog(stripAnsi(chunk));
    });
    return () => {
      offProgress();
      offExit();
      offLog();
    };
  }, [s, diagnose]);

  // ----------------------------------------------------------------
  // Project lifecycle
  // ----------------------------------------------------------------

  const rescan = useCallback(async (projectPath: string) => {
    const result = await window.avb.scanProject(projectPath);
    s().setScan(result);
    window.avb
      .listProjectClasses(projectPath)
      .then((c: string[]) => s().setProjectClasses(c || []))
      .catch(() => {});
    return result;
  }, [s]);

  const startPreview = useCallback(
    async (projectPath: string, projectRequest?: number) => {
      const isCurrent = () => projectRequest === undefined ||
        (projectRequest === projectLoadSeq.current && s().project?.path === projectPath);
      if (!isCurrent()) return;
      s().setDevStatus('starting');
      try {
        const { url, external } = await window.avb.startDevServer(projectPath);
        if (!isCurrent()) return;
        s().setDevUrl(url);
        s().setDevStatus('on');
        s().setDevDiag(null);
        if (external) {
          showToast(
            t('app.reuseDevServer', { url }),
            'info'
          );
        }
      } catch (err) {
        if (!isCurrent()) return;
        s().setDevStatus('off');
        s().setBusy(null);
        showToast(t('app.previewFailed'), 'error');
        s().setDevLog(stripAnsi(cleanError(err)));
        diagnose();
      }
    },
    [s, showToast, diagnose]
  );

  const flushStableProjectOrigin = useCallback(async (
    request: number,
    expected?: { projectPath: string | null; pagePath: string | null }
  ) => {
    const origin = expected ?? {
      projectPath: s().project?.path ?? null,
      pagePath: s().currentPage?.path ?? null,
    };
    while (request === projectLoadSeq.current) {
      const current = s();
      if ((current.project?.path ?? null) !== origin.projectPath ||
          (current.currentPage?.path ?? null) !== origin.pagePath) return null;
      if (!current.dirty || !current.currentPage || !current.pageState) {
        return { ...origin, revision: current.documentRevision };
      }
      current.cancelScheduledSave();
      await current.saveSnapshot(
        current.currentPage.path,
        current.pageState,
        current.documentRevision
      );
      if (request !== projectLoadSeq.current) return null;
      const after = s();
      if ((after.project?.path ?? null) !== origin.projectPath ||
          (after.currentPage?.path ?? null) !== origin.pagePath) return null;
      if (!after.dirty) return { ...origin, revision: after.documentRevision };
    }
    return null;
  }, [s]);

  const loadProject = useCallback(
    async (projectPath: string) => {
      const request = ++projectLoadSeq.current;
      try {
        const stableOrigin = await flushStableProjectOrigin(request);
        if (!stableOrigin || request !== projectLoadSeq.current) return;
        const result = await window.avb.scanProject(projectPath);
        if (request !== projectLoadSeq.current) return;
        const hasDeps = await window.avb.hasNodeModules(projectPath);
        if (request !== projectLoadSeq.current) return;
        if (!hasDeps) {
          await window.avb.installDeps(projectPath);
          if (request !== projectLoadSeq.current) return;
        }
        const first =
          result.pages.find((p) => p.name === 'index.astro') || result.pages[0] || null;
        const entry = first ? { ...first, kind: 'page' as const } : null;
        const loaded = entry ? await window.avb.readPage(entry.path) : null;
        if (request !== projectLoadSeq.current) return;
        const finalOrigin = await flushStableProjectOrigin(request, stableOrigin);
        if (!finalOrigin || request !== projectLoadSeq.current) return;
        const ready = s();
        if (ready.dirty || ready.documentRevision !== finalOrigin.revision ||
            (ready.project?.path ?? null) !== finalOrigin.projectPath ||
            (ready.currentPage?.path ?? null) !== finalOrigin.pagePath) return;

        s().cancelScheduledSave();
        navigationSeq.current += 1;
        const name = projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath;
        setState({
          project: { path: projectPath, name },
          scan: result,
          currentPage: entry,
          editStack: entry ? [entry] : [],
          pageState: loaded ? { ...loaded, dirty: false } : null,
          dirty: false,
          saveError: null,
          selectedId: null,
          past: [],
          future: [],
          lastPush: 0,
          lastKey: null,
        });
        setTerminalMounted(false);
        s().setLeftTab('navigator');
        s().setDevice('desktop');
        window.avb.addRecent(projectPath);
        window.avb
          .listProjectClasses(projectPath)
          .then((c: string[]) => request === projectLoadSeq.current && s().setProjectClasses(c || []))
          .catch(() => {});
        startPreview(projectPath, request);
        window.avb.watchProject(projectPath);
      } catch (err) {
        if (request === projectLoadSeq.current) {
          if (s().dirty) s().scheduleSave();
          showToast(cleanError(err), 'error');
        }
      }
    },
    [s, startPreview, showToast, flushStableProjectOrigin]
  );

  // ----------------------------------------------------------------
  // Page loading & saving
  // ----------------------------------------------------------------

  const flushSave = useCallback(async () => {
    const { currentPage: page, pageState: state, dirty, documentRevision } = s();
    s().cancelScheduledSave();
    if (!page || !state || !dirty) return;
    await s().saveSnapshot(page.path, state, documentRevision);
  }, [s]);

  const openFile = useCallback(
    async (entry: any, nextStack?: PageEntry[]) => {
      const request = ++navigationSeq.current;
      await flushSave();
      const result = await window.avb.readPage(entry.path);
      if (request !== navigationSeq.current) return false;
      s().setCurrentPage(entry);
      s().setPageState({ ...result, dirty: false });
      if (nextStack) s().setEditStack(nextStack);
      s().select(null);
      s().resetHistory();
      return true;
    },
    [s, flushSave]
  );

  const selectPage = useCallback(
    async (page: any) => {
      const entry = { ...page, kind: 'page' };
      try {
        await openFile(entry, [entry]);
      } catch (err) {
        showToast(cleanError(err), 'error');
      }
    },
    [openFile, showToast]
  );

  const reloadFromDisk = useCallback(async () => {
    const suspended = s().suspendScheduledSave();
    const proj = s().project;
    const open = s().currentPage;
    const startPath = open?.path ?? null;
    const startRevision = s().documentRevision;
    const unchanged = () =>
      s().currentPage?.path === startPath && s().documentRevision === startRevision;
    if (!proj) return;
    let result;
    try {
      result = await window.avb.scanProject(proj.path);
    } catch (err) {
      if (unchanged()) s().restoreScheduledSave(suspended);
      throw err;
    }
    if (!open) return;
    const stillThere =
      result.pages.some((p) => p.path === open.path) ||
      result.components.some((c) => c.path === open.path) ||
      result.layouts.some((l) => l.path === open.path);
    if (stillThere) {
      let fresh;
      try {
        fresh = await window.avb.readPage(open.path);
      } catch (err) {
        if (unchanged()) s().restoreScheduledSave(suspended);
        throw err;
      }
      if (!unchanged()) return;
      s().cancelScheduledSave();
      s().setScan(result);
      s().setPageState({ ...fresh, dirty: false });
      s().select(null);
      s().resetHistory();
    } else {
      const next = result.pages[0] || null;
      if (next) {
        const entry: PageEntry = { ...next, kind: 'page' };
        let fresh;
        try {
          fresh = await window.avb.readPage(entry.path);
        } catch (err) {
          if (unchanged()) s().restoreScheduledSave(suspended);
          throw err;
        }
        if (!unchanged()) return;
        s().cancelScheduledSave();
        s().setScan(result);
        s().setCurrentPage(entry);
        s().setPageState({ ...fresh, dirty: false });
        s().setEditStack([entry]);
        s().select(null);
        s().resetHistory();
      }
      else {
        if (!unchanged()) return;
        s().cancelScheduledSave();
        s().setScan(result);
        s().setEditStack([]);
        s().setCurrentPage(null);
        s().setPageState(null);
        s().select(null);
      }
    }
    s().refresh();
  }, [s]);

  const openComponent = useCallback(
    async (name: string, hostPath?: string) => {
      const comp =
        scan.components.find((c) => c.name === name) ||
        scan.layouts.find((l) => l.name === name);
      if (!comp) {
        showToast(t('app.cantFindFile', { name }), 'error');
        return;
      }
      const stack = s().editStack;
      // The canvas keeps showing the page, so remember which instance was
      // opened — that region stays lit while the rest dims. Drilling deeper
      // keeps the outermost instance as the focus: a nested component's
      // internals aren't addressable in the page's own markers.
      const focusPath = stack[stack.length - 1]?.focusPath ?? hostPath ?? null;
      const entry: PageEntry = {
        kind: 'component',
        name: comp.name,
        path: comp.path,
        focusPath: focusPath ?? undefined,
      };
      try {
        await openFile(entry, [...s().editStack, entry]);
      } catch (err) {
        showToast(cleanError(err), 'error');
      }
    },
    [s, scan.components, scan.layouts, openFile, showToast]
  );

  const closeComponent = useCallback(async () => {
    const stack = s().editStack;
    if (stack.length < 2) return;
    const next = stack.slice(0, -1);
    try {
      await openFile(next[next.length - 1], next);
    } catch (err) {
      showToast(cleanError(err), 'error');
    }
  }, [s, openFile, showToast]);

  // ----------------------------------------------------------------
  // Undo / redo / mutations — delegated to the store.
  // ----------------------------------------------------------------

  const undo = useCallback(() => s().undo(), [s]);
  const redo = useCallback(() => s().redo(), [s]);

  const setRawSource = useCallback(
    (source: string) => {
      s().pushHistory('raw-source');
      const ps = s().pageState;
      if (ps) s().setPageState({ ...ps, source, dirty: true });
      s().scheduleSave();
    },
    [s]
  );

  // ----------------------------------------------------------------
  // External file changes → refresh panels
  // ----------------------------------------------------------------

  useEffect(() => {
    const off = window.avb.onFsChanged(async ({ files }) => {
      const proj = s().project;
      if (!proj) return;

      const scanResult = await rescan(proj.path);

      const { currentPage: page, pageState: state } = s();
      if (!page) return;
      const affectsPage =
        files.includes(page.path) || files.some((f) => f.toLowerCase().endsWith('.html'));
      if (!affectsPage) return;

      if (!scanResult.pages.some((p) => p.path === page.path)) {
        s().cancelScheduledSave();
        s().setCurrentPage(null);
        s().setPageState(null);
        s().select(null);
        return;
      }

      if (state?.dirty) return;

      let result;
      try {
        s().cancelScheduledSave();
        result = await window.avb.readPage(page.path);
      } catch {
        return;
      }

      const selId = s().selectedId;
      let nextSelected = selId;
      if (selId && selId !== 'layout' && selId !== 'frontmatter') {
        if (state?.editable && result.editable) {
          const trail = pathOfNode(state.model.nodes, selId);
          nextSelected = trail ? (nodeAtPath(result.model.nodes, trail)?.id ?? null) : null;
        } else {
          nextSelected = null;
        }
      }
      s().setPageState({ ...result, dirty: false });
      s().select(nextSelected);
    });
    return off;
  }, [s, rescan]);

  // ----------------------------------------------------------------
  // Model operations
  // ----------------------------------------------------------------

  const resolveImportPath = useCallback(async (targetPath: string) => {
    const st = s();
    return window.avb.importPathFor({
      pagePath: st.currentPage!.path,
      targetPath,
      projectPath: st.project?.path,
    });
  }, [s]);

  // target: null appends at the end of the page.
  const addComponent = useCallback(
    async (componentName: string, target: DropTarget | null) => {
      const comp = insertables.find((c) => c.name === componentName);
      const page = s().currentPage;
      if (!comp || !page) return;
      const paths = await resolveImportPath(comp.path);
      const id = newId();
      s().mutateModel((model) => {
        if (!model.imports.some((i) => i.name === comp.name)) {
          model.imports.push({
            name: comp.name,
            path: chooseImportPath(model, paths),
          });
        }
        const node: AstroNode = {
          id,
          kind: 'component',
          name: comp.name,
          props: {},
          children: null,
        };
        insertIntoModel(model, node, target);
        return model;
      }, true);
      s().select(id);
    },
    [s, insertables, resolveImportPath]
  );

  const moveNode = useCallback(
    (nodeId: string, target: DropTarget | null) => {
      s().mutateModel((model) => {
        const found = findParentList(model, nodeId);
        if (!found) return model;
        const node = found.list[found.index];

        if (target?.parentId) {
          if (target.parentId === nodeId) return model;
          if (isDescendantOf(node, target.parentId)) return model;
        }

        const sameList =
          (target?.parentId == null && found.list === model.nodes) ||
          (target?.parentId != null &&
            findNodeById(model.nodes, target.parentId)?.children === found.list);

        const before = loopVarsAt(model.nodes, nodeId);

        found.list.splice(found.index, 1);
        let index = target?.index ?? Number.MAX_SAFE_INTEGER;
        if (sameList && index > found.index) index -= 1;
        insertIntoModel(model, node, target ? { ...target, index } : null);

        const after = loopVarsAt(model.nodes, nodeId);
        const lost = before.filter((v) => !after.includes(v));
        const removed = stripLostBindings(node, lost);
        if (removed) {
          showToast(
            t('app.removedBindings', {
              removed,
              plural: removed === 1 ? '' : 's',
              names: lost.join(', '),
            }),
            'info'
          );
        }
        return model;
      }, true);
    },
    [s, showToast]
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      const state = s().pageState;
      const target = state?.editable ? findNodeById(state.model.nodes, nodeId) : null;
      if (target?.kind === 'chunk-group') {
        showToast(t('app.chunkFromFrontmatter'), 'error');
        return;
      }
      s().mutateModel((model) => {
        const found = findParentList(model, nodeId);
        if (found) found.list.splice(found.index, 1);
        pruneImports(model);
        return model;
      }, true);
      if (s().selectedId === nodeId) s().select(null);
    },
    [s, showToast]
  );

  // ----------------------------------------------------------------
  // Clipboard: copy / paste / duplicate nodes
  // ----------------------------------------------------------------

  const cloneWithNewIds = (node: AstroNode) => {
    const clone = structuredClone(node);
    const walk = (n: AstroNode) => {
      n.id = newId();
      if (Array.isArray(n.children)) n.children.forEach(walk);
    };
    walk(clone);
    return clone;
  };

  const copyNode = useCallback(
    (nodeId: string) => {
      const state = s().pageState;
      if (!state?.editable) return;
      const node = findNodeById(state.model.nodes, nodeId);
      if (!node) return;
      nodeClipboardRef.current = {
        node: structuredClone(node),
        vars: loopVarsAt(state.model.nodes, nodeId),
      };
      showToast(t('app.copied', { name: node.name || 'text' }), 'success');
    },
    [s, showToast]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const state = s().pageState;
      if (!state?.editable) return;
      const src = findNodeById(state.model.nodes, nodeId);
      if (!src) return;
      if (src.kind === 'chunk-group' || src.chunkFile) {
        showToast(t('app.chunkCannotDuplicate'), 'error');
        return;
      }
      const clone = cloneWithNewIds(src);
      s().mutateModel((model) => {
        const found = findParentList(model, nodeId);
        if (!found) return model;
        found.list.splice(found.index + 1, 0, clone);
        return model;
      }, true);
    },
    [s, showToast]
  );

  // Pastes into the current selection when it can host children (a non-void
  // element, or a component with a default slot), otherwise after it (same
  // parent), or at the end of the page. Imports for components in the pasted
  // subtree are added if the target page is missing them (cross-page paste).
  const pasteNode = useCallback(async () => {
    const clip = nodeClipboardRef.current;
    const state = s().pageState;
    if (!clip || !state?.editable) return;

    const names = new Set<string>();
    (function walk(n: AstroNode) {
      if (n.kind === 'component' && n.name) names.add(n.name);
      if (Array.isArray(n.children)) n.children.forEach(walk);
    })(clip.node);
    const missing = [...names].filter(
      (nm) => !state.model.imports.some((i) => i.name === nm)
    );
    const resolved: { name: string; paths: Awaited<ReturnType<typeof resolveImportPath>> }[] = [];
    for (const nm of missing) {
      const target =
        insertables.find((c) => c.name === nm);
      if (target) resolved.push({ name: nm, paths: await resolveImportPath(target.path) });
    }

    const clone = cloneWithNewIds(clip.node);
    const selId = s().selectedId;
    const acceptsChildren = (n: AstroNode) => {
      if (n.id === 'layout') return true;
      if (n.kind === 'element') return !VOID_ELEMENTS.has(String(n.name).toLowerCase());
      if (n.kind === 'component') {
        return (insertables.find((c) => c.name === n.name)?.slots || []).includes('default');
      }
      return false;
    };
    s().mutateModel((model) => {
      for (const r of resolved) {
        if (!model.imports.some((i) => i.name === r.name)) {
          model.imports.push({ name: r.name, path: chooseImportPath(model, r.paths) });
        }
      }
      if (selId) {
        const sel = findNodeById(model.nodes, selId);
        if (sel && acceptsChildren(sel)) {
          if (!Array.isArray(sel.children)) sel.children = [];
          sel.children.push(clone);
          return model;
        }
        const found = findParentList(model, selId);
        if (found) {
          found.list.splice(found.index + 1, 0, clone);
          return model;
        }
      }
      model.nodes.push(clone);
      return model;
    }, true);

    s().mutateModel((model) => {
      const landed = findNodeById(model.nodes, clone.id);
      if (!landed) return model;
      const inScope = loopVarsAt(model.nodes, clone.id);
      const lost = (clip.vars || []).filter((v: string) => !inScope.includes(v));
      const removed = stripLostBindings(landed, lost);
      if (removed) {
        showToast(
            t('app.removedBindings', {
              removed,
              plural: removed === 1 ? '' : 's',
              names: lost.join(', '),
            }),
            'info'
          );
      }
      return model;
    }, true);
    s().select(clone.id);
  }, [s, showToast, insertables, resolveImportPath]);

  // ----------------------------------------------------------------
  // Insert palette (⌘F / ⌘E) — quick-add components, tags, loops, …
  // ----------------------------------------------------------------

  // Open requests from the app menu (⌘E accelerator) and from canvas
  // iframes (which forward ⌘F/⌘E when they hold keyboard focus).
  useEffect(() => {
    const openIfEditable = () => {
      const st = s();
      if (st.pageState?.editable && !st.inPreview) {
        s().setInsertOpen(true);
      }
    };
    const offMenu = window.avb.onMenu('insert', openIfEditable);
    const isCurrentDesignPreview = (event: MessageEvent) => {
      let expectedOrigin;
      try {
        expectedOrigin = new URL(s().devUrl ?? '').origin;
      } catch {
        return false;
      }
      if (event.origin !== expectedOrigin) return false;
      return [
        ...document.querySelectorAll<HTMLIFrameElement>('.preview-frame-wrap iframe'),
      ].some((iframe) => iframe.contentWindow === event.source);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'avb:shortcut') return;
      if (!isCurrentDesignPreview(e)) return;
      if (e.data.name === 'terminal') {
        selectLeftTab('terminal');
      } else if (e.data.name === 'insert') openIfEditable();
      else if (e.data.name === 'arrow' && e.data.key) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: e.data.key, bubbles: true, cancelable: true })
        );
      }
      else if (e.data.name === 'key' && e.data.key) {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: e.data.key,
            metaKey: !!e.data.meta,
            ctrlKey: !!e.data.meta,
            bubbles: true,
            cancelable: true,
          })
        );
      }
    };
    window.addEventListener('message', onMsg);
    return () => {
      offMenu();
      window.removeEventListener('message', onMsg);
    };
  }, [s, selectLeftTab]);

  // Where a new node goes: inside the selection when it accepts children,
  // otherwise right after it; with no selection, at the end of the page.
  const insertTargetFor = useCallback(
    (model: PageModel, selId: string | null, item: InsertItem) => {
      // The tag being inserted, when it's a plain element — components and
      // other node kinds have no fixed content model to check against.
      const childTag = item && item.type === 'element' ? item.tag : null;
      const acceptsChildren = (n: AstroNode) => {
        if (n.id === 'layout') return true;
        if (n.kind === 'element') {
          const tag = String(n.name).toLowerCase();
          if (VOID_ELEMENTS.has(tag)) return false;
          // A <p> inside an <h1> is invalid HTML the browser would reparent —
          // insert alongside instead of inside.
          return childTag ? canContainTag(tag, childTag) : true;
        }
        if (n.kind === 'map' || n.kind === 'chunk-group') return true;
        if (n.kind === 'component') {
          return (insertables.find((c) => c.name === n.name)?.slots || []).includes('default');
        }
        return false;
      };
      const findParentOf = (
        nodes: AstroNode[],
        id: string,
        parentId: string | null = null
      ): DropTarget | null => {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.id === id) return { parentId, index: i };
          if (Array.isArray(n.children)) {
            const r = findParentOf(n.children, id, n.id);
            if (r) return r;
          }
        }
        return null;
      };
      if (selId && selId !== 'frontmatter') {
        const sel = findNodeById(model.nodes, selId);
        if (sel && acceptsChildren(sel)) {
          return { parentId: sel.id, index: Array.isArray(sel.children) ? sel.children.length : 0 };
        }
        // Otherwise drop in as a sibling — climbing out of any ancestor that
        // can't legally hold it either (a <div> next to a <span> inside a <p>
        // still isn't valid, so it lands after the <p>).
        let childId: string | null = selId;
        for (let depth = 0; depth < 50; depth++) {
          if (!childId) break;
          const fp = findParentOf(model.nodes, childId);
          if (!fp) break;
          if (fp.parentId === null) return { parentId: null, index: fp.index + 1 };
          const parent = findNodeById(model.nodes, fp.parentId);
          if (!parent || acceptsChildren(parent)) {
            return { parentId: fp.parentId, index: fp.index + 1 };
          }
          childId = fp.parentId;
        }
      }
      return { parentId: null, index: model.nodes.length };
    },
    [insertables]
  );

  const insertItem = useCallback(
    (item: InsertItem) => {
      s().setInsertOpen(false);
      const state = s().pageState;
      if (!state?.editable) return;
      const target = insertTargetFor(state.model, s().selectedId, item);

      if (item.type === 'component' && item.name) {
        addComponent(item.name, target);
        return;
      }

      const id = newId();
      let node: AstroNode | null = null;
      if (item.type === 'element' && item.tag) {
        const tag = item.tag;
        const placeholder = DEFAULT_TEXT[tag as keyof typeof DEFAULT_TEXT];
        node = {
          id,
          kind: 'element',
          name: tag,
          props: {},
          children: VOID_ELEMENTS.has(tag)
            ? null
            : placeholder
              ? [{ id: newId(), kind: 'text', value: placeholder }]
              : [],
        };
      } else if (item.type === 'map') {
        node = { id, kind: 'map', head: '[].map((item) => (', children: [] };
      } else if (item.type === 'comment') {
        node = { id, kind: 'comment', value: ' Comment ' };
      } else if (item.type === 'text') {
        node = { id, kind: 'text', value: 'Text' };
      } else if (item.type === 'expr') {
        node = { id, kind: 'expr', value: '{/* code */}' };
      } else if (item.type === 'style' || item.type === 'script') {
        node = { id, kind: 'raw', name: item.type, props: {}, inner: '' };
      }
      if (!node) return;
      s().mutateModel((model) => {
        insertIntoModel(model, node, target);
        return model;
      }, true);
      s().select(id);
    },
    [s, insertTargetFor, addComponent]
  );

  // True while the CMS covers the canvas: the page-editing shortcuts below
  // would act on a selection the user can't see.
  cmsOpenRef.current = leftTab === 'cms' && !!cmsRel;

  // Keyboard: ⌘Z undoes, ⇧⌘Z / ⌘Y redoes (app-wide, even inside fields —
  // field edits live in the same history); Delete/Backspace removes, ⌘C
  // copies, ⌘D duplicates, ⌘V pastes — unless the user is typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        target.closest('.terminal-panel')
      ) {
        return;
      }
      if (cmsOpenRef.current) return;
      const mod = e.metaKey || e.ctrlKey;

      // Undo/redo take priority over native field undo so history stays
      // consistent no matter where focus is.
      if (mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        if (!s().pageState) return;
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }

      // ⌘F / ⌘E open the insert palette (works from anywhere except the
      // code editor, which keeps its own find).
      if (mod && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'e')) {
        if (!s().pageState?.editable) return;
        const el = e.target;
        if (el instanceof HTMLElement && el.closest('.cm-editor')) return;
        e.preventDefault();
        s().setInsertOpen(true);
        return;
      }

      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.closest('input, textarea, select, [contenteditable="true"]') || t.isContentEditable)
      ) {
        return;
      }
      const state = s().pageState;
      if (!state?.editable) return;
      const selId = s().selectedId;
      const hasNodeSel = !!selId && selId !== 'frontmatter';

      // Enter opens the floating editor for a selection that has one
      // (frontmatter, <style>, <script>) — same as its "Edit code" button.
      // Not gated on hasNodeSel: frontmatter is exactly one of these.
      if (!mod && !e.altKey && !e.shiftKey && e.key === 'Enter') {
        // On a focused control Enter means "activate this", not "open the
        // selection" — leave those alone (including the Edit code button
        // itself, which would otherwise fire twice).
        if (t instanceof HTMLElement && t.closest('button, a, [role="button"]')) return;
        if (openCodeWindowRef.current?.()) e.preventDefault();
        return;
      }

      // S / D swap the right panel — plain keys, so they only fire outside
      // fields (the check above) and never collide with ⌘D (duplicate).
      if (!mod && !e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        s().setRightTab('style');
        return;
      }
      if (!mod && !e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        s().setRightTab('settings');
        return;
      }

      if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (!hasNodeSel) return;
        e.preventDefault();
        removeNode(selId);
      } else if (mod && e.key.toLowerCase() === 'c') {
        // Let native copy win when actual text is selected.
        if (!hasNodeSel || String(window.getSelection() || '')) return;
        e.preventDefault();
        copyNode(selId);
      } else if (mod && e.key.toLowerCase() === 'd') {
        if (!hasNodeSel) return;
        e.preventDefault();
        duplicateNode(selId);
      } else if (mod && e.key.toLowerCase() === 'v') {
        if (!nodeClipboardRef.current) return;
        e.preventDefault();
        pasteNode();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [removeNode, copyNode, duplicateNode, pasteNode, undo, redo]);

  // Application-menu shortcuts: on macOS the native menu consumes ⌘Z/⌘C/⌘V
  // before the DOM sees them, so those arrive here via IPC instead. Copy and
  // paste route to the focused text field when one is active, otherwise to
  // the selected node.
  useEffect(() => {
    const inEditable = () => {
      const el = document.activeElement as HTMLElement | null;
      return (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      );
    };
    // Scoped to .terminal-surface (the xterm host), not the whole
    // .terminal-panel — ContextChipBar's prompt textarea and chip popovers
    // also live inside .terminal-panel, and copy/paste there must behave
    // like any other text field rather than redirect into the live shell.
    const inTerminal = () =>
      document.activeElement instanceof HTMLElement &&
      !!document.activeElement.closest('.terminal-surface');
    const terminalMenu = (action: string) => {
      window.dispatchEvent(
        new CustomEvent('stacki:terminal-menu', { detail: { action } })
      );
    };
    const offs = [
      window.avb.onMenu('undo', () => {
        if (inTerminal()) return;
        if (s().pageState && !cmsOpenRef.current) undo();
      }),
      window.avb.onMenu('redo', () => {
        if (inTerminal()) return;
        if (s().pageState && !cmsOpenRef.current) redo();
      }),
      window.avb.onMenu('copy', () => {
        if (inTerminal()) {
          terminalMenu('copy');
          return;
        }
        if (inEditable() || String(window.getSelection() || '')) {
          window.avb.nativeCopy();
          return;
        }
        const selId = s().selectedId;
        if (selId && s().pageState?.editable && !cmsOpenRef.current) {
          copyNode(selId);
        }
      }),
      window.avb.onMenu('paste', () => {
        if (inTerminal()) {
          terminalMenu('paste');
          return;
        }
        if (inEditable()) {
          window.avb.nativePaste();
          return;
        }
        if (nodeClipboardRef.current && s().pageState?.editable && !cmsOpenRef.current) {
          pasteNode();
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [s, undo, redo, copyNode, pasteNode]);

  // ----------------------------------------------------------------
  // Interactive preview mode — browse the site inside the app; on exit,
  // the editor follows whichever page was navigated to.
  // ----------------------------------------------------------------

  const enterPreview = useCallback(() => {
    if (!devUrl) return;
    const route = s().currentPage?.route || '/';
    previewPathRef.current = route;
    s().setPreviewSrc(devUrl + route);
    s().enterPreview();
  }, [s, devUrl]);

  const exitPreview = useCallback(() => {
    s().exitPreview();
    const raw = previewPathRef.current;
    if (!raw) return;
    let p = raw.split('?')[0].split('#')[0];
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    const page = scan.pages.find((pg) => pg.route === (p || '/'));
    if (page && page.path !== s().currentPage?.path) {
      selectPage(page);
    }
  }, [s, scan.pages, selectPage]);

  // Track navigation inside the preview iframe (the preload posts
  // avb:navigated from every loaded frame).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'avb:navigated' || !s().inPreview) return;
      const ifr = previewIframeRef.current;
      if (ifr && e.source === ifr.contentWindow) {
        previewPathRef.current = e.data.path;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [s]);

  // Escape exits preview mode.
  useEffect(() => {
    if (!inPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitPreview();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inPreview, exitPreview]);

  // Escape backs out of a drilled-into component, one level at a time.
  useEffect(() => {
    if (inPreview || editStack.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      // Let fields, menus, and dialogs consume their own Escape first.
      if (
        t instanceof HTMLElement &&
        (t.closest('input, textarea, select, [contenteditable="true"]') ||
          t.closest('.modal-overlay, .dd-popup, .insert-overlay, .code-window'))
      ) {
        return;
      }
      e.preventDefault();
      closeComponent();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inPreview, editStack.length, closeComponent]);

  // Capture a preview thumbnail for the welcome screen's recents list a few
  // seconds after the preview settles (page switch, refresh, or edit).
  useEffect(() => {
    if (!project || devStatus !== 'on' || !currentPage) return;
    const t = setTimeout(() => {
      const iframe = document.querySelector('.frame-clip iframe');
      if (!iframe) return;
      const r = iframe.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) return;
      // capturePage photographs the WINDOW at these coordinates, not the frame
      // itself — and several things sit over the canvas without unmounting it
      // (the CMS view, preview mode, the code window, the insert palette, a
      // modal). Capturing then files a picture of that panel as the project's
      // thumbnail. Rather than enumerate them, ask the document what is
      // actually on top at a few points across the frame: unless every one of
      // them lands inside the canvas, something is covering it — skip this
      // round and keep the thumbnail we already have.
      const covered = [0.25, 0.5, 0.75].some((f) => {
        const el = document.elementFromPoint(r.x + r.width * f, r.y + r.height * 0.25);
        return !el || !el.closest('.frame-clip');
      });
      if (covered) return;
      // Only the top of tall frames — thumbnails show above-the-fold content.
      window.avb.captureThumb({
        projectPath: project.path,
        rect: { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, r.width * 0.75) },
      });
    }, 4000);
    return () => clearTimeout(t);
  }, [project, devStatus, currentPage, refreshKey, pageState, leftTab, inPreview, codeWin]);

  const setProp = useCallback(
    (nodeId: string | null, propName: string, value: PropValue | undefined, immediate = false) => {
      s().mutateModel(
        (model) => {
          if (!nodeId) return model;
          const node = findNodeById(model.nodes, nodeId);
          if (!node) return model;
          if (!node.props) node.props = {};
          if (value === undefined) delete node.props[propName];
          else node.props[propName] = value;
          return model;
        },
        immediate,
        `prop:${nodeId}:${propName}`
      );
    },
    [s]
  );

  // Renames an attribute in place, preserving its value and position.
  const renameProp = useCallback(
    (nodeId: string | null, oldName: string, newName: string) => {
      s().mutateModel((model) => {
        if (!nodeId) return model;
        const node = findNodeById(model.nodes, nodeId);
        if (!node?.props || !(oldName in node.props)) return model;
        if (!newName || newName === oldName) return model;
        const next: Props = {};
        for (const [k, v] of Object.entries(node.props)) {
          if (k === oldName) next[newName] = v;
          else if (k !== newName) next[k] = v;
        }
        node.props = next;
        return model;
      }, true);
    },
    [s]
  );

  // Switches a plain element's tag. Attributes that belonged to the old
  // tag's built-in schema but aren't valid for the new one are dropped
  // (loading="eager" on img → div); global, data-* and aria-* attributes
  // and anything custom stay.
  const changeElementTag = useCallback(
    (nodeId: string | null, newTag: string) => {
      const tag = String(newTag || '').trim().toLowerCase();
      if (!/^[a-z][a-z0-9-]*$/.test(tag)) return;
      s().mutateModel((model) => {
        if (!nodeId) return model;
        const node = findNodeById(model.nodes, nodeId);
        if (!node || node.kind !== 'element' || node.name === tag) return model;
        const oldNames = new Set(getElementSchema(node.name).map((f: PropField) => f.name));
        const newNames = new Set(getElementSchema(tag).map((f: PropField) => f.name));
        for (const attr of Object.keys(node.props || {})) {
          if (
            oldNames.has(attr) &&
            !newNames.has(attr) &&
            !GLOBAL_ATTRS.has(attr) &&
            !/^(data-|aria-)/.test(attr)
          ) {
            delete node.props[attr];
          }
        }
        node.name = tag;
        // Void elements can't have children; paired tags serialize as a pair.
        if (VOID_ELEMENTS.has(tag)) node.children = null;
        else if (node.children === null) node.children = [];
        return model;
      }, true);
    },
    [s]
  );

  // `renames` (loop editor only) carries the variable names this edit is
  // changing, so references below the node follow along. A rename touches
  // many nodes at once, so it saves immediately and gets its own history
  // entry instead of coalescing with the keystrokes around it.
  // `immediate` skips the typing coalesce for an edit that arrives already committed
  // (the style panel writing a <style> block): waiting 300 ms there just delays the
  // canvas, since the next keystroke it was batching with never comes.
  const setNodeText = useCallback(
    (nodeId: string | null, value: string, renames?: LoopRename[], immediate = false) => {
      const renaming = (renames || []).some((r) => r.from && r.to && r.from !== r.to);
      s().mutateModel(
        (model) => {
          if (!nodeId) return model;
          const node = findNodeById(model.nodes, nodeId);
          if (!node) return model;
          if (node.kind === 'map') {
            const prev = parseLoopHead(node.head);
            node.head = value;
            for (const { from, to } of renames || []) {
              if (from && to && from !== to) renameLoopVar(node.children || [], from, to);
            }
            // Renames above already re-pointed the children, so compare the
            // data sources and orphan-proof what reads from this item.
            const next = parseLoopHead(value);
            if (prev && next && prev.data !== next.data) {
              const vars = [next.item, next.index].filter(Boolean);
              if (vars.length) disconnectDependentLoops(node.children || [], vars);
            }
          } else if (node.kind === 'raw') node.inner = value;
          else if (node.kind === 'text' || node.kind === 'expr' || node.kind === 'comment') {
            node.value = value;
          }
          return model;
        },
        renaming || immediate,
        renaming ? undefined : `text:${nodeId}`
      );
    },
    [s]
  );

  // Replaces the page frontmatter: default imports are re-extracted so the
  // model's import list (used for palettes, pruning, chunk resolution) stays
  // in sync with the edited code.
  const setFrontmatter = useCallback(
    (code: string) => {
      s().mutateModel(
        (model) => {
          const importRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/g;
          const imports = [];
          let extra = code;
          let m;
          while ((m = importRe.exec(code)) !== null) {
            imports.push({ name: m[1], path: m[2] });
            extra = extra.replace(m[0], '');
          }
          model.imports = imports;
          model.extraFrontmatter = extra.trim();
          return model;
        },
        false,
        'frontmatter'
      );
    },
    [s]
  );

  // Sets the text content of a component (single text child convenience).
  const setNodeContent = useCallback(
    (nodeId: string | null, value: string) => {
      s().mutateModel(
        (model) => {
          if (!nodeId) return model;
          const node = findNodeById(model.nodes, nodeId);
          if (!node || node.kind === 'text') return model;
          if (!Array.isArray(node.children)) node.children = [];
          const textChild = node.children.find((c) => c.kind === 'text');
          if (textChild) textChild.value = value;
          else node.children.push({ id: newId(), kind: 'text', value });
          return model;
        },
        false,
        `content:${nodeId}`
      );
    },
    [s]
  );

  // Replaces a node's inline children wholesale (rich Content field edits).
  // Nodes arrive from the editor without ids — assign fresh ones.
  const setNodeInline = useCallback(
    (nodeId: string | null, kids: AstroNode[]) => {
      const withIds = (list: AstroNode[]): AstroNode[] =>
        list.map((n) => ({
          ...n,
          id: newId(),
          ...(Array.isArray(n.children) ? { children: withIds(n.children) } : {}),
        }));
      s().mutateModel(
        (model) => {
          if (!nodeId) return model;
          const node = findNodeById(model.nodes, nodeId);
          if (!node || node.kind === 'text') return model;
          node.children = withIds(kids);
          return model;
        },
        false,
        `content:${nodeId}`
      );
    },
    [s]
  );

  const changeLayout = useCallback(
    async (layoutName: string) => {
      const seq = ++layoutSeq.current;
      if (!layoutName) {
        // Unwrap: replace the wrapper node with its children.
        s().mutateModel((model) => {
          const found = findParentList(model, 'layout');
          if (found) {
            const node = found.list[found.index];
            const kids = Array.isArray(node.children) ? node.children : [];
            found.list.splice(found.index, 1, ...kids);
          }
          pruneImports(model);
          return model;
        }, true);
        if (s().selectedId === 'layout') s().select(null);
        return;
      }
      const layout = scan.layouts.find((l) => l.name === layoutName);
      if (!layout) return;
      const paths = await resolveImportPath(layout.path);
      if (seq !== layoutSeq.current) return; // superseded by a newer change
      s().mutateModel((model) => {
        const existing = findNodeById(model.nodes, 'layout');
        if (existing) {
          existing.name = layout.name;
        } else {
          // No wrapper yet — wrap the whole page in the new layout.
          model.nodes = [
            { id: 'layout', kind: 'component', name: layout.name, props: {}, children: model.nodes },
          ];
        }
        if (!model.imports.some((i) => i.name === layout.name)) {
          model.imports.push({
            name: layout.name,
            path: chooseImportPath(model, paths),
          });
        }
        pruneImports(model);
        return model;
      }, true);
    },
    [s, scan.layouts, resolveImportPath]
  );

  // ----------------------------------------------------------------
  // Page management
  // ----------------------------------------------------------------

  const createPage = useCallback(
    async (name: string, layoutName: string) => {
      const layout = scan.layouts.find((l) => l.name === layoutName) || null;
      const proj = s().project;
      if (!proj) return;
      try {
        const { pagePath } = await window.avb.createPage({
          projectPath: proj.path,
          name,
          layout,
        });
        const result = await rescan(proj.path);
        const page = result.pages.find((p) => p.path === pagePath);
        if (page) selectPage(page);
        showToast(t('app.createdPage', { name: name + '.astro' }), 'success');
      } catch (err) {
        showToast(cleanError(err), 'error');
      }
    },
    [s, scan.layouts, rescan, selectPage, showToast]
  );

  const deletePage = useCallback(
    async (page: PageEntry) => {
      if (!confirm(t('pagesPanel.deleteConfirm', { name: page.name }))) return;
      await window.avb.deletePage(page.path);
      const result = await rescan(projectPath());
      if (s().currentPage?.path === page.path) {
        const next = result.pages[0] || null;
        if (next) selectPage(next);
        else {
          s().cancelScheduledSave();
          s().setCurrentPage(null);
          s().setPageState(null);
        }
      }
      showToast(t('app.pageDeleted', { name: page.name }), 'success');
    },
    [s, rescan, selectPage, showToast]
  );

  // Moves/renames a page (drag between folders, inline rename). `to` is the
  // new path relative to src/pages including the extension.
  const movePageTo = useCallback(
    async (page: PageEntry, to: string) => {
      try {
        const { newPath } = await window.avb.movePage({
          projectPath: projectPath(),
          from: page.path,
          to,
        });
        const result = await rescan(projectPath());
        if (s().currentPage?.path === page.path) {
          const np = result.pages.find((p) => p.path === newPath);
          if (np) selectPage(np);
        }
      } catch (err) {
        showToast(cleanError(err), 'error');
      }
    },
    [s, rescan, selectPage, showToast]
  );

  // Creates an (empty) folder with a placeholder name; the panel opens an
  // inline rename right after. Returns the created folder's name.
  const createPageFolder = useCallback(async () => {
    const existing = new Set(scan.pageFolders || []);
    let name = 'new-folder';
    for (let i = 2; existing.has(name); i++) name = `new-folder-${i}`;
    try {
      await window.avb.createPageFolder({ projectPath: projectPath(), dir: name });
      await rescan(projectPath());
      return name;
    } catch (err) {
      showToast(cleanError(err), 'error');
      return null;
    }
  }, [s, scan, rescan, showToast]);

  const renamePageFolder = useCallback(
    async (from: string, to: string) => {
      try {
        await window.avb.renamePageFolder({ projectPath: projectPath(), from, to });
        const result = await rescan(projectPath());
        // Re-select the current page if it lived inside the renamed folder.
        const cur = s().currentPage;
        if (cur && !result.pages.some((p) => p.path === cur.path)) {
          const newName = cur.name.startsWith(from + '/')
            ? to + cur.name.slice(from.length)
            : null;
          const np = newName && result.pages.find((p) => p.name === newName);
          if (np) selectPage(np);
        }
      } catch (err) {
        showToast(cleanError(err), 'error');
      }
    },
    [s, rescan, selectPage, showToast]
  );

  const deletePageFolder = useCallback(
    async (dir: string, pageCount: number) => {
      const suffix = pageCount
        ? ` and the ${pageCount} page${pageCount === 1 ? '' : 's'} inside it`
        : '';
      if (!confirm(t('pagesPanel.deleteFolderConfirm', { dir, suffix }))) return;
      try {
        await window.avb.deletePageFolder({ projectPath: projectPath(), dir });
        const result = await rescan(projectPath());
        const cur = s().currentPage;
        if (cur && !result.pages.some((p) => p.path === cur.path)) {
          const next = result.pages[0] || null;
          if (next) selectPage(next);
          else {
            s().cancelScheduledSave();
            s().setCurrentPage(null);
            s().setPageState(null);
          }
        }
      } catch (err) {
        showToast(cleanError(err), 'error');
      }
    },
    [project, rescan, selectPage, showToast]
  );

  // ----------------------------------------------------------------
  // Selection helpers
  // ----------------------------------------------------------------

  // Floating code window target value: page frontmatter, a raw node's inner
  // content, or a text file from public/ (loaded into fileText).
  const isFileWin = codeWin?.kind === 'file';
  const codeWinNode =
    codeWin && !isFileWin && codeWin.targetId !== 'frontmatter' && model
      ? findNodeById(model.nodes, codeWin.targetId)
      : null;
  const codeWinValue = !codeWin
    ? null
    : isFileWin
      ? fileText
      : codeWin.targetId === 'frontmatter'
        ? model
          ? frontmatterCode
          : null
        : codeWinNode?.inner ?? null;

  // What the "Current file" context chip attaches: whatever the floating
  // code editor currently has open (a public/ asset file, frontmatter, or a
  // raw <script>/<style> block), normalized to one shape so the resolver
  // doesn't need to know about codeWin's internal variants. Asset files are
  // whole files (`kind: 'file'`); frontmatter/raw-node windows only hold a
  // fragment of `currentPage`'s file (`kind: 'fragment'`), so the resolver
  // can warn that it isn't the complete file.
  const currentFileContext =
    codeWin && codeWinValue !== null
      ? {
          path: isFileWin
            ? `public/${codeWin.rel}`
            : toProjectRelativePath(currentPage?.path ?? null, project?.path ?? null),
          title: codeWin.title,
          language: codeWin.language,
          content: codeWinValue,
          kind: isFileWin ? 'file' : 'fragment',
        }
      : null;

  // What the Selected Element / Current Page / Current Component context
  // chips read: the raw node tree, the current selection (excluding the
  // synthetic frontmatter pseudo-node, which isn't a real visual element),
  // the page's editable-model info, and every known component/layout
  // definition for "which component owns this node" lookups.
  // Memoized so ContextChipBar's `appState` useMemo (which depends on
  // editorContext by reference) doesn't invalidate on every App render — an
  // unmemoized object literal here is a fresh reference every time,
  // re-running useTerminalContext's staleness-detection effect (which now
  // also re-hashes page-tree summaries, see currentPageResolver.js) far more
  // often than the underlying data actually changes. Dependencies cover
  // every value read below: `model` as a whole (not just `model?.nodes`)
  // since pageInfo also reads model.imports/model.extraFrontmatter and
  // model's mere presence, and `project?.path`/`currentPage` rather than the
  // whole `project` object since only their specific fields are read.
  const editorContext = useMemo(
    () => ({
      selectedNode: selectedNode && selectedNode.kind !== 'frontmatter' ? selectedNode : null,
      nodeTree: model?.nodes ?? [],
      loopContext,
      componentDefinitions: insertables,
      currentComponent: currentPage?.kind === 'component'
        ? { name: currentPage.name, path: currentPage.path }
        : null,
      pageInfo: model
        ? {
            editable: true,
            route: currentPage?.route ?? null,
            path: toProjectRelativePath(currentPage?.path ?? null, project?.path ?? null),
            layoutName: currentLayoutName,
            imports: model.imports || [],
            frontmatter: model.extraFrontmatter || '',
          }
        : null,
    }),
    [selectedNode, model, loopContext, insertables, currentPage, project?.path, currentLayoutName],
  );

  const getPreviewRect = useCallback(() => {
    const frame = previewFrameRef.current;
    if (!frame) return null;
    const r = frame.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height, selectedRect: null };
  }, []);

  // Returns whether the selection actually has a code editor, so the Enter
  // shortcut below knows whether it handled the key.
  const openCodeWindow = () => {
    if (!selectedNode) return false;
    if (selectedNode.kind === 'frontmatter') {
      s().setCodeWin({ targetId: 'frontmatter', title: 'Frontmatter', language: 'javascript' });
      return true;
    }
    if (selectedNode.kind === 'raw') {
      s().setCodeWin({
        targetId: selectedNode.id,
        title: `<${selectedNode.name}>`,
        language: selectedNode.name === 'style' ? 'css' : 'javascript',
      });
      return true;
    }
    return false;
  };
  openCodeWindowRef.current = openCodeWindow;

  // Opens a public/ text file in the floating editor.
  const openAssetFile = useCallback(
    async ({ rel, name }: { rel: string; name: string }) => {
      try {
        const { text } = await window.avb.readAssetText({ projectPath: projectPath(), rel });
        setFileText(text);
        s().setCodeWin({
          kind: 'file',
          rel,
          title: name,
          language: /\.css$/i.test(name) ? 'css' : 'javascript',
        });
      } catch (err) {
        showToast(cleanError(err), 'error');
      }
    },
    [s, showToast]
  );

  // File edits stream to disk (debounced) — the dev server picks them up.
  const setAssetFileText = useCallback(
    (text: string) => {
      setFileText(text);
      if (!codeWin || codeWin.kind !== 'file') return;
      const { rel } = codeWin;
      if (fileSaveTimer.current) clearTimeout(fileSaveTimer.current);
      fileSaveTimer.current = setTimeout(() => {
        window.avb
          .writeAssetText({ projectPath: projectPath(), rel, text })
          .catch((err) => showToast(t('app.saveFailed', { error: cleanError(err) }), 'error'));
      }, 300);
    },
    [s, codeWin, showToast]
  );

  // Close the window if its target disappears (page switch, node deleted).
  useEffect(() => {
    if (codeWin && !isFileWin && codeWinValue === null) s().setCodeWin(null);
  }, [s, codeWin, isFileWin, codeWinValue]);

  // Canvas outlines: nodes are addressed by their index path in the tree
  // (matching the marker paths the dev server's plugin injects).
  const pathFor = (id: string | null) => pathForNode(s(), id);
  // Picking a component swaps the right panel to Settings — its props are the
  // only thing there is to edit on it; picking a plain element (or a dynamic
  // tag, which renders one) swaps back to Style. Anything else — frontmatter,
  // text, a <style> block — leaves whatever tab the user had open alone.
  useEffect(() => {
    if (selectedId === tabSelRef.current) return;
    tabSelRef.current = selectedId;
    if (!selectedNode) return;
    const dynamicTag = 'dynamicTag' in selectedNode && selectedNode.dynamicTag;
    const isComponent = selectedNode.kind === 'component' && !dynamicTag;
    if (isComponent) s().setRightTab('settings');
    else if (selectedNode.kind === 'element' || dynamicTag) s().setRightTab('style');
  }, [selectedId, selectedNode]);

  // Position the Style/Settings highlight: on tab change, when the panel first
  // appears, and whenever the tab strip's width changes.
  useLayoutEffect(() => {
    const measure = () => {
      const el = rightTabRefs.current[rightTab];
      setRightTabInd(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    const strip = rightTabRefs.current[rightTab]?.parentElement;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [rightTab, pageState?.editable]);

  const overlayInfo = (p: string | null) => {
    if (!model || !p) return null;
    const n = nodeAtPath(model.nodes, p.split('.').map(Number));
    if (!n) return null;
    const label = nodeLabel(n, currentLayoutName);
    // A dynamic tag renders an element, so it shouldn't wear the component
    // colour on the canvas either.
    const kind =
      n.kind === 'component' && !n.dynamicTag
        ? 'component'
        : n.kind === 'map'
          ? 'map'
          : 'element';
    // The tag drives the overlay's icon, so it matches the Navigator row.
    const tag = n.kind === 'element' || n.kind === 'raw' ? n.name : null;
    return {
      label,
      kind,
      tag,
      nodeKind: n.kind,
      isLayout: n.id === 'layout',
      bound: kind === 'element' && isDataBound(n),
    };
  };

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  if (!project) {
    // welcome-mode floats the title bar over the start screen so the
    // interactive backdrop runs edge to edge, behind the window controls.
    return (
      <div className="app welcome-mode">
        <div className="titlebar">
          <span className="spacer" />
        </div>
        <WelcomeScreen onOpen={loadProject} setBusy={s().setBusy} showToast={showToast} />
        {busy && <BusyOverlay message={busy} />}
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  // The canvas always renders the page — editing a component just dims
  // everything outside the instance being worked on.
  const pageEntry = editStack[0] || currentPage;
  const pageRoute = pageEntry?.route;
  const focusPath = currentPage?.kind === 'component' ? currentPage.focusPath : null;
  const pageScope = toPreviewScope(pageEntry?.path ?? null, project.path);
  const activeScope = toPreviewScope(currentPage?.path ?? null, project.path);
  const liveUrl = devUrl && pageRoute ? devUrl + pageRoute : null;

  return (
    <div className="app">
      <div className="titlebar">
        <span className="app-title">{project.name}</span>
        <span className="spacer" />
        {editStack.length > 1 ? (
          <button
            className="page-switch-btn comp-back"
            title={t('titleBar.back')}
            onClick={closeComponent}
          >
            <ChevronLeftIcon size={13} />
            <span className="comp-back-sep" />
            <ElementComponentIcon size={13} />
            <span className="page-switch-label">{currentPage?.name}</span>
          </button>
        ) : (
          <PageSwitcher pages={scan.pages} currentPage={currentPage} onSelect={selectPage} />
        )}
        <div className="url-group">
          <span
            className={`status-dot ${devStatus === 'on' ? 'on' : devStatus === 'starting' ? 'starting' : 'off'}`}
            title={t('titleBar.devServer', { status: devStatus })}
          />
          <button
            className="ghost"
            title={t('titleBar.reloadPreview')}
            disabled={!liveUrl}
            onClick={() => s().refresh()}
          >
            <RefreshIcon size={13} />
          </button>
          <span className="url">
            {liveUrl || (devStatus === 'starting' ? t('preview.starting') : t('preview.offline'))}
          </span>
        </div>
        <span className="spacer" />
        {/* Both ways of viewing the site, kept together. */}
        <div className="titlebar-actions">
          <button
            className="titlebar-btn"
            title={t('titleBar.openInBrowser')}
            disabled={!liveUrl}
            onClick={() => liveUrl && window.avb.openExternal(liveUrl)}
          >
            <ExternalIcon size={14} />
          </button>
          <button
            className={`titlebar-btn preview-btn ${inPreview ? 'on' : ''}`}
            title={inPreview ? t('titleBar.exitPreview') : t('titleBar.previewSite')}
            disabled={!devUrl}
            onClick={() => (inPreview ? exitPreview() : enterPreview())}
          >
            <PreviewIcon size={15} />
          </button>
        </div>
        <GitChip
          project={project}
          showToast={showToast}
          flushSave={flushSave}
          onWorktreeChanged={reloadFromDisk}
        />
      </div>

      <div className="main">
        <LeftRail active={leftTab} onSelect={selectLeftTab} />

        {terminalMounted && (
          <TerminalPanel
            key={project.path}
            active={leftTab === 'terminal'}
            currentFile={currentFileContext}
            projectPath={project.path}
            editorContext={editorContext}
            devLog={devLog}
            devUrl={devUrl}
            getPreviewRect={getPreviewRect}
          />
        )}

        {leftTab && leftTab !== 'terminal' && (
          <div className="panel left">
            {leftTab === 'pages' && (
              <PagesPanel
                scan={scan}
                currentPage={currentPage}
                onSelect={selectPage}
                onCreate={createPage}
                onDelete={deletePage}
                onRescan={() => rescan(project.path)}
                onMovePage={movePageTo}
                onCreateFolder={createPageFolder}
                onRenameFolder={renamePageFolder}
                onDeleteFolder={deletePageFolder}
              />
            )}
            {leftTab === 'navigator' && (
              <StructurePanel
                onSelect={(id) => s().select(id)}
                onHoverNode={(id) => s().setHoverNode(id)}
                onOpenComponent={(name: string, id: string) =>
                  openComponent(name, pathFor(id) ?? undefined)
                }
                onChangeLayout={changeLayout}
                onDropComponent={addComponent}
                onMoveNode={moveNode}
                onRemoveNode={removeNode}
                onCopyNode={copyNode}
                onDuplicateNode={duplicateNode}
                onPasteNode={pasteNode}
                hasClipboard={() => !!nodeClipboardRef.current}
                onRawChange={setRawSource}
              />
            )}
            {leftTab === 'components' && (
              <PalettePanel
                components={insertables}
                devUrl={devUrl}
                onInsert={(name: string) => addComponent(name, null)}
                onDragBegin={() => s().setLeftTab('navigator')}
              />
            )}
            {leftTab === 'cms' && (
              <CmsPanel
                project={project}
                selectedRel={cmsRel}
                refreshKey={cmsTick}
                onSelect={(r: string) => {
                  s().setCmsRel(r);
                  s().setCmsSettings(false);
                }}
                onOpenSettings={(r: string) => {
                  s().setCmsRel(r);
                  s().setCmsSettings(true);
                }}
                showToast={showToast}
              />
            )}
            {leftTab === 'assets' && (
              <AssetsPanel
                project={project}
                showToast={showToast}
                onOpenFile={openAssetFile}
                pick={assetPick}
                onPickCancel={endAssetPick}
              />
            )}
          </div>
        )}

        <div className="center">
          <PreviewPane
            route={pageRoute}
            crumbs={crumbs}
            onCrumb={(id) => s().select(id)}
            onRefresh={() => s().refresh()}
            onRestart={() => startPreview(project.path)}
            selPath={pathFor(selectedId)}
            navHoverPath={pathFor(hoverNodeId)}
            activeScope={activeScope}
            pageScope={pageScope}
            overlayInfo={overlayInfo}
            focusPath={focusPath}
            onDevice={(d) => s().setDevice(d as PreviewDevice)}
            onSelectNode={(hit: PreviewNodeHit) => {
              if (currentPage?.kind === 'component') {
                const inside = !!focusPath && !!hit.pagePath &&
                  (hit.pagePath === focusPath || hit.pagePath.startsWith(focusPath + '.'));
                if (!inside) {
                  closeComponent();
                  return;
                }
                if (hit.scope !== activeScope || !hit.path) return;
              } else if (!hit.path) {
                const layout = model && findNodeById(model.nodes, 'layout');
                if (layout) {
                  s().select(layout.id, { reveal: s().leftTab !== 'terminal' });
                }
                return;
              } else if (hit.scope !== activeScope) return;

              const n = model && hit.path &&
                nodeAtPath(model.nodes, hit.path.split('.').map(Number));
              if (n) {
                s().select(n.id, { reveal: s().leftTab !== 'terminal' });
              }
            }}
            onOpenNode={(hit: PreviewNodeHit) => {
              if (hit.scope !== activeScope || !hit.path) return;
              const n = model && nodeAtPath(model.nodes, hit.path.split('.').map(Number));
              if (n?.kind === 'component') openComponent(n.name, hit.path);
            }}
            onFrameMounted={(ref) => { previewFrameRef.current = ref; }}
          />

          {/* The CMS edits content, not layout — it covers the canvas rather
              than replacing it, so the preview keeps its loaded page. */}
          {cmsRel && (
            <CmsView
              project={project}
              rel={cmsRel}
              hidden={leftTab !== 'cms'}
              settings={cmsSettings}
              showToast={showToast}
              onSaved={() => s().setCmsTick(s().cmsTick + 1)}
              onCloseSettings={() => s().setCmsSettings(false)}
              onDeleted={() => {
                s().setCmsRel(null);
                s().setCmsSettings(false);
              }}
              onClose={() => s().setCmsRel(null)}
              jumpItemId={cmsJump && cmsJump.rel === cmsRel ? cmsJump.itemId : null}
              onJumpHandled={() => s().setCmsJump(null)}
              onJumpToItem={(jumpRel: string, itemId: string) => {
                s().setCmsSettings(false);
                s().setLeftTab('cms');
                s().setCmsRel(jumpRel);
                s().setCmsJump({ rel: jumpRel, itemId });
              }}
            />
          )}
        </div>

        {inPreview && previewSrc && (
          <div className="preview-mode">
            <iframe ref={previewIframeRef} src={previewSrc} title={t('titleBar.sitePreview')} />
          </div>
        )}

        {pageState?.editable && (
          <div className="panel right">
            <div className="right-tabs">
              {rightTabInd && <span className="right-tabs-indicator" style={rightTabInd} />}
              {[
                { id: 'style', label: t('common.style') },
                { id: 'settings', label: t('common.settings') },
              ].map((t) => (
                <button
                  key={t.id}
                  ref={(el) => (rightTabRefs.current[t.id] = el)}
                  className={rightTab === t.id ? 'on' : ''}
                  onClick={() => s().setRightTab(t.id as RightTab)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {rightTab === 'style' && (
              <StylePanel
                onWriteStyleNode={(nodeId, css, immediate) =>
                  setNodeText(nodeId, css, undefined, immediate)
                }
                onSelectNode={(id) => s().select(id)}
              />
            )}
            <div style={{ display: rightTab === 'settings' ? 'contents' : 'none' }}>
            <PropsPanel
              onChangeLayout={changeLayout}
              onSetProp={(propName, value, immediate) =>
                setProp(selectedId, propName, value, immediate)
              }
              onRenameProp={(oldName, newName) => renameProp(selectedId, oldName, newName)}
              onChangeTag={(tag) => changeElementTag(selectedId, tag)}
              onSetText={(value, renames) =>
                selectedId === 'frontmatter'
                  ? setFrontmatter(value)
                  : setNodeText(selectedId, value, renames)
              }
              onSetContent={(value) => setNodeContent(selectedId, value)}
              onSetInline={(kids) => setNodeInline(selectedId, kids)}
              onOpenCode={openCodeWindow}
            />
            </div>
          </div>
        )}
      </div>

      {codeWin && codeWinValue !== null && (
        <CodeWindow
          title={codeWin.title}
          language={codeWin.language}
          value={codeWinValue}
          editorKey={isFileWin && 'rel' in codeWin ? `file:${codeWin.rel}` : codeWin.targetId}
          onChange={(value: string) =>
            isFileWin
              ? setAssetFileText(value)
              : codeWin.targetId === 'frontmatter'
                ? setFrontmatter(value)
                : setNodeText(codeWin.targetId, value)
          }
          onClose={() => s().setCodeWin(null)}
        />
      )}

      {insertOpen && (
        <InsertSearch
          components={insertables}
          onInsert={insertItem}
          onClose={() => s().setInsertOpen(false)}
        />
      )}

      {busy && <BusyOverlay message={busy} />}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function insertIntoModel(model: PageModel, node: AstroNode, target: DropTarget | null) {
  if (!target || target.parentId == null) {
    const index = target ? Math.min(target.index, model.nodes.length) : model.nodes.length;
    model.nodes.splice(index, 0, node);
    return;
  }
  const parent = findNodeById(model.nodes, target.parentId);
  if (!parent) {
    model.nodes.push(node);
    return;
  }
  if (!Array.isArray(parent.children)) parent.children = [];
  const index = Math.min(target.index, parent.children.length);
  parent.children.splice(index, 0, node);
}

function BusyOverlay({ message }: { message: string }) {
  return (
    <div className="busy-overlay">
      <div className="spinner" />
      <div>{message}</div>
    </div>
  );
}

function Toast({ toast }: { toast: { msg: string; kind: string } }) {
  return <div className={`toast ${toast.kind}`}>{toast.msg}</div>;
}

export function cleanError(err: unknown) {
  const msg = (err instanceof Error ? err.message : '') || String(err);
  return stripAnsi(msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
}

function stripAnsi(s: unknown) {
  return String(s)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b/g, '')
    .replace(/\[(\d{1,2})m/g, '');
}
