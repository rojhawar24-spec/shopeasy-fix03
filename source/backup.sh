#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/shopeasy}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
STAMP="$(date -u '+%Y-%m-%dT%H-%M-%SZ')"
DEST="$BACKUP_DIR/shopeasy-backup-${STAMP}-$$.jsonl.gz.enc"

[[ -d "$APP_DIR" ]] || { echo "FOUT: ShopEasy-map niet gevonden: $APP_DIR" >&2; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo "FOUT: $APP_DIR/.env ontbreekt." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "FOUT: npm ontbreekt; installeer Node.js 24/npm." >&2; exit 1; }
[[ ! -e "$DEST" && ! -e "${DEST}.sha256" ]] || { echo "FOUT: back-updoel bestaat al; niets overschreven: $DEST" >&2; exit 1; }
install -d -m 700 "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

echo "[1/2] Versleutelde ShopEasy-back-up maken: $DEST"
# The Node backup command loads .env itself and enforces BACKUP_ENCRYPTION_KEY.
# It creates both the AES-256-GCM backup and its SHA-256 sidecar atomically.
(cd "$APP_DIR" && npm run backup:database -- --output "$DEST")

echo "[2/2] Back-ups ouder dan 30 dagen opruimen"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'shopeasy-backup-*.jsonl.gz.enc' -mmin +43200 -print -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'shopeasy-backup-*.jsonl.gz.enc.sha256' -mmin +43200 -print -delete
echo "Back-up voltooid. Bewaar de encryptiesleutel apart en kopieer de versleutelde back-up ook off-host."
