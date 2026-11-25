# ShopEasy database backup and restore

This runbook exists for shops using the free database tier and real customer records. It is **manual/on-demand**, not a hosted backup schedule. A successful file creation is not enough: the restore must be tested against a separate empty database before the shop relies on it.

For the persistent Linux release layout, code is at `/opt/shopeasy/releases/<release-id>` and `/opt/shopeasy/current` selects a release. The private `/opt/shopeasy/.env`, `/opt/shopeasy/data`, `/opt/shopeasy/public/uploads` and `/opt/shopeasy/backups` remain outside every release; each release links to these locations. Run operational commands from `/opt/shopeasy/current` so relative database paths select the intended installation. Release packaging and automated code validation must use a separate source copy without access to these production locations.

`deploy.sh` does not make a database backup or restore one. Its automatic failure handling and the explicit pointer switch in `DEPLOYMENT.md` restore code selection only. A failed first start can already have changed the database schema or data. Check schema compatibility before selecting older code. If state recovery is required, stop writes, preserve the affected state, restore into a separate empty target, verify that target and plan the data cutover separately. Never overwrite the live database merely to make a code rollback pass.

## Safety model

- `npm run backup:database` creates a **streamed logical backup** inside a compressed AES-256-GCM encrypted envelope (`.jsonl.gz.enc`) plus a SHA-256 sidecar. The encrypted payload includes application tables, indexes, triggers, views, database BLOBs such as `uploaded_assets.data`, sequence values and safe-named local `public/uploads` images.
- The backup uses a read-only transaction for a consistent database snapshot; with WAL on file-backed local SQLite, writers can continue while rows are read. It reads rows in bounded pages (200 rows by default) and caps uncompressed serialized data at `BACKUP_MAX_BYTES` (default 512 MiB). A cap or read error fails the run; it must not replace an earlier good backup.
- Backup reads still consume database requests/egress and can run for a while. On a free remote database, run during low traffic and check provider quotas before frequent large backups. Do not run a tight cron loop. Keep at least one off-host, encrypted copy.
- Backup files include customer names, email, addresses, orders, password hashes, session/auth data and possible notes. Never commit or email a backup. Keep `.jsonl.gz.enc`, `.sha256` and the encryption key in separate secure places; loss of the key makes the backup unrecoverable.
- Restore refuses an existing non-empty database, compares the target with the configured `DATABASE_URL`, `SHOP_DATABASE_URL` and `TURSO_DATABASE_URL` source URLs (normalizing trailing slashes and ignoring credentials/query strings), and needs an explicit `--confirm-restore`. If restore fails after creating schema, discard that **staging target** and start again with a fresh empty target. Never point the restore command at the live database, never test restore on production, and never swap the app to a partially restored target.
- Local filesystem images are separate from DB BLOB images. If the backup contains `public/uploads` images, set `RESTORE_UPLOADS_DIR` to a new empty directory and verify it alongside the restored DB. Do not point it at the current live uploads directory.
- The tool does not schedule backups, upload backups off-site, rotate retention, or automatically prove disaster recovery. Configure scheduling/storage outside the application and rehearse restore regularly.

## 1. Generate and store the encryption key

Generate once using Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Put the value in the local environment as `BACKUP_ENCRYPTION_KEY`. Store a protected recovery copy in a password manager or separate secrets vault. Do **not** store it beside the backup, in Git, in a public host variable, or inside the ZIP release. All 32 bytes must be retained exactly.

## 2. Create a backup

Use the already prepared runtime dependencies of the active release; do not install or update packages inside an active production release. Configure the database exactly as the application does (`DATABASE_URL=file:./data/shop.db` for the persistent Node.js deployment; `SHOP_DATABASE_URL` is only a backward-compatible alias for older remote Node.js setups). On that Linux host, give a new explicit destination outside the releases:

```bash
sudo -u shopeasy -- env --chdir=/opt/shopeasy/current node scripts/backup-database.mjs --output /opt/shopeasy/backups/ShopEasy-YYYY-MM-DD-UNIQUE.jsonl.gz.enc
```

Replace the placeholder with a unique name for this run. The output and sidecar must not already exist. The parent folder must have restricted access. For an independent development or restore machine, install the locked dependencies in its disposable source copy and use an explicit private output path:

```sh
npm run backup:database -- --output ../ShopEasy-backups/ShopEasy-YYYY-MM-DD.jsonl.gz.enc
```

The bare command's default output path depends on its source directory and is not the persistent Linux backup location when code lives inside `releases/`. For `scripts/backup-offsite.mjs`, explicitly set `OFFSITE_BACKUP_DIR=/opt/shopeasy/backups`. The helper creates local files and prints SCP commands; it does not upload them. `backup.sh` needs `APP_DIR=/opt/shopeasy/current` and `BACKUP_DIR=/opt/shopeasy/backups` in its invoking shell for this layout. That shell helper also deletes local matching backups older than 30 days after a successful run; use it only after choosing that retention and securing off-host recovery copies.

The command prints the output path, compressed size and SHA-256. Confirm both the `.jsonl.gz.enc` and `.jsonl.gz.enc.sha256` files exist, then copy them to secure storage **outside this machine**. Do not delete the prior known-good backup until the new pair is verified and safely copied.

## 3. Restore to a separate empty database

1. Use a separate private test machine/source copy with locked dependencies. Do not attach a production `.env`, database directory, uploads directory or service to this copy. Provision a new empty database/database file through the provider, or select a new local file. Never use the production database URL.
2. Set `RESTORE_DATABASE_URL` and, if needed, `RESTORE_DATABASE_AUTH_TOKEN` to that new target. `RESTORE_UPLOADS_DIR` must point to a new empty directory if this backup contains filesystem uploads.
3. Set `BACKUP_ENCRYPTION_KEY` to the saved original key.
4. Run, with the exact selected backup path:

```sh
npm run restore:database -- --backup ../ShopEasy-backups/ShopEasy-YYYY-MM-DD.jsonl.gz.enc --confirm-restore
```

The script validates SHA-256, authentication/decryption, schema, restored row count, foreign-key checks and database integrity. If the command fails, do not connect the live app. Discard the partial target and restore into a new empty target.

Keep `RESTORE_DATABASE_URL`, `RESTORE_DATABASE_AUTH_TOKEN`, `RESTORE_BACKUP` and `RESTORE_UPLOADS_DIR` as inputs to the reviewed restore command on that test machine. They are not normal storefront configuration and must remain absent from the production service environment. Use the exact original backup key, and do not pass it as a command-line argument that shell history or process listings can expose. Protect backup/decryption logs and never copy them into a public release.

## 4. Verify the recovery, not just the command

Run a private staging instance against the restored target, using the application version chosen for recovery. Disable live payment, email, AI and Peppol credentials so a drill cannot contact real providers. If restored records contain real customer data, restrict access and retention. Verify manager login; a test customer's order list; representative order status history; return/refund/exchange records; products, categories, variant stock/SKUs and image gallery; database BLOB images; filesystem images; coupons/settings; and new test checkout/cancellation. Verify an intentional low-stock test product appears in the dashboard. Compare row counts and order totals with recorded source evidence before cutover.

Record the backup digest, app version, selected target, start/end times, reported counts and actual checks performed. A suggested runbook or code test is not evidence of a real production backup/restore. Report an unexecuted restore drill as **NOT TESTED**, and investigate any mismatch before relying on that backup.

## 5. Recovery cadence and free-tier discipline

Choose a retention and cadence based on actual order volume, acceptable data-loss window, database provider limits and storage capacity; this project does not assume that a free provider has automatic PITR or unlimited export quota. Run a manual backup before upgrades/migrations and after major catalog/config changes. Schedule only from an external scheduler after measuring query/egress usage; retain more than one known-good encrypted backup and perform a restore rehearsal on a separate target regularly.

## 6. Order emails and cost control

Order emails are **disabled by default** even if Resend is configured. Enable `ORDER_CONFIRMATION_EMAILS=1` only after domain verification and a private test order. Enable `ORDER_STATUS_EMAILS=1` only if wanted; each real status transition is deduplicated by `(order_id,event_key)`, Resend receives a deterministic idempotency key, and `ORDER_EMAIL_DAILY_LIMIT` caps all claimed messages for the day (default 10, maximum 100). The customer order page/status history works without email. A failed/ambiguous email is not blindly retried because that could duplicate a message; inspect delivery logs before any manual re-send.

## 7. Refunds and exchanges are not payment automation

ShopEasy records return/exchange/refund steps and the manager-entered refund amount/method/reference. It does not move money or call a bank/payment provider. The manager must actually issue the refund through the real payment method before recording it. Stock must only be restocked after physical receipt and inspection. Exchanges need a replacement shipment/reference and manager confirmation of delivery; carrier tracking is not automatically integrated.


## R28 backup destination and handled-error restore safeguards

Backup refuses configured local database/source aliases and their `-wal`, `-shm` and `-journal` names as output, checksum or lock destinations, including existing-inode aliases. Existing directories, symlinks and unrelated regular files are not moved/replaced. A recognized encrypted backup/checksum pair may still be refreshed; handled publication/export failures preserve the previous pair. An exclusive destination lock rejects concurrent writers. If a successful run reports lock cleanup trouble, investigate before retrying and never remove a lock belonging to an active backup. A process crash can leave a stale lock/temporary files; verify process ownership and preserve recoverable artifacts before manual cleanup.

Restore rejects an occupied or symlinked media target before schema writes. It creates schema, rows, sequences and SQL objects inside one write transaction, rechecks target emptiness under the lock, and requires successful foreign-key/integrity checks. A failed/unavailable/empty/non-ok integrity check refuses commit. Handled pre-commit failures roll back the transaction and remove only media links/inodes created by that restore; existing destination data is preserved. If rollback or media cleanup itself fails, the command explicitly requires discarding the separate target. Never connect a live store automatically after either success or failure.

This is not a distributed crash-atomic database/filesystem transaction: power loss, ambiguous remote commit acknowledgement, storage faults or concurrent operator interference still need inspection and a fresh-target recovery plan. The DB is snapshotted but filesystem uploads are read separately, so quiesce media changes for an operationally consistent snapshot. Arbitrary custom schema/extensions are not universally certified; normal composite primary-key `WITHOUT ROWID` tables now have a successful local round-trip test, while unsupported table DDL fails explicitly.

The local Linux evidence and its exact limits are in [the R28 operations report](docs/qa/r28/operations/OPERATIONS-REPORT.md). Actual Windows, offsite storage/key custody, buyer-host recovery and live cutover remain NOT TESTED.

## FIX02-B reference consistency safeguard

New backups reject missing or invalid local upload references in the exported snapshot before publishing the backup pair. If a concurrent catalog change removes a referenced image, retry during a quiet period or with image writes paused. A rejected backup is not a successful backup; preserve the previous pair. The check verifies that a referenced asset was included as a local file or database BLOB, not image validity or compatibility with a different deployment's storage mode. Restore rehearsals and verification remain mandatory. Older backups are unchanged.
