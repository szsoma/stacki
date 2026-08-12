// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CmsView from './CmsView.jsx';
import { I18nProvider } from '../i18n/I18nContext.jsx';

const wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>;

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
    render(<CmsView project={project} rel="data/posts.json" settings showToast={vi.fn()} />, { wrapper });
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
    render(<CmsView project={project} rel="data/posts.json" settings showToast={vi.fn()} />, { wrapper });

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

describe('editing a reference value', () => {
  it('picks an item, shows its title, and can clear it', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', author: '' }],
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />, { wrapper });

    fireEvent.click(await screen.findByText('Choose item'));
    fireEvent.click(await screen.findByText('Ada'));
    expect(await screen.findByText('Ada')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Clear'));
    await waitFor(() => expect(screen.queryByText('Ada')).not.toBeInTheDocument());
  });

  it('shows a missing-item state for a dangling id', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', author: 'ghost' }],
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />, { wrapper });
    expect(await screen.findByText('Missing item')).toBeInTheDocument();
  });

  it('resolves a reference field nested inside a group', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', seo: { reviewer: '' } }],
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
      },
      meta: { 'data/posts.json': { 'seo.reviewer': { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />, { wrapper });
    fireEvent.click(await screen.findByText('Choose item'));
    fireEvent.click(await screen.findByText('Ada'));
    expect(await screen.findByText('Ada')).toBeInTheDocument();
  });
});

describe('editing a multi-reference value', () => {
  it('adds a chip and can remove it', async () => {
    mockAvb({
      files: {
        'data/posts.json': [{ title: 'Hello', tags: ['t1'] }],
        'data/tags.json': [{ _id: 't1', name: 'News' }, { _id: 't2', name: 'Launch' }],
      },
      meta: { 'data/posts.json': { tags: { type: 'multiReference', collection: 'data/tags.json' } } },
    });
    render(<CmsView project={project} rel="data/posts.json" showToast={vi.fn()} />, { wrapper });

    expect(await screen.findByText('News')).toBeInTheDocument();

    fireEvent.click(await screen.findByText('Add'));
    fireEvent.click(await screen.findByText('Launch'));
    expect(await screen.findByText('Launch')).toBeInTheDocument();

    // The picker stays open for multi-select, so close it before asserting on
    // the chips — an unpicked item is listed there under the same name.
    fireEvent.click(screen.getByText('Done'));

    const chip = (await screen.findByText('News')).closest('.cms-ref-chip');
    fireEvent.click(within(chip).getByTitle('Remove'));
    await waitFor(() => expect(screen.queryByText('News')).not.toBeInTheDocument());
  });
});

describe('deleting an item that is referenced elsewhere', () => {
  it('blocks the delete until the reference is resolved', async () => {
    mockAvb({
      files: {
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
        'data/posts.json': [{ title: 'Hello', author: 'a1' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/authors.json" showToast={vi.fn()} />, { wrapper });

    fireEvent.click(await screen.findByTitle('Delete item'));
    expect(await screen.findByText('This item is referenced elsewhere')).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(screen.getByText('Remove anyway'));
    await waitFor(() => expect(deleteButton).not.toBeDisabled());
  });

  it('deletes immediately when nothing references the item', async () => {
    mockAvb({ files: { 'data/authors.json': [{ name: 'Ada' }] } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CmsView project={project} rel="data/authors.json" showToast={vi.fn()} />, { wrapper });
    fireEvent.click(await screen.findByTitle('Delete item'));
    await waitFor(() => expect(window.avb.writeCms).toHaveBeenCalled(), { timeout: 2000 });
  });
});

describe('jumping to a referencing item', () => {
  it('selects the item matching jumpItemId once it is loaded, then reports it handled', async () => {
    mockAvb({
      files: { 'data/authors.json': [{ _id: 'a1', name: 'Ada' }, { _id: 'a2', name: 'Grace' }] },
    });
    const onJumpHandled = vi.fn();
    render(
      <CmsView
        project={project}
        rel="data/authors.json"
        showToast={vi.fn()}
        jumpItemId="a2"
        onJumpHandled={onJumpHandled}
      />,
      { wrapper }
    );
    // The title shows in the item list and again in the detail header once
    // selected, so pick the list row specifically.
    await waitFor(() => {
      const row = screen
        .getAllByText('Grace')
        .map((el) => el.closest('.cms-item'))
        .find(Boolean);
      expect(row).toHaveClass('on');
    });
    expect(onJumpHandled).toHaveBeenCalled();
  });

  it('Show instance calls onJumpToItem with the referencing collection and item', async () => {
    mockAvb({
      files: {
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
        'data/posts.json': [{ _id: 'p1', title: 'Hello', author: 'a1' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    const onJumpToItem = vi.fn();
    render(
      <CmsView project={project} rel="data/authors.json" showToast={vi.fn()} onJumpToItem={onJumpToItem} />,
      { wrapper }
    );
    fireEvent.click(await screen.findByTitle('Delete item'));
    fireEvent.click(await screen.findByText('Show instance'));
    expect(onJumpToItem).toHaveBeenCalledWith('data/posts.json', 'p1');
  });
});

describe('deleting a collection whose items are referenced elsewhere', () => {
  it('blocks the delete until the reference is resolved', async () => {
    mockAvb({
      files: {
        'data/authors.json': [{ _id: 'a1', name: 'Ada' }],
        'data/posts.json': [{ title: 'Hello', author: 'a1' }],
      },
      meta: { 'data/posts.json': { author: { type: 'reference', collection: 'data/authors.json' } } },
    });
    render(<CmsView project={project} rel="data/authors.json" settings showToast={vi.fn()} />, { wrapper });

    fireEvent.click(await screen.findByText('Delete Authors'));
    expect(await screen.findByText('Items in this collection are referenced elsewhere')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('falls back to the plain confirm when nothing references it', async () => {
    mockAvb({ files: { 'data/authors.json': [{ name: 'Ada' }] } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <CmsView project={project} rel="data/authors.json" settings showToast={vi.fn()} onDeleted={vi.fn()} />,
      { wrapper }
    );
    fireEvent.click(await screen.findByText('Delete Authors'));
    await waitFor(() => expect(window.avb.deleteCms).toHaveBeenCalled());
  });
});
