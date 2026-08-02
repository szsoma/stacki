// @vitest-environment node

import { describe, expect, it } from 'vitest';

import viteConfig from '../../vite.config.mjs';

describe('production bundling', () => {
  it('uses Terser so xterm mode-query parsing is not corrupted by esbuild minification', () => {
    expect(viteConfig.build?.minify).toBe('terser');
  });
});
