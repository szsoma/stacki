import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cmsSchemaResolver } from './cmsSchemaResolver.js';
import { CONTEXT_CHIP_TYPES } from './contextTypes.js';

describe('cmsSchemaResolver', () => {
  it('declares the correct type', () => {
    expect(cmsSchemaResolver.type).toBe(CONTEXT_CHIP_TYPES.CMS_SCHEMA);
  });

  describe('isAvailable', () => {
    it('is available optimistically (always true)', () => {
      expect(cmsSchemaResolver.isAvailable({})).toBe(true);
    });
  });

  describe('getDefaultOptions', () => {
    it('defaults to relevant collections', () => {
      expect(cmsSchemaResolver.getDefaultOptions()).toEqual({ mode: 'relevant' });
    });
  });

  describe('resolve (relevant mode)', () => {
    beforeEach(() => {
      vi.stubGlobal('avb', {
        listCms: vi.fn(),
        cmsMeta: vi.fn(),
      });
    });

    it('returns field schemas for collections imported by the current page', async () => {
      window.avb.listCms.mockResolvedValue({
        files: [
          { rel: 'data/posts.json', name: 'posts.json', dir: 'data', data: [{ title: 'Hello', body: 'World' }] },
          { rel: 'data/authors.json', name: 'authors.json', dir: 'data', data: [{ name: 'Ada' }] },
        ],
      });
      window.avb.cmsMeta.mockResolvedValue({ meta: {} });

      const appState = {
        projectPath: '/projects/site',
        pageInfo: {
          imports: [
            { name: 'posts', path: 'data/posts.json' },
            { name: 'Layout', path: 'layouts/Base.astro' },
          ],
        },
      };
      const result = await cmsSchemaResolver.resolve(appState, { mode: 'relevant' });
      expect(result.data.collections).toHaveLength(1);
      expect(result.data.collections[0].rel).toBe('data/posts.json');
    });
  });

  describe('resolve (all mode)', () => {
    beforeEach(() => {
      vi.stubGlobal('avb', {
        listCms: vi.fn(),
        cmsMeta: vi.fn(),
      });
    });

    it('returns field schemas for every CMS collection', async () => {
      window.avb.listCms.mockResolvedValue({
        files: [
          { rel: 'data/posts.json', name: 'posts.json', dir: 'data', data: [{ title: 'Hello' }] },
          { rel: 'data/authors.json', name: 'authors.json', dir: 'data', data: [{ name: 'Ada' }] },
        ],
      });
      window.avb.cmsMeta.mockResolvedValue({ meta: {} });
      const appState = { projectPath: '/projects/site' };
      const result = await cmsSchemaResolver.resolve(appState, { mode: 'all' });
      expect(result.data.collections).toHaveLength(2);
    });
  });

  describe('resolve (error cases)', () => {
    beforeEach(() => {
      vi.stubGlobal('avb', { listCms: vi.fn(), cmsMeta: vi.fn() });
    });

    it('rejects when no CMS collections exist', async () => {
      window.avb.listCms.mockResolvedValue({ files: [] });
      const appState = { projectPath: '/projects/site' };
      await expect(cmsSchemaResolver.resolve(appState, { mode: 'all' })).rejects.toThrow('No CMS collections');
    });

    it('rejects when no collections match the relevant mode', async () => {
      window.avb.listCms.mockResolvedValue({
        files: [{ rel: 'data/authors.json', name: 'authors.json', dir: 'data', data: [{ name: 'Ada' }] }],
      });
      window.avb.cmsMeta.mockResolvedValue({ meta: {} });
      const appState = {
        projectPath: '/projects/site',
        pageInfo: { imports: [{ name: 'Layout', path: 'layouts/Base.astro' }] },
      };
      await expect(cmsSchemaResolver.resolve(appState, { mode: 'relevant' })).rejects.toThrow('No CMS collections match');
    });
  });

  describe('renderMarkdown', () => {
    it('renders collection names, fields, and a sample item', () => {
      const markdown = cmsSchemaResolver.renderMarkdown({
        data: {
          mode: 'all',
          collections: [{
            rel: 'data/posts.json', label: 'Posts', single: false, itemCount: 3,
            fields: [
              { key: 'title', label: 'Title', type: 'text' },
              { key: 'body', label: 'Body', type: 'longtext' },
            ],
            sampleItem: { title: 'Hello' },
          }],
        },
      });
      expect(markdown).toContain('### CMS schema');
      expect(markdown).toContain('Posts');
      expect(markdown).toContain('data/posts.json');
      expect(markdown).toContain('Title');
      expect(markdown).toContain('Body');
      expect(markdown).toContain('text');
      expect(markdown).toContain('longtext');
    });

    it('handles collections with no fields', () => {
      const markdown = cmsSchemaResolver.renderMarkdown({
        data: {
          mode: 'all',
          collections: [{ rel: 'data/empty.json', label: 'Empty', single: false, itemCount: 0, fields: [], sampleItem: null }],
        },
      });
      expect(markdown).toContain('_(no fields)_');
    });
  });
});
