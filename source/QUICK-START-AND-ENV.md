# Quick start and environment configuration

## 1. Install and run checks

Use Node.js >=24.22.2 <25 (the `package.json` engine is `>=24.22.2 <25`). Extract the ZIP, open PowerShell inside the project folder containing `package.json`, and run the commands in order:

```powershell
node -v
npm -v
npm ci
npm run check
npm run build:cloudflare
npm run preflight:release
npm run audit:static
node scripts/template-audit.mjs
npm test
npm run test:integration
```

Stop at the first failed command and keep the full error output. `npm test` first checks that declared packages are installed; if it reports missing packages, do not bypass that check—restore network access to the npm registry and rerun `npm ci`. `npm run test:integration` focuses on Manager dashboard, product variants, EJS template compilation and image quota integration. Do not change the test expectation just to make a failure disappear: first verify whether the test's expected behavior/text is current and whether the application behavior is safe. Start only after the checks are reviewed:

```powershell
npm start
```

Open `http://localhost:3000`. Use `Ctrl+C` to stop the server.

## 2. Local environment

Copy `.env.example` to `.env` and fill in real values locally. Never commit `.env`, production passwords, API keys, database tokens or license keys.

```dotenv
NODE_ENV=development
PORT=3000
BASE_URL=
TRUST_PROXY=0
MANAGER_NAME=Store Manager
MANAGER_EMAIL=manager@example.com
MANAGER_PASSWORD=use-a-unique-strong-password
MFA_ENCRYPTION_KEY=replace-with-64-hex-characters-from-openssl-rand-hex-32
STORE_NAME=Your Store Name
STORE_CURRENCY=EUR
DEFAULT_LOCALE=en
STORE_TIMEZONE=UTC
PRICES_INCLUDE_TAX=true
SEED_DEMO_DATA=false
AI_ENABLED=false
AI_BASE_URL=
AI_MODEL=
AI_API_KEY=
```

The legacy names `ADMIN_EMAIL` and `ADMIN_PASSWORD` are migration instructions for old local `.env` files only; they are not current bootstrap inputs. If you are upgrading an existing project, edit its existing `.env` manually: rename `ADMIN_EMAIL` to `MANAGER_EMAIL`, rename `ADMIN_PASSWORD` to `MANAGER_PASSWORD`, and add `MANAGER_NAME`. Do not leave only the old variable names, because this version no longer reads them for the first login.

`MFA_ENCRYPTION_KEY` is mandatory before Manager login. Generate it once using `openssl rand -hex 32`, keep exactly the same value across restarts, and store it in a secret manager or protected `.env` file. The value encrypts TOTP seeds at rest with AES-256-GCM; never commit or publish it. Losing or changing the key prevents existing Manager MFA seeds from being decrypted. Do not reuse `SESSION_SECRET`, password-reset secrets or backup keys.

`MANAGER_NAME`, `MANAGER_EMAIL` and `MANAGER_PASSWORD` create the full-access Manager only if that database has no Manager account. They do not reset an existing Manager account on restart. When upgrading from the older version that created an Admin from `.env`, you can keep that email as `MANAGER_EMAIL` only if `MANAGER_PASSWORD` matches that Admin's current stored password; the app then upgrades that legacy bootstrap account to Manager without resetting its password. If the email belongs to a customer or the password does not match, no role or password is changed—choose a different Manager email instead. Admin accounts are created only by the Manager inside `/admin/staff`.

Start ShopEasy with `npm start`, sign in with the Manager email/password, then open **Staff & account** from the Manager navigation. There you can create restricted Admin accounts and change the Manager email/password. The password-change forms require the current password and revoke other active sessions. See [STAFF-ACCOUNTS.md](STAFF-ACCOUNTS.md) for details. The `npm run staff:create -- manager` utility is a one-time recovery/provisioning command for a database that has no Manager; it cannot create Admin accounts.

`EUR`, `en`, and `UTC` are examples, not universal legal or commercial defaults. Select the currency and precision, language, IANA time zone, tax display, actual delivery countries and local settings applicable to the store. The Manager can optionally configure manual regional delivery-fee overrides and seller-entered percentage-tax rules in Settings. These rules do not discover legally applicable rates or certify compliance. Setting a currency code does not implement payment providers or exchange-rate conversion.

## 2A. Payment methods: cash, bank transfer and card

Cash on delivery remains the default and can be the only enabled method. The separate **manual bank-transfer** option is configured by the Manager under Settings → Payment methods and bank transfer. Enter the real bank name, legal account holder, a valid IBAN or local account identifier, and optional BIC/SWIFT, then enable the option and save. ShopEasy snapshots those details onto each bank-transfer order and issues a unique reference (`SHOP-<order number>`). The customer sees the bank details, exact order total and reference on the confirmation/order page; optional Resend order-confirmation email includes the same snapshot when order emails are deliberately enabled. A bank transfer is **not automatically detected**: the order remains pending/unpaid until a Manager checks the actual incoming bank statement, confirms the exact amount and currency, and records the bank's transaction reference. Customers requesting cancellation of a pending bank-transfer order cannot immediately release reserved stock; the Manager must review the request and check for an incoming payment first. Never accept a screenshot as proof of settlement. This is a manual workflow, not a bank API/Open Banking integration.

Mollie hosted card checkout is the only actual card integration in this build. Production use is disabled unless the seller has independently confirmed merchant onboarding and payout eligibility and explicitly sets `MOLLIE_LIVE_CHECKOUT_APPROVED=true` in the protected server environment alongside a valid `live_` API key, `NODE_ENV=production`, an eligible legal merchant country/currency and a public HTTPS `BASE_URL`. The flag is an internal release gate, not proof that Mollie has approved the merchant. For test mode use a Mollie `test_` API key, a public HTTPS staging origin, `MOLLIE_TEST_CHECKOUT_ENABLED=true`, `NODE_ENV=development` (or the supported staging mode), `payment_mode=cash_and_card`, `payment_provider=mollie`, and a real eligible merchant country/currency. A `localhost` URL will not pass the card readiness gate. ShopEasy never collects card number or CVV; it redirects to Mollie's hosted payment page. Other providers in Manager settings are contacts/onboarding only. Do not enable live card mode for a test.

## 2B. Optional AI-assisted catalog search

AI-assisted full-page product search is optional. Set `AI_ENABLED=true`, `AI_BASE_URL` to the HTTPS base URL of an OpenAI-compatible `/chat/completions` provider (for example a base ending in `/v1`), `AI_MODEL` to a model available to your account, and `AI_API_KEY` in the private server environment. Then turn on **AI shopping assistant** in Manager → Settings. The full `/shop?search=...` request may send the submitted search phrase and selected UI locale to that provider so it can suggest up to three short synonym/translation search phrases. The provider does not receive the product database, customer identity, address, order history, payment information or inventory. ShopEasy searches only its own active product database using parameterized SQL and returns actual matching catalogue items; AI cannot create products, prices or stock. Search expansion is rate-limited and cached briefly. If the AI provider is unavailable, ordinary SQL search continues. The live autocomplete suggestions stay on the local SQL search and do not call the AI provider. Do not enable this until you have reviewed the provider's privacy terms and configured your own key and spending limits. The AI search feature has unit-level mocked-provider tests, but must still be checked against your chosen provider in staging.

The storefront includes a localized `/cookies` information page and a consent dialog with separate accept-all, reject-optional and customize actions. Necessary session/security cookies remain on; optional analytics/marketing are not included or activated in this release. Before adding any analytics, advertising, chat widget or other third-party browser storage, add a documented vendor/purpose/retention entry, load it only after appropriate consent, and independently review the actual market's privacy/ePrivacy requirements. The included policy is a technical disclosure template, not legal advice or a compliance certificate.

## 3. Before accepting real orders

Complete the manager setup checklist, add a real sellable product and test the full order flow. Replace all sample branding, contact details, policies, photos and prices. Review local business, consumer, privacy, security, tax, accessibility and data-protection requirements. Test backup and restore, database access, logs, rate limits, email delivery, mobile layouts and hosting-specific settings in staging.

Checkout defaults to cash on delivery. The Manager can keep COD-only, enable manual bank transfer independently, and enable card checkout through the Mollie hosted-card adapter when merchant-country, card-currency, public HTTPS origin, server API-key and environment checks all pass. A bank transfer is manually reconciled by the Manager against the real bank statement; it is not automatically detected. The Manager directory includes official provider contacts for PayTabs, FIB, iyzico, ZainCash and Stripe, but those providers are onboarding/contact references only, not live transaction integrations. No online transaction is enabled simply by selecting a provider. Merchant approval and payout eligibility must be confirmed directly; if the real Syria-based business is not approved by a provider, keep COD. Optional order confirmation/status emails through Resend remain off by default. Courier booking/carrier tracking is not included. The Seller Protection Pack needs real details and legal review; it does not enable compliance by itself.


## Supported deployment target (current release)

Cloudflare Workers deployment is blocked for this release because its production PBKDF2 cap conflicts with the required hash work factor. Vercel/AWS Lambda serverless deployment is also unsupported. Use one persistent Node.js instance with `RATE_LIMIT_BACKEND=memory-single-instance`; do not scale horizontally until a shared durable limiter is implemented and tested.


## Commercial rights review

ShopEasy 2.8.95 is **not commercially license-cleared**. Before selling a licensed copy, review `RIGHTS-CLEARANCE-REGISTER.md`, `THIRD-PARTY-NOTICES.md` and `ASSET-PROVENANCE-REGISTER.md`. After `npm ci`, run `npm run licenses:generate` and resolve all missing required notices. Keep `LICENSE.txt` draft-only until the actual rights holder has completed, reviewed and accepted the final agreement.

## Customer data protection, email and returns

ShopEasy 2.8.95 includes an auditable order status timeline, optional order emails (disabled unless explicitly enabled), return/exchange/refund request records, low-stock dashboard warnings and encrypted database/media backup tooling. Review `DATABASE-BACKUP-RESTORE.md` before using real customer data. A backup is not considered safe until restored and verified against a separate empty database.

Order email configuration uses `ORDER_CONFIRMATION_EMAILS=0` and `ORDER_STATUS_EMAILS=0` by default; `RESEND_API_KEY` alone does not enable order emails. In `.env`, configure `RESEND_API_KEY` with the real Resend API key, `EMAIL_FROM="ShopEasy <orders@your-verified-domain.example>"` with a sender on a verified domain, and `RESET_CODE_SECRET` with a unique random secret of at least 24 characters (generate one with `openssl rand -hex 32`). Set `ORDER_CONFIRMATION_EMAILS=1` only after a test order succeeds. `EMAIL_LOCALE` can be blank (use the customer's/storefront language) or set to `nl`, `en`, `ckb` or `ar` to force that language for outgoing email. Missing email configuration is logged in production but never blocks order placement. Password recovery remains fail-closed and does not issue an email code unless Resend and `RESET_CODE_SECRET` are configured. Refunds are recorded manually and are not automatically paid by this application.
