import { describe, expect, it } from 'vitest';
import { detectSignInRejection, externalUrlForRejection } from '../../src/main/tabs/rejection.js';

describe('detectSignInRejection', () => {
  /** The exact URL Google sent a Vela tab back to, captured from a real run. */
  const OBSERVED =
    'https://accounts.google.com/v3/signin/rejected?dsh=S-31457267%3A1786544458418872&epd=AVqPwHi&flowEntry=ServiceLogin&flowName=GlifWebSignIn&idnf=someone%40gmail.com&rhlk=le&rrk=46';

  it('recognises the page Google actually lands on', () => {
    expect(detectSignInRejection(OBSERVED)).toEqual({ service: 'Google' });
  });

  it('does not depend on the path version, which Google has moved before', () => {
    expect(detectSignInRejection('https://accounts.google.com/signin/rejected')).toEqual({
      service: 'Google',
    });
  });

  it('recognises the OAuth refusal, which comes back in the query', () => {
    expect(
      detectSignInRejection('https://app.example/callback?error=disallowed_useragent&state=abc'),
    ).toEqual({ service: 'Google' });
  });

  it('leaves the sign-in page itself alone — that one is working', () => {
    expect(
      detectSignInRejection(
        'https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn',
      ),
    ).toBeNull();
  });

  it('does not fire on an unrelated page that merely says rejected', () => {
    expect(detectSignInRejection('https://example.com/signin/rejected')).toBeNull();
    expect(detectSignInRejection('https://accounts.google.com/rejected')).toBeNull();
  });

  it('is not fooled by a host that only ends in something similar', () => {
    expect(detectSignInRejection('https://notgoogle.com/signin/rejected')).toBeNull();
  });

  it('passes anything unparseable through as no rejection', () => {
    expect(detectSignInRejection('')).toBeNull();
    expect(detectSignInRejection('not a url')).toBeNull();
  });
});

describe('externalUrlForRejection', () => {
  /**
   * The refusal page's query is single-use and session-bound. Handing it to
   * another browser earns a bare "400. That's an error." — a worse dead end
   * than the one the button exists to escape.
   */
  it('does not hand over the single-use query that earns a 400', () => {
    const rejected =
      'https://accounts.google.com/v3/signin/rejected?dsh=S-31457267%3A1786544458418872&epd=AVqPwHi&rhlk=le&rrk=46';
    const target = externalUrlForRejection(rejected);

    expect(target).toBe('https://accounts.google.com/');
    expect(target).not.toContain('dsh');
    expect(target).not.toContain('epd');
    expect(target).not.toContain('?');
  });

  it('sends an OAuth refusal back to the application, not to its callback', () => {
    expect(
      externalUrlForRejection('https://app.example/auth/callback?error=disallowed_useragent'),
    ).toBe('https://app.example/');
  });

  it('refuses to hand over anything that is not https', () => {
    expect(externalUrlForRejection('http://accounts.google.com/signin/rejected')).toBeNull();
    expect(externalUrlForRejection('file:///etc/passwd')).toBeNull();
    expect(externalUrlForRejection('not a url')).toBeNull();
  });
});
