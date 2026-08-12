import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import { HTML_TAGS, VOID_TAGS } from '../elementSchemas.js';
import { elementIcon } from '../ui/Icons.jsx';
import Dropdown from '../ui/Dropdown.jsx';
import AutoTextarea from '../ui/AutoTextarea.jsx';
import ClassInput from '../ui/ClassInput.jsx';
import StyleEditor, { collapseDeclarations } from '../ui/StyleEditor.jsx';
import ExprInput from '../ui/ExprInput.jsx';
import RichContent, { isInlineOnly } from '../ui/RichContent.jsx';
import AssetField from '../ui/AssetField.jsx';
import { looksLikeAssetPath, mediaKindFor } from '../ui/AssetThumb.jsx';
import { dataSuggestions, exprSuggestions } from '../dataSuggest.js';
import LinkField from '../ui/LinkField.jsx';
import {
  ResetIcon,
  FieldNumberIcon,
  ComponentPropertiesIcon,
  VariableTextSizeIcon,
  ElementComponentIcon,
  ElementSlotIcon,
  CommentIcon,
  CodeIcon,
  PlusIcon,
  TrashIcon,
  BracesIcon,
  TagIcon,
  ElementImageIcon,
} from '../ui/Icons.jsx';
import type { AstroNode, PropValue } from '../types/ast';
import type { PropField as PropFieldSpec } from '../types/ipc';
import type { LinkContext, LoopContext } from '../store/selectors';
import type { LoopRename } from '../model/loops';
import { useAppStore } from '../store/index';
import {
  selectSelectedNode,
  selectCurrentLayoutName,
  selectSelectedSchema,
  selectSlotOptions,
  selectAllowAttrs,
  selectLinkContext,
  selectLoopContext,
} from '../store/selectors';

interface PropsPanelProps {
  onChangeLayout?: (layoutName: string) => void;
  onSetProp?: (propName: string, value: any, immediate?: boolean) => void;
  onRenameProp?: (oldName: string, newName: string) => void;
  onChangeTag?: (tag: string) => void;
  onSetText?: (value: string, renames?: LoopRename[]) => void;
  onSetContent?: (value: string) => void;
  onSetInline?: (nodes: AstroNode[]) => void;
  onOpenCode?: () => void;
}

// Edits the props of the selected node. Fields come from the component's
// prop schema (interface Props / Astro.props destructure), plus any props
// already set on the node that aren't in the schema.
export default function PropsPanel({
  onChangeLayout,
  onSetProp,
  onRenameProp,
  onChangeTag,
  onSetText,
  onSetContent,
  onSetInline,
  onOpenCode,
}: PropsPanelProps) {
  const projectPath = useAppStore((s) => s.project?.path);
  const node = useAppStore(selectSelectedNode);
  const isLayout = useAppStore((s) => s.selectedId === 'layout');
  const layouts = useAppStore((s) => s.scan.layouts);
  const currentLayoutName = useAppStore(selectCurrentLayoutName);
  const schema = useAppStore(selectSelectedSchema);
  const slotOptions = useAppStore(selectSlotOptions);
  const projectClasses = useAppStore((s) => s.projectClasses);
  const allowAttrs = useAppStore(selectAllowAttrs);
  const linkContext = useAppStore(selectLinkContext);
  const loopContext = useAppStore(selectLoopContext);
  const t = useT();

  if (!node) {
    return (
      <div className="panel-section grow" style={{ flex: '1 1 50%' }}>
        <div className="panel-header">
          <h2>{t('propsPanel.settings')}</h2>
        </div>
        <div className="props-empty">{t('propsPanel.empty')}</div>
      </div>
    );
  }

  // The page frontmatter (imports, consts, data) opens in a floating editor.
  if (node.kind === 'frontmatter') {
    return (
      <div className="panel-section grow" style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <div className="props-title">
          <CodeIcon size={14} className="props-title-icon" />
          {t('propsPanel.frontmatter')}
        </div>
        <div className="props-field" style={{ marginTop: 4 }}>
          <button className="primary" style={{ width: '100%' }} onClick={onOpenCode}>
            <CodeIcon size={13} /> {t('propsPanel.editCode')}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
            {t('propsPanel.frontmatterDesc')}
          </div>
        </div>
      </div>
    );
  }

  // Expression nodes ({items.map(...)}) get a raw code editor.
  if (node.kind === 'expr') {
    return (
      <div className="panel-section grow" style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <div className="panel-header">
          <h2>{t('propsPanel.expression')}</h2>
        </div>
        <div className="props-field" style={{ marginTop: 8 }}>
          <label>
            <span className="prop-label">{t('propsPanel.code')}</span>
          </label>
          <ExprInput
            key={node.id}
            value={node.value}
            syncValue={node.value}
            onCommit={(v) => v !== node.value && onSetText?.(v)}
          />
        </div>
      </div>
    );
  }

  // Map/loop nodes: friendly Data/Item/Index fields when the head fits the
  // simple `data.map((item[, index]) => (` shape; raw code otherwise.
  if (node.kind === 'map') {
    return (
      <div className="panel-section grow" style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <div className="panel-header">
          <h2>{t('propsPanel.loop')}</h2>
        </div>
        <MapEditor key={node.id} node={node} loopContext={loopContext} onSetText={onSetText} />
      </div>
    );
  }

  // Comment nodes get a single text editor.
  if (node.kind === 'comment') {
    return (
      <div className="panel-section grow" style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <div className="panel-header">
          <h2>{t('propsPanel.comment')}</h2>
        </div>
        <div className="props-field" style={{ marginTop: 8 }}>
          <label>
            <span className="prop-label">
              <CommentIcon size={12} className="prop-label-icon" />
              {t('propsPanel.comment')}
            </span>
          </label>
          <AutoTextarea
            minRows={3}
            value={node.value}
            onChange={(e) => onSetText?.(e.target.value)}
          />
        </div>
      </div>
    );
  }

  // <style>/<script> nodes get their content in a CodeMirror editor, with
  // any attributes (is:global, type, …) editable above it.
  if (node.kind === 'raw') {
    const language = node.name === 'style' ? 'css' : 'javascript';
    const attrs = Object.keys(node.props || {});
    return (
      <div className="panel-section grow" style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <div className="props-title">
          <CodeIcon size={14} className="props-title-icon" />
          {`<${node.name}>`}
        </div>
        {attrs.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            {attrs.map((name) => (
              <PropField
                key={name}
                field={{ name, type: 'other' }}
                value={node.props[name]}
                onChange={(v, immediate) => onSetProp?.(name, v, immediate)}
              />
            ))}
          </div>
        )}
        <div className="props-field" style={{ marginTop: 4 }}>
          <button className="primary" style={{ width: '100%' }} onClick={onOpenCode}>
            <CodeIcon size={13} /> {t('propsPanel.editCode')}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
            {t('propsPanel.codeEditorDesc', { language })}
          </div>
        </div>
      </div>
    );
  }

  // Text nodes get a single content editor.
  if (node.kind === 'text') {
    return (
      <div className="panel-section grow" style={{ flex: '1 1 50%', overflow: 'hidden' }}>
        <div className="panel-header">
          <h2>{t('propsPanel.text')}</h2>
        </div>
        <div className="props-field" style={{ marginTop: 8 }}>
          <label>
            <span className="prop-label">
              <VariableTextSizeIcon size={12} className="prop-label-icon" />
              {t('propsPanel.content')}
            </span>
          </label>
          <AutoTextarea
            minRows={3}
            value={node.value}
            onChange={(e) => onSetText?.(e.target.value)}
          />
        </div>
      </div>
    );
  }

  const schemaNames = new Set(schema.map((s) => s.name));

  // The slot field renders in one stable spot whether or not the attribute
  // is currently set — hover-previewing a value must not remount the field
  // (that would close the dropdown mid-hover).
  const showSlotField =
    Array.isArray(slotOptions) &&
    slotOptions.some((s) => s !== 'default') &&
    !schemaNames.has('slot');
  let extraProps = Object.keys(node.props || {}).filter(
    (k) => !schemaNames.has(k) && !(showSlotField && k === 'slot')
  );
  // With a free-form Attributes section, unknown attrs live there instead of
  // as individual fields — except class, which keeps its dedicated field.
  let attrNames: string[] = [];
  if (allowAttrs) {
    attrNames = extraProps.filter((k) => k !== 'class' && k !== 'slot');
    extraProps = extraProps.filter((k) => k === 'class' || k === 'slot');
  }

  const isEmpty = !Array.isArray(node.children) || node.children.length === 0;
  const canHoldText =
    node.kind === 'element' && !VOID_TAGS.has(String(node.name).toLowerCase());
  const showContentField = isInlineOnly(node.children) || (isEmpty && canHoldText);
  const isSlot = node.kind === 'element' && node.name === 'slot';

  return (
    <div className="panel-section grow" style={{ flex: '1 1 50%', overflow: 'hidden' }}>
      <div className="props-title">
        {node.kind === 'element' ? (
          elementIcon(node.name, 16, 'props-title-icon')
        ) : (
          <ElementComponentIcon size={16} className="props-title-icon" />
        )}
        {isLayout ? currentLayoutName || node.name : node.name}
        {isLayout && <span className="badge">{t('propsPanel.layoutBadge')}</span>}
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {node.kind === 'element' && onChangeTag && (
          <TagField key={node.id} tag={node.name} onChangeTag={onChangeTag} />
        )}
        {isLayout && Array.isArray(layouts) && layouts.length > 0 && (
          <div className="props-field">
            <label>
              <span className="prop-label">
                <ComponentPropertiesIcon size={12} className="prop-label-icon" />
                {t('propsPanel.layout')}
              </span>
            </label>
            <Dropdown
              value={currentLayoutName}
              className=""
              placeholder=""
              options={[
                ...(currentLayoutName && !layouts.some((l) => l.name === currentLayoutName)
                  ? [{ value: currentLayoutName, label: currentLayoutName }]
                  : []),
                ...layouts.map((l) => ({ value: l.name, label: l.name })),
              ]}
              onChange={(v) => onChangeLayout?.(v)}
            />
          </div>
        )}
        {showContentField && (
          <div className="props-field">
            <label>
              <span className="prop-label">
                <VariableTextSizeIcon size={12} className="prop-label-icon" />
                {isSlot ? t('propsPanel.fallback') : t('propsPanel.content')}
              </span>
            </label>
            <RichContent
            key={node.id}
            nodes={node.children ?? []}
            exprOptions={exprSuggestions(loopContext || {})}
            onChange={onSetInline}
          />
            {isSlot && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.5 }}>
                {t('propsPanel.slotFallbackHint')}
              </div>
            )}
          </div>
        )}
        {schema.map((field) => (
          <PropField
            key={field.name}
            field={field}
            value={node.props?.[field.name]}
            slotOptions={slotOptions}
            projectClasses={projectClasses}
            assetCtx={{ projectPath, nodeName: node.name }}
            linkContext={linkContext}
            onChange={(v, immediate) => onSetProp?.(field.name, v, immediate)}
          />
        ))}
        {extraProps.map((name) => (
          <PropField
            key={name}
            field={{ name, type: 'other' }}
            value={node.props?.[name]}
            slotOptions={slotOptions}
            projectClasses={projectClasses}
            assetCtx={{ projectPath, nodeName: node.name }}
            linkContext={linkContext}
            onChange={(v, immediate) => onSetProp?.(name, v, immediate)}
          />
        ))}
        {showSlotField && (
          <PropField
            key="slot"
            field={{ name: 'slot', type: 'slot' }}
            value={node.props?.slot}
            slotOptions={slotOptions}
            onChange={(v, immediate) => onSetProp?.('slot', v, immediate)}
          />
        )}
        {allowAttrs && (
          <AttributesSection
            node={node}
            names={attrNames}
            projectPath={projectPath}
            onSetProp={onSetProp}
            onRenameProp={onRenameProp}
          />
        )}
        {!isLayout &&
          !allowAttrs &&
          schema.length === 0 &&
          extraProps.length === 0 &&
          !showContentField && (
            <div className="props-empty">
              {node.kind === 'element'
                ? t('propsPanel.noAttrsSet')
                : t('propsPanel.noPropsDeclared')}
            </div>
          )}
      </div>
    </div>
  );
}

// A bare attribute (`disabled`) has no value at all, so reading `.value` off
// one has to come back undefined rather than fail to compile.
const propValue = (v?: PropValue): string | undefined => (v && 'value' in v ? v.value : undefined);

// Displayable text for an attribute value; '' means a bare attribute.
const decodeAttr = (v?: PropValue) =>
  v == null || v.type === 'bare' ? '' : v.type === 'expr' ? `{${v.value}}` : String(v.value);
// Inverse: '' → bare, "{...}" → expression, anything else → string.
const encodeAttr = (text: string): PropValue => {
  if (text === '') return { type: 'bare' };
  const m = text.match(/^\{([\s\S]*)\}$/);
  if (m) return { type: 'expr', value: m[1].trim() };
  return { type: 'string', value: text };
};

// Free-form attribute list for elements and ...rest components: + adds,
// hover-trash deletes, clicking a row opens a name/value editor.
interface PopoverPos {
  top: number;
  left: number;
  width: number;
}

interface AttrEditorPos extends PopoverPos {
  attr: string | null;
}

interface AttributesSectionProps {
  node: AstroNode;
  names: string[];
  projectPath?: string;
  onSetProp?: (name: string, value: PropValue | undefined, immediate?: boolean) => void;
  onRenameProp?: (oldName: string, newName: string) => void;
}

function AttributesSection({
  node,
  names,
  projectPath,
  onSetProp,
  onRenameProp,
}: AttributesSectionProps) {
  const t = useT();
  const [editor, setEditor] = useState<AttrEditorPos | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openEditor = (attr: string | null) => {
    const rect = listRef.current?.getBoundingClientRect();
    setEditor({
      attr,
      top: Math.min((rect?.bottom ?? 200) + 6, window.innerHeight - 150),
      left: rect?.left ?? 0,
      width: rect?.width ?? 240,
    });
  };

  return (
    <div className="props-field" ref={listRef}>
      <label style={{ display: 'flex', alignItems: 'center' }}>
        <span className="prop-label">
          <BracesIcon size={12} className="prop-label-icon" />
          {t('propsPanel.attributes')}
        </span>
        <span style={{ flex: 1 }} />
        <button className="ghost" title={t('propsPanel.addAttribute')} onClick={() => openEditor(null)}>
          <PlusIcon size={12} />
        </button>
      </label>

      {names.length > 0 && (
        <div className="attrs-list">
          {names.map((name) => (
            <div
              key={name}
              className={`attr-row ${editor?.attr === name ? 'editing' : ''}`}
              onClick={() => openEditor(name)}
            >
              <span className="attr-name">{name}</span>
              <span className="attr-eq">=</span>
              <span className="attr-value">{decodeAttr(node.props?.[name])}</span>
              <button
                className="row-action"
                title={t('propsPanel.deleteAttribute')}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editor?.attr === name) setEditor(null);
                  onSetProp?.(name, undefined, true);
                }}
              >
                <TrashIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <AttrEditor
          key={editor.attr ?? '__new'}
          pos={editor}
          projectPath={projectPath}
          name={editor.attr ?? ''}
          value={editor.attr ? decodeAttr(node.props?.[editor.attr]) : ''}
          isNew={editor.attr === null}
          existingNames={names}
          onCommitName={(newName) => {
            const clean = newName.trim();
            if (editor.attr === null) {
              if (clean && !node.props?.[clean]) {
                onSetProp?.(clean, { type: 'bare' }, true);
                setEditor((e) => (e ? { ...e, attr: clean } : e));
              }
            } else if (clean && clean !== editor.attr) {
              onRenameProp?.(editor.attr, clean);
              setEditor((e) => (e ? { ...e, attr: clean } : e));
            }
          }}
          onChangeValue={(text) => {
            if (editor.attr) onSetProp?.(editor.attr, encodeAttr(text));
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

// Floating name/value editor for one attribute.
interface AttrEditorProps {
  pos: PopoverPos;
  name: string;
  value: string;
  isNew: boolean;
  projectPath?: string;
  existingNames?: string[];
  onCommitName: (name: string) => void;
  onChangeValue: (text: string) => void;
  onClose: () => void;
}

function AttrEditor({
  pos,
  name,
  value,
  isNew,
  projectPath,
  onCommitName,
  onChangeValue,
  onClose,
}: AttrEditorProps) {
  const t = useT();
  const [draftName, setDraftName] = useState(name);
  const [draftValue, setDraftValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  const [isExpr] = useState(() => /^\{[\s\S]*\}$/.test(value));
  const isStyleName = draftName.trim().toLowerCase() === 'style';

  const [assetMode, setAssetMode] = useState(() => !isStyleName && looksLikeAssetPath(value));

  const isStyleValue = isStyleName && !isExpr && !assetMode;

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const focusValue = !isNew && !mounted.current;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const commitName = () => onCommitName(draftName);

  return (
    <div
      ref={ref}
      className="attr-editor"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <div className="attr-editor-row">
        <span>{t('propsPanel.attrName')}</span>
        <input
          autoFocus={isNew}
          value={draftName}
          placeholder={t('propsPanel.attrNamePlaceholder')}
          spellCheck={false}
          onChange={(e) => setDraftName(e.target.value.replace(/[^\w@:.-]/g, ''))}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (commitName(), e.currentTarget.blur())}
        />
      </div>
      <div className={`attr-editor-row ${isStyleValue || assetMode ? 'top' : ''}`}>
        <span>{t('propsPanel.attrValue')}</span>
        {isStyleValue ? (
          <StyleEditor
            value={draftValue}
            autoFocus={focusValue}
            onChange={(text) => {
              const flat = collapseDeclarations(text);
              setDraftValue(flat);
              onChangeValue(flat);
            }}
          />
        ) : assetMode ? (
          <div className="attr-asset">
            <AssetField
              value={draftValue}
              initialMode="asset"
              showModeToggle={false}
              mediaKind={mediaKindFor(draftValue)}
              projectPath={projectPath}
              onChange={(v) => {
                setDraftValue(v);
                onChangeValue(v);
              }}
            />
          </div>
        ) : (
          <input
            autoFocus={focusValue}
            value={draftValue}
            placeholder={t('propsPanel.attrValuePlaceholder')}
            spellCheck={false}
            onChange={(e) => {
              setDraftValue(e.target.value);
              onChangeValue(e.target.value);
            }}
            onKeyDown={(e) => e.key === 'Enter' && onClose()}
          />
        )}
        <button
          className={`attr-asset-toggle ${assetMode ? 'on' : ''}`}
          title={assetMode ? t('propsPanel.editPlainValue') : t('propsPanel.chooseFile')}
          onClick={() => setAssetMode((v) => !v)}
        >
          <ElementImageIcon size={12} />
        </button>
      </div>
    </div>
  );
}

// Shallow object literal ({ id: "x", tabindex: 3 }) ↔ ordered entries.
// Returns null for nesting/spreads the row editor can't represent (the
// caller falls back to the generic expression field).
interface ObjectEntry {
  key: string;
  raw: string;
}

function parseObjectLiteral(src: unknown): ObjectEntry[] | null {
  const t = String(src ?? '').trim();
  const m = t.match(/^\{([\s\S]*)\}$/);
  if (!m) return t === '' ? [] : null;
  const inner = m[1].trim();
  if (!inner) return [];
  if (/[{}]|\.\.\./.test(inner)) return null;
  const entries: ObjectEntry[] = [];
  const re =
    /\s*(?:"([^"]*)"|'([^']*)'|([\w$@:.-]+))\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[^,]+?)\s*(?:,|$)/y;
  let pos = 0;
  while (pos < inner.length) {
    re.lastIndex = pos;
    const em = re.exec(inner);
    if (!em) return null;
    entries.push({ key: em[1] ?? em[2] ?? em[3], raw: em[4].trim() });
    pos = re.lastIndex;
  }
  return entries;
}

function serializeObjectLiteral(entries: ObjectEntry[]) {
  const body = entries
    .map((e) => `${/^[A-Za-z_$][\w$]*$/.test(e.key) ? e.key : JSON.stringify(e.key)}: ${e.raw}`)
    .join(', ');
  return `{ ${body} }`;
}

// Row display/edit encoding: quoted strings edit as plain text, anything
// else as {expression}; an empty value means `true`.
const decodeRaw = (raw: string) => {
  const m = String(raw).match(/^"((?:[^"\\]|\\.)*)"$|^'((?:[^'\\]|\\.)*)'$/);
  if (m) return (m[1] ?? m[2]).replace(/\\(.)/g, '$1');
  return raw === 'true' ? '' : `{${raw}}`;
};
const encodeRaw = (text: string) => {
  if (text === '') return 'true';
  const m = text.match(/^\{([\s\S]*)\}$/);
  if (m) return m[1].trim() || 'true';
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

// Attributes-object props (containerAttrs = {} etc.): entries edit like
// element attributes and serialize back to a shallow { key: value } literal.
// Removing the last row resets the prop to its default.
interface RowEditorPos extends PopoverPos {
  index: number | null;
}

interface ObjectAttrsFieldProps {
  pill: React.ReactNode;
  menu: React.ReactNode;
  entries: ObjectEntry[];
  onCommit: (entries: ObjectEntry[] | null, immediate?: boolean) => void;
}

function ObjectAttrsField({ pill, menu, entries, onCommit }: ObjectAttrsFieldProps) {
  const t = useT();
  const [editor, setEditor] = useState<RowEditorPos | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openEditor = (index: number | null) => {
    const rect = listRef.current?.getBoundingClientRect();
    setEditor({
      index,
      top: Math.min((rect?.bottom ?? 200) + 6, window.innerHeight - 150),
      left: rect?.left ?? 0,
      width: rect?.width ?? 240,
    });
  };

  return (
    <div className="props-field" ref={listRef}>
      <label style={{ display: 'flex', alignItems: 'center' }}>
        {pill}
        <span style={{ flex: 1 }} />
        <button className="ghost" title={t('propsPanel.addAttribute')} onClick={() => openEditor(null)}>
          <PlusIcon size={12} />
        </button>
        {menu}
      </label>

      {entries.length > 0 && (
        <div className="attrs-list">
          {entries.map((en, i) => (
            <div
              key={`${en.key}-${i}`}
              className={`attr-row ${editor?.index === i ? 'editing' : ''}`}
              onClick={() => openEditor(i)}
            >
              <span className="attr-name">{en.key}</span>
              <span className="attr-eq">=</span>
              <span className="attr-value">{decodeRaw(en.raw)}</span>
              <button
                className="row-action"
                title={t('propsPanel.deleteAttribute')}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editor?.index === i) setEditor(null);
                  onCommit(entries.filter((_, j) => j !== i));
                }}
              >
                <TrashIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <AttrEditor
          key={editor.index ?? '__new'}
          pos={editor}
          projectPath={undefined}
          name={editor.index != null ? entries[editor.index]?.key ?? '' : ''}
          value={editor.index != null ? decodeRaw(entries[editor.index]?.raw ?? '') : ''}
          isNew={editor.index == null}
          onCommitName={(newName) => {
            const clean = newName.trim();
            if (!clean) return;
            if (editor.index == null) {
              if (entries.some((en) => en.key === clean)) return;
              onCommit([...entries, { key: clean, raw: 'true' }]);
              setEditor((ed) => (ed ? { ...ed, index: entries.length } : ed));
            } else if (clean !== entries[editor.index].key) {
              onCommit(entries.map((en, i) => (i === editor.index ? { ...en, key: clean } : en)));
            }
          }}
          onChangeValue={(text) => {
            if (editor.index != null) {
              onCommit(
                entries.map((en, i) => (i === editor.index ? { ...en, raw: encodeRaw(text) } : en))
              );
            }
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

// Parses a loop head like `service.tags.map((tag) => (` or
// `items.filter(i => i.on).map((item, index) => (` into friendly fields.
// The data part is any expression, so filtered/sorted collections still fit;
// only destructured params or non-arrow callbacks fall back to code.
interface MapFields {
  data: string;
  item: string;
  index: string;
}

function parseMapHead(head: string): MapFields | null {
  const m = String(head)
    .trim()
    .match(/^([\s\S]+?)\.map\(\s*\(\s*([\w$]+)\s*(?:,\s*([\w$]+)\s*)?\)\s*=>\s*\($/);
  return m ? { data: m[1].trim(), item: m[2], index: m[3] || '' } : null;
}


const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

const NO_SOURCE = '[]';
const CUSTOM_SOURCE = '__custom__';
const DEFAULT_ITEM = 'item';

interface MapEditorProps {
  node: Extract<AstroNode, { kind: 'map' }>;
  loopContext: LoopContext | null;
  onSetText?: (value: string, renames?: LoopRename[]) => void;
}

function MapEditor({ node, loopContext, onSetText }: MapEditorProps) {
  const t = useT();
  const parsed = parseMapHead(node.head);
  const [fields, setFields] = useState(parsed || { data: '', item: '', index: '' });
  const lastBuiltRef = useRef(node.head);

  const sources = React.useMemo(
    () => dataSuggestions(loopContext || {}, ''),
    [JSON.stringify(loopContext || {})]
  );
  const isCustomData = (data: string) => {
    const d = (data || '').trim();
    return !!d && d !== NO_SOURCE && !sources.some((s) => s.insert === d);
  };
  const [custom, setCustom] = useState(() => isCustomData(fields.data));

  useEffect(() => {
    if (node.head !== lastBuiltRef.current) {
      const p = parseMapHead(node.head);
      if (p) {
        setFields(p);
        setCustom(isCustomData(p.data));
      }
      lastBuiltRef.current = node.head;
    }
  }, [node.head]);

  // Typing only updates local state; the head is written on blur/Enter/pick
  // so half-typed values never run in the preview.
  const update = (patch: Partial<MapFields>) => setFields((f) => ({ ...f, ...patch }));
  const commit = (next: MapFields) => {
    setFields(next);
    const itemOk = IDENT_RE.test(next.item);
    const indexOk = !next.index || IDENT_RE.test(next.index);
    if (!next.data.trim() || !itemOk || !indexOk) return;
    const head = `${next.data.trim()}.map((${next.item}${next.index ? `, ${next.index}` : ''}) => (`;
    if (head === node.head) return;
    const prev = parseMapHead(node.head);
    const renames: LoopRename[] = [];
    if (prev) {
      if (prev.item && next.item && prev.item !== next.item) {
        renames.push({ from: prev.item, to: next.item });
      }
      if (prev.index && next.index && prev.index !== next.index) {
        renames.push({ from: prev.index, to: next.index });
      }
    }
    lastBuiltRef.current = head;
    onSetText?.(head, renames);
  };
  const commitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit(fields);
  };

  // Changing the source changes what the item *is*, so a name describing the
  // old data ("service" for a list of projects) is worse than none. Back to
  // the default; the rename above carries the children with it.
  const commitSource = (data: string) => {
    const changed = (parseMapHead(node.head)?.data || '') !== data.trim();
    commit({ ...fields, data, item: changed ? DEFAULT_ITEM : fields.item });
  };

  const parseableNow = !!parseMapHead(node.head);
  const isNoSource = !fields.data.trim() || fields.data.trim() === NO_SOURCE;
  const itemBad = fields.item !== '' && !IDENT_RE.test(fields.item);
  const indexBad = fields.index !== '' && !IDENT_RE.test(fields.index);

  return (
    <>
      {parseableNow ? (
        <>
          <div className="props-field" style={{ marginTop: 8 }}>
            <label>
              <span className="prop-label">{t('propsPanel.mapData')}</span>
            </label>
            <Dropdown
              livePreview={false}
              className={`dd-source ${custom || !isNoSource ? 'on' : ''}`}
              placeholder=""
              value={custom ? CUSTOM_SOURCE : isNoSource ? '' : fields.data.trim()}
              options={[
                { value: '', label: t('common.none') },
                ...sources.map((s) => ({ value: s.insert, label: s.insert })),
                { value: CUSTOM_SOURCE, label: t('propsPanel.mapCustom') },
              ]}
              onChange={(v) => {
                if (v === CUSTOM_SOURCE) {
                  setCustom(true);
                  if (!isCustomData(fields.data)) update({ data: '' });
                  return;
                }
                setCustom(false);
                commitSource(v || NO_SOURCE);
              }}
            />
            {custom && (
              <div style={{ marginTop: 6 }}>
                <ExprInput
                  autoFocus
                  value={fields.data}
                  syncValue={fields.data}
                  placeholder={t('propsPanel.mapCustomPlaceholder')}
                  onChange={(v) => update({ data: v })}
                  onCommit={(v) => commitSource(v)}
                />
              </div>
            )}
          </div>
          <div className="props-field">
            <label>
              <span className="prop-label">{t('propsPanel.mapItemName')}</span>
            </label>
            <input
              value={fields.item}
              placeholder={t('propsPanel.mapItemPlaceholder')}
              spellCheck={false}
              style={itemBad ? { borderColor: 'var(--red)' } : undefined}
              onChange={(e) => update({ item: e.target.value })}
              onBlur={() => commit(fields)}
              onKeyDown={commitOnEnter}
            />
          </div>
          <div className="props-field">
            <label>
              <span className="prop-label">{t('propsPanel.mapIndexName')}</span>
              <span className="type-tag">{t('propsPanel.optional')}</span>
            </label>
            <input
              value={fields.index}
              placeholder={t('propsPanel.mapIndexPlaceholder')}
              spellCheck={false}
              style={indexBad ? { borderColor: 'var(--red)' } : undefined}
              onChange={(e) => update({ index: e.target.value })}
              onBlur={() => commit(fields)}
              onKeyDown={commitOnEnter}
            />
          </div>
        </>
      ) : (
        <div
          className="props-field"
          style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)' }}
        >
          {t('propsPanel.mapCustomLoopCode')}
        </div>
      )}
      <div className="props-field" style={{ marginTop: parseableNow ? 2 : 0 }}>
        <label>
          <span className="prop-label">
            <CodeIcon size={12} className="prop-label-icon" />
            {t('propsPanel.code')}
          </span>
        </label>
        <ExprInput
          value={node.head}
          syncValue={node.head}
          onCommit={(v) => v !== node.head && onSetText?.(v)}
        />
      </div>
    </>
  );
}

// Tag switcher for plain elements: free text with a suggestion list of
// standard HTML tags. Committing renames the element — the navigator icon
// follows the tag, and attributes invalid for the new tag are dropped.
interface TagFieldProps {
  tag: string;
  onChangeTag?: (tag: string) => void;
}

function TagField({ tag, onChangeTag }: TagFieldProps) {
  const t = useT();
  const [draft, setDraft] = useState(tag);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [popupPos, setPopupPos] = useState<{ left: number; top: number; width: number } | null>(
    null
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(tag), [tag]);

  const q = draft.trim().toLowerCase();
  const matches =
    focused && q && q !== tag
      ? HTML_TAGS.filter((t) => t.includes(q))
          .sort((a, b) => {
            const ap = a.startsWith(q) ? 0 : 1;
            const bp = b.startsWith(q) ? 0 : 1;
            return ap - bp || a.length - b.length;
          })
          .slice(0, 12)
      : [];

  useLayoutEffect(() => {
    if (!matches.length || !wrapRef.current) {
      setPopupPos(null);
      return;
    }
    const r = wrapRef.current.getBoundingClientRect();
    setPopupPos({ left: r.left, top: r.bottom + 4, width: r.width });
  }, [matches.length, draft]);

  const commit = (newTag: string) => {
    const clean = String(newTag).trim().toLowerCase();
    if (/^[a-z][a-z0-9-]*$/.test(clean) && clean !== tag) onChangeTag?.(clean);
    else setDraft(tag);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && matches.length) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp' && matches.length) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(matches.length ? matches[Math.min(highlight, matches.length - 1)] : draft);
      inputRef.current?.blur();
    } else if (e.key === 'Tab' && matches.length) {
      e.preventDefault();
      commit(matches[Math.min(highlight, matches.length - 1)]);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setDraft(tag);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="props-field" ref={wrapRef}>
      <label>
        <span className="prop-label">
          <TagIcon size={12} className="prop-label-icon" />
          {t('propsPanel.tag')}
        </span>
      </label>
      <input
        ref={inputRef}
        value={draft}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          setHighlight(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
        onKeyDown={onKeyDown}
      />
      {popupPos && (
        <div
          className="dd-popup class-suggest"
          style={{ left: popupPos.left, top: popupPos.top, width: popupPos.width }}
        >
          {matches.map((tag, i) => (
            <div
              key={tag}
              className={`dd-option ${i === highlight ? 'highlight' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                commit(tag);
                inputRef.current?.blur();
              }}
            >
              <span className="dd-option-label">{tag}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PropFieldProps {
  field: PropFieldSpec & { options?: string[]; default?: unknown };
  value?: PropValue;
  slotOptions?: string[] | null;
  projectClasses?: string[];
  assetCtx?: { projectPath?: string; nodeName?: string };
  linkContext?: LinkContext;
  onChange: (value: PropValue | undefined, immediate?: boolean) => void;
}

function PropField({
  field,
  value,
  slotOptions,
  projectClasses,
  assetCtx,
  linkContext,
  onChange,
}: PropFieldProps) {
  const t = useT();
  const { name, type } = field;
  const isSet = value !== undefined;
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  const reset = () => {
    setMenuPos(null);
    onChange(undefined, true);
  };

  const onLabelClick = (e: React.MouseEvent) => {
    if (!isSet) return;
    if (e.altKey) {
      reset();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ left: rect.left, top: rect.bottom + 4 });
  };

  const pill = (
    <span
      className={`prop-label${isSet ? ' set' : ''}`}
      title={isSet ? t('propsPanel.optionClickToReset') : undefined}
      onClick={onLabelClick}
    >
      {type === 'number' && <FieldNumberIcon size={12} className="prop-label-icon" />}
      {type === 'enum' && <ComponentPropertiesIcon size={12} className="prop-label-icon" />}
      {type === 'attrs' && <BracesIcon size={12} className="prop-label-icon" />}
      {(type === 'slot' || name === 'slot') && (
        <ElementSlotIcon size={12} className="prop-label-icon" />
      )}
      {(type === 'string' || type === 'other') && name !== 'slot' && (
        <VariableTextSizeIcon size={12} className="prop-label-icon" />
      )}
      {name}
    </span>
  );
  const menu = menuPos && (
    <ResetMenu pos={menuPos} onReset={reset} onClose={() => setMenuPos(null)} />
  );
  const label = (
    <label>
      {pill}
      {menu}
    </label>
  );

  if (type === 'attrs') {
    const src = value?.type === 'expr' ? value.value : null;
    const entries =
      src != null
        ? parseObjectLiteral(src)
        : parseObjectLiteral(typeof field.default === 'string' ? field.default : '{}') ?? [];
    if (entries) {
      return (
        <ObjectAttrsField
          pill={pill}
          menu={menu}
          entries={entries}
          onCommit={(next) =>
            next && next.length
              ? onChange({ type: 'expr', value: serializeObjectLiteral(next) }, true)
              : onChange(undefined, true)
          }
        />
      );
    }
  }

  if (
    /class(es)?$/i.test(name) &&
    name !== 'slot' &&
    (type === 'string' || type === 'other') &&
    value?.type !== 'expr'
  ) {
    return (
      <div className="props-field">
        {label}
        <ClassInput
          value={propValue(value) || ''}
          suggestions={projectClasses || []}
          onChange={(v, immediate) =>
            v.trim()
              ? onChange({ type: 'string', value: v }, immediate)
              : onChange(undefined, true)
          }
        />
      </div>
    );
  }

  if (name === 'slot' && Array.isArray(slotOptions) && slotOptions.length) {
    const raw = propValue(value);
    const named = slotOptions.filter((s) => s !== 'default');
    const opts = [
      { value: '', label: 'default', dim: true },
      ...(raw && raw !== 'default' && !named.includes(raw) ? [{ value: raw, label: raw }] : []),
      ...named.map((s) => ({ value: s, label: s })),
    ];
    return (
      <div className="props-field">
        {label}
        <Dropdown
          value={raw && raw !== 'default' ? raw : ''}
          options={opts}
          className=""
          placeholder=""
          onChange={(v: any) =>
            v === ''
              ? onChange(undefined, true)
              : onChange({ type: 'string', value: v }, true)
          }
        />
      </div>
    );
  }

  if (type === 'enum' && field.options?.length) {
    const defaultStr = field.default !== undefined ? String(field.default) : undefined;
    const raw = propValue(value);
    // The default option is encoded as '' (= prop not set), so an unset prop
    // shows its default as the selected option and picking the default
    // resets the prop rather than writing it out explicitly.

    const cur = raw === undefined || raw === defaultStr ? '' : raw;
    const opts =
      raw === undefined || field.options.includes(raw)
        ? field.options
        : [raw, ...field.options];
    return (
      <div className="props-field">
        {label}
        <Dropdown
          value={cur}
          placeholder={t('propsPanel.notSet')}
          options={opts.map((o: any) => ({ value: o === defaultStr ? '' : o, label: o }))}
          className=""
          onChange={(v: any) =>
            v === ''
              ? onChange(undefined, true)
              : onChange({ type: 'string', value: v }, true)
          }
        />
      </div>
    );
  }

  if (type === 'boolean') {
    const checked = value ? value.type !== 'expr' || value.value === 'true' : !!field.default;
    return (
      <div className="props-field">
        {label}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) =>
            onChange({ type: 'expr', value: e.target.checked ? 'true' : 'false' }, true)
          }
        />
      </div>
    );
  }

  if (type === 'number') {
    const num = value?.type === 'expr' ? value.value : propValue(value) ?? '';
    // Shift+arrow steps by 10, Option/Alt+arrow by 0.1; plain arrows keep
    // the input's native ±1 stepping.
    const onStepKey = (e: any) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (!e.shiftKey && !e.altKey) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 0.1;
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const cur = parseFloat(e.target.value);
      const base = Number.isFinite(cur) ? cur : parseFloat(String(field.default)) || 0;
      // Round away float noise (e.g. 38.1 + 0.1 = 38.199999…).
      const next = Math.round((base + dir * step) * 1e6) / 1e6;
      onChange({ type: 'expr', value: String(next) });
    };
    return (
      <div className="props-field">
        {label}
        <input
          type="number"
          step="any"
          value={num}
          placeholder={field.default !== undefined ? String(field.default) : ''}
          onKeyDown={onStepKey}
          onChange={(e) =>
            e.target.value === ''
              ? onChange(undefined)
              : onChange({ type: 'expr', value: e.target.value })
          }
        />
      </div>
    );
  }

  // string / other
  const str = propValue(value) ?? '';
  const isExpr = value?.type === 'expr';

  if (name === 'href' && !isExpr && linkContext) {
    return (
      <div className="props-field">
        {label}
        <LinkField
          value={value}
          context={{ ...linkContext, projectPath: assetCtx?.projectPath }}
          onChange={onChange}
        />
      </div>
    );
  }

  const isMediaAttr = name === 'src' || name === 'poster';
  if (!isExpr && assetCtx?.projectPath && (isMediaAttr || looksLikeAssetPath(str))) {
    const nodeName = String(assetCtx.nodeName || '').toLowerCase();
    const mediaKind = looksLikeAssetPath(str)
      ? mediaKindFor(str)
      : name === 'poster'
        ? 'image'
        : nodeName === 'video'
          ? 'video'
          : nodeName === 'audio'
            ? 'audio'
            : ['img', 'source', 'picture', 'image'].includes(nodeName)
              ? 'image'
              : 'asset';
    return (
      <div className="props-field">
        {label}
        <AssetField
          value={str}
          mediaKind={mediaKind}
          initialMode={isMediaAttr ? undefined : 'asset'}
          plainLabel={isMediaAttr ? t('propsPanel.url') : t('propsPanel.textLabel')}
          projectPath={assetCtx.projectPath}
          onChange={(v, immediate) =>
            v === '' ? onChange(undefined, immediate) : onChange({ type: 'string', value: v }, immediate)
          }
        />
      </div>
    );
  }

  const long =
    !isExpr &&
    (String(str).length > 48 || /text|description|content|body|paragraph/i.test(name));

  return (
    <div className="props-field">
      {label}
      {long ? (
        <AutoTextarea
          value={str}
          placeholder={field.default !== undefined ? String(field.default) : ''}
          style={undefined}
          onChange={(e: any) => onChange({ type: 'string', value: e.target.value })}
        />
      ) : (
        <input
          value={str}
          placeholder={
            field.default !== undefined ? String(field.default) : isExpr ? '' : ''
          }
          onChange={(e) =>
            onChange({ type: isExpr ? 'expr' : 'string', value: e.target.value })
          }
        />
      )}
    </div>
  );
}

// Small fixed-position menu opened by clicking a set prop's label.
interface ResetMenuProps {
  pos: { left: number; top: number };
  onReset: () => void;
  onClose: () => void;
}

function ResetMenu({ pos, onReset, onClose }: ResetMenuProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="prop-menu" style={{ left: pos.left, top: pos.top }}>
      <div className="prop-menu-item" onClick={onReset}>
        <ResetIcon size={12} />
        {t('propsPanel.resetToDefault')}
      </div>
    </div>
  );
}