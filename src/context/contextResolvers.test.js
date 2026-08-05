import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearResolvers,
  getResolver,
  listResolvers,
  registerResolver,
} from './contextResolvers.js';

function fakeResolver(type) {
  return {
    type,
    label: `Fake ${type}`,
    isAvailable: () => true,
    getDefaultOptions: () => ({}),
    resolve: async () => ({ data: {}, estimatedCharacters: 0, sourceRevision: 'r' }),
    renderMarkdown: () => '',
  };
}

describe('contextResolvers registry', () => {
  beforeEach(() => {
    clearResolvers();
  });

  it('registers and retrieves a resolver by type', () => {
    const resolver = fakeResolver('current-file');
    registerResolver(resolver);
    expect(getResolver('current-file')).toBe(resolver);
  });

  it('returns undefined for an unregistered type', () => {
    expect(getResolver('nope')).toBeUndefined();
  });

  it('lists every registered resolver', () => {
    registerResolver(fakeResolver('current-file'));
    registerResolver(fakeResolver('selected-files'));
    expect(listResolvers().map((r) => r.type).sort()).toEqual([
      'current-file',
      'selected-files',
    ]);
  });

  it('re-registering a type replaces the previous resolver', () => {
    const first = fakeResolver('current-file');
    const second = fakeResolver('current-file');
    registerResolver(first);
    registerResolver(second);
    expect(getResolver('current-file')).toBe(second);
    expect(listResolvers()).toHaveLength(1);
  });

  it('rejects a resolver without a string type', () => {
    expect(() => registerResolver({ label: 'no type' })).toThrow(
      'Resolver must declare a string type.',
    );
  });
});
