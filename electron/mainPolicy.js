// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
const path = require('node:path');
const { URL, fileURLToPath, pathToFileURL } = require('node:url');

function parsedUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function createTrustedRendererMatcher({ devServerUrl, packagedEntryPath }) {
  const devUrl = parsedUrl(devServerUrl);
  const trustedDevUrl =
    devUrl && (devUrl.protocol === 'http:' || devUrl.protocol === 'https:') ? devUrl : null;
  const trustedFileUrl = pathToFileURL(path.resolve(packagedEntryPath));
  const trustedFilePath = fileURLToPath(trustedFileUrl);

  return (candidateUrl) => {
    const candidate = parsedUrl(candidateUrl);
    if (!candidate) return false;

    if (trustedDevUrl) {
      return (
        candidate.protocol === trustedDevUrl.protocol &&
        candidate.origin === trustedDevUrl.origin &&
        !candidate.username &&
        !candidate.password
      );
    }

    if (
      candidate.protocol !== 'file:' ||
      candidate.host !== trustedFileUrl.host ||
      candidate.search
    ) {
      return false;
    }

    try {
      return fileURLToPath(candidate) === trustedFilePath;
    } catch {
      return false;
    }
  };
}

function transitionProjectRoot({ currentRoot, projectPath, disposeTerminal }) {
  const nextRoot = path.resolve(projectPath);
  if (currentRoot && currentRoot !== nextRoot) {
    disposeTerminal();
  }
  return nextRoot;
}

module.exports = { createTrustedRendererMatcher, transitionProjectRoot };
