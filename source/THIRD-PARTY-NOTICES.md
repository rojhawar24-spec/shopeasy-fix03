# Third-party dependency inventory — ShopEasy R28 candidate

**Inventory date:** 2026-11-22  
**Source:** current exact `package-lock.json` plus version-bound source/notice records in `third-party/provenance.json`.  
**Scope:** all 107 locked `node_modules` entries, including optional native platforms and the separately classified local first-party alias. Counts and metadata are inventory evidence, not a legal certification or an effective commercial grant.

## Summary

- Locked package entries: **107**.
- External third-party entries: **106**, each with retained full notice-text evidence. Native entries use the documented companion mapping and remain subject to the nine open embedded-component gates.
- First-party local entries: **1**, private/UNLICENSED with existing rights **UNKNOWN**.
- External lock metadata `Apache-2.0`: **4** entries.
- External lock metadata `BSD-2-Clause`: **1** entries.
- External lock metadata `BSD-3-Clause`: **3** entries.
- External lock metadata `ISC`: **4** entries.
- External lock metadata `MIT`: **92** entries.
- External lock metadata `NOASSERTION`: **2** entries.
- Native optional package entries with open embedded-component review: **9**.
- The source ZIP excludes installed `node_modules`; use `npm ci`. Preserve applicable copyright/license/NOTICE texts when redistributing dependency code.

## Exact-source supplements and remaining review gates

`third-party/provenance.json` records exact package identities, locked sources/integrities, notice paths and SHA-256 hashes. After installation, `npm run licenses:generate` verifies registered identities, notice file sets and hashes offline, including optional packages absent on the installed OS. Missing, changed or unregistered evidence causes a non-zero exit and an unresolved report. No prior successful result is silently reused.

Pinned upstream MIT texts supplement the exact archives for `@libsql/client@0.18.0`, `@libsql/core@0.18.0`, `@libsql/isomorphic-ws@0.1.5` and `qrcode-generator@2.0.4`. The complete cookie-signature 1.0.6 README licence section, seven QR distribution copyright/trademark headers, and TypeScript 6.0.3 additional `ThirdPartyNoticeText.txt` are retained. Source chains and limitations are in `third-party/README.md`.

The missing lock licence metadata for **busboy@1.6.0** and **streamsearch@1.1.0** remains visible below. Their retained exact-package notices contain MIT text. A metadata omission is not silently rewritten as legal clearance.

All nine native `@libsql/*@0.5.29` archives declare MIT but omit a full licence file. The full MIT text from the locked `libsql@0.5.29` companion is captured and its exact optional-dependency/target mapping is checked. **The complete components and legal obligations embedded inside those binaries are UNKNOWN. All nine native review gates remain OPEN.** Companion mapping is not an authoritative per-binary SBOM.

For the current Linux installation, the generator includes **107 entries**, **106 external entries with 114 texts**, **1 first-party alias**, **7 absent optional packages**, **0 unresolved collector items**, and **9 open native review gates**. Exit 0 covers those registered collection checks; it does not close ownership, native composition, compatibility, asset or transaction-specific legal review.

## R28 upgrades and build dependencies

The current lock selects dotenv 18.0.10 (BSD-2-Clause), EJS 7.0.2 (Apache-2.0), express-rate-limit 8.7.5 (MIT), and TypeScript 6.0.3 (Apache-2.0). The CSS build adds clean-css 5.3.3 (MIT) and source-map 0.6.1 (BSD-3-Clause) as development/build dependencies. Their original exact-tarball texts, package snapshots, locked SRI checks and source dates are recorded in `third-party/provenance.json` and `docs/qa/r28/dependencies/updated-notice-capture.json`.

Both TypeScript 6.0.3 and 7.0.2 passed the scoped core compatibility check in the isolated proposal. Version 7.0.2 adds 20 optional native platform artifacts; the selected pure-JS 6.x line avoids adding that unreviewed binary scope solely to match the latest major. This does not claim 7.x is vulnerable or legally incompatible. The decision and actual command evidence are in `docs/qa/r28/dependencies/DEPENDENCY-UPGRADE-REPORT.md`.

## Local first-party replacement

The removed external `promise-limit@2.7.0` archive and pinned source tree declared ISC but did not contain an authoritative full licence/copyright text. No grant was reconstructed from an author field or a generic licence template. Historical investigation metadata is retained in `third-party/evidence/`; it is not a fabricated licence.

The installed alias `promise-limit` links to newly authored `@shopeasy/task-limit@1.0.0` at `vendor/promise-limit`. This is first-party code, private and **UNLICENSED**, not the registry package or third-party ISC code. Its three source files, actual identity and installed target mapping are hash-checked. Existing ownership and the effective buyer grant remain **UNKNOWN** under the draft root rights process.

## Complete locked-package list

| Name / installed alias | Lock path | Version | Declared licence / component status | Optional | Locked source |
|---|---|---:|---|---:|---|
| `@libsql/client` | `node_modules/@libsql/client` | `0.18.0` | MIT | no | [https://registry.npmjs.org/@libsql/client/-/client-0.18.0.tgz](https://registry.npmjs.org/@libsql/client/-/client-0.18.0.tgz) |
| `@libsql/core` | `node_modules/@libsql/core` | `0.18.0` | MIT | no | [https://registry.npmjs.org/@libsql/core/-/core-0.18.0.tgz](https://registry.npmjs.org/@libsql/core/-/core-0.18.0.tgz) |
| `@libsql/darwin-arm64` | `node_modules/@libsql/darwin-arm64` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/darwin-arm64/-/darwin-arm64-0.5.29.tgz](https://registry.npmjs.org/@libsql/darwin-arm64/-/darwin-arm64-0.5.29.tgz) |
| `@libsql/darwin-x64` | `node_modules/@libsql/darwin-x64` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/darwin-x64/-/darwin-x64-0.5.29.tgz](https://registry.npmjs.org/@libsql/darwin-x64/-/darwin-x64-0.5.29.tgz) |
| `@libsql/hrana-client` | `node_modules/@libsql/hrana-client` | `0.10.0` | MIT | no | [https://registry.npmjs.org/@libsql/hrana-client/-/hrana-client-0.10.0.tgz](https://registry.npmjs.org/@libsql/hrana-client/-/hrana-client-0.10.0.tgz) |
| `@libsql/isomorphic-ws` | `node_modules/@libsql/isomorphic-ws` | `0.1.5` | MIT | no | [https://registry.npmjs.org/@libsql/isomorphic-ws/-/isomorphic-ws-0.1.5.tgz](https://registry.npmjs.org/@libsql/isomorphic-ws/-/isomorphic-ws-0.1.5.tgz) |
| `@libsql/linux-arm-gnueabihf` | `node_modules/@libsql/linux-arm-gnueabihf` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/linux-arm-gnueabihf/-/linux-arm-gnueabihf-0.5.29.tgz](https://registry.npmjs.org/@libsql/linux-arm-gnueabihf/-/linux-arm-gnueabihf-0.5.29.tgz) |
| `@libsql/linux-arm-musleabihf` | `node_modules/@libsql/linux-arm-musleabihf` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/linux-arm-musleabihf/-/linux-arm-musleabihf-0.5.29.tgz](https://registry.npmjs.org/@libsql/linux-arm-musleabihf/-/linux-arm-musleabihf-0.5.29.tgz) |
| `@libsql/linux-arm64-gnu` | `node_modules/@libsql/linux-arm64-gnu` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/linux-arm64-gnu/-/linux-arm64-gnu-0.5.29.tgz](https://registry.npmjs.org/@libsql/linux-arm64-gnu/-/linux-arm64-gnu-0.5.29.tgz) |
| `@libsql/linux-arm64-musl` | `node_modules/@libsql/linux-arm64-musl` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/linux-arm64-musl/-/linux-arm64-musl-0.5.29.tgz](https://registry.npmjs.org/@libsql/linux-arm64-musl/-/linux-arm64-musl-0.5.29.tgz) |
| `@libsql/linux-x64-gnu` | `node_modules/@libsql/linux-x64-gnu` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/linux-x64-gnu/-/linux-x64-gnu-0.5.29.tgz](https://registry.npmjs.org/@libsql/linux-x64-gnu/-/linux-x64-gnu-0.5.29.tgz) |
| `@libsql/linux-x64-musl` | `node_modules/@libsql/linux-x64-musl` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/linux-x64-musl/-/linux-x64-musl-0.5.29.tgz](https://registry.npmjs.org/@libsql/linux-x64-musl/-/linux-x64-musl-0.5.29.tgz) |
| `@libsql/win32-x64-msvc` | `node_modules/@libsql/win32-x64-msvc` | `0.5.29` | MIT | yes | [https://registry.npmjs.org/@libsql/win32-x64-msvc/-/win32-x64-msvc-0.5.29.tgz](https://registry.npmjs.org/@libsql/win32-x64-msvc/-/win32-x64-msvc-0.5.29.tgz) |
| `@neon-rs/load` | `node_modules/@neon-rs/load` | `0.0.4` | MIT | no | [https://registry.npmjs.org/@neon-rs/load/-/load-0.0.4.tgz](https://registry.npmjs.org/@neon-rs/load/-/load-0.0.4.tgz) |
| `@types/node` | `node_modules/@types/node` | `26.6.3` | MIT | no | [https://registry.npmjs.org/@types/node/-/node-26.6.3.tgz](https://registry.npmjs.org/@types/node/-/node-26.6.3.tgz) |
| `@types/ws` | `node_modules/@types/ws` | `8.18.2` | MIT | no | [https://registry.npmjs.org/@types/ws/-/ws-8.18.2.tgz](https://registry.npmjs.org/@types/ws/-/ws-8.18.2.tgz) |
| `accepts` | `node_modules/accepts` | `2.0.0` | MIT | no | [https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz](https://registry.npmjs.org/accepts/-/accepts-2.0.0.tgz) |
| `append-field` | `node_modules/append-field` | `1.0.0` | MIT | no | [https://registry.npmjs.org/append-field/-/append-field-1.0.0.tgz](https://registry.npmjs.org/append-field/-/append-field-1.0.0.tgz) |
| `body-parser` | `node_modules/body-parser` | `2.4.0` | MIT | no | [https://registry.npmjs.org/body-parser/-/body-parser-2.4.0.tgz](https://registry.npmjs.org/body-parser/-/body-parser-2.4.0.tgz) |
| `busboy` | `node_modules/busboy` | `1.6.0` | NOASSERTION — omitted from lock metadata | no | [https://registry.npmjs.org/busboy/-/busboy-1.6.0.tgz](https://registry.npmjs.org/busboy/-/busboy-1.6.0.tgz) |
| `bytes` | `node_modules/bytes` | `3.1.2` | MIT | no | [https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz](https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz) |
| `call-bind-apply-helpers` | `node_modules/call-bind-apply-helpers` | `1.0.2` | MIT | no | [https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz](https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz) |
| `call-bound` | `node_modules/call-bound` | `1.0.4` | MIT | no | [https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz](https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz) |
| `clean-css` | `node_modules/clean-css` | `5.3.3` | MIT | no | [https://registry.npmjs.org/clean-css/-/clean-css-5.3.3.tgz](https://registry.npmjs.org/clean-css/-/clean-css-5.3.3.tgz) |
| `content-disposition` | `node_modules/content-disposition` | `2.0.1` | MIT | no | [https://registry.npmjs.org/content-disposition/-/content-disposition-2.0.1.tgz](https://registry.npmjs.org/content-disposition/-/content-disposition-2.0.1.tgz) |
| `content-type` | `node_modules/content-type` | `2.1.0` | MIT | no | [https://registry.npmjs.org/content-type/-/content-type-2.1.0.tgz](https://registry.npmjs.org/content-type/-/content-type-2.1.0.tgz) |
| `cookie` | `node_modules/cookie` | `0.7.2` | MIT | no | [https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz](https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz) |
| `cookie-parser` | `node_modules/cookie-parser` | `1.4.7` | MIT | no | [https://registry.npmjs.org/cookie-parser/-/cookie-parser-1.4.7.tgz](https://registry.npmjs.org/cookie-parser/-/cookie-parser-1.4.7.tgz) |
| `cookie-signature` | `node_modules/cookie-signature` | `1.0.6` | MIT | no | [https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.0.6.tgz](https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.0.6.tgz) |
| `debug` | `node_modules/debug` | `4.4.3` | MIT | no | [https://registry.npmjs.org/debug/-/debug-4.4.3.tgz](https://registry.npmjs.org/debug/-/debug-4.4.3.tgz) |
| `depd` | `node_modules/depd` | `2.0.0` | MIT | no | [https://registry.npmjs.org/depd/-/depd-2.0.0.tgz](https://registry.npmjs.org/depd/-/depd-2.0.0.tgz) |
| `detect-libc` | `node_modules/detect-libc` | `2.0.2` | Apache-2.0 | no | [https://registry.npmjs.org/detect-libc/-/detect-libc-2.0.2.tgz](https://registry.npmjs.org/detect-libc/-/detect-libc-2.0.2.tgz) |
| `dotenv` | `node_modules/dotenv` | `18.0.10` | BSD-2-Clause | no | [https://registry.npmjs.org/dotenv/-/dotenv-18.0.10.tgz](https://registry.npmjs.org/dotenv/-/dotenv-18.0.10.tgz) |
| `dunder-proto` | `node_modules/dunder-proto` | `1.0.1` | MIT | no | [https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz](https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz) |
| `ee-first` | `node_modules/ee-first` | `1.1.1` | MIT | no | [https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz](https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz) |
| `ejs` | `node_modules/ejs` | `7.0.2` | Apache-2.0 | no | [https://registry.npmjs.org/ejs/-/ejs-7.0.2.tgz](https://registry.npmjs.org/ejs/-/ejs-7.0.2.tgz) |
| `encodeurl` | `node_modules/encodeurl` | `2.0.0` | MIT | no | [https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.0.tgz](https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.0.tgz) |
| `es-define-property` | `node_modules/es-define-property` | `1.0.1` | MIT | no | [https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz](https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz) |
| `es-errors` | `node_modules/es-errors` | `1.3.0` | MIT | no | [https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz](https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz) |
| `es-object-atoms` | `node_modules/es-object-atoms` | `1.1.2` | MIT | no | [https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz](https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz) |
| `escape-html` | `node_modules/escape-html` | `1.0.3` | MIT | no | [https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz](https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz) |
| `etag` | `node_modules/etag` | `1.8.1` | MIT | no | [https://registry.npmjs.org/etag/-/etag-1.8.1.tgz](https://registry.npmjs.org/etag/-/etag-1.8.1.tgz) |
| `express` | `node_modules/express` | `5.3.0` | MIT | no | [https://registry.npmjs.org/express/-/express-5.3.0.tgz](https://registry.npmjs.org/express/-/express-5.3.0.tgz) |
| `express-rate-limit` | `node_modules/express-rate-limit` | `8.7.5` | MIT | no | [https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.5.tgz](https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.5.tgz) |
| `cookie-signature` | `node_modules/express/node_modules/cookie-signature` | `1.2.2` | MIT | no | [https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz](https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.2.2.tgz) |
| `finalhandler` | `node_modules/finalhandler` | `2.1.1` | MIT | no | [https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz](https://registry.npmjs.org/finalhandler/-/finalhandler-2.1.1.tgz) |
| `forwarded` | `node_modules/forwarded` | `0.2.0` | MIT | no | [https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz](https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz) |
| `fresh` | `node_modules/fresh` | `2.0.0` | MIT | no | [https://registry.npmjs.org/fresh/-/fresh-2.0.0.tgz](https://registry.npmjs.org/fresh/-/fresh-2.0.0.tgz) |
| `function-bind` | `node_modules/function-bind` | `1.1.2` | MIT | no | [https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz](https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz) |
| `get-intrinsic` | `node_modules/get-intrinsic` | `1.3.0` | MIT | no | [https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz](https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz) |
| `get-proto` | `node_modules/get-proto` | `1.0.1` | MIT | no | [https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz](https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz) |
| `gopd` | `node_modules/gopd` | `1.2.0` | MIT | no | [https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz](https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz) |
| `has-symbols` | `node_modules/has-symbols` | `1.1.0` | MIT | no | [https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz](https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz) |
| `hasown` | `node_modules/hasown` | `2.0.4` | MIT | no | [https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz](https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz) |
| `helmet` | `node_modules/helmet` | `8.3.0` | MIT | no | [https://registry.npmjs.org/helmet/-/helmet-8.3.0.tgz](https://registry.npmjs.org/helmet/-/helmet-8.3.0.tgz) |
| `http-errors` | `node_modules/http-errors` | `2.0.1` | MIT | no | [https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz](https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz) |
| `iconv-lite` | `node_modules/iconv-lite` | `0.7.3` | MIT | no | [https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.3.tgz](https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.3.tgz) |
| `inherits` | `node_modules/inherits` | `2.0.4` | ISC | no | [https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz](https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz) |
| `ip-address` | `node_modules/ip-address` | `10.7.4` | MIT | no | [https://registry.npmjs.org/ip-address/-/ip-address-10.7.4.tgz](https://registry.npmjs.org/ip-address/-/ip-address-10.7.4.tgz) |
| `ipaddr.js` | `node_modules/ipaddr.js` | `1.9.1` | MIT | no | [https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz](https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz) |
| `is-promise` | `node_modules/is-promise` | `4.0.0` | MIT | no | [https://registry.npmjs.org/is-promise/-/is-promise-4.0.0.tgz](https://registry.npmjs.org/is-promise/-/is-promise-4.0.0.tgz) |
| `js-base64` | `node_modules/js-base64` | `3.9.4` | BSD-3-Clause | no | [https://registry.npmjs.org/js-base64/-/js-base64-3.9.4.tgz](https://registry.npmjs.org/js-base64/-/js-base64-3.9.4.tgz) |
| `jsqr` | `node_modules/jsqr` | `1.4.0` | Apache-2.0 | no | [https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz](https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz) |
| `libsql` | `node_modules/libsql` | `0.5.29` | MIT | no | [https://registry.npmjs.org/libsql/-/libsql-0.5.29.tgz](https://registry.npmjs.org/libsql/-/libsql-0.5.29.tgz) |
| `math-intrinsics` | `node_modules/math-intrinsics` | `1.1.0` | MIT | no | [https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz](https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz) |
| `media-typer` | `node_modules/media-typer` | `1.1.1` | MIT | no | [https://registry.npmjs.org/media-typer/-/media-typer-1.1.1.tgz](https://registry.npmjs.org/media-typer/-/media-typer-1.1.1.tgz) |
| `merge-descriptors` | `node_modules/merge-descriptors` | `2.0.0` | MIT | no | [https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-2.0.0.tgz](https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-2.0.0.tgz) |
| `mime-db` | `node_modules/mime-db` | `1.54.0` | MIT | no | [https://registry.npmjs.org/mime-db/-/mime-db-1.54.0.tgz](https://registry.npmjs.org/mime-db/-/mime-db-1.54.0.tgz) |
| `mime-types` | `node_modules/mime-types` | `3.0.2` | MIT | no | [https://registry.npmjs.org/mime-types/-/mime-types-3.0.2.tgz](https://registry.npmjs.org/mime-types/-/mime-types-3.0.2.tgz) |
| `ms` | `node_modules/ms` | `2.1.3` | MIT | no | [https://registry.npmjs.org/ms/-/ms-2.1.3.tgz](https://registry.npmjs.org/ms/-/ms-2.1.3.tgz) |
| `multer` | `node_modules/multer` | `2.5.0` | MIT | no | [https://registry.npmjs.org/multer/-/multer-2.5.0.tgz](https://registry.npmjs.org/multer/-/multer-2.5.0.tgz) |
| `media-typer` | `node_modules/multer/node_modules/media-typer` | `0.3.0` | MIT | no | [https://registry.npmjs.org/media-typer/-/media-typer-0.3.0.tgz](https://registry.npmjs.org/media-typer/-/media-typer-0.3.0.tgz) |
| `mime-db` | `node_modules/multer/node_modules/mime-db` | `1.52.0` | MIT | no | [https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz](https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz) |
| `mime-types` | `node_modules/multer/node_modules/mime-types` | `2.1.35` | MIT | no | [https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz](https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz) |
| `type-is` | `node_modules/multer/node_modules/type-is` | `1.6.18` | MIT | no | [https://registry.npmjs.org/type-is/-/type-is-1.6.18.tgz](https://registry.npmjs.org/type-is/-/type-is-1.6.18.tgz) |
| `negotiator` | `node_modules/negotiator` | `1.1.0` | MIT | no | [https://registry.npmjs.org/negotiator/-/negotiator-1.1.0.tgz](https://registry.npmjs.org/negotiator/-/negotiator-1.1.0.tgz) |
| `object-inspect` | `node_modules/object-inspect` | `1.13.4` | MIT | no | [https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz](https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz) |
| `on-finished` | `node_modules/on-finished` | `2.4.1` | MIT | no | [https://registry.npmjs.org/on-finished/-/on-finished-2.4.1.tgz](https://registry.npmjs.org/on-finished/-/on-finished-2.4.1.tgz) |
| `once` | `node_modules/once` | `1.4.0` | ISC | no | [https://registry.npmjs.org/once/-/once-1.4.0.tgz](https://registry.npmjs.org/once/-/once-1.4.0.tgz) |
| `parseurl` | `node_modules/parseurl` | `1.3.3` | MIT | no | [https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz](https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz) |
| `path-to-regexp` | `node_modules/path-to-regexp` | `8.4.2` | MIT | no | [https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.4.2.tgz](https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-8.4.2.tgz) |
| `promise-limit` | `node_modules/promise-limit` | `1.0.0` | UNLICENSED — first-party `@shopeasy/task-limit`, rights UNKNOWN | no | `vendor/promise-limit` |
| `proxy-addr` | `node_modules/proxy-addr` | `2.0.8` | MIT | no | [https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz](https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz) |
| `qrcode-generator` | `node_modules/qrcode-generator` | `2.0.4` | MIT | no | [https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz](https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz) |
| `qs` | `node_modules/qs` | `6.17.1` | BSD-3-Clause | no | [https://registry.npmjs.org/qs/-/qs-6.17.1.tgz](https://registry.npmjs.org/qs/-/qs-6.17.1.tgz) |
| `range-parser` | `node_modules/range-parser` | `1.3.0` | MIT | no | [https://registry.npmjs.org/range-parser/-/range-parser-1.3.0.tgz](https://registry.npmjs.org/range-parser/-/range-parser-1.3.0.tgz) |
| `raw-body` | `node_modules/raw-body` | `3.0.2` | MIT | no | [https://registry.npmjs.org/raw-body/-/raw-body-3.0.2.tgz](https://registry.npmjs.org/raw-body/-/raw-body-3.0.2.tgz) |
| `router` | `node_modules/router` | `2.2.0` | MIT | no | [https://registry.npmjs.org/router/-/router-2.2.0.tgz](https://registry.npmjs.org/router/-/router-2.2.0.tgz) |
| `safer-buffer` | `node_modules/safer-buffer` | `2.1.2` | MIT | no | [https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz](https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz) |
| `send` | `node_modules/send` | `1.2.1` | MIT | no | [https://registry.npmjs.org/send/-/send-1.2.1.tgz](https://registry.npmjs.org/send/-/send-1.2.1.tgz) |
| `serve-static` | `node_modules/serve-static` | `2.2.1` | MIT | no | [https://registry.npmjs.org/serve-static/-/serve-static-2.2.1.tgz](https://registry.npmjs.org/serve-static/-/serve-static-2.2.1.tgz) |
| `setprototypeof` | `node_modules/setprototypeof` | `1.2.0` | ISC | no | [https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz](https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz) |
| `side-channel` | `node_modules/side-channel` | `1.1.1` | MIT | no | [https://registry.npmjs.org/side-channel/-/side-channel-1.1.1.tgz](https://registry.npmjs.org/side-channel/-/side-channel-1.1.1.tgz) |
| `side-channel-list` | `node_modules/side-channel-list` | `1.0.1` | MIT | no | [https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz](https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz) |
| `side-channel-map` | `node_modules/side-channel-map` | `1.0.1` | MIT | no | [https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz](https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz) |
| `side-channel-weakmap` | `node_modules/side-channel-weakmap` | `1.0.2` | MIT | no | [https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz](https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz) |
| `source-map` | `node_modules/source-map` | `0.6.1` | BSD-3-Clause | no | [https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz](https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz) |
| `statuses` | `node_modules/statuses` | `2.0.2` | MIT | no | [https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz](https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz) |
| `streamsearch` | `node_modules/streamsearch` | `1.1.0` | NOASSERTION — omitted from lock metadata | no | [https://registry.npmjs.org/streamsearch/-/streamsearch-1.1.0.tgz](https://registry.npmjs.org/streamsearch/-/streamsearch-1.1.0.tgz) |
| `toidentifier` | `node_modules/toidentifier` | `1.0.1` | MIT | no | [https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz](https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz) |
| `type-is` | `node_modules/type-is` | `2.1.0` | MIT | no | [https://registry.npmjs.org/type-is/-/type-is-2.1.0.tgz](https://registry.npmjs.org/type-is/-/type-is-2.1.0.tgz) |
| `typescript` | `node_modules/typescript` | `6.0.3` | Apache-2.0 | no | [https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz](https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz) |
| `undici-types` | `node_modules/undici-types` | `8.9.0` | MIT | no | [https://registry.npmjs.org/undici-types/-/undici-types-8.9.0.tgz](https://registry.npmjs.org/undici-types/-/undici-types-8.9.0.tgz) |
| `unpipe` | `node_modules/unpipe` | `1.0.0` | MIT | no | [https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz](https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz) |
| `vary` | `node_modules/vary` | `1.1.2` | MIT | no | [https://registry.npmjs.org/vary/-/vary-1.1.2.tgz](https://registry.npmjs.org/vary/-/vary-1.1.2.tgz) |
| `wrappy` | `node_modules/wrappy` | `1.0.2` | ISC | no | [https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz](https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz) |
| `ws` | `node_modules/ws` | `8.22.0` | MIT | no | [https://registry.npmjs.org/ws/-/ws-8.22.0.tgz](https://registry.npmjs.org/ws/-/ws-8.22.0.tgz) |

## Font packaging and first-party rights

The current release contains **zero font binaries**. `public/fonts/INTER-LICENSE.txt` and `public/fonts/NOTO-LICENSE.txt` are retained historical upstream notices; the interface uses operating-system font stacks. Earlier descriptions of nine self-hosted WOFF2 subsets are historical. See `public/fonts/README-FONTS.md` before adding fonts.

The seller supplied no documentary source/asset ownership evidence. This inventory does not establish rights to ShopEasy source, documentation, branding, SVG illustrations, generated imagery or buyer uploads. Buyer editing/rebranding intent is recorded only in `SELLER-PROTECTION-PACK/BUYER-USE-INTENT.md`. Existing grants remain UNKNOWN and `LICENSE.txt` stays draft-only. See `RIGHTS-CLEARANCE-REGISTER.md` and `ASSET-PROVENANCE-REGISTER.md`.

Re-review this inventory and recapture exact-source notices after every dependency or local-source change. Do not update hashes merely to silence a failed check.
