import { describe, expect, it, vi } from 'vitest';
import contextIpcModule from './contextIpc.js';

const { registerContextIpc } = contextIpcModule;

// contextIpc.js is plain CommonJS and requires ./contextFiles and
// ./astroParser internally, so list/read/serialize/write/git are injected as
// constructor-style dependencies (same pattern as TerminalManager's injected
// loadPty) rather than mocked via vi.mock — that keeps the test decoupled
// from CJS/ESM interop details.
function fakeRunGit(overrides = {}) {
  const defaults = {
    'rev-parse --is-inside-work-tree': { stdout: 'true\n', stderr: '' },
    'rev-parse --abbrev-ref HEAD': { stdout: 'main\n', stderr: '' },
    'diff --cached': { stdout: '', stderr: '' },
    'diff': { stdout: '', stderr: '' },
    'status --porcelain': { stdout: '', stderr: '' },
    'log -5 --oneline': { stdout: '', stderr: '' },
    ...overrides,
  };
  return vi.fn(async (_root, args) => {
    // 'diff' is keyed on just its mode (plain vs --cached) because its full
    // arg list varies with the exclude pathspec under test; every other
    // command is keyed on its complete argument list.
    const key = args[0] === 'diff' ? (args.includes('--cached') ? 'diff --cached' : 'diff') : args.join(' ');
    const canned = defaults[key];
    if (!canned) throw new Error(`unexpected git args: ${args.join(' ')}`);
    return canned;
  });
}

function setup({ projectRoot = '/projects/site', runGit = fakeRunGit() } = {}) {
  const handles = new Map();
  const ipcMain = {
    handle: vi.fn((channel, fn) => handles.set(channel, fn)),
    removeHandler: vi.fn(),
  };
  const allowed = { sender: {} };
  const denied = { sender: {} };
  const listProjectFiles = vi.fn(() => ['package.json', 'src/pages/index.astro']);
  const readProjectFile = vi.fn((_root, rel) => ({ rel, content: `content of ${rel}`, size: 10 }));
  const serializeNode = vi.fn((node) => `<${node.name}></${node.name}>`);
  const writeContextBundle = vi.fn((_root, content) => ({ relPath: `.stacki/tmp/context/request-1.md` }));
  const unregister = registerContextIpc({
    ipcMain,
    isAllowedSender: (event) => event === allowed,
    getProjectRoot: () => projectRoot,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
    runGit,
  });
  return {
    ipcMain,
    handles,
    allowed,
    denied,
    unregister,
    listProjectFiles,
    readProjectFile,
    serializeNode,
    writeContextBundle,
    runGit,
  };
}

describe('context IPC', () => {
  it('registers the five context channels', () => {
    const { handles } = setup();
    expect([...handles.keys()]).toEqual([
      'context:listFiles',
      'context:readFile',
      'context:serializeNode',
      'context:writeContextBundle',
      'context:gitDiff',
    ]);
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

  it('serializes a node to markup for an allowed sender', async () => {
    const { handles, allowed, serializeNode } = setup();
    const node = { id: 'h1', kind: 'element', name: 'h1' };
    await expect(handles.get('context:serializeNode')(allowed, { node })).resolves.toEqual({
      markup: '<h1></h1>',
    });
    expect(serializeNode).toHaveBeenCalledWith(node);
  });

  it('writes a context bundle for an allowed sender', async () => {
    const { handles, allowed, writeContextBundle } = setup();
    await expect(
      handles.get('context:writeContextBundle')(allowed, { markdown: '## Stacki context' }),
    ).resolves.toEqual({ relPath: '.stacki/tmp/context/request-1.md' });
    expect(writeContextBundle).toHaveBeenCalledWith('/projects/site', '## Stacki context');
  });

  it('rejects an untrusted sender', async () => {
    const { handles, denied } = setup();
    await expect(handles.get('context:listFiles')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:readFile')(denied, { rel: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:serializeNode')(denied, { node: {} })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:writeContextBundle')(denied, { markdown: 'x' })).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
    await expect(handles.get('context:gitDiff')(denied)).rejects.toThrow(
      'Context IPC is available only to Stacki.',
    );
  });

  it('rejects when no project is open', async () => {
    const { handles, allowed } = setup({ projectRoot: null });
    await expect(handles.get('context:listFiles')(allowed)).rejects.toThrow(
      'Open a project before attaching context.',
    );
  });

  it('unregisters all five handlers', () => {
    const { ipcMain, unregister } = setup();
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:listFiles');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:readFile');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:serializeNode');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:writeContextBundle');
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('context:gitDiff');
  });
});

describe('context:gitDiff', () => {
  it('returns branch, diffs, untracked files, and recent commits for an allowed sender', async () => {
    const runGit = fakeRunGit({
      'diff --cached': { stdout: 'diff --git a/staged.txt b/staged.txt\n+staged change\n', stderr: '' },
      'diff': { stdout: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n', stderr: '' },
      'status --porcelain': { stdout: '?? new-file.txt\n?? another.txt\n', stderr: '' },
      'log -5 --oneline': { stdout: 'abc123 Fix bug\ndef456 Add feature\n', stderr: '' },
    });
    const { handles, allowed } = setup({ runGit });
    await expect(handles.get('context:gitDiff')(allowed)).resolves.toEqual({
      isRepo: true,
      branch: 'main',
      staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
      unstaged: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n',
      untracked: ['new-file.txt', 'another.txt'],
      recentCommits: ['abc123 Fix bug', 'def456 Add feature'],
      truncated: false,
    });
  });

  it('excludes lockfiles and build directories from the diff pathspec', async () => {
    const runGit = fakeRunGit();
    const { handles, allowed } = setup({ runGit });
    await handles.get('context:gitDiff')(allowed);
    const diffCall = runGit.mock.calls.find((call) => call[1][0] === 'diff' && !call[1].includes('--cached'));
    expect(diffCall[1]).toEqual(
      expect.arrayContaining([
        ':(exclude)node_modules',
        ':(exclude)dist',
        ':(exclude)package-lock.json',
        ':(exclude)pnpm-lock.yaml',
        ':(exclude)yarn.lock',
      ]),
    );
  });

  it('excludes the same sensitive-file categories the file-attachment path blocks from the diff pathspec', async () => {
    const runGit = fakeRunGit();
    const { handles, allowed } = setup({ runGit });
    await handles.get('context:gitDiff')(allowed);
    const diffCall = runGit.mock.calls.find((call) => call[1][0] === 'diff' && !call[1].includes('--cached'));
    expect(diffCall[1]).toEqual(
      expect.arrayContaining([
        ':(exclude,glob)**/.env',
        ':(exclude,glob)**/.env.*',
        ':(exclude,glob)**/*.pem',
        ':(exclude,glob)**/*.key',
        ':(exclude,glob)**/id_rsa',
        ':(exclude,glob)**/id_ed25519',
        ':(exclude,glob)**/credentials.json',
        ':(exclude,glob)**/service-account*.json',
      ]),
    );
  });

  it('excludes sensitive filenames from the untracked-files list', async () => {
    const runGit = fakeRunGit({
      'status --porcelain': {
        stdout: '?? new-file.txt\n?? .env.production\n?? server.key\n?? config/credentials.json\n',
        stderr: '',
      },
    });
    const { handles, allowed } = setup({ runGit });
    const result = await handles.get('context:gitDiff')(allowed);
    expect(result.untracked).toEqual(['new-file.txt']);
  });

  it('truncates an oversized diff and reports it as truncated', async () => {
    const runGit = fakeRunGit({ 'diff': { stdout: 'x'.repeat(25000), stderr: '' } });
    const { handles, allowed } = setup({ runGit });
    const result = await handles.get('context:gitDiff')(allowed);
    expect(result.truncated).toBe(true);
    expect(result.unstaged.length).toBeLessThan(25000);
  });

  it('falls back to placeholder branch/commits on an unborn branch (a freshly git-inited repo with no commits)', async () => {
    const runGit = vi.fn(async (_root, args) => {
      const key = args[0] === 'diff' ? (args.includes('--cached') ? 'diff --cached' : 'diff') : args.join(' ');
      if (key === 'rev-parse --is-inside-work-tree') return { stdout: 'true\n', stderr: '' };
      if (key === 'rev-parse --abbrev-ref HEAD') throw new Error('fatal: ambiguous argument HEAD');
      if (key === 'log -5 --oneline') throw new Error('fatal: your current branch does not have any commits yet');
      if (key === 'diff --cached') return { stdout: '', stderr: '' };
      if (key === 'diff') return { stdout: '', stderr: '' };
      if (key === 'status --porcelain') return { stdout: '', stderr: '' };
      throw new Error(`unexpected git args: ${args.join(' ')}`);
    });
    const { handles, allowed } = setup({ runGit });
    const result = await handles.get('context:gitDiff')(allowed);
    expect(result.branch).toBe('(no commits yet)');
    expect(result.recentCommits).toEqual([]);
  });

  it('rejects when the project is not a Git repository', async () => {
    const { handles, allowed } = setup({
      runGit: vi.fn(async (_root, args) => {
        if (args.join(' ') === 'rev-parse --is-inside-work-tree') throw new Error('not a repo');
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      }),
    });
    await expect(handles.get('context:gitDiff')(allowed)).rejects.toThrow(
      'This project is not a Git repository.',
    );
  });
});
