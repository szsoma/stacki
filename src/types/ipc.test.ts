import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function keysFrom(source: string, startMarker: string): string[] {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const body = source.slice(start);
  const keys = new Set<string>();
  for (const m of body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)) {
    keys.add(m[1]);
  }
  return [...keys].sort();
}

describe('window.avb declaration', () => {
  it('declares every method preload.js exposes', () => {
    const preload = readFileSync(resolve(here, '../../electron/preload.js'), 'utf8');
    const decl = readFileSync(resolve(here, './ipc.d.ts'), 'utf8');

    const exposed = keysFrom(preload, 'contextBridge.exposeInMainWorld');
    const declared = new Set(
      [...decl.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)[(<?:]/gm)].map((m) => m[1])
    );

    const missing = exposed.filter((k) => !declared.has(k));
    expect(missing, `ipc.d.ts is missing: ${missing.join(', ')}`).toEqual([]);
  });
});
