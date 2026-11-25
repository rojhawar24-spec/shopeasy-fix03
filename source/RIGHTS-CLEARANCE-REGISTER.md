# Commercial rights clearance register — ShopEasy 2.8.94

**OVERALL STATUS: OPEN / NOT CLEARED FOR COMMERCIAL RESALE.** This is an evidence register, not legal advice and not an effective license.

## Evidence inspected

- `LICENSE.txt` says `DRAFT ONLY — NOT AN EFFECTIVE LICENSE`, has placeholder parties/terms, and states it grants no rights while required checks are incomplete.
- `package.json` remains `private: true`; both its license field and the root `package-lock.json` license field remain `UNLICENSED`. npm documents `UNLICENSED` for packages where no use terms are being granted and `private: true` to block accidental npm publication: https://docs.npmjs.com/cli/configuring-npm/package-json/. These fields do not prove copyright ownership; they appropriately avoid asserting a grant before authority is established.
- `THIRD-PARTY-NOTICES.md` inventories **105** lockfile package entries. **2** entries omit lock license metadata (`busboy@1.6.0` and `streamsearch@1.1.0`); their exact installed MIT texts are captured and hashed. The offline generator includes all optional platforms and retains explicit failure handling and native-review gates. The external promise-limit release with no authoritative full text has been replaced by a newly authored private/UNLICENSED local limiter, explicitly classified as first-party with existing rights UNKNOWN; all 104 external entries have captured texts.
- `ASSET-PROVENANCE-REGISTER.md` inventories the current 13 SVG files and one WebP, along with the absence of font binaries. Earlier creation notes are provenance observations, not established ownership or assignment.
- The ZIP has no `.git` history and no `author` or `contributors` field in `package.json`. The archive alone does not prove ownership or assignment of all first-party material. The seller supplied no documentary source/asset ownership evidence; those rights remain **UNKNOWN**, including earlier creation claims.

## Clearance matrix

| Gate | Status | Evidence required |
|---|---|---|
| Actual licensor identity | OPEN | Legal name/business identity and contact details for the actual rights holder |
| Authority to license the code | OPEN | Evidence of authorship/assignment and any required contractor/employer/client agreements; review source snippets and contributions |
| Rights in branding and SVG assets | OPEN | Creator/source/license/assignment for each asset; replace anything unclear |
| Third-party package notice compliance | PARTIAL / OPEN | Run `npm ci`, then `npm run licenses:generate`. Validate the offline snapshots and every unresolved item; separately audit licenses/notices of components embedded in libsql native binaries |
| Root license metadata | INTENTIONALLY UNLICENSED | Do not change until the actual rights holder approves final terms |
| Buyer’s permitted use | INTENT RECORDED / GRANT UNKNOWN | Requested: buyer-editable source and rebranding of the buyer’s storefront. See `SELLER-PROTECTION-PACK/BUYER-USE-INTENT.md`. Deployment count, reusable source resale, sublicensing and SaaS require final scope; no effective grant is evidenced |
| Draft agreement placeholders | OPEN | Complete legal parties, scope, deployments, term, fee, order, jurisdiction, signatures/acceptance and applicable limitations after legal review |
| Third-party license compatibility | OPEN | Ensure proprietary terms do not try to override dependencies' own licenses or mandatory notices |
| Legal review/acceptance | OPEN | Qualified review of the final agreement for the relevant seller/buyer jurisdictions and transaction |

## What this release does

- Adds a lockfile-level dependency inventory.
- Adds a provenance register for bundled SVG assets and font/source findings.
- Adds `scripts/generate-third-party-notices.mjs` and `npm run licenses:generate` to validate installed identities, exact lock versions, captured text hashes, README license sections and pinned supplemental sources. Missing/tampered notices or identities cause a non-zero exit. It collects all optional-platform rows even when absent on the current OS and separately verifies the first-party local limiter alias without claiming an effective grant.
- Adds regression tests that keep the package `UNLICENSED` and keep clearance status open while evidence is missing.

## What this release does not do

It does not invent a legal identity, prove authorship or assignment, make `LICENSE.txt` effective, confirm every dependency notice, or grant any commercial resale/rebranding/redistribution/sublicensing rights. Those facts cannot be inferred from code alone.

## Exit criteria before charging a customer for a licensed copy

1. Record documentary evidence for all OPEN gates above.
2. Run `npm ci`, `npm run licenses:generate`, and review `THIRD-PARTY-NOTICES.generated.txt` without unresolved entries. Close the separate native/embedded-component review gates; a successful collection command is not a legal clearance.
3. Resolve or replace every asset with unverified provenance.
4. Choose and complete the actual buyer grant, without purporting to override third-party licenses.
5. Obtain the required qualified legal review and valid acceptance by parties with authority.
6. Store the accepted agreement and evidence against the SHA-256 checksum of the exact delivered ZIP.

Until then, keep the package marked `UNLICENSED`/private and the license draft-only. Do not market it as fully license-cleared.
