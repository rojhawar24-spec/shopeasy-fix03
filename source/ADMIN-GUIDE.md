# Buyer Admin guide — R28 / 2.8.95

Use this handover sequence to install and assume operation of a shop. In the application, **Manager** is the full-access operating role; **Admin** is a restricted read-only overview role. The [Manager guide](MANAGER-GUIDE.md) gives current screen-by-screen shop workflows. [Architecture](ARCHITECTURE.md), [Database schema](SCHEMA.md) and [Features and limitations](FEATURES-AND-LIMITATIONS.md) explain the technical scope.

## 1. Record exactly what you received

Retain the release ZIP, its independently confirmed SHA-256, version, accepted commercial terms and rights evidence. In a new extraction run `npm run verify:package` before installation/builds or adding private files. Check the final release verification records against that exact archive. Historical reports and static previews do not prove the current copy ran.

The current [license](LICENSE.txt) is a draft and the [rights register](RIGHTS-CLEARANCE-REGISTER.md) is open. No documentary source/asset ownership evidence has been supplied. Editing/rebranding intent is recorded in [Buyer use intent](SELLER-PROTECTION-PACK/BUYER-USE-INTENT.md), but the effective grant and chain of title remain UNKNOWN. Preserve [third-party notices](THIRD-PARTY-NOTICES.md); all nine native embedded-component gates require review. Resolve actual authority, assets, terms and acceptance before offering a licensed copy.

## 2. Install in a separate staging copy

Use Node.js >=24.22.2 <25. Follow [Quick start and environment](QUICK-START-AND-ENV.md), [.env.example](.env.example) and [QA setup](qa/README.md). Install using `npm ci`, then run the syntax/lint/scoped-type/template/Node checks and the browser fixture described there. Keep results with their source/runtime hashes and explicit failures, skipped/blocked steps and manual items.

The browser fixture is self-contained and uses Python 3.13, Playwright 1.62.0, temporary synthetic state, real computed TOTP and COD. It refuses a source copy containing private application state. Its optional intercepted email is SIMULATED; it does not send or prove receipt of live email. Never remove real files just to satisfy the fixture guard: use a fresh source extraction.

## 3. Establish accountable access

Set private `MANAGER_NAME`, `MANAGER_EMAIL` and `MANAGER_PASSWORD` for the first Manager. These bootstrap only when no Manager exists; editing `.env` never resets an existing Manager. For the controlled legacy Admin-to-Manager migration, follow [Staff accounts](STAFF-ACCOUNTS.md), including matching the stored account and existing password. Use the authenticated **Staff & account** screen thereafter.

New/set/reset passwords need at least 15 trimmed Unicode characters, within the 200-code-unit input cap, and pass the small offline example/repetition check. Existing valid login credentials continue to verify; the change does not force a silent reset. Complete Manager TOTP and save recovery codes privately, separate from the installation. Test a recovery code once in staging and verify replay rejection. Follow the documented recovery procedure if access is lost; do not edit roles or password hashes directly in the database.

Create restricted Admins only when an overview is sufficient. They cannot manage products, orders, customers, settings, privacy actions or license data. Give deployment/backup access only to the actual operator, and keep credentials, backups and customer data out of public support logs.

## 4. Configure the actual business

In Manager → **Settings**, review legal entity, contact details, public HTTPS origin, currency, IANA time zone, countries actually served, delivery fee/rules, tax rules and reviewed terms/privacy/delivery/returns policies. Incomplete drafts can be saved while checkout stays closed. The launch check is a configuration gate, not an assurance that local legal/tax obligations are met.

In **Storefront** and **Appearance**, replace sample branding/images with material the operator has permission to use. Review English, Sorani Kurdish, Arabic, Dutch and French fields and the disclosed policy fallback. Seller-written product/category/story content is not automatically translated. Set real catalogue prices/costs and inventory; remove demo content before customer launch. Currency is store-wide; precision rescaling is not exchange-rate conversion and requires a separate price review.

Configure only payment methods the business can operate. COD is the default. Bank transfer is manually reconciled against actual statements. Mollie is the implemented card adapter and needs genuine eligibility, server credentials, public HTTPS and explicit live/test environment gates. Other provider-directory entries do not activate their transactions. Test actual sandbox payments/webhooks, live email and Peppol delivery on the chosen host with controlled accounts; retain sanitized evidence. Do not put API keys or bank-login credentials into Manager notes.

## 5. Use privacy actions under a documented policy

Manager → **GDPR** accepts exactly one customer ID or email. Verify the requester's identity outside the form and select the correct action. Exported JSON contains personal data: transfer it securely and set access/retention controls. Manager/Admin accounts are excluded from customer privacy actions.

**Delete eligible account and order records** removes eligible customer/order data transactionally. Gift-card/financial ledger links block deletion; do not remove the foreign key or ledger to force it through. The tool does not decide whether otherwise eligible financial records must legally be retained. Review retention/legal holds before deletion, including records outside the application and backups.

**Minimize personal data and retain financial records** requires an explicit selection, the retention acknowledgement and a reference to the operator's documented retention policy (1–200 characters, not customer details). Open orders or returns must first be resolved. Type `DELETE` to confirm the selected action. The audit records the mode and policy reference.

Minimization removes the customer account, revokes sessions/guest access and clears selected contact and free-text fields. It retains financial line items, amounts, currency, country, dates, payment/refund references and gift-card ledger relations. Those references can link to outside payment/accounting records. Treat the result as **pseudonymous retained data**, not anonymity or certified legal erasure. The tool does not wipe old backups, email-provider data, accounting exports or Peppol records. Use [the privacy implementation gaps](SELLER-PROTECTION-PACK/operations/GDPR-CCPA-IMPLEMENTATION-GAPS.md) and actual counsel/accountant decisions to define the complete process.

## 6. Prepare production and recovery

Follow [Deployment](DEPLOYMENT.md) for the one-instance Linux Node/Caddy/systemd layout. Keep `.env`, database, uploads and backups outside release directories. Set `RATE_LIMIT_BACKEND=memory-single-instance`; horizontal scaling requires a reviewed shared limiter. `npm run start:prod` is a cross-platform Node wrapper. Actual Windows/macOS operation still needs validation. Cloudflare authentication/deployment stays blocked; Vercel/AWS Lambda are unsupported.

Prepare releases using [Release verification](RELEASE-VERIFICATION.md) in a separate source copy. The workflow validates a staged release and emits a new output directory; never install/build/package inside the active production release. The Linux deploy script switches the checked code pointer and attempts rollback if post-switch health/readiness fails. This does not promise zero downtime or reverse database migrations.

Before upgrades, create an encrypted DB/media backup, secure the key separately and rehearse restore into a **separate empty database/uploads target**, following [Backup and restore](DATABASE-BACKUP-RESTORE.md). Deployment does not create or restore a backup for you. Check older-code/schema compatibility before rollback; preserve failed state for diagnosis and plan any data cutover separately.

## 7. Complete a launch and operating record

Use [Staging QA runbook](STAGING-QA-RUNBOOK.md) for buyer-host restart persistence, permission/ownership tests, external providers, domain/TLS, backups, rollback and load checks. Review accessibility violations **and incomplete findings**, translations with native readers, keyboard/zoom and real assistive technology. Full WCAG 2.2 AA or requirement-by-requirement ASVS is not established by bundled checks.

Keep a private operating record of responsible people, current code/archive hash, configuration changes, policy/retention decisions, provider account ownership, last successful restore drill and unresolved items. Operate daily using the [Manager guide](MANAGER-GUIDE.md); report security issues through [Security](SECURITY.md). Technical checks do not close commercial ownership/asset/grant gates.
