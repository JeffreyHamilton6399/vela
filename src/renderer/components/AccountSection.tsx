import { useEffect, useState, type JSX } from 'react';
import type { AccountState, VaultEntry } from '../../shared/types/ipc.js';

const FIELD =
  'focus-ring w-full rounded-lg border border-line bg-raised px-1 py-1 text-[13px] text-ink outline-none';

/**
 * The Vela account.
 *
 * It is local. Signing in unlocks a file on this machine with a master
 * password — there is no server to sign in to, and the email is a label so you
 * know whose vault it is. Everything below says so plainly rather than letting
 * anyone assume their passwords are being synced somewhere.
 */
export function AccountSection(): JSX.Element {
  const [state, setState] = useState<AccountState | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [siteHost, setSiteHost] = useState('');
  const [siteUser, setSiteUser] = useState('');
  const [sitePassword, setSitePassword] = useState('');

  const refresh = (): void => {
    void window.vela.account.state().then((next) => {
      setState(next);
      if (next.unlocked) void window.vela.account.list().then(setEntries);
      else setEntries([]);
    });
  };

  useEffect(refresh, []);

  if (state === null) return <p className="px-1 text-[12px] text-ink-muted">Checking…</p>;

  /* ----- no account yet ----- */
  if (!state.exists) {
    return (
      // A form, so that Enter in the password field does what Enter in a
      // password field does everywhere else.
      <form
        className="flex flex-col gap-1 px-1 py-1"
        onSubmit={(event) => {
          event.preventDefault();
          void window.vela.account.create(email, password).then((result) => {
            setError(result.error);
            setPassword('');
            if (result.ok) refresh();
          });
        }}
      >
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Create a Vela account to save the logins you use on websites. It exists only on this
          machine: there is no server to sign in to, nothing is uploaded, and the master password is
          never stored — only a value derived from it, so a copy of the file without the password is
          unreadable.
        </p>

        <input
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          type="email"
          placeholder="you@example.com"
          aria-label="Email"
          className={FIELD}
        />
        <input
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          type="password"
          placeholder="Master password (8 characters or more)"
          aria-label="Master password"
          className={FIELD}
        />

        <button
          type="submit"
          className="focus-ring self-start rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface hover:opacity-90"
        >
          Create account
        </button>

        {error === null ? null : <span className="text-[12px] text-danger">{error}</span>}

        <p className="pt-1 text-[11px] leading-relaxed text-ink-muted">
          There is no password reset, because there is nobody to ask. Forgetting it means the saved
          logins are gone.
        </p>
      </form>
    );
  }

  /* ----- account exists, locked ----- */
  if (!state.unlocked) {
    return (
      <form
        className="flex flex-col gap-1 px-1 py-1"
        onSubmit={(event) => {
          event.preventDefault();
          void window.vela.account.unlock(password).then((result) => {
            setError(result.error);
            setPassword('');
            if (result.ok) refresh();
          });
        }}
      >
        <p className="text-[13px] text-ink">Signed out — {state.email}</p>
        <input
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          type="password"
          placeholder="Master password"
          aria-label="Master password"
          className={FIELD}
        />
        <button
          type="submit"
          className="focus-ring self-start rounded-lg bg-ink px-2 py-1 text-[13px] font-medium text-surface hover:opacity-90"
        >
          Sign in
        </button>
        {error === null ? null : <span className="text-[12px] text-danger">{error}</span>}
      </form>
    );
  }

  /* ----- unlocked ----- */
  return (
    <div className="flex flex-col gap-2 px-1 py-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[13px] text-ink">Signed in as {state.email}</span>
        <button
          type="button"
          onClick={() => {
            void window.vela.account.lock().then(refresh);
          }}
          className="focus-ring rounded-lg border border-line px-1 py-[3px] text-[12px] text-ink hover:bg-hover"
        >
          Sign out
        </button>
      </div>

      <p className="text-[12px] leading-relaxed text-ink-muted">
        Saved logins live in an encrypted file here. Sign in somewhere by hand and Vela offers to
        remember it; after that it fills the form as the page loads, and the address bar’s key
        button fills it again on demand. Filling reaches only the hosts in this list — offering to
        save is the part that watches wider, and it can be turned off below.
      </p>

      <form
        className="flex flex-col gap-[3px]"
        onSubmit={(event) => {
          event.preventDefault();
          void window.vela.account
            .save(siteHost.trim(), siteUser.trim(), sitePassword)
            .then((result) => {
              setError(result.error);
              if (!result.ok) return;
              setSiteHost('');
              setSiteUser('');
              setSitePassword('');
              refresh();
            });
        }}
      >
        <span className="text-[12px] font-semibold text-ink">Add a login</span>
        <input
          value={siteHost}
          onChange={(event) => {
            setSiteHost(event.target.value);
          }}
          placeholder="github.com"
          aria-label="Site"
          className={FIELD}
        />
        <input
          value={siteUser}
          onChange={(event) => {
            setSiteUser(event.target.value);
          }}
          placeholder="Username or email"
          aria-label="Username"
          className={FIELD}
        />
        <input
          value={sitePassword}
          onChange={(event) => {
            setSitePassword(event.target.value);
          }}
          type="password"
          placeholder="Password"
          aria-label="Site password"
          className={FIELD}
        />
        <button
          type="submit"
          className="focus-ring self-start rounded-lg border border-line px-2 py-1 text-[12px] text-ink hover:bg-hover"
        >
          Save login
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-[12px] text-ink-muted">Nothing saved yet.</p>
      ) : (
        <ul className="flex flex-col gap-[2px]">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink">{entry.host}</span>
                <span className="block text-[11px] text-ink-muted">{entry.username}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  void window.vela.account.remove(entry.id).then(refresh);
                }}
                className="focus-ring shrink-0 rounded-lg px-1 text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error === null ? null : <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
