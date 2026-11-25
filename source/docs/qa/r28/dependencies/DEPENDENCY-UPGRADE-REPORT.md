# R28 dependency upgrade proposal

VERIFIED — This report describes the isolated dependency proposal, before the final R28 integration/version bump. It does not claim the final combined application passed. Main source and the delivered R27 archive were not modified. Parent integration must rerun the complete suite after all proposals are merged.

| Component | R27 version | Selected proposal version | Declared licence |
| --- | --- | --- | --- |
| dotenv | 16.6.1 | 18.0.10 | BSD-2-Clause |
| ejs | 6.0.1 | 7.0.2 | Apache-2.0 |
| express-rate-limit | 8.7.3 | 8.7.5 | MIT |
| typescript | 5.8.3 | 6.0.3 | Apache-2.0 |
| clean-css | not installed | 5.3.3 | MIT |
| source-map | not installed | 0.6.1 | BSD-3-Clause |

## Compatibility and intentional behavior

VERIFIED — dotenv18 configuration is loaded before the Node application/database graph through src/load-environment.js. The helper explicitly forces quiet:true/debug:false so informational/debug lines cannot enter startup/CLI output. Default existing-value preservation remains; configured DOTENV_CONFIG_PATH, DOTENV_CONFIG_ENCODING and explicit DOTENV_CONFIG_OVERRIDE still work. This is an intentional logging change. Two disposable-process tests inspect boolean observations only and never retain the synthetic environment values. Root-path emergency/offsite CLIs retain their explicit original file selection, now with quiet/debug options.

VERIFIED — Updated EJS escapes malicious seller text while retaining multilingual content and trusted relative includes. The existing template syntax suite compiles the proposal templates. Updated express-rate-limit actually returns200,200,429 on the configured two-request boundary and emits draft8 rate headers. These focused tests are not all application flows.

VERIFIED — TypeScript6.0.3 and candidate7.0.2 both passed the existing scoped core check. The selected6.x package has no optional native artifacts;7.0.2 adds20 platform artifacts. See [the explicit decision](TYPESCRIPT-DECISION.json). The7.x version was not selected solely to remove an outdated-major finding. No claim is made that7.x is vulnerable or legally incompatible.

VERIFIED — clean-css5.3.3 and its source-map0.6.1 dependency are development/build dependencies for the separate CSS proposal. They are not required by the production server after CSS is built. Preserve their notices and rebuild reproducibly; parent integration must include the corresponding build changes.

## Executed evidence

| Check | Label | Exact result | Evidence |
| --- | --- | --- | --- |
| Focused upgrade/notice/bootstrap/template/dependency tests | VERIFIED |24 passed,0 failed/skipped/cancelled/todo;21November2026|[command](final-focused-tests.json), [output](final-focused-tests.txt)|
| Selected TypeScript6.0.3 scoped core check | VERIFIED |exit0;21November2026|[command](final-ts6-typecheck.json), [output](final-ts6-typecheck.txt)|
| Candidate TypeScript7.0.2 scoped core check | VERIFIED |exit0;20November2026; candidate not selected|[command](candidate-ts7-typecheck.json), [output](candidate-ts7-typecheck.txt)|
| Earlier broader Manager/order HTTP compatibility selection | VERIFIED |exit0;20November2026; separate selected test set|[command](upgraded-runtime-compatibility.json), [output](upgraded-runtime-compatibility.txt)|
| All-dependency public npm advisory query | VERIFIED |exit0,0 known advisories;21November2026; npm accounting108 includes root/local links|[command](final-all-audit.json), [output](final-all-audit.txt)|
| Offline notice generator | VERIFIED |107 lock entries,1 first-party link,106 external entries,114 texts,7 absent optional,0 unresolved collector items,9 native gates open|[command](final-notices.json), [output](final-notices.txt)|

## Exact-version licence provenance

SOURCE-CHECKED — Original notices below came from exact public npm tarballs retrieved20November2026. Each tarball identity/version/resolved URL and locked SHA512 SRI was verified; retained notice bytes match installed notice bytes. Dates and evidence are retained in [capture receipts](updated-notice-capture.json), [all107 component entries](PACKAGE-LICENCE-REGISTER.json) and the root [provenance register](../../../../third-party/provenance.json).

| Package | Official exact tarball | Retrieved | Tarball SHA256 | Original notice files |
| --- | --- | --- | --- | --- |
| clean-css@5.3.3 | https://registry.npmjs.org/clean-css/-/clean-css-5.3.3.tgz | 2026-11-20T22:53:03.930127+00:00 | `ff3ac576c8fc823fc250777ab31a06509a849e840b6341e1a972e1469bdc79a0` | LICENSE |
| dotenv@18.0.10 | https://registry.npmjs.org/dotenv/-/dotenv-18.0.10.tgz | 2026-11-20T22:53:03.930788+00:00 | `20a0bc8a1cf06b168161a943ddb0ec557482af479dfa3023db2118399ec0a3b7` | LICENSE |
| ejs@7.0.2 | https://registry.npmjs.org/ejs/-/ejs-7.0.2.tgz | 2026-11-20T22:53:03.931988+00:00 | `1e77def2bb9a66761aded08e3354b02d92f1b15e791596fd74992fd7bef34adf` | LICENSE |
| express-rate-limit@8.7.5 | https://registry.npmjs.org/express-rate-limit/-/express-rate-limit-8.7.5.tgz | 2026-11-20T22:53:04.514493+00:00 | `f998c91ce2809930ac09f862af08853367ad4e9867c577866fb74ae02ad04042` | license |
| source-map@0.6.1 | https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz | 2026-11-20T22:53:04.433708+00:00 | `bdbca10d17ff5a5802d5acfc7b2f22f9f9bf587632a95650d3c5f513c7092b86` | LICENSE |
| typescript@6.0.3 | https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz | 2026-11-20T22:53:04.906514+00:00 | `33cd0ee1beaa8c9e9d15a9da836c62ddea4c34a42d7c2d349dbc80d94165d22a` | LICENSE.txt, ThirdPartyNoticeText.txt |

UNKNOWN — The9 libsql native/platform packages retain exact tarball identities/SRI, package snapshots and version-matched companion MIT mapping. No authoritative per-binary embedded SBOM was supplied or found in the retained exact-package evidence. Companion text and string/symbol observations do not prove complete embedded composition. These9 gates therefore remain open; collecting0 missing text records does not close them.

UNKNOWN — Whole-product first-party ownership, asset rights, authority to sell, accepted buyer transfer/rebrand/sublicensing terms and legal compatibility remain open. The first-party task limiter remains private/UNLICENSED. No licence draft is treated as an effective grant. A qualified lawyer must review the actual sale/assignment, native obligations and the operator/buyer jurisdictions.

NOT TESTED — Actual Windows installation, all target-platform native execution, complete native-binary provenance/legal analysis, production providers and the final combined R28 suite. Public advisory scans do not establish absence of unknown vulnerabilities. The older QA Python/Playwright driver licence/advisory limits are separate from this npm proposal.
