import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { I18nProvider, useT } from './I18nContext.jsx';

function wrapper({ children }) {
  return <I18nProvider locale="en">{children}</I18nProvider>;
}

describe('useT', () => {
  it('returns the string for a known key', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current('common.save')).toBe('Save');
  });

  it('interpolates params', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current('pagesPanel.deleteConfirm', { name: 'about' })).toBe(
      'Delete about? This removes the file from disk.'
    );
  });

  it('falls back to the key when the key is missing', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    const key = 'nonexistent.key';
    expect(result.current(key)).toBe(key);
  });

  it('handles missing params gracefully', () => {
    const { result } = renderHook(() => useT(), { wrapper });
    expect(result.current('cmsView.noItemsMatch', {})).toBe(
      'No items match "{query}".'
    );
  });
});
