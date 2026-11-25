# Frozen-source local Lighthouse evidence

Application 2.8.95; six successful runs, exit 0; runtime 152 files, SHA-256 `a67cac89b7c84263d456b3b2b071550d137bb009d4c8f0631c2c8da2bcf1fd81`. All six manifests equal the final source manifest.

Tools: Node v24.22.2, Python 3.13.5, Chromium Chromium 156.0.8078.79 built on Debian GNU/Linux 13 (trixie), Lighthouse 13.6.0.

Values below are median [minimum–maximum], n=3 per scenario. Times are milliseconds; bytes are transferred bytes.

| Scenario | Performance | Accessibility | Best practices | SEO | FCP ms | LCP ms | TBT ms | CLS | Bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| home-mobile | 99 [99–99] | 100 [100–100] | 100 [100–100] | 100 [100–100] | 1561.76 [1531.33–1573.42] | 1573.42 [1561.76–1831.33] | 3 [0–12] | 0 [0–4.82693e-05] | 141068 [141068–141068] |
| shop-desktop | 100 [100–100] | 100 [100–100] | 100 [100–100] | 100 [100–100] | 477.388 [452.038–518.309] | 574.429 [525.048–624.463] | 0 [0–0] | 0 [0–0] | 144876 [144876–144876] |

All six observed nonfixture HTTP(S) request counts were zero. Public CSS/JS transfer bytes, cache headers, per-run commands, exits, fingerprints, and cleanup proofs are in `final-lighthouse-summary.json`; per-run manifests are in `repeat-1` through `repeat-3`.

## Limits

- Three repeats per scenario are descriptive measurements on one local machine. No confidence interval or guarantee is established; this sample does not establish field Core Web Vitals.
- Synthetic catalogue, disposable local SQLite, loopback network, direct Node NODE_ENV=test, and Lighthouse simulated throttling. Production hosting, CDN, remote database, real customer devices, and real catalogue were not measured.
- Each run used a new synthetic fixture, new browser profile, and default Lighthouse storage reset. Retained cache response headers were probed for public CSS/JS only after the measured run; no warm-cache hit claim is made.
- Public cache-header probes used urllib default identity encoding after measurement. Their Content-Length is unencoded response length; Lighthouse transferSize is the measured wire-transfer value. All retained CSS/JS cache observations were none and Cache-Control was public, max-age=0.
- HTTPS requests were blocked by Lighthouse. Observed HTTP(S) requests were compared with the exact fixture host/port, and all six observed nonfixture request counts were zero. This is an observation of these runs, not a universal egress proof.
- Accessibility and best-practices category scores, including any 100, are automated checks and do not certify WCAG conformance, security, or the application overall.
- No raw Lighthouse report, screenshot, browser profile, private database, keys, or logs are retained. Only allowlisted measurements, audit identifiers, commands with ephemeral paths redacted, and public CSS/JS transfers/headers are retained.
- One earlier sandbox-blocked fixture startup is retained separately under startup-blocked. It failed before a browser or Lighthouse measurement, and is excluded from the six successful runs.
