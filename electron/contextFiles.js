// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
const nodeFs = require('fs');
const nodePath = require('path');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'release', '.astro', '.cache', 'coverage']);

const SENSITIVE_FILENAME_PATTERNS = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /^credentials\.json$/i,
  /^service-account.*\.json$/i,
];

function isSensitiveFilename(name) {
  return SENSITIVE_FILENAME_PATTERNS.some((pattern) => pattern.test(name));
}

// Same containment rule electron/main.js uses for the asset protocol and the
// style panel (assetAbs / assertInProject): resolve to an absolute path and
// require it to stay inside the project root.
function resolveWithinRoot(root, rel, { path }) {
  const resolvedRoot = path.resolve(root);
  const abs = path.resolve(root, rel || '');
  if (abs !== resolvedRoot && !(abs + path.sep).startsWith(resolvedRoot + path.sep)) {
    throw new Error('Invalid path: outside the open project.');
  }
  return abs;
}

function listProjectFiles(root, { fs = nodeFs, path = nodePath } = {}) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (!entry.isDirectory() && isSensitiveFilename(entry.name)) continue;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
      } else {
        out.push(rel ? `${rel}/${entry.name}` : entry.name);
      }
    }
  };
  walk(root, '');
  return out.sort();
}

function readProjectFile(root, rel, { fs = nodeFs, path = nodePath, maxBytes = 1_000_000 } = {}) {
  const name = path.basename(rel || '');
  if (isSensitiveFilename(name)) {
    throw new Error(`Refusing to read a sensitive file: ${rel}`);
  }
  const abs = resolveWithinRoot(root, rel, { path });
  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error(`Not a file: ${rel}`);
  if (stat.size > maxBytes) throw new Error(`File too large to attach: ${rel}`);
  const content = fs.readFileSync(abs, 'utf8');
  return { rel, content, size: stat.size };
}

const CONTEXT_BUNDLE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function ensureContextDir(root, { fs = nodeFs, path = nodePath } = {}) {
  const dir = path.join(root, '.stacki', 'tmp', 'context');
  fs.mkdirSync(dir, { recursive: true });
  // A nested .gitignore that excludes everything under tmp/ keeps generated
  // context bundles out of the user's repo regardless of what their own
  // top-level .gitignore does or doesn't list — Stacki must never edit a
  // file the user's project owns.
  const gitignorePath = path.join(root, '.stacki', 'tmp', '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n');
  }
  return dir;
}

// Nothing else prunes this directory: every "Insert into terminal" that
// triggers file-mode delivery leaves a permanent plaintext bundle (possibly
// containing a Git diff or file contents a scanForSecrets warning already
// flagged) unless something cleans up after it. Keep this simple — list,
// filter by mtime age, unlink — no external dependencies.
function pruneOldContextBundles(dir, { fs = nodeFs, path = nodePath } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of entries) {
    const abs = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (now - stat.mtimeMs > CONTEXT_BUNDLE_MAX_AGE_MS) {
      try {
        fs.unlinkSync(abs);
      } catch {
        /* best-effort cleanup — a failed unlink shouldn't block writing the new bundle */
      }
    }
  }
}

function writeContextBundle(root, content, { fs = nodeFs, path = nodePath } = {}) {
  if (!content || !content.trim()) {
    throw new Error('Nothing to write — the composed context is empty.');
  }
  const dir = ensureContextDir(root, { fs, path });
  pruneOldContextBundles(dir, { fs, path });
  const filename = `request-${Date.now()}.md`;
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
  return { relPath: `.stacki/tmp/context/${filename}` };
}

function capturePreview(root, browserWindow, rect, { fs = nodeFs, path = nodePath } = {}) {
  const image = browserWindow.webContents.capturePage({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  if (image.isEmpty()) throw new Error('The captured preview region is empty.');
  const dir = ensureContextDir(root, { fs, path });
  pruneOldContextBundles(dir, { fs, path });
  const filename = `preview-${Date.now()}.png`;
  fs.writeFileSync(path.join(dir, filename), image.toPNG());
  return { relPath: `.stacki/tmp/context/${filename}` };
}

module.exports = {
  EXCLUDED_DIRS,
  isSensitiveFilename,
  listProjectFiles,
  readProjectFile,
  writeContextBundle,
  capturePreview,
};
