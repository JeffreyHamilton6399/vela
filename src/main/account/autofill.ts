import type { WebContents } from 'electron';

/**
 * Fills a login form in a page.
 *
 * This is deliberately not a preload. Vela's tabs carry no bridge at all, and
 * adding one so that every page could be autofilled would trade the property
 * the whole browser rests on for a convenience. Instead the script below is
 * injected into one page, at one moment, for as long as it takes to find the
 * form — it has no access to Vela and leaves nothing behind.
 *
 * Three things trigger an injection, and they cost different amounts:
 *
 *   - the key button in the address bar, which fills whatever is there;
 *   - a page load on a site you have saved, when `loginAutofill` is on; and
 *   - a page load on any site, when `offerToSaveLogins` is on, so that Vela
 *     can offer to remember a login you type by hand.
 *
 * The third is the expensive one, and it is a deliberate trade. Offering to
 * save a password you have not saved yet means watching pages Vela holds
 * nothing for, so the narrow old promise — "only hosts in your vault" — no
 * longer holds when it is enabled. What is still true is that the watcher
 * reads nothing until a login is submitted, reports only the username and
 * password of that submission, and reaches no page at all while the vault is
 * locked or the setting is off. There is still no preload and no standing
 * bridge: both scripts are ordinary injections that die with their document.
 */

/** How long the automatic fill keeps watching for a form to appear. */
export const FORM_WAIT_MS = 8_000;

export interface FillOptions {
  username: string;
  password: string;
  /**
   * Overwrite fields that already contain something. True when the user
   * clicked the key button — they asked, so their intent beats what is in the
   * box. False on a page load, so an automatic fill never eats something you
   * were part-way through typing.
   */
  force: boolean;
  /** Press the login button once the fields are in. */
  submit: boolean;
  /**
   * How long to keep watching for the form, in ms. Zero means "look once and
   * give up", which is what a button press wants. A login page that renders
   * its form in JavaScript needs the wait.
   */
  waitMs: number;
}

/**
 * The half both injected scripts share: what a login form looks like.
 *
 * Filling one and offering to remember one have to agree about which box is
 * the username, or Vela would save a credential it could never fill back in.
 */
const PAGE_HELPERS = `
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.opacity !== '0';
  };

  const usable = (element) =>
    visible(element) && !element.disabled && !element.readOnly;

  /**
   * How strongly a text box claims to be the username. A bare input[type=text]
   * scores 1, which is enough for a button press but not for an automatic
   * fill — that is the rule that keeps Vela out of search boxes.
   */
  const usernameScore = (element) => {
    const type = (element.type || '').toLowerCase();
    if (type !== 'text' && type !== 'email' && type !== 'tel' && type !== '') return 0;

    const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
    if (autocomplete === 'username' || autocomplete === 'email') return 4;
    // Anything else named outright — a one-time code, a postcode, a surname —
    // is not the box we want. Only an absent or non-committal value falls
    // through to the name/id evidence below.
    if (autocomplete !== '' && autocomplete !== 'off' && autocomplete !== 'on') return 0;

    if (type === 'email') return 3;

    const hint = [element.name, element.id, element.getAttribute('aria-label'),
      element.placeholder].filter(Boolean).join(' ').toLowerCase();
    if (/(user|email|login|account|identifier)/.test(hint)) return 2;
    if (/(search|query|otp|code|phone|zip|postcode|card)/.test(hint)) return 0;

    return type === 'text' ? 1 : 0;
  };

  /*
   * allowWeak lets a bare input[type=text] count as the username. True when
   * the user pressed the key button, or when a password box in the same form
   * already proves this is a login.
   */
  const findFields = (allowWeak) => {
    const passwords = [...document.querySelectorAll('input[type="password"]')].filter(usable);

    // Two or more password boxes on screen means "choose a password" or
    // "change your password". Neither is a login, and acting on them is worse
    // than doing nothing, so Vela leaves the page alone.
    if (passwords.length > 1) return null;

    const passwordField = passwords[0] ?? null;
    const scope = passwordField?.form ?? document;

    const candidates = [...scope.querySelectorAll('input')]
      .filter(usable)
      .map((element) => ({ element, score: usernameScore(element) }))
      .filter((candidate) => candidate.score > 0);

    const threshold = allowWeak || passwordField !== null ? 1 : 2;
    const best = candidates
      .filter((candidate) => candidate.score >= threshold)
      .sort((a, b) => b.score - a.score)[0];

    const userField = best?.element ?? null;
    if (userField === null && passwordField === null) return null;

    return { userField, passwordField, userScore: best?.score ?? 0 };
  };
`;

const FILL_SCRIPT = `(() => {
  const user = %USER%;
  const pass = %PASS%;
  const force = %FORCE%;
  const submit = %SUBMIT%;
  const waitMs = %WAIT%;
${PAGE_HELPERS}
  const setValue = (element, value) => {
    // React and friends track their own value; the native setter plus an
    // input event is what makes a controlled field actually update.
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    element.focus();
    if (descriptor && descriptor.set) descriptor.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const fill = (fields) => {
    const { userField, passwordField } = fields;
    let filled = 0;
    if (userField !== null && (force || userField.value === '')) {
      setValue(userField, user);
      filled += 1;
    }
    if (passwordField !== null && (force || passwordField.value === '')) {
      setValue(passwordField, pass);
      filled += 1;
    }
    if (passwordField !== null) passwordField.focus();
    return filled;
  };

  const NEXT = /^\\s*(log ?in|sign ?in|continue|next|submit|go)\\b/i;

  const pressSubmit = (fields) => {
    const field = fields.passwordField ?? fields.userField;
    if (field === null) return;
    const form = field.form;

    const button =
      form?.querySelector('button[type="submit"], input[type="submit"]') ??
      [...(form ?? document).querySelectorAll('button, input[type="submit"], [role="button"]')]
        .filter(usable)
        .find((element) => NEXT.test(element.textContent || element.value || ''));

    if (button) {
      button.click();
      return;
    }
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
      return;
    }
    // No form element at all — a React login box. Enter is what a person
    // would press.
    for (const type of ['keydown', 'keypress', 'keyup']) {
      field.dispatchEvent(
        new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
    }
  };

  let total = 0;
  // The password is the thing that finishes a login. Until one has gone in,
  // there may still be another step coming.
  let passwordDone = false;

  const attempt = () => {
    const fields = findFields(force);
    if (fields === null) return;

    const filled = fill(fields);
    if (filled === 0) return;

    total += filled;
    if (fields.passwordField !== null) passwordDone = true;

    // Only submit when this is unmistakably a login: a password went in, or
    // the page told us outright that the box is a username.
    const confident = fields.passwordField !== null || fields.userScore >= 3;
    if (submit && confident) {
      // A tick for the page's own state to catch up with the input events.
      setTimeout(() => { pressSubmit(fields); }, 150);
    }
  };

  attempt();
  if (passwordDone || waitMs <= 0) return total;

  /*
   * Nothing usable yet, or an email box with the password step still to come.
   *
   * Google's sign-in is the case that matters: the step after the email is
   * often a same-document transition, so no second page load happens and no
   * second injection either. Watching from here covers it without Vela having
   * to re-inject on every route change a single-page app makes.
   *
   * Polled rather than observed: a form that was in the DOM all along and
   * merely became visible mutates no nodes, and that is a login page too.
   */
  return new Promise((resolve) => {
    // Once something has been filled, the remaining step is worth waiting
    // longer for — in fill-only mode a person has to press Next themselves.
    let deadline = Date.now() + (total > 0 ? waitMs * 4 : waitMs);

    const timer = setInterval(() => {
      const before = total;
      attempt();
      if (total > before && !passwordDone) deadline = Date.now() + waitMs * 4;

      if (passwordDone || Date.now() > deadline) {
        clearInterval(timer);
        resolve(total);
      }
    }, 300);
  });
})()`;

/**
 * Watches one page for a login being submitted, and reports what was typed.
 *
 * The channel back is the injected script's own return value. It returns a
 * promise that stays pending until a login is submitted, and `executeJavaScript`
 * resolves with it — so no bridge, no channel and no `ipcRenderer` are involved,
 * and a page that never has anyone sign in resolves nothing at all. When the
 * page navigates away the frame takes the promise with it, which arrives here
 * as a rejection and is treated as "nothing to save".
 *
 * The values are read in the submit handler, before the navigation that
 * follows it, because after the navigation the fields are gone.
 */
const WATCH_SCRIPT = `(() => {
${PAGE_HELPERS}
  const readCredential = () => {
    const fields = findFields(false);
    if (fields === null) return null;
    if (fields.passwordField === null || fields.userField === null) return null;

    const username = fields.userField.value;
    const password = fields.passwordField.value;
    if (username === '' || password === '') return null;

    return { username, password };
  };

  return new Promise((resolve) => {
    let done = false;
    const offer = () => {
      if (done) return;
      const credential = readCredential();
      if (credential === null) return;
      done = true;
      resolve(credential);
    };

    // Capture phase, so a handler that stops propagation cannot hide the
    // submit from Vela.
    document.addEventListener('submit', offer, true);

    // Plenty of login boxes are not forms. A click on the sign-in control and
    // Enter in a field are the other two ways a person submits one; both are
    // read on the next tick so the page's own handler runs first.
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (target && target.closest && target.closest('button, [role="button"], input[type="submit"]')) {
          setTimeout(offer, 0);
        }
      },
      true
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter') setTimeout(offer, 0);
      },
      true
    );
  });
})()`;

export interface CapturedLogin {
  username: string;
  password: string;
}

/**
 * Resolves with the credential a person typed into this page, or null if they
 * navigated away, closed the tab, or never signed in.
 */
export async function watchForLogin(contents: WebContents): Promise<CapturedLogin | null> {
  try {
    const captured: unknown = await contents.executeJavaScript(WATCH_SCRIPT, true);
    if (typeof captured !== 'object' || captured === null) return null;

    const { username, password } = captured as Partial<CapturedLogin>;
    if (typeof username !== 'string' || typeof password !== 'string') return null;
    if (username === '' || password === '') return null;

    return { username, password };
  } catch {
    // The frame went away, which is the ordinary end of a watch.
    return null;
  }
}

/**
 * Returns how many fields were filled: 0 means the page had no login form we
 * recognised, which the caller reports rather than pretending it worked.
 */
export async function fillLogin(contents: WebContents, options: FillOptions): Promise<number> {
  // JSON.stringify is the escaping here: the credential is embedded as a
  // string literal, never concatenated into code. The replacements go through
  // functions so that a password containing `$&` or `$1` is inserted verbatim
  // rather than being read as a replacement pattern.
  const script = FILL_SCRIPT.replace('%USER%', () => JSON.stringify(options.username))
    .replace('%PASS%', () => JSON.stringify(options.password))
    .replace('%FORCE%', () => String(options.force))
    .replace('%SUBMIT%', () => String(options.submit))
    .replace('%WAIT%', () => String(Math.max(0, Math.trunc(options.waitMs))));

  try {
    const filled: unknown = await contents.executeJavaScript(script, true);
    return typeof filled === 'number' ? filled : 0;
  } catch {
    return 0;
  }
}
