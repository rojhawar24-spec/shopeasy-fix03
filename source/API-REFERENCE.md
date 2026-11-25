# ShopEasy HTTP Route Reference (2.8.95 / audit repair FIX03)

> This route inventory is derived from the current source, not proof of runtime behavior. A real staging deployment and browser/database tests are still required before production certification.

**Inspected source:** the repaired `src/server.js`, `src/auth.js` and relevant transactional `src/db.js` handlers. This is a source-derived route inventory, not a versioned public API specification or an OpenAPI contract. Most routes render HTML or process HTML form submissions; only the endpoints explicitly called JSON below should be treated as JSON endpoints. Re-check the route handler before integrating an external client.

## General request rules

- Base URL: the deployed ShopEasy origin, e.g. `https://store.example` (placeholder only).
- Session: browser routes use the ShopEasy session cookie. Keep cookies enabled for cart, authentication, CSRF and guest-order flows.
- CSRF: state-changing requests require the session CSRF token. Browser forms generally submit `_csrf`; scripted same-origin clients may send `x-csrf-token`. Obtain the current token with `GET /session/csrf`. Multipart image routes use route-level CSRF validation.
- Authentication: `Customer` means a signed-in customer; `Manager` has full store-management access after MFA; `Admin` has a restricted read-only overview and account-security access. Admin cannot use Manager routes, including settings and audit logs. Roles are enforced server-side. Do not infer permission based only on whether a link is visible.
- Rate limits are applied to the listed health, search, login, reset, cart, coupon, checkout, AI and admin route families. Exact behavior also depends on deployment bindings/configuration; production shared limiting must be verified on the target host.
- URLs containing `:id`, `:slug`, `:filename`, or `:page` use path parameters. Query-string parameters are described where they are material.
- Unless otherwise noted, responses are HTML pages or 303 redirects, not JSON. Error status codes depend on the input and current store/database state.

## Operations, security helpers and SEO

| Method | Path | Access | Purpose / response |
|---|---|---|---|
| `GET` | `/health` | Public, rate-limited | Liveness only; returns JSON `{ "ok": true }` when the process handles the request. Does not query the database. |
| `GET` | `/ready` | Public, rate-limited | Readiness check; probes the database and returns JSON `{ "ok": true, "ready": true }` or HTTP 503 with false values. |
| `GET` | `/session/csrf` | Session, no-store | Returns JSON `{ "csrf": "…" }` or a null token if no session token is present. Use the token with same-origin state-changing requests. |
| `GET` | `/uploads/:filename` | Public route, rate-limited | Serves an eligible uploaded image after the handler's filename/path checks; it is not a general file browser. |
| `GET` | `/theme/shop.css` | Public, no-store | Server-generated allowlisted store colours and typography, controlled by Manager appearance. |
| `GET` | `/robots.txt` | Public | Crawler rules. |
| `GET` | `/sitemap.xml` | Public | Sitemap index/entrypoint generated from the current store. |
| `GET` | `/sitemap-static.xml` | Public | Static-page sitemap. |
| `GET` | `/sitemap-products-:page.xml` | Public | Product sitemap page for the supplied page segment. |

## Storefront, search and content

| Method | Path | Access | Purpose / inputs |
|---|---|---|---|
| `GET` | `/` | Public | Homepage and featured products. |
| `GET` | `/shop` | Public | Product catalogue. Query parameters include `search`, `category`, `sort`, and `page`. |
| `GET` | `/category/:slug` | Public | Category landing page and category/product navigation. |
| `GET` | `/product/:slug` | Public | Active product detail, image gallery and available two-option variant combinations; inactive or missing products return 404. Optional query parameter: `variant`. |
| `GET` | `/api/search` | Public JSON, rate-limited | Query parameter `q` (cleaned and capped at 80 characters). Returns `{ results: [] }` for an empty query; otherwise up to six active products, each with `id`, `name`, `slug`, `image`, formatted `price`, and `discount`. |
| `POST` | `/language` | Session + CSRF | Selects an enabled locale from `en`, `nl`, `fr`, `ckb` or `ar` and redirects to a safe local return path. Form fields: `language`, `returnTo`. Seller-authored content is preserved; translation completeness and linguistic quality require separate review. |
| `GET` | `/stories` | Public | Active stories. |
| `GET` | `/faq` | Public | Frequently asked questions and links to current configured merchant policies. |
| `GET` | `/contact` | Public | Merchant-configured contact information and customer-service links. |
| `GET` | `/privacy` | Public | Displays configured privacy policy for the selected locale, with the app's fallback behavior if needed. Content must be reviewed for the merchant's actual jurisdiction and practices. |
| `GET` | `/terms` | Public | Displays configured terms. This is a page renderer, not proof the terms are legally sufficient. |
| `GET` | `/shipping-returns` | Public | Displays configured shipping and returns text; it does not integrate a courier. |
| `GET` | `/cookies` | Public | Describes this build's first-party storage, cookie preferences and optional categories; not a legal certification. |
| `GET` | `/imprint` | Public | Displays saved legal business identity, address, registration, VAT (if entered), and contact details. No invented business values. |
| `GET` | `/withdrawal-form` | Public | Printable model withdrawal form, subject to applicable consumer law. Does not submit an online withdrawal request. |

## Cart and wishlist

| Method | Path | Access | Purpose / notes |
|---|---|---|---|
| `GET` | `/cart` | Public session | Displays the session cart. |
| `POST` | `/cart/add` | Public session + CSRF, rate-limited | Add a product/variant and quantity to the cart. Availability and stock rules are checked by the handler. |
| `POST` | `/cart/update` | Public session + CSRF, rate-limited | Update quantities for cart items. |
| `POST` | `/cart/remove` | Public session + CSRF, rate-limited | Remove an item from the cart. |
| `POST` | `/cart/coupon` | Public session + CSRF, rate-limited | Apply/validate a coupon against cart conditions. |
| `GET` | `/wishlist` | Customer | Displays the signed-in customer's wishlist. |
| `POST` | `/wishlist/toggle` | Customer + CSRF, rate-limited | Toggle a product in the signed-in customer's wishlist. |

## Optional customer engagement (2027 preview)

All new features default OFF until the Manager enables them under **Design Studio**. HTML forms require the session CSRF token; managers must pass full Manager authentication including MFA. Email actions require Resend configuration, and confirmation URLs should use a HTTPS `BASE_URL` in production. These routes are **not** proof of working live email delivery.

| Method | Path | Access | Purpose / inputs |
|---|---|---|---|
| `POST` | `/newsletter/subscribe` | Public + CSRF + rate limit, feature-gated | Request opt-in email; address enters pending state; never auto-subscribes. |
| `GET` | `/newsletter/confirm` | Public | Display the confirmation form; does not change consent on GET. |
| `POST` | `/newsletter/confirm` | Public + CSRF + rate limit | Consume one-time email confirmation token; changes pending to active. |
| `GET` | `/newsletter/unsubscribe` | Public | Display unsubscribe confirmation; GET never modifies subscription. |
| `POST` | `/newsletter/unsubscribe` | Public + CSRF + rate limit | Consume active subscription unsubscribe token, changing to unsubscribed. |
| `POST` | `/stock-alerts/request` | Public + CSRF + rate limit, feature-gated | Request a double-opt-in stock alert only for an unavailable active product. |
| `GET` | `/stock-alerts/confirm` | Public | Display single-use stock alert consent confirmation; no state changes on GET. |
| `POST` | `/stock-alerts/confirm` | Public + CSRF + rate limit | Consume the stock notification confirmation token. |
| `POST` | `/products/:id/reviews` | Authenticated customer + CSRF + rate limit | Submit or revise a moderation-pending review, if a completed linked order proves purchase. |
| `GET` | `/admin/reviews` | Manager | Review pending verified-purchase reviews. |
| `POST` | `/admin/reviews/moderate` | Manager + CSRF | Approve or reject a pending review, recording an audit log. |
| `GET` | `/admin/newsletter` | Manager | List confirmed subscriber total and saved owner-authored campaigns. |
| `POST` | `/admin/newsletter/create` | Manager + CSRF, feature-gated | Save plain-text campaign; does not send any email. |
| `POST` | `/admin/newsletter/send-batch` | Manager + CSRF + dedicated rate limit, feature-gated | Explicitly send max 15 previously confirmed recipients via Resend. HTTPS and 32+ character signing secret required. Provider delivery and recovery from interrupted batches need staging verification. |
| `GET` | `/api/cart/preview` | Public session JSON, feature-gated | Read-only cart contents and approximate subtotal; no payment, stock or checkout mutations. Country-specific shipping/tax is still calculated in checkout. |

## Local development recovery (not available in production)

These two routes are intentionally restricted to `NODE_ENV=development`, local file-backed SQLite, a loopback TCP peer, and a localhost Host header. They are for recovering the existing Manager account on the same computer; they do not create or promote accounts and are disabled in production and Cloudflare Worker mode.

| Method | Path | Access | Purpose / inputs |
|---|---|---|---|
| `GET` | `/local-manager-recovery` | Local development only + session | Displays the existing Manager account and login-lock status. Does not expose MFA secrets or recovery codes. |
| `POST` | `/local-manager-recovery` | Local development only + session + CSRF + dedicated rate limit | Clears the existing Manager login block or updates the Manager password while preserving MFA configuration. |

## Login, account and password reset

| Method | Path | Access | Purpose / inputs |
|---|---|---|---|
| `GET` | `/login` | Public | Login form. Query parameters may include `next`, `email`, `mode`, and `reset`. |
| `POST` | `/login` | Public + CSRF, rate-limited | Authenticate a customer/staff account. Form fields follow the login view. |
| `GET` | `/register` | Public | Registration form. |
| `POST` | `/register` | Public + CSRF, rate-limited | Validate `email`, `fullName`, `password`, `confirmPassword`, `termsAccepted` and optional safe `next`. A new customer remains pending/unverified and is not signed in. Valid new and duplicate email submissions share the generic HTTP 200 notice. Email verification or trusted Manager ownership approval is required; disabling email does not auto-activate a registration. |
| `GET` | `/verify-email` | Public, read-only | A valid unexpired `token` shows a confirmation form. Opening the link does not activate an account or consume the token. Invalid/unavailable links show a generic error. |
| `POST` | `/verify-email` | Public + CSRF, rate-limited | Requires the mail `token` and original registration `password`. Both proofs must match the same pending customer before activation. Tokens expire after 24 hours and are consumed on successful verification; incorrect/expired proof returns a neutral error. A recipient who did not register should ignore the message. |
| `POST` | `/verify-email/resend` | Public + CSRF, rate-limited | Send a replacement verification email where the account requires verification; response is neutral to limit account enumeration. |
| `POST` | `/logout` | Session + CSRF | End the current session and redirect to `/`. |
| `GET` | `/forgot-password` | Public | Password-reset form. |
| `POST` | `/forgot-password` | Public + CSRF, rate-limited | Request/verify the password-reset flow. Resend configuration and the reset-code secret are required for sending; live delivery is not proven by local checks. |
| `GET` | `/account` | Customer | Account page and customer's account/order information. |
| `GET` | `/account/security` | Signed-in account | Account security/change-password form, including restricted Admin. |
| `POST` | `/account/security` | Signed-in account + CSRF, rate-limited | Change the account's password after current-password, new-password and confirmation validation. |
| `GET` | `/account/order/:id` | Customer | Access to an order is checked against the signed-in customer's authorization. |
| `POST` | `/account/order/:id/cancel` | Signed-in order owner + CSRF, rate-limited | Directly cancel pending COD; request cancellation for processing COD or pending bank transfer with a reason. Existing pending requests cannot be duplicated. Other provider/state combinations are unavailable through this customer action. |
| `POST` | `/account/order/:id/returns` | Customer + CSRF, rate-limited | Request a return, exchange or refund for a delivered item; item quantity and order ownership are validated. |
| `POST` | `/checkout/success/returns` | Order owner/guest token + CSRF, rate-limited | Request a return, exchange or refund from the receipt page; guest orders require their HttpOnly guest-order cookie and cannot be accessed by order number alone. |

## Checkout and orders

| Method | Path | Access | Purpose / notes |
|---|---|---|---|
| `GET` | `/order-lookup` | Public | Displays order lookup form without granting access. Optional numeric `order` prefills the order number; a URL bearer is not accepted. |
| `POST` | `/order-lookup` | Signed-in owner or guest bearer + CSRF, rate-limited | Requires numeric `orderNumber` and matching `email`. Account orders also require the authenticated owner; guest orders also require their HttpOnly order cookie or private `guestAccessToken` body field. Matching email and number alone fail with a generic HTTP 200 lookup result. Successful guest proof refreshes the root-scoped order cookie. |
| `POST` | `/order/:id/return-request` | Signed-in owner or guest bearer + CSRF, rate-limited | Requires a completed order, matching `email` (or signed-in email), and the same ownership/bearer proof as lookup. Inputs include `orderItemId`, `quantity`, `requestType`, `reasonCode`, optional `note` and guest `guestAccessToken` if no cookie. Validates remaining return quantity/window and sends a receipt email when configured. Unauthorized/unavailable orders return 404. |

| Method | Path | Access | Purpose / notes |
|---|---|---|---|
| `GET` | `/checkout` | Public session | Checkout form. Launch-readiness settings and available delivery-country configuration apply. |
| `POST` | `/checkout` | Public session + CSRF, rate-limited | Revalidates prices/stock and creates an order for an enabled COD, manual bank-transfer, full gift-card or gated Mollie method. Guest access uses a private cookie-backed bearer; account orders require ownership. Card details are collected by Mollie. Browser totals are not authoritative and repeated submissions use the session checkout intent/idempotency rules. |
| `GET` | `/checkout/success` | Signed-in order owner or guest order cookie | Receipt landing page requires numeric `order` plus owner authorization or a matching HttpOnly guest-order cookie. A URL token is not accepted. Mollie status may be reconciled from the provider API; browser parameters are not payment proof. |
| `POST` | `/checkout/success/cancel` | Signed-in order owner or guest order cookie + CSRF, rate-limited | Uses `orderId` and optional `reason`; the same customer provider/state cancellation policy applies as on the account order page. For guests this route requires the cookie, not a body-only private code. |
| `GET` | `/checkout/cancel` | Public | Safe legacy landing redirect to `/account` for signed-in users or `/cart` for guests; GET itself does not change order state. |

**Payment status:** Cash on delivery remains the default. Mollie hosted card checkout is integrated, but production use is fail-closed until legal merchant-country eligibility, supported currency, public HTTPS origin, live API key, and explicit `MOLLIE_LIVE_CHECKOUT_APPROVED=true` are all satisfied. Merchant approval and real settlement have not been certified by this source audit. Other entries in Manager onboarding contacts (PayTabs, FIB, iyzico, ZainCash and Stripe) are references only and are not transaction adapters.

**Guest access boundary for existing orders:** the lookup and `/order/:id/return-request` POST routes accept `guestAccessToken` in the body or the matching `guest_order_<id>` HttpOnly cookie. The confirmation GET and its `/returns` and `/cancel` POST routes use that cookie for guest access. Never put a private code in a URL. Losing both the cookie and code requires an identity-checked support process; matching email/number is not sufficient proof.

## Hosted card payment callback

| Method | Path | Access | Purpose / response |
|---|---|---|---|
| `POST` | `/payments/mollie/webhook` | Provider callback, rate-limited | Accepts a Mollie payment ID, fetches the authoritative payment from Mollie's API, matches the stored payment reference and validates state/amount/currency before changing order state. Returns a non-2xx response when provider verification or database state fails so the provider can retry. It never treats browser return parameters as proof of payment. |

## Optional AI search assistant

| Method | Path | Access | Purpose / response |
|---|---|---|---|
| `POST` | `/api/ai/search-assistant` | Public session + CSRF, rate-limited | JSON body `{ "message": "…" }` (message is capped at 500 characters). Returns `{ "answer": "…" }`; HTTP 404 if AI is disabled, 400 if the message is empty, or 503 if the configured AI service is unavailable. Requires an enabled/configured AI service. |

## Manager routes

All `/admin` routes below require the `Manager` role except the overview, explicitly marked `Manager or restricted Admin`. MFA challenge routes are an explicit exception: they use the short-lived challenge issued after password authentication and do not grant a Manager session until a valid TOTP/recovery code is verified. State-changing requests require CSRF. Product/story image uploads are constrained by configured multipart/file rules. These routes are mostly HTML forms and redirects, not JSON CRUD endpoints.

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/mfa/setup` | Five-minute Manager enrollment challenge | Displays the TOTP QR code and manual secret while enrollment is pending. |
| `POST` | `/mfa/setup` | Enrollment challenge + CSRF | Regenerates the pending TOTP secret and QR code. |
| `GET` | `/mfa/verify` | Five-minute Manager login challenge | Displays the TOTP or recovery-code form after password authentication. |
| `POST` | `/mfa/verify` | Login/enrollment challenge + CSRF + account-wide rate limit | Verifies TOTP or a one-time recovery code. Invalid or out-of-window codes return HTTP 400; the sixth attempt in the 15-minute window returns HTTP 429. |
| `POST` | `/mfa/cancel` | Login/enrollment challenge + CSRF | Cancels the temporary sign-in/enrollment challenge and returns to login without creating an authenticated Manager session. |
| `GET` | `/mfa/disable` | Authenticated Manager | Displays the form to disable MFA with re-authentication. |
| `POST` | `/mfa/disable` | Manager + CSRF + current password + TOTP/recovery code + rate limit | Disables MFA only after re-authentication and revokes Manager sessions. |
| `GET` | `/admin` | Manager or restricted Admin | Manager dashboard; Admin receives the restricted read-only overview. |
| `GET` | `/admin/categories` | Manager | List categories; query `edit` can select a category for editing. |
| `POST` | `/admin/categories/save` | Manager + CSRF | Create or update a category, including parent category. |
| `POST` | `/admin/categories/delete` | Manager + CSRF | Delete a category when its child/category constraints permit it. |
| `GET` | `/admin/products` | Manager | Product list; query parameters include `search`, `category`, `status` (`all`, `active`, `archived`) and `page`. |
| `GET` | `/admin/products/new` | Manager | New product form. |
| `POST` | `/admin/products/save` | Manager + CSRF + bounded upload | Create/update a product, with a cover plus gallery images, and up to 50 unique one- or two-option combinations. Each combination has its own SKU, stock and optional image URL. |
| `GET` | `/admin/products/:id/edit` | Manager | Edit product, gallery images, and one- or two-option variant inventory. |
| `POST` | `/admin/products/:productId/images/:imageId/delete` | Manager + CSRF | Remove one image from the specified product gallery; refuses to remove the final image and promotes the next image when the cover is removed. |
| `POST` | `/admin/products/restock` | Manager + CSRF | Add stock for a product or its active variant. |
| `POST` | `/admin/products/archive` | Manager + CSRF | Hide a product from the storefront while preserving order history. |
| `POST` | `/admin/products/restore` | Manager + CSRF | Restore an archived product to the storefront without automatically featuring it. |
| `POST` | `/admin/products/delete` | Manager + CSRF | Permanently remove an archived product only when no order-item history or reserved stock exists; linked story references are detached by the database. |
| `GET` | `/admin/stories` | Manager | Manage stories. |
| `GET` | `/admin/stories/new` | Manager | New story form. |
| `POST` | `/admin/stories/save` | Manager + CSRF + bounded upload | Create/update a story and optional image. |
| `GET` | `/admin/stories/:id/edit` | Manager | Edit a story. |
| `POST` | `/admin/stories/delete` | Manager + CSRF | Delete a story and attempt uploaded-image cleanup. |
| `GET` | `/admin/orders` | Manager | Order list; query parameters include `search`, `status`, `page`. |
| `GET` | `/admin/returns` | Manager | Paged queue of return/exchange/refund requests. Accepts allowlisted `status` and one-based `page`; fixed 50 rows per page. Counts all matching rows, clamps the page and preserves status in paging links. A `pageSize` query value does not change this server limit. |
| `POST` | `/admin/returns/:id/action` | Manager + CSRF | Approve/reject, record receipt/restock, record an already-issued refund, or dispatch/close a like-for-like exchange with reference. Dispatch atomically deducts unreserved stock for the original product/variant and return quantity once. Does not issue payment or book a shipment. |
| `GET` | `/admin/orders/:id` | Manager | Order detail. Cash-on-delivery orders use their COD-specific view. |
| `POST` | `/admin/orders/:id/email/retry` | Manager + CSRF | `eventKey` selects an existing confirmation/status delivery. Retry uses the stored exact payload/key and current feature/provider gates, lease, backoff, attempt/window and daily quota. Redirects with `email=sent` or `retry-unavailable`; it does not infer inbox delivery. |
| `POST` | `/admin/orders/:id/email/reconcile` | Manager + CSRF | Requires `eventKey`, `expectedGeneration`, `expectedAttemptCount`, `providerChecked=yes`, `outcome=sent` or `not-sent`, and optional `providerMessageId` (max 200 characters). Records a provider-checked outcome only for the reviewed generation/attempt; refuses stale forms, sent records and active leases. `sent` marks accepted without transmission; `not-sent` opens a new generation but sends nothing. Redirects with `email=reconciled` or `error`. |
| `POST` | `/admin/orders/refresh-mollie-financials` | Manager + CSRF | Fetch the stored Mollie payment directly, validate its order ID/reference/amount/currency/mode, and refresh the reported refund/chargeback totals. Does not issue a refund or change the fulfilment status. |
| `POST` | `/admin/orders/reconcile-mollie-payment` | Manager + CSRF | Recover an uncertain pending Mollie order by fetching the entered provider ID server-side and validating test/live mode, order metadata, exact amount and currency. Only provider-confirmed terminal states release stock. |
| `POST` | `/admin/orders/confirm-legacy-cod` | Manager + CSRF | Explicitly confirm an older pending order as COD only when no payment URL/reference exists and every order line still has reserved stock. |
| `POST` | `/admin/orders/confirm-bank-transfer` | Manager + CSRF | Manually mark a pending bank-transfer order paid only after confirming the exact amount/currency and bank-statement reference against the actual incoming bank transaction. |
| `POST` | `/admin/orders/status` | Manager + CSRF | Update an order status or decide a cancellation request, subject to the allowed status transitions. |
| `GET` | `/admin/coupons` | Manager | List coupons; query `edit` can select a coupon. |
| `POST` | `/admin/coupons/save` | Manager + CSRF | Create/update a coupon. Fixed-discount amounts depend on the configured currency; percentage coupons are bounded by server validation. |
| `POST` | `/admin/coupons/delete` | Manager + CSRF | Delete a coupon. |
| `GET` | `/admin/customers` | Manager | Customer list/search; query parameters include `search` and `page`. |
| `POST` | `/admin/customers/:id/approve-registration` | Manager + CSRF | Approve a pending customer only after independent ownership verification: `identityConfirmed=yes`, strong `password`, matching `confirmPassword`. The new password must differ from the pending one. Atomically replaces the credential and revokes pending verification/reset tokens and sessions. Generic `registration=approved`, `unavailable`, `confirmation-required` or `invalid-password` redirect; no submitted password is rendered. |
| `GET` | `/admin/branding` | Manager | View/edit store name and localized storefront hero text. |
| `POST` | `/admin/branding` | Manager + CSRF | Save configured brand name and localized hero text; optionally upload/remove a dedicated homepage hero image (JPG, PNG or WebP, up to 2 MiB). |
| `GET` | `/admin/audit` | Manager | View the protected application audit log; restricted Admin has no access. |
| `GET` | `/admin/gdpr` | Manager | Opens the customer privacy-tools page and recent GDPR audit events. |
| `POST` | `/admin/gdpr/export` | Manager + CSRF | Exports a customer's GDPR data after authorization; audit logging is fail-closed before the data attachment is sent. |
| `POST` | `/admin/gdpr/delete` | Manager + CSRF | Executes the supported customer privacy deletion/anonymization flow and records the privacy action. |
| `GET` | `/admin/license` | Manager | View license metadata format/status; does not verify ownership or cryptographic license validity. |
| `GET` | `/admin/appearance` | Manager | Appearance studio for shop logo, allowlisted brand colours/font, and optional design functionality. |
| `POST` | `/admin/appearance` | Manager + CSRF + upload checks | Persist allowlisted appearance options; product/order/payment settings unchanged. |
| `GET` | `/admin/settings` | Manager | View store-wide settings and launch checklist. |
| `POST` | `/admin/settings` | Manager + CSRF | Save store-wide settings: currency, legal/contact fields, default/regional shipping fees and country allow-list, configured tax rules/policy text, AI toggle and related configuration. Saving settings does not mean every launch gate is satisfied. |
| `GET` | `/admin/staff` | Manager | List restricted Admin accounts and render Manager email/password controls. |
| `POST` | `/admin/staff/create-admin` | Manager + CSRF | Create a restricted Admin after name, email, password and confirmation validation; duplicate addresses are refused. |
| `POST` | `/admin/staff/delete-admin` | Manager + CSRF + current password | Permanently removes only a `role=admin` account, cascades its sessions/reset tokens, and preserves historical order records. |
| `POST` | `/admin/staff/update-email` | Manager + CSRF + current password | Change only the signed-in Manager email, invalidating reset tokens and signing out other sessions. |
| `POST` | `/admin/staff/change-password` | Manager + CSRF + current password | Change only the signed-in Manager password, invalidating reset tokens and signing out other sessions. |

## Optional finances and Belgium B2B (2027 preview)

All endpoints below require a signed-in Manager and an existing CSRF token for POST. Gift-card balances and redemptions are held in SQLite transactions; issuing a gift card is an explicit Manager action, **not** an online paid gift-card purchase. Only full gift-card tender is supported: mixed card+Mollie/bank tenders are rejected. The Peppol adapter needs a verified provider account and external credentials; validating or submitting is not evidence of recipient delivery.

| Method | Path | Access | Purpose / inputs |
|---|---|---|---|
| `GET` | `/admin/bundles` | Manager | Review optional pair-of-products discount rules. |
| `POST` | `/admin/bundles` | Manager + CSRF | Save at most one pair promotion and enable/disable it. Pricing recomputes independently inside checkout's database transaction. |
| `GET` | `/admin/gift-cards` | Manager | Review issued gift cards, remaining balances and order refund status; original codes cannot be retrieved. |
| `POST` | `/admin/gift-cards/toggle` | Manager + CSRF | Toggle gift-card checkout availability. |
| `POST` | `/admin/gift-cards/issue` | Manager + CSRF | Issue a cryptographically random gift card; the full code is shown only immediately after creation. Owner must keep issuance accounting. |
| `POST` | `/admin/gift-cards/refund` | Manager + CSRF | Record a bounded, once-only ledger credit on a fully gift-card-paid, refunded/cancelled order. This action does NOT refund Mollie or bank transfers. |
| `GET` | `/admin/e-invoicing` | Manager | Peppol invoice draft UI and submission journal. No automatic invoice is created from ecommerce orders. |
| `POST` | `/admin/e-invoicing` | Manager + CSRF | Generate or explicitly submit a Belgian B2B draft through an external access-point adapter, using configured credentials. Production send requires a separate server approval flag. |
| `POST` | `/admin/e-invoicing/toggle` | Manager + CSRF | Enable/disable Peppol submission in the Manager. |

## Known API/deployment boundaries

- No separate documented external/public REST API version or OpenAPI schema is supplied in this release.
- COD is the default payment path. Manual bank transfer and full gift-card tender are separate supported flows; Mollie is the only implemented hosted-card transaction adapter. Production card activation remains gated on merchant eligibility/approval. Other listed providers are onboarding references.
- Delivery uses a configured country allow-list, a default fee and optional country/city/postal-prefix rules. Tax rules are operator-entered. There are no live courier-rate/booking or statutory-rate lookup services.
- Email/password-reset delivery requires working Resend configuration; no live provider delivery was verified during this repair. Order-email retry permits three attempts per generation in 23 hours, a 60-second claim lease and 5-/10-second backoff. `ORDER_EMAIL_DAILY_LIMIT` counts every attempt (default 10, bounded 1–100) per UTC day. Reconciliation does not reset that quota or send automatically; credentials changing requires provider review. See the [Manager procedure](MANAGER-GUIDE.md#review-and-recover-order-email).
- This repair's browser execution was blocked by the environment. Controlled handler/EJS/native database checks do not certify layout, accessibility, real browser recovery, remote database behavior or live providers. Deployed host behavior, external integrations, legal terms and performance need staging validation. The retained Workers path is not an approved production authentication topology; see [architecture](ARCHITECTURE.md).

## Feature-switch behavior retained from HARDCHECK5

The Manager can disable the optional Stories, wishlist, and search autocomplete features. Their public routes return 404 when disabled; normal product search and the order flow remain accessible. The AI switch is independent and requires an explicit secure server provider setup. Legal pages are information templates, not verified merchant identity or legal compliance.
