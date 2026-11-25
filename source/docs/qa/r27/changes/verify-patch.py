from pathlib import Path
import hashlib,json,shutil,subprocess,tempfile,datetime

HERE=Path(__file__).resolve().parent
BASE=Path('/workspace/presale-r26-audit/baseline')
before=json.loads((HERE/'baseline-snapshot.json').read_text())
expected=json.loads((HERE/'r27-snapshot.json').read_text())
with tempfile.TemporaryDirectory(prefix='shopeasy-change-patch-') as scratch:
    target=Path(scratch)/'source'
    target.mkdir()
    for name in before:
        destination=target/name
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(BASE/name,destination)
    command=['patch','-p1','--batch','--forward','--input',str(HERE/'R26-TO-R27.patch')]
    result=subprocess.run(command,cwd=target,capture_output=True,text=True)
    (HERE/'patch-rehearsal-output.txt').write_text(result.stdout+result.stderr)
    actual={p.relative_to(target).as_posix():{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
            for p in target.rglob('*') if p.is_file()}
    differences=[name for name in sorted(actual.keys()|expected.keys()) if actual.get(name)!=expected.get(name)]
    evidence={'label':'VERIFIED' if result.returncode==0 and not differences else 'UNKNOWN',
              'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'command':command,'exit_code':result.returncode,'actual_files':len(actual),'expected_files':len(expected),
              'baseline_snapshot_sha256':hashlib.sha256((HERE/'baseline-snapshot.json').read_bytes()).hexdigest(),
              'r27_snapshot_sha256':hashlib.sha256((HERE/'r27-snapshot.json').read_bytes()).hexdigest(),
              'patch_sha256':hashlib.sha256((HERE/'R26-TO-R27.patch').read_bytes()).hexdigest(),
              'mismatched_paths':differences,
              'interpretation':'Patch applied only in a disposable baseline copy; resulting every-file SHA-256/byte sizes compared to captured R27 manifest. Source and baseline not modified.'}
    (HERE/'patch-rehearsal.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence,indent=2))
    if differences or result.returncode:
        raise SystemExit(1)
