import { describe, expect, it } from 'vitest';
import { createAppStore } from './index';
import {
  selectAllowAttrs,
  selectCrumbs,
  selectCurrentLayoutName,
  selectFrontmatterCode,
  selectInsertables,
  selectLinkContext,
  selectLoopContext,
  selectModel,
  selectSelectedNode,
  selectSelectedSchema,
  selectSlotOptions,
} from './selectors';

function seeded() {
  const store = createAppStore();
  store.getState().setScan({
    pages: [{ name: 'index', path: '/p/src/pages/index.astro', route: '/' }],
    layouts: [
      {
        name: 'BaseLayout',
        path: '/p/src/layouts/BaseLayout.astro',
        schema: [{ name: 'title', type: 'string' }],
        slots: ['default', 'footer'],
      },
    ],
    components: [
      {
        name: 'Card',
        path: '/p/src/components/Card.astro',
        schema: [{ name: 'heading', type: 'string' }],
        slots: ['default', 'media'],
        extendsTag: 'a',
        hasRest: true,
      },
    ],
  });
  store.getState().setPageState({
    editable: true,
    dirty: false,
    model: {
      imports: [{ name: 'Layout', path: '../layouts/BaseLayout.astro' }],
      extraFrontmatter: 'const posts = await getCollection("blog");',
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
              children: [
                {
                  id: 'loop',
                  kind: 'map',
                  head: 'posts.map((post, i) =>',
                  children: [
                    { id: 'card', kind: 'component', name: 'Card', props: {}, children: [] },
                  ],
                },
              ],
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
    expect(selectSelectedNode(store.getState())).toMatchObject({ name: 'section' });
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

// Every selector below is read through zustand's `useStore`, which is built on
// useSyncExternalStore: it compares the previous result with the next one using
// Object.is and re-renders until they match. A selector that builds a fresh
// array or object on each call therefore never settles, and React aborts the
// component with "Maximum update depth exceeded".
describe('selector referential stability', () => {
  const derived = {
    selectInsertables,
    selectLinkContext,
    selectLoopContext,
    selectSelectedSchema,
    selectSelectedNode,
    selectCrumbs,
    selectSlotOptions,
  };

  for (const [name, select] of Object.entries(derived)) {
    it(`${name} returns the same reference for unchanged state`, () => {
      const store = seeded();
      store.getState().select('card');
      const state = store.getState();
      expect(select(state)).toBe(select(state));
    });
  }

  it('recomputes when the model changes', () => {
    const store = seeded();
    const before = selectLinkContext(store.getState());
    store.getState().mutateModel((model) => {
      const section = model.nodes[0].children![0];
      section.props = { id: { type: 'string', value: 'renamed' } };
      return model;
    });
    const after = selectLinkContext(store.getState());
    expect(after).not.toBe(before);
    expect(after.sectionIds).toEqual(['renamed']);
  });

  it('recomputes when the selection changes', () => {
    const store = seeded();
    store.getState().select('a');
    const before = selectSelectedSchema(store.getState());
    store.getState().select('card');
    expect(selectSelectedSchema(store.getState())).not.toBe(before);
  });
});

describe('selected node', () => {
  it('returns a synthetic node for the frontmatter pseudo-selection', () => {
    const store = seeded();
    store.getState().select('frontmatter');
    const node = selectSelectedNode(store.getState());
    expect(node).toMatchObject({ id: 'frontmatter', kind: 'frontmatter' });
    expect(node?.value).toBe(selectFrontmatterCode(store.getState()));
  });

  it('renders imports and extra frontmatter as one editable block', () => {
    expect(selectFrontmatterCode(seeded().getState())).toBe(
      "import Layout from '../layouts/BaseLayout.astro';\n\nconst posts = await getCollection(\"blog\");"
    );
  });
});

describe('selected schema', () => {
  it('uses the built-in attribute schema for plain elements', () => {
    const store = seeded();
    store.getState().setPageState({
      editable: true,
      model: {
        imports: [],
        extraFrontmatter: '',
        nodes: [{ id: 'link', kind: 'element', name: 'a', props: {}, children: [] }],
      },
    });
    store.getState().select('link');
    const names = selectSelectedSchema(store.getState()).map((f) => f.name);
    expect(names).toEqual(['href', 'target', 'rel']);
  });

  it('is empty for an element with no built-in schema', () => {
    const store = seeded();
    store.getState().select('a');
    expect(selectSelectedSchema(store.getState())).toEqual([]);
  });

  it('merges attributes inherited via extendsTag after the component own props', () => {
    const store = seeded();
    store.getState().select('card');
    const names = selectSelectedSchema(store.getState()).map((f) => f.name);
    expect(names[0]).toBe('heading');
    // Card extends HTMLAttributes<"a">, so it also accepts href.
    expect(names).toContain('href');
  });

  it('uses the resolved layout entry when the layout wrapper is selected', () => {
    const store = seeded();
    store.getState().select('layout');
    expect(selectSelectedSchema(store.getState()).map((f) => f.name)).toEqual(['title']);
  });

  it('is empty for text nodes', () => {
    const store = seeded();
    store.getState().setPageState({
      editable: true,
      model: {
        imports: [],
        extraFrontmatter: '',
        nodes: [{ id: 't', kind: 'text', value: 'hi' }],
      },
    });
    store.getState().select('t');
    expect(selectSelectedSchema(store.getState())).toEqual([]);
  });
});

describe('slot options', () => {
  it('offers the layout slots for a direct child of the layout wrapper', () => {
    const store = seeded();
    store.getState().select('a');
    expect(selectSlotOptions(store.getState())).toEqual(['default', 'footer']);
  });

  it('offers the parent component slots for a nested node', () => {
    const store = seeded();
    store.getState().setPageState({
      editable: true,
      model: {
        imports: [],
        extraFrontmatter: '',
        nodes: [
          {
            id: 'card',
            kind: 'component',
            name: 'Card',
            props: {},
            children: [{ id: 'kid', kind: 'element', name: 'p', props: {}, children: [] }],
          },
        ],
      },
    });
    store.getState().select('kid');
    expect(selectSlotOptions(store.getState())).toEqual(['default', 'media']);
  });

  it('has no slots for the layout wrapper itself', () => {
    const store = seeded();
    store.getState().select('layout');
    expect(selectSlotOptions(store.getState())).toBeNull();
  });
});

describe('loop context', () => {
  it('exposes the frontmatter, imports and enclosing loop heads at the selection', () => {
    const store = seeded();
    store.getState().select('card');
    expect(selectLoopContext(store.getState())).toEqual({
      frontmatter: 'const posts = await getCollection("blog");',
      imports: [{ name: 'Layout', path: '../layouts/BaseLayout.astro' }],
      ancestorHeads: ['posts.map((post, i) =>'],
    });
  });

  it('excludes the selection itself from the ancestor heads', () => {
    const store = seeded();
    store.getState().select('loop');
    expect(selectLoopContext(store.getState())?.ancestorHeads).toEqual([]);
  });

  it('is null with no selection', () => {
    expect(selectLoopContext(seeded().getState())).toBeNull();
  });
});

describe('link context', () => {
  it('carries the pages a link can point at alongside the anchor ids', () => {
    expect(selectLinkContext(seeded().getState())).toEqual({
      pages: [{ name: 'index', path: '/p/src/pages/index.astro', route: '/' }],
      sectionIds: ['hero'],
    });
  });
});

describe('insertables', () => {
  it('keeps the full scan entries so schema and slot lookups still work', () => {
    const card = selectInsertables(seeded().getState()).find((c) => c.name === 'Card');
    expect(card?.schema).toEqual([{ name: 'heading', type: 'string' }]);
    expect(card?.slots).toEqual(['default', 'media']);
    expect(card?.extendsTag).toBe('a');
  });
});

describe('allowAttrs', () => {
  it('allows attributes on plain elements', () => {
    const store = seeded();
    store.getState().select('a');
    expect(selectAllowAttrs(store.getState())).toBe(true);
  });

  it('allows attributes on a component that spreads the rest of its props', () => {
    const store = seeded();
    store.getState().select('card');
    expect(selectAllowAttrs(store.getState())).toBe(true);
  });

  it('refuses attributes on a component without a rest spread', () => {
    const store = seeded();
    store.getState().setScan({
      pages: [],
      layouts: [],
      components: [{ name: 'Card', path: '/p/src/components/Card.astro' }],
    });
    store.getState().select('card');
    expect(selectAllowAttrs(store.getState())).toBe(false);
  });
});
