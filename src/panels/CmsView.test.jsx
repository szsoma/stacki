import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CmsView from './CmsView.jsx';

const project = { path: '/projects/site' };

// files: { [rel]: data }. meta: { [rel]: declared }. Both are mutated in
// place by the mocked write handlers, the same way the real files on disk
// would be, so a test can make one call and then assert on the shared state.
function mockAvb({ files = {}, meta = {} } = {}) {
  window.avb = {
    readCms: vi.fn(async ({ rel }) => ({ data: files[rel] })),
    writeCms: vi.fn(async ({ rel, data }) => {
      files[rel] = data;
      return { ok: true };
    }),
    cmsMeta: vi.fn(async () => ({ meta })),
    setCmsMeta: vi.fn(async ({ rel, fields }) => {
      if (fields && Object.keys(fields).length) meta[rel] = fields;
      else delete meta[rel];
      return { ok: true };
    }),
    onCmsChanged: vi.fn(() => () => {}),
    listCms: vi.fn(async () => ({
      files: Object.entries(files).map(([rel, data]) => ({
        rel,
        name: rel.split('/').pop(),
        dir: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '',
        data,
      })),
    })),
    cmsUsage: vi.fn(async () => ({ files: [] })),
    deleteCms: vi.fn(async () => ({ ok: true })),
  };
  return { files, meta };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('creating a reference field', () => {
  it('lets you pick a target collection and stores it in the declared config', async () => {
    mockAvb({
      files: { 'data/posts.json': [{ title: 'Hello' }], 'data/authors.json': [{ name: 'Ada' }] },
    });
    render(<CmsView project={project} rel="data/posts.json" settings showToast={vi.fn()} />);

    fireEvent.click(await screen.findByText('Add field'));
    fireEvent.click(await screen.findByText('Reference'));
    fireEvent.click(await screen.findByText('Authors'));

    const dialog = (await screen.findByText('New Reference field')).closest('.modal');
    fireEvent.change(within(dialog).getByPlaceholderText('e.g. Reference'), { target: { value: 'Author' } });
    fireEvent.click(within(dialog).getByText('Add field'));

    await waitFor(() =>
      expect(window.avb.setCmsMeta).toHaveBeenCalledWith({
        projectPath: project.path,
        rel: 'data/posts.json',
        fields: { author: { type: 'reference', collection: 'data/authors.json' } },
      })
    );
    expect(await screen.findByText('Reference → Authors')).toBeInTheDocument();
  });

  it('lets you pick a target collection for a multi-reference field', async () => {
    mockAvb({
      files: { 'data/posts.json': [{ title: 'Hello' }], 'data/tags.json': [{ name: 'News' }] },
    });
    render(<CmsView project={project} rel="data/posts.json" settings showToast={vi.fn()} />);

    fireEvent.click(await screen.findByText('Add field'));
    fireEvent.click(await screen.findByText('Multi-reference'));
    fireEvent.click(await screen.findByText('Tags'));

    const dialog = (await screen.findByText('New Multi-reference field')).closest('.modal');
    fireEvent.change(within(dialog).getByPlaceholderText('e.g. Multi-reference'), { target: { value: 'Tags' } });
    fireEvent.click(within(dialog).getByText('Add field'));

    await waitFor(() =>
      expect(window.avb.setCmsMeta).toHaveBeenCalledWith({
        projectPath: project.path,
        rel: 'data/posts.json',
        fields: { tags: { type: 'multiReference', collection: 'data/tags.json' } },
      })
    );
    expect(await screen.findByText('Multi-reference → Tags')).toBeInTheDocument();
  });
});
