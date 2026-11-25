# ShopEasy FIX7 — image-upload integration assertion repair (8 November 2026)

## Confirmed user-visible failure

`npm test` on Windows reached `scripts/manager-dashboard-integration.mjs:931` and failed with a giant binary-array diff after the product image returned HTTP 200 and `image/png`. The test was comparing the **entire** served PNG to an obsolete 12-byte invalid/truncated PNG signature. In FIX6 the upload fixture had already been replaced with a valid 640×640 PNG, but the final assertion was not updated.

## Repair

The assertion now compares the complete returned response body to the `smokePng` fixture that was successfully posted at line 676. The malformed/truncated PNG rejection assertion earlier in the same integration script is unchanged, so invalid images must still be rejected with HTTP 400. No application runtime, database, auth, checkout or payment source was changed.

## Scope and proof

- A static regression check validates that the test compares the full served image to the full valid fixture and that the invalid-upload check remains present.
- A release ZIP check verifies all SHA-256 checksums and manifest links.
- The **full live Manager HTTP integration suite was not run here**, because the container lacks the project-required Node.js 24 and installed dependencies. Run `npm ci && npm test` on the Windows machine that reported the failure and confirm `fail 0`.
- Commercial rights and end-to-end staging testing are still not cleared; this is **not** a production certification.
