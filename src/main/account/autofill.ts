import type { WebContents } from 'electron';

/**
 * Fills a login form in the page the user is looking at.
 *
 * This is deliberately not a preload. Vela's tabs carry no bridge at all, and
 * adding one so that every page could be autofilled would trade the property
 * the whole browser rests on for a convenience. Instead the script below is
 * injected once, into one page, at the moment the user clicks "Fill" — it
 * exists for a few milliseconds, has no access to Vela, and leaves nothing
 * behind.
 *
 * The consequence is honest: Vela fills a login when you ask it to, rather than
 * silently on every page load.
 */
const FILL_SCRIPT = `(() => {
  const user = %USER%;
  const pass = %PASS%;

  const setValue = (element, value) => {
    // React and friends track their own value; the native setter plus an
    // input event is what makes a controlled field actually update.
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const passwordField = [...document.querySelectorAll('input[type="password"]')].find(visible);

  const userField = [
    ...document.querySelectorAll(
      'input[type="email"], input[type="text"], input[name*="user" i], input[id*="user" i], input[name*="email" i], input[autocomplete="username"]'
    ),
  ].find(visible);

  let filled = 0;
  if (userField) { setValue(userField, user); filled += 1; }
  if (passwordField) { setValue(passwordField, pass); filled += 1; }
  if (passwordField) passwordField.focus();

  return filled;
})()`;

/**
 * Returns how many fields were filled: 0 means the page had no login form we
 * recognised, which the caller reports rather than pretending it worked.
 */
export async function fillLogin(
  contents: WebContents,
  username: string,
  password: string,
): Promise<number> {
  // JSON.stringify is the escaping here: the credential is embedded as a
  // string literal, never concatenated into code.
  const script = FILL_SCRIPT.replace('%USER%', JSON.stringify(username)).replace(
    '%PASS%',
    JSON.stringify(password),
  );

  try {
    const filled: unknown = await contents.executeJavaScript(script, true);
    return typeof filled === 'number' ? filled : 0;
  } catch {
    return 0;
  }
}
