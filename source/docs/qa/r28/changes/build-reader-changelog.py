"""Build a concise material-fix record with anchors resolved in the actual compared bytes."""
from pathlib import Path
import hashlib, importlib.util, json, sys

sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('inventory', HERE / 'generate-change-inventory.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
inventory = json.loads((HERE / 'CHANGE-INVENTORY.json').read_text())
rehearsal = json.loads((HERE / 'patch-rehearsal.json').read_text())
expected = json.loads((HERE / 'r28-snapshot.json').read_text())
before = module.collect_archive(Path(inventory['baseline_zip']))
root = Path(inventory['current_root'])
if rehearsal['label'] != 'VERIFIED' or rehearsal['r28_snapshot_sha256'] != hashlib.sha256((HERE / 'r28-snapshot.json').read_bytes()).hexdigest() or rehearsal['patch_sha256'] != hashlib.sha256((HERE / 'R27-TO-R28.patch').read_bytes()).hexdigest():
    raise RuntimeError('Successful patch rehearsal must identify this exact snapshot and patch')

def line(name, needle, old=False):
    content = before[name] if old else (root / name).read_bytes()
    if not old and {'sha256': module.digest(content), 'bytes': len(content)} != expected[name]:
        raise RuntimeError('Material anchor file changed after capture: ' + name)
    return next(i for i, text in enumerate(content.decode('utf-8').splitlines(), 1) if needle in text)

# name, exact old/new anchors, observed before/after source behavior, bounded reason.
ROWS = [
('src/server.js', "label: code === 'en'", 'UI_LOCALE_OPTIONS.find', 'The four-language ternary labelled French as Dutch.', 'Resolves the label through the complete locale registry.', 'Keep the Manager branding language label accurate.'),
('src/db.js', 'export async function saveSessionCart', 'export async function mutateSessionCart', 'Concurrent cart writes persisted a middleware snapshot.', 'Applies each intent to the latest persisted cart with revision plus exact-JSON CAS and bounded retries.', 'Preserve competing edits; retry exhaustion returns an explicit 409.'),
('src/db.js', 'export async function saveSessionCart', 'export async function saveSessionCart', 'Every cart save incremented revision and cleared the quote.', 'Skips unchanged state and permits expected revision/JSON guards; coupon clearing has equivalent conditions.', 'Preserve checkout state on unchanged GET and refuse stale cleanup overwrites.'),
('src/db.js', 'export async function createEmailVerificationToken', 'export async function createEmailVerificationToken', 'Cooldown read, previous-token deletion and insertion were separate.', 'Runs issuance in a write transaction.', 'Serialize parallel issuance and preserve the prior token when insertion fails.'),
('src/db.js', 'export async function updateUserPassword', 'export async function updateUserPassword', 'Password update and later route-level session revocation could fail separately.', 'Updates credential, reset state and authenticated/pending-MFA revocation together; can require the expected old hash.', 'Avoid committing a new password while old sessions remain active after a handled failure.'),
('src/db.js', 'export async function updateUserEmail', 'export async function updateUserEmail', 'Manager email update and session revocation could fail separately.', 'Updates the Manager email and revokes other authenticated/pending-MFA sessions transactionally.', 'Retain the current session only when explicitly supplied; stale credentials cannot authorize a second change.'),
('src/server.js', 'if(/unique|constraint/i.test', 'if(/UNIQUE constraint failed:', 'Broad constraint matching could classify unrelated failures as duplicate email.', 'Recognizes the users.email uniqueness error specifically.', 'Return a duplicate-email response only for that actual condition.'),
('src/customer-engagement.js', 'export async function createStockAlert', 'export async function createStockAlert', 'A repeat anonymous request reset confirmed/in-flight alert state to pending.', 'Conflict updates only pending or previously sent alerts.', 'Preserve consent and an active delivery claim.'),
('public/js/retail-2027.js', "drawer.addEventListener('close'", "drawer.addEventListener('close'", 'Drawer close returned focus to its original opener even when mobile navigation had hidden it.', 'Chooses an available navigation control when the opener is hidden.', 'Return keyboard focus to a visible control.'),
('public/css/app.css', '.cart-nav b, .nav-links b', '.cart-nav b, .nav-links b', 'Header count text used the paper color on the accent background.', 'Uses the explicit on-accent text token.', 'Repair the sampled light/dark numeric-count contrast pair; full accessibility conformance is not claimed.'),
('public/css/editorial-2027.css', '.timeline-step.current .timeline-dot', '.timeline-step.current .timeline-dot', 'Current/done order badges used the brand background while numbered text could lack contrast/space.', 'Uses the repaired contrasting badge treatment and dimensions.', 'Keep the sampled numbered order states legible.'),
('public/css/app.css', 'body.is-admin-app .admin-dashboard-table thead', 'body.is-admin-app .admin-dashboard-table thead', 'Narrow-layout table headers used display:none.', 'Visually clips headers while retaining their semantic presence.', 'Preserve table header relationships in responsive layouts.'),
('views/admin/gift-cards.ejs', 'Cards · last 100', 'Cards · last 100', 'Empty state still rendered a data table; column headers had no scope.', 'Empty cards render localized status text; populated cards retain a caption and scoped headers.', 'Describe an empty collection and preserve populated-table relationships.'),
('views/shop.ejs', 'class="shop-results', '<h2 class="sr-only">', 'Product results lacked the inserted section heading.', 'Adds a localized visually hidden Products h2.', 'Make the results section available to heading navigation.'),
('views/partials/header.ejs', 'const localizedTitle =', 'const merchantTitle =', 'Title translation could reinterpret a merchant product/category name as interface text.', 'Preserves actual merchant names and resolves other localized interface titles.', 'Keep merchant text and page identity accurate.'),
('views/shop.ejs', "title:'Shop'", 'categoryInfo.name', 'Category rendering always supplied the generic Shop title.', 'Supplies the category name when available.', 'Identify the category in page metadata.'),
('views/cookies.ejs', '{title:title, description:copy.description}', '{title:copy.title, description:copy.description}', 'The page supplied its outer title rather than its selected localized copy title.', 'Supplies the selected localized title.', 'Keep cookie page title and page language aligned.'),
('src/static-asset-compression.js', 'export function createStaticAssetCompression', 'export function createStaticAssetCompression', 'Two active cold jobs caused additional loads to fall through to identity or 406; only gzip was prepared.', 'Deduplicates a bounded allowlist queue, keeps two active jobs and negotiates gzip/Brotli representations.', 'Serve supported compression through cold concurrency while retaining cache/path/HTTP validators.'),
('scripts/build-design-css.mjs', 'const cssLayers=', 'clean-css', 'Checked source stylesheet existence and preview/runtime references without generating bundles.', 'Serializes five readable authoring sources into two bundles with deterministic hashes and stale-source/cascade guards.', 'Preserve foundation → dynamic theme → polish order; no selector/declaration purge or reordering.'),
('src/services/database-backup.js', 'async function backupSchema', 'async function backupSchema', 'Schema metadata failures were swallowed; pagination assumed rowid.', 'Metadata errors propagate and primary keys order WITHOUT ROWID tables.', 'Fail incomplete publication and preserve supported table rows.'),
('src/services/database-backup.js', 'export async function writeCompressedBackup', 'export async function writeCompressedBackup', 'Output could collide with database/sidecar paths or competing writers; the manual sink could miss asynchronous output errors.', 'Validates typed destinations, uses an exclusive destination lock and a complete stream pipeline.', 'Refuse unsafe publication and propagate handled output failures.'),
('src/services/database-backup.js', 'export async function restoreCompressedBackup', 'export async function restoreCompressedBackup', 'Occupied media could be rejected after schema writes; integrity-query errors were treated as success.', 'Prevalidates media, rechecks empty DB within one transaction, validates integrity/FKs and cleans owned media on handled failure.', 'Roll back local handled failures; DB plus filesystem crash atomicity and ambiguous remote commits remain unproven.'),
('src/bootstrap.js', "await import('dotenv/config')", "await import('./load-environment.js')", 'Bootstrap used dotenv/config defaults.', 'Imports the shared quiet environment loader before the application graph.', 'Prevent dotenv informational/debug output while preserving explicit environment loading choices.'),
('package.json', '"dotenv":', '"dotenv":', 'Pins dotenv16.6.1, EJS6.0.1, rate-limit8.7.3 and TypeScript5.8.3; no clean-css builder.', 'Selects dotenv18.0.10, EJS7.0.2, rate-limit8.7.5, TypeScript6.0.3 and exact clean-css5.3.3 build dependency.', 'Apply investigated compatibility upgrades and retain matching notice/provenance records; no legal clearance implied.'),
('scripts/load-test.mjs', 'const base =', 'export function loadConfiguration', 'Configuration accepted malformed/excessive workloads and request latency ended before complete body consumption.', 'Validates origins/workloads, requires readiness and includes body completion in measured latency.', 'Make the local load tool report the work it actually completes.'),
('qa/run-browser-qa.py', 'def main():', 'PLAYWRIGHT_NODEJS_PATH', 'The selected application Node did not also select the Python Playwright driver Node.', 'Sets the supported driver override, checks the actual running executable and restores the prior setting.', 'Use the supported external Node consistently; this is not a complete tool/browser vulnerability scan.'),
('Dockerfile', 'RUN npm ci', 'RUN --mount=type=secret', 'Install/tests ran as root and development dependencies occupied earlier layers.', 'Sets USER node before install/checks and performs install/build/check/test/audit/prune in one RUN with an optional read-only CA secret.', 'Build/check as the unprivileged user and avoid retained development/cache layers; actual final image evidence is separate.'),
]
ADDED = [
('views/partials/ui-icon.ejs', 'Decorative aria-hidden SVG icons replace symbolic text controls while parent labels retain meaning.', 'Reduce sampled symbol/name ambiguity without claiming voice-control or screen-reader certification.'),
('src/load-environment.js', 'Forces dotenv quiet:true and debug:false before application imports.', 'Keep startup/CLI output quiet while honoring explicit path, encoding and override choices.'),
]
out = ['# R27 → R28 exact change record', '',
    f"VERIFIED — Immutable R27 ZIP SHA-256 `{inventory['baseline_zip_sha256']}` was checked before reading. Comparison captured `{inventory['generated_utc']}` against `{inventory['current_root']}`. This is a source snapshot, not Git history or a final R28 ZIP claim.", '',
    f"VERIFIED — {inventory['baseline_files']} baseline files; {inventory['current_snapshot_files']} current files; {inventory['changed_files']} changed paths: {inventory['counts']['added']} added, {inventory['counts']['modified']} modified, {inventory['counts']['deleted']} deleted. The baseline hash remained unchanged and no included source bytes changed during capture.", '',
    f"VERIFIED — An actual `patch -p1 --batch --forward --fuzz=0 --no-backup-if-mismatch` run in a disposable baseline copy exited {rehearsal['exit_code']}. All {rehearsal['actual_files']} resulting files matched the captured R28 SHA-256/size manifest; zero mismatched paths. See `patch-rehearsal.json` and its transcript.", '',
    '`CHANGE-INVENTORY.json` covers every included changed file and exact line counts with bounded before/after snippets and bounded rationale. `R27-TO-R28.patch` retains the complete text changes. Both snapshot JSON files record every included file hash and size. All changed paths in this captured comparison are reconstructable by the successfully applied text patch.', '',
    'The table records inspected material source differences. It does not claim those conditions were executed by this inventory task; execution evidence and its scope remain in the owning R28 QA reports.', '',
    '| File | R27 exact line / before | R28 exact line / after | Reason and limit |',
    '|---|---|---|---|']
for name, oldneedle, newneedle, oldtext, newtext, why in ROWS:
    oldline, newline = line(name, oldneedle, True), line(name, newneedle)
    out.append(f'| `{name}` | {oldline}: {oldtext} | {newline}: {newtext} | {why} |')
out += ['', '| Added file | R28 exact line / behavior | Reason and limit |', '|---|---|---|']
for name, behavior, why in ADDED:
    if name in before:
        raise RuntimeError('Added-file row existed in baseline: ' + name)
    line(name, '')
    out.append(f'| `{name}` | 1: {behavior} | {why} |')
out += ['',
    'Generated CSS, Cloudflare template output, notice serialization, lockfile records, test changes and release documentation/metadata are included comprehensively in the inventory/patch. Their presence is not treated as a separate manually inferred behavior fix. Per-file default reasons explicitly avoid inventing a distinct rationale.', '',
    'Scope: excludes `docs/qa/r28/` to prevent evidence recursion, installed/build/cache directories listed in the inventory, and refuses private environment/state paths before reading contents. Historical R27 evidence remains part of the delivered baseline/source comparison. Content hashes do not cover file permissions or timestamps.', '',
    'Snapshot limitation: release documents and metadata may still change after capture. Rerun `python generate-change-inventory.py --current /path/to/final/source`, then `python verify-patch.py`, then `python build-reader-changelog.py` after final documentation settles. These helpers write only beside themselves; baseline/source files are never changed. The final packager separately creates checksums, verification metadata and archive evidence.', '',
    'NOT TESTED by this task — Application behavior, full manual semantic review, production/Windows/provider/browser execution, or legal clearance. Successful patch reconstruction verifies the captured bytes only.']
(HERE / 'CHANGELOG-DETAILED.md').write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'VERIFIED: {len(ROWS) + len(ADDED)} material rows resolved against actual baseline/captured source bytes.')
