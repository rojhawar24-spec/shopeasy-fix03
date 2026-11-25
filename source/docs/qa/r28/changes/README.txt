R27 -> R28 byte/line comparison and actual patch rehearsal

Reproduce after final source/documentation edits:
  python generate-change-inventory.py --current /workspace/presale-r28/work
  python verify-patch.py
  python build-reader-changelog.py

The generator reads the immutable delivered R27 ZIP directly and refuses a
SHA-256 mismatch. --baseline-zip may relocate the same exact archive; its
expected identity remains pinned in the script. All outputs and disposable
patch rehearsal files stay beside these helpers. No product fix/test is run.

docs/qa/r28 is intentionally excluded to prevent evidence self-recursion.
Installed/build/cache folders are excluded; private state/environment paths
are refused before contents are read. All historical R27 evidence is retained
in the comparison if present in the delivered ZIP and current source.

CHANGELOG-DETAILED.md: concise inspected material differences with actual lines.
CHANGE-INVENTORY.json: comprehensive changed-path hashes/hunks/snippets/reasons.
R27-TO-R28.patch: complete unified text diff of this captured comparison.
baseline-snapshot.json / r28-snapshot.json: all included SHA-256/byte sizes.
patch-rehearsal.json / patch-rehearsal-output.txt: actual disposable apply and
every-file equality result. This is source reconstruction, not QA acceptance.

The helpers deliberately report a patch failure if future binary or empty-file
existence changes cannot be reconstructed by this text patch. The currently
captured comparison has a successful exact reconstruction, not an assumed pass.
