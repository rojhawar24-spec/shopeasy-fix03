# R28 performance and load-tool proposal

VERIFIED — The proposal fixes a demonstrated cold-load encoding problem and reduces delivered stylesheet requests without purging dynamic styles. It preserves all five readable authoring sources and the existing dynamic-theme cascade. This is a proposal-only result; the combined R28 source needs the parent's full tests and final-runtime browser/lab check.

## Result and code changes

- `src/static-asset-compression.js`: fixed allowlist grows from19 to21 assets for the two compiled CSS files. Two asynchronous read/compression jobs remain active at once; a deduplicated queue bounded by the fixed21paths replaces overload fall-through to identity/406. Bounded read/cache and post-read/post-compression path/file-signature checks remain. Adds Brotliquality4 alongside gzip6, selects the smaller equally preferred compression representation, and retains per-representation SHA-based ETags/conditional/HEAD/range handling. Private HTML/errors/forms and user uploads are excluded.
- `scripts/build-design-css.mjs`: exact clean-css5.3.3, level0 serialization only; no selector purging, selector/declaration reordering, URL rebasing or remote inlining. Four foundation authoring layers compile to `design-foundation.min.css`; research polish compiles separately to `design-polish.min.css`. Runtime order remains foundation → dynamic `/theme/shop.css` → polish. It rejects stale output, source symlinks, changed source fingerprints and wrong runtime/preview cascade; copyright/licence comments are retained and tested. The deterministic JSON manifest records every source/output hash. Existing Cloudflare build already invokes this build before template bundling.
- Header and seven required preview fixtures reference the compiled files; their styling still derives from the complete authoring sources. Preview files remain test fixtures, not production pages.
- `scripts/load-test.mjs`: input validation refuses zero/NaN/fractions/unsafe credential-bearing origins and excessive workloads; real latency includes complete body consumption, not only headers. Failed readiness yields no measured requests.429/4xx/5xx/network errors remain failed counters. New actualHTTP tests cover delayed bodies, aborts/errors and readiness; no credentials are echoed in invalid-input errors.

VERIFIED — Five authoring files total320,342bytes; two compiled files total299,146bytes. Gzip6 totals59,772→55,285bytes; Brotli4 totals63,124→57,141bytes. These are CSS-only sequential codec measurements, excluding dynamic CSS/HTML/JS, not either page's transfer total. See [exact bytes and hashes](css-byte-comparison.json).

## Executed evidence

VERIFIED — [41 focused asset/build/UI tests](focused-final.txt), zero failed/skipped, executed21November2026. They exercise actualHTTP bytes for identity/gzip/Brotli, preference negotiation, conditional validators, HEAD/range/preconditions, safe path/file handling, cache pressure/cold concurrency, deterministic generated CSS, stale source/cascade/symlink refusal and notice retention. [Exact command](focused-final.json).

VERIFIED — [Six actual load-tool regressions](load-runtime-focused.txt), zero failed/skipped, executed22November2026. [Command](load-runtime-focused.json). This is separate from the41focused tests; the parent must run the complete integrated suite.

VERIFIED — [12 local Lighthouse measurements](REPEATED-MEASUREMENTS.json), three paired repeats per source×two scenarios, all helper/CLI exits0, all private telemetry/fixtures removed. Node24.22.2/Python3.13.5/Chromium156.0.8078.79/Lighthouse13.6.0. Baseline147-file runtime6e7eb2bfe853ad1db7c0ce92dcb47487ff4708b2c37fbd538a609061dfba887d; proposal150-file runtimec90fa4166fc8cdff6e4fcde0cac97bbd70251498382644bf6593ea7093842572. These scoped hashes exclude tests/tools and are not release ZIP hashes. [Exact execution records](measurement-commands.json).

| Scenario | Baseline performance scores | Proposal performance scores | Median baseline/page bytes | Proposal/page bytes |
| --- | --- | --- | ---: | ---: |
| Mobile Home |95,94,94|99,99,99|306,349|139,262|
| Desktop Shop |100,99,99|100,100,100|317,084|143,032|

The proposal's mobile FCP/LCP values were1559/1573/1587ms; desktop FCP498–523ms and LCP605–704ms. Raw settings and every numeric result remain in the individual reports. Three local repeats provide a small observed range, not production statistical confidence or an isolated causal claim; cache scheduling/browser variance affected baseline transfer bytes.

VERIFIED — [One read-only local concurrent workload](local-concurrent-load.json),25clients×8rounds:200requests/200completedHTTP200, zero errors/throttles,3.408s/58.69requests/s; body-inclusive p50=315.2ms,p95=608.5ms,p99=1933.4ms. It uses a separate temporary syntheticSQLite store in NODE_ENV=test and does not retain sessions between requests; it is not checkout contention, production/remoteDB capacity or an authenticated-user load estimate. Fixture removed.

## Remaining limits and merge requirements

VERIFIED — Lighthouse still records render-blocking/dependency/unusedCSS/unminifiedJS/back-forward-cache opportunities. Complete unusedCSS removal is not claimed; level0 deliberately preserves dynamic interfaces, selectors and declarations. Local category100 does not resolve manual accessibility/security/legal work. Production Caddy already compresses; no additional production gain, field Core Web Vitals, real catalogue/low-end device or remoteDB performance claim is made.

NOT TESTED — Complete parent-integrated source, actual Windows, production load/CDN/TLS/remoteDB, physical devices and field metrics. These are separate acceptance requirements. Main/R27 source was not changed by this task.

Merge the separate dependency proposal first: clean-css5.3.3 and source-map0.6.1 are declared/dev-locked there with retained exact notices. Merge header stylesheet hunks alongside accessibility glyph/title changes; do not overwrite the whole integrated header. After merging accessibility's authoringCSS and all templates, regenerate CSS and Cloudflare views with `npm run build:cloudflare`. Do not copy the proposal's generated Cloudflare views over integrated templates. Parent version/cache-query changes must update runtime and previews consistently.

`merge-manifest.json` outside the product identifies all proposed files and hashes. `performance-fixes.patch` omits four generated output files intentionally; the parent regenerates those from the merged sources. The deterministic generator and its tests remain shipped so a buyer can rebuild without purging dynamic classes. Exact local audit helpers use the audit workspace/tool paths; buyer runtime/browser setup remains documented separately in qa/README.md.
