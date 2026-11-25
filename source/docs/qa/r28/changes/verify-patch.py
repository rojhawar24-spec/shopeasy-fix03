"""Apply the complete text patch only in a disposable baseline copy and compare every file."""
from pathlib import Path
import hashlib, importlib.util, json, subprocess, tempfile, datetime, sys

sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('inventory', HERE / 'generate-change-inventory.py')
inventory_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory_module)
inventory = json.loads((HERE / 'CHANGE-INVENTORY.json').read_text())
before = json.loads((HERE / 'baseline-snapshot.json').read_text())
expected = json.loads((HERE / 'r28-snapshot.json').read_text())
baseline = inventory_module.collect_archive(Path(inventory['baseline_zip']))
if inventory_module.manifest(baseline) != before:
    raise RuntimeError('Baseline bytes do not match captured manifest')
with tempfile.TemporaryDirectory(prefix='patch-rehearsal-', dir=HERE) as scratch:
    target = Path(scratch) / 'source'
    target.mkdir()
    for name, content in baseline.items():
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    command = ['patch', '-p1', '--batch', '--forward', '--fuzz=0', '--no-backup-if-mismatch', '--input', str(HERE / 'R27-TO-R28.patch')]
    result = subprocess.run(command, cwd=target, capture_output=True, text=True)
    (HERE / 'patch-rehearsal-output.txt').write_text(result.stdout + result.stderr)
    actual = {p.relative_to(target).as_posix(): {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size}
              for p in target.rglob('*') if p.is_file()}
    differences = [n for n in sorted(actual.keys() | expected.keys()) if actual.get(n) != expected.get(n)]
    evidence = {'label': 'VERIFIED' if result.returncode == 0 and not differences else 'UNKNOWN',
        'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'command': command,
        'exit_code': result.returncode, 'actual_files': len(actual), 'expected_files': len(expected),
        'baseline_zip_sha256': inventory['baseline_zip_sha256'],
        'baseline_snapshot_sha256': hashlib.sha256((HERE / 'baseline-snapshot.json').read_bytes()).hexdigest(),
        'r28_snapshot_sha256': hashlib.sha256((HERE / 'r28-snapshot.json').read_bytes()).hexdigest(),
        'patch_sha256': hashlib.sha256((HERE / 'R27-TO-R28.patch').read_bytes()).hexdigest(),
        'mismatched_paths': differences,
        'interpretation': 'Actual patch applied in a disposable source copy under the output directory; every resulting file SHA-256 and byte size compared to captured R28 manifest. Original ZIP and working source not written. This proves patch reconstruction of captured included bytes, not application correctness or final archive identity.'}
    (HERE / 'patch-rehearsal.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))
    if differences or result.returncode:
        raise SystemExit(1)
