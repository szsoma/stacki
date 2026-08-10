import { describe, expect, it } from 'vitest';
import { previewScreenshotResolver } from './previewScreenshotResolver.js';
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

describe('previewScreenshotResolver', () => {
  it('declares the correct type', () => {
    expect(previewScreenshotResolver.type).toBe(CONTEXT_CHIP_TYPES.PREVIEW_SCREENSHOT);
  });

  describe('isAvailable', () => {
    it('is available when the dev server is running', () => {
      expect(previewScreenshotResolver.isAvailable({ devUrl: 'http://localhost:4321' })).toBe(true);
    });
    it('is unavailable when no dev server URL is set', () => {
      expect(previewScreenshotResolver.isAvailable({ devUrl: null })).toBe(false);
    });
  });

  describe('getDefaultOptions', () => {
    it('defaults to viewport capture mode', () => {
      expect(previewScreenshotResolver.getDefaultOptions()).toEqual({ mode: 'viewport' });
    });
  });

  describe('resolve', () => {
    it('captures the preview region and returns the screenshot path', async () => {
      const capturePreview = async () => ({ relPath: '.stacki/tmp/context/preview-99.png' });
      const getPreviewRect = () => ({ x: 300, y: 100, width: 800, height: 600 });
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect, capturePreview };
      const result = await previewScreenshotResolver.resolve(appState, { mode: 'viewport' });
      expect(result.data).toMatchObject({
        mode: 'viewport', path: '.stacki/tmp/context/preview-99.png',
        viewportWidth: 800, viewportHeight: 600, selectedRect: null,
      });
      expect(result.sourceRevision).toBeTruthy();
    });

    it('includes the selected element rect in selected-element mode', async () => {
      const capturePreview = async () => ({ relPath: '.stacki/tmp/context/preview-100.png' });
      const getPreviewRect = () => ({ x: 300, y: 100, width: 800, height: 600, selectedRect: { x: 100, y: 50, w: 200, h: 40 } });
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect, capturePreview };
      const result = await previewScreenshotResolver.resolve(appState, { mode: 'selected-element' });
      expect(result.data.selectedRect).toEqual({ x: 100, y: 50, w: 200, h: 40 });
    });

    it('rejects when the preview rect has zero area', async () => {
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect: () => ({ x: 0, y: 0, width: 0, height: 0 }), capturePreview: async () => ({}) };
      await expect(previewScreenshotResolver.resolve(appState, { mode: 'viewport' })).rejects.toThrow('preview is not visible');
    });

    it('rejects when getPreviewRect returns null', async () => {
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect: () => null, capturePreview: async () => ({}) };
      await expect(previewScreenshotResolver.resolve(appState, { mode: 'viewport' })).rejects.toThrow('preview is not visible');
    });
  });

  describe('computeStaleKey', () => {
    it('returns a key based on the preview rect dimensions', () => {
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect: () => ({ x: 300, y: 100, width: 800, height: 600 }) };
      expect(typeof previewScreenshotResolver.computeStaleKey(appState)).toBe('string');
    });
    it('returns null when the preview is not available', () => {
      const appState = { devUrl: 'http://localhost:4321', getPreviewRect: () => null };
      expect(previewScreenshotResolver.computeStaleKey(appState)).toBeNull();
    });
  });

  describe('renderMarkdown', () => {
    it('renders the screenshot path and viewport info', () => {
      const markdown = previewScreenshotResolver.renderMarkdown({
        data: { mode: 'viewport', path: '.stacki/tmp/context/preview-1.png', viewportWidth: 800, viewportHeight: 600, capturedAt: '2026-08-10T12:00:00.000Z', selectedRect: null },
      });
      expect(markdown).toContain('### Preview screenshot');
      expect(markdown).toContain('.stacki/tmp/context/preview-1.png');
      expect(markdown).toContain('800 × 600');
    });

    it('includes selected element coordinates in selected-element mode', () => {
      const markdown = previewScreenshotResolver.renderMarkdown({
        data: { mode: 'selected-element', path: '.stacki/tmp/context/preview-2.png', viewportWidth: 1440, viewportHeight: 900, capturedAt: '2026-08-10T12:00:00.000Z', selectedRect: { x: 100, y: 50, w: 200, h: 40 } },
      });
      expect(markdown).toContain('selected element');
      expect(markdown).toContain('100, 50');
    });
  });
});
