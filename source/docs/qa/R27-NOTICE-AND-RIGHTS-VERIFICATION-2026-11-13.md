# R27 notice and rights proposal verification — 13 November 2026

Scope: isolated `proposals/legal` only. No edits to the main work tree, root README or root CHANGELOG. Root manages the 2.8.94 version and final dependency override integration.

## Result

The revised lock has 105 `node_modules` entries: 104 external dependencies and one local first-party alias. The offline generator captures 112 license/notice texts, includes all nine optional native platform entries (seven absent on this Linux install), and reports zero unresolved collection items. Nine native embedded-component audit gates remain OPEN. The local alias's existing first-party ownership/grant remains UNKNOWN; it is private/UNLICENSED and not described as third-party ISC code.

The original registry `promise-limit@2.7.0` had no full license text in the exact SRI-verified tarball, complete README or untruncated npm-pinned upstream tree. Its ISC metadata and author field were not used to fabricate a grant. That original lock correctly produced exit 1. The revised lock installs separately authored `@shopeasy/task-limit@1.0.0` from `vendor/promise-limit`; the generator now checks its real identity, lock link, exact installed target, complete source-file set and all three file hashes. Limiter behavior/runtime integration is a separate proposal owned by the root agent.

## Executed checks

Runtime: `/workspace/presale-r27/tools/node-v24.22.2-linux-x64/bin/node`, version v24.22.2.

- `node --check scripts/generate-third-party-notices.mjs`: exit 0.
- `node scripts/generate-third-party-notices.mjs`: exit 0 on revised lock.
- `node --test --test-isolation=none test/third-party-notices.test.js test/rights-clearance-inventory.test.js test/license-metadata.test.js test/fix8-french-legal-copy.test.js`: **21 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**, exit 0.

Generator stdout:

```text
Wrote THIRD-PARTY-NOTICES.generated.txt
Package entries: 105; first-party links (rights UNKNOWN): 1; entries with texts: 104; texts copied: 112; optional absent: 7; unresolved: 0; native review gates: 9
```

Behavioral checks cover deterministic output, missing/tampered installed notices and supplementary texts, installed name/version mismatch including nested packages, changed lock entries, missing required packages, absent optional package inclusion, preservation/removal detection for additional Apache third-party notices, malformed provenance replacing stale output, local alias identity and UNKNOWN rights classification, local source tampering/missing provenance, and wrong symlink targets.

## Evidence and documentation changes

`third-party/provenance.json` binds every entry to its exact identity/lock source and fixed notice hashes. All 112 text files are referenced; there are no unused text snapshots. Seventeen source-evidence JSON files include exact package snapshots, the companion package mapping and the historical promise-limit tree. Notice sources include the complete cookie-signature README license, TypeScript's additional third-party notices and seven QR source copyright/trademark headers.

Font docs now record zero bundled font binaries and retained historical license texts. The asset register covers 13 SVGs and one WebP, including the four preview illustrations, without claiming ownership from file presence or earlier creation notes. The seller supplied no documentary source/asset ownership evidence.

The seller-pack descriptions now acknowledge manager TOTP, local cookie-consent controls, a gated Mollie adapter and five UI languages. The root license remains draft-only. `SELLER-PROTECTION-PACK/BUYER-USE-INTENT.md` records editable-source/rebranding intent without executing a grant, changing unknown ownership to verified, or establishing reusable source resale/sublicensing rights.

## Integration and human gates

Integrate the limiter's root dependency/override and lock before using this revised inventory. Copy this proposal's listed legal/notice files only; copied limiter vendor/lock inputs are validation inputs shared with the separate limiter proposal. Bump root version as planned and regenerate notices after the final clean install, so the output header records the actual release version. The isolated proposal's package.json was deliberately left unchanged; the copied lock still records 2.8.93 until root integration.

Open human gates: actual licensor identity and authority/chain of title; code/asset source or assignment evidence (including earlier generated/creation notes); resolution or replacement of unknown-origin materials; embedded native component notices/license review; final buyer deployment/modification/rebranding/customization scope; jurisdiction-specific review and valid acceptance of completed terms; and tying the resulting evidence to the delivered archive checksum. Exit 0 for notice collection does not close those gates or certify commercial clearance.
