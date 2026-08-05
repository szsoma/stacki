import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextChip from './ContextChip.jsx';

function snapshot(overrides = {}) {
  return { id: 'chip-1', type: 'current-file', label: 'Current file', status: 'ready', ...overrides };
}

describe('ContextChip', () => {
  it('shows the label and opens details on click', () => {
    const onOpenDetails = vi.fn();
    render(<ContextChip snapshot={snapshot()} onOpenDetails={onOpenDetails} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByText('Current file'));
    expect(onOpenDetails).toHaveBeenCalledWith('chip-1');
  });

  it('removes the chip on remove click without opening details', () => {
    const onOpenDetails = vi.fn();
    const onRemove = vi.fn();
    render(<ContextChip snapshot={snapshot()} onOpenDetails={onOpenDetails} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Current file' }));
    expect(onRemove).toHaveBeenCalledWith('chip-1');
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it('shows a resolving indicator', () => {
    render(<ContextChip snapshot={snapshot({ status: 'resolving' })} onOpenDetails={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('···')).toBeInTheDocument();
  });

  it('shows a stale indicator', () => {
    render(<ContextChip snapshot={snapshot({ status: 'stale' })} onOpenDetails={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  it('shows an error indicator', () => {
    render(<ContextChip snapshot={snapshot({ status: 'error' })} onOpenDetails={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });
});
