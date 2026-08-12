// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { MARKER_ATTR, createPreviewMarkerRegistry } = require('./previewMarkerRuntime');

// Preview iframes (nodeIntegrationInSubFrames runs this preload in them too):
// don't expose the app API to the previewed site — just report the page's
// content height to the app so the canvas view can size frames to the page.
if (!process.isMainFrame) {
  // Design-mode frames (canvas + editor preview) are marked with #avb-design.
  // They get an editor cursor (no I-beam over text) and links/forms are
  // inert — navigation only happens in the interactive preview mode.
  if (location.hash.includes('avb-design')) {
    const injectDesignStyle = () => {
      if (document.getElementById('avb-design-style')) return;
      const style = document.createElement('style');
      style.id = 'avb-design-style';
      style.textContent =
        '*, *::before, *::after { cursor: default !important; }';
      (document.head || document.documentElement)?.appendChild(style);
    };
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', injectDesignStyle);
    } else {
      injectDesignStyle();
    }
    // Block navigation and submits at capture so page handlers never fire.
    window.addEventListener(
      'click',
      (e) => {
        const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
        if (a) e.preventDefault();
      },
      true
    );
    window.addEventListener('submit', (e) => e.preventDefault(), true);
    // Forward app shortcuts when the canvas has keyboard focus — otherwise
    // ⌘F/⌘E die inside the iframe and the insert palette never opens.
    window.addEventListener(
      'keydown',
      (e) => {
        const terminalShortcut =
          e.altKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.shiftKey &&
          e.code === 'KeyT';
        if (terminalShortcut) {
          e.preventDefault();
          e.stopImmediatePropagation();
          try {
            window.parent.postMessage({ type: 'avb:shortcut', name: 'terminal' }, '*');
          } catch {
            /* ignore */
          }
          return;
        }
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'e')) {
          e.preventDefault();
          try {
            window.parent.postMessage({ type: 'avb:shortcut', name: 'insert' }, '*');
          } catch {
            /* ignore */
          }
          return;
        }
        const t = e.target;
        const typing =
          t &&
          t.nodeType === 1 &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable);
        if (typing) return;

        // Clicking the canvas puts keyboard focus inside this frame, so the
        // app's own arrow-key navigation would never see the keys. Forward
        // them (and swallow them here, so the page doesn't scroll instead).
        if (
          !mod &&
          !e.altKey &&
          !e.shiftKey &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        ) {
          e.preventDefault();
          try {
            window.parent.postMessage({ type: 'avb:shortcut', name: 'arrow', key: e.key }, '*');
          } catch {
            /* ignore */
          }
          return;
        }

        // Editing the selected node from the canvas. Undo, copy and paste
        // already survive an iframe-focused canvas because they're native
        // menu accelerators, which fire whatever holds focus; delete and
        // duplicate have no menu item, so without this they only work when
        // the selection was made in the navigator.
        const isDelete = !mod && !e.altKey && (e.key === 'Delete' || e.key === 'Backspace');
        const isDuplicate = mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd';
        if (isDelete || isDuplicate) {
          e.preventDefault();
          try {
            window.parent.postMessage(
              { type: 'avb:shortcut', name: 'key', key: e.key, meta: mod },
              '*'
            );
          } catch {
            /* ignore */
          }
        }
      },
      true
    );
  }

  // documentElement.scrollHeight is clamped to the viewport (= the iframe),
  // so once the frame is stretched it can never report a smaller page — a
  // one-way ratchet. Measure the body's own content height instead; the
  // frozen-mode override un-stretches html/body so this reflects content.
  const report = () => {
    try {
      const body = document.body;
      let height;
      if (body) {
        const styles = getComputedStyle(body);
        height = body.offsetTop + body.scrollHeight + (parseFloat(styles.marginBottom) || 0);
      } else {
        height = document.documentElement.scrollHeight;
      }
      window.parent.postMessage({ type: 'avb:page-height', height: Math.ceil(height) }, '*');
    } catch {
      /* ignore */
    }
  };

  // Canvas frames stretch to the full page height, which would make vh units
  // (viewport = iframe) track the frame instead of a screen — a 100vh hero
  // would fill the whole frame and the measured height would chase its own
  // tail (every breakpoint converging to the same height). The app posts
  // `avb:set-vh` with the breakpoint's real viewport height; we freeze vh by
  // copying every rule that uses vh units into an override stylesheet with
  // `Xvh` → `calc(X * var(--avb-vh))`, where --avb-vh is 1% of that height.
  const VH_RE = /(-?\d*\.?\d+)(vh|svh|lvh|dvh)\b/g;
  const FIXED_RE = /position:\s*fixed/g;
  let overrideEl = null;
  let rewriteTimer = null;

  // Copies ONLY the declarations that need freezing (vh units, position:
  // fixed) into the override — never whole rule bodies. Re-asserting entire
  // rules at the end of the cascade would let base rules beat utility
  // classes that legitimately override them later in source order.
  const filterRule = (rule) => {
    if (rule.cssRules && rule.cssRules.length) {
      // Grouping rule (@media, @supports, @keyframes …) — recurse.
      let inner = '';
      for (const r of rule.cssRules) inner += filterRule(r);
      if (!inner) return '';
      const head = rule.cssText.slice(0, rule.cssText.indexOf('{'));
      return head + '{\n' + inner + '}\n';
    }
    const selector = rule.selectorText || rule.keyText;
    if (!rule.style || !selector) return '';
    let decls = '';
    for (const prop of rule.style) {
      const val = rule.style.getPropertyValue(prop);
      const prio = rule.style.getPropertyPriority(prop);
      VH_RE.lastIndex = 0;
      const hasVh = VH_RE.test(val);
      const isFixed = prop === 'position' && /fixed/.test(val);
      if (!hasVh && !isFixed) continue;
      VH_RE.lastIndex = 0;
      // position:fixed anchors to the stretched frame, so it becomes
      // absolute — headers/overlays sit at their page position instead of
      // floating mid-frame.
      const newVal = isFixed
        ? 'absolute'
        : val.replace(VH_RE, 'calc($1 * var(--avb-vh, 1$2))');
      decls += `${prop}: ${newVal}${prio ? ' !important' : ''}; `;
    }
    return decls ? `${selector} { ${decls}}\n` : '';
  };

  const rewriteSheets = () => {
    if (!document.head) return;
    // Un-stretch html/body so the frame's height comes from content, not
    // from the (stretched) viewport — kills height:100% feedback.
    let css = 'html, body { height: auto !important; }\n';
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode === overrideEl) continue;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin stylesheet — can't read, leave it be
      }
      for (const rule of rules) css += filterRule(rule);
    }
    if (!overrideEl) {
      overrideEl = document.createElement('style');
      overrideEl.id = 'avb-vh-override';
    }
    if (overrideEl.textContent !== css) overrideEl.textContent = css;
    if (document.head.lastElementChild !== overrideEl) document.head.appendChild(overrideEl);
  };

  const scheduleRewrite = () => {
    clearTimeout(rewriteTimer);
    rewriteTimer = setTimeout(() => {
      rewriteSheets();
      report();
    }, 100);
  };

  // --- Node outlines --------------------------------------------------------
  // Pages served through the app's marker plugin wrap every model node in
  // <template data-avb-s/e="path"> pairs. Record each pair's run of sibling
  // DOM nodes, then strip the markers so they can't affect structural CSS
  // selectors (:first-child, :nth-child, …). The app tracks paths; their
  // rects are pushed back on scroll/resize/DOM changes, and hovering the
  // page reports the deepest node under the cursor.
  const markerRegistry = createPreviewMarkerRegistry(document);
  let activeScope = '';
  let pageScope = '';
  let trackedPaths = [];
  let focusPath = null;
  let hiddenPaths = [];
  let lastHoverPath = undefined;
  let lastHoverPagePath = undefined;
  let lastHoverOcc = 0;

  const sendRects = () => {
    if (!trackedPaths.length && !focusPath) return;
    const rects = {};
    for (const p of trackedPaths) rects[p] = markerRegistry.rectsFor(activeScope, p);
    const focusRects = focusPath ? markerRegistry.rectsFor(pageScope, focusPath) : null;
    window.parent.postMessage({ type: 'avb:rects', rects, focusRects }, '*');
  };

  let hiddenStyleEl = null;
  const updateHiddenStyles = () => {
    const tokens = markerRegistry.markerTokensForSubtrees(activeScope, hiddenPaths);
    if (tokens.length === 0) {
      if (hiddenStyleEl) {
        hiddenStyleEl.remove();
        hiddenStyleEl = null;
      }
      return;
    }
    if (!hiddenStyleEl) {
      hiddenStyleEl = document.createElement('style');
      hiddenStyleEl.id = 'avb-hidden-nodes';
      if (document.head) document.head.appendChild(hiddenStyleEl);
    }
    hiddenStyleEl.textContent = tokens
      .map((token) => `[${MARKER_ATTR}~="${token}"]`)
      .join(',\n') + ' { display: none !important; }';
  };

  // Selecting a node in the navigator brings it onto the page. Only scrolls
  // when the node is actually out of sight — re-selecting something already
  // on screen shouldn't move the page under the user.
  const SCROLL_MARGIN = 24;
  const scrollPathIntoView = (p) => {
    const rects = markerRegistry.rectsFor(activeScope, p);
    if (!rects || !rects.length) return;
    const r = rects[0]; // viewport-relative
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.y >= SCROLL_MARGIN && r.y + r.h <= vh - SCROLL_MARGIN) return;
    // Taller than the viewport (a full section) — align its top rather than
    // centering, which would push the start of it off-screen.
    const offset = r.h >= vh - SCROLL_MARGIN * 2 ? SCROLL_MARGIN : (vh - r.h) / 2;
    window.scrollTo({ top: Math.max(0, window.scrollY + r.y - offset), behavior: 'smooth' });
  };

  let rectsQueued = false;
  const queueRects = () => {
    if (rectsQueued) return;
    rectsQueued = true;
    requestAnimationFrame(() => {
      rectsQueued = false;
      sendRects();
    });
  };

  const startOutlines = () => {
    markerRegistry.collect();
    window.addEventListener('scroll', queueRects, true);
    window.addEventListener('resize', queueRects);
    new MutationObserver(queueRects).observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    document.addEventListener('mousemove', (e) => {
      const activeHit = markerRegistry.nodeAt(e.target, activeScope);
      const pageHit = markerRegistry.nodeAt(e.target, pageScope);
      const p = activeHit?.path ?? null;
      const pagePath = pageHit?.path ?? null;
      const occurrence = activeHit?.occurrence ?? 0;
      if (p !== lastHoverPath || pagePath !== lastHoverPagePath || occurrence !== lastHoverOcc) {
        lastHoverPath = p;
        lastHoverPagePath = pagePath;
        lastHoverOcc = occurrence;
        window.parent.postMessage(
          {
            type: 'avb:hover-node',
            scope: activeScope,
            path: p,
            pagePath,
            occurrence,
          },
          '*'
        );
      }
    });
    document.documentElement.addEventListener('mouseleave', () => {
      if (lastHoverPath !== null) {
        lastHoverPath = null;
        lastHoverPagePath = null;
        window.parent.postMessage(
          { type: 'avb:hover-node', scope: activeScope, path: null, pagePath: null, occurrence: 0 },
          '*'
        );
      }
    });
    // Double-clicking a component opens it for editing, the way Webflow
    // drills into one.
    document.addEventListener(
      'dblclick',
      (e) => {
        if (!designMode) return;
        e.preventDefault();
        e.stopPropagation();
        const activeHit = markerRegistry.nodeAt(e.target, activeScope);
        const pageHit = markerRegistry.nodeAt(e.target, pageScope);
        if (activeHit?.path) {
          window.parent.postMessage(
            {
              type: 'avb:open-node',
              scope: activeScope,
              path: activeHit.path,
              pagePath: pageHit?.path ?? null,
              occurrence: activeHit.occurrence,
            },
            '*'
          );
        }
      },
      true
    );

    // In the design canvas (any frame the app tracks paths in), clicking
    // selects the node in the app instead of activating links/buttons.
    // Interactive preview frames never receive avb:track, so they keep
    // normal page behavior.
    document.addEventListener(
      'click',
      (e) => {
        if (!designMode) return;
        e.preventDefault();
        e.stopPropagation();
        // A click that hits no marked node still reports (path null) — the
        // app uses empty clicks to back out of component editing.
        const activeHit = markerRegistry.nodeAt(e.target, activeScope);
        const pageHit = markerRegistry.nodeAt(e.target, pageScope);
        window.parent.postMessage(
          {
            type: 'avb:click-node',
            scope: activeScope,
            path: activeHit?.path ?? null,
            pagePath: pageHit?.path ?? null,
            occurrence: activeHit?.occurrence ?? 0,
          },
          '*'
        );
      },
      true
    );
  };

  let designMode = false;

  let frozen = false;
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const d = e.data;
    if (d?.type === 'avb:track' && Array.isArray(d.paths)) {
      designMode = true;
      activeScope = typeof d.activeScope === 'string' ? d.activeScope : '';
      pageScope = typeof d.pageScope === 'string' ? d.pageScope : activeScope;
      trackedPaths = d.paths;
      focusPath = typeof d.focusPath === 'string' ? d.focusPath : null;
      hiddenPaths = Array.isArray(d.hiddenPaths) ? d.hiddenPaths : [];
      updateHiddenStyles();
      sendRects();
    }
    if (d?.type === 'avb:scroll-to' && typeof d.path === 'string') {
      scrollPathIntoView(d.path);
    }
    if (d?.type === 'avb:set-vh' && typeof d.px === 'number') {
      document.documentElement.style.setProperty('--avb-vh', d.px / 100 + 'px');
      if (!frozen) {
        frozen = true;
        rewriteSheets();
        // Vite HMR injects/replaces <style> tags — keep the override current
        // (and last in the cascade).
        new MutationObserver(scheduleRewrite).observe(document.head || document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
      report();
    }
  });

  const start = () => {
    report();
    startOutlines();
    // Tell the app which route this frame is on (used by interactive
    // preview mode to follow link navigation).
    try {
      window.parent.postMessage(
        { type: 'avb:navigated', path: location.pathname + location.search },
        '*'
      );
    } catch {
      /* ignore */
    }
    try {
      const ro = new ResizeObserver(report);
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {
      /* old engines: load event still reports */
    }
    window.addEventListener('load', report);
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  return;
}

const invoke = (channel) => (payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('avb', {
  // Project
  openProjectDialog: invoke('project:openDialog'),
  newProjectDialog: invoke('project:newDialog'),
  scaffoldProject: invoke('project:scaffold'),
  createAstroProject: invoke('project:createAstro'),
  hasNodeModules: invoke('project:hasNodeModules'),
  installDeps: invoke('project:install'),
  scanProject: invoke('project:scan'),
  listProjectClasses: invoke('project:classes'),
  watchProject: invoke('watch:start'),

  // Embedded project terminal
  startTerminal: invoke('terminal:start'),
  restartTerminal: invoke('terminal:restart'),
  disposeTerminal: invoke('terminal:dispose'),
  writeTerminal: (payload) => ipcRenderer.send('terminal:input', payload),
  resizeTerminal: (payload) => ipcRenderer.send('terminal:resize', payload),
  onTerminalData: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
  onTerminalError: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('terminal:error', listener);
    return () => ipcRenderer.removeListener('terminal:error', listener);
  },

  // Terminal context chips
  listContextFiles: invoke('context:listFiles'),
  readContextFile: invoke('context:readFile'),
  serializeNode: invoke('context:serializeNode'),
  writeContextBundle: invoke('context:writeContextBundle'),
  getGitDiff: invoke('context:gitDiff'),
  capturePreview: invoke('context:capturePreview'),

  // Assets (public/)
  listAssets: invoke('assets:list'),
  pickUploadAssets: invoke('assets:pickUpload'),
  uploadAssets: invoke('assets:upload'),
  moveAsset: invoke('assets:move'),
  renameAsset: invoke('assets:rename'),
  mkdirAssets: invoke('assets:mkdir'),
  readAssetText: invoke('assets:readText'),
  writeAssetText: invoke('assets:writeText'),
  // OS drag-and-drop: resolve a DOM File to its filesystem path.
  getFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file?.path || null;
    }
  },
  onAssetsChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('assets:changed', listener);
    return () => ipcRenderer.removeListener('assets:changed', listener);
  },

  // CMS (JSON data under src/)
  listCms: invoke('cms:list'),
  readCms: invoke('cms:read'),
  writeCms: invoke('cms:write'),
  createCms: invoke('cms:create'),
  deleteCms: invoke('cms:delete'),
  cmsUsage: invoke('cms:usage'),
  cmsMeta: invoke('cms:meta'),
  setCmsMeta: invoke('cms:setMeta'),
  onCmsChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('cms:changed', listener);
    return () => ipcRenderer.removeListener('cms:changed', listener);
  },

  // Recent projects
  listRecents: invoke('recents:list'),
  addRecent: invoke('recents:add'),
  removeRecent: invoke('recents:remove'),
  captureThumb: invoke('recents:captureThumb'),

  // Pages
  readPage: invoke('page:read'),
  writePage: invoke('page:write'),
  writePageRaw: invoke('page:writeRaw'),
  createPage: invoke('page:create'),
  deletePage: invoke('page:delete'),
  movePage: invoke('page:move'),
  createPageFolder: invoke('pagefolder:create'),
  renamePageFolder: invoke('pagefolder:rename'),
  deletePageFolder: invoke('pagefolder:delete'),
  importPathFor: invoke('page:importPathFor'),

  // Dev server
  startDevServer: invoke('dev:start'),
  stopDevServer: invoke('dev:stop'),
  diagnoseDev: invoke('dev:diagnose'),

  // Style panel targets
  listStyleFiles: invoke('style:listFiles'),
  readStyleFile: invoke('style:readFile'),
  writeStyleFile: invoke('style:writeFile'),

  // Git
  gitInfo: invoke('git:info'),
  ghStatus: invoke('git:ghStatus'),
  gitInit: invoke('git:init'),
  gitCheckout: invoke('git:checkout'),
  gitCommit: invoke('git:commit'),
  gitPush: invoke('git:push'),
  gitPublish: invoke('git:publish'),

  openExternal: invoke('shell:openExternal'),

  // Events
  onDevLog: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('dev:log', listener);
    return () => ipcRenderer.removeListener('dev:log', listener);
  },
  onDevExit: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('dev:exit', listener);
    return () => ipcRenderer.removeListener('dev:exit', listener);
  },
  onProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },
  // Live output from `npm create astro@latest`, shown in the new-project wizard.
  onCreateLog: (cb) => {
    const listener = (_e, chunk) => cb(chunk);
    ipcRenderer.on('create:log', listener);
    return () => ipcRenderer.removeListener('create:log', listener);
  },
  onFsChanged: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('fs:changed', listener);
    return () => ipcRenderer.removeListener('fs:changed', listener);
  },

  // Application menu events (macOS menu accelerators never reach the DOM)
  onMenu: (channel, cb) => {
    const listener = () => cb();
    ipcRenderer.on(`menu:${channel}`, listener);
    return () => ipcRenderer.removeListener(`menu:${channel}`, listener);
  },
  nativeCopy: invoke('native:copy'),
  nativePaste: invoke('native:paste'),
});
