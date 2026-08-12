// @vitest-environment node

import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import astroParser from './astroParser.js';

const {
  markChunkHtml,
  previewScopeFromFile,
  serializePageMarked,
} = astroParser;

/**
 * Test fixtures deliberately include serializer-only node metadata.
 * @param {any[]} nodes
 * @param {import('../src/types/ast').ImportDecl[]} imports
 */
function pageModel(nodes, imports = []) {
  return { imports, extraFrontmatter: '', nodes };
}

describe('scoped preview markers', () => {
  it('adds a nested project-relative scope to both marker boundaries', () => {
    const model = pageModel([
      {
        id: 'n1',
        kind: 'element',
        name: 'main',
        props: {},
        children: [
          { id: 'n2', kind: 'element', name: 'section', props: {}, children: null },
        ],
      },
    ]);

    const source = serializePageMarked(model, 'src/components/Hero.astro');

    expect(source).toContain(
      '<template data-avb-s="0" data-avb-scope="src/components/Hero.astro"></template>'
    );
    expect(source).toContain(
      '<template data-avb-e="0" data-avb-scope="src/components/Hero.astro"></template>'
    );
    expect(source).toContain(
      '<template data-avb-s="0.0" data-avb-scope="src/components/Hero.astro"></template>'
    );
    expect(source).toContain(
      '<template data-avb-e="0.0" data-avb-scope="src/components/Hero.astro"></template>'
    );
  });

  it('escapes scope values for marker attributes', () => {
    const model = pageModel([
      { id: 'n1', kind: 'element', name: 'div', props: {}, children: null },
    ]);

    const source = serializePageMarked(model, 'src/A&B"<.astro');

    expect(source).toContain('data-avb-scope="src/A&amp;B&quot;&lt;.astro"');
  });

  it('adds path, URL-safe scope, and group flags to raw HTML imports', () => {
    const model = pageModel(
      [
        {
          id: 'n1',
          kind: 'component',
          name: 'Fragment',
          props: { 'set:html': { type: 'expr', value: 'chunk' } },
          children: [
            {
              id: 'chunk1',
              kind: 'chunk-group',
              name: 'chunk',
              chunkFile: '/project/chunk.html',
              children: [],
            },
          ],
          chunkAggregate: true,
        },
      ],
      [{ name: 'chunk', path: './chunk.html?raw' }]
    );

    const source = serializePageMarked(model, 'src/pages/nested/index.astro');

    expect(source).toContain(
      "import chunk from './chunk.html?raw&avb=0.0&avbs=src%2Fpages%2Fnested%2Findex.astro&avbg=1';"
    );
  });

  it('adds scope to chunk node and group markers', () => {
    const source = markChunkHtml(
      '<section>Chunk</section>',
      '1.2',
      true,
      'src/pages/index.astro'
    );

    expect(source).toContain(
      '<template data-avb-s="1.2" data-avb-scope="src/pages/index.astro"></template>'
    );
    expect(source).toContain(
      '<template data-avb-s="1.2.0" data-avb-scope="src/pages/index.astro"></template>'
    );
    expect(source).toContain(
      '<template data-avb-e="1.2.0" data-avb-scope="src/pages/index.astro"></template>'
    );
    expect(source).toContain(
      '<template data-avb-e="1.2" data-avb-scope="src/pages/index.astro"></template>'
    );
  });
});

describe('previewScopeFromFile', () => {
  it('returns a forward-slash project-relative scope', () => {
    const projectRoot = path.join(os.tmpdir(), 'avb-project');
    const file = path.join(projectRoot, 'src', 'components', 'Hero.astro');

    expect(previewScopeFromFile(projectRoot, file)).toBe('src/components/Hero.astro');
  });

  it('rejects files outside the project root', () => {
    const projectRoot = path.join(os.tmpdir(), 'avb-project');
    const file = path.join(os.tmpdir(), 'other-project', 'Hero.astro');

    expect(previewScopeFromFile(projectRoot, file)).toBeNull();
  });
});
