// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { I18nProvider } from './i18n/I18nContext.jsx';
import { getState } from './store/index.ts';

const harness = vi.hoisted(() => ({ menu: new Map(), gitChipProps: null }));

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
vi.mock('./panels/GitChip.jsx', () => ({
  default: (props) => {
    harness.gitChipProps = props;
    return null;
  },
}));

function makeModel() {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'n1',
        kind: 'element',
        name: 'section',
        props: { id: { type: 'string', value: 'hero' } },
        children: [],
      },
    ],
  };
}

let writePage;

function setupAvb() {
  const subscribe = vi.fn(() => vi.fn());
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
      layouts: [],
      components: [],
    })),
    readPage: vi.fn(async () => ({ editable: true, model: makeModel(), source: '' })),
    writePage,
    writePageRaw: vi.fn(async () => ({ ok: true })),
    startDevServer: vi.fn(async () => ({ url: 'http://localhost:4321', external: false })),
    watchProject: vi.fn(),
  };
}

async function openProjectWithPage() {
  const view = render(<I18nProvider><App /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
  await screen.findByTitle('Dev server: on');
  fireEvent.click(await screen.findByText('section'));
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  await screen.findByText('hero');
  return view;
}

async function openAttrEditor() {
  fireEvent.click(screen.getByText('hero'));
  return screen.findByDisplayValue('hero');
}

describe('App save scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.menu.clear();
    harness.gitChipProps = null;
    setupAvb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches keystrokes into a single write after 300ms of quiet', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();

    fireEvent.change(field, { target: { value: 'a' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'ab' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'abc' } });

    // Still inside the debounce window: nothing written yet.
    expect(writePage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(writePage).toHaveBeenCalledTimes(1));
    expect(writePage.mock.calls[0][0].model.nodes[0].props.id.value).toBe('abc');
  });

  it('writes the model, not the raw source, for an editable page', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'z' } });
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(writePage).toHaveBeenCalled());
    expect(window.avb.writePageRaw).not.toHaveBeenCalled();
    expect(writePage.mock.calls[0][0]).toHaveProperty('pagePath');
  });

  it('does not write when nothing is dirty', async () => {
    await openProjectWithPage();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writePage).not.toHaveBeenCalled();
  });

  it('keeps the document dirty when a synchronous flush rejects', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'unsaved' } });
    writePage.mockRejectedValueOnce(new Error('disk full'));

    await expect(harness.gitChipProps.flushSave()).rejects.toThrow('disk full');

    expect(harness.gitChipProps.project.path).toBe('/projects/one');
    const { dirty, pageState } = getState();
    expect(dirty).toBe(true);
    expect(pageState.dirty).toBe(true);
  });

  it('cancels a pending save when reloading the current document from disk', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'discard me' } });
    let resolveRead;
    const deferredRead = new Promise((resolve) => { resolveRead = resolve; });
    window.avb.readPage.mockImplementationOnce(() => deferredRead);

    const reload = harness.gitChipProps.onWorktreeChanged();
    await vi.advanceTimersByTimeAsync(500);
    expect(writePage).not.toHaveBeenCalled();
    resolveRead({ editable: true, model: makeModel(), source: '' });
    await reload;

    expect(writePage).not.toHaveBeenCalled();
    expect(getState().dirty).toBe(false);
    expect(getState().pageState.model.nodes[0].props.id.value).toBe('hero');
  });

  it('cancels a pending save when reload discovers the current file was removed', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'discard me' } });
    let resolveScan;
    window.avb.scanProject.mockImplementationOnce(() =>
      new Promise((resolve) => { resolveScan = resolve; })
    );

    const reload = harness.gitChipProps.onWorktreeChanged();
    await vi.advanceTimersByTimeAsync(500);
    expect(writePage).not.toHaveBeenCalled();
    resolveScan({ pages: [], layouts: [], components: [] });
    await reload;
    await vi.advanceTimersByTimeAsync(500);

    expect(writePage).not.toHaveBeenCalled();
    expect(getState().currentPage).toBeNull();
    expect(getState().pageState).toBeNull();
  });

  it('preserves the captured origin save when unmounted during the debounce', async () => {
    const { unmount } = await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'survive unmount' } });

    unmount();
    await vi.advanceTimersByTimeAsync(300);

    expect(writePage).toHaveBeenCalledTimes(1);
    expect(writePage.mock.calls[0][0].pagePath).toBe('/projects/one/src/pages/index.astro');
    expect(writePage.mock.calls[0][0].model.nodes[0].props.id.value).toBe('survive unmount');
  });

  it('keeps a pending origin save when reload fails before replacement', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'survive reload failure' } });
    let rejectRead;
    window.avb.readPage.mockImplementationOnce(() =>
      new Promise((_, reject) => { rejectRead = reject; })
    );

    const reload = harness.gitChipProps.onWorktreeChanged();
    await vi.advanceTimersByTimeAsync(500);
    expect(writePage).not.toHaveBeenCalled();
    rejectRead(new Error('read failed'));
    await expect(reload).rejects.toThrow('read failed');
    await vi.advanceTimersByTimeAsync(300);

    expect(writePage).toHaveBeenCalledTimes(1);
    expect(writePage.mock.calls[0][0].model.nodes[0].props.id.value).toBe('survive reload failure');
  });

  it('does not overwrite an edit made while a successful reload read is pending', async () => {
    await openProjectWithPage();
    let resolveRead;
    window.avb.readPage.mockImplementationOnce(() =>
      new Promise((resolve) => { resolveRead = resolve; })
    );
    const reload = harness.gitChipProps.onWorktreeChanged();
    await vi.advanceTimersByTimeAsync(1);

    getState().mutateModel((model) => ({ ...model, extraFrontmatter: 'newest edit' }));
    await vi.advanceTimersByTimeAsync(300);
    resolveRead({ editable: true, model: makeModel(), source: '' });
    await reload;

    expect(writePage).toHaveBeenCalledTimes(1);
    expect(writePage.mock.calls[0][0].model.extraFrontmatter).toBe('newest edit');
    expect(getState().pageState.model.extraFrontmatter).toBe('newest edit');
  });

  it('does not restore an older suspended save over an edit made during failed reload', async () => {
    await openProjectWithPage();
    let rejectRead;
    window.avb.readPage.mockImplementationOnce(() =>
      new Promise((_, reject) => { rejectRead = reject; })
    );
    const reload = harness.gitChipProps.onWorktreeChanged();
    await vi.advanceTimersByTimeAsync(1);

    getState().mutateModel((model) => ({ ...model, extraFrontmatter: 'newest edit' }));
    await vi.advanceTimersByTimeAsync(300);
    rejectRead(new Error('read failed'));
    await expect(reload).rejects.toThrow('read failed');
    await vi.advanceTimersByTimeAsync(500);

    expect(writePage).toHaveBeenCalledTimes(1);
    expect(writePage.mock.calls[0][0].model.extraFrontmatter).toBe('newest edit');
    expect(getState().pageState.model.extraFrontmatter).toBe('newest edit');
  });
});
