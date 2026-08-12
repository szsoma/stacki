import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '../store/index';
import type { PageModel } from '../types/ast';
import PreviewPane from './PreviewPane';
import PropsPanel from './PropsPanel';
import StructurePanel from './StructurePanel';
import StylePanel from './StylePanel';

// The panels below read the open document straight off the store rather than
// taking it as props. That only works if every selector they subscribe to is
// referentially stable: zustand's useStore is built on useSyncExternalStore,
// which re-renders until two consecutive results compare equal under Object.is,
// so a selector that allocates per call takes the panel down with "Maximum
// update depth exceeded" instead of rendering. These tests mount each panel
// against real store state and fail loudly if that regresses.

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

const model: PageModel = {
  imports: [{ name: 'Layout', path: '../layouts/BaseLayout.astro' }],
  extraFrontmatter: '',
  nodes: [
    {
      id: 'layout',
      kind: 'component' as const,
      name: 'Layout',
      props: {},
      children: [
        {
          id: 'nested',
          kind: 'element' as const,
          name: 'p',
          props: {},
          children: [],
        },
      ],
    },
    // Kept at the root: anything with children starts collapsed, so a nested
    // node would not be in the DOM to assert on.
    {
      id: 'hero',
      kind: 'element' as const,
      name: 'a',
      props: { class: { type: 'string' as const, value: 'hero-link' } },
      children: [],
    },
  ],
};

function seedProject() {
  useAppStore.setState({
    project: { path: '/p', name: 'demo' },
    scan: {
      pages: [{ name: 'index.astro', path: '/p/src/pages/index.astro', route: '/' }],
      layouts: [
        {
          name: 'BaseLayout',
          path: '/p/src/layouts/BaseLayout.astro',
          slots: ['default', 'footer'],
        },
      ],
      components: [],
    },
    pageState: { editable: true, model, dirty: false },
  });
}

beforeEach(() => {
  window.avb = {
    listStyleFiles: vi.fn(async () => ({ files: [] })),
  } as unknown as typeof window.avb;
  seedProject();
});

describe('StructurePanel', () => {
  it('renders the tree from the store', () => {
    render(<StructurePanel />);
    expect(screen.getByText('Navigator')).toBeInTheDocument();
    // The layout wrapper resolves through its import alias to the scanned name.
    expect(screen.getByText('BaseLayout')).toBeInTheDocument();
    // An element with a class is labelled by its first class, not its tag.
    expect(screen.getByText('hero-link')).toBeInTheDocument();
  });

  it('follows a selection made on the store', () => {
    render(<StructurePanel />);
    expect(document.querySelector('.structure-node.selected')).toBeNull();
    act(() => useAppStore.getState().select('hero'));
    expect(document.querySelector('[data-node-id="hero"].selected')).toBeTruthy();
  });
});

describe('PropsPanel', () => {
  it('prompts for a selection when nothing is selected', () => {
    render(<PropsPanel />);
    expect(screen.getByText(/Select a component to edit its props/i)).toBeInTheDocument();
  });

  it('renders the built-in attribute schema of the selected element', () => {
    useAppStore.getState().select('hero');
    render(<PropsPanel />);
    // <a> contributes href/target/rel through the element schema.
    expect(screen.getByText('href')).toBeInTheDocument();
    expect(screen.getByText('target')).toBeInTheDocument();
  });

  it('shows the layout badge and picker when the wrapper is selected', () => {
    useAppStore.getState().select('layout');
    render(<PropsPanel />);
    expect(screen.getByText('layout')).toBeInTheDocument();
    // The panel title and the layout picker's trigger both name the layout.
    expect(screen.getAllByText('BaseLayout').length).toBeGreaterThanOrEqual(2);
  });

  it('re-renders when the selection changes on the store', () => {
    render(<PropsPanel />);
    expect(screen.getByText(/Select a component to edit its props/i)).toBeInTheDocument();
    act(() => useAppStore.getState().select('hero'));
    expect(screen.getByText('href')).toBeInTheDocument();
  });

  it('opens the frontmatter pseudo-node in its own editor', () => {
    useAppStore.getState().select('frontmatter');
    render(<PropsPanel />);
    expect(screen.getByText(/frontmatter/i)).toBeInTheDocument();
  });
});

describe('StylePanel', () => {
  it('asks for a selection when nothing is selected', () => {
    render(<StylePanel />);
    expect(screen.getByText(/Select an element to style it/i)).toBeInTheDocument();
  });

  it('renders nothing without an open project', () => {
    useAppStore.setState({ project: null });
    const { container } = render(<StylePanel />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PreviewPane', () => {
  it('offers to start the dev server when it is off', () => {
    render(<PreviewPane />);
    expect(screen.getByRole('button', { name: /Start dev server/i })).toBeInTheDocument();
  });

  it('follows the dev server status on the store', () => {
    render(<PreviewPane />);
    act(() => useAppStore.getState().setDevStatus('starting'));
    expect(screen.getByText(/Starting Astro dev server/i)).toBeInTheDocument();
  });
});
