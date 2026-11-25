# Disposable buyer browser QA

Run this workflow from the extracted project root. It creates a fresh, exclusive temporary directory, initializes a synthetic SQLite store, starts the imported application in `NODE_ENV=test` on loopback with an operating-system-selected port, runs Chromium, and removes its temporary directory on exit. It does not need a real account, private browser-state file, `.env`, production database, or an existing `.venv`. Synthetic credentials, session cookies, verification/reset tokens, TOTP secrets and recovery codes remain private and must not appear in reports or screenshots.

Use a fresh extracted source copy. Before copying runtime files, the runner refuses an existing `.env`, populated `data`, `.venv` or `public/uploads` directories, and source symlinks. It inspects only path/directory-entry metadata for this guard and never opens private file contents. Empty directories and `.gitkeep` markers are permitted. The installed `node_modules` dependency directory may use a directory alias; runtime source/assets may not. The runner never deletes existing store data. A separate buyer-created `.qa-venv` remains supported.

The buyer runtime is **Python 3.13**, **Playwright 1.62.0** and **Node.js 24.22.2**. Install application dependencies using the shipped lockfile and QA dependencies using the exact pins in `requirements-qa.txt`. Chromium is either Playwright's matching installed build or an explicitly configured executable. Browser versions other than Playwright's matching build can behave differently.

The runner validates the selected `--node` executable and uses it for both the application fixture and Playwright's Python-to-browser driver through the pinned SDK's supported `PLAYWRIGHT_NODEJS_PATH` setting. It verifies the SDK resolver and the executable of the actual running driver subprocess, recording its version/hash and booleans rather than arguments, environment values or credentials. An earlier inherited driver setting is restored when the runner exits, including on failure. The wheel's separate bundled Node is not selected merely because it is present. This selection is not a vulnerability scan of Chromium, the operating system or every bundled tool component; their documented coverage limits still apply.

## Windows PowerShell 5.1 setup

These are the supported setup instructions; **actual Windows execution is NOT TESTED** in the R27 Linux audit environment. Install Python 3.13 and Node.js 24.22.2 first, then open PowerShell 5.1 in the project root:

```powershell
node --version
py -3.13 --version
npm ci
py -3.13 -m venv .qa-venv
& .\.qa-venv\Scripts\python.exe -m pip install -r requirements-qa.txt
& .\.qa-venv\Scripts\python.exe -m playwright install chromium
npm install --prefix .qa-tools --no-save --ignore-scripts axe-core@4.11.0
& .\.qa-venv\Scripts\python.exe .\qa\run-browser-qa.py --node node --axe-path .\.qa-tools\node_modules\axe-core\axe.min.js --output .\qa-output
```

The runner does not discover or read an application `.venv`. The explicit `.qa-venv` above is a buyer-created QA interpreter environment. PowerShell activation is unnecessary, so the commands do not require changing its execution policy. Keep dependency installation separate from runs so failures are attributable to setup or application behavior.

## Linux/macOS setup

Use Python 3.13 and Node.js 24.22.2. Install any operating-system browser libraries required by Playwright on your machine.

```sh
npm ci
python3.13 -m venv .qa-venv
.qa-venv/bin/python -m pip install -r requirements-qa.txt
.qa-venv/bin/python -m playwright install chromium
npm install --prefix .qa-tools --no-save --ignore-scripts axe-core@4.11.0
.qa-venv/bin/python qa/run-browser-qa.py --node node --axe-path .qa-tools/node_modules/axe-core/axe.min.js --output qa-output
```

macOS execution is also NOT TESTED in the R27 Linux audit environment.

## Configuration and narrower checks

`--help` describes the current CLI. All paths can be relative to the command's working directory or absolute. No private or machine-specific `/tmp` paths are prerequisites.

| Option | Purpose |
| --- | --- |
| `--node PATH` | Node.js executable; defaults to `node` on `PATH`. |
| `--app-root PATH` | Optional application root for checking another source copy; defaults to the extracted project root. Only the documented runtime directories are copied. |
| `--browser-executable PATH` | Optional Chromium executable; omit to use Playwright's installed Chromium. |
| `--axe-path PATH` | Explicit path to the pinned axe-core 4.11.0 `axe.min.js` installed above. |
| `--output PATH` | Public, redacted result directory. Use a separate directory for each retained run. |
| `--suite all` | Default complete workflow. Other choices: `auth`, `commerce`, `public`, `manager`, `security`. Required synthetic prerequisites run automatically. |
| `--locales en,ckb,fr` | Public-route locale matrix. |
| `--widths 390,768,1440` | Public and Manager viewport-width matrix. |
| `--screenshots` | Optional synthetic, non-sensitive page screenshots. No authentication, TOTP, recovery-code or token-bearing page is captured. |
| `--simulated-email` | Exercise verification/reset using the local intercepted provider. This is a simulation and is never evidence of actual inbox delivery. |
| `--cart-drawer` | Enable the disposable fixture's cart-drawer appearance option and add keyboard/focus-return groups at the requested minimum/maximum widths. The default run covers the ordinary appearance configuration. |

The runner requires Node.js **24.22.2** and the exact Python package pins above. `--output` must name a new directory; the default is a timestamped directory under `qa-output`. Each report records runtime versions, runner/fixture/shared-oracle hashes and a hash of its copied application runtime. `application-runtime-manifest.json` records each copied file's SHA-256. The source-copy allowlist is `src`, `views`, `public` (excluding uploads), `generated` and `package.json`; dependency resolution uses the installed application `node_modules`. Private files are never copied or opened.

For example:

```powershell
& .\.qa-venv\Scripts\python.exe .\qa\run-browser-qa.py --suite security --axe-path .\.qa-tools\node_modules\axe-core\axe.min.js --output .\qa-output-security
& .\.qa-venv\Scripts\python.exe .\qa\run-browser-qa.py --suite all --simulated-email --screenshots --axe-path .\.qa-tools\node_modules\axe-core\axe.min.js --output .\qa-output-all
```

The older `verify-*.py` entry points are thin compatibility wrappers around this runner. They no longer accept or require private session JSON, fixed SQLite files, hardcoded seeded row IDs or `/usr/bin/chromium`. They accept the same CLI options, including a caller-selected `--suite`.

## What a run establishes

The synthetic workflow covers pending customer signup, verified login, logout and password change; Manager password authentication with real computed TOTP enrollment and recovery-code replay rejection; variant selection, cart and COD checkout; owned and unauthorized order access; configured public routes, locales and widths; seller-name preservation in quick preview; and Manager page smoke checks. With email disabled, the runner first authenticates its synthetic Manager and approves the pending customer through the actual ownership-confirmation form with a fresh password. It checks that the original pending password cannot sign in, then continues customer checkout using the new credential. No database shortcut activates the customer. This Manager prerequisite also runs for the offline `commerce` suite. With `--simulated-email`, the intercepted verification link opens a read-only form. The runner enters the original registration password and submits the protected confirmation form before signing in; a GET or mail-scanner visit alone cannot activate the account. When an axe path is supplied, commerce also scans the filled cart, filled checkout, COD success and owned order. The shared `qa/login_oracle.py` no-JavaScript Login check requires HTTP 200, the expected localized heading, the Login form/action, required controls and a nonempty CSRF token. An error page or wrong-language page must fail that oracle.

Accessibility results retain both axe `violations` and `incomplete` items, including affected selectors and visible/ARIA label text. The configured rules include WCAG tags plus best-practice rules, including `label-content-name-mismatch`. A violation fails its scan and the run. Incomplete items remain pending manual disposition and are counted separately. An empty violation list does not resolve incomplete items or certify WCAG conformance. Axe is instrumented through Playwright evaluation. A separate browser context with CSP bypass disabled inserts scripts into the DOM and requires actual browser inline/external script blocking and security-policy violation events.

Logout checks replay the prior session cookies in a fresh browser context to establish server revocation. The security suite separately requires a non-cacheable missing-CSRF registration error with a fresh nonempty token and the intended stale-Login recovery redirect with cleared password and preserved safe destination. The checkout restoration probe dispatches a persisted `pageshow` event; actual browser back/forward cache restoration is **NOT TESTED** by that probe.

Failures are reported as failures. A completed route or assertion count is not a claim of 100% application coverage. Historical JSON/screenshots elsewhere in `qa/` remain historical artifacts; they are not proof that the current source ran. Use the new output directory and its run metadata when assessing fresh results.

## Evidence limits

This workflow uses disposable synthetic data and COD. Live inbox delivery, real payment checkout/webhooks/settlement/refunds, production Peppol delivery, provider account ownership, external browsers/devices, full manual contrast review, screen-reader behavior and all WCAG success criteria are **NOT TESTED** by this workflow. Optional intercepted email is explicitly **SIMULATED**, even when verification/reset browser transitions succeed. Application source ownership remains **UNKNOWN**; running QA does not establish ownership or distribution rights.

Do not publish secrets from a debug session, Playwright traces or raw browser storage. The shipped runner intentionally avoids those artifacts. Its temporary fixture is removed after the application exits; an operating-system crash or forced process termination may require ordinary OS temporary-file cleanup.
