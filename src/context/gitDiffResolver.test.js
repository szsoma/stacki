import { describe, expect, it, vi } from 'vitest';
import { gitDiffResolver } from './gitDiffResolver.js';

function baseAppState(overrides = {}) {
  return {
    projectPath: '/projects/site',
    getGitDiff: vi.fn(async () => ({
      isRepo: true,
      branch: 'main',
      staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
      unstaged: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n',
      untracked: ['new-file.txt'],
      recentCommits: ['abc123 Fix bug'],
      truncated: false,
    })),
    ...overrides,
  };
}

describe('gitDiffResolver', () => {
  it('is unavailable without an open project', () => {
    expect(gitDiffResolver.isAvailable({ projectPath: null })).toBe(false);
  });

  it('is available with an open project (the real Git-repo check happens on resolve)', () => {
    expect(gitDiffResolver.isAvailable({ projectPath: '/projects/site' })).toBe(true);
  });

  it('defaults to the all-changes scope', () => {
    expect(gitDiffResolver.getDefaultOptions()).toEqual({ scope: 'all' });
  });

  it('resolves branch, both diffs, untracked files, and recent commits for scope "all"', async () => {
    const appState = baseAppState();
    const result = await gitDiffResolver.resolve(appState, { scope: 'all' });
    expect(appState.getGitDiff).toHaveBeenCalled();
    expect(result.data).toEqual({
      branch: 'main',
      scope: 'all',
      staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
      unstaged: 'diff --git a/unstaged.txt b/unstaged.txt\n+unstaged change\n',
      untracked: ['new-file.txt'],
      recentCommits: ['abc123 Fix bug'],
      truncated: false,
      secretWarnings: [],
    });
    expect(result.estimatedCharacters).toBeGreaterThan(0);
  });

  it('zeroes out the unstaged diff for scope "staged"', async () => {
    const result = await gitDiffResolver.resolve(baseAppState(), { scope: 'staged' });
    expect(result.data.staged).toContain('staged change');
    expect(result.data.unstaged).toBe('');
  });

  it('zeroes out the staged diff for scope "unstaged"', async () => {
    const result = await gitDiffResolver.resolve(baseAppState(), { scope: 'unstaged' });
    expect(result.data.unstaged).toContain('unstaged change');
    expect(result.data.staged).toBe('');
  });

  it('surfaces a secret warning found in the diff text', async () => {
    const appState = baseAppState({
      getGitDiff: vi.fn(async () => ({
        isRepo: true,
        branch: 'main',
        staged: '',
        unstaged: '+AWS_KEY = "AKIAABCDEFGHIJKLMNOP"',
        untracked: [],
        recentCommits: [],
        truncated: false,
      })),
    });
    const result = await gitDiffResolver.resolve(appState, { scope: 'all' });
    expect(result.data.secretWarnings).toEqual(['AWS access key']);
  });

  it('propagates a "not a Git repository" rejection from getGitDiff', async () => {
    const appState = baseAppState({
      getGitDiff: vi.fn(async () => {
        throw new Error('This project is not a Git repository.');
      }),
    });
    await expect(gitDiffResolver.resolve(appState, { scope: 'all' })).rejects.toThrow(
      'This project is not a Git repository.',
    );
  });

  it('renders branch, commits, untracked files, and fenced diffs as Markdown', () => {
    const snapshot = {
      data: {
        branch: 'main',
        staged: 'diff --git a/staged.txt b/staged.txt\n+staged change\n',
        unstaged: '',
        untracked: ['new-file.txt'],
        recentCommits: ['abc123 Fix bug'],
        truncated: false,
        secretWarnings: [],
      },
    };
    const markdown = gitDiffResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Git diff');
    expect(markdown).toContain('Branch: `main`');
    expect(markdown).toContain('Recent commits: abc123 Fix bug');
    expect(markdown).toContain('Untracked files: new-file.txt');
    expect(markdown).toContain('```diff');
    expect(markdown).toContain('+staged change');
  });

  it('renders a secret-warning callout when present', () => {
    const snapshot = {
      data: {
        branch: 'main',
        staged: '',
        unstaged: '+AWS_KEY = "AKIAABCDEFGHIJKLMNOP"',
        untracked: [],
        recentCommits: [],
        truncated: false,
        secretWarnings: ['AWS access key'],
      },
    };
    const markdown = gitDiffResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('Possible secret detected (AWS access key)');
  });

  it('has no computeStaleKey — Git Diff never auto-stales', () => {
    expect(gitDiffResolver.computeStaleKey).toBeUndefined();
  });
});
