import { describe, expect, it, vi } from 'vitest';
import contextIpcModule from './contextIpc.js';

const { registerContextIpc } = contextIpcModule;

// contextIpc.js is plain CommonJS and requires ./contextFiles internally, so
// list/read are injected as constructor-style dependencies (same pattern as
// TerminalManager's injected loadPty) rather than mocked via vi.mock — that
// keeps the test decoupled from CJS/ESM interop details.
function setup({ projectRoot = '/projects/site' } = {}) {
  const handles = new Map();
  const ipcMain = {
    handle: vi.fn((channel, fn) => handles.set(channel, fn)),
    removeHandler: vi.fn(),
  };
  const allowed = { sender: {} };
  const denied = { sender: {} };
  const listProjectFiles = vi.fn(() => ['package.json', 'src/pages/index.astro']);
  const readProjectFile = vi.fn((_root, rel) => ({ rel, content: `content of ${rel}`, size: 10 }));
  const unregister = registerContextIpc({
    ipcMain,
    isAllowedSender: (event) => event === allowed,
    getProjectRoot: () => projectRoot,
    listProjectFiles,
    readProjectFile,
  });
  return { ipcMain, handles, allowed, denied, unregister, listProjectFiles, readProjectFile };
}

describe('context IPC', () => {
  it('registers the two context channels', () => {
    const { handles } = setup();
    expect([...handles.keys()]).toEqual(['context:listFiles', 'context:readFile']);
  });

  it('lists project files for an allowed sender', async () => {
    const { handles, allowed, listProjectFiles } = setup();
    await expect(handles.get('context:listFiles')(allowed)).resolves.toEqual({
      files: ['package.json', 'src/pages/index.astro'],
    });
    expect(listProjectFiles).toHaveBeenCalledWith('/projects/site');
  });

  it('reads a project file for an allowed sender', async () => {
    const { handles, allowed, readProjectFile } = setup();
    await expect(handles.get('context:readFile')(allowed, { rel: 'package.json' })).resolves.toEqual({
      rel: 'package.json',
      content: 'content of package.json',
      size: 10,
    });
    expect(readProjectFile).toHaveBeenCalledWith('/projects/site', 'package.json');
  });

  it('rejects an untrusted sender', async () => {
    const { handles, denied } = setup();
    await expect(handles.get('context:listFiles')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:readFile')(denied, { rel: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
  });

  it('rejects when no project is open', async () => {
    const { handles, allowed } = setup({ projectRoot: null });
    await expect(handles.get('context:listFiles')(allowed)).rejects.toThrow(
      'Open a project before attaching context.',
    );
  });

  it('unregisters both handlers', () => {
    const { ipcMain, unregister } = setup();
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:listFiles');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:readFile');
  });
});
