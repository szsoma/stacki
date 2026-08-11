import { describe, expect, it } from 'vitest';
import { createAppStore } from './index';
import {
  selectCurrentLayoutName,
  selectInsertables,
  selectLinkContext,
  selectModel,
  selectSelectedNode,
} from './selectors';

function seeded() {
  const store = createAppStore();
  store.getState().setScan({
    pages: [{ name: 'index', path: '/p/src/pages/index.astro', route: '/' }],
    layouts: [{ name: 'BaseLayout', path: '/p/src/layouts/BaseLayout.astro' }],
    components: [{ name: 'Card', path: '/p/src/components/Card.astro' }],
  });
  store.getState().setPageState({
    editable: true,
    dirty: false,
    model: {
      imports: [{ name: 'Layout', path: '../layouts/BaseLayout.astro' }],
      extraFrontmatter: '',
      nodes: [
        {
          id: 'layout',
          kind: 'component',
          name: 'Layout',
          props: {},
          children: [
            {
              id: 'a',
              kind: 'element',
              name: 'section',
              props: { id: { type: 'string', value: 'hero' } },
              children: [],
            },
          ],
        },
      ],
    },
  });
  return store;
}

describe('selectors', () => {
  it('returns null model when the page is not editable', () => {
    const store = createAppStore();
    store.getState().setPageState({ editable: false, reason: 'raw', source: '<p/>' });
    expect(selectModel(store.getState())).toBeNull();
  });

  it('resolves the layout name through its local import alias', () => {
    expect(selectCurrentLayoutName(seeded().getState())).toBe('BaseLayout');
  });

  it('returns the selected node', () => {
    const store = seeded();
    store.getState().select('a');
    expect(selectSelectedNode(store.getState())?.name).toBe('section');
  });

  it('returns null when nothing is selected', () => {
    expect(selectSelectedNode(seeded().getState())).toBeNull();
  });

  it('collects section ids for anchor links', () => {
    expect(selectLinkContext(seeded().getState()).sectionIds).toEqual(['hero']);
  });

  it('lists components before layouts so components win a name collision', () => {
    const names = selectInsertables(seeded().getState()).map((c) => c.name);
    expect(names).toEqual(['Card', 'BaseLayout']);
  });
});
