export type PropValue =
  | { type: 'string'; value: string }
  | { type: 'expr'; value: string }
  | { type: 'bare' };

export type Props = Record<string, PropValue>;

export interface ImportDecl {
  name: string;
  path: string;
}

export type NodeKind =
  | 'element'
  | 'component'
  | 'text'
  | 'comment'
  | 'expr'
  | 'raw'
  | 'raw-line'
  | 'map'
  | 'chunk-group';

interface NodeBase {
  id: string;
  kind: NodeKind;
  name?: string;
  value?: string;
  props?: Props;
  children?: AstroNode[] | null;
  inner?: string;
  head?: string;
  dynamicTag?: boolean;
  chunkFile?: string;
  chunkAggregate?: any;
}

export interface ElementNode extends NodeBase {
  kind: 'element' | 'component';
  name: string;
  props: Props;
  children: AstroNode[] | null;
  dynamicTag?: boolean;
}

export interface TextNode extends NodeBase {
  kind: 'text';
  value: string;
}

export interface CommentNode extends NodeBase {
  kind: 'comment';
  value: string;
}

export interface ExprNode extends NodeBase {
  kind: 'expr';
  value: string;
}

export interface RawNode extends NodeBase {
  kind: 'raw';
  name: string;
  props: Props;
  inner: string;
}

export interface RawLineNode extends NodeBase {
  kind: 'raw-line';
  value: string;
}

export interface MapNode extends NodeBase {
  kind: 'map';
  head: string;
  children: AstroNode[];
}

/** A resolved chunk container whose children come from external HTML files. */
export interface ChunkGroupNode extends NodeBase {
  kind: 'chunk-group';
  name: string;
  props: Props;
  children: AstroNode[] | null;
  chunkFile?: string;
  chunkAggregate?: any;
}

export type AstroNode =
  | ElementNode
  | TextNode
  | CommentNode
  | ExprNode
  | RawNode
  | RawLineNode
  | MapNode
  | ChunkGroupNode;

export interface PageModel {
  imports: ImportDecl[];
  extraFrontmatter: string;
  nodes: AstroNode[];
}

export type PageState =
  | { editable: true; model: PageModel; source?: string; dirty?: boolean }
  | { editable: false; reason: string; source: string; dirty?: boolean };
