import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Vault } from '../../src/main/account/vault.js';

let directory = '';

describe('the local vault', () => {
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'vela-vault-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const open = (): Vault => new Vault(`vault-${String(Math.random())}`, directory);

  it('starts with no account and locked', () => {
    const vault = open();
    expect(vault.exists).toBe(false);
    expect(vault.unlocked).toBe(false);
  });

  it('creates an account and leaves it unlocked', () => {
    const vault = open();
    expect(vault.create('me@example.com', 'correct horse battery')).toEqual({
      ok: true,
      error: null,
    });
    expect(vault.exists).toBe(true);
    expect(vault.unlocked).toBe(true);
    expect(vault.email).toBe('me@example.com');
  });

  it('refuses a short master password', () => {
    const vault = open();
    expect(vault.create('me@example.com', 'short').ok).toBe(false);
    expect(vault.exists).toBe(false);
  });

  it('will not create a second account over the first', () => {
    const vault = open();
    vault.create('me@example.com', 'correct horse battery');
    expect(vault.create('other@example.com', 'another long password').ok).toBe(false);
    expect(vault.email).toBe('me@example.com');
  });

  it('rejects the wrong password and accepts the right one', () => {
    const vault = open();
    vault.create('me@example.com', 'correct horse battery');
    vault.lock();

    expect(vault.unlock('wrong password entirely').ok).toBe(false);
    expect(vault.unlocked).toBe(false);

    expect(vault.unlock('correct horse battery').ok).toBe(true);
    expect(vault.unlocked).toBe(true);
  });

  it('round-trips a credential through encryption', () => {
    const vault = open();
    vault.create('me@example.com', 'correct horse battery');

    expect(vault.save('github.com', 'octocat', 'hunter2')).toBe(true);

    const [entry] = vault.list();
    expect(entry?.host).toBe('github.com');
    expect(entry?.username).toBe('octocat');
    expect(vault.reveal(entry?.id ?? '')).toBe('hunter2');
  });

  it('reveals nothing at all while locked', () => {
    const vault = open();
    vault.create('me@example.com', 'correct horse battery');
    vault.save('github.com', 'octocat', 'hunter2');

    const [entry] = vault.list();
    const id = entry?.id ?? '';

    vault.lock();
    expect(vault.list()).toEqual([]);
    expect(vault.reveal(id)).toBeNull();
    expect(vault.findForHost('github.com')).toBeNull();
  });

  it('survives a reopen, and still needs the password', () => {
    const name = `vault-persist-${String(Math.random())}`;
    const first = new Vault(name, directory);
    first.create('me@example.com', 'correct horse battery');
    first.save('github.com', 'octocat', 'hunter2');

    const second = new Vault(name, directory);
    expect(second.exists).toBe(true);
    expect(second.unlocked).toBe(false);
    expect(second.list()).toEqual([]);

    expect(second.unlock('correct horse battery').ok).toBe(true);
    const [entry] = second.list();
    expect(second.reveal(entry?.id ?? '')).toBe('hunter2');
  });

  it('matches subdomains against a saved host', () => {
    const vault = open();
    vault.create('me@example.com', 'correct horse battery');
    vault.save('example.com', 'me', 'secret');

    expect(vault.findForHost('example.com')?.username).toBe('me');
    expect(vault.findForHost('login.example.com')?.username).toBe('me');
    expect(vault.findForHost('notexample.com')).toBeNull();
  });

  it('replaces rather than duplicating a login for the same account', () => {
    const vault = open();
    vault.create('me@example.com', 'correct horse battery');
    vault.save('github.com', 'octocat', 'old');
    vault.save('github.com', 'octocat', 'new');

    expect(vault.list()).toHaveLength(1);
    expect(vault.reveal(vault.list()[0]?.id ?? '')).toBe('new');
  });

  it('removes an entry', () => {
    const vault = open();
    vault.create('me@example.com', 'correct horse battery');
    vault.save('github.com', 'octocat', 'hunter2');

    vault.remove(vault.list()[0]?.id ?? '');
    expect(vault.list()).toEqual([]);
  });
});
