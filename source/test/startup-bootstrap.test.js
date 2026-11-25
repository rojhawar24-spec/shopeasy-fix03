import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('Node entrypoint loads .env before importing the application and database module graph', () => {
  const bootstrap = read('src/bootstrap.js');
  const pkg = JSON.parse(read('package.json'));
  assert.match(bootstrap, /await import\('\.\/load-environment\.js'\);[\s\S]*?await import\('\.\/server\.js'\)/);
  assert.match(read('src/load-environment.js'), /dotenv\.config\(\{\s*quiet:\s*true,\s*debug:\s*false\s*\}\)/);
  assert.equal(pkg.scripts.start, 'node src/bootstrap.js');
  assert.equal(pkg.scripts.dev, 'node --watch src/bootstrap.js');
  assert.match(read('shopeasy.service'), /ExecStart=\/usr\/bin\/node scripts\/start-production\.mjs/);
  assert.equal(pkg.scripts['start:prod'],'node scripts/start-production.mjs');
  assert.match(read('scripts/start-production.mjs'),/process\.env\.NODE_ENV\s*=\s*'production';[\s\S]*await import\('\.\.\/src\/bootstrap\.js'\)/);
  assert.doesNotMatch(read('src/server.js').split('import express')[0], /dotenv\/config/);
});

test('expired Manager MFA submission returns to login with a clear restart message', () => {
  const server = read('src/server.js');
  const login = read('views/login.ejs');
  assert.match(server, /req\.query\.mfa==='expired'\?'Your five-minute sign-in security challenge expired/);
  assert.match(server, /app\.post\('\/mfa\/verify',[\s\S]*?if\(!challenge\) return res\.redirect\(303,'\/login\?mfa=expired'\)/);
  assert.match(server, /app\.get\('\/mfa\/verify',[\s\S]*?if\(!challenge\) return res\.redirect\(303,'\/login\?mfa=expired'\)/);
  const csrfMarker = server.indexOf("app.use(checkoutDiagnosticStage('csrf-validation'));");
  const csrfStart = server.indexOf('app.use(async(req,res,next)=>{', csrfMarker);
  const csrfEnd = server.indexOf('});', csrfStart) + 3;
  assert.ok(csrfMarker >= 0 && csrfStart > csrfMarker && csrfEnd > csrfStart, 'global CSRF middleware must be present');
  const csrfMiddleware = server.slice(csrfStart, csrfEnd);
  const staleChallengeCheck = csrfMiddleware.indexOf('getMfaLoginChallenge(req.sessionId)');
  const csrfValidation = csrfMiddleware.indexOf('return verifyCsrf(req,res,next)');
  assert.ok(staleChallengeCheck >= 0 && csrfValidation > staleChallengeCheck, 'expired MFA challenge must be detected before global CSRF validation');
  assert.ok(csrfMiddleware.includes("if (req.method==='POST' && ['/mfa/setup','/mfa/verify'].includes(req.path))"));
  assert.match(csrfMiddleware, /return res\.redirect\(303,'\/login\?mfa=expired'\)/);
  assert.match(login, /if\(error\)\{ %><div class="alert"[^>]*role="alert"[^>]*><%= pageText\(error\) %><\/div>/);
});

test('local checkout diagnostic also checks the Manager MFA schema without reading secret values', () => {
  const diagnostic = read('scripts/diagnose-checkout.mjs');
  assert.match(diagnostic, /mfa_login_challenges: \['session_id','user_id','expires_at_ms','mode','remember_me','next_path','created_at_ms'\]/);
  assert.match(diagnostic, /mfa_rate_limits: \['user_id','source_hash','window_started_at_ms','attempts'\]/);
  assert.match(diagnostic, /users: \['id','email','role','mfa_secret','mfa_enabled','mfa_recovery_codes_hash','mfa_last_totp_step'\]/);
  assert.doesNotMatch(diagnostic, /SELECT[^;]*(?:email|mfa_secret|mfa_recovery_codes_hash)\s+FROM/i);
});
