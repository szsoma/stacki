// Converts an absolute path (as returned by the project scanner —
// electron/main.js's listAstroFiles walks with path.join from an absolute
// project root) into the project-relative form every resolver's data uses.
// Mirrors the private toProjectRelativePath in src/App.jsx:341-349.
export function toProjectRelativePath(root, absolutePath) {
  if (!absolutePath) return null;
  if (!root) return absolutePath;
  let rel = absolutePath;
  if (rel.startsWith(root)) {
    rel = rel.slice(root.length);
  }
  return rel.replace(/^[\\/]+/, '');
}
