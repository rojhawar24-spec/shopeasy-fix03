#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyManagerLoginRedirect, validStagingMfaCode } from './staging-manager-auth.mjs';

const rawBase = String(process.env.STAGING_BASE_URL || process.env.PRODUCTION_BASE_URL || '').trim();
if (!rawBase) {
  console.error('PRODUCTION CERTIFICATION BLOCKED: set STAGING_BASE_URL (recommended) or PRODUCTION_BASE_URL to an HTTPS staging/live origin.');
  process.exit(2);
}

let base;
try {
  base = new URL(rawBase.endsWith('/') ? rawBase : `${rawBase}/`);
  if (base.protocol !== 'https:') throw new Error('HTTPS required');
  if (base.username || base.password) throw new Error('Credentials must not be embedded in URL');
} catch (error) {
  console.error(`PRODUCTION CERTIFICATION BLOCKED: invalid base URL: ${error.message}`);
  process.exit(2);
}

const cookieJar = new Map();
function absorbCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  for (const raw of values) {
    const first = raw.split(';', 1)[0];
    const eq = first.indexOf('=');
    if (eq > 0) cookieJar.set(first.slice(0, eq), first.slice(eq + 1));
  }
}
function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
function abs(path) { return new URL(path, base).toString(); }
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(abs(path), { ...options, headers, redirect: 'manual' });
  absorbCookies(response);
  return response;
}
function assertNoSettingsRedirect(response, path) {
  assert.ok([200, 301, 302, 303, 307, 308].includes(response.status), `${path}: unexpected HTTP ${response.status}`);
  const location = response.headers.get('location') || '';
  assert.doesNotMatch(location, /\/admin\/settings(?:\?|$)/, `${path}: must not redirect directly to admin settings`);
}

console.log(`Production certification target: ${base.origin}`);

const home = await request('/');
assert.equal(home.status, 200, 'Homepage must return 200');
const homeHtml = await home.text();
assert.match(homeHtml, /<main[^>]+id=["']main-content["']/i, 'Homepage main content is missing');
assert.doesNotMatch(homeHtml, /Store settings|<form[^>]+action=["']\/admin\/settings["']/i, 'Homepage must not render the manager Settings page');
assertNoSettingsRedirect(home, '/');

const homeCache = home.headers.get('cache-control') || '';
assert.match(homeCache, /private|no-store/i, 'Personalized homepage must not be publicly cached');
assert.ok(home.headers.get('content-security-policy'), 'CSP header missing');
assert.equal(home.headers.get('x-content-type-options'), 'nosniff', 'nosniff header missing');

for (const path of ['/shop', '/login', '/stories', '/privacy', '/terms', '/shipping-returns', '/robots.txt', '/sitemap.xml']) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} must return 200`);
  assertNoSettingsRedirect(response, path);
}

const health = await request('/health');
assert.equal(health.status, 200, '/health must return 200');
const healthJson = await health.json();
assert.equal(healthJson.ok, true, '/health must report {ok:true}');
const ready = await request('/ready');
assert.equal(ready.status, 200, '/ready must return 200');
const readyJson = await ready.json();
assert.equal(readyJson.ok, true, '/ready must report {ok:true}');
assert.equal(readyJson.ready, true, '/ready must report {ready:true}');

for (const path of ['/admin', '/admin/settings']) {
  const response = await request(path);
  assert.ok([302, 303].includes(response.status), `${path} should redirect unauthenticated visitors to login`);
  const location = response.headers.get('location') || '';
  assert.match(location, /^\/login\?next=%2Fadmin(?:%2Fsettings)?$/i, `${path} must redirect to login with an encoded next target`);
  assert.doesNotMatch(location, /\/admin\/settings$/, `${path} must not expose settings to guests`);
}

for (const asset of ['/css/app.css', '/js/app.js', '/js/i18n-ar.js', '/js/i18n-ckb.js', '/assets/logo.svg']) {
  const response = await request(asset);
  assert.equal(response.status, 200, `${asset} must be reachable`);
}

const managerEmail = String(process.env.STAGING_MANAGER_EMAIL || process.env.STAGING_ADMIN_EMAIL || '').trim();
const managerPassword = process.env.STAGING_MANAGER_PASSWORD ?? process.env.STAGING_ADMIN_PASSWORD;
if ((managerEmail && !managerPassword) || (!managerEmail && managerPassword)) {
  console.error('PRODUCTION CERTIFICATION BLOCKED: provide both STAGING_MANAGER_EMAIL and STAGING_MANAGER_PASSWORD, or neither. (Legacy STAGING_ADMIN_* aliases remain supported.)');
  process.exit(2);
}

if (managerEmail && managerPassword) {
  const loginPage = await request('/login');
  assert.equal(loginPage.status, 200, 'Admin login page must return 200');
  const loginHtml = await loginPage.text();
  const csrfMatch = loginHtml.match(/name=["']_csrf["'][^>]*value=["']([^"']+)["']/i);
  assert.ok(csrfMatch?.[1], 'Login CSRF token missing');

  const form = new URLSearchParams();
  form.set('_csrf', csrfMatch[1]);
  form.set('next', '/admin');
  form.set('email', managerEmail);
  form.set('password', managerPassword);
  form.set('rememberMe', 'on');
  const loginResponse = await request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'referer': abs('/login') },
    body: form.toString()
  });
  assert.ok([302, 303].includes(loginResponse.status), `Admin login should redirect, got ${loginResponse.status}`);
  const loginLocation = loginResponse.headers.get('location') || '';
  const challenge = classifyManagerLoginRedirect(loginLocation);
  if (challenge === 'setup') {
    console.error('PRODUCTION CERTIFICATION BLOCKED: this Manager needs MFA enrolment. Complete authenticator setup manually on staging, then rerun with a new code.');
    process.exit(2);
  }
  if (challenge !== 'verify') {
    console.error('PRODUCTION CERTIFICATION BLOCKED: Manager password sign-in did not begin the required MFA challenge. Check the staging account, MFA configuration and login response.');
    process.exit(2);
  }
  const mfaCode = process.env.STAGING_MANAGER_MFA_CODE;
  if (!validStagingMfaCode(mfaCode)) {
    console.error('PRODUCTION CERTIFICATION BLOCKED: set a current one-time STAGING_MANAGER_MFA_CODE for the staging Manager (6-digit authenticator or 24-hex recovery code). Never store it in .env or a log.');
    process.exit(2);
  }
  const challengePage = await request('/mfa/verify');
  assert.equal(challengePage.status, 200, 'Manager MFA verification page must return 200');
  const challengeHtml = await challengePage.text();
  const mfaCsrfMatch = challengeHtml.match(/name=["']_csrf["'][^>]*value=["']([^"']+)["']/i);
  assert.ok(mfaCsrfMatch?.[1], 'Manager MFA CSRF token missing');
  const mfaForm = new URLSearchParams();
  mfaForm.set('_csrf', mfaCsrfMatch[1]);
  mfaForm.set('code', mfaCode);
  const mfaResponse = await request('/mfa/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'referer': abs('/mfa/verify') },
    body: mfaForm.toString()
  });
  assert.ok([302, 303].includes(mfaResponse.status), `Manager MFA must redirect after valid verification, got ${mfaResponse.status}`);
  const mfaLocation = mfaResponse.headers.get('location') || '';
  assert.match(mfaLocation, /^\/admin(?:[/?#]|$)/, 'Manager MFA must lead to authenticated /admin');

  const admin = await request('/admin');
  assert.equal(admin.status, 200, 'Authenticated manager dashboard must return 200');
  const adminHtml = await admin.text();
  assert.match(adminHtml, /Store manager|Dashboard|Orders|Products/i, 'Manager dashboard content missing');

  const settings = await request('/admin/settings');
  assert.equal(settings.status, 200, 'Authenticated admin settings must return 200');
  const settingsHtml = await settings.text();
  assert.match(settingsHtml, /Store settings/i, 'Admin settings page content missing');
}

console.log('STAGING PUBLIC ROUTE/CSP GATE: PASS — not a full production certification.');
if (!managerEmail) {
  console.error('Authenticated Manager gate: NOT RUN. PRODUCTION CERTIFICATION INCOMPLETE: set STAGING_MANAGER_EMAIL, STAGING_MANAGER_PASSWORD and a current one-time STAGING_MANAGER_MFA_CODE.');
  process.exitCode = 2;
} else {
  console.log('Authenticated Manager gate: PASS (password + MFA + dashboard + settings).');
  console.log('NOT TESTED HERE: real checkout, Mollie sandbox/webhooks, backups, product uploads, legal rights, accessibility, penetration testing.');
}
