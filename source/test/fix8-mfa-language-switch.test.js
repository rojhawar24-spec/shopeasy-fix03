import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('FIX8: Manager MFA challenge allows language selection without admitting Manager actions', () => {
  const challengeGuard = source.slice(source.indexOf('app.use(async(req,res,next)=>{\n  try {\n    const challenge = await getMfaLoginChallenge'), source.indexOf("app.use(checkoutDiagnosticStage('csrf-token-loading'))"));
  assert.ok(challengeGuard, 'MFA challenge guard must be present');
  assert.match(challengeGuard, /getMfaLoginChallenge\(req\.sessionId\)/);
  assert.match(challengeGuard, /'\/language'/, 'MFA browser must be allowed to post its language selector');
  assert.match(challengeGuard, /return res\.redirect\(303,challenge\.mode===/);
  assert.doesNotMatch(challengeGuard, /'\/admin'/, 'Manager pages must remain blocked until MFA completes');
});

test('FIX8: language POST remains inside global CSRF protection', () => {
  const securityMiddleware = source.indexOf("app.use(checkoutDiagnosticStage('csrf-validation'))");
  const languageRoute = source.indexOf("app.post('/language'");
  assert.ok(securityMiddleware >= 0 && languageRoute > securityMiddleware);
  const guard = source.slice(securityMiddleware, languageRoute);
  assert.match(guard, /return verifyCsrf\(req,res,next\)/);
  assert.doesNotMatch(guard, /req\.path===['"]\/language['"]/, 'Language POST must not be exempt from CSRF');
});
