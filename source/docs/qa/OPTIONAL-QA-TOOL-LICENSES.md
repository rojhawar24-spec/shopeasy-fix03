# Optional external QA tool licence observations

Checked 2026-11-14T20:26:38.894804+00:00. Status: SOURCE-CHECKED for the installed licence sources below. Windows: NOT TESTED. Advisory scans for these optional tools: NOT TESTED.

| Tool | Observed version | Licence-source finding | Status |
| --- | --- | --- | --- |
| Chromium | 156.0.8078.79 | Chromium files default to BSD-3-clause; numerous bundled third-party licence statements appear in the installed Debian copyright register. Do not treat the whole binary as BSD-only. | SOURCE-CHECKED |
| axe-core | 4.11.0 | MPL-2.0; installed LICENSE-3RD-PARTY.txt also includes MIT and ISC notices for bundled portions. | SOURCE-CHECKED |
| Node.js | v24.22.2 | MIT for Node.js core; complete installed LICENSE includes externally maintained library notices and must not be reduced to MIT-only. | SOURCE-CHECKED |
| CPython | 3.13.5 | Installed Debian copyright includes the Python licence history, PSF terms, incorporated-software acknowledgements and additional file-specific licences. Retain the whole notice rather than PSF terms alone. | SOURCE-CHECKED |
| Lighthouse | UNKNOWN | UNKNOWN: no installed executable/package licence source located in the inspected tool, /tmp, /usr/bin or /opt locations. No licence is inferred. | UNKNOWN |
| Gitleaks | UNKNOWN | UNKNOWN: no installed executable/licence source located in the inspected tool, /tmp, /usr/bin or /opt locations. No licence is inferred. | UNKNOWN |

The product ZIP distributes QA scripts and requirements, not these external runtimes, browser binaries or installed QA tool packages. Merely naming or using a separately installed tool does not redistribute its binary. If a later release embeds these tools, preserve/review each complete corresponding notice and applicable source obligations.

Actual installed notices are retained under `optional-tool-notices/`; their original paths, SHA-256 hashes and source URL provenance are in `OPTIONAL-QA-TOOL-LICENSES.json`. URLs here came from installed source files, and were not remotely retrieved in this optional inspection. Chromium and Node contain third-party components, and their top-level licence must not be used as a claim that every component has that same licence.

Chromium: installed Debian copyright contains a detailed file-by-file licence register. This observation does not reconstruct every shared-system-library dependency or verify exact build-to-source correspondence. CPython similarly has incorporated software notices and file-specific terms. Node’s main LICENSE includes bundled library notices; npm/corepack were outside this optional inventory.

axe-core 4.11.0: `package.json` says MPL-2.0; both `LICENSE` and `LICENSE-3RD-PARTY.txt` were read. The third-party notice lists MIT terms for colorjs.io, core-js-pure, css-selector-parser, doT.js/jQote2 portions, emoji-regex, es6-iterator, es6-promise, event-emitter, is-promise, lru-queue, typedarray and weakmap-polyfill; ISC terms for d, es5-ext, es6-symbol, es6-weak-map, ext, memoizee, next-tick, timers-ext and type.

Lighthouse and Gitleaks: UNKNOWN; no installed licence source or exact installed version was located in this inspection.
