# ShopEasy 2.8.94 — Seller Protection Pack

**Status: drafts and implementation aids, not legal certification.** Current package: ShopEasy 2.8.94. See root `RIGHTS-CLEARANCE-REGISTER.md`, `THIRD-PARTY-NOTICES.md` and `ASSET-PROVENANCE-REGISTER.md` for open evidence gates. The real seller identity and legal authority to license the entire package have not been independently verified. Do not sign or present draft terms as effective until ownership/dependency rights are confirmed and qualified counsel reviews the transaction.

## Contents
- `legal/terms/` — customer-facing terms in English, Sorani Kurdish and Arabic
- `legal/privacy/` — privacy notice templates in three languages
- `legal/cookies/` — cookie-policy templates in three languages
- `legal/dpa/` — conditional data-processing agreement templates in three languages
- `legal/purchase-agreement/` — software purchase agreement templates in three languages
- `legal/DISCLAIMER.md` — software scope and liability notes
- `sales/` — WhatsApp, email, pricing and prohibited-claims templates
- `operations/` — customer checklist, pre-sale checklist, evidence-folder structure and GDPR/CCPA gaps

## Runtime code added
- `src/license.js` validates environment-variable formats and returns a visible status. It does **not** cryptographically validate a license, prove ownership, verify payment or enforce contractual limits.
- `/admin/license` is restricted to admin accounts and displays status without exposing the key.
- Footer attribution only appears when environment values are configured. Do not configure the seller name until the rights holder is verified.
- `.env.example` documents the license variables using blank, non-secret values.
- `test/license-metadata.test.js` checks missing, valid-format and malformed metadata.

## Honest current product scope
ShopEasy is a configurable multi-market development template. The default UI language is English, with Sorani Kurdish, Arabic, Dutch (Belgium) and French available as configured languages. Default payment is COD. The UI language packs are English, Sorani Kurdish, Arabic, Dutch and French; the legal template documents in this seller pack are not automatically localized into every UI language. The source includes required manager TOTP authentication, local cookie-consent controls and a Mollie card transaction adapter gated by merchant eligibility, configuration and live approval. Other named payment providers are onboarding/contact references. These implementations are not certifications of provider approval, full browser coverage or GDPR/CCPA compliance. Country-specific tax rules, privacy operations and carrier integrations require deployment-specific review and acceptance.

## Commands to run after a clean install
```sh
npm ci
npm run build:cloudflare
npm run preflight:release
npm run check
npm test
npm run audit:static
node scripts/template-audit.mjs
```

Do not ship if any test fails or is blocked. Keep the output log and report passed/failed/skipped/blocked counts separately. Browser, staging, payment/courier sandbox, restore and security tests are separate required gates.

## Required before sale
1. Verify authorship/assignment and rights to dependencies/assets.
2. Fill all bracketed fields and replace sample legal identities with real verified details.
3. Obtain legal review for the seller's and buyer's jurisdictions and B2B/B2C status.
4. Confirm price/tax, exact deliverables, support start date/scope, payment milestones and cancellation rights.
5. Deploy to staging and run all tests; no blocked suites.
6. Compute SHA-256 from the exact delivered ZIP.
7. Do not claim legal compliance or global readiness without evidence.

To generate a random 32-character key identifier locally, run `node scripts/generate-license-key.mjs` and store its output only in deployment secrets. The generated value is an identifier, not a cryptographically verified license or proof of ownership.

Buyer intent is editable source and a rebrandable storefront. Existing grants and first-party ownership remain UNKNOWN; see `BUYER-USE-INTENT.md`. No source/asset ownership evidence has been supplied.
