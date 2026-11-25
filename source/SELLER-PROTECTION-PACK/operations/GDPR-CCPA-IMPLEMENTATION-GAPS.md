# GDPR / CCPA implementation status — honest gap list

This is a source-derived checklist, not a compliance certificate. Policy text alone does not implement data rights or cookie consent.

## Known from this ShopEasy package
- Customer account/order data exists; checkout collects customer/contact/delivery details.
- Session/security cookies and a `shop_lang` preference cookie are used in source; confirm deployed cookie names/attributes.
- No verified non-essential analytics or marketing provider is configured by default.
- No complete, tested workflow was identified for data export, deletion, correction, objection/opt-out or consent withdrawal.
- Local cookie-consent controls exist in `public/js/app.js`, with persisted preference and rejection/withdrawal handling. This source observation is not a completed deployed cookie/tracker inventory or jurisdiction-specific consent assessment.
- No jurisdiction-specific retention engine, legal-basis registry, automated DSR case tracker or production breach workflow was certified.
- Hosting/database/email provider and international transfer details depend on the actual deployment and must be filled in.

## Required implementation work before claiming compliance
1. Complete a data inventory and purpose/lawful-basis matrix.
2. Map all processors, subprocessors, locations, transfer safeguards and contracts.
3. Build and test identity-verified data access/export/correction/deletion flows, including legal retention exceptions and order integrity.
4. Complete a deployed cookie/tracker inventory, verify the existing consent controls, and gate any added non-essential cookies/scripts until consent where required; test rejection and withdrawal.
5. Define retention/deletion jobs, backups and litigation/tax retention exceptions.
6. Create an incident response plan with controller/processor roles and regulator/data-subject decision workflow.
7. Provide contact details and regulator complaint information where applicable.
8. Evaluate scope separately: GDPR applicability depends on territorial scope and actual processing, not simply where the buyer lives. CCPA/CPRA applicability depends on legal definitions, thresholds and practices, not simply that a visitor is in the US.
9. Test with a privacy lawyer/DPO and document evidence before making public claims.

## Important timing distinction
Under GDPR Article 33, the controller generally notifies the supervisory authority without undue delay and, where feasible, within 72 hours of awareness when the threshold is met. A processor notifies the controller without undue delay. This is not a universal “every breach must be reported within 72 hours to everyone” rule.
