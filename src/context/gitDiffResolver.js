import { CONTEXT_CHIP_TYPES } from './contextTypes.js';
import { scanForSecrets } from './secretScan.js';

export const gitDiffResolver = {
  type: CONTEXT_CHIP_TYPES.GIT_DIFF,
  label: 'Git diff',

  // Optimistic: a project being open is all that's checked synchronously.
  // Whether it's actually a Git repository can only be known by calling
  // getGitDiff(), which resolve() does — a non-repo shows up as this chip's
  // ERROR status with "This project is not a Git repository." (spec §26),
  // the same generic error-chip UX every other resolver already uses.
  isAvailable(appState) {
    return !!appState.projectPath;
  },

  getDefaultOptions() {
    return { scope: 'all' };
  },

  async resolve(appState, options) {
    const scope = options?.scope || 'all';
    const result = await appState.getGitDiff();
    const staged = scope === 'unstaged' ? '' : result.staged;
    const unstaged = scope === 'staged' ? '' : result.unstaged;
    const secretWarnings = scanForSecrets(`${staged}\n${unstaged}`);

    const data = {
      branch: result.branch,
      scope,
      staged,
      unstaged,
      untracked: result.untracked,
      recentCommits: result.recentCommits,
      truncated: result.truncated,
      secretWarnings,
    };

    return {
      data,
      estimatedCharacters: staged.length + unstaged.length + result.untracked.join('').length,
      sourceRevision: `${result.branch}:${staged.length + unstaged.length}`,
    };
  },

  renderMarkdown(snapshot) {
    const { branch, scope, staged, unstaged, untracked, recentCommits, truncated, secretWarnings } = snapshot.data;
    const lines = ['### Git diff', ''];
    if (secretWarnings.length > 0) {
      lines.push(`> ⚠️ Possible secret detected (${secretWarnings.join(', ')}) — review before sending.`, '');
    }
    lines.push(`- Branch: \`${branch}\``);
    lines.push(`- Scope: ${scope}`);
    if (recentCommits.length > 0) lines.push(`- Recent commits: ${recentCommits.join(' · ')}`);
    if (untracked.length > 0) lines.push(`- Untracked files: ${untracked.join(', ')}`);
    if (staged.trim()) lines.push('', 'Staged:', '', '```diff', staged.trim(), '```');
    if (unstaged.trim()) lines.push('', 'Unstaged:', '', '```diff', unstaged.trim(), '```');
    if (!staged.trim() && !unstaged.trim()) lines.push('', '_(no staged or unstaged changes)_');
    if (truncated) lines.push('', '_(diff truncated to keep the context a reasonable size)_');
    return lines.join('\n');
  },
};
