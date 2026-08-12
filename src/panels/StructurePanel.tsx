import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import { canContainTag } from '../elementSchemas.js';
import { isDataBound } from '../bindings.js';
import { setDrag, clearDrag, getDrag } from '../dragState.js';
import {
  LayoutIcon,
  ElementComponentIcon,
  TextIcon,
  CommentIcon,
  CodeIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  DragIcon,
  FileIcon,
  RepeatIcon,
  ExpandVerticalIcon,
  CollapseVerticalIcon,
  elementIcon,
  CustomElementIcon,
} from '../ui/Icons.jsx';
import { useAppStore } from '../store';
import { selectCurrentLayoutName } from '../store/selectors';
import type { AstroNode } from '../types/ast';

interface StructurePanelProps {
  onSelect?: (id: string | null) => void;
  onHoverNode?: (id: string | null) => void;
  onOpenComponent?: (name: string, id: string) => void;
  onChangeLayout?: (layoutName: string) => void;
  onDropComponent?: (name: string, target: any) => void;
  onMoveNode?: (nodeId: string, target: any) => void;
  onRemoveNode?: (nodeId: string) => void;
  onCopyNode?: (nodeId: string) => void;
  onDuplicateNode?: (nodeId: string) => void;
  onPasteNode?: () => void;
  hasClipboard?: () => boolean;
  onRawChange?: (value: string) => void;
}

interface DropTarget {
  parentId: string | null;
  index: number;
  intoId?: string;
}

interface CtxMenuState {
  x: number;
  y: number;
  nodeId: string;
}

interface NodeListCtx {
  selectedId: string | null;
  currentLayoutName: string;
  onChangeLayout?: (layoutName: string) => void;
  onHoverNode?: (id: string | null) => void;
  onOpenComponent?: (name: string, id: string) => void;
  isCollapsed: (node: AstroNode) => boolean;
  dropTarget: DropTarget | null;
  setDropTarget: (t: DropTarget | null) => void;
  isDndPayload: (e: React.DragEvent) => boolean;
  performDrop: (e: React.DragEvent, target: DropTarget) => void;
  nodeById: (id: string) => AstroNode | null;
  onSelect: (id: string) => void;
  onRemoveNode?: (nodeId: string) => void;
  toggleCollapse: (node: AstroNode) => void;
  openContextMenu: (x: number, y: number, nodeId: string) => void;
}

interface FoundNode {
  node: AstroNode;
  parent: AstroNode | null;
  siblings: AstroNode[];
  index: number;
}

// The page structure tree: layout wrapper + nested nodes (components,
// elements, text, comments). Supports:
//  - dropping palette items (avb/component) on gaps (sibling insert) or
//    directly on a node row (append as child)
//  - reordering/reparenting existing nodes (avb/node) the same way
//  - collapse/expand for nodes with children
export default function StructurePanel({
  onSelect,
  onHoverNode,
  onOpenComponent,
  onChangeLayout,
  onDropComponent,
  onMoveNode,
  onRemoveNode,
  onCopyNode,
  onDuplicateNode,
  onPasteNode,
  hasClipboard,
  onRawChange,
}: StructurePanelProps) {
  const pageState = useAppStore((s) => s.pageState);
  const selectedId = useAppStore((s) => s.selectedId);
  const revealTick = useAppStore((s) => s.revealTick);
  const currentLayoutName = useAppStore(selectCurrentLayoutName);
  const t = useT();
  // dropTarget: {parentId, index} for gaps, {intoId} for node rows
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Manual expand/collapse overrides by node id; nodes not in the map use
  // their default (text-only children start collapsed).
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map());
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  // Expand-all / collapse-all toggle in the header, with a delayed tooltip.
  const [allExpanded, setAllExpanded] = useState(false);
  const [headerTip, setHeaderTip] = useState<{ left: number; top: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(tipTimer.current!), []);

  const showTipSoon = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    clearTimeout(tipTimer.current!);
    tipTimer.current = setTimeout(
      () => setHeaderTip({ left: rect.left + rect.width / 2, top: rect.bottom + 8 }),
      500
    );
  };
  const hideTip = () => {
    clearTimeout(tipTimer.current!);
    setHeaderTip(null);
  };

  useEffect(() => {
    if (!pageState?.editable || !selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      ) {
        return;
      }
      const found = findWithParent(pageState.model.nodes, selectedId, null);
      if (!found) return;
      e.preventDefault();
      const { node, parent, siblings, index } = found;
      let next: AstroNode | null = null;
      if (e.key === 'ArrowLeft') next = siblings[index - 1] ?? null;
      else if (e.key === 'ArrowRight') next = siblings[index + 1] ?? null;
      else if (e.key === 'ArrowUp') next = parent;
      else if (
        e.key === 'ArrowDown' &&
        Array.isArray(node.children) &&
        node.children.length > 0 &&
        !node.children.every(isContentOnlyChild)
      ) {
        const collapsed = toggled.has(node.id) ? toggled.get(node.id)! : defaultCollapsed(node);
        if (collapsed) setToggled((prev) => new Map(prev).set(node.id, false));
        next = node.children[0];
      }
      if (next) onSelect?.(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageState, selectedId, toggled, onSelect]);

  useEffect(() => {
    if (!pageState?.editable || !selectedId || selectedId === 'frontmatter') return;
    const chain: AstroNode[] = [];
    const walk = (list: AstroNode[], trail: AstroNode[]): boolean => {
      for (const n of list) {
        if (n.id === selectedId) {
          chain.push(...trail);
          return true;
        }
        if (Array.isArray(n.children) && walk(n.children, [...trail, n])) return true;
      }
      return false;
    };
    walk(pageState.model.nodes, []);
    if (!chain.length) return;
    setToggled((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const a of chain) {
        const collapsed = next.has(a.id) ? next.get(a.id)! : defaultCollapsed(a);
        if (collapsed) {
          next.set(a.id, false);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pageState, selectedId]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastReveal = useRef(revealTick);
  useEffect(() => {
    if (revealTick === lastReveal.current) return;
    lastReveal.current = revealTick;
    if (!selectedId) return;
    const frame = requestAnimationFrame(() => {
      const body = bodyRef.current;
      const row = body?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
      if (!row || !body) return;
      const b = body.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      if (r.top >= b.top && r.bottom <= b.bottom) return;
      body.scrollTop += r.top - b.top - (b.height - r.height) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [revealTick, selectedId]);

  if (!pageState) {
    return (
      <div className="panel-section grow">
        <div className="panel-header">
          <h2>{t('structurePanel.heading')}</h2>
        </div>
        <div className="props-empty">{t('structurePanel.empty')}</div>
      </div>
    );
  }

  if (!pageState.editable) {
    return (
      <div className="panel-section grow">
        <div className="panel-header">
          <h2>{t('structurePanel.code')}</h2>
        </div>
        <div className="code-editor">
          <div className="code-note">
            {pageState.reason || t('structurePanel.notEditableReason')}{' '}
            {t('structurePanel.editSourceHint')}
          </div>
          <textarea
            spellCheck={false}
            value={pageState.source}
            onChange={(e) => onRawChange?.(e.target.value)}
          />
        </div>
      </div>
    );
  }

  const { model } = pageState;

  const clearDrop = () => setDropTarget(null);

  const isDndPayload = (e: React.DragEvent) =>
    e.dataTransfer.types.includes('avb/component') || e.dataTransfer.types.includes('avb/node');

  const performDrop = (e: React.DragEvent, target: DropTarget) => {
    e.preventDefault();
    e.stopPropagation();
    clearDrop();
    const compName = e.dataTransfer.getData('avb/component');
    const nodeId = e.dataTransfer.getData('avb/node');
    if (compName) onDropComponent?.(compName, target);
    else if (nodeId) onMoveNode?.(nodeId, target);
  };

  const isCollapsed = (node: AstroNode) =>
    toggled.has(node.id) ? toggled.get(node.id)! : defaultCollapsed(node);

  const toggleCollapse = (node: AstroNode) =>
    setToggled((prev) => new Map(prev).set(node.id, !isCollapsed(node)));

  const toggleAll = () => {
    const collapsed = allExpanded;
    const map = new Map<string, boolean>();
    const walk = (list: AstroNode[]) =>
      list.forEach((n) => {
        if (Array.isArray(n.children) && n.children.length > 0) {
          map.set(n.id, collapsed);
          walk(n.children);
        }
      });
    walk(model.nodes);
    setToggled(map);
    setAllExpanded(!allExpanded);
  };

  return (
    <div className="panel-section grow">
      <div className="panel-header">
        <h2>{t('structurePanel.heading')}</h2>
        <button
          className="ghost"
          onMouseEnter={showTipSoon}
          onMouseLeave={hideTip}
          onClick={() => {
            hideTip();
            toggleAll();
          }}
        >
          {allExpanded ? <CollapseVerticalIcon size={14} /> : <ExpandVerticalIcon size={14} />}
        </button>
      </div>
      {headerTip && (
        <div className="rail-tooltip below" style={{ left: headerTip.left, top: headerTip.top }}>
          {allExpanded ? t('structurePanel.collapseAll') : t('structurePanel.expandAll')}
        </div>
      )}

      <div className="panel-body" ref={bodyRef} onDragLeave={clearDrop}>
        <div
          className={`structure-node frontmatter-node ${selectedId === 'frontmatter' ? 'selected' : ''}`}
          style={{ paddingLeft: 6 }}
          onClick={() => onSelect?.('frontmatter')}
        >
          <span className="drag-handle" style={{ visibility: 'hidden' }}>
            <DragIcon size={11} />
          </span>
          <span className="icon">
            <CodeIcon size={12} />
          </span>
          <span className="label">{t('structurePanel.frontmatter')}</span>
          <span className="prop-preview">
            {t('structurePanel.imports', {
              count: (model.imports || []).length,
              plural: (model.imports || []).length === 1 ? '' : 's',
            })}
          </span>
        </div>

        <NodeList
          nodes={model.nodes}
          parentId={null}
          depth={0}
          selectedId={selectedId}
          currentLayoutName={currentLayoutName}
          onChangeLayout={onChangeLayout}
          onHoverNode={onHoverNode}
          onOpenComponent={onOpenComponent}
          isCollapsed={isCollapsed}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          isDndPayload={isDndPayload}
          performDrop={performDrop}
          nodeById={(id) => findNodeIn(model.nodes, id)}
          onSelect={(id: string) => onSelect?.(id)}
          onRemoveNode={onRemoveNode}
          toggleCollapse={toggleCollapse}
          openContextMenu={(x, y, nodeId) => {
            onSelect?.(nodeId);
            setCtxMenu({ x, y, nodeId });
          }}
        />

        {model.nodes.length === 0 && (
          <div
            className={`drop-zone-empty ${dropTarget?.parentId === null && dropTarget?.index === 0 ? 'over' : ''}`}
            onDragOver={(e) => {
              if (isDndPayload(e)) {
                e.preventDefault();
                setDropTarget({ parentId: null, index: 0 });
              }
            }}
            onDrop={(e) => performDrop(e, { parentId: null, index: 0 })}
          >
            {t('structurePanel.dragHere')}
          </div>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          pos={ctxMenu}
          canPaste={hasClipboard ? hasClipboard() : false}
          onClose={() => setCtxMenu(null)}
          onAction={(action) => {
            setCtxMenu(null);
            if (action === 'copy') onCopyNode?.(ctxMenu.nodeId);
            else if (action === 'duplicate') onDuplicateNode?.(ctxMenu.nodeId);
            else if (action === 'paste') onPasteNode?.();
            else if (action === 'delete') onRemoveNode?.(ctxMenu.nodeId);
          }}
        />
      )}
    </div>
  );
}

// Right-click menu for navigator nodes.
function ContextMenu({
  pos,
  canPaste,
  onClose,
  onAction,
}: {
  pos: CtxMenuState;
  canPaste: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = (e: Event) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const width = 200;
  const itemCount = 4;
  const height = itemCount * 26 + 18;
  const left = Math.min(pos.x, window.innerWidth - width - 8);
  const top = Math.min(pos.y, window.innerHeight - height - 8);

  const Item = ({
    action,
    label,
    shortcut,
    disabled,
  }: {
    action: string;
    label: string;
    shortcut?: string;
    disabled?: boolean;
  }) => (
    <div
      className={`ctx-menu-item ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onAction(action)}
    >
      <span>{label}</span>
      {shortcut && <span className="ctx-shortcut">{shortcut}</span>}
    </div>
  );

  return (
    <div ref={ref} className="ctx-menu" style={{ left, top, width }}>
      <Item action="copy" label={t('common.copy')} shortcut="⌘C" />
      <Item action="paste" label={t('common.paste')} shortcut="⌘V" disabled={!canPaste} />
      <Item action="duplicate" label={t('common.duplicate')} shortcut="⌘D" />
      <div className="ctx-divider" />
      <Item action="delete" label={t('common.delete')} shortcut="⌫" />
    </div>
  );
}

function NodeList({
  nodes,
  parentId,
  depth,
  ...ctx
}: {
  nodes: AstroNode[];
  parentId: string | null;
  depth: number;
} & NodeListCtx) {
  return (
    <>
      {nodes.map((node, i) => (
        <React.Fragment key={node.id}>
          <Gap parentId={parentId} index={i} depth={depth} {...ctx} />
          <TreeNode node={node} parentId={parentId} index={i} depth={depth} {...ctx} />
        </React.Fragment>
      ))}
      {nodes.length > 0 && <Gap parentId={parentId} index={nodes.length} depth={depth} {...ctx} />}
    </>
  );
}

function findNodeIn(nodes: AstroNode[], id: string): AstroNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (Array.isArray(n.children)) {
      const found = findNodeIn(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function acceptsDrag(parent: AstroNode | null) {
  const d = getDrag() as { tag?: string; nodeKind?: string } | null;
  if (!d || !d.tag || d.nodeKind !== 'element') return true;
  if (!parent || parent.kind !== 'element') return true;
  return canContainTag((parent as any).name, d.tag);
}

function Gap({
  parentId,
  index,
  depth,
  dropTarget,
  setDropTarget,
  isDndPayload,
  performDrop,
  nodeById,
}: {
  parentId: string | null;
  index: number;
  depth: number;
  dropTarget: DropTarget | null;
  setDropTarget: (t: DropTarget | null) => void;
  isDndPayload: (e: React.DragEvent) => boolean;
  performDrop: (e: React.DragEvent, target: DropTarget) => void;
  nodeById: (id: string) => AstroNode | null;
}) {
  const active =
    dropTarget && dropTarget.parentId === parentId && dropTarget.index === index && !dropTarget.intoId;
  const ok = acceptsDrag(parentId ? nodeById(parentId) : null);
  return (
    <div
      className="nav-gap"
      style={{ marginLeft: depth * 16 }}
      onDragOver={(e) => {
        if (ok && isDndPayload(e)) {
          e.preventDefault();
          e.stopPropagation();
          setDropTarget({ parentId, index });
        }
      }}
      onDrop={(e) => ok && performDrop(e, { parentId, index })}
    >
      {active && <div className="drop-indicator" />}
    </div>
  );
}

function TreeNode({
  node,
  parentId,
  index,
  depth,
  ...ctx
}: {
  node: AstroNode;
  parentId: string | null;
  index: number;
  depth: number;
} & NodeListCtx) {
  const {
    selectedId,
    currentLayoutName,
    isCollapsed,
    dropTarget,
    setDropTarget,
    isDndPayload,
    performDrop,
    onSelect,
    onHoverNode,
    onOpenComponent,
    toggleCollapse,
    openContextMenu,
  } = ctx;

  const isLayoutNode = node.id === 'layout';
  const isSelected = selectedId === node.id;

  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const showChildren = hasChildren && !(node.children as AstroNode[]).every(isContentOnlyChild);
  const canHostChildren =
    node.kind === 'component' ||
    node.kind === 'element' ||
    node.kind === 'chunk-group' ||
    node.kind === 'map';
  const nodeCollapsed = isCollapsed(node);
  const isDropInto = dropTarget?.intoId === node.id;

  let { icon, label } = describeNode(node);
  if (isLayoutNode) {
    icon = <LayoutIcon size={13} />;
    label = currentLayoutName || (node as any).name;
  }

  return (
    <>
      <div
        ref={rowRef}
        data-node-id={node.id}
        className={`structure-node ${node.kind === 'component' && !node.dynamicTag ? 'is-component' : ''} ${node.kind === 'map' || (isDataBound(node) && !(node.kind === 'component' && !node.dynamicTag)) ? 'is-map' : ''} ${isLayoutNode ? 'layout-node' : ''} ${isSelected ? 'selected' : ''}`}
        style={{
          paddingLeft: 6 + depth * 16,
          ...(isDropInto ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}),
        }}
        draggable={node.kind !== 'chunk-group'}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('avb/node', node.id);
          e.dataTransfer.effectAllowed = 'move';
          setDrag({ kind: 'node', id: node.id, nodeKind: node.kind, tag: node.name });
        }}
        onDragEnd={clearDrag}
        onDragOver={(e) => {
          if (canHostChildren && acceptsDrag(node) && isDndPayload(e)) {
            e.preventDefault();
            e.stopPropagation();
            setDropTarget({ parentId: null, index: 0, intoId: node.id });
          }
        }}
        onDrop={(e) => {
          if (canHostChildren && acceptsDrag(node)) {
            performDrop(e, {
              parentId: node.id,
              index: Array.isArray(node.children) ? node.children.length : 0,
            });
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onDoubleClick={(e) => {
          if (node.kind !== 'component' || node.dynamicTag || !onOpenComponent) return;
          e.stopPropagation();
          onOpenComponent(node.name, node.id);
        }}
        onMouseEnter={() => onHoverNode?.(node.id)}
        onMouseLeave={() => onHoverNode?.(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu(e.clientX, e.clientY, node.id);
        }}
      >
        {showChildren ? (
          <span
            className="drag-handle"
            style={{ cursor: 'pointer', opacity: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(node);
            }}
          >
            {nodeCollapsed ? <ChevronRightIcon size={10} /> : <ChevronDownIcon size={10} />}
          </span>
        ) : (
          <span className="drag-handle">
            <DragIcon size={11} />
          </span>
        )}
        <span className="icon">{icon}</span>
        <span className="label" style={node.kind === 'text' ? { fontWeight: 400, fontStyle: 'italic' } : {}}>
          {label}
        </span>
      </div>

      {showChildren && !nodeCollapsed && (
        <NodeList nodes={node.children as AstroNode[]} parentId={node.id} depth={depth + 1} {...ctx} />
      )}
    </>
  );
}

function isContentOnlyChild(c: AstroNode) {
  return (
    c.kind === 'text' ||
    (c.kind === 'expr' && /^\{[^{}]*\}$/.test(c.value ?? '') && !(c.value ?? '').includes('<'))
  );
}

function findWithParent(nodes: AstroNode[], id: string, parent: AstroNode | null): FoundNode | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return { node: n, parent, siblings: nodes, index: i };
    if (Array.isArray(n.children)) {
      const found = findWithParent(n.children, id, n);
      if (found) return found;
    }
  }
  return null;
}

function defaultCollapsed(node: AstroNode) {
  return Array.isArray(node.children) && node.children.length > 0;
}

function describeNode(node: AstroNode): { icon: React.ReactNode; label: string } {
  switch (node.kind) {
    case 'text':
      return { icon: <TextIcon size={12} />, label: truncate(node.value ?? '', 34) };
    case 'comment':
      return { icon: <CommentIcon size={12} />, label: truncate((node.value ?? '').trim(), 30) };
    case 'raw':
      return { icon: <CodeIcon size={12} />, label: node.name ?? '' };
    case 'raw-line':
      return { icon: <CodeIcon size={12} />, label: truncate(node.value ?? '', 30) };
    case 'element': {
      const cls = node.props?.class;
      const classes =
        cls && cls.type === 'string' ? cls.value.trim().split(/\s+/).filter(Boolean) : [];
      const label = classes.length ? truncate(classes[0], 40) : node.name;
      return { icon: elementIcon(node.name), label };
    }
    case 'chunk-group':
      return { icon: <FileIcon size={12} />, label: node.name ?? '' };
    case 'expr':
      return {
        icon: <CodeIcon size={12} />,
        label: truncate((node.value ?? '').replace(/\s+/g, ' '), 34),
      };
    case 'map': {
      const at = node.head.indexOf('.map');
      return {
        icon: <RepeatIcon size={12} />,
        label: at > 0 ? node.head.slice(0, at + 4) : truncate(node.head, 24),
      };
    }
    default:
      if (node.dynamicTag) {
        return { icon: <CustomElementIcon size={12} />, label: node.name ?? '' };
      }
      return { icon: <ElementComponentIcon size={14} />, label: node.name ?? '' };
  }
}

function truncate(s: string, n: number) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}