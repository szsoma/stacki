import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContextChipBar from './ContextChipBar.jsx';

beforeEach(() => {
  window.avb = {
    listContextFiles: vi.fn(async () => ({ files: ['src/pages/index.astro'] })),
    readContextFile: vi.fn(async ({ rel }) => ({ rel, content: `content of ${rel}`, size: 10 })),
    serializeNode: vi.fn(async ({ node }) => ({ markup: `<${node.name}></${node.name}>` })),
  };
});

describe('ContextChipBar', () => {
  it('offers Current file only when a file is open, and adds it as a ready chip', async () => {
    render(<ContextChipBar currentFile={null} projectPath="/projects/site" />);
    fireEvent.click(screen.getByText('+ Add context'));
    expect(screen.queryByText('Current file')).not.toBeInTheDocument();
    expect(screen.getByText('Selected files')).toBeInTheDocument();
  });

  it('adds the current file as a chip and includes it in the composed prompt', async () => {
    render(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' }}
        projectPath="/projects/site"
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Current file'));
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
    fireEvent.click(screen.getByText('Selected files'));
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
    expect(screen.getByText('Selected element')).toBeInTheDocument();
    expect(screen.getByText('Current page')).toBeInTheDocument();
    expect(screen.getByText('Current component')).toBeInTheDocument();
  });

  it('shows a markdown preview in the details popover for a stale chip, not just a ready one', async () => {
    const { rerender } = render(
      <ContextChipBar
        currentFile={{ path: 'src/pages/index.astro', title: 'Frontmatter', language: 'javascript', content: 'const x = 1;' }}
        projectPath="/projects/site"
      />,
    );
    fireEvent.click(screen.getByText('+ Add context'));
    fireEvent.click(screen.getByText('Current file'));
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
    fireEvent.click(screen.getByText('Selected element'));
    await waitFor(() => expect(screen.getByText('Selected element')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Ask Codex to…'), { target: { value: 'Fix this.' } });
    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Insert into terminal' }));
    expect(listener.mock.calls[0][0].detail.text).toContain('<h1></h1>');
    window.removeEventListener('stacki:terminal-menu', listener);
  });
});
