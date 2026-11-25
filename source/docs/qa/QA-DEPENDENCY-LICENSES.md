# QA dependency licences and advisory check

Checked 2026-11-14T20:33:27.967885+00:00. This register covers the exact four installed distributions in `tools/qa-python313`, running CPython 3.13.5 on Linux x86_64. Installed metadata and notice texts: SOURCE-CHECKED. Retained copy hashes and installed-version/advisory-input correspondence: VERIFIED. Windows: NOT TESTED.

The product ZIP contains QA scripts and `requirements-qa.txt`. It does not contain these installed wheels, browser binaries, Python/Node runtimes or audit tools. Naming a package in requirements and using a separately installed QA tool do not redistribute the installed package. The notice copies here document the QA sources. If a future release bundles these tools, preserve the complete corresponding licence/copyright/notice texts and review the terms for that actual distribution.

| Installed Python distribution | Version | Actual installed metadata licence | Complete retained installed notices | Status |
| --- | --- | --- | --- | --- |
| greenlet | 3.5.6 | MIT AND PSF-2.0 | [LICENSE](QA-DEPENDENCY-NOTICES/greenlet/greenlet-3.5.6.dist-info/licenses/LICENSE); [LICENSE.PSF](QA-DEPENDENCY-NOTICES/greenlet/greenlet-3.5.6.dist-info/licenses/LICENSE.PSF) | SOURCE-CHECKED |
| playwright | 1.62.0 | Apache-2.0 | [LICENSE](QA-DEPENDENCY-NOTICES/playwright/playwright-1.62.0.dist-info/licenses/LICENSE); [LICENSE](QA-DEPENDENCY-NOTICES/playwright/playwright/driver/LICENSE); [LICENSE](QA-DEPENDENCY-NOTICES/playwright/playwright/driver/package/LICENSE); [NOTICE](QA-DEPENDENCY-NOTICES/playwright/playwright/driver/package/NOTICE); [ThirdPartyNotices.txt](QA-DEPENDENCY-NOTICES/playwright/playwright/driver/package/ThirdPartyNotices.txt); [serverRegistry.js.LICENSE](QA-DEPENDENCY-NOTICES/playwright/playwright/driver/package/lib/serverRegistry.js.LICENSE); [utilsBundle.js.LICENSE](QA-DEPENDENCY-NOTICES/playwright/playwright/driver/package/lib/utilsBundle.js.LICENSE); [webp_codec.LICENSE](QA-DEPENDENCY-NOTICES/playwright/playwright/driver/package/lib/webp_codec.LICENSE) | SOURCE-CHECKED |
| pyee | 13.0.1 | MIT | [LICENSE](QA-DEPENDENCY-NOTICES/pyee/pyee-13.0.1.dist-info/licenses/LICENSE) | SOURCE-CHECKED |
| typing_extensions | 4.16.0 | PSF-2.0 | [LICENSE](QA-DEPENDENCY-NOTICES/typing-extensions/typing_extensions-4.16.0.dist-info/licenses/LICENSE) | SOURCE-CHECKED |

`typing_extensions` is required by pyee. The delivery requirements pin the exact installed and audited version 4.16.0 alongside Playwright 1.62.0, pyee 13.0.1 and greenlet 3.5.6. This fourth pin records the existing environment; it does not change or reinstall it. The original audit-time requirements and final four-pin requirements hashes are recorded separately in the JSON. Optional documentation/test/development extras listed in METADATA are not additional installed distributions in this environment.

Playwright’s top-level metadata declares Apache-2.0. Its wheel also contains a Node driver, Puppeteer attribution, bundled npm notices and a WebP/Emscripten notice. Those bundled components retain their own terms; the whole wheel must not be described as Apache-only. Greenlet’s actual expression is `MIT AND PSF-2.0`: its LICENSE identifies the Stackless-derived platform files governed by LICENSE.PSF, and applies MIT to other files unless noted. This is not an either/or licence choice. Pyee supplies MIT text. Typing Extensions declares PSF-2.0 and ships the complete Python licence-history text, including historical BeOpen/CNRI/CWI terms and the documentation Zero-Clause BSD section; the retained text is complete.

For a redistributed copy, the MIT text requires the copyright and permission notice in copies or substantial portions. Apache-2.0 requires a licence copy and applicable retained attribution/NOTICE information, and changed-file notices for modifications. The supplied PSF text requires its agreement/copyright and a summary of changes in a distributed derivative. Bundled BSD/ISC/other notices have their own conditions. The complete texts linked above govern each component; this summary does not replace them.

## Known-advisory scan

VERIFIED: `pip-audit 2.10.1` queried the PyPI vulnerability service for exactly greenlet 3.5.6, playwright 1.62.0, pyee 13.0.1 and typing-extensions 4.16.0. The scan completed at 2026-11-14T20:27:09.204303+00:00 with exit code 0 and returned no known advisories for those four installed distributions.

```text
/workspace/presale-r27/tools/qa-dependency-audit-tool/bin/python -I -m pip_audit --path /workspace/presale-r27/tools/qa-python313/lib/python3.13/site-packages --vulnerability-service pypi --strict --cache-dir /workspace/presale-r27/evidence/qa-dependency-audit/cache --progress-spinner off --format json --output /workspace/presale-r27/evidence/qa-dependency-audit/pip-audit-qa.json
```

The audit tool was installed in an isolated audit-only environment and is outside both the product and active QA environment. TLS verification stayed enabled with inherited proxy/CA settings. Dated command records, stdout/stderr, the JSON result, audit-tool installer report and rerun script are in `evidence/qa-dependency-audit/` in the release evidence. An initial attempt failed while creating the default cache on a read-only path; the successful command above explicitly places its cache inside the evidence directory. No package upgrade or remediation was applied by this audit.

This is advisory-database matching for the four PyPI versions. The embedded Playwright Node v24.18.1, its npm components, WebP/other binary components, Chromium and system libraries are not covered by pip-audit: their separate advisory scans are NOT TESTED and their known-vulnerability status from this check is UNKNOWN. The result does not establish that software has no undisclosed security defects. Windows execution is NOT TESTED.

## Bundled notices and gaps

All 12 licence/notice files installed by the four wheels were identified from distribution RECORD entries, copied without edits and SHA-256 checked. The [bundled notice register](QA-BUNDLED-NOTICE-REGISTER.md) lists the 91 named npm components in Playwright’s `utilsBundle` sidecar, the repeated 14 `serverRegistry` entries, and 44 named notice blocks in its Node LICENSE. The [machine register](QA-DEPENDENCY-LICENSES.json) retains their source locations, licence summaries and full notice blocks. Named Node notices are not an independently reconstructed compiled-component inventory; component versions and extra source-tree references are UNKNOWN where the installed aggregate does not supply them.

One installed sidecar explicitly says `(no license text found; declared licenses: MIT)` for `proxy-agent-negotiate@1.1.0`. The declaration is SOURCE-CHECKED; its complete notice text is UNKNOWN. The WebP notice supplies libwebp BSD-3-Clause plus a patent grant, and the Emscripten MIT and Illinois/NCSA texts; it mentions musl’s MIT licence but does not supply the separately referenced musl copyright file. That separate text is UNKNOWN. No missing notice is treated as satisfied by assumption.

Actual-source observations for external Chromium, axe-core, Node.js and CPython, plus the unavailable Lighthouse/Gitleaks sources, are in [optional QA tool licences](OPTIONAL-QA-TOOL-LICENSES.md). The actual installed pip-audit LICENSE is [retained](optional-tool-notices/pip-audit--LICENSE) and is Apache-2.0; its own isolated transitive tools are listed in its install report and their full licence/advisory review is NOT TESTED. These audit-only installations do not become product dependencies.

## Source provenance and hashes

Source URLs below are recorded from the actual installed metadata and installer report on the date above. The original wheel archives were not independently downloaded again; their archive hashes are installer provenance. Installed METADATA and notice hashes below were computed from the current installed files. Upstream licence pages were not independently compared over the network.

- [greenlet 3.5.6](https://pypi.org/project/greenlet/3.5.6/): wheel URL and installer archive SHA-256 are recorded in the JSON; upstream project URLs come from installed METADATA.
- [playwright 1.62.0](https://pypi.org/project/playwright/1.62.0/): wheel URL and installer archive SHA-256 are recorded in the JSON; upstream project URLs come from installed METADATA.
- [pyee 13.0.1](https://pypi.org/project/pyee/13.0.1/): wheel URL and installer archive SHA-256 are recorded in the JSON; upstream project URLs come from installed METADATA.
- [typing_extensions 4.16.0](https://pypi.org/project/typing-extensions/4.16.0/): wheel URL and installer archive SHA-256 are recorded in the JSON; upstream project URLs come from installed METADATA.

| Installed metadata | SHA-256 | Retained source |
| --- | --- | --- |
| greenlet 3.5.6 | `b9b4cbbc1f3165e50fbc4696c433fe82b8a151fde65eede28fb6ec5efb3e1fab` | [METADATA](QA-DEPENDENCY-METADATA/greenlet-3.5.6.dist-info/METADATA) |
| playwright 1.62.0 | `a1443e21066f73be70ae0f5c21f6c61a830776104052e281ef5559475377071e` | [METADATA](QA-DEPENDENCY-METADATA/playwright-1.62.0.dist-info/METADATA) |
| pyee 13.0.1 | `7512d063d60cb405124a6c5fdd2c688d78a4c6b6841b8eeb00a59474ef59d43c` | [METADATA](QA-DEPENDENCY-METADATA/pyee-13.0.1.dist-info/METADATA) |
| typing_extensions 4.16.0 | `b05084ca1d50879865178d9fff9fabeab61bdfb1f361bfbde95421ffc8f9be46` | [METADATA](QA-DEPENDENCY-METADATA/typing_extensions-4.16.0.dist-info/METADATA) |

| Installed licence/notice relative path | SHA-256 |
| --- | --- |
| `greenlet-3.5.6.dist-info/licenses/LICENSE` | `769831d6e5dfaf2c20802faccff1fafb4c2025dd8f6253dfa47fcad59d4d0979` |
| `greenlet-3.5.6.dist-info/licenses/LICENSE.PSF` | `e5ff3c23c110e494cd7d736c10fd96d462457bafeca310840db6527298c7d46b` |
| `playwright-1.62.0.dist-info/licenses/LICENSE` | `7fab1461b41970ff376f1c9303a637076bfaaeb71cd12dd3a1c44aaf59a1a2b9` |
| `playwright/driver/LICENSE` | `148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5` |
| `playwright/driver/package/LICENSE` | `45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb` |
| `playwright/driver/package/NOTICE` | `6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d` |
| `playwright/driver/package/ThirdPartyNotices.txt` | `a549d329bad8806fe279f0ecae0fc0270dec7e7c2dc8ec10f90e394f7c32b144` |
| `playwright/driver/package/lib/serverRegistry.js.LICENSE` | `5cf540fe55a2ba9bcf0eb76e739b454faa8581e2f1a0f777602ef0855534302e` |
| `playwright/driver/package/lib/utilsBundle.js.LICENSE` | `57945338cba4878e373646733528017fbe3db1503ec2b431fd30d2a390c70c33` |
| `playwright/driver/package/lib/webp_codec.LICENSE` | `995c7ee35aceb7666829b7a501ca89c0864e12b493c1174b155774ab1e03d831` |
| `pyee-13.0.1.dist-info/licenses/LICENSE` | `1ff556ca206b107f10e1c562ae454d3292e0296c3510eb90eb7f114caee32a66` |
| `typing_extensions-4.16.0.dist-info/licenses/LICENSE` | `3b2f81fe21d181c499c59a256c8e1968455d6689d269aa85373bfb6af41da3bf` |

The JSON register also records the SHA-256 of the audit-time and final four-pin `requirements-qa.txt`, the original install report, each installed RECORD, the audit result and relevant tool metadata. It records original absolute source paths for traceability; those paths are evidence locations, not files required inside the ZIP.
