# Release verification — ShopEasy 2.8.95 R28 FIX03

> **Current remediation candidate: 2.8.95 R28 FIX03. NOT production-certified.** See [REMEDIATION-FIX03.md](REMEDIATION-FIX03.md) and [FIX03 evidence](docs/qa/fix03/). All 31 tracked audit items have code remediations; the final local suite passed 1,420 tests with 0 failures/skips, 177 net new tests over the 1,243-test repair baseline, and 62 EJS templates passed the template audit. These are local prepackaging observations, not an advance assertion that a fresh clean-package run will pass.

FIX03 browser checks were **BLOCKED before startup**: the pinned executable was unavailable and the system-browser launch failed with `socket() Operation not permitted`. No current browser, axe or Lighthouse certificate is claimed. Earlier R28/FIX01/FIX02 pass counts, browser measurements and fingerprints remain historical. Live providers, actual assistive technology, Windows and legal/commercial clearance still require separate validation.


This is the current technical packaging procedure. It does not itself state that a run completed. Read the exact clean-copy outcome in [FINAL-VERIFICATION-REPORT.json](FINAL-VERIFICATION-REPORT.json), and confirm that its release identity is FIX03. Final evidence must identify the exact source/release, command exits, runtime, actual ZIP contents and SHA-256. A report naming an earlier candidate is historical and cannot certify the repaired tree. Earlier R22/FIX statuses are [historical records](docs/qa/RELEASE-VERIFICATION-PRE-R27-HISTORICAL.md); their pending checks/pass counts are not current release evidence.

## Verify a received archive before changing it

Use Node.js >=24.22.2 <25. In a new extraction, before `npm ci`, builds, `.env` or application data, run:

```sh
npm run verify:package
```

This offline command checks exact shipped manifest entries/hashes, required files, safe paths, prohibited private/generated artifacts, relative Markdown links and package/lock rights metadata. It does not install, run application tests or verify ownership. A checksum supplied beside an untrusted ZIP proves consistency, not the sender's authenticity; confirm the digest through a trusted channel.

## Prepare a checked release without changing the source

Use a separate complete source extraction without `.env`, customer data, backups, uploads, virtual environments or private QA output. Existing `node_modules` is not shipped; the wrapper installs locked dependencies in its disposable stage. Choose an output directory that does not yet exist and is outside the source tree:

```sh
npm run release:verify -- --output ../ShopEasy-release-output-NEW
```

PowerShell 5.1 equivalent, from the source root:

```powershell
.\FINALIZE-AND-VERIFY-WINDOWS.ps1 -OutputDirectory C:\ShopEasy-release-output-NEW
```

Actual Windows execution requires separate validation; a Linux run does not establish it. Do not install/update tools or run this workflow in the active production installation.

[scripts/verify-and-package.mjs](scripts/verify-and-package.mjs) checks the input manifest, creates a private temporary copy and runs:

1. Fresh locked `npm ci --ignore-scripts --no-audit --no-fund`.
2. Syntax, lint, scoped core typecheck, static audit and release preflight.
3. Template audit and retained Cloudflare source build (not deployment).
4. The complete `npm test` suite with isolated worker databases.
5. All-dependency and production `npm audit --audit-level=low --json`.
6. Exact installed notice generation, including optional-platform evidence and first-party alias identity.

Failures stop acceptance; no test-skip option is provided. Network/registry failures are failures or blocked execution, not successful advisory checks. Browser QA is a separate workflow in [qa/README.md](qa/README.md); this wrapper does not run live provider or manual accessibility checks. `typecheck:core` covers four selected modules, not the whole application.

The wrapper removes temporary installed/build artifacts, writes `FINAL-VERIFICATION-REPORT.json`, regenerates `SHA256SUMS.txt`, verifies staged integrity, creates the ZIP, re-extracts the actual ZIP and verifies it again. It compares source hashes before/after to reject source mutation during verification. It then publishes the archive, its `.sha256`, `CONTENTS.json` and a private `verification-log.json` in the new output directory. Failed runs retain their log and do not accept a release archive. Protect/review logs before sharing; automatic redaction is not a substitute for checking private output.

## Interpret the results

The archived report identifies automated technical checks; the external log records their outputs and final ZIP enumeration/hash. A successful run is evidence of those checks on that runtime/source. It does not close source/asset ownership, buyer grant, all nine native embedded-component gates, live providers, production deployment, complete WCAG/ASVS, Windows/macOS or all-source manual-review requirements. Read [Features and limitations](FEATURES-AND-LIMITATIONS.md), [Third-party notices](THIRD-PARTY-NOTICES.md) and [Rights clearance](RIGHTS-CLEARANCE-REGISTER.md).

Regenerate [database-schema.json](database-schema.json) with [the schema exporter](scripts/export-schema-reference.mjs) after final source/package changes; it captures a disposable fresh local schema, not an operator database. Archive actual QA reports with their runtime/source hashes and label synthetic/intercepted provider behavior accurately.

Deploy only through the staged procedure in [DEPLOYMENT.md](DEPLOYMENT.md), after host/provider/business validation in [STAGING-QA-RUNBOOK.md](STAGING-QA-RUNBOOK.md). Preserve private state outside releases. Code rollback does not reverse migrations; rehearse [backup/restore](DATABASE-BACKUP-RESTORE.md) into a separate empty target before relying on recovery.
