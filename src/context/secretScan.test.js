// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { describe, expect, it } from 'vitest';
import { scanForSecrets } from './secretScan.js';

describe('scanForSecrets', () => {
  it('returns nothing for empty or missing text', () => {
    expect(scanForSecrets('')).toEqual([]);
    expect(scanForSecrets(null)).toEqual([]);
    expect(scanForSecrets(undefined)).toEqual([]);
  });

  it('returns nothing for ordinary code', () => {
    expect(scanForSecrets('const heading = "Build faster";')).toEqual([]);
  });

  it('detects a PEM private key block', () => {
    expect(
      scanForSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----'),
    ).toEqual(['private key']);
  });

  it('detects an AWS access key', () => {
    expect(scanForSecrets('key = "AKIAABCDEFGHIJKLMNOP"')).toEqual(['AWS access key']);
  });

  it('detects a GitHub token', () => {
    expect(scanForSecrets('token: ghp_1234567890abcdefghij1234')).toEqual(['GitHub token']);
  });

  it('detects an OpenAI API key', () => {
    expect(scanForSecrets('OPENAI_KEY=sk-1234567890abcdefghij1234567890')).toEqual(['OpenAI API key']);
  });

  it('detects a bearer token', () => {
    expect(scanForSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345')).toEqual(['bearer token']);
  });

  it('detects a secret-looking environment assignment', () => {
    expect(scanForSecrets('DB_PASSWORD="hunter2345"')).toEqual(['possible secret assignment']);
  });

  it('deduplicates repeated occurrences of the same pattern', () => {
    const text = 'AKIAABCDEFGHIJKLMNOP\n...\nAKIAZZZZZZZZZZZZZZZZ';
    expect(scanForSecrets(text)).toEqual(['AWS access key']);
  });

  it('detects multiple distinct patterns in the same text, in check order', () => {
    const text = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEow==',
      '-----END PRIVATE KEY-----',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
    ].join('\n');
    expect(scanForSecrets(text)).toEqual(['private key', 'bearer token']);
  });
});
