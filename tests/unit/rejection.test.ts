import { describe, expect, it } from 'vitest';
import { detectSignInRejection } from '../../src/main/tabs/rejection.js';

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
