import type { PageModel, PageState } from './ast';

export interface ScanResult {
  pages: PageEntry[];
  layouts: ComponentEntry[];
  components: ComponentEntry[];
  pageFolders?: string[];
}

export interface PageEntry {
  name: string;
  path: string;
  route?: string;
  kind?: 'page' | 'component';
  focusPath?: string;
}

export interface ComponentEntry {
  name: string;
  path: string;
  schema?: PropField[];
  slots?: string[];
  extendsTag?: string;
  hasRest?: boolean;
}

export interface PropField {
  name: string;
  type: string;
  optional?: boolean;
  values?: string[];
}

export type Unsubscribe = () => void;

export interface AvbApi {
  addRecent(path: string): void;
  capturePreview(args: unknown): Promise<unknown>;
  captureThumb(args: unknown): Promise<unknown>;
  cmsMeta(args: unknown): Promise<unknown>;
  cmsUsage(args: unknown): Promise<unknown>;
  createAstroProject(path: string): Promise<unknown>;
  createCms(args: unknown): Promise<unknown>;
  createPage(args: Record<string, unknown>): Promise<{ pagePath: string }>;
  createPageFolder(args: Record<string, unknown>): Promise<unknown>;
  deleteCms(args: unknown): Promise<unknown>;
  deletePage(path: string): Promise<unknown>;
  deletePageFolder(args: Record<string, unknown>): Promise<unknown>;
  diagnoseDev(path: string): Promise<unknown>;
  disposeTerminal(args: unknown): void;
  getFilePath(args: unknown): Promise<string>;
  getGitDiff(args: unknown): Promise<unknown>;
  ghStatus(args: unknown): Promise<unknown>;
  gitCheckout(args: unknown): Promise<unknown>;
  gitCommit(args: unknown): Promise<unknown>;
  gitInfo(args: unknown): Promise<unknown>;
  gitInit(args: unknown): Promise<unknown>;
  gitPublish(args: unknown): Promise<unknown>;
  gitPush(args: unknown): Promise<unknown>;
  hasNodeModules(path: string): Promise<boolean>;
  importPathFor(args: unknown): Promise<{ relative: string; srcRelative: string }>;
  installDeps(path: string): Promise<unknown>;
  listAssets(args: unknown): Promise<unknown>;
  listCms(args: unknown): Promise<unknown>;
  listContextFiles(args: unknown): Promise<unknown>;
  listProjectClasses(path: string): Promise<string[]>;
  listRecents(): Promise<unknown>;
  listStyleFiles(args: unknown): Promise<{ files: unknown[] }>;
  mkdirAssets(args: unknown): Promise<unknown>;
  moveAsset(args: unknown): Promise<unknown>;
  movePage(args: Record<string, unknown>): Promise<unknown>;
  nativeCopy(): void;
  nativePaste(): void;
  newProjectDialog(): Promise<string | null>;
  onAssetsChanged(cb: (e: unknown) => void): Unsubscribe;
  onCmsChanged(cb: (e: unknown) => void): Unsubscribe;
  onCreateLog(cb: (e: unknown) => void): Unsubscribe;
  onDevExit(cb: (e: unknown) => void): Unsubscribe;
  onDevLog(cb: (chunk: string) => void): Unsubscribe;
  onFsChanged(cb: (e: { files: string[] }) => void): Unsubscribe;
  onMenu(name: string, cb: () => void): Unsubscribe;
  onProgress(cb: (e: unknown) => void): Unsubscribe;
  onTerminalData(cb: (e: unknown) => void): Unsubscribe;
  onTerminalError(cb: (e: unknown) => void): Unsubscribe;
  onTerminalExit(cb: (e: unknown) => void): Unsubscribe;
  openExternal(url: string): void;
  openProjectDialog(): Promise<string | null>;
  pickUploadAssets(args: unknown): Promise<unknown>;
  readAssetText(args: unknown): Promise<unknown>;
  readCms(args: unknown): Promise<unknown>;
  readContextFile(args: unknown): Promise<unknown>;
  readPage(path: string): Promise<PageState>;
  readStyleFile(args: unknown): Promise<unknown>;
  removeRecent(args: unknown): void;
  renameAsset(args: unknown): Promise<unknown>;
  renamePageFolder(args: Record<string, unknown>): Promise<unknown>;
  resizeTerminal(args: unknown): void;
  restartTerminal(args: unknown): void;
  scaffoldProject(path: string): Promise<unknown>;
  scanProject(path: string): Promise<ScanResult>;
  serializeNode(args: unknown): Promise<unknown>;
  setCmsMeta(args: unknown): Promise<unknown>;
  startDevServer(path: string): Promise<{ url: string; external: boolean }>;
  startTerminal(args: unknown): Promise<unknown>;
  stopDevServer(): Promise<unknown>;
  uploadAssets(args: unknown): Promise<unknown>;
  watchProject(path: string): void;
  writeAssetText(args: unknown): Promise<unknown>;
  writeCms(args: unknown): Promise<unknown>;
  writeContextBundle(args: unknown): Promise<unknown>;
  writePage(args: { pagePath: string; model: PageModel }): Promise<unknown>;
  writePageRaw(args: { pagePath: string; source: string }): Promise<unknown>;
  writeStyleFile(args: unknown): Promise<unknown>;
  writeTerminal(args: unknown): void;
}

declare global {
  interface Window {
    avb: AvbApi;
  }
}

export {};
