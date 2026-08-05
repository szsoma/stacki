import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextDetailsPopover from './ContextDetailsPopover.jsx';

function snapshot(overrides = {}) {
  return {
    id: 'chip-1',
    label: 'Current file',
    status: 'ready',
    capturedAt: '2026-08-05T14:20:31.000Z',
    estimatedTokens: 42,
    error: null,
    ...overrides,
  };
}

describe('ContextDetailsPopover', () => {
  it('shows captured time, size, and the rendered markdown for a ready snapshot', () => {
    render(
      <ContextDetailsPopover
        snapshot={snapshot()}
        markdown="### Current file\n\nconst x = 1;"
        onRefresh={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Current file')).toBeInTheDocument();
    expect(screen.getByText(/~42 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/const x = 1;/)).toBeInTheDocument();
  });

  it('shows the error message for a failed snapshot instead of a preview', () => {
    render(
      <ContextDetailsPopover
        snapshot={snapshot({ status: 'error', error: { message: 'disk exploded' } })}
        markdown=""
        onRefresh={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('disk exploded')).toBeInTheDocument();
  });

  it('calls onRefresh and onRemove with the snapshot id', () => {
    const onRefresh = vi.fn();
    const onRemove = vi.fn();
    render(
      <ContextDetailsPopover
        snapshot={snapshot()}
        markdown="x"
        onRefresh={onRefresh}
        onRemove={onRemove}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRefresh).toHaveBeenCalledWith('chip-1');
    expect(onRemove).toHaveBeenCalledWith('chip-1');
  });

  it('closes when clicking outside', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside" />
        <ContextDetailsPopover snapshot={snapshot()} markdown="x" onRefresh={vi.fn()} onRemove={vi.fn()} onClose={onClose} />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalled();
  });
});
