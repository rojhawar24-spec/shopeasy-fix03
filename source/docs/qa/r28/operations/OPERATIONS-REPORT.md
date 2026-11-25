# R28 operations remediation proposal

VERIFIED — Changes are isolated from real .env/databases/.venv and the delivered R27 ZIP. Actual local SQLite and random synthetic encryption keys were used; no providers or production state were contacted. Parent integration/version bump/full checks remain separate.

| Defect / change | Evidence and result |
| --- | --- |
| Original occupied-media restore wrote schema before refusing | [Original boundaries](original-boundaries.json). Restore now validates media first and rechecks an empty DB inside one write transaction. |
| Original FK/integrity query failures were treated as success | Same original proof. Actual fault injection now refuses/rolls back DDL, FK query failure, integrity query failure, empty/bad integrity results and failed commit. |
| Existing backup output could replace a source SQLite file or move a directory aside | [Actual original output proof](backup-output-original.json). Typed destination/source+sidecar guards now refuse before snapshot/publication. |
| Manual writer sink could leave an asynchronous output error unhandled | Real pipeline fault-injection rejects and removes owned temporaries/lock; old complete pair is retained on export failure. |
| Concurrent output writers had no destination serialization | Actual exclusive-lock race refuses the second writer and leaves a verifiable first backup/checksum pair. |
| Backup table pagination assumed rowid and swallowed schema metadata errors | Composite-key WITHOUT ROWID tables round-trip; schema PRAGMA failures now fail backup publication. |
| Container build ran tests as root | Original CA-only build exposed root deployment guard (not a missing-vendor failure). Corrected build uses node before install/tests; optional read-only CA secret preserves TLS verification. |

VERIFIED — [Six new backup-output tests](ops-backup-output-final.txt):6 tests/pass6/fail0/skipped0; [exact command](ops-backup-output-final.json). [Restore/metadata actual-driver tests](ops-restore-final.txt):12 tests/pass12/fail0/skipped0; [exact command](ops-restore-final.json). The former default-sandbox subprocess attempt failed EPERM; that is a sandbox limitation, not a passing application result. The recorded successful runs actually executed with authorized local subprocess access.

VERIFIED — [Full encrypted CLI drill](cli-drill-results.json):20/20 recorded checks,184 rows across33 tables including sqlite_sequence, exact table/schema/financial/BLOB/filesystem comparisons, wrong-key/checksum/configured-source/nonempty-target refusals; failed restore targets had zero committed app schema in this local run. Keys, synthetic DBs/uploads and encrypted artifacts were disposed. [CLI console](cli-drill-console.txt). This is the final guarded writer proposal, not merely an earlier restore-only version.

VERIFIED — Docker29.9.2 actual corrected unprivileged build-stage completed1166 tests/pass1166/fail0/skipped0, lint/core types/templates/static/preflight/advisories/notices. NOT TESTED — completed final image/runtime: final production-stage COPY failed ENOSPC. [Exact resource/build scope](docker-resource-results.json), [actual selected output](docker-build-observations.txt). No container runtime success, Windows execution or live deployment is asserted. Parent must rebuild the final integrated source with sufficient storage.

NOT TESTED — Real offsite storage/key custody, live/buyer-host recovery, actual Windows, remote database failure semantics and global crash atomicity. A DB transaction and owned-inode media cleanup cover handled local failures; they cannot prove two-resource crash atomicity or resolve an ambiguous remote commit acknowledgement. Filesystem media is not in the DB snapshot; quiesce concurrent media changes and inspect before any manual cutover. Full legal retention decisions remain UNKNOWN.

The source/test changes are scoped to backup/restore/container behavior. Final parent integration/version metadata and rechecks are separate evidence; this document does not assert final R28 acceptance.
