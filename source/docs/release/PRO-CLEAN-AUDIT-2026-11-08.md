# ShopEasy 2.8.93 R22 — Professional-clean file audit

**Date:** 8 November 2026  
**Result:** package hygiene/format checks passed for the issues within this review. **NOT approved for production deployment or commercial software resale.**

## What was inspected

The prior full FIX6 development archive has 1,252 file entries; the immediately preceding `ShopEasy-CLEAN.zip` has 465; the professional-clean source archive contains **468 files**, including the generated audit indices and checksum list. A byte-level, per-file review of the extracted clean source was repeated and the results were compared to the full developer archive. The new professional-clean candidate removes three R6 preview pages that are not referenced by any current QA script or automated test; five existing QA/compliance documents were moved under `docs/` so the project root is less cluttered. The remaining preview HTML files are still referenced by tests or design validation and deliberately remain in this *developer/source* release.

- Entire original runtime `src/`, `views/`, `public/`, `generated/` preserved byte-for-byte. No checkout, login, pricing, payment, or database functionality was intentionally removed or changed by cleanup.
- `scripts/verify-release-files.mjs` and `npm run verify:package` added to verify every released SHA-256 file digest, package-file presence, unexpected/private files, referenced relative Markdown links and unchanged **unlicensed** status, offline on Windows/Linux/macOS. Run immediately after extraction, before `npm ci` or running generators.
- Added `test/clean-release-policy.test.js` (two regression tests) for preserved source and mandatory notices, and deliberate removal of three obsolete previews.
- Updated the opening of `README.md` to correctly identify the current candidate and identify the historical material; corrected six broken Markdown hyperlinks or targets that pointed at historical reports removed from the package.
- Added an inventory of 465 source/content files in [FILE-INVENTORY.csv](FILE-INVENTORY.csv) with paths, group, byte sizes and SHA-256 values (excluding the self-referential generated indices/checksum list), and a [machine-readable audit summary](FILE-CHECK-SUMMARY.json).
- Archived existing documentation under `docs/qa/` and `docs/compliance/` instead of deleting evidence or silently changing its meaning.

## Verified automated tests and tools

| Check | Immediately preceding clean archive | Professional-clean candidate |
|---|---:|---:|
| Direct Node `--test` suite (Node 22.16.0, incomplete npm deps) | 861 pass, 20 fail / 881 | **863 pass, 20 fail / 883** |
| New cleanup regression tests | — | **2/2 passed** |
| JavaScript syntax check | Passed | **270 files passed** |
| Static audit | Passed | **Passed** |
| Release preflight | Passed | **Passed** |
| Template audit | Passed | **59 EJS templates passed** |
| Navigation route/link/form check | Passed | **Passed** |
| Cloudflare source build | Passed | **Passed** |

There were **zero newly failing test cases** from this cleanup. The **20 failures are blocked by missing dependencies** including `@libsql/client`, `ejs`, `jsqr` and `qrcode-generator`. This environment uses Node **22.16.0**, not the required **24.22.2+ within the 24.x series**. The `npm test` script's dependency preflight appropriately aborts before running when required npm modules cannot be resolved; the direct Node test results are **not** equivalent to a fully installed, all-green suite.

These checks do **not** establish that the full app can authenticate and complete a real customer checkout, upload product media, execute real Mollie sandbox webhooks, or work under a deployed production configuration. Browser testing, integration testing against a real database and payment provider, backup-and-restore, host security, accessibility and legal consumer-law checks remain required.

## Packaging and confidentiality safeguards

- Byte-level comparison preserves all original application source and public assets. New files are release QA tools/documentation only.
- No user-provided `.env`, database, customer account details, encrypted backup, `node_modules`, `public/uploads/` customer files or generated `.cloudflare-build/` artifacts are included in the release ZIP.
- `.env.example` intentionally contains **blank credential placeholders**. Any real configuration and store data must be maintained privately per deployment.
- Each archive file is recorded in `SHA256SUMS.txt`, with that file omitted from its own entries. Use `npm run verify:package` after extraction to validate all file contents and the documentation links.
- The license remains **DRAFT ONLY** and `package.json` remains `private:true` / `UNLICENSED`. The commercial rights register remains **NOT CLEARED FOR COMMERCIAL RESALE**. The origin of certain SVG assets requires actual supporting documentation.

## Further action before selling

1. Run `node -v`, `npm run verify:package`, `npm ci` and **the complete** `npm run audit` on a supported Node 24 system with installed dependencies.
2. Test customer registration/login/logout, Manager TOTP/recovery, every catalogue variant workflow, image uploads, coupon and cart transitions, taxes/shipping, COD, Mollie sandbox, bank transfer, returns, cancellation and concurrent orders in staging with a disposable database.
3. Test repeated deploy and rollback, off-server encrypted backup **and actual restore**, uptime/security headers, CSRF/session limits, privacy tooling, delivery/cookie/legal business content and mobile/browser usability.
4. Obtain and record software authorship/licensing authority, asset rights and third-party notices, and complete the contract and applicable Belgian business/consumer requirements.

**Go/no-go:** NO-GO for a claim of a fully working, error-free and commercially licensed production webshop. The improved ZIP is a cleaner development/review handover, **not a 100% certificate**.
