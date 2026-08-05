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

module.exports = {
  EXCLUDED_DIRS,
  isSensitiveFilename,
  listProjectFiles,
  readProjectFile,
};
