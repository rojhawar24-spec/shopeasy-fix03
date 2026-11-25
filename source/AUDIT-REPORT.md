# ShopEasy 2.8.95 / R28 release audit

> **REMEDIATION CANDIDATE FIX01 — 24 November 2026.** This derivative of R28 is not release-certified. All R28 test results and fingerprints below refer to the unchanged baseline, not this modified source. See [REMEDIATION-FIX01.md](REMEDIATION-FIX01.md) for current evidence and limitations.


Read the current [QA report](QA-REPORT-2.8.95.md) for exact executed checks and their limits.

SOURCE-CHECKED — The [October pre-sale audit](PRE-SALE-RISK-AUDIT-2026-10-18.md) is retained as historical context; its results are not substituted for current R28 execution.

VERIFIED — Local Linux integration observed **1,205 tests, 1,205 pass, 0 fail, 0 skipped**; all eleven final group-C commands exited 0. [Actual full output](docs/qa/r28/final/checks/group-c-tests.txt), [command summary](docs/qa/r28/final/checks/group-c-summary.json). Group B's fresh locked install used `--ignore-scripts`; group C reused that install. The final packaging workflow independently installs and repeats every release check in another disposable copy. Its actual results are in `FINAL-VERIFICATION-REPORT.json` and the external `verification-log.json` beside the ZIP.

| Priority | Status and evidence | Remaining action |
| --- | --- | --- |
| P0 | UNKNOWN — Effective ownership of source/assets and authority to grant buyer rights. [Rights register](RIGHTS-CLEARANCE-REGISTER.md), [draft licence](LICENSE.txt), [asset inventory](ASSET-PROVENANCE-REGISTER.md). | Seller and qualified lawyer must establish chain of title and execute an appropriate grant. No source edit can supply missing ownership evidence. |
| P1 | UNKNOWN — Nine native binary composition/licence gates. [Exact package register](docs/qa/r28/dependencies/PACKAGE-LICENCE-REGISTER.json), [notices](THIRD-PARTY-NOTICES.md). | Obtain authoritative binary/component information and legal compatibility review. Retained companion notices do not clear these gates. |
| P1 | NOT TESTED — Public hosting, real provider delivery/settlement/refunds/Peppol, production proxy/shared infrastructure, actual credential custody/history. | Buyer-controlled staging/live acceptance with approved accounts and a real public URL. Never send credentials in chat. |
| P1 | NOT TESTED — Full WCAG/ASVS/manual assistive-device assessment. Final browser has 0 strict axe violations but **84 incomplete rule items**. [Browser results](docs/qa/r28/final/browser-final-01/browser-results.json), [triage](docs/qa/r28/final/browser-final-01/incomplete-triage.json). | Manually assess contrast/hidden states, screen readers, voice, zoom/reflow and complete security controls. |
| P2 | NOT TESTED — Actual Windows PowerShell 5.1, physical devices, remote database failures, offsite key custody and disaster recovery. | Execute the [buyer checklist](docs/qa/r28/BUYER-RERUN-CHECKLIST.txt) on the intended environment. |
| P2 | UNKNOWN — Full Git history, actual secrets outside supplied source, credential reuse and ownership/operator privacy facts. | Review excluded private stores/history; rotate any real credential reused from a fixture and revoke related sessions. Final source/ZIP scan triage is delivered beside the ZIP. |
| P3 | VERIFIED — Selected local performance observations, not field guarantees. [Six final Lighthouse measurements](docs/qa/r28/final/lighthouse-frozen-01/README.md). | Measure the buyer's real catalogue, network, hardware and host. |

VERIFIED — Reproducible source defects were corrected: cart concurrency/checkout state, verification cooldown, stock-alert consent, atomic password/session changes, Manager email rollback, French branding labels, modal focus, headings/tables/contrast, bounded compression, deterministic CSS bundles and guarded backup/restore. Read [current changes](R28-CLEANUP-REPORT.md) and [changelog](CHANGELOG.md). No existing feature was intentionally removed; TypeScript 7 was deliberately deferred to avoid adding native compiler artifacts, with the actual candidate check retained.

VERIFIED — Browser 201/201; drawer variant 10/10; fresh-mobile supplement 28/28; local private-CA TLS 18/18; synthetic SEO crawl 115 URLs/3 sitemaps with 0 page problems; current-source encrypted CLI 20/20. The final Docker image built, ran as uid 1000 on Node 24.22.2 and served readiness/Login HTTP 200. [Final evidence index](docs/qa/r28/final/EVIDENCE-COPY-MAP.json). These runs use synthetic disposable state and do not establish live email, payments, public TLS or complete security.

VERIFIED — Browser, local TLS, SEO and Lighthouse identify the same **152 runtime files**, SHA-256 `a67cac89b7c84263d456b3b2b071550d137bb009d4c8f0631c2c8da2bcf1fd81`. This is a scoped runtime fingerprint, not the ZIP digest. Final ZIP SHA-256, actual file enumeration, independent validation, secret triage, scorecard and honesty table are delivered externally beside the archive to avoid a circular digest. Older R26/R27/proposal reports retain their original dates and narrower source scopes.

NOT TESTED — Every-file manual semantic/dead-code review, every concurrency ordering, every browser/state and the absence of hidden defects. Byte enumeration/hashing is not that review. No zero-bug, 100/100, legal or security certification is asserted. The reviewer is not a lawyer; qualified counsel must review source/asset rights, trademarks, licence compatibility, consumer/tax terms, privacy/processors/retention and the actual sale agreement.
