import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../i18n/I18nContext.jsx';
import LeftRail from './LeftRail.jsx';

function wrap(ui) {
  return <I18nProvider>{ui}</I18nProvider>;
}

describe('LeftRail terminal entry', () => {
  it('renders Terminal directly after CMS as an accessible button', () => {
    render(wrap(<LeftRail active={null} onSelect={() => {}} />));

    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((button) => button.getAttribute('aria-label'));

    expect(labels.slice(-2)).toEqual(['CMS', 'Terminal']);
    expect(
      screen.getByRole('button', { name: 'Terminal' }).getAttribute('type'),
    ).toBe('button');
  });

  it('marks Terminal active and selects it when clicked', () => {
    const onSelect = vi.fn();
    render(wrap(<LeftRail active="terminal" onSelect={onSelect} />));

    const terminal = screen.getByRole('button', { name: 'Terminal' });
    expect(terminal.classList.contains('on')).toBe(true);

    fireEvent.click(terminal);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('terminal');
  });

  it('uses physical KeyT for Hungarian Option+T before the typing guard', () => {
    const onSelect = vi.fn();
    const onEditorKeyDown = vi.fn();
    render(
      wrap(<>
        <LeftRail active={null} onSelect={onSelect} />
        <input aria-label="Editor field" onKeyDown={onEditorKeyDown} />
      </>),
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editor field' }), {
      altKey: true,
      code: 'KeyT',
      key: 'í',
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('terminal');
    expect(onEditorKeyDown).not.toHaveBeenCalled();
  });

  it.each([
    ['without Option', { code: 'KeyT', key: 't' }],
    ['with Command', { altKey: true, code: 'KeyT', metaKey: true }],
    ['with Control', { altKey: true, code: 'KeyT', ctrlKey: true }],
    ['with Shift', { altKey: true, code: 'KeyT', shiftKey: true }],
    ['from a lookalike key', { altKey: true, code: 'KeyI', key: 't' }],
  ])('does not select Terminal %s', (_label, init) => {
    const onSelect = vi.fn();
    render(wrap(<LeftRail active={null} onSelect={onSelect} />));

    fireEvent.keyDown(window, init);

    expect(onSelect).not.toHaveBeenCalledWith('terminal');
  });

  it('preserves existing shortcuts and keeps plain shortcuts out of fields', () => {
    const onSelect = vi.fn();
    render(
      wrap(<>
        <LeftRail active={null} onSelect={onSelect} />
        <input aria-label="Editor field" />
      </>),
    );

    fireEvent.keyDown(window, { altKey: true, code: 'KeyC', key: 'ç' });
    fireEvent.keyDown(window, { key: 'p' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Editor field' }), {
      key: 'j',
    });

    expect(onSelect).toHaveBeenNthCalledWith(1, 'cms');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'pages');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('removes the capture listener on unmount', () => {
    const onSelect = vi.fn();
    const view = render(wrap(<LeftRail active={null} onSelect={onSelect} />));
    view.unmount();

    fireEvent.keyDown(window, { altKey: true, code: 'KeyT', key: 'í' });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
