# Security notes — audit repair FIX03

These notes describe controls in the current source. They do not certify a deployed host, absence of vulnerabilities, regulatory compliance or live provider behavior. The authoritative implementation is [server.js](src/server.js), [auth.js](src/auth.js), [security.js](src/security.js) and the transactional operations in [db.js](src/db.js).

## Current dependency facts

The current [package.json](package.json) and [package-lock.json](package-lock.json) agree on EJS 7.0.2, express-rate-limit 8.7.5, TypeScript 6.0.3 and Multer 2.5.0. The Multer lock entry includes a SHA-512 `integrity` value. These are repository facts, not a fresh registry/advisory assessment. Verify installed packages and current advisories as part of a real release in an environment with registry access.

### Historical dependency notes — superseded

Notes dated 2026-10-23 and 2026-10-28 referred to earlier candidates with Multer 2.4.0 or an incomplete Multer 2.5.0 lock entry. Those version/integrity blockers do not describe this repaired tree. The old notes' advisory statements and reported external Windows audit result are historical context; they are not current verification. The application's synchronous upload `fileFilter` remains an additional control.

## Authentication, authorization and requests

- Express uses Helmet headers and a restrictive Content Security Policy. State-changing forms use CSRF validation. Safe local navigation parsing rejects cross-origin, protocol-relative, backslash and control-character targets, including unsafe normalized paths.
- Manager is the full store-management role and must complete MFA. Restricted Admin can open the read-only overview and account-security page; it cannot manage products, orders, customers, settings, privacy actions or audit logs. Server guards enforce the role independently of UI visibility.
- MFA enrollment uses a password-authenticated five-minute challenge, a verified six-digit code, encrypted AES-256-GCM TOTP state and eight one-time hashed recovery codes. Attempts are persisted per Manager/source address with a five-attempt, 15-minute window. Enrollment revokes existing Manager sessions. Preserve the private `MFA_ENCRYPTION_KEY`; missing encryption configuration fails closed.
- New/set/reset passwords require at least 15 trimmed Unicode code points and at most 200 UTF-16 code units, with a small offline example/repetition blocklist. Password verification remains compatible with eligible older credentials. PBKDF2-SHA-256 uses 600,000 iterations; the blocklist is not a complete breached-password service.
- Password-reset codes/tokens are single-use, stored as digests and expire after 10 minutes. Successful password reset revokes the user's sessions. The public request response does not reveal whether an email exists or delivery succeeded.
- Sensitive route families use rate limits. The supported persistent Node topology uses one process and its in-memory route limiter; multiple independent instances do not share it. MFA's persisted counters are a separate control.

## Pending registration and verified ownership

Public registration always leaves a new customer pending and unauthenticated, including when email sending is disabled. Valid new-email and duplicate-email submissions produce the same generic HTTP 200 notice. Pending customers cannot authenticate. With configured email, GET `/verify-email` only opens a read-only form: activation requires a CSRF-protected POST carrying the mail token and the original registration password for the same pending account. An unsolicited link click cannot activate a password chosen by somebody else. Recipients who did not register are told to ignore the message. Production links use the configured safe `BASE_URL`, not the request Host header. Failed verification is generic and does not echo passwords or account details.

The offline alternative is an explicit Manager approval after independent ownership verification. `POST /admin/customers/:id/approve-registration` requires Manager/MFA, CSRF, `identityConfirmed=yes`, and matching strong `password`/`confirmPassword` fields. The password must differ from the pending credential and be privately agreed with the verified customer. Approval atomically replaces that credential, revokes sessions and reset/verification tokens, and records an audit event. A concurrently changed pending record cannot be approved using a stale credential snapshot. Never activate an unknown public registration using its original password: an attacker may have registered the address first. The form never echoes submitted passwords. This workflow does not disable existing verified customers or guest checkout.

## Order access, stock and email

Registered order access requires the signed-in owner. Guest lookup and the `/order/:id/return-request` POST require a matching stored bearer hash through the HttpOnly order cookie or `guestAccessToken` body field, as well as matching order/email details. Guest confirmation/cancel/return routes under `/checkout/success` require the cookie. URL tokens and email/order number alone do not authorize access. The [route reference](API-REFERENCE.md#checkout-and-orders) distinguishes these forms. Operators must verify identity before assisting with lost private codes.

Checkout recalculates money, discounts, destination charges and stock on the server and reserves inventory transactionally. Customer cancellation uses shared provider/state rules. A like-for-like exchange dispatch consumes only available unreserved stock for the original product/variant and updates the return state in the same transaction; duplicate dispatch cannot consume stock twice. COD is not paid until cash collection is recorded. Return/refund recording does not itself move money to a bank or card provider.

Opt-in order email uses a transactional delivery ledger with immutable serialized payloads and provider idempotency keys. A 60-second lease plus claim token protects worker completion. Retries are bounded to three attempts in a 23-hour generation, with 5-second then 10-second delays and an attempt-based daily quota. Changing provider credentials, exhausting attempts/window, or encountering incomplete legacy delivery state requires Manager reconciliation. The UI exposes status, attempts and safe error/reference metadata rather than the stored email payload or secrets.

Reconciliation requires an explicit checked-provider acknowledgement, an outcome and the reviewed generation/attempt counters. The transaction refuses a stale confirmation after another attempt or generation has replaced that state. Marking a provider-confirmed accepted message as sent does not send again. Confirmed non-delivery resets the generation for a separate retry, preserving the daily quota; it does not send automatically. A timeout alone is not proof that no message was accepted. Check the original Resend account and never select non-delivery merely to clear an error. See the [Manager procedure](MANAGER-GUIDE.md#review-and-recover-order-email).

## Uploads, secrets and operational limits

Uploads enforce size, MIME/signature and image-dimension checks and use generated storage paths. Multipart parsing also caps file count, total parts, text fields and field sizes. These controls do not decode all image pixels or prove that a file is safe under every image decoder. Verify persistent media storage on the chosen host.

Production secrets belong in the private hosting environment or secret manager. Do not include environment secrets, a private database, live tokens or customer exports in a release archive. Stored email payloads contain customer data and require the same access, backup and retention protection as orders. Manager tables do not expose those payloads.

No live Resend/Mollie/other provider delivery or settlement was verified in this repair. Browser execution remained blocked by the environment; source, EJS and controlled JavaScript checks do not prove visual accessibility or real browser recovery behavior. Backup/restore, data retention and residency, legal holds, availability, remote database concurrency and capacity require environment-specific validation. These notes are not a guarantee of zero vulnerabilities.
