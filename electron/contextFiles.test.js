import { describe, expect, it } from 'vitest';
import contextFilesModule from './contextFiles.js';

const { isSensitiveFilename, listProjectFiles, readProjectFile } = contextFilesModule;

// A tiny in-memory filesystem, just deep enough for these tests: a tree of
// {name: {type:'dir', children} | {type:'file', content}} keyed by absolute
// path segments joined with '/'.
function fakeFs(tree) {
  const files = new Map(); // abs path -> content
  const dirs = new Map(); // abs path -> [{name, isDir}]

  const walk = (prefix, node) => {
    const entries = [];
    for (const [name, child] of Object.entries(node)) {
      const abs = `${prefix}/${name}`;
      if (child.type === 'dir') {
        entries.push({ name, isDir: true });
        walk(abs, child.children);
      } else {
        entries.push({ name, isDir: false });
        files.set(abs, child.content);
      }
    }
    dirs.set(prefix, entries);
  };
  walk('/project', tree);

  return {
    fs: {
      readdirSync: (dir, opts) => {
        const entries = dirs.get(dir) || [];
        if (opts?.withFileTypes) {
          return entries.map((e) => ({ name: e.name, isDirectory: () => e.isDir }));
        }
        return entries.map((e) => e.name);
      },
      statSync: (abs) => {
        if (!files.has(abs)) throw new Error(`ENOENT: ${abs}`);
        return { isFile: () => true, size: files.get(abs).length };
      },
      readFileSync: (abs) => {
        if (!files.has(abs)) throw new Error(`ENOENT: ${abs}`);
        return files.get(abs);
      },
    },
    path: {
      // Normalizes '..'/'.' segments like Node's real path.resolve, so the
      // path-traversal test below genuinely exercises the containment check
      // in contextFiles.js rather than silently passing through an
      // un-normalized '/project/../secrets.txt' string.
      resolve: (...parts) => {
        const segments = parts.join('/').split('/');
        const out = [];
        for (const seg of segments) {
          if (seg === '' || seg === '.') continue;
          if (seg === '..') out.pop();
          else out.push(seg);
        }
        return `/${out.join('/')}`;
      },
      join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      sep: '/',
      basename: (p) => p.split('/').pop(),
    },
  };
}

describe('isSensitiveFilename', () => {
  it('blocks common secret filenames', () => {
    expect(isSensitiveFilename('.env')).toBe(true);
    expect(isSensitiveFilename('.env.production')).toBe(true);
    expect(isSensitiveFilename('server.pem')).toBe(true);
    expect(isSensitiveFilename('id_rsa')).toBe(true);
    expect(isSensitiveFilename('credentials.json')).toBe(true);
    expect(isSensitiveFilename('service-account-1.json')).toBe(true);
  });

  it('allows ordinary project files', () => {
    expect(isSensitiveFilename('index.astro')).toBe(false);
    expect(isSensitiveFilename('package.json')).toBe(false);
  });
});

describe('listProjectFiles', () => {
  it('lists files recursively, excluding build/dependency directories and dotfiles', () => {
    const { fs, path } = fakeFs({
      'src': { type: 'dir', children: {
        'pages': { type: 'dir', children: {
          'index.astro': { type: 'file', content: '<h1>Hi</h1>' },
        } },
      } },
      'node_modules': { type: 'dir', children: {
        'pkg': { type: 'dir', children: { 'index.js': { type: 'file', content: '' } } },
      } },
      '.git': { type: 'dir', children: { 'HEAD': { type: 'file', content: '' } } },
      'package.json': { type: 'file', content: '{}' },
      '.env': { type: 'file', content: 'SECRET=1' },
    });

    const files = listProjectFiles('/project', { fs, path });
    expect(files).toEqual(['package.json', 'src/pages/index.astro']);
  });

  it('excludes sensitive filenames that are not dotfiles, so they never appear as pickable', () => {
    const { fs, path } = fakeFs({
      'credentials.json': { type: 'file', content: '{"key":"secret"}' },
      'server.pem': { type: 'file', content: 'PEM DATA' },
      'id_rsa': { type: 'file', content: 'PRIVATE KEY' },
      'service-account-1.json': { type: 'file', content: '{}' },
      'config': { type: 'dir', children: {
        'service-account-prod.json': { type: 'file', content: '{}' },
      } },
      'package.json': { type: 'file', content: '{}' },
    });

    const files = listProjectFiles('/project', { fs, path });
    expect(files).toEqual(['package.json']);
  });
});

describe('readProjectFile', () => {
  it('reads a file within the project root', () => {
    const { fs, path } = fakeFs({
      'src': { type: 'dir', children: {
        'pages': { type: 'dir', children: {
          'index.astro': { type: 'file', content: '<h1>Hi</h1>' },
        } },
      } },
    });

    const result = readProjectFile('/project', 'src/pages/index.astro', { fs, path });
    expect(result).toEqual({ rel: 'src/pages/index.astro', content: '<h1>Hi</h1>', size: '<h1>Hi</h1>'.length });
  });

  it('refuses a path that escapes the project root', () => {
    const { fs, path } = fakeFs({ 'a.txt': { type: 'file', content: 'x' } });
    expect(() => readProjectFile('/project', '../secrets.txt', { fs, path })).toThrow(
      'Invalid path: outside the open project.',
    );
  });

  it('refuses a sensitive filename even when it exists on disk', () => {
    const { fs, path } = fakeFs({ '.env': { type: 'file', content: 'SECRET=1' } });
    expect(() => readProjectFile('/project', '.env', { fs, path })).toThrow(
      'Refusing to read a sensitive file: .env',
    );
  });

  it('refuses a file larger than the configured limit', () => {
    const { fs, path } = fakeFs({ 'big.txt': { type: 'file', content: 'x'.repeat(20) } });
    expect(() => readProjectFile('/project', 'big.txt', { fs, path, maxBytes: 10 })).toThrow(
      'File too large to attach: big.txt',
    );
  });
});
