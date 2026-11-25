# Buyer recheck — Windows PowerShell5.1 / Python3.13

NOT TESTED — Actual Windows execution. The commands below are the supplied reproduction procedure; reported successful execution was Linux Node.js 24.22.2/Python 3.13.5. Use a new source extraction, no real `.env`, database or `.venv`. Do not create or select production state.

```powershell
node --version
py -3.13 --version
npm run verify:package
npm ci --ignore-scripts --no-audit --no-fund
npm run build:cloudflare
npm run check
npm run lint
npm run typecheck:core
npm run audit:static
npm run preflight:release
node scripts/template-audit.mjs
npm test
npm audit --json
npm audit --omit=dev --json
npm run licenses:generate
```

VERIFIED — Expected for the unchanged audited source: Node `v24.22.2` (supported24 range), Python3.13.x; integrity `PASS:` with actual checksum/link totals; syntax317 JS/MJS/CJS files; lint317 files/211 imports; core types exit0 with no diagnostic; full suite `tests 1148`, `pass 1148`, `fail 0`, `skipped 0`; both npm audits `vulnerabilities.total:0` at the audit date. Registry advisories may change. Notice output105 package entries/112 texts/zero unresolved/**9 native review gates still open**. Exact original outputs are in the adjacent phase-e1 `.txt` files. Build output is not a production deployment.

For the full disposable browser setup and exact command use [qa/README.md](../../../qa/README.md). The audit used all five locales and widths320,390,768,1440 with `--simulated-email`; append those options to reproduce that matrix. Expected on an equivalent browser/source:191 passed, zero failed, zero axe violations; incompletes remain manual questions and may vary by browser. Browser and package downloads require network. Do not claim Windows passed until these run there.

For a nonmutating full release recheck from another pristine extraction, with a new output path outside the source:

```powershell
.\FINALIZE-AND-VERIFY-WINDOWS.ps1 -OutputDirectory C:\ShopEasy-R27-check-NEW
```

This reruns locked install/all product checks, writes the actual report, creates a new ZIP and validates re-extraction. It rejects existing output/private state. Browser QA is separate. Do not run it after adding `.qa-venv`, QA output, private data or environment configuration to that extraction.

## Browser click checklist — human acceptance pending

NOT TESTED — Complete manual acceptance. On a separate synthetic staging shop:

- Home/Login: desktop/tablet/mobile320px through1440px; en/ckb/ar/nl/fr; light/dark; no overlap, cut-off labels, unintended mixed languages or horizontal page overflow. Inspect hidden menu/dialog states and long seller text.
- Keyboard/screen reader: Tab/Shift+Tab, visible focus, skip links, menu Escape/return focus, cookie dialog, theme announcements, errors, autocomplete and all symbolic controls. Manually resolve every axe incomplete item.
- Customer: register, verify actual inbox email, login/logout, reset/replay refusal, change password, profile/export/delete with correct retention. Repeat stale CSRF and validation-error cases. Verify no data leaks through history/cache.
- Manager: first setup, TOTP enrollment/login, recovery-code single use/replay, password/session revocation, customer access refusal; products/categories/variants/images and sale start/end timezone boundaries.
- Commerce: search/filter/product variants, stock contention, cart, discounts/gift cards, all shipping/tax/currency rules, COD and actual payment sandbox success/cancel/retry/webhooks/refunds; owner-vs-other customer and anonymous guest order/return boundaries.
- Privacy/operations: financial minimization acknowledgement/reference, outstanding return refusal, retained ledger correctness; disposable encrypted backup/restore then business reconciliation before any cutover. Never test deletion on real data.
- SEO/production: canonical hostname/title/H1/schema/robots/sitemap/noindex, HTTPS headers/cookie flags/reverse proxy/cache; actual uptime/load and field performance. Verify policy/controller/cookie/processor text with the actual business.
- Legal/transfer: solicitor verifies ownership/assignments/assets/trademarks/notices/native components, actual effective sale/licence/rebranding terms and applicable privacy/consumer/tax obligations.
