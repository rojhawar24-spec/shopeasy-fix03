"""Exact, read-only R27 ZIP -> R28 source inventory; output stays beside this script."""
from pathlib import Path, PurePosixPath
import argparse, datetime, difflib, hashlib, json, os, stat, zipfile

HERE = Path(__file__).resolve().parent
DEFAULT_ARCHIVE = Path('/workspace/delivery/ShopEasy-R27-2026-11-15/ShopEasy-2.8.94-technical-checks.zip')
ARCHIVE_SHA256 = 'ba433a2c7dffb30bf8a404f01f0c461351e575cf9a2bebab060d3f26e031594b'
EXCLUDED = {'.git', 'node_modules', 'build', 'dist', '.cloudflare-build', '.wrangler', '__pycache__'}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def included(name):
    parts = PurePosixPath(name).parts
    if any(p in EXCLUDED for p in parts) or parts[:3] == ('docs', 'qa', 'r28'):
        return False
    if not parts or PurePosixPath(name).is_absolute() or '..' in parts or '\\' in name:
        raise RuntimeError('Unsafe path: ' + name)
    if any(p.lower() in {'data', 'backups', '.venv', 'venv', '.qa-venv', '.qa-tools'} or
           p.lower().startswith('qa-output') for p in parts) or tuple(p.lower() for p in parts[:2]) == ('public', 'uploads'):
        raise RuntimeError('Private state encountered; contents not read: ' + name)
    if parts[-1].lower().startswith('.env') and parts[-1] != '.env.example':
        raise RuntimeError('Private environment file encountered; contents not read: ' + name)
    return True

def collect_archive(archive):
    if digest(archive.read_bytes()) != ARCHIVE_SHA256:
        raise RuntimeError('Immutable baseline ZIP hash mismatch')
    result = {}
    with zipfile.ZipFile(archive) as source:
        for item in source.infolist():
            if item.is_dir() or not included(item.filename):
                continue
            if stat.S_ISLNK(item.external_attr >> 16):
                raise RuntimeError('Archive symlink refused: ' + item.filename)
            if item.filename in result:
                raise RuntimeError('Duplicate ZIP member: ' + item.filename)
            result[item.filename] = source.read(item)
    return dict(sorted(result.items()))

def collect(root):
    result = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        relative = Path(directory).relative_to(root)
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED and
                         (relative / d).as_posix() != 'docs/qa/r28')
        for d in dirs:
            if (Path(directory) / d).is_symlink():
                raise RuntimeError('Source symlink refused: ' + str(relative / d))
        for filename in sorted(files):
            path = Path(directory) / filename
            name = path.relative_to(root).as_posix()
            if not included(name):
                continue
            if path.is_symlink():
                raise RuntimeError('Source symlink refused: ' + name)
            result[name] = path.read_bytes()
    return dict(sorted(result.items()))

def manifest(content):
    return {name: {'sha256': digest(value), 'bytes': len(value)} for name, value in content.items()}

def snippet(lines):
    selected = lines[:4]
    return {'lines': [line.rstrip('\r\n')[:240] for line in selected],
            'truncated': len(lines) > 4 or any(len(line.rstrip('\r\n')) > 240 for line in selected)}

def reason(name):
    exact = {
        'src/db.js': 'Atomic cart intents/CAS, no-op preservation, transactional verification issuance and credential/session revocation; see backend report and material changelog.',
        'src/server.js': 'Use atomic cart/credential helpers, preserve unchanged cart state, complete locale labels and pass localized page metadata; inspect each full hunk.',
        'src/customer-engagement.js': 'Preserve confirmed/in-flight stock-alert consent when anonymous requests repeat.',
        'src/static-asset-compression.js': 'Bound and deduplicate cold compression work; add compiled assets and Brotli representation negotiation.',
        'src/services/database-backup.js': 'Validate destinations, serialize publication, propagate stream/schema errors and support WITHOUT ROWID pagination.',
        'src/services/database-restore.js': 'Prevalidate media and enforce transactional restore with integrity/foreign-key failure refusal.',
        'Dockerfile': 'Run checks as node, preserve TLS with optional CA input, and install/check/prune within one layer; final runtime validation is separate evidence.',
        'scripts/load-test.mjs': 'Validate workloads/origins and measure complete response bodies, preserving failed-response counters.',
        'scripts/build-design-css.mjs': 'Deterministically serialize preserved CSS sources into two runtime bundles with cascade/staleness guards.',
        'src/load-environment.js': 'Load dotenv before imports while forcing quiet/debug-off startup and preserving explicit path/encoding/override choices.',
        'qa/run-browser-qa.py': 'Use supported external Playwright Node selection and verify the actual running driver; extend observed behavior checks.',
        'views/partials/ui-icon.ejs': 'Render decorative SVG icons with accessible parent-control labels.',
    }
    if name in exact:
        return exact[name]
    if name in {'package.json', 'package-lock.json'}:
        return 'Record selected dependency upgrades/build dependencies and R28 scripts/version metadata; exact versions are in the full diff.'
    if name.startswith('third-party/') or 'NOTICES.generated' in name:
        return 'Retain exact dependency notice/provenance updates; this inventory does not infer legal clearance.'
    if name.startswith('generated/') or name in {'public/css/design-foundation.min.css', 'public/css/design-polish.min.css'}:
        return 'Generated output corresponding to integrated source/build inputs; no independent manual rationale inferred for serialized bytes.'
    if name.startswith('test/'):
        return 'Regression/contract changes accompanying integrated behavior; exact assertions are retained in the full patch; execution status belongs to QA evidence.'
    if name.startswith('views/') or name.startswith('public/css/') or name.startswith('public/js/'):
        return 'Integrated template/style/client changes cover accessibility, theme/focus/headings/tables, metadata and CSS runtime wiring; individual hunks retain exact text.'
    return 'Exact content change recorded; no additional per-file semantic rationale inferred automatically. See material changelog or owning report where applicable.'

def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--current', type=Path, default=Path('/workspace/presale-r28/work'))
    parser.add_argument('--baseline-zip', type=Path, default=DEFAULT_ARCHIVE)
    return parser.parse_args()

def main():
    args = arguments()
    before, after = collect_archive(args.baseline_zip), collect(args.current)
    records, patch = [], []
    for name in sorted(before.keys() | after.keys()):
        old, new = before.get(name), after.get(name)
        if old == new:
            continue
        record = {'file': name, 'change': 'added' if old is None else 'deleted' if new is None else 'modified',
                  'before': None if old is None else {'sha256': digest(old), 'bytes': len(old)},
                  'after': None if new is None else {'sha256': digest(new), 'bytes': len(new)},
                  'reason': reason(name)}
        try:
            old_lines = (old or b'').decode('utf-8').splitlines(keepends=True)
            new_lines = (new or b'').decode('utf-8').splitlines(keepends=True)
            if b'\0' in (old or b'') or b'\0' in (new or b''):
                raise UnicodeError()
            record['format'], record['hunks'] = 'UTF-8 text', []
            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False).get_opcodes():
                if tag != 'equal':
                    record['hunks'].append({'operation': tag, 'before_start_line': i1 + 1,
                        'before_line_count': i2 - i1, 'after_start_line': j1 + 1, 'after_line_count': j2 - j1,
                        'before': snippet(old_lines[i1:i2]), 'after': snippet(new_lines[j1:j2])})
            fragments = list(difflib.unified_diff(old_lines, new_lines,
                fromfile='a/' + name if old is not None else '/dev/null',
                tofile='b/' + name if new is not None else '/dev/null', n=3))
            for fragment in fragments:
                patch.append(fragment if fragment.endswith('\n') else fragment + '\n\\ No newline at end of file\n')
            if not fragments:
                record['patch_limitation'] = 'Empty-file existence change: byte inventory only; rehearsal must flag unless handled explicitly.'
        except UnicodeError:
            record['format'] = 'binary; SHA-256/size comparison only'
        records.append(record)
    original_manifest = manifest(after)
    final_manifest = manifest(collect(args.current))
    changed = [n for n in sorted(original_manifest.keys() | final_manifest.keys()) if original_manifest.get(n) != final_manifest.get(n)]
    baseline_unchanged = digest(args.baseline_zip.read_bytes()) == ARCHIVE_SHA256
    document = {'label': 'VERIFIED' if not changed and baseline_unchanged else 'UNKNOWN',
        'generated_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'comparison': 'Hash-checked immutable delivered R27 ZIP versus timestamped R28 working source; not Git history or final packaged ZIP.',
        'baseline_zip': str(args.baseline_zip.resolve()), 'baseline_zip_sha256': ARCHIVE_SHA256,
        'current_root': str(args.current.resolve()), 'excluded_directory_names': sorted(EXCLUDED),
        'excluded_future_evidence_path': 'docs/qa/r28/', 'baseline_files': len(before),
        'current_snapshot_files': len(after), 'changed_files': len(records),
        'counts': {kind: sum(r['change'] == kind for r in records) for kind in ('added', 'modified', 'deleted')},
        'baseline_unchanged_during_capture': baseline_unchanged, 'current_changes_during_capture': changed,
        'interpretation': 'Complete included file inventories/hashes and changed UTF-8 hunks. Snippets are bounded; full patch retains text. Generated output rationale is not independently inferred. Later documentation/metadata changes require rerun; excludes future R28 QA evidence to avoid recursion. File mode/timestamp changes are outside byte/line scope.',
        'files': records}
    HERE.mkdir(parents=True, exist_ok=True)
    (HERE / 'CHANGE-INVENTORY.json').write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
    (HERE / 'R27-TO-R28.patch').write_bytes(''.join(patch).encode('utf-8'))
    (HERE / 'baseline-snapshot.json').write_text(json.dumps(manifest(before), indent=2) + '\n')
    (HERE / 'r28-snapshot.json').write_text(json.dumps(original_manifest, indent=2) + '\n')
    print(json.dumps({k: document[k] for k in ('label', 'baseline_files', 'current_snapshot_files', 'changed_files', 'counts', 'baseline_unchanged_during_capture', 'current_changes_during_capture')}, indent=2))
    if changed or not baseline_unchanged:
        raise SystemExit('Source changed during snapshot; rerun after edits settle')

if __name__ == '__main__':
    main()
