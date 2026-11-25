"""Read-only exact R26/R27 comparison. Run with Python 3.13 or later."""
from pathlib import Path
import difflib
import hashlib
import json
import datetime

BASE = Path('/workspace/presale-r26-audit/baseline')
CURRENT = Path('/workspace/presale-r27/work')
OUT = Path(__file__).resolve().parent
EXCLUDED = {'.git', 'node_modules', '.cloudflare-build', '.wrangler', '__pycache__'}

def collect(root):
    result = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if any(part in EXCLUDED for part in relative.parts):
            continue
        if relative.parts[:3] == ('docs', 'qa', 'r27'):
            continue
        if path.is_symlink():
            raise RuntimeError('Symlink in audit source: ' + relative.as_posix())
        if not path.is_file():
            continue
        if path.name.lower().startswith('.env') and path.name != '.env.example':
            raise RuntimeError('Private environment file encountered; not read')
        if any(part.lower() in {'data', 'backups', '.venv', 'venv', '.qa-venv', '.qa-tools'} or
               part.lower().startswith('qa-output') for part in relative.parts) or \
                tuple(part.lower() for part in relative.parts[:2]) == ('public', 'uploads'):
            raise RuntimeError('Private state encountered; not read')
        content = path.read_bytes()
        result[relative.as_posix()] = content
    return result

def digest(content):
    return hashlib.sha256(content).hexdigest()

def manifest(content):
    return {name: {'sha256': digest(value), 'bytes': len(value)} for name, value in content.items()}

def snippet(lines):
    selected = lines[:4]
    return {'lines': [line.rstrip('\r\n')[:240] for line in selected],
            'truncated': len(lines) > 4 or any(len(line.rstrip('\r\n')) > 240 for line in selected)}

before = collect(BASE)
after = collect(CURRENT)
records = []
patch = []
for name in sorted(before.keys() | after.keys()):
    old, new = before.get(name), after.get(name)
    if old == new:
        continue
    record = {'file': name, 'change': 'added' if old is None else 'deleted' if new is None else 'modified',
              'before': None if old is None else {'sha256': digest(old), 'bytes': len(old)},
              'after': None if new is None else {'sha256': digest(new), 'bytes': len(new)}}
    try:
        old_lines = (old or b'').decode('utf-8').splitlines(keepends=True)
        new_lines = (new or b'').decode('utf-8').splitlines(keepends=True)
        if b'\0' in (old or b'') or b'\0' in (new or b''):
            raise UnicodeError()
        record['format'] = 'UTF-8 text'
        record['hunks'] = []
        matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == 'equal':
                continue
            record['hunks'].append({'operation': tag, 'before_start_line': i1 + 1,
                                   'before_line_count': i2-i1, 'after_start_line': j1+1,
                                   'after_line_count': j2-j1, 'before': snippet(old_lines[i1:i2]),
                                   'after': snippet(new_lines[j1:j2])})
        for fragment in difflib.unified_diff(old_lines, new_lines,
                     fromfile='a/' + name if old is not None else '/dev/null',
                     tofile='b/' + name if new is not None else '/dev/null', n=3):
            # difflib leaves a final non-newline source line unterminated; GNU patch
            # requires the standard marker before the next hunk/file header.
            patch.append(fragment if fragment.endswith('\n') else fragment+'\n\\ No newline at end of file\n')
    except UnicodeError:
        record['format'] = 'binary; SHA-256/size comparison only'
    records.append(record)

current_at_finish = manifest(collect(CURRENT))
original_manifest = manifest(after)
changed_during_capture = [name for name in sorted(original_manifest.keys() | current_at_finish.keys())
                          if original_manifest.get(name) != current_at_finish.get(name)]
baseline_at_finish = manifest(collect(BASE))
baseline_unchanged = manifest(before) == baseline_at_finish
document = {'label': 'VERIFIED', 'generated_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'comparison': 'Immutable local R26 baseline versus R27 source snapshot; this is not Git history.',
            'baseline_root': str(BASE), 'current_root': str(CURRENT),
            'excluded_directory_names': sorted(EXCLUDED), 'excluded_future_evidence_path': 'docs/qa/r27/',
            'baseline_files': len(before), 'current_snapshot_files': len(after),
            'changed_files': len(records),
            'counts': {kind: sum(record['change'] == kind for record in records)
                       for kind in ('added', 'modified', 'deleted')},
            'baseline_unchanged_during_capture': baseline_unchanged,
            'current_changes_during_capture': changed_during_capture,
            'interpretation': 'Hashes and hunks describe this timestamped snapshot. Later final documentation or metadata changes require a fresh comparison. Snippets are bounded; the companion unified diff retains full text. No claim of individual manual semantic review of every file.',
            'files': records}
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'CHANGE-INVENTORY.json').write_text(json.dumps(document, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
(OUT/'R26-TO-R27.patch').write_text(''.join(patch), encoding='utf-8')
(OUT/'baseline-snapshot.json').write_text(json.dumps(manifest(before), indent=2)+'\n', encoding='utf-8')
(OUT/'r27-snapshot.json').write_text(json.dumps(original_manifest, indent=2)+'\n', encoding='utf-8')
print(json.dumps({key: document[key] for key in ('label','baseline_files','current_snapshot_files','changed_files','counts','baseline_unchanged_during_capture','current_changes_during_capture')}, indent=2))
