export function toPreviewScope(
  filePath: string | null | undefined,
  projectRoot: string | null | undefined
): string | null {
  if (!filePath || !projectRoot) return null;

  const normalize = (input: string) => {
    const slashed = input.replace(/\\/g, '/');
    const drive = slashed.match(/^[A-Za-z]:/)?.[0] ?? '';
    const absolute = drive ? slashed.slice(drive.length).startsWith('/') : slashed.startsWith('/');
    const segments: string[] = [];
    for (const segment of slashed.slice(drive.length).split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        if (segments.length) segments.pop();
        else if (!absolute) segments.push(segment);
      } else {
        segments.push(segment);
      }
    }
    return `${drive}${absolute ? '/' : ''}${segments.join('/')}`;
  };

  const file = normalize(filePath);
  const root = normalize(projectRoot);
  const windows = /^[A-Za-z]:\//.test(file) || /^[A-Za-z]:\//.test(root);
  const comparedFile = windows ? file.toLowerCase() : file;
  const comparedRoot = windows ? root.toLowerCase() : root;
  const prefix = `${root}/`;

  if (comparedFile === comparedRoot) return null;
  return comparedFile.startsWith(`${comparedRoot}/`) ? file.slice(prefix.length) : null;
}
