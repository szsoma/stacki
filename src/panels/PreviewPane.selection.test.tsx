import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '../store';
import type { PageModel } from '../types/ast';
import PreviewPane, { type PreviewNodeHit } from './PreviewPane';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const model: PageModel = {
  imports: [],
  extraFrontmatter: '',
  nodes: [
    {
      id: 'section',
      kind: 'element',
      name: 'section',
      props: {},
      children: [{ id: 'hero', kind: 'element', name: 'div', props: {}, children: [] }],
    },
  ],
};

const overlayInfo = () => ({
  label: 'Hero',
  kind: 'element',
  tag: 'div',
  nodeKind: 'element',
  isLayout: false,
  bound: false,
});

const baseProps = {
  route: '/',
  activeScope: 'src/components/Hero.astro',
  pageScope: 'src/pages/index.astro',
  focusPath: '0.1',
  selPath: '0.0',
  overlayInfo,
};

function send(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      origin: 'http://localhost:4321',
      data,
    }));
  });
}

beforeEach(() => {
  useAppStore.setState({
    devUrl: 'http://localhost:4321',
    devStatus: 'on',
    device: 'desktop',
    pageState: { editable: true, model, dirty: false },
    hiddenNodes: new Set(['hero']),
  });
});

describe('PreviewPane scoped selection protocol', () => {
  it('posts scoped tracking state when the iframe loads', () => {
    const { getByTitle } = render(<PreviewPane {...baseProps} />);
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    postMessage.mockClear();

    fireEvent.load(frame);

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'avb:track',
        activeScope: 'src/components/Hero.astro',
        pageScope: 'src/pages/index.astro',
        paths: expect.arrayContaining(['0.0']),
        focusPath: '0.1',
        hiddenPaths: ['0.0'],
      },
      'http://localhost:4321'
    );
  });

  it('forwards complete scoped click and open hits from its iframe', () => {
    const onSelectNode = vi.fn<(hit: PreviewNodeHit) => void>();
    const onOpenNode = vi.fn<(hit: PreviewNodeHit) => void>();
    const { getByTitle } = render(
      <PreviewPane {...baseProps} onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
    );
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    const hit = {
      scope: 'src/components/Hero.astro',
      path: '0.0',
      pagePath: '0.2',
      occurrence: 2,
    };

    send(frame, { type: 'avb:click-node', ...hit });
    send(frame, { type: 'avb:open-node', ...hit });

    expect(onSelectNode).toHaveBeenCalledWith(hit);
    expect(onOpenNode).toHaveBeenCalledWith(hit);
  });

  it('only shows component-local hover for the active scope', () => {
    const { container, getByTitle } = render(<PreviewPane {...baseProps} selPath={null} />);
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    send(frame, {
      type: 'avb:rects',
      rects: { '0.0': [{ x: 1, y: 2, w: 30, h: 40 }] },
      focusRects: [],
    });
    send(frame, {
      type: 'avb:hover-node',
      scope: 'src/components/Hero.astro',
      path: '0.0',
      pagePath: '0.2',
      occurrence: 0,
    });
    expect(container.querySelector('.node-outline.hover')).not.toBeNull();

    send(frame, {
      type: 'avb:hover-node',
      scope: 'src/components/Other.astro',
      path: '0.0',
      pagePath: '0.2',
      occurrence: 0,
    });
    expect(container.querySelector('.node-outline.hover')).toBeNull();
  });

  it('renders active selection rects separately from page focus rects', () => {
    const { container, getByTitle } = render(<PreviewPane {...baseProps} />);
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    send(frame, {
      type: 'avb:rects',
      rects: { '0.0': [{ x: 1, y: 2, w: 30, h: 40 }] },
      focusRects: [{ x: 11, y: 12, w: 130, h: 140 }],
    });

    expect(container.querySelector<HTMLElement>('.node-outline.sel')).toHaveStyle({
      left: '1px', top: '2px', width: '30px', height: '40px',
    });
    expect(container.querySelector<HTMLElement>('.node-focus')).toHaveStyle({
      left: '11px', top: '12px', width: '130px', height: '140px',
    });
  });

  it('marks selected and hovered outlines only while editing a component scope', () => {
    const { container, getByTitle, rerender } = render(<PreviewPane {...baseProps} />);
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    send(frame, {
      type: 'avb:rects',
      rects: {
        '0.0': [{ x: 1, y: 2, w: 30, h: 40 }],
        '0.1': [{ x: 5, y: 6, w: 20, h: 25 }],
      },
      focusRects: [],
    });
    send(frame, {
      type: 'avb:hover-node', scope: baseProps.activeScope, path: '0.1', pagePath: '0.3', occurrence: 0,
    });

    expect(container.querySelector('.node-outline.sel')).toHaveClass('component-edit');
    expect(container.querySelector('.node-outline.hover')).toHaveClass('component-edit');

    rerender(<PreviewPane {...baseProps} activeScope={baseProps.pageScope} />);
    send(frame, {
      type: 'avb:rects',
      rects: {
        '0.0': [{ x: 1, y: 2, w: 30, h: 40 }],
        '0.1': [{ x: 5, y: 6, w: 20, h: 25 }],
      },
      focusRects: [],
    });
    send(frame, {
      type: 'avb:hover-node', scope: baseProps.pageScope, path: '0.1', pagePath: '0.1', occurrence: 0,
    });

    expect(container.querySelector('.node-outline.sel')).not.toHaveClass('component-edit');
    expect(container.querySelector('.node-outline.hover')).not.toHaveClass('component-edit');
  });

  it('clears rect and hover state when the active scope changes', () => {
    const { container, getByTitle, rerender } = render(<PreviewPane {...baseProps} selPath={null} />);
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    send(frame, {
      type: 'avb:rects',
      rects: { '0.0': [{ x: 1, y: 2, w: 30, h: 40 }] },
      focusRects: [{ x: 11, y: 12, w: 130, h: 140 }],
    });
    send(frame, {
      type: 'avb:hover-node', scope: baseProps.activeScope, path: '0.0', pagePath: null, occurrence: 0,
    });
    expect(container.querySelector('.node-outline.hover')).not.toBeNull();
    expect(container.querySelector('.node-focus')).not.toBeNull();

    rerender(<PreviewPane {...baseProps} activeScope="src/components/Card.astro" selPath={null} />);

    expect(container.querySelector('.node-outline.hover')).toBeNull();
    expect(container.querySelector('.node-focus')).toBeNull();
  });

  it('resets occurrence and scroll suppression when the active scope changes', () => {
    const onSelectNode = vi.fn<(hit: PreviewNodeHit) => void>();
    const { container, getByTitle, rerender } = render(
      <PreviewPane {...baseProps} onSelectNode={onSelectNode} />
    );
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    send(frame, {
      type: 'avb:click-node', scope: baseProps.activeScope, path: '0.0', pagePath: '0.2', occurrence: 2,
    });
    postMessage.mockClear();

    rerender(<PreviewPane {...baseProps} activeScope="src/components/Card.astro" />);
    send(frame, {
      type: 'avb:rects',
      rects: { '0.0': [
        { x: 1, y: 2, w: 10, h: 10 }, { x: 21, y: 22, w: 10, h: 10 }, { x: 41, y: 42, w: 10, h: 10 },
      ] },
      focusRects: [],
    });

    expect(container.querySelector<HTMLElement>('.node-outline.sel')).toHaveStyle({ left: '1px' });
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'avb:scroll-to', path: '0.0' },
      'http://localhost:4321'
    );
  });

  it('rejects messages from the wrong origin', () => {
    const onSelectNode = vi.fn<(hit: PreviewNodeHit) => void>();
    const { getByTitle } = render(<PreviewPane {...baseProps} onSelectNode={onSelectNode} />);
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    act(() => window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      origin: 'https://evil.example',
      data: { type: 'avb:click-node', scope: baseProps.activeScope, path: '0.0', pagePath: null, occurrence: 0 },
    })));
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('ignores malformed rect and hit payloads', () => {
    const onSelectNode = vi.fn<(hit: PreviewNodeHit) => void>();
    const onOpenNode = vi.fn<(hit: PreviewNodeHit) => void>();
    const { container, getByTitle } = render(
      <PreviewPane {...baseProps} onSelectNode={onSelectNode} onOpenNode={onOpenNode} />
    );
    const frame = getByTitle('Site preview') as HTMLIFrameElement;
    send(frame, { type: 'avb:rects', rects: { '0.0': [{ x: 1, y: 2, w: Infinity, h: 4 }] }, focusRects: 'bad' });
    send(frame, { type: 'avb:click-node', scope: 4, path: '0.0', pagePath: null, occurrence: -1 });
    send(frame, { type: 'avb:open-node', scope: baseProps.activeScope, path: {}, pagePath: null, occurrence: 1.5 });

    expect(container.querySelector('.node-outline.sel')).toBeNull();
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onOpenNode).not.toHaveBeenCalled();
  });
});
