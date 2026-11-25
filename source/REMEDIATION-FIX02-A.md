# ShopEasy 2.8.95 — R28-FIX02-A remediation candidate

NOT READY FOR RELEASE. Scope: first four of eleven P2 findings, ES-001, ES-002, ES-003, ES-006, building on FIX01. This is a partial implementation and verification batch; seven P2 findings and eighteen total findings are not yet addressed. No production deployment, actual payment, or real user data involved. Original and FIX01 archives unchanged. FIX01 input SHA-256: `defafecba0f100ca7960190263cb2443bbd798d3ad1c9f571e68cee59ec71c5d`.

## Changes and limitations
- ES-001/002: shared `src/local-navigation.js` parses root-relative navigation and revalidates the serialized path as a URL. Rejects protocol-relative normalized paths, backslashes, raw ASCII whitespace/control characters (use percent-encoded spaces), unsafe custom fallback. Customer role restrictions and language query handling retained. HTTP Location and live navigation not exercised.
- ES-003: `src/mfa.js` selects the highest matching eligible TOTP step in the existing drift window, preventing the reproduced same-window collision replay without new persistence or widening the window. Ordinary drift and replay controls tested. Does not guarantee rejection of a newly matching future step outside the earlier window, nor prove real concurrent MFA request behavior; native integration and broader cross-window replay policy review remain necessary.
- ES-006: `src/db.js` requires a nonempty expected encrypted secret and compares it atomically in the activation UPDATE. `src/server.js` passes the same encrypted secret whose decrypted seed was verified. Credential snapshot checks from FIX01 retained. Existing activation fixtures updated to explicitly supply expectedSecret. No changes to schema, dependencies, templates, assets, or recovery-code policy. Real parallel enrollment requests and full HTTP untested.

## Executed evidence
- New 7 regression tests: FIX01 baseline 2 pass / 5 fail, FIX02-A 7 pass / 0 fail (enrollment used a disposable Node SQLite adapter, not libSQL).
- Original independent audit tests: FIX01 4 pass / 3 fail; candidate 7 pass / 0 fail, including financial controls.
- FIX01 credential issuance regression: 13 pass / 0 fail, using the same SQLite adapter.
- Existing MFA/navigation/SEO regression: 57 pass; one file blocked at import by missing EJS (Node reports failure). Native enrollment test file blocked by missing @libsql/client (Node reports failure). These two import failures are environment blockers, not proven application defects.
- Total selected candidate checks from these four suites: 84 pass; zero confirmed application failures in those executions; two blocked file-level attempts. Some checks overlap by behavior. No full suite or coverage claim.
- Syntax 331 files; lint 331 files and 231 relative imports; preflight 126 files; static audit 133 files: passed. Node v22.16.0, project requires >=24.22.2 <25. No new production certification.

## Reproduce
Using supported Node and dependencies in a disposable fresh extraction: `npm run verify:package`, `npm ci`, `node --test test/fix02-navigation-mfa.test.js test/fix02-mfa-enrollment.test.js test/credential-issuance-race.test.js`, `npm test`. Separate evidence contains baseline/candidate TAP and the adapter used only in disposable copies. The original `src/database.js` is unmodified in the delivered ZIP.

## Remaining P2 items
ES-004 order history, ES-008 privacy deletion, ES-009 backup consistency, ES-011 wishlist concurrency, ES-014 cart preview concurrency, ES-015 AI requests, ES-021 email recovery. P3 (10) and P4 (1) unchanged. ES-005 and these four P2 fixes are PARTIALLY VERIFIED pending supported native and HTTP regression. Original commercial rights UNKNOWN. Historical R28 and FIX01 evidence cannot certify this new candidate.
