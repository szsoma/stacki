// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import mainPolicyModule from './mainPolicy.js';

const { createTrustedRendererMatcher, transitionProjectRoot } = mainPolicyModule;

const packagedEntryPath = path.resolve('/opt/Stacki/resources/app/dist/index.html');
const packagedEntryUrl = pathToFileURL(packagedEntryPath).href;

describe('trusted renderer URLs', () => {
  it('accepts only URLs on the configured development origin', () => {
    const isTrusted = createTrustedRendererMatcher({
      devServerUrl: 'http://localhost:5173/editor',
      packagedEntryPath,
    });

    expect(isTrusted('http://localhost:5173/')).toBe(true);
    expect(isTrusted('http://localhost:5173/project?id=one#canvas')).toBe(true);
    expect(isTrusted('https://localhost:5173/')).toBe(false);
    expect(isTrusted('http://localhost.evil.test:5173/')).toBe(false);
    expect(isTrusted('http://localhost:5174/')).toBe(false);
    expect(isTrusted(`blob:http://localhost:5173/${crypto.randomUUID()}`)).toBe(false);
    expect(isTrusted(packagedEntryUrl)).toBe(false);
  });

  it('accepts only the exact packaged entry file while allowing a hash', () => {
    const isTrusted = createTrustedRendererMatcher({ packagedEntryPath });

    expect(isTrusted(packagedEntryUrl)).toBe(true);
    expect(isTrusted(`${packagedEntryUrl}#terminal`)).toBe(true);
    expect(isTrusted(`${packagedEntryUrl}?redirect=other.html`)).toBe(false);
    expect(isTrusted(pathToFileURL(path.join(path.dirname(packagedEntryPath), 'other.html')).href))
      .toBe(false);
    expect(isTrusted('not a url')).toBe(false);
  });
});

describe('project root transitions', () => {
  it('disposes the old terminal before returning a different resolved root', () => {
    const oldRoot = path.resolve('project-one');
    const nextRoot = path.resolve('project-two');
    let assignedRoot = oldRoot;
    const events = [];

    assignedRoot = transitionProjectRoot({
      currentRoot: assignedRoot,
      projectPath: path.join('.', 'project-two'),
      disposeTerminal: () => events.push(`disposed:${assignedRoot}`),
    });
    events.push(`assigned:${assignedRoot}`);

    expect(assignedRoot).toBe(nextRoot);
    expect(events).toEqual([`disposed:${oldRoot}`, `assigned:${nextRoot}`]);
  });

  it('does not dispose for the same resolved root', () => {
    const currentRoot = path.resolve('project-one');
    const disposeTerminal = vi.fn();

    expect(
      transitionProjectRoot({
        currentRoot,
        projectPath: path.join('.', 'project-one'),
        disposeTerminal,
      })
    ).toBe(currentRoot);
    expect(disposeTerminal).not.toHaveBeenCalled();
  });
});
