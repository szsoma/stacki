// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { I18nProvider } from './i18n/I18nContext.jsx';

const harness = vi.hoisted(() => ({ menu: new Map() }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => {};

vi.mock('./panels/WelcomeScreen.jsx', () => ({
  default: ({ onOpen }) => (
    <button type="button" onClick={() => onOpen('/projects/one')}>
      Open project
    </button>
  ),
}));
vi.mock('./panels/TerminalPanel.jsx', () => ({ default: () => null }));
vi.mock('./panels/PreviewPane.tsx', () => ({
  default: () => <div className="preview-frame-wrap" />,
}));
vi.mock('./panels/GitChip.jsx', () => ({ default: () => null }));

const subscribe = vi.fn(() => vi.fn());

let writePage;

function makeWrappedModel(layoutName = 'BaseLayout') {
  return {
    imports: [{ name: layoutName, path: `../layouts/${layoutName}.astro` }],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'layout',
        kind: 'component',
        name: layoutName,
        props: {},
        children: [
          { id: 'n1', kind: 'element', name: 'h1', props: {}, children: [] },
        ],
      },
    ],
  };
}

function setupAvb(model) {
  writePage = vi.fn(async () => ({ ok: true }));
  window.avb = {
    addRecent: vi.fn(),
    hasNodeModules: vi.fn(async () => true),
    listProjectClasses: vi.fn(async () => []),
    listStyleFiles: vi.fn(async () => ({ files: [] })),
    nativeCopy: vi.fn(),
    nativePaste: vi.fn(),
    onDevExit: subscribe,
    onDevLog: subscribe,
    onFsChanged: subscribe,
    onMenu: vi.fn((name, callback) => {
      harness.menu.set(name, callback);
      return vi.fn();
    }),
    onProgress: subscribe,
    scanProject: vi.fn(async () => ({
      pages: [{ name: 'index', path: '/projects/one/src/pages/index.astro', route: '/' }],
      layouts: [
        { name: 'BaseLayout', path: '/projects/one/src/layouts/BaseLayout.astro', schema: [], slots: [] },
        { name: 'BlogLayout', path: '/projects/one/src/layouts/BlogLayout.astro', schema: [], slots: [] },
      ],
      components: [],
    })),
    readPage: vi.fn(async () => ({
      editable: true,
      model: model(),
      source: '',
    })),
    writePage,
    writePageRaw: vi.fn(async () => ({ ok: true })),
    startDevServer: vi.fn(async () => ({ url: 'http://localhost:4321', external: false })),
    watchProject: vi.fn(),
    importPathFor: vi.fn(async () => ({
      relative: '../layouts/BlogLayout.astro',
      srcRelative: '@/layouts/BlogLayout.astro',
    })),
  };
}

async function openProject() {
  render(<I18nProvider><App /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
  await screen.findByTitle('Dev server: on');
}

describe('App layout changes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.menu.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renames the wrapper in place when switching between layouts', async () => {
    setupAvb(makeWrappedModel);
    await openProject();

    // The navigator tab is the default. Wait for the node to appear.
    await screen.findByText('BaseLayout');

    // Select the layout node and open settings.
    fireEvent.click(screen.getByText('BaseLayout'));
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));

    // The Layout dropdown trigger shows "BaseLayout". Click it to open options.
    // After selecting the layout node, "BaseLayout" appears both in the
    // navigator tree and in the settings panel title — getAllByText handles both.
    await waitFor(() => {
      const texts = screen.getAllByText('BaseLayout');
      expect(texts.length).toBeGreaterThanOrEqual(2);
    });
    const ddTriggers = document.querySelectorAll('.dd-trigger');
    expect(ddTriggers.length).toBeGreaterThanOrEqual(1);

    // Click the trigger to open the popup, then click BlogLayout.
    fireEvent.click(ddTriggers[0]);
    await waitFor(() => {
      expect(document.querySelector('.dd-popup')).toBeInTheDocument();
    });
    // Find and click the BlogLayout option in the popup.
    const options = document.querySelectorAll('.dd-option-label');
    const blogLabel = Array.from(options).find((el) => el.textContent === 'BlogLayout');
    if (!blogLabel) throw new Error('BlogLayout option not found in dropdown');
    fireEvent.click(blogLabel);

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(writePage).toHaveBeenCalled());

    const { model } = writePage.mock.calls.at(-1)[0];
    expect(model.nodes[0].name).toBe('BlogLayout');
    expect(model.imports.map((i) => i.name)).toEqual(['BlogLayout']);
  });

  it('shows the layout badge and name when the wrapper is selected', async () => {
    setupAvb(makeWrappedModel);
    await openProject();

    await screen.findByText('BaseLayout');
    fireEvent.click(screen.getByText('BaseLayout'));
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));

    // The settings panel should show "BaseLayout" with a "layout" badge.
    // After selection, "BaseLayout" text appears both in navigator and settings.
    await waitFor(() => {
      const texts = screen.getAllByText('BaseLayout');
      expect(texts.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('layout')).toBeInTheDocument();
  });

  it('does not show the layout picker for a non-layout element', async () => {
    // Use an unwrapped model — the h1 is at the root level.
    setupAvb(() => ({
      imports: [],
      extraFrontmatter: '',
      nodes: [
        { id: 'n1', kind: 'element', name: 'h1', props: {}, children: [] },
      ],
    }));
    await openProject();

    // Select the h1 element and open settings.
    await screen.findByText('h1');
    fireEvent.click(screen.getByText('h1'));
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));

    // The layout dropdown should not be visible.
    const ddTriggers = document.querySelectorAll('.dd-trigger');
    expect(ddTriggers.length).toBe(0);
  });
});
