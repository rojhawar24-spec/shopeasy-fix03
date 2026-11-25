# Final local Lighthouse measurements

VERIFIED — Two executed cold-browser local fixture measurements on14November2026; exact147-file runtime SHA256 `6e7eb2bfe853ad1db7c0ce92dcb47487ff4708b2c37fbd538a609061dfba887d`. Node.js24.22.2, Python3.13.5, Lighthouse13.6.0 and Chromium156.0.8078.79. Each scenario used a new synthetic store/browser profile. [Full metrics and settings](lighthouse-summary.json).

| Scenario | Performance | Accessibility | Best practices | SEO | Transfer bytes | FCP ms | LCP ms | TBT ms | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| home-mobile | 98 | 100 | 100 | 100 | 271,417 | 2013 | 2013 | 0 | 0.0000000 |
| shop-desktop | 100 | 100 | 100 | 100 | 307,267 | 630 | 730 | 0 | 0.0000697 |

VERIFIED — Both reports recorded no failed/partial scored accessibility audit IDs, no audit errors/warnings, no non-fixture network requests, and disposal of private raw telemetry/fixtures. Static compression deliberately permits only two concurrent cold loads; some assets used identity encoding. Different cold-load scheduling changes byte totals, so the earlier run is not an isolated causal performance comparison.

NOT TESTED — Production Core Web Vitals, real customer devices/catalogue/database/CDN/load, repeated-run confidence intervals and complete WCAG compliance. Manual audit requirements remain unresolved. Category scores100 are the observed local Lighthouse scores, not an overall release score, security/legal certification or guaranteed future score. Production Caddy already compresses; no additional production gain is established.
