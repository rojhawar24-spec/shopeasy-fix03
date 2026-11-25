# Full-site security source review — R25

Date: 10 November 2026. Scope: the supplied ShopEasy source and isolated local tests. No production services, customer accounts or external provider accounts were accessed. This report records this review's evidence; it does not replace deployment-specific testing.

## Findings fixed in this review

| Finding | Evidence before change | Change and validation |
| --- | --- | --- |
| Peppol transport could follow redirects while posting invoice data. | `src/services/peppol-recommand.js`, `requestRecommand()`, used the fetch default redirect policy. Unlike the payment, email and AI adapters, it did not explicitly reject redirects. A 307/308 can forward a POST body, including buyer and bank details. | Set `redirect: 'error'` and reject followed or manual 3xx responses before interpreting results. Mocked-fetch tests verify the exact fixed provider endpoint and redirect policy. No live redirect or data transfer was attempted. |
| Peppol response size was checked after buffering the entire response and counted characters instead of bytes. | The same adapter called `response.text()` before checking `text.length > 200000`; native fetch could buffer an unbounded response first, and multibyte content exceeded the intended byte budget. | Native responses are read as a stream and cancelled above 200,000 bytes; oversized Content-Length is rejected before reading, UTF-8 decoding is strict, and text-only adapters retain a byte-based check. Tests cover cancellation, undeclared oversize, multibyte oversize, split UTF-8, malformed data and valid results. |
| MFA challenge creation failures were mislabeled as invalid credentials in security events. | The Login handler in `src/server.js` calls `recordLoginFailure()` with `mfa_challenge_creation_failed`, but `src/services/security-events.js` omitted that value from its reason allowlist and substituted `invalid_credentials`. | Added the fixed reason to the allowlist. A regression verifies the recorded category and that email, full IP address, password, session ID, MFA seed and recovery code are absent from the emitted event. |

The prior Login stale-CSRF recovery is inherited from R24. It was reviewed and tested as a baseline control, and is not a new R25 finding or fix.

## Coverage and source evidence

The route inventory contained 137 declared GET/POST routes, including 61 `/admin` routes and 36 admin writes, at the time of inspection.

| Area | Source inspected and observed control | Review result |
| --- | --- | --- |
| Privileged authorization | `src/server.js` admin declarations; `src/auth.js` `requireManager()`, `requireDashboardAccess()` and `refreshSessionUser()` | Admin routes other than the overview require Manager. The overview accepts Manager or restricted Admin. Privileged guards refresh the user from the database and require Manager MFA. No missing role guard was found in these declarations. |
| Customer order ownership | `src/server.js` `/account/order/:id`, cancel and return handlers; `/checkout/success` and its actions | Account order access checks `order.user_id === req.user.id`. Success routes require the account owner or the order's guest token before exposing or changing the order. No ownership bypass was found in those inspected handlers. |
| Guest order tracking | `/order-lookup` and `/order/:id/return-request` | Tracking intentionally requires order number and matching checkout email and is rate limited. Return submission checks the matched order/status and, when signed in, its account owner. This is the existing knowledge-based guest-support design; no stronger identity proof was claimed. |
| Session security | `src/auth.js` `attachAuth()`, `login()`, cookie helpers; `src/db.js` `createSession()` and `getSession()` | Random session IDs, CSRF secrets and rotation on Login are present. Production session cookies use Secure, HttpOnly, SameSite=Lax and the `__Host-` name. Session idle and absolute expiry are enforced in database reads. |
| CSRF | `src/server.js` global verification and multipart exceptions; `src/security.js` `verifyCsrf()` | State-changing browser routes pass global CSRF validation. The four multipart Manager upload routes validate after their bounded parser. The Mollie server webhook is the explicit browser-CSRF exemption and independently verifies provider state. Missing/malformed Login tokens remain rejected; stale-form recovery does not replay credentials. |
| Uploads | Multer configuration, upload route guards and `safeImagePath()` in `src/server.js`; `src/image-dimensions.js` and signature checks | Manager authorization precedes upload parsing. File count, bytes, fields, nesting and parts are bounded. Only PNG/JPEG/WebP MIME types with matching signatures and bounded dimensions are accepted; stored names are random. No unrestricted upload path was found. |
| Outbound requests / SSRF | `src/services/ai.js`, `payment-providers.js`, `email.js`, `peppol-recommand.js` | AI production endpoints require an exact provider-host allowlist and HTTPS. Mollie, Resend and Peppol use fixed provider origins. Redirects are rejected across these adapters after the Peppol fix. Seller image URLs are not fetched by an unrestricted backend image proxy. |
| SQL input | Customer/admin filters and representative dynamic SQL in `src/db.js` | Request values are bound as SQL parameters; dynamic catalogue sorting selects from a fixed map. Inspected interpolated condition fragments were code-controlled. No request-driven SQL string injection was found in those paths. |
| Stored/reflected HTML | Raw EJS outputs, category option builders, policy rendering, JSON-LD serializers, public DOM code | Raw category builders escape names/slugs, policy body uses escaped EJS output, and JSON-LD serializers escape script-delimiting characters. Public UI code inspected uses DOM/text operations for untrusted data. No additional stored-XSS sink was identified in the inspected paths. |
| Sensitive caching and crawler exposure | Dynamic response cache middleware in `src/server.js`; private-route metadata in `src/robots-policy.js` and the header template | Session-aware pages use private/no-store. Uploaded catalogue images have separate immutable public caching. Private route crawler metadata is defense in depth and is not used as an authorization control. Case normalization improvements are handled by the parent/SEO review. |
| Local recovery | `src/server.js` `isLocalManagerRecoveryRequest()` | Restricted to development, a local-file database, a loopback TCP peer and loopback Host. It does not trust forwarded addresses for this decision. |
| Case variants | Exact `req.path` special cases for MFA, CSRF, webhook and multipart parsing | No case-based authorization bypass was found. Uppercase variants miss some special-case allowances and fail closed: MFA redirects to its canonical challenge; webhook and multipart variants are rejected by CSRF rather than bypassing it. Global route-case behavior was not changed by this security review. |

## Tests actually run by this review

- `node test/peppol-transport-security.test.js`: 9 tests passed.
- `node test/security-login-failure-logging.test.js`: 4 tests passed, including the new MFA categorization/privacy regression.
- `node --test test/2027-financial-integrations.test.js test/security.test.js test/peppol-transport-security.test.js`: all 3 test files passed.
- The targeted source/security group below passed all 11 test files:

```sh
node --test test/admin-route-authorization-contract.test.js test/security.test.js test/stored-xss-hardening.test.js test/mfa.test.js test/hardcheck6-security-boundaries.test.js test/r19-image-security-and-quality.test.js test/upload-multipart-limits.test.js test/deep-hardening.test.js test/shared-rate-limiter.test.js test/login-csrf-recovery.test.js test/peppol-transport-security.test.js
```

The full-suite and browser evidence for the complete R25 release belongs to the parent review and is reported separately. No live provider delivery, authenticated production scan, network penetration test or production cache inspection was performed here. No additional exploitable authorization, IDOR, SSRF or XSS bypass was found in the paths inspected; that is a scoped finding, not a guarantee about all deployment configurations.
