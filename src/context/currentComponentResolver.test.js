import { describe, expect, it, vi } from 'vitest';
import { currentComponentResolver } from './currentComponentResolver.js';

const TREE = [
  {
    id: 'hero',
    kind: 'component',
    name: 'HeroSection',
    props: {},
    children: [{ id: 'h1', kind: 'element', name: 'h1', props: {}, children: null }],
  },
];

const DEFINITIONS = [
  {
    name: 'HeroSection',
    path: '/projects/site/src/components/HeroSection.astro',
    schema: [{ name: 'title', type: 'string' }],
    slots: ['default'],
    instances: 3,
  },
];

function baseAppState(overrides = {}) {
  return {
    selectedNode: { id: 'h1', kind: 'element', name: 'h1' },
    nodeTree: TREE,
    componentDefinitions: DEFINITIONS,
    projectPath: '/projects/site',
    readProjectFile: vi.fn(async (rel) => ({ rel, content: `content of ${rel}` })),
    ...overrides,
  };
}

describe('currentComponentResolver', () => {
  it('is unavailable when nothing is selected', () => {
    expect(currentComponentResolver.isAvailable(baseAppState({ selectedNode: null }))).toBe(false);
  });

  it('is unavailable when the selection has no owning component', () => {
    expect(currentComponentResolver.isAvailable(baseAppState({ componentDefinitions: [] }))).toBe(false);
  });

  it('is available when the selection is inside a known component', () => {
    expect(currentComponentResolver.isAvailable(baseAppState())).toBe(true);
  });

  it('resolves the owning component, reading its file by project-relative path', async () => {
    const appState = baseAppState();
    const result = await currentComponentResolver.resolve(appState);
    expect(appState.readProjectFile).toHaveBeenCalledWith('src/components/HeroSection.astro');
    expect(result.data).toEqual({
      name: 'HeroSection',
      path: 'src/components/HeroSection.astro',
      isLayout: false,
      schema: [{ name: 'title', type: 'string' }],
      slots: ['default'],
      extendsTag: null,
      instances: 3,
      source: 'content of src/components/HeroSection.astro',
    });
  });

  it('rejects resolving when there is no owning component', async () => {
    await expect(currentComponentResolver.resolve(baseAppState({ selectedNode: null }))).rejects.toThrow(
      'The selection is not inside a known component.',
    );
  });

  it('renders name, file, usage, slots, props, and source as Markdown', () => {
    const snapshot = {
      data: {
        name: 'HeroSection',
        path: 'src/components/HeroSection.astro',
        isLayout: false,
        schema: [{ name: 'title', type: 'string' }],
        slots: ['default'],
        extendsTag: null,
        instances: 3,
        source: '---\nconst { title } = Astro.props;\n---\n<h1>{title}</h1>',
      },
    };
    const markdown = currentComponentResolver.renderMarkdown(snapshot);
    expect(markdown).toContain('### Current component');
    expect(markdown).toContain('Name: HeroSection');
    expect(markdown).toContain('`src/components/HeroSection.astro`');
    expect(markdown).toContain('Used 3 times in this project');
    expect(markdown).toContain('Slots: default');
    expect(markdown).toContain('Props: title (string)');
    expect(markdown).toContain('```astro');
    expect(markdown).toContain('<h1>{title}</h1>');
  });

  it('keys staleness on the owning component identity', () => {
    const appState = baseAppState();
    const key = currentComponentResolver.computeStaleKey(appState);
    expect(key).toEqual(expect.any(String));
    expect(key).toContain('HeroSection');
    expect(key).toContain('/projects/site/src/components/HeroSection.astro');
    expect(currentComponentResolver.computeStaleKey(baseAppState({ selectedNode: null }))).toBeNull();
  });

  it('changes the stale key when the owning component definition is rescanned with a different schema', () => {
    // Same name/path (i.e. it's still the "same" component identity-wise),
    // but the project scanner picked up a different prop list — e.g. the
    // user added a prop to HeroSection.astro and the app rescanned. A key
    // built from only name:path would miss this; componentDefinitions is
    // already live in appState (no disk read needed), so it should be
    // folded in.
    const appState = baseAppState();
    const keyBefore = currentComponentResolver.computeStaleKey(appState);

    const rescannedDefinitions = [
      {
        ...DEFINITIONS[0],
        schema: [
          { name: 'title', type: 'string' },
          { name: 'subtitle', type: 'string', optional: true },
        ],
      },
    ];
    const keyAfter = currentComponentResolver.computeStaleKey(
      baseAppState({ componentDefinitions: rescannedDefinitions }),
    );

    expect(keyAfter).not.toBe(keyBefore);
  });

  it('changes the stale key when slots change on the owning component definition', () => {
    const appState = baseAppState();
    const keyBefore = currentComponentResolver.computeStaleKey(appState);

    const rescannedDefinitions = [{ ...DEFINITIONS[0], slots: ['default', 'footer'] }];
    const keyAfter = currentComponentResolver.computeStaleKey(
      baseAppState({ componentDefinitions: rescannedDefinitions }),
    );

    expect(keyAfter).not.toBe(keyBefore);
  });

  it('does not flicker stale immediately after resolving (same appState, same key)', async () => {
    const appState = baseAppState();
    await currentComponentResolver.resolve(appState);
    const staleKeyAtResolve = currentComponentResolver.computeStaleKey(appState);
    const staleKeyImmediatelyAfter = currentComponentResolver.computeStaleKey(appState);
    expect(staleKeyImmediatelyAfter).toBe(staleKeyAtResolve);
  });
});
