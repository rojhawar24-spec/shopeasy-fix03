# ShopEasy 2.8.95 R28 FIX03 — current local QA

**Current remediation candidate. NOT production-certified.** All **31/31 tracked audit items** have code remediations. The item-level outcome and remaining verification limits are in [REMEDIATION-FIX03.md](REMEDIATION-FIX03.md); current execution evidence is under [docs/qa/fix03](docs/qa/fix03/).

## Current FIX03 results

| Check | Recorded result | Scope / evidence |
| --- | --- | --- |
| Audit remediation | 31/31 tracked items have code remediations | [Item mapping and decisions](REMEDIATION-FIX03.md); implementation completion does not establish browser or production acceptance. |
| Final local code suite | **1,420 tests passed; 0 failed, 0 cancelled, 0 skipped, 0 todo** | [FIX03 execution records](docs/qa/fix03/). Linux / Node 24.22.3; this is the local suite result, not the later fresh-package result. |
| Net regression growth | **177 net new tests** over the 1,243-test repair baseline | Count difference: 1,420 minus 1,243. Overlapping targeted reruns are not added to this count. |
| EJS template audit | **62 templates passed** | [FIX03 evidence](docs/qa/fix03/). Structural/compile checks do not verify visual layout. |
| Current application browser checks | **BLOCKED before browser startup** | The pinned browser executable was unavailable; a system-browser attempt failed with `socket() Operation not permitted`. No application browser result was produced. |
| Current axe / Lighthouse | **Not executed for FIX03** | No current automated browser accessibility scan or Lighthouse measurement/certificate is claimed. Prior R28 results below are historical only. |
| Exact clean-copy package verification | Read the result for the delivered FIX03 candidate in [FINAL-VERIFICATION-REPORT.json](FINAL-VERIFICATION-REPORT.json) | Match its release/source identity and actual archive digest. This local QA summary does not anticipate that run's outcome. |

The frontend regressions execute actual JavaScript handlers in controlled DOM/event/fetch models and render actual EJS templates. Native application/database checks and provider mocks have their own recorded scopes. These methods establish the exercised behavior; they do not substitute for real browser focus, back/forward cache restoration, responsive/RTL layout, assistive-technology announcements or live provider transport.

Live payment/email/AI/invoicing providers, actual assistive technology and physical devices, Windows execution, deployment/recovery in the buyer's environment and legal/commercial clearance remain external validation work. The application is **NOT production-certified**, fully accessibility-certified or rights-cleared by these results.

## Package identity and retained evidence

Use [Release verification](RELEASE-VERIFICATION.md) for the clean-copy procedure. `FINAL-VERIFICATION-REPORT.json` must identify **2.8.95 R28 FIX03** before it is used as evidence for this candidate. A report still naming FIX01/FIX02 or an earlier R28 archive is historical. The final output's actual ZIP digest and verification records establish which bytes were checked.

Original audit failures, unsuccessful intermediate runs and prior candidate reports are preserved with their original scopes. [FIX01](REMEDIATION-FIX01.md), [FIX02-A](REMEDIATION-FIX02-A.md), [FIX02-B](REMEDIATION-FIX02-B.md), [R28 cleanup](R28-CLEANUP-REPORT.md) and older `docs/qa/` records do not certify FIX03. Their previous limitations are not automatically current blockers, and their previous passes are not current passes.

## Historical R28 / FIX01 report retained verbatim

The following record is superseded for current-candidate status. Its dates, counts, browser/axe/Lighthouse measurements, fingerprints and `VERIFIED` labels apply only to the historical revisions it names.

<details>
<summary>Historical report — not FIX03 verification</summary>

# ShopEasy 2.8.95 / R28 actual local QA

> **REMEDIATION CANDIDATE FIX01 — 24 November 2026.** This derivative of R28 is not release-certified. All R28 test results and fingerprints below refer to the unchanged baseline, not this modified source. See [REMEDIATION-FIX01.md](REMEDIATION-FIX01.md) for current evidence and limitations.


NOT TESTED — This release is **NOT production-certified**. Local automated observations do not establish live deployment, complete security/accessibility or commercial rights.

VERIFIED — Executed on Linux, 22 November 2026, Node 24.22.2 and Python 3.13.5. Browser: Playwright 1.62.0 with selected Node 24.22.2 driver, Chromium 156.0.8078.79, axe-core 4.11.0. Lighthouse 13.6.0. [Commands and full Node output](docs/qa/r28/final/checks/group-c-summary.json), [test output](docs/qa/r28/final/checks/group-c-tests.txt).

| Execution | Actual result | Evidence |
| --- | --- | --- |
| Full integration suite | 1205 tests/pass1205/fail0/cancelled0/skipped0/todo0 | [Output](docs/qa/r28/final/checks/group-c-tests.txt) |
| Build/syntax/lint/core types/static/preflight/templates/notices/all+production advisory commands | All eleven group-C commands exit0; advisory queries 0 known advisories | [Commands](docs/qa/r28/final/checks/group-c-summary.json) |
| Five-locale browser at 320/390/768/1440 | 201 checks,0 failed/not run,43 strict axe scans,0 violations | [Summary](docs/qa/r28/final/browser-final-01/final-browser-summary.json) |
| Drawer variant | 10/10 focused keyboard groups | [Results](docs/qa/r28/final/browser-drawer-final-01/browser-results.json) |
| Fresh 320px Shop/Contact | 28/28 checks,12 strict scans,0 violations,24 incomplete rule items | [Results](docs/qa/r28/final/browser-fresh-mobile-02/browser-results.json) |
| Private-CA real loopback HTTPS | 18/18 | [Results](docs/qa/r28/final/tls-final-01.json) |
| Synthetic sitemap crawl | 115 URLs,3 sitemaps,all200,0 reported page problems | [Results](docs/qa/r28/final/seo-final-01.json) |
| Current-source encrypted backup/restore CLI | 20/20,exact schema/rows/BLOB/filesystem comparison and negative refusals | [Results](docs/qa/r28/final/backup-final-01/r28-results.json) |
| Final Docker build/runtime | Build0,1205 tests inside build,uid1000,readiness/Login200 | [Results](docs/qa/r28/final/container-final-01/results.json) |
| Frozen runtime Lighthouse | 3 Home mobile runs:99/100/100/100;3 Shop desktop:100/100/100/100 | [Measurements and limits](docs/qa/r28/final/lighthouse-frozen-01/README.md) |

NOT TESTED — Full manual resolution of **84 main axe incomplete rule items**:41 contrast/421 node occurrences and43 hidden-content/670 occurrences. The mobile supplement's24 are additional scan observations, not necessarily distinct defects. Scores of100 in selected Lighthouse categories are automated category results, not a whole-site/security/WCAG score.

SOURCE-CHECKED — Core typecheck covers four modules only. The exact lock inventory has107 node_modules rows (106 external,one local),114 notice texts,0 collector gaps and nine native gates UNKNOWN. [Dependency decision](docs/qa/r28/dependencies/DEPENDENCY-UPGRADE-REPORT.md).

VERIFIED — Earlier group-A and group-B failures are retained under [checks](docs/qa/r28/final/checks/group-a-summary.json). They led to actual fixes or correction of obsolete source-contract expectations; group C is the later complete successful run. The fresh-mobile first attempt used an incorrect theme oracle and failed before scans; its corrected run uses unchanged application bytes. The Lighthouse blocked-startup record is retained and excluded from the six measurements.

VERIFIED — Final packaging attempt01 completed1205 tests with1203 passing and2 documentation failures: a missing current-QA link and missing explicit production-certification disclaimer. Both document omissions were corrected without changing tests or runtime. Its output is retained under `docs/qa/r28/final/package-attempt01/`; the accepted final external verification log records the subsequent complete rerun.

VERIFIED — Attempt02 completed1205 tests with1204 passing and1 remaining documentation failure: the historical October-audit link was also required by the documentation test. That link was restored and both complete documentation test files were checked before the next full fresh packaging run. Its actual output is retained under `docs/qa/r28/final/package-attempt02/`.

NOT TESTED — Actual Windows, physical/assistive-device matrix, public hosting, provider flows, remote-database faults, offsite recovery and a full manual every-file/WCAG/ASVS audit. UNKNOWN — Ownership, sale authority, actual private credential/history facts and native composition. See [audit](AUDIT-REPORT.md), [buyer commands/checklist](docs/qa/r28/BUYER-RERUN-CHECKLIST.txt) and [release verification](RELEASE-VERIFICATION.md).

</details>
