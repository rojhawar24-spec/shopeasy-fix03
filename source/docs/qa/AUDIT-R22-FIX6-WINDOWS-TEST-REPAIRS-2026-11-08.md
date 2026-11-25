# ShopEasy R22 FIX6 — Windows regression repairs

Source: ShopEasy FIX5 (2026-11-08). The customer's Windows Node.js 24 test run (log `Pasted text(20261108-134959).txt`) reported 949 tests, 941 passed, 7 failed and 1 skipped.

## Seven failures mapped to three causes

1. Five R18 tests in `test/r18-research-ux-regression.test.js` used `new URL('..', import.meta.url).pathname`. On Windows this generated `C:\\C:\\...` and did not decode `%20`. Changed to `fileURLToPath(new URL('..', import.meta.url))`. No production route/UI files changed.
2. One sale-readiness assertion demanded the old `Number(req.body.automaticDiscountPercent)` code. The production server intentionally uses strict `parseCartQuantity(...)` and rejects invalid input. Updated the assertion to require the stricter validation and upper bound.
3. Manager integration test posted a 12-byte PNG header as if it were a real image, but production correctly rejected it with HTTP 400. Updated the success case to upload `test/fixtures/r19-sample.png`, the project's genuine 640 × 640 test PNG, while adding a negative case proving malformed PNG uploads still get HTTP 400. The test now also prints a meaningful HTTP error message if saving fails.

Added `test/fix6-windows-fixtures-regression.test.js` for the three causes.

## Release qualification

This patch **repairs test code and test fixtures**. It does **not** claim to fix or certify Manager login, checkout, payments, image handling, or production compliance. Because this workspace has Node.js 22.16.0 and cannot install the full dependencies, the full Windows Node.js 24 test suite could not be rerun here. Actual results of targeted validation are recorded in the accompanying release check. No production source behavior was weakened.

## Run on Windows with Node.js >=24.22.2 <25

```powershell
node -v
npm ci
npm test
npm run audit
npm run test:integration
```

Do not copy over `.env`, private data/database, or uploaded customer images. Do not make a production-release claim until the complete suite and staging end-to-end checkout, real provider integrations, security, and commercial rights have been verified.
