# ShopEasy 2.8.95 / R28-FIX01 — ES-005 remediation candidate

24 November 2026. NOT READY FOR RELEASE. Original ZIP SHA-256: `0d4fec7d5947b7d003edcc8cb7ac846f7883a3b5535a75be5ff09d047854748d`. The original archive is unchanged. The base package version remains 2.8.95 to preserve existing release contracts and dependency lock; FIX01 identifies this separate candidate, not an official new release. No database migration, template, CSS, asset, provider or dependency changes.

## Change and invariant
Password verification returns a server-internal, nonenumerable credential snapshot. Authenticated session insertion and MFA challenge insertion each check the current user hash, exact email and role in the same SQL write as issuance. Customer email verification and Manager MFA-enabled state are checked at session issuance. Manager setup writes also compare the snapshot. Login no longer reassigns a session user after creation; failure cleans up the new session. All four application login call sites pass the snapshot, including registration and both Manager MFA completion paths. Raw password hashes are not stored in sessions, cookies or response models. Password reset and credential update already revoke sessions in a write transaction; when revocation precedes issuance, stale snapshots cannot issue a session. When issuance precedes revocation, the newly issued row is revoked. No guarantee is made about already executing authorized requests, other MFA defects, or actual multi-connection libSQL behavior. Existing pending challenges from a prior deployed build should be revoked on upgrade before serving traffic; do this only in a controlled staging/deployment procedure with a verified backup.

## Evidence
- `test/credential-issuance-race.test.js`: same regression suite on original and patched source with a disposable Node SQLite adapter. Baseline 4 pass / 9 fail; patched 13 pass / 0 fail. The adapter does not model real libSQL concurrency. Tests simulate controlled orderings, not simultaneous HTTP requests. Synthetic credentials only.
- Nine selected existing test files: 60 pass / 0 fail, including source contracts, MFA helpers and password hashing. Not a complete suite.
- Additional release/documentation checks: 21 pass, one blocked (missing dotenv). Syntax 328 files, lint 328 files/226 imports, release preflight 125 files and static audit 132 files passed.
- Native driver execution blocked: missing `@libsql/client`, Node v22.16.0 rather than required Node >=24.22.2 <25. No live requests or payment operations. The original R28 verification files and evidence do not certify this candidate.

## Reproduce with the intended runtime
On an isolated fresh extraction using the required Node version, run `npm run verify:package`, `npm ci`, `npm run check`, `npm run lint`, `node scripts/run-tests.mjs test/credential-issuance-race.test.js`, then `npm test`. Native/HTTP verification and concurrent requests across real database connections remain mandatory before closing ES-005. The separate evidence package includes the adapter and actual TAP logs. The shipped application retains its original native database implementation.

## Status
ES-005: implementation changed, PARTIALLY VERIFIED. All other 22 audit findings are not addressed in this candidate. Commercial rights remain UNKNOWN. Do not deploy to production or call this a verified release. 
