CURRENT EVIDENCE SCOPE

Authoritative observations: http-seo-results.json.
Source fingerprint: 293fee2e8ab1c51fa3d2e693dbf7ffd46bf7d8ec18066783a46cdd45b7c19ac4 (147 runtime files), matching browser-final-06.

Production runtime: NOT TESTED. The unchanged shipped fixture rejected NODE_ENV=production in its guards before database import. The probe did not bypass that guard. The refusal process used a new private empty temporary runtime and a safe environment, with no existing database or environment file opened.

The separately labelled supported NODE_ENV=test fixture produced 11 HTTP observation groups without launching a browser. It used its own synthetic SQLite database, a configured HTTPS public base and actual loopback HTTP transport. Production Secure-cookie transmission, TLS termination, reverse proxies, HSTS enforcement, live providers and actual inbox delivery remain NOT TESTED. Production cookie policy is identified only as static source review.

Observed test-mode responses include strict root CSP and security headers; a 403 registration CSRF error with private, no-store, max-age=0; flag-only session cookies; public home/shop/product titles, one H1 each, descriptions, canonical and alternate links; valid Organization/Product/BreadcrumbList JSON-LD where present; and valid robots/sitemap endpoints without session cookies. No cookie values, CSRF values, credentials, raw response bodies or private environment/database contents were retained. All temporary runtimes were removed.

Initial private-session observation: initial-private-session-observation.json. That first probe reused the pending-MFA cookie after testing Manager password login. Its subsequent public requests correctly redirected to MFA setup. The authoritative probe uses a fresh guest cookie jar for SEO. Those redirects are evidence of the pending-MFA boundary, not a public storefront defect.

Command:
/workspace/presale-r27/tools/qa-python313/bin/python /workspace/presale-r27/evidence/inspect-production-http-seo.py

Exit code: 0
Console summary: production_runtime_status=NOT TESTED; production_guard_refused=true; test_http_checks=11; failure=null.
