const contextFiles = require('./contextFiles');
const astroParser = require('./astroParser');

// Kept out of the diff entirely — these blow up the token cost of a diff
// without telling an agent anything about the actual change (spec §9.7's
// safety rule: exclude lockfiles and build output by default).
const DIFF_EXCLUDES = [
  'node_modules',
  'dist',
  '.astro',
  'release',
  'coverage',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

// Same categories of secret-bearing files that contextFiles.js's
// SENSITIVE_FILENAME_PATTERNS refuses to read for the file-attachment path —
// keep in sync with contextFiles.js's SENSITIVE_FILENAME_PATTERNS. Git's
// pathspec magic uses fnmatch globs, not JS regex, so this is a hand-written
// parallel list rather than a shared source.
const SENSITIVE_DIFF_EXCLUDES = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa',
  '**/id_ed25519',
  '**/credentials.json',
  '**/service-account*.json',
];
const MAX_DIFF_CHARS = 20000;

function diffPathspec() {
  const excludes = DIFF_EXCLUDES.flatMap((p) => [`:(exclude)${p}`, `:(exclude)${p}/**`]);
  const sensitiveExcludes = SENSITIVE_DIFF_EXCLUDES.map((p) => `:(exclude,glob)${p}`);
  return ['--', '.', ...excludes, ...sensitiveExcludes];
}

// Mirrors contextFiles.js's isSensitiveFilename so the untracked-files list
// returned by `git status --porcelain` (which isn't pathspec-filtered) can't
// leak a sensitive filename either.
const SENSITIVE_FILENAME_PATTERNS = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
  /^credentials\.json$/i,
  /^service-account.*\.json$/i,
];

function isSensitiveUntrackedPath(relPath) {
  const base = relPath.split('/').pop();
  return SENSITIVE_FILENAME_PATTERNS.some((pattern) => pattern.test(base));
}

function truncateDiff(text) {
  if (text.length <= MAX_DIFF_CHARS) return { text, truncated: false };
  const cut = text.slice(0, MAX_DIFF_CHARS);
  return { text: `${cut}\n… (truncated, ${text.length - MAX_DIFF_CHARS} more characters)`, truncated: true };
}

function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
  serializeNode = (node) => astroParser.serializeNodes([node]),
  writeContextBundle = contextFiles.writeContextBundle,
  runGit,
}) {
  const assertAllowed = (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Context IPC is available only to Stacki.');
    }
  };
  const requireRoot = () => {
    const root = getProjectRoot();
    if (!root) throw new Error('Open a project before attaching context.');
    return root;
  };

  const listFiles = async (event) => {
    assertAllowed(event);
    return { files: listProjectFiles(requireRoot()) };
  };
  const readFile = async (event, payload) => {
    assertAllowed(event);
    return readProjectFile(requireRoot(), payload?.rel);
  };
  const serialize = async (event, payload) => {
    assertAllowed(event);
    return { markup: serializeNode(payload?.node) };
  };
  const writeBundle = async (event, payload) => {
    assertAllowed(event);
    return writeContextBundle(requireRoot(), payload?.markdown);
  };
  const gitDiff = async (event) => {
    assertAllowed(event);
    const root = requireRoot();
    try {
      await runGit(root, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      throw new Error('This project is not a Git repository.');
    }

    // On an unborn branch (a freshly `git init`'d repo with no commits — see
    // this file's git:init handler, a completely normal user path), both
    // `rev-parse --abbrev-ref HEAD` and `git log` fail with a nonzero exit.
    // Fall back the same way main.js's git:info handler does rather than
    // rejecting the whole chip.
    let branch;
    try {
      branch = (await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    } catch {
      branch = '(no commits yet)';
    }
    const stagedRaw = (await runGit(root, ['diff', '--cached', ...diffPathspec()])).stdout;
    const unstagedRaw = (await runGit(root, ['diff', ...diffPathspec()])).stdout;
    const statusOut = (await runGit(root, ['status', '--porcelain'])).stdout;
    let logOut = '';
    try {
      logOut = (await runGit(root, ['log', '-5', '--oneline'])).stdout;
    } catch {
      logOut = '';
    }

    const untracked = statusOut
      .split('\n')
      .filter((line) => line.startsWith('?? '))
      .map((line) => line.slice(3).replace(/^"|"$/g, ''))
      .filter((relPath) => !isSensitiveUntrackedPath(relPath));
    const recentCommits = logOut
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const staged = truncateDiff(stagedRaw);
    const unstaged = truncateDiff(unstagedRaw);

    return {
      isRepo: true,
      branch,
      staged: staged.text,
      unstaged: unstaged.text,
      untracked,
      recentCommits,
      truncated: staged.truncated || unstaged.truncated,
    };
  };

  ipcMain.handle('context:listFiles', listFiles);
  ipcMain.handle('context:readFile', readFile);
  ipcMain.handle('context:serializeNode', serialize);
  ipcMain.handle('context:writeContextBundle', writeBundle);
  ipcMain.handle('context:gitDiff', gitDiff);

  return () => {
    ipcMain.removeHandler('context:listFiles');
    ipcMain.removeHandler('context:readFile');
    ipcMain.removeHandler('context:serializeNode');
    ipcMain.removeHandler('context:writeContextBundle');
    ipcMain.removeHandler('context:gitDiff');
  };
}

module.exports = { registerContextIpc };
