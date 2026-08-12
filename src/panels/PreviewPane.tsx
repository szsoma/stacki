import React from 'react';
import CanvasView from './CanvasView.jsx';
import {
  DesktopIcon,
  TabletIcon,
  PhoneIcon,
  CanvasIcon,
  ChevronRightIcon,
  ElementComponentIcon,
  LayoutIcon,
  RepeatIcon,
  TextIcon,
  CommentIcon,
  CodeIcon,
  CustomElementIcon,
  elementIcon,
} from '../ui/Icons.jsx';
import { useAppStore } from '../store/index';
import { selectModel } from '../store/selectors';
import { pathOfNode } from '../model/nodes';

// The overlay label wears the same icon the Navigator row does, so a node
// looks the same wherever you meet it.
interface OutlineInfo {
  label: string;
  kind: string;
  tag: string | null;
  nodeKind: string;
  isLayout: boolean;
  bound: boolean;
}

function outlineIcon(info: OutlineInfo) {
  const size = 11;
  if (info.isLayout) return <LayoutIcon size={size} />;
  if (info.nodeKind === 'component') return <ElementComponentIcon size={size} />;
  switch (info.nodeKind) {
    case 'map':
      return <RepeatIcon size={size} />;
    case 'text':
      return <TextIcon size={size} />;
    case 'comment':
      return <CommentIcon size={size} />;
    case 'expr':
    case 'raw':
      return <CodeIcon size={size} />;
    default:
      return info.tag ? elementIcon(info.tag, size) : <CustomElementIcon size={size} />;
  }
}

interface DeviceInfo {
  key: string;
  Icon: React.ComponentType<{ size: number }>;
  title: string;
  width: number | null;
}

export interface PreviewNodeHit {
  scope: string | null;
  path: string | null;
  pagePath: string | null;
  occurrence: number;
}

interface PreviewRect { x: number; y: number; w: number; h: number }

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isPreviewRect = (value: unknown): value is PreviewRect => {
  if (!value || typeof value !== 'object') return false;
  const rect = value as Record<string, unknown>;
  return ['x', 'y', 'w', 'h'].every((key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]));
};
const isPreviewRectArray = (value: unknown): value is PreviewRect[] =>
  Array.isArray(value) && value.every(isPreviewRect);
const parseRectRecord = (value: unknown): Record<string, PreviewRect[]> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, rects]) => rects === null || isPreviewRectArray(rects))) return null;
  return Object.fromEntries(entries.map(([path, rects]) => [path, rects ?? []]));
};
const parseNodeHit = (value: Record<string, unknown>): PreviewNodeHit | null => {
  const occurrence = value.occurrence;
  if (!isNullableString(value.scope) || !isNullableString(value.path) ||
      !isNullableString(value.pagePath) || typeof occurrence !== 'number' ||
      !Number.isFinite(occurrence) || occurrence < 0 || !Number.isInteger(occurrence)) return null;
  return { scope: value.scope, path: value.path, pagePath: value.pagePath, occurrence };
};

// Desktop fills the canvas (width: null = fill).
const DEVICES: DeviceInfo[] = [
  { key: 'desktop', Icon: DesktopIcon, title: 'Desktop — 1', width: null },
  { key: 'tablet', Icon: TabletIcon, title: 'Tablet (768px) — 2', width: 768 },
  { key: 'phone', Icon: PhoneIcon, title: 'Phone (375px) — 3', width: 375 },
  { key: 'canvas', Icon: CanvasIcon, title: 'Canvas — all breakpoints — 4', width: null },
];

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

interface PreviewPaneProps {
  route?: string | null;
  refreshKey?: number;
  crumbs?: { id: string | null; label: string }[];
  onCrumb?: (id: string | null) => void;
  onRefresh?: () => void;
  onRestart?: () => void;
  selPath?: string | null;
  navHoverPath?: string | null;
  activeScope?: string | null;
  pageScope?: string | null;
  overlayInfo?: (p: string) => OutlineInfo | null;
  onSelectNode?: (hit: PreviewNodeHit) => void;
  onOpenNode?: (hit: PreviewNodeHit) => void;
  focusPath?: string | null;
  device?: string;
  onDevice?: (d: string) => void;
  onFrameMounted?: (ref: HTMLDivElement) => void;
}

export default function PreviewPane({
  route,
  crumbs,
  onCrumb,
  onRefresh,
  onRestart,
  selPath,
  navHoverPath,
  activeScope,
  pageScope,
  overlayInfo,
  onSelectNode,
  onOpenNode,
  focusPath,
  onDevice,
  onFrameMounted,
}: PreviewPaneProps) {
  const devUrl = useAppStore((s) => s.devUrl);
  const devStatus = useAppStore((s) => s.devStatus);
  const devLog = useAppStore((s) => s.devLog);
  const devDiag = useAppStore((s) => s.devDiag);
  const refreshKey = useAppStore((s) => s.refreshKey);
  // The breakpoint lives on the store so a re-mount of this pane can't
  // silently kick the user out of a view (which would reload every preview
  // iframe).
  const device = useAppStore((s) => s.device);

  const [customW, setCustomW] = React.useState<number | null>(null); // drag override
  const [customH, setCustomH] = React.useState<number | null>(null); // null = fill height
  const [resizing, setResizing] = React.useState(false);
  const url = devUrl && route ? devUrl + route : null;
  const previewOrigin = React.useMemo(() => {
    if (!url) return null;
    try { return new URL(url).origin; } catch { return null; }
  }, [url]);
  const width = customW ?? DEVICES.find((d) => d.key === device)?.width;

  // Deep trees produce long ancestor chains; showing every crumb shrinks them
  // all to unreadable stubs. Keep the page plus the last few levels and fold
  // the middle into a "…" that expands (and re-folds on the next selection).
  const CRUMB_HEAD = 1;
  const CRUMB_TAIL = 3;
  const [crumbsExpanded, setCrumbsExpanded] = React.useState(false);
  const crumbKey = (crumbs || []).map((c) => c.id).join('/');
  React.useEffect(() => setCrumbsExpanded(false), [crumbKey]);
  const shownCrumbs = React.useMemo(() => {
    const all = crumbs || [];
    if (crumbsExpanded || all.length <= CRUMB_HEAD + CRUMB_TAIL + 1) return all;
    return [
      ...all.slice(0, CRUMB_HEAD),
      { ellipsis: true, hidden: all.slice(CRUMB_HEAD, all.length - CRUMB_TAIL) },
      ...all.slice(all.length - CRUMB_TAIL),
    ];
  }, [crumbs, crumbsExpanded]);

  // Node outlines: the preview iframe reports rects for tracked node paths
  // (and the node hovered on the page); outlines render as an absolute
  // overlay in the frame, never inside the page itself.
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [rects, setRects] = React.useState<Record<string, Array<{ x: number; y: number; w: number; h: number }>>>({});
  const [focusRects, setFocusRects] = React.useState<Array<{ x: number; y: number; w: number; h: number }>>([]);
  const [canvasHover, setCanvasHover] = React.useState<string | null>(null);

  const clickedPathRef = React.useRef<{ scope: string | null; path: string | null } | null>(null);
  const lastClickRef = React.useRef<{ scope: string | null; path: string | null; occ: number } | null>(null);
  const [selOcc, setSelOcc] = React.useState(0);
  const [hoverOcc, setHoverOcc] = React.useState(0);

  React.useEffect(() => {
    const lastClick = lastClickRef.current;
    if (lastClick && lastClick.scope === activeScope && lastClick.path === selPath) {
      lastClickRef.current = null;
      return;
    }
    lastClickRef.current = null;
    setSelOcc(0);
  }, [selPath, activeScope]);

  React.useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!iframeRef.current || !previewOrigin || e.source !== iframeRef.current.contentWindow || e.origin !== previewOrigin) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'avb:rects') {
        const nextRects = parseRectRecord(d.rects);
        if (!nextRects || !(d.focusRects === null || isPreviewRectArray(d.focusRects))) return;
        setRects(nextRects);
        setFocusRects(d.focusRects ?? []);
      }
      else if (d.type === 'avb:hover-node') {
        const hit = parseNodeHit(d);
        if (!hit || hit.scope !== activeScope) {
          setCanvasHover(null);
          setHoverOcc(0);
        } else {
          setCanvasHover(hit.path);
          setHoverOcc(hit.occurrence);
        }
      } else if (d.type === 'avb:click-node' && onSelectNode) {
        const hit = parseNodeHit(d);
        if (!hit) return;
        clickedPathRef.current = { scope: hit.scope, path: hit.path };
        lastClickRef.current = { scope: hit.scope, path: hit.path, occ: hit.occurrence };
        setSelOcc(hit.occurrence);
        onSelectNode(hit);
      } else if (d.type === 'avb:open-node' && onOpenNode) {
        const hit = parseNodeHit(d);
        if (hit) onOpenNode(hit);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [activeScope, previewOrigin, onSelectNode, onOpenNode]);

  const hoverPath = navHoverPath || canvasHover;
  const hoverOccUsed = navHoverPath ? null : hoverOcc;

  const model = useAppStore(selectModel);
  const hiddenNodes = useAppStore((s) => s.hiddenNodes);
  const hiddenPaths = React.useMemo((): string[] => {
    if (!model || hiddenNodes.size === 0) return [];
    const paths: string[] = [];
    hiddenNodes.forEach((id) => {
      const trail = pathOfNode(model.nodes, id);
      if (trail) paths.push(trail.join('.'));
    });
    return paths;
  }, [model, hiddenNodes]);

  const trackKey = [...new Set([selPath, hoverPath].filter(Boolean))].join('|');
  const sendTrack = React.useCallback(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w || !previewOrigin) return;
    w.postMessage({
      type: 'avb:track',
      activeScope,
      pageScope,
      paths: trackKey ? trackKey.split('|') : [],
      focusPath,
      hiddenPaths,
    }, previewOrigin);
  }, [activeScope, pageScope, trackKey, focusPath, hiddenPaths, previewOrigin]);
  React.useEffect(sendTrack, [sendTrack, url, refreshKey]);

  React.useEffect(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w || !selPath || !previewOrigin) return;
    const clickedPath = clickedPathRef.current;
    if (clickedPath && clickedPath.scope === activeScope && clickedPath.path === selPath) {
      clickedPathRef.current = null;
      return;
    }
    w.postMessage({ type: 'avb:scroll-to', path: selPath }, previewOrigin);
  }, [selPath, activeScope, previewOrigin]);

  React.useEffect(() => {
    setRects({});
    setFocusRects([]);
    setCanvasHover(null);
    setHoverOcc(0);
    setSelOcc(0);
    clickedPathRef.current = null;
    lastClickRef.current = null;
  }, [url, refreshKey, activeScope]);

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (onFrameMounted) onFrameMounted(frameRef.current!);
  }, [onFrameMounted]);

  const [wrapWidth, setWrapWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWrapWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectDevice = (key: string) => onDevice && onDevice(key);

  React.useEffect(() => {
    if ((device as string) === 'custom') return;
    setCustomW(null);
    if (device === 'desktop' || device === 'canvas') setCustomH(null);
  }, [device]);

  const btnRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);
  React.useLayoutEffect(() => {
    const el = btnRefs.current[device];
    if (!el) {
      setIndicator(null);
      return;
    }
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [device]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      ) {
        return;
      }
      const key = ({ 1: 'desktop', 2: 'tablet', 3: 'phone', 4: 'canvas' } as Record<string, string>)[e.key];
      if (key) selectDevice(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = (edge: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    const frame = frameRef.current;
    const wrap = wrapRef.current;
    if (!frame || !wrap) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = frame.offsetWidth;
    const startH = frame.offsetHeight;
    setResizing(true);
    document.body.style.cursor = edge === 's' ? 'row-resize' : 'col-resize';
    const onMove = (ev: PointerEvent) => {
      if (edge === 's') {
        const h = Math.round(startH + (ev.clientY - startY));
        setCustomH(clamp(h, 160, Math.max(160, wrap.clientHeight - 32)));
      } else {
        const dx = ev.clientX - startX;
        const w = Math.round(startW + (edge === 'e' ? 2 : -2) * dx);
        setCustomW(clamp(w, 280, Math.max(280, wrap.clientWidth - 24)));
        onDevice && onDevice('custom');
      }
    };
    const onUp = () => {
      setResizing(false);
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <>
      <div className="preview-toolbar">
        <div className="crumbs">
          {shownCrumbs.map((c: any, i: number) => {
            const last = i === shownCrumbs.length - 1;
            if (c.ellipsis) {
              return (
                <React.Fragment key="ellipsis">
                  <span className="crumb-sep">
                    <ChevronRightIcon size={9} />
                  </span>
                  <span
                    className="crumb crumb-more"
                    title={`Show ${c.hidden.length} more: ${c.hidden
                      .map((h: { label: string }) => h.label)
                      .join(' › ')}`}
                    onClick={() => setCrumbsExpanded(true)}
                  >
                    …
                  </span>
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={`${c.id}-${i}`}>
                {i > 0 && (
                  <span className="crumb-sep">
                    <ChevronRightIcon size={9} />
                  </span>
                )}
                <span
                  className={`crumb ${last ? 'last' : ''}`}
                  title={c.label}
                  onClick={() => onCrumb && onCrumb(c.id)}
                >
                  {c.label}
                </span>
              </React.Fragment>
            );
          })}
        </div>
        <div className="device-btns">
          {indicator && <span className="device-indicator" style={indicator} />}
          {DEVICES.map(({ key, Icon, title }) => (
            <button
              key={key}
              ref={(el) => (btnRefs.current[key] = el)}
              className={device === key ? 'on' : ''}
              title={title}
              onClick={() => selectDevice(key)}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>

      <div className="preview-frame-wrap" ref={wrapRef}>
        {url && device === 'canvas' ? (
          <CanvasView url={url} refreshKey={refreshKey} />
        ) : url ? (
          <div
            ref={frameRef}
            className={`frame-sized ${width ? '' : 'full'} ${resizing ? 'resizing' : ''}`}
            style={{
              width: width ?? wrapWidth ?? '100%',
              maxWidth: width ? 'calc(100% - 24px)' : '100%',
              ...(customH != null ? { height: customH, bottom: 'auto' } : {}),
            }}
          >
            <div className="frame-clip">
              <iframe
                key={`${url}-${refreshKey}`}
                ref={iframeRef}
                src={`${url}#avb-design`}
                title="Site preview"
                onLoad={sendTrack}
              />
              {focusPath &&
                focusRects.map((r, i) => (
                  <div
                    key={`focus-${i}`}
                    className="node-focus"
                    style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  />
                ))}
              {[
                hoverPath && hoverPath !== selPath
                  ? { path: hoverPath, type: 'hover', occ: hoverOccUsed }
                  : null,
                selPath ? { path: selPath, type: 'sel', occ: selOcc } : null,
              ]
                .filter(Boolean)
                .flatMap((o) => {
                  const all = rects[o!.path];
                  const info = overlayInfo ? overlayInfo(o!.path) : null;
                  if (!all || !info) return [];
                  const list =
                    o!.occ == null ? all : all[o!.occ] ? [all[o!.occ]] : all.slice(0, 1);
                  return list.map((r, i) => (
                    <div
                      key={`${o!.type}-${i}`}
                      className={`node-outline ${o!.type} ${info.kind}${info.bound ? ' bound' : ''}`}
                      style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                    >
                      <span className={`node-outline-tag ${r.y < 20 ? 'inside' : ''}`}>
                        {outlineIcon(info)}
                        {info.label}
                      </span>
                    </div>
                  ));
                })}
            </div>
            <div className="rz-handle rz-w" onPointerDown={startResize('w')} />
            <div className="rz-handle rz-e" onPointerDown={startResize('e')} />
            <div className="rz-handle rz-s" onPointerDown={startResize('s')} />
            {resizing && (
              <div className="rz-readout">
                {Math.round(width ?? wrapWidth ?? 0)} × {customH ?? frameRef.current?.offsetHeight ?? ''}
              </div>
            )}
          </div>
        ) : (
          <div className="preview-placeholder">
            {devStatus === 'starting' ? (
              <>
                <div className="spinner" />
                <div>Starting Astro dev server…</div>
              </>
            ) : (
              <DevOffline devLog={devLog} devDiag={devDiag} onRestart={onRestart} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

const NODE_URL = 'https://nodejs.org/en/download';

interface DevOfflineProps {
  devLog: string;
  devDiag: any;
  onRestart?: () => void;
}

function DevOffline({ devLog, devDiag, onRestart }: DevOfflineProps) {
  const [showLog, setShowLog] = React.useState(false);
  const kind = devDiag?.kind;
  const known = kind === 'no-node' || kind === 'node-too-old' || kind === 'no-deps';

  let title: React.ReactNode = 'Preview is offline.';
  let detail: string | null = null;
  let action: { label: string; url: string } | null = null;

  if (kind === 'no-node') {
    title = "Node.js isn't installed — or isn't where this app can see it.";
    detail =
      'Astro needs Node.js to run. Stacki looks on the system path, your login ' +
      "shell's path, and the usual Homebrew, nvm, fnm, volta, asdf and mise " +
      'locations, and found nothing. Install Node, then start the server again.';
    action = { label: 'Get Node.js', url: NODE_URL };
  } else if (kind === 'node-too-old') {
    title = `Node ${devDiag.nodeVersion} is too old for this project.`;
    detail = `astro ${devDiag.astroVersion} needs Node ${devDiag.requires}. Install a newer Node — if you use a version manager, the one it picks in this project's folder is the one Stacki will use.`;
    action = { label: 'Get Node.js', url: NODE_URL };
  } else if (kind === 'no-deps') {
    title = "This project's dependencies aren't installed.";
    detail =
      'Astro was not found in node_modules. Starting the server installs them ' +
      'automatically — if that keeps failing, the log below has the reason.';
  }

  return (
    <>
      <div className={known ? 'offline-title' : undefined}>{title}</div>
      {detail && <p className="offline-detail">{detail}</p>}
      <div className="offline-actions">
        <button onClick={onRestart}>Start dev server</button>
        {action && (
          <button className="ghost" onClick={() => window.avb.openExternal(action.url)}>
            {action.label}
          </button>
        )}
      </div>
      {devDiag?.nodePath && (
        <div className="offline-meta">
          Using Node {devDiag.nodeVersion || '?'} — {devDiag.nodePath}
        </div>
      )}
      {devLog && (
        <>
          <button className="ghost offline-log-toggle" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Hide log' : 'Show log'}
          </button>
          {showLog && <pre className="offline-log">{devLog}</pre>}
        </>
      )}
    </>
  );
}
