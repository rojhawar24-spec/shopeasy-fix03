# ShopEasy 2.8.95 R28 FIX03 — start here

This is the **current FIX03 remediation candidate**, not a production-certified release. Read [README](README.md), [FIX03 remediation](REMEDIATION-FIX03.md), [FIX03 evidence](docs/qa/fix03/), [current QA](QA-REPORT-2.8.95.md), [known limits](FEATURES-AND-LIMITATIONS.md), [release checks](RELEASE-VERIFICATION.md) and [rights clearance](RIGHTS-CLEARANCE-REGISTER.md).

All **31/31 tracked audit items** have code remediations. The final local run passed **1,420 tests, 0 failures and 0 skips**; this is **177 net new tests** over the 1,243-test repair baseline. **62 EJS templates** passed the template audit. The exact clean-package outcome belongs to [FINAL-VERIFICATION-REPORT.json](FINAL-VERIFICATION-REPORT.json), which must identify FIX03; do not apply a predecessor report to this source.

Browser checks were **BLOCKED before startup**: the pinned executable was unavailable, and the system-browser launch failed with `socket() Operation not permitted`. There is no current browser/axe/Lighthouse certificate. Live providers, real assistive technology, Windows and legal/commercial clearance remain external validation requirements. Earlier R28/FIX01/FIX02 reports and browser scores are preserved as historical evidence only.

Use a new source extraction for checks. Install the declared Node24 runtime and locked dependencies. Run `npm test` through its isolated launcher; do not select a live database. Windows commands are in [QA setup](qa/README.md). Use [DEPLOYMENT.md](DEPLOYMENT.md) for the persistent Node host and [ADMIN-GUIDE.md](ADMIN-GUIDE.md) for operation. The old REPAIR12/13 installers target earlier existing installations; they are not the R28 buyer installation workflow and are NOT TESTED here.

UNKNOWN — Final source/asset ownership and effective buyer grant. This technical candidate must not be sold as rights-cleared without the required evidence.
