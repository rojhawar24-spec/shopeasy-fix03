# ShopEasy 2.8.95 R28 FIX03 — current technical handover

**Current remediation candidate; NOT production-certified.** The current change record is [REMEDIATION-FIX03.md](REMEDIATION-FIX03.md), with [FIX03 execution evidence](docs/qa/fix03/) and [current QA](QA-REPORT-2.8.95.md). Earlier R28/FIX01/FIX02 handover claims are historical; the previous text is preserved below.

## Current local evidence

All **31/31 tracked audit items** have code remediations. The final local suite passed **1,420 tests, 0 failures and 0 skips**, a net increase of **177 tests** over the 1,243-test repair baseline. The template audit passed **62 EJS templates**. The full prepackaging suite ran on Linux / Node 24.22.3; individual exporter/check runs can use a different supported Node 24 patch version, and the fresh package stage records its own exact runtime.

Browser checks were **BLOCKED before startup**: the pinned executable was unavailable and the system-browser launch failed with `socket() Operation not permitted`. No current application browser, axe or Lighthouse certificate is claimed. Controlled handler/template checks do not replace real layout, focus, assistive-technology or BFCache checks. Live providers, Windows, buyer-host operation/recovery and legal/commercial clearance remain external validation work.

## Exact package and private-state boundary

Read [FINAL-VERIFICATION-REPORT.json](FINAL-VERIFICATION-REPORT.json) for the exact clean-copy outcome and confirm its FIX03 identity. The source-copy report is explicitly prepackaging evidence; the release wrapper replaces it in its private stage with the actual fresh-install/check results. Use the delivered archive's actual digest, content listing and re-extraction records. This handover does not preassign a final ZIP hash or treat a baseline runtime fingerprint as an archive digest.

The release policy retains application code/assets, generated templates, tests, operating scripts, documentation, required previews, package lock, dependency notices and legal drafts. Installed dependencies, private environments, databases, uploads, backups and QA tool installations are excluded by the packaging workflow. Check the actual archive through [Release verification](RELEASE-VERIFICATION.md), and run `npm run verify:package` in a fresh extraction before installation or adding private data. Synthetic credentials/databases in regression fixtures are disposable test material, not buyer accounts.

Source/asset ownership, an effective buyer grant and the native component rights gates remain **UNKNOWN** where recorded in [Rights clearance](RIGHTS-CLEARANCE-REGISTER.md). Technical remediation and passing tests do not establish commercial clearance. Operational limits remain in [Features and limitations](FEATURES-AND-LIMITATIONS.md) and the current FIX03 report.

## Historical handover retained verbatim

The following candidate labels, claims and references apply only to their original source/archive. They are superseded for FIX03 status.

<details>
<summary>Historical R28 / FIX02-B handover</summary>

# ShopEasy 2.8.95 — R28 technical release candidate

> **REMEDIATION CANDIDATE FIX02-B — 24 November 2026.** Not release-certified. See [REMEDIATION-FIX02-B.md](REMEDIATION-FIX02-B.md) for current evidence and [REMEDIATION-FIX02-A.md](REMEDIATION-FIX02-A.md) and [REMEDIATION-FIX01.md](REMEDIATION-FIX01.md) for prior work. All historical R28 evidence is baseline only.


VERIFIED — The R28 implementation changes, current acceptance status and remaining limits are recorded in [the cleanup report](R28-CLEANUP-REPORT.md) and [QA report](QA-REPORT-2.8.95.md). Earlier cleanup evidence remains historical, not proof about this source. Product features are retained; deliberate behavior changes are listed in the change record.

The source package retains application code/assets, generated runtime templates, tests, operational scripts, documentation, required preview fixtures, exact package lock, third-party notices and legal drafts. Installed dependencies, private environments, databases, uploads, backups and QA interpreter/tool installations are excluded. Synthetic test databases and random test credentials are disposable and are not buyer demo accounts.

VERIFIED — In the delivered ZIP, `SHA256SUMS.txt` covers every other regular file. Run `npm run verify:package` in a fresh extraction before installation. The external `CONTENTS.json` enumerates the actual ZIP members and digest. [Release verification](RELEASE-VERIFICATION.md) describes the final re-extraction checks. A digest verifies consistency; obtain it through a trusted channel to establish sender authenticity.

UNKNOWN — Source/asset ownership, effective commercial transfer/rebranding/sublicensing grant and nine native component review gates remain open. This is NOT CLEARED FOR COMMERCIAL RESALE. Read [rights clearance](RIGHTS-CLEARANCE-REGISTER.md). Technical cleanup cannot supply missing rights.

NOT TESTED — Actual Windows PowerShell5.1/macOS operation, live providers, deployed TLS/CDN/load, offsite production recovery, complete manual WCAG2.2AA/ASVS assessment and every-file manual semantic review. Read [limits](FEATURES-AND-LIMITATIONS.md) and [browser setup](qa/README.md).

</details>
