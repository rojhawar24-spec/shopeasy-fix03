# ShopEasy 2.8.95 — FIX02-B remediation candidate

NOT READY FOR RELEASE. Based on FIX02-A (SHA-256 `82580e15af1fa823135e16b88dcb89a149a6e59a244727d98e93fa3e1fc56767`). Scope: ES-004, ES-008, ES-009. The earlier five implementations are retained. Eight of 23 findings now have implemented, partially verified remediation; 15 remain unaddressed (4 P2, 10 P3, 1 P4). No production data, payments, email, deployment, dependency or schema changes.

## Changes and residual risk
- ES-004: the existing status trigger remains the sole creator of status transition history. Four payment paths update the newest transition's note within the same write transaction, asserting that the expected transition exists. Manager actor and payment/cancellation notes remain. Existing duplicate records are deliberately untouched; a separately reviewed migration would be needed for historical cleanup. Native driver, HTTP and provider sandbox verification remain open.
- ES-008: order-target audit metadata is minimized before either deletion or retention, in the existing privacy transaction. Customer-target, customer-actor and hashed guest-target metadata are also minimized; unrelated audit rows remain untouched. Event identity/action/timestamps and intended financial retention safeguards are retained. No assertion of legal compliance or complete deletion from unrelated logs, historical backups, external systems, or concurrent route-level audit writers.
- ES-009: the backup generator gathers local upload references from the exported snapshot (products, gallery, variants, stories, categories, hero-image setting). It records uploaded database BLOBs and filesystem files actually archived, and rejects missing/invalid local references before publishing the encrypted output. Tested failure preserves the previous backup and checksum. This is fail-closed detection, not a global media/database lock; an operator must retry a failed backup, and restore in a separate environment. Presence in either storage backend is checked, not deployment-specific storage mode, byte-level image validity, external URL availability or concurrent in-place image mutation. Existing backups are not retroactively certified. The archive format is unchanged.

## Executed tests (Node 22.16.0; project requires >=24.22.2 <25)
| Suite | FIX02-A baseline | FIX02-B |
|---|---|---|
| New regression tests (SQLite adapter for order/privacy; native node:sqlite WAL fixtures for backup) | 5 pass / 13 fail | 18 pass / 0 fail |
| Previous independent order and privacy audit | 21 pass / 3 fail | 24 pass / 0 fail |
| Prior FIX01/FIX02-A regressions (adapter for DB) | not rerun here | 20 pass / 0 fail |
| Existing backup, bank, payment and refund tests | not rerun here | 41 pass / 0 fail |
| Native libSQL new order/privacy test file | not attempted | BLOCKED (import missing @libsql/client) |

103 passing test executions, overlapping behavioral coverage, zero confirmed code failures in these candidate executions and one blocked file-level attempt. Not full application testing. Syntax 333 files; lint 333 files / 232 relative imports; preflight 126 production files; static audit 133 files: PASS. No full EJS/HTTP, supported Node/libSQL, real payments, or production verification.

## Reproduce
After supported Node installation and npm ci in a fresh isolated extraction: `node --test test/fix02b-order-privacy.test.js test/fix02b-backup.test.js` and `npm test`. The separate evidence archive records both baseline and candidate TAP files; offline database tests used a disposable adapter copy of src/database.js, not the shipped database implementation. Use only synthetic data. See REPRODUCE.txt in the evidence ZIP.

## Remaining work
P2: ES-011 wishlist concurrency, ES-014 cart preview concurrency, ES-015 AI duplicate requests, ES-021 email recovery. P3 and P4 remain. Commercial rights UNKNOWN. All implemented fixes require native and end-to-end verification before release.
