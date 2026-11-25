# R27 evidence self-challenge

VERIFIED — Five plausible ways this work could be wrong were checked against actual files and executed outputs. This check did not alter product source.

## 1. The browser may have tested an earlier source snapshot.

VERIFIED — Independently recalculated SHA256 of all147 runtime manifest entries against current working source.

```json
{
  "files": 147,
  "mismatched_paths": [],
  "executed_fingerprint": "6e7eb2bfe853ad1db7c0ce92dcb47487ff4708b2c37fbd538a609061dfba887d",
  "qa_runner_matches_executed": true,
  "production_matches_browser": true,
  "both_lighthouse_runs_match_browser": true
}
```

Limit: This check covers the explicitly copied runtime scope, not all documentation, system packages or future production configuration.

Evidence: [browser-final-07/application-runtime-manifest.json](browser-final-07/application-runtime-manifest.json); [browser-final-07/source-still-matches.json](browser-final-07/source-still-matches.json).

## 2. Green tests or a failing mutant can conceal a broken test oracle or setup failure.

VERIFIED — Inspected all12 phase E1 exit codes/full suite footer, actual no-JS negative controls, actual CSP non-bypass evidence and original authorization negative-control log/metadata.

```json
{
  "fresh_locked_install_exit": 0,
  "phase_checks": 12,
  "all_exit_zero": true,
  "full_suite_footer_1148_zero_fail_skip": true,
  "nojs_negative_controls": {
    "check": "No-JavaScript oracle negative controls",
    "status": "PASS",
    "error_page_rejected": true,
    "wrong_language_rejected": true
  },
  "csp": {
    "check": "Browser CSP enforcement",
    "status": "PASS",
    "bypass_csp": false,
    "inline_execution_blocked": true,
    "external_script_blocked": true,
    "violation_events": [
      {
        "directive": "script-src-elem",
        "blocked": "inline"
      },
      {
        "directive": "script-src-elem",
        "blocked": "external"
      }
    ]
  },
  "original_auth_negative_control_correction": "VERIFIED: command exited1 during fixture setup with INVALID_PHONE before authorization/cache assertions. This run does not prove the original access/cache defect. Original actual HTTP evidence is /workspace/presale-r26-audit/evidence/security-runtime-probe.json. No Windows or remote production claim.",
  "browser_final": {
    "passed_checks": 191,
    "failed_or_not_run": 0,
    "axe_violation_items": 0,
    "axe_incomplete_items_pending_manual_review": 126
  },
  "D1_historical_failure": "1147 passed,1 failed: old navigation contract read obsolete CSS and required old open class. Updated contract reads actual mobile/tablet CSS; full D2 rerun passed."
}
```

VERIFIED — Historical auth negative-control metadata originally inferred auth proof from a nonzero exit. Root corrected it to INVALID_PHONE setup failure; it provides no auth proof. Original R26 security-runtime-probe.json independently supplies the real original HTTP evidence.

Limit: Targeted controls do not establish every oracle or path. The latest E1 phase independently repeated a fresh locked install and every check after the private QA-directory packaging guard changes; final packaging repeats them again in a new copy.

Evidence: [phase-e1-install.json](phase-e1-install.json); [phase-e1-summary.json](phase-e1-summary.json); [phase-e1-tests.txt](phase-e1-tests.txt); [browser-final-07/browser-results.json](browser-final-07/browser-results.json); [r26-order-access-negative-control.txt](r26-order-access-negative-control.txt); [r26-order-access-negative-control.json](r26-order-access-negative-control.json).

## 3. A successful backup command may restore incomplete financial records or BLOBs.

VERIFIED — Inspected actual patched encrypted CLI restore drill19 checks, real driver ArrayBuffer witness, exact all-table/schema comparison, FK/integrity checks and refusals. Compared current backup encoder and CLI/business DB hashes with executed drill.

```json
{
  "successful_checks": 19,
  "checks": 19,
  "current_backup_encoder_matches_executed": true,
  "current_cli_and_business_db_matches_drill": {
    "scripts/backup-database.mjs": true,
    "scripts/restore-database.mjs": true,
    "src/db.js": true
  },
  "blob_restored_hash_matches_source": true,
  "failed_upload_refusal_partial_schema_objects": 32
}
```

Limit: Restore is not globally atomic: a refused occupied-upload restore can leave32 table definitions in a disposable target. Discard failed target. src/database.js file-path logic changed after this drill and is covered by fresh actual-driver tests; buyer-host/offsite/Windows recovery remains NOT TESTED.

Evidence: [backup-drill/patched-results.json](backup-drill/patched-results.json); [backup-drill/patched-commands.txt](backup-drill/patched-commands.txt); [phase-e1-tests.txt](phase-e1-tests.txt).

## 4. Tests or packaging could read real state, leak synthetic credentials, or ship private artifacts.

VERIFIED — Inspected actual worker guard and isolatedEnvironment scratch TMPDIR/TEMP/TMP setup, checked existence only of prohibited state paths in source, and read test-isolation evidence.

```json
{
  "source_state_paths_exist": {
    ".env": false,
    "data": false,
    ".venv": false,
    "venv": false,
    "backups": false,
    "public/uploads": false
  },
  "private_values_read": false,
  "guard_reason": "The launcher sets child TMPDIR/TEMP/TMP to its owned scratch directory; therefore realpath(directory) equals realpath(os.tmpdir()) is correct in the child. Parent-directory comparison would break isolation launch.",
  "packaging_final_scan": "NOT TESTED at this subreview; root final archive enumeration and redacted scan remain pending."
}
```

Limit: No real .env/database/venv was opened. Source existence checks do not prove all possible private material absent, and no full Git history was supplied. Current final ZIP must still be enumerated and scanned after packaging.

Evidence: [test-data-isolation-change.json](test-data-isolation-change.json); [isolated-runner-focused.json](isolated-runner-focused.json); [phase-e1-tests.txt](phase-e1-tests.txt).

## 5. Clean technical results could be presented as complete security/accessibility/legal clearance.

VERIFIED — Inspected final browser incomplete counts, generated notice collector output and current draft/open rights register.

```json
{
  "axe_violations": 0,
  "axe_incomplete_rule_items": 126,
  "native_review_gates_9_recorded": true,
  "license_draft_only": true,
  "commercial_clearance_open": true,
  "actual_lighthouse_scores": {
    "home-mobile": {
      "performance": 98,
      "accessibility": 100,
      "best-practices": 100,
      "seo": 100
    },
    "shop-desktop": {
      "performance": 100,
      "accessibility": 100,
      "best-practices": 100,
      "seo": 100
    }
  },
  "actual_production_scope": "Isolated actual production wrapper/runtime, loopback HTTP with synthetic HTTPS proxy indication. Real deployed TLS/browser Secure-cookie transport NOT TESTED."
}
```

Limit: 126 incomplete accessibility items require disposition; native/legal review gates remain open. Source/asset ownership and an effective buyer grant remain UNKNOWN/P0. Full ASVS/WCAG, live providers, real deployment and Windows remain NOT TESTED. No zero-bug or100/100 safety claim follows.

Evidence: [browser-final-07/final-browser-summary.json](browser-final-07/final-browser-summary.json); [browser-final-07/incomplete-triage.json](browser-final-07/incomplete-triage.json); [phase-e1-notices.txt](phase-e1-notices.txt); [production-isolated/production-smoke-results.json](production-isolated/production-smoke-results.json); [lighthouse-final-07/lighthouse-summary.json](lighthouse-final-07/lighthouse-summary.json).
