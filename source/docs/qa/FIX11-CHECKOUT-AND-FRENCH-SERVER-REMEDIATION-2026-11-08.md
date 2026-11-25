# ShopEasy FIX11 — Belgian checkout gate and French server HTML audit

**Source:** FIX10, extracted separately. **Date:** 8 November 2026. **Release status:** QA candidate, NOT approved for production or commercial resale.

## Repaired and directly tested

1. **Belgian order setup:** `src/launch-gate.js` now treats `BE`, `Belgium`, `België`, `Belgique` and other common national spellings as requiring **standard** checkout readiness even when a manager configures `simplified_cod`. `src/server.js` passes the configured delivery countries into this decision and requires complete standard policies and the identity/tax check. Settings display the effective checklist, and the client preview updates as delivery countries change. Draft settings can still be saved. Simplified COD remains available for configured non-Belgian delivery markets. This is a conservative application safety gate, **not a legal certification**. The actual merchant's country, tax treatment and international obligations require independent review.
2. **French first-paint / no-JavaScript storefront:** `views/shop.ejs` now outputs French for the category / shop heading, description, category browsing and major filter, cart notice and results text at the server. `views/partials/footer.ejs` now renders the key customer links, contact labels, newsletter, basket preview and consent preference labels in French without relying solely on the browser translator. Existing EN/NL/CKB/AR paths are retained. French legal copy still requires review by a qualified native speaker and merchant.
3. **Defensive edge case:** `evaluateLaunchReadiness()` no longer dereferences `null` for optional customer policy data; the selected TypeScript check flagged the possible null path. Null policies now fail readiness instead of crashing.
4. **Regression tests:** added `test/r23-belgian-french-server-regressions.test.js` (7 tests) for Belgian spellings, disabled checkout with missing business identity, non-Belgian simplified COD, malformed inputs, actual shop server heading evaluation, and French shop/footer labels. Two historical tests were updated to assert the new multilingual HTML instead of requiring literal English fragments.
5. **Scoped typecheck:** expanded `tsconfig.typecheck-core.json` from three modules to four, including the checkout launch-gate module. This is *not* a project-wide typecheck.
6. **Generated sources:** regenerated `generated/cloudflare-views.js` from updated EJS templates. No credentials, local databases, uploads or node_modules included.

## Executed evidence

```text
node --test [177 dependency-independent files]
# tests 892
# pass 892
# fail 0
# skipped 0

node scripts/check-syntax.mjs
Syntax check passed: all 277 JS/MJS files

node scripts/lint-project.mjs
PASS: lint hygiene on 277 JS/MJS/CJS source files; 178 static relative imports resolved; no conflict markers or forbidden runtime debug primitives.

node scripts/template-audit.mjs
Template audit passed: 59 EJS templates inspected.

node scripts/static-audit.mjs
Static audit passed: 122 source/config files inspected

node scripts/preflight-release.mjs
Release preflight passed: 2.8.93; 117 production files scanned.

python scripts/r8-audit-sqlite.py
SQL DDL PASS: 3 DDL blocks x2; 33 tables, 59 indexes, integrity_check ok; 6 constraint probes passed

python scripts/verify-financial-sqlite.py
SQLite actual schema PASS; table count 28
Concurrent balance withdrawal CAS PASS — 16 attempts, 1 debit, final €20.00
Gift redemption uniqueness PASS

node scripts/audit-navigation.mjs
SOURCES: routes=137 templates=59 static links=150 static forms=93 assets=5 dynamic links/forms skipped=32
UNRESOLVED=0

python scripts/r11-audit-links.py
Routes declared: 137; static local href/action checked: 247; dynamic unresolved: 93; other/nonlocal: 10; missing static target: 0

tsc --project tsconfig.typecheck-core.json
EXIT 0 — 4 selected JS modules only
```

## Blocked / not executed

- The first direct `node --test test/*.test.js` run produced **912 test results: 890 passed, 22 failed/blocked** before two source-text regression expectations were updated. Of those 22, **20 could not execute because required packages were missing**; two tests expected old English-only markup. Those two were updated and the 892 dependency-independent tests passed. **The complete Node 24 suite remains unexecuted** on this release.
- Here the Node runtime is **v22.16.0** but package.json requires **>=24.22.2 <25**. `node scripts/check-test-dependencies.mjs` fails because nine declared dependencies are missing, notably `@libsql/client`, `ejs`, `express` and MFA QR generation dependencies. Offline installation/registry access is not available. These failures are environment blockers, not proof that the HTTP endpoints work or fail.
- No actual HTTP login/logout, MFA, Manager, checkout, Mollie webhook, DB backup/restore, paid transaction, IDOR, XSS, SQLi, CSRF, accessibility, load or production deployment test was completed for FIX11. Existing source guards are not equivalent to a live penetration test.
- **Commercial redistribution rights remain OPEN:** `package.json` remains `private: true`, `license: UNLICENSED`, and root license remains a draft until the actual rights holder collects ownership/asset/third-party evidence and completes a valid buyer agreement. It is not legitimate to fabricate that approval in code.

## Regulatory references

- Belgian Federal Public Service Economy: [Information required for business websites](https://news.economie.fgov.be/203683-deze-info-moet-u-zeker-vermelden-op-uw-bedrijfswebsite/).
- Belgian Federal Public Service Economy: [Mandatory e-commerce information](https://economie.fgov.be/nl/e-commerce/opzet-van-je/verplicht-te-vermelden).
- Belgian Federal Public Service Economy: [Distance sales information](https://economie.fgov.be/nl/themas/verkoop/vormen-van-verkoop/verkoop-op-afstand/verkoop-op-afstand-informatie).

**Release decision:** QA-only. Do not represent the tested helper checks as legal compliance, full platform test coverage or resale certification.
