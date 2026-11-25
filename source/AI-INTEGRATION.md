# Optional AI integration

The webshop core does not depend on AI. The integration is isolated in `src/services/ai.js` and is disabled by default.

## Enable
1. Set `AI_ENABLED=true`.
2. Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in private server environment secrets.
3. In Manager → Settings, turn on **AI shopping assistant**.
4. Review the provider's data-processing terms, retention policy, region and pricing before enabling it for customers.

## Disable
Turn off the Manager switch. The storefront, SQL search, cart, checkout, orders, products and Manager workspace continue to work without AI.

## Data sent to the provider

There are two separate optional AI functions:

- **Full-page catalog search expansion:** sends the submitted search phrase (at most 80 characters) and the selected UI locale. It does not send product rows, customer profiles, orders or payment details. Obvious e-mail addresses, phone-like values, IBAN-like values and recognizable street-address patterns cause the AI expansion to be skipped; ordinary parameterized SQL search still runs.
- **Homepage shopping assistant:** sends the customer's question (at most 500 characters) plus up to 12 public active product fields: name, description, current effective selling price in the store currency, sellable stock after reservations, and product slug. It does not send account IDs, customer addresses, orders, customer phone, payment information, internal purchase costs or reserved-stock counts.

Before assistant prompts are sent, obvious e-mail addresses, phone-like values, IBAN-like values and recognizable street-address patterns are redacted. This is best-effort detection, not a full personal-data detector. Other names, addresses, private facts or sensitive text may still pass through. The customer-facing UI and Manager settings warn customers not to enter personal data. The external provider receives the submitted text and product context under its own terms and retention policy.

## Safety limits

- API credentials never go to the browser.
- The homepage assistant is limited to **3 requests per client IP in each 15-minute window**. AI-assisted catalog-search expansion is separately limited to **3 requests per client IP in each 15-minute window**.
- When the catalog-search AI limit is reached, or its shared rate-limit service is unavailable, the customer still gets ordinary database-backed SQL search; only the AI expansion is skipped. The homepage assistant returns a rate-limit response when its smaller allowance is used up.
- Cloudflare uses the configured Durable Object counter for shared enforcement. Persistent Node production must run as one explicitly configured instance for the in-memory limiter; multiple Node instances require a shared rate-limit backend. IP limits are not a provider-wide monthly spending ceiling, so configure a provider-side usage/spending cap as an additional safeguard.
- Production provider URLs must use HTTPS, a public DNS hostname, no URL credentials and the standard HTTPS port. IP-literal/local/internal hosts are rejected and outbound redirects are not followed. Configure only a provider hostname you control or trust; host DNS is not pinned by this check.
- Both provider requests have an abort timeout.
- Search text is limited to 80 characters; assistant text is limited to 500 characters.
- Provider JSON response bodies are capped at 64 KiB for both features; assistant answer text is further capped at 800 characters.
- AI output is never trusted for price, stock, payment, authorization, discounts or order state.
- AI expansion output is used only as bounded search phrases. The product database remains the source of truth; the app executes parameterized SQL against active products. Normal SQL search remains the fallback if AI is disabled or fails.
- Product descriptions are public catalogue data but may contain Manager-entered text; they are sent to the provider as untrusted data, not executable instructions.

## Remove completely
Delete `src/services/ai.js` and remove unused `AI_*` environment variables from the deployment platform. The server treats the missing module as an optional integration.

## Validation status
Automated tests use a mocked provider. No live external AI provider was called during this QA pass. Test representative English, Dutch, Sorani and Arabic queries, irrelevant queries, rate limits, timeouts, provider retention and cost controls before enabling in production.


### HARDCHECK6: production AI host allow-list

Production AI requests carry an API key and are now allowed only to exact known
AI provider DNS hosts (`api.openai.com`, `openrouter.ai`, `api.groq.com`,
`api.together.xyz`, `api.mistral.ai`) or an operator-approved custom hostname.
For a trusted custom provider, set `AI_ALLOWED_HOSTS=ai.your-provider.example` in
private server environment configuration, never through a public or Manager form.
Comma-separated exact DNS names are supported; wildcard suffixes and IP literals
are rejected. Query-string base URLs are rejected. Development/test URLs remain
usable for local integration tests.

**Important:** hostname allow-listing alone is not DNS rebinding protection.
Keep AI disabled until the deployment operator also restricts outbound traffic
to trusted services with network egress controls, verifies provider billing limits,
and runs a real staging test. This is a reduction in SSRF risk, not a certification.
