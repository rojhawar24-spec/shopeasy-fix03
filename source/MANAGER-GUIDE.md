# Manager guide — ShopEasy 2.8.95 / audit repair FIX03

This guide describes included shop workflows. **Manager** has full management access; **Admin** has a restricted read-only overview. Use the [buyer Admin guide](ADMIN-GUIDE.md) for installation, rights, staging and production handover. Market setup/launch checks do not certify legal, tax, privacy or accessibility compliance.

## Sign in and manage staff

Sign in with the intended Manager account and complete TOTP verification/setup before opening management screens. Save recovery codes privately. **Staff & account** (`/admin/staff`) creates restricted Admin accounts, removes an Admin after current-password confirmation, and changes the Manager email/password. `.env` creates only the first Manager; it never resets existing credentials or creates restricted Admins. Follow [Staff accounts](STAFF-ACCOUNTS.md) for legacy migration and recovery.

New/set/reset passwords require at least 15 trimmed Unicode characters (maximum 200 UTF-16 code units) and reject a small offline list of obvious examples/repetitions. Existing valid passwords still work at login. Use a unique private passphrase; the blocklist is not a complete breached-password check. Do not edit database roles or password hashes by hand.

## Verify and approve a pending customer

Public registration creates a pending customer and never signs that person in automatically. A valid new registration and an attempt with an existing email show the same generic notice. When email is configured, the customer opens the verification link and enters the password they chose when registering. Opening the link alone changes nothing. A recipient who did not register should ignore the message and must not activate an unknown registration. With email disabled, the notice asks the customer to contact the store for ownership verification. Existing verified accounts and guest checkout continue to work.

For a pending customer in **Customers**, **Confirm account ownership** is available only to a Manager. Use it only after verifying the customer through your trusted support process; the email/name entered on a public registration form is not proof of identity.

1. Independently verify that the person owns the requested account/address.
2. Privately agree a **new password** with the verified customer. It must satisfy the password policy above and differ from the pending registration's password. Never approve an unknown registration using its original password: somebody else may have registered the address first.
3. Enter the new password and its confirmation in the blank password fields, check the ownership confirmation, and submit once.
4. Confirm the generic success notice. Approval replaces the old credential, invalidates old sessions/reset/verification tokens and records an audit event. The customer can then sign in and change the password through account security.

An unavailable notice means the pending record could not be approved in its current state; refresh the customer list and verify the situation before retrying. An invalid-password notice requires a different acceptable password with matching confirmation. Submitted passwords are never shown back in the page or included in the redirect.

## Change the store name, appearance and homepage

Open **Storefront** (`/admin/branding`) to set the store name and homepage eyebrow, headline, accent and description. Review separate **English, Sorani Kurdish, Arabic, Dutch and French** fields. Seller-written text is shown as entered, not automatically translated. Use **Preview store** on desktop/phone in every enabled language. Changes preserve products, orders, prices and stock.

An optional dedicated JPG/PNG/WebP hero image (up to 2 MiB) is independent of the first product; removing it returns to the catalogue fallback. The bundled illustrations are examples, not product photography or established commercial-rights evidence. **Appearance** controls the logo, supported visual settings and feature switches. Use only branding/assets the operator has permission to use. Keep API tokens, tax IDs and legal text out of homepage fields; use the appropriate private configuration/Settings fields instead.

## Save setup drafts and review launch readiness

**Settings** can save incomplete business identity, empty delivery coverage and unfinished policies while preparing the store; checkout stays closed until required launch fields are ready. Set the real company/contact details, phone, registration number, prices, time zone and applicable policies. Refresh a long-open settings form after an update. Missing controls preserve their saved values; explicitly clearing countries is allowed but closes checkout. Invalid non-empty inputs are rejected.

The launch gate is a configuration check, not a decision that your business may lawfully accept orders. Check actual market obligations with the responsible operator/advisers.

## Choose currency and time zone

**Settings → Currency & delivery** selects one store currency and an IANA time zone such as `Europe/Brussels`; language, currency and delivery country are separate. ShopEasy does not apply exchange rates or customer currency conversion.

Before the first order, changing currency adjusts product prices/costs/sales, fixed coupons and monetary coupon minimums to the new minor-unit precision in one transaction. For example, a numerical value of 89 is precision-rescaled, not converted to the target currency's market value. Delivery fee resets to zero. Set correct target-market amounts and confirm the separate price-review control before checkout reopens. After the first order exists, the store currency is locked to its historical order currency; a mismatched change is blocked. Existing orders are never converted and aggregate reports assume one currency.

## Configure delivery and tax rules

Enter only **Countries where you actually deliver**. The server rejects checkout destinations outside that allow-list. Set the default **Delivery fee per order** (`0` for free delivery), charged once per order in the store currency.

Optional regional delivery overrides use one rule per line:

```text
Country | City or * | Postal prefix or * | Fee
```

Optional tax rules use:

```text
Country | City or * | Postal prefix or * | Rate % | Tax shipping (yes/no)
```

More-specific city/postal-prefix rules take precedence. When tax rules exist, a destination without a match is blocked. Verify the actual coverage, fee, rate and shipping-tax treatment. These are operator-entered arithmetic rules: no carrier rates/booking/tracking, statutory-rate lookup, product exemptions, thresholds, multiple tax layers, registrations or filings are implemented.

## Enter policy text per language

**Settings → Policy text** has separate English, Sorani Kurdish, Arabic, Dutch and French fields. The basic launch gate requires English policies; missing translations show a notice that English is displayed. Policies are not machine-translated. Have applicable privacy, terms, delivery and return text reviewed for the actual market. Orders snapshot accepted terms locale, timestamp and hash. Policy templates do not establish consent-law, consumer-law or privacy compliance.

## Add products, option combinations and images

Open **Products → Add product**. Enter name, SKU, category, regular price, purchase cost and image. For a simple product, leave **This product has options** off and enter its stock. For options, enable it and set one or two option names, such as `Colour` and `Size`. Add a row for each sellable combination (`Blue / M`, `Blue / L`, etc.), with its own stock, SKU and optional image. One-dimensional options remain supported. Up to **50 unique combination rows** are accepted; this is not an arbitrary multi-dimensional configurator.

Add gallery images and associate a row with the appropriate image. Customers must select an available combination; stock is revalidated server-side. Existing ordered option snapshots remain in order history. Removing a combination makes the stored row inactive; reserved combinations cannot be removed or have stock reduced below reservations. Use clear seller-written names/descriptions and review all language needs yourself.

Price fields:

- **Regular price** is the per-unit price before discounts.
- **Purchase cost per unit** is private Manager input for a gross-profit estimate; it is not full accounting profit.
- **Sale price** is optional, greater than zero and below regular price; optional start/end dates schedule it.
- **Automatic discount %** (0–90%) applies to that product; `0` disables it. The server calculates it separately from coupon discounts.

Comma/point decimals and correctly grouped thousands separators are accepted according to the selected currency's precision; there is no exchange-rate conversion. Check scheduled dates in the configured time zone. SQL catalogue filters/sorts and displayed sale prices use consistent timestamp interpretation.

## Restock and read inventory

Use **Products → Edit → Quick restock / Add stock** for arriving quantities. Enter the **additional** units only; for option products choose the exact row using both option values and the SKU shown beside it. This changes quantity without rewriting SKU, price, cost, image or order history. The main product form edits the intended stock level and protects reserved stock. Product-list Previous/Next links retain the chosen active/archived filter.

The dashboard counts active products/combinations where available stock is at/below the reorder threshold. It does not email the Manager a low-stock alert. Optional opt-in customer restock emails are separate and require actual email configuration/testing.

## Archive, restore and delete products

Use the **Product status** filter for live/archived items. **Archive** hides a product while retaining history; it refuses active reserved stock. **Restore** republishes an archived product without automatically featuring it. **Delete permanently** is allowed for an active or archived product with no order-item history and no reserved stock. Keep historically ordered products archived rather than deleting financial/support references.

## Discounts, bundles and stories

**Discounts** creates percentage/fixed coupons, optional minimum subtotal and expiry. Product automatic discounts are shown separately in the cart; coupon calculations use the eligible discounted subtotal. Optional **Bundles** rules apply the configured combination discount. Review real cart/checkout totals before enabling any promotion.

**Stories → Create story** accepts title, text, image, publication/expiry dates and optional product/link. Story text is seller-authored. Use only permitted content and verify dates/visibility in the storefront.

## Choose payment methods

**Settings → Payment methods and provider setup** defaults to COD. Enable methods the actual business can operate.

- **Manual bank transfer** saves instructions with the order. Verify the actual bank statement, exact amount/currency and unique transaction reference before using **Confirm bank transfer**. There is no bank API or automatic receipt check.
- **Mollie hosted card checkout** is the implemented card adapter. It needs merchant-country/currency eligibility, private `MOLLIE_API_KEY`, public HTTPS `BASE_URL` and environment gates. Production requires `NODE_ENV=production`, a live key and `MOLLIE_LIVE_CHECKOUT_APPROVED=true`. A dedicated non-production staging host permits a test key only with `MOLLIE_TEST_CHECKOUT_ENABLED=true`. The provider hosts card entry; ShopEasy does not store PAN/CVV. Server API verification binds payment to the order/reference/amount/currency/mode; a browser success page is not payment proof.
- PayTabs, FIB, iyzico, ZainCash and Stripe are **directory/onboarding entries**, not implemented transaction methods. Private representative notes must not contain API keys, bank passwords or card details.

Check eligibility/KYC/payout restrictions with the actual provider using the correct legal country. Do not enter a false country to pass a form. Built-in adapter support does not prove live settlement, refund behavior or onboarding; validate these using controlled staging/provider accounts. Configure keys in the private server environment, never a browser field.

## Manage orders and held stock

**Orders → Open order** shows customer/contact/destination data, item snapshots, verified totals, payment/reference data, notes and status history. Protect this personal information. COD normally moves **pending → processing → shipped → completed**. Completion means cash was actually collected/delivery completed; it consumes stock and records the cash-received reference. Verified card/bank/gift-card payments use **paid → processing → shipped → completed**. Use only actions currently allowed by the server.

New pending orders have **no automatic reservation timeout**. Reserved stock remains held through active fulfilment; completion consumes it, and supported cancellation releases it once. A paid marker alone does not remove physical on-hand stock. Check stale pending orders manually. The order list shows age with exact time available; it is not an expiry countdown.

For a Mollie attempt with an uncertain/missing local reference, reconcile the exact payment ID from the provider dashboard. ShopEasy fetches/validates it; entering an ID alone does not mark the order paid. **Refresh financial status** records provider-reported refunded/charged-back totals and does not send money. Legacy pending orders can be confirmed as COD only through the guarded action when no online-payment details exist and stock reservations are intact.

## Customer access and cancellation

Registered order access requires the authenticated owner. Guest order lookup and the lookup page's return-request form require the protected HttpOnly order cookie or the private code submitted in the form, in addition to matching order/email details. A successful private-code lookup restores the browser's order cookie. The confirmation page and its cancellation/return forms use that cookie for guest access. Email plus order number is insufficient, and a code in a URL does not grant access. Lost guest access needs the operator's identity-checked support process.

- Pending COD customers can cancel through the supported form; inventory is released once transactionally.
- Processing COD customers can submit a reasoned cancellation request; cancellation waits for Manager acceptance.
- Pending bank-transfer cancellation is request-only so the Manager can check actual receipt first.
- Pending Mollie orders cannot be cancelled by the customer through this form, even if the local payment reference is missing. Reconcile the payment through the existing Manager/provider workflow.
- Paid card/bank/gift-card orders do not offer a general pre-shipment provider refund workflow; resolve payment and customer support before any permitted action.
- Shipped/completed orders use contact/returns handling instead of ordinary pre-delivery cancellation.

Do not force a rejected action with manual database edits. Refresh the order, reconcile payment/reservations and record what actually happened.

A pending request is displayed only when it exists in the stored order state. The customer can resubmit an eligible request after a Manager rejection. A stale link or an unavailable action should not be treated as evidence that a request is already under review.

## Returns, exchanges and refunds

Open **Returns** to approve/reject a request, record arrival, inspect and optionally restock. The queue shows the total matching the status filter and pages of 50 requests. Use Previous/Next to reach older requests; the status filter is preserved. Changing the filter starts from its first page. An empty filter result is not evidence that the store has no returns under another status.

**Replacement exchange** sends the same product/SKU and option combination as the original line, for the approved return quantity. Check the displayed product and both option values before dispatch. This action is not a choice of a different size, colour or product.

1. Receive and inspect the returned item. Choose restock only if the returned units can actually be sold; that step explicitly adds those units back to the original stock.
2. Arrange the like-for-like replacement shipment and enter its reference. Recording dispatch subtracts the replacement quantity from available stock for that exact product/variant, while protecting units reserved for other orders.
3. If stock is insufficient or the state has changed, the shipment update is refused. Recheck physical inventory and the current return record before retrying. Repeating an already-recorded dispatch does not subtract stock a second time.
4. Close the exchange only after confirmed delivery.

Record a refund only after money was sent using the real method. The server bounds the record by the charged item share after discounts, requested quantity and remaining order refund balance; review the historical order currency. The return tool does not contact a bank, execute a Mollie refund or book/track a courier. Gift-card credit is a separate internal ledger action. Verify exact quantities/amounts and avoid duplicate external/internal refunds.

## Review and recover order email

Order-confirmation and order-status email are optional, separately enabled server settings and off by default. Resend sending must also be configured. The **Order emails** section on both COD and other order detail pages shows each attempted event's status, attempt count and available provider/error reference. It does not expose the stored email body or provider credentials. A **sent** state means the provider accepted the message or a Manager reconciled that fact; it is not proof of inbox delivery.

Use **Retry email** for an eligible failed/pending event. A retry keeps the exact original sender, recipient, subject, HTML/text payload and idempotency key. This avoids changing an uncertain send after an order-status, language or store-name change. It may therefore contain the earlier saved state. Starting another business event is not a way to resolve an uncertain earlier send.

The application allows at most **three attempts per generation within 23 hours** of the first attempt. Only one worker owns a **60-second lease** at a time. After failed attempts, the next allowed retry waits **5 seconds**, then **10 seconds**. There is no automatic background retry scheduler. The daily attempt budget (`ORDER_EMAIL_DAILY_LIMIT`, default 10, bounded 1–100 per UTC day) counts retries as well as first attempts across the store. A refused retry can mean the feature is disabled, a worker is still active, the backoff/quota applies, or reconciliation is required.

When **Check delivery before retrying** is shown, do not guess what happened from a timeout or failure notice:

1. Check the original **Resend dashboard** and provider message/reference for the event. If credentials were changed, check the original provider account as well; changing credentials deliberately blocks a blind retry.
2. Select **Message was accepted by the provider** only when the provider confirms acceptance. Enter its message ID if available. This records the result without transmitting the message again.
3. Select **Confirmed not sent** only when provider evidence confirms that the original attempt did not send. This creates a new delivery generation; it does not send a message. The daily attempt budget is retained. Use a separate **Retry email** action afterward if appropriate.
4. Refresh the order and check the current attempt before confirming the provider outcome. Check the required confirmation that you inspected the provider, submit the reconciliation and review the generic result. A stale confirmation is refused if another attempt or delivery generation has replaced the reviewed one. A record with an active lease or already marked sent also cannot be reconciled through this form.

If the provider result remains uncertain, leave the event unresolved and investigate; do not mark it not sent to bypass the guard. Legacy incomplete records and exhausted retry windows/budgets also require this review. These controls have local synthetic regression coverage; live Resend delivery, its current idempotency behavior and recovery in your account still need controlled staging verification.

## Gift cards, customer engagement and invoices

**Gift cards** can enable the feature, issue a currency-bound card and inspect balances/ledger. Keep a new code private; stored codes are hashed. A gift card must cover the complete order; split tender is not implemented. Use the guarded credit/refund action with actual order context.

**Reviews** moderates verified-purchase reviews. **Newsletter** creates campaigns and sends bounded batches to eligible confirmed subscribers. Stock alerts also require confirmation. Check consent/retention and actual email delivery. Order-confirmation/status email is separately opt-in and off by default; there is no general carrier-tracking or Manager order-notification integration.

**E-invoicing** provides the configured Recommand/Peppol submission path and tracking; recipient acceptance and legal/tax correctness must be verified for the actual market. A generated record/PDF is not proof of structured-invoice delivery or full accounting compliance.

## Optional AI

**Settings → Optional AI** controls the feature when a private server-side endpoint/key/model are configured. The key is never shown in the browser. AI expands bounded search phrases and can answer shopping questions using up to 12 public catalogue entries. Search results still come from active real products; AI cannot set authoritative price/stock, and model instructions do not guarantee answer accuracy. Disable the setting/environment flag to turn it off; follow [AI integration](AI-INTEGRATION.md) when changing/removing the module. Review external data/costs and provider configuration; pattern redaction is not a guarantee that every identifier is removed.

## Privacy, audits and recovery

Use **GDPR** only after verifying the requester and reviewing the operator's documented retention/legal-hold policy. Choose export, eligible deletion or explicit financial-record minimization. Minimization requires the policy reference and acknowledgement and retains financial references/ledger; it is pseudonymous retained data, not certified legal erasure/anonymity. Read the complete [privacy procedure in the Admin guide](ADMIN-GUIDE.md#5-use-privacy-actions-under-a-documented-policy) before acting. Account roles, backups and records held by outside services require separate processes.

**Audit** shows application events; protect logs and investigate failed or inconsistent changes before retrying. [Backup and restore](DATABASE-BACKUP-RESTORE.md) covers encrypted DB/media backups and restore into a separate empty target. Secure keys separately and rehearse recovery. [Deployment](DEPLOYMENT.md) code rollback does not restore database state. Actual host/provider delivery/settlement, Windows/macOS and complete accessibility/security coverage remain separate validation work described in [Features and limitations](FEATURES-AND-LIMITATIONS.md).

Browser execution was blocked in the audit/repair environment. The repaired forms and JavaScript were checked through EJS rendering and controlled handler execution; those checks do not verify responsive layout, real keyboard/focus behavior, assistive-technology announcements or browser back/forward cache restoration. Review these workflows on the actual supported browsers before a production handover. No live provider email or payment was sent during the repair checks.
