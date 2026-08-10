import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextChipBar from './ContextChipBar.jsx';

beforeEach(() => {
  window.avb = {
    listContextFiles: vi.fn(async () => ({ files: ['src/pages/index.astro'] })),
    readContextFile: vi.fn(async ({ rel }) => ({ rel, content: `content of ${rel}`, size: 10 })),
    serializeNode: vi.fn(async ({ node }) => ({ markup: `<${node.name}></${node.name}>` })),
    getGitDiff: vi.fn(async () => ({
      isRepo: true,
      branch: 'main',
      staged: '',
      unstaged: '',
      untracked: [],
      recentCommits: [],
      truncated: false,
    })),
    writeContextBundle: vi.fn(async () => ({ relPath: '.stacki/tmp/context/request-1.md' })),
  };
});

describe('ContextChipBar', () => {
  it('offers Current file only when a file is open, and adds it as a ready chip', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Current file')).not.toBeInTheDocument();
    expect(within(document.querySelector('.context-picker')).getByText('Selected files')).toBeInTheDocument();
  });

  it('adds the current file as a chip and includes it in the composed prompt', async () => {
    render(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' }}
        projectPath="/projects/site"
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(within(document.querySelector('.context-picker')).getByText('Current file'));
    await waitFor(() => expect(screen.getByText('Current file')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix the spacing.' } });

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.action).toBe('insert');
    expect(listener.mock.calls[0][0].detail.text).toContain('const x = 1;');
    expect(listener.mock.calls[0][0].detail.text).toContain('Fix the spacing.');
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('adds selected files through the file picker', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(within(document.querySelector('.context-picker')).getByText('Selected files'));
    await waitFor(() => expect(screen.getByText('src/pages/index.astro')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('src/pages/index.astro'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 file' }));

    await waitFor(() => expect(screen.getByText('Selected files')).toBeInTheDocument());
    expect(window.avb.readContextFile).toHaveBeenCalledWith({
      projectPath: '/projects/site',
      rel: 'src/pages/index.astro',
    });
  });

  it('disables Insert into terminal until there is prompt text', () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    expect(screen.getByRole('button', { name: 'Insert into terminal' })).toBeDisabled();
  });

  it('offers Selected element, Current page, and Current component only when editor context supports them', () => {
    const { rerender } = render(
      <ContextChipBar currentFile={null} projectPath="/projects/site" editorContext={{}} />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Selected element')).not.toBeInTheDocument();
    expect(screen.queryByText('Current page')).not.toBeInTheDocument();
    expect(screen.queryByText('Current component')).not.toBeInTheDocument();

    const selectedNode = { id: 'h1', kind: 'element', name: 'h1', props: {}, children: null };
    const nodeTree = [
      { id: 'hero', kind: 'component', name: 'HeroSection', props: {}, children: [selectedNode] },
    ];
    const componentDefinitions = [
      { name: 'HeroSection', path: '/projects/site/src/components/HeroSection.astro' },
    ];
    rerender(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{
          selectedNode,
          nodeTree,
          componentDefinitions,
          pageInfo: {
            editable: true,
            route: '/',
            path: 'src/pages/index.astro',
            layoutName: '',
            imports: [],
            frontmatter: '',
          },
        }}
      />,
    );
    expect(within(document.querySelector('.context-picker')).getByText('Selected element')).toBeInTheDocument();
    expect(within(document.querySelector('.context-picker')).getByText('Current page')).toBeInTheDocument();
    expect(within(document.querySelector('.context-picker')).getByText('Current component')).toBeInTheDocument();
  });

  it('shows a markdown preview in the details popover for a stale chip, not just a ready one', async () => {
    const { rerender } = render(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' }}
        projectPath="/projects/site"
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(within(document.querySelector('.context-picker')).getByText('Current file'));
    await waitFor(() => expect(screen.getByText('Current file')).toBeInTheDocument());

    // Change the file's content — the chip's stale key (a hash of path +
    // content) no longer matches, so useTerminalContext's staleness effect
    // flips it to STALE, while still holding onto its last-resolved data.
    rerender(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 2;' }}
        projectPath="/projects/site"
      />,
    );

    fireEvent.click(screen.getByText('Current file'));
    // The popover's preview must still show the (now-stale) markdown —
    // this exercises ContextChipBar's detailsMarkdown guard, which must
    // compute markdown for 'stale' chips, not only 'ready' ones.
    expect(await screen.findByText(/const x = 1;/)).toBeInTheDocument();
  });

  it('adds a Selected element chip and includes its serialized markup in the composed prompt', async () => {
    const selectedNode = { id: 'h1', kind: 'element', name: 'h1', props: {}, children: null };
    render(
      <ContextChipBar
        currentFile={null}
        projectPath="/projects/site"
        editorContext={{ selectedNode, nodeTree: [selectedNode], componentDefinitions: [] }}
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(within(document.querySelector('.context-picker')).getByText('Selected element'));
    await waitFor(() => expect(screen.getByText('Selected element')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix this.' } });
    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));
    expect(listener.mock.calls[0][0].detail.text).toContain('<h1></h1>');
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('offers Console errors only when the dev log has captured problems', () => {
    const { rerender } = render(<ContextChipBar currentFile={null} projectPath="/projects/site" devLog="" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Console errors')).not.toBeInTheDocument();

    rerender(<ContextChipBar currentFile={null} projectPath="/projects/site" devLog="Error: build failed" />);
    expect(within(document.querySelector('.context-picker')).getByText('Console errors')).toBeInTheDocument();
  });

  it('offers Git diff whenever a project is open', () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(within(document.querySelector('.context-picker')).getByText('Git diff')).toBeInTheDocument();
  });

  it('shows a context-size indicator only once a chip is attached, reflecting the composed size', async () => {
    const bigContent = 'x'.repeat(20000);
    render(
      <ContextChipBar
        currentFile={{ path: 'big.astro', title: 'big', language: 'astro', content: bigContent }}
        projectPath="/projects/site"
      />,
    );
    expect(screen.queryByText(/Context: ~/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(within(document.querySelector('.context-picker')).getByText('Current file'));
    await waitFor(() => expect(screen.getByText('Current file')).toBeInTheDocument());

    const indicator = await screen.findByText(/Context: ~/);
    expect(indicator.className).toContain('warning');
  });

  it('writes a context-file bundle and inserts a short reference when a Git diff chip forces file delivery', async () => {
    window.avb.getGitDiff = vi.fn(async () => ({
      isRepo: true,
      branch: 'main',
      staged: '',
      unstaged: 'diff --git a/x.astro b/x.astro\n+change',
      untracked: [],
      recentCommits: [],
      truncated: false,
    }));

    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(within(document.querySelector('.context-picker')).getByText('Git diff'));
    await waitFor(() => expect(screen.getByText('Git diff')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Continue this change.' } });
    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));

    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(window.avb.writeContextBundle).toHaveBeenCalledWith({
      projectPath: '/projects/site',
      markdown: expect.stringContaining('Continue this change.'),
    });
    expect(listener.mock.calls[0][0].detail.text).toBe(
      'Read the Stacki context at:\n\n.stacki/tmp/context/request-1.md\n\nThen complete this request:\n\nContinue this change.',
    );
    window.removeEventListener('stacki:terminal-menu', listener);
  });
});
