import { randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import ElectronStore from 'electron-store';
import { z } from 'zod';

/**
 * Vela's account and password vault.
 *
 * There is no server, so "signing in" means unlocking a file on this machine
 * with a master password. That is the whole of it: nothing is transmitted, no
 * account exists anywhere else, and the email is a label so the vault knows
 * whose it is.
 *
 * Credentials are encrypted with AES-256-GCM under a key derived from the
 * master password with scrypt. The master password is never stored — only a
 * verifier derived from it, so a wrong password fails without revealing the
 * right one, and a stolen file without the password is a box with no lid.
 */
const SCRYPT_COST = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const credentialSchema = z.object({
  id: z.string(),
  host: z.string(),
  username: z.string(),
  /** Ciphertext, iv and tag, all base64. */
  secret: z.string(),
  iv: z.string(),
  tag: z.string(),
  updatedAt: z.number(),
});
export type StoredCredential = z.infer<typeof credentialSchema>;

const fileSchema = z.object({
  email: z.string().default(''),
  salt: z.string().default(''),
  verifier: z.string().default(''),
  credentials: z.array(credentialSchema).default([]),
});

export interface VaultEntry {
  id: string;
  host: string;
  username: string;
  updatedAt: number;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_BYTES, SCRYPT_COST);
}

export class Vault {
  private readonly store: ElectronStore<{ account: unknown }>;
  private data: z.infer<typeof fileSchema>;
  /** Held only while unlocked, and only in memory. */
  private key: Buffer | null = null;

  /**
   * `directory` is normally left out, so the file lands beside the other
   * settings. Tests pass one to keep the real profile untouched.
   */
  constructor(name = 'vela-account', directory?: string) {
    // exactOptionalPropertyTypes: the keys are omitted rather than undefined.
    this.store = new ElectronStore<{ account: unknown }>({
      name,
      ...(directory === undefined ? {} : { cwd: directory, projectName: 'vela' }),
    });
    const parsed = fileSchema.safeParse(this.store.get('account'));
    this.data = parsed.success ? parsed.data : fileSchema.parse({});
  }

  get exists(): boolean {
    return this.data.verifier !== '';
  }

  get email(): string {
    return this.data.email;
  }

  get unlocked(): boolean {
    return this.key !== null;
  }

  /** Creates the account. The master password cannot be recovered later. */
  create(email: string, masterPassword: string): { ok: boolean; error: string | null } {
    if (this.exists) return { ok: false, error: 'An account already exists on this machine.' };
    if (masterPassword.length < 8) {
      return { ok: false, error: 'Use at least 8 characters.' };
    }

    const salt = randomBytes(SALT_BYTES);
    const key = deriveKey(masterPassword, salt);

    this.data = {
      email: email.trim(),
      salt: salt.toString('base64'),
      // A separate derivation, so the verifier is not the encryption key.
      verifier: deriveKey(`${masterPassword}:verifier`, salt).toString('base64'),
      credentials: [],
    };
    this.key = key;
    this.persist();

    return { ok: true, error: null };
  }

  unlock(masterPassword: string): { ok: boolean; error: string | null } {
    if (!this.exists) return { ok: false, error: 'No account on this machine yet.' };

    const salt = Buffer.from(this.data.salt, 'base64');
    const candidate = deriveKey(`${masterPassword}:verifier`, salt);
    const expected = Buffer.from(this.data.verifier, 'base64');

    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      return { ok: false, error: 'That password does not match.' };
    }

    this.key = deriveKey(masterPassword, salt);
    return { ok: true, error: null };
  }

  lock(): void {
    this.key = null;
  }

  list(): VaultEntry[] {
    if (!this.unlocked) return [];
    return this.data.credentials
      .map(({ id, host, username, updatedAt }) => ({ id, host, username, updatedAt }))
      .sort((a, b) => a.host.localeCompare(b.host));
  }

  /** Stores or replaces the credential for a host. */
  save(host: string, username: string, password: string): boolean {
    const key = this.key;
    if (key === null) return false;

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const secret = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);

    const entry: StoredCredential = {
      id: `${host}:${username}`,
      host,
      username,
      secret: secret.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      updatedAt: Date.now(),
    };

    this.data.credentials = [
      ...this.data.credentials.filter((existing) => existing.id !== entry.id),
      entry,
    ];
    this.persist();
    return true;
  }

  /** Decrypts one password. Returns null when locked or absent. */
  reveal(id: string): string | null {
    const key = this.key;
    if (key === null) return null;

    const entry = this.data.credentials.find((candidate) => candidate.id === id);
    if (entry === undefined) return null;

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(entry.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(entry.secret, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // A failed tag check means the file was tampered with or the key is wrong.
      return null;
    }
  }

  /** The credential saved for a host, if any. */
  findForHost(host: string): VaultEntry | null {
    if (!this.unlocked) return null;
    return (
      this.list().find((entry) => entry.host === host || host.endsWith(`.${entry.host}`)) ?? null
    );
  }

  remove(id: string): void {
    this.data.credentials = this.data.credentials.filter((entry) => entry.id !== id);
    this.persist();
  }

  private persist(): void {
    this.store.set('account', this.data);
  }
}
