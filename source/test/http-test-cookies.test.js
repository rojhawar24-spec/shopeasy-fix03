import test from 'node:test';
import assert from 'node:assert/strict';
import { responseCookie, responseCookieHeader, responseSetCookieHeaders } from '../scripts/http-test-cookies.mjs';

test('cookie helper chooses the last matching session cookie from separate Set-Cookie headers', () => {
  const headers = {
    getSetCookie: () => [
      'sid=anonymous-session; Path=/; HttpOnly; Max-Age=7200',
      'csrf=abc; Path=/; SameSite=Lax',
      'sid=mfa-challenge-session; Path=/; HttpOnly; Max-Age=300'
    ],
    get: () => { throw new Error('combined-header fallback should not be used'); }
  };
  assert.match(responseCookieHeader(headers), /^sid=mfa-challenge-session;/);
  assert.equal(responseCookie(headers), 'sid=mfa-challenge-session');
});

test('combined Set-Cookie parsing does not split on the comma inside Expires', () => {
  const combined = 'sid=old; Path=/, prefs=x; Expires=Fri, 23 Oct 2026 22:00:00 GMT, sid=new; Path=/; Max-Age=300';
  const headers = { get: name => name === 'set-cookie' ? combined : null };
  const values = responseSetCookieHeaders(headers);
  assert.equal(values.length, 3);
  assert.match(values[2], /^sid=new;/);
  assert.equal(responseCookie(headers), 'sid=new');
});

test('missing session cookie returns an empty header and null cookie pair', () => {
  const headers = { getSetCookie: () => ['csrf=x; Path=/', 'prefs=dark; Path=/'] };
  assert.equal(responseCookieHeader(headers), '');
  assert.equal(responseCookie(headers), null);
});
