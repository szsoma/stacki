// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextPicker from './ContextPicker.jsx';

const resolvers = [
  { type: 'current-file', label: 'Current file' },
  { type: 'selected-files', label: 'Select files' },
];

describe('ContextPicker', () => {
  it('picks a simple resolver directly', () => {
    const onPickSimple = vi.fn();
    render(
      <ContextPicker
        resolvers={resolvers}
        onPickSimple={onPickSimple}
        onPickFiles={vi.fn()}
        onListFiles={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Current file'));
    expect(onPickSimple).toHaveBeenCalledWith('current-file');
  });

  it('opens a searchable file list for Select files and confirms the selection', async () => {
    const onListFiles = vi.fn(async () => ['src/pages/index.astro', 'src/components/Hero.astro']);
    const onPickFiles = vi.fn();
    render(
      <ContextPicker
        resolvers={resolvers}
        onPickSimple={vi.fn()}
        onPickFiles={onPickFiles}
        onListFiles={onListFiles}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Select files'));
    await waitFor(() => expect(screen.getByText('src/pages/index.astro')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Search files…'), { target: { value: 'hero' } });
    expect(screen.queryByText('src/pages/index.astro')).not.toBeInTheDocument();
    expect(screen.getByText('src/components/Hero.astro')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('src/components/Hero.astro'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 file' }));
    expect(onPickFiles).toHaveBeenCalledWith(['src/components/Hero.astro']);
  });

  it('closes when clicking outside', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside" />
        <ContextPicker
          resolvers={resolvers}
          onPickSimple={vi.fn()}
          onPickFiles={vi.fn()}
          onListFiles={vi.fn()}
          onClose={onClose}
        />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalled();
  });
});
