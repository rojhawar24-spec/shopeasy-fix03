from pathlib import Path
import json
import hashlib

HERE=Path(__file__).resolve().parent
OLD=Path('/workspace/presale-r26-audit/baseline')
NEW=Path('/workspace/presale-r27/work')

def line(root,name,needle):
    lines=(root/name).read_text(encoding='utf-8').splitlines()
    return next(i for i,text in enumerate(lines,1) if needle in text)

rows=[
('src/server.js',"app.post('/order-lookup'","app.post('/order-lookup'",'Lookup/return routes used order/email lookup without the new owner/bearer helper.','Routes check authenticated ownership or guest bearer proof; POSTed private code is allowed.','Protect order details and return requests from possession of an order number/email alone.'),
('src/security.js','export const isStrongEnoughPassword','export function isStrongEnoughPassword','Accepted any string of 8–200 characters.','New/set/reset policy requires at least 15 trimmed Unicode characters, maximum 200 UTF-16 code units and rejects a bounded offline common/repetition list.','Strengthen newly chosen passwords while preserving existing-password sign-in; no full breached-password service is claimed.'),
('src/db.js','const variantTableSchema','const variantTableSchema','Legacy variant rebuild could swallow an exception after another schema check.','Rechecks schema while holding the write lock, accepts explicitly recognized completed migration, otherwise rolls back and rethrows.','Fail startup on a genuine migration failure and handle a concurrent completed upgrade explicitly.'),
('src/db.js','export async function createCategory','export async function createCategory','Parent validation and mutation were separate operations.','Parent validation and create/update run in one write transaction; recursive descendant queries terminate legacy cycles.','Serialize category reparenting checks and prevent indefinite traversal.'),
('src/db.js','const inWindow =','// Legacy SQLite timestamps','Sale-window comparisons used raw timestamp strings.','JavaScript parses legacy UTC timestamps and SQL uses julianday with one bound catalogue instant.','Make display/filter sale decisions agree across timestamps with offsets and legacy SQLite date strings.'),
('src/db.js','export async function deleteGdprCustomerData','export async function deleteGdprCustomerData','One deletion mode had no explicit financial-retention minimization workflow.','Default mode refuses financial-ledger deletion; a separately acknowledged minimization mode requires Manager identity and policy reference, preserves financial rows, rejects open orders/returns and clears selected customer/access fields.','Avoid destroying financial history. This is minimization, not anonymity or a legal-compliance finding.'),
('src/database.js',"if (/^file:/i.test(url)) fs.mkdirSync",'const config=expandConfig','A configured local file URL still caused root/data directory creation.','Uses the driver’s expanded file configuration to create the actual decoded parent; in-memory databases skip filesystem setup.','Keep explicit disposable/test database paths from creating source-root state.'),
('src/services/database-backup.js','function encodeValue','function encodeValue','BLOB encoding recognized Uint8Array/Buffer, but not the driver’s ArrayBuffer return type.','Encodes ArrayBuffer and all ArrayBuffer views with byte offsets and rejects unsupported objects.','Preserve real libSQL binary column contents in encrypted backup/restore.'),
('public/js/app.js',"document.querySelectorAll('[data-submit-once]')","document.querySelectorAll('[data-submit-once]')",'Submit-once controls were disabled without the new cancelled-submit/history restore handling.','Ignores cancelled/invalid submission, saves original child nodes and restores state after prevented submits or persisted pageshow.','Keep forms usable after cancellation/history navigation without automatically resubmitting.'),
('public/js/app.js',"nav.classList.toggle('open'","nav.classList.toggle('is-open'",'Mobile navigation JavaScript toggled open, while the mobile CSS display rules required is-open; aria-expanded could change without revealing the menu.','Toggles is-open consistently, focuses the first available link/button when opening, and closes/restores focus to the toggle on Escape when focus is in the menu or on its toggle.','Make narrow-screen navigation visible and keyboard-operable, with accessible state and focus matching the open state.'),
('public/css/app.css','.nav-category-menu:hover','.nav-category-menu.open .nav-category-panel','Hover/focus could reveal the category panel while aria-expanded remained false; the narrow-screen rule forced the panel visible.','The panel is hidden by default and shown by the same explicit open class that JavaScript synchronizes with aria-expanded. Category Escape restores focus to its trigger without also closing the outer navigation.','Use an explicit click/Enter/Space disclosure instead of automatic hover opening, and keep visibility, accessible state and nested Escape behavior consistent.'),
('test/sale-readiness.test.js',"const css = read('test/fixtures/legacy-css/style.css');","const css = read('public/css/app.css');",'The navigation source contract read obsolete fixture CSS and accepted the open class, concealing disagreement with current CSS.','Reads current production CSS, requires JavaScript to toggle is-open, and requires display:flex open rules at both current mobile/tablet breakpoints.','Make the contract inspect shipped styles; the independent browser navigation groups additionally exercise actual visible/focus behavior.'),
('public/js/i18n.js','const skip =','const skip =','Nested translated attributes did not consistently honor seller-text protection.','Text and descendant-attribute translation honor data-no-translate/contenteditable ancestry.','Preserve seller product/category names and accessible text during language changes.'),
('views/partials/product-card.ejs','<article','<article','Product actions used overriding accessible labels and the badge group was inside an image link.','Actions expose visible localized text plus protected product context; badges are outside the link and product image alternative is protected.','Align visible/accessible action names and preserve seller text.'),
('public/css/app.css','.order-total-box {','.order-total-box {','Order-total descendants inherited colors unsuitable for the dark total panel.','Uses an explicit white on-brand token for total-panel text, plus narrow-screen layout corrections.','Improve contrast and remove measured 320px layout overflow; this does not establish full WCAG conformance.'),
('package.json','"start:prod"','"start:prod"','Production command used shell-specific environment assignment.','Calls the shipped Node startup wrapper, which sets NODE_ENV before bootstrap import.','Make intended production-mode selection portable across npm shells; actual Windows execution remains NOT TESTED.'),
('package.json','"test"','"test"','Default test command did not provide the new isolated worker database preloader.','Calls run-tests.mjs; workers receive private temporary default database paths and allowlisted environment.','Keep fixture writes out of source-root/default application state.'),
('scripts/verify-release-files.mjs','const prohibitedDirectories','const prohibitedDirectories','The release checks did not cover the newly documented private QA interpreter/tool directories and QA output prefixes.','The source collector and offline verifier refuse .qa-venv, .qa-tools and qa-output-prefixed directories; the existing finalizer contract also exercises four added synthetic private-path cases.','Prevent buyer-created QA environments or synthetic browser output from entering a source release; retain the previous refusal of application private state.'),
]
inventory=json.loads((HERE/'CHANGE-INVENTORY.json').read_text())
rehearsal=json.loads((HERE/'patch-rehearsal.json').read_text())
if rehearsal['exit_code'] != 0 or rehearsal['mismatched_paths']:
    raise RuntimeError('Patch rehearsal must match the current captured inventory before building the changelog.')
if rehearsal['expected_files'] != inventory['current_snapshot_files']:
    raise RuntimeError('Patch rehearsal is stale for the current inventory.')
if rehearsal.get('r27_snapshot_sha256') != hashlib.sha256((HERE/'r27-snapshot.json').read_bytes()).hexdigest():
    raise RuntimeError('Patch rehearsal must identify this exact current snapshot.')
out=['# R26 → R27 exact change record','',
     'VERIFIED — Read-only byte/line comparison of the immutable local R26 baseline and the captured R27 source. This is not a Git-history claim. See `CHANGE-INVENTORY.json` for every changed file and bounded before/after snippets; `R26-TO-R27.patch` contains the full unified text diff. Binary changes have hashes and sizes.','',
     f"VERIFIED — Snapshot: {inventory['baseline_files']} R26 files; {inventory['current_snapshot_files']} R27 files; {inventory['changed_files']} changed paths ({inventory['counts']['added']} added, {inventory['counts']['modified']} modified, {inventory['counts']['deleted']} deleted). No baseline or current snapshot files changed during capture. Excludes installed/build/cache directories and future `docs/qa/r27/` evidence integration.",'',
     f"VERIFIED — `patch-rehearsal.json` records a real `patch -p1 --batch --forward` run in a disposable baseline copy: exit {rehearsal['exit_code']}, {rehearsal['actual_files']} resulting files and zero SHA-256/size differences against the captured R27 snapshot. Neither source tree was changed. The companion transcript is `patch-rehearsal-output.txt`.",'',
     'VERIFIED — This is the captured working-source comparison, not a reconstruction of the final ZIP. The final packager separately adds `FINAL-VERIFICATION-REPORT.json`, regenerates `SHA256SUMS.txt` and includes the assembled evidence directory. External `CONTENTS.json` and final archive/checksum evidence identify the delivered bytes.','',
     'The table records material behavior changes. `Before` lines refer to R26; `After` lines refer to the captured R27. It records inspected code differences, not a claim that every condition was exercised. Actual execution evidence belongs in the final QA report.','',
     '| File | Before: exact line and behavior | After: exact line and behavior | Reason / limit |',
     '|---|---|---|---|']
for name,oldneedle,newneedle,before,after,why in rows:
    oi=line(OLD,name,oldneedle)
    ni=line(NEW,name,newneedle)
    out.append(f'| `{name}` | R26:{oi}: {before} | R27:{ni}: {after} | {why} |')

newfiles=[
('src/static-asset-compression.js','export function createStaticAssetCompression','Direct-Node flat allowlisted public CSS/JS assets receive negotiated gzip with variant ETags, identity/Range behavior and bounded cache/read/compression limits.','Preserve decoded content while reducing transfer size; not applied to private HTML/error/form responses.'),
('scripts/verify-and-package.mjs',"run('Input archive integrity'",'Creates an isolated stage, verifies input, runs locked install/checks/full tests/advisories/notices, regenerates checksums, creates/re-extracts the ZIP and records its real SHA-256/inventory.','Reject incomplete/private/unsafe release input and make acceptance reviewable; Linux execution is separate from Windows validation.'),
('scripts/run-tests.mjs','const directory=fs.mkdtempSync','Creates and cleans a private per-run root, removes application credentials and preloads per-worker database isolation.','Prevent a repeated test run from mutating the source/default application database.'),
('qa/fixture-server.mjs','', 'Creates a temporary synthetic browser fixture and private protocol rather than using the operator database.','Allow reproducible browser QA with explicit simulated email/provider limits.'),
('qa/run-browser-qa.py','def navigation_keyboard','The shipped disposable browser runner adds six actual navigation groups for EN/CKB at the requested narrow/tablet/desktop widths, checks visible disclosure state and nested/outer Escape/focus, and requires actual no-store/noindex on localized Login responses.','Catch the class/CSS mismatch and accessible-state regressions with browser observations rather than only source-string assertions; screen-reader and complete manual WCAG review remain NOT TESTED.'),
('vendor/promise-limit/index.cjs','', 'New first-party FIFO task limiter is installed through the promise-limit dependency alias; actual package identity is @shopeasy/task-limit@1.0.0.','Replace uncollected external promise-limit source; compatibility scope is documented. Effective whole-product commercial rights and buyer grant remain UNKNOWN; metadata is UNLICENSED.'),
('scripts/export-schema-reference.mjs','', 'Exports a fresh disposable schema reference.','Provide buyer-visible database structure without reading an operator database.'),
]
out += ['', '| Added file | After: exact line and behavior | Reason / limit |','|---|---|---|']
for name,needle,after,why in newfiles:
    ni=line(NEW,name,needle) if needle else 1
    out.append(f'| `{name}` | R27:{ni}: {after} | {why} |')
out += ['', 'UNKNOWN — Ownership and effective commercial assignment for first-party source/assets; this comparison cannot establish title. Native bundled-component legal gates and QA-tool notice exceptions remain in their respective registers.', '',
        'NOT TESTED — Every file receiving individual manual semantic review, all browser/device/accessibility states, live providers, production/offsite recovery, Windows PowerShell 5.1 and unavailable Git history.', '',
        'VERIFIED — Reproduction generator: `generate-change-inventory.py`; the snapshot JSON files identify all included bytes. Regenerate this record after any additional final source/documentation edits. The generator writes only to its own output directory.']
(HERE/'CHANGELOG-DETAILED.md').write_text('\n'.join(out)+'\n',encoding='utf-8')
print('VERIFIED: material changelog anchors found in both actual snapshots; '+str(len(rows)+len(newfiles))+' rows written.')
