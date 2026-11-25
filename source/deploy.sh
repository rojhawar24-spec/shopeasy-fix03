#!/usr/bin/env bash
# Validate an immutable release before changing the current symlink.
set -Eeuo pipefail
umask 077
APP_DIR="${APP_DIR:-/opt/shopeasy}"
CADDY_CONFIG_FILE="${CADDY_CONFIG_FILE:-/etc/caddy/Caddyfile}"
SERVICE_NAME="shopeasy"
BUILD_ACCOUNT="shopeasy-build"
ZIP_FILE="${1:-}"
EXPECTED_SHA256="${2:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STAGE=""
NEW_RELEASE=""
PREVIOUS_RELEASE=""
SWITCHED=0
SUCCESS=0
log() { printf '[ShopEasy] %s\n' "$*"; }
fail() { printf 'Deployment stopped: %s\n' "$*" >&2; exit 1; }
healthy() {
  local attempt status
  for ((attempt=1;attempt<=10;attempt++)); do
    status="$(curl --silent --output /dev/null --connect-timeout 2 --max-time 3 --write-out '%{http_code}' "$1" 2>/dev/null || true)"
    [[ "$status" != 200 ]] || return 0
    (( attempt == 10 )) || sleep 1
  done
  return 1
}
cleanup() {
  local result=$?
  trap - EXIT INT TERM HUP
  set +e
  if (( result != 0 && SWITCHED == 1 && SUCCESS == 0 )); then
    log 'New release is unhealthy; restoring the previous code pointer.'
    systemctl stop "$SERVICE_NAME" >/dev/null 2>&1
    if [[ -n "$PREVIOUS_RELEASE" ]]; then
      if node "$SCRIPT_DIR/scripts/release-layout.mjs" "$APP_DIR" "$PREVIOUS_RELEASE" >/dev/null && systemctl restart "$SERVICE_NAME"; then
        healthy 'http://127.0.0.1:3000/health' && healthy 'http://127.0.0.1:3000/ready' || log 'Previous code was selected but readiness is not restored; operator recovery is required.'
      else
        log 'Code rollback failed; the service remains stopped for operator recovery.'
      fi
    else
      rm -f -- "$APP_DIR/current"
      log 'No previous release exists; the service remains stopped.'
    fi
    log 'Code rollback does not restore database mutations. Use the separately reviewed backup/restore procedure if required.'
  fi
  [[ -z "$STAGE" || ! -d "$STAGE" ]] || rm -rf -- "$STAGE"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
[[ "$(id -u)" == 0 ]] || fail 'Run through sudo on the intended Linux host.'
[[ -n "$ZIP_FILE" && "$EXPECTED_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || fail 'Usage: sudo bash deploy.sh RELEASE.zip EXPECTED_SHA256 (obtain digest separately).'
[[ -f "$ZIP_FILE" ]] || fail 'Release ZIP is missing.'
ZIP_FILE="$(realpath -- "$ZIP_FILE")"
[[ -d "$APP_DIR" && "$APP_DIR" != / && ! -L "$APP_DIR" ]] || fail 'APP_DIR must be an existing real directory, never / or a symlink.'
APP_DIR="$(cd -- "$APP_DIR" && pwd -P)"
for command in node npm systemctl curl caddy flock runuser sha256sum stat install find; do command -v "$command" >/dev/null || fail "Required command is unavailable: $command"; done
[[ "$(stat -c '%u' "$APP_DIR")" == 0 && -z "$(find "$APP_DIR" -maxdepth 0 -perm /022 -print)" ]] || fail 'Application root must be root-owned and not writable by group or others.'
NODE_BINARY="$(command -v node)"
[[ -f "$SCRIPT_DIR/scripts/release-archive.mjs" && -f "$SCRIPT_DIR/scripts/release-layout.mjs" ]] || fail 'Run the deploy script from a complete extracted source release.'
node --input-type=module -e 'const [major,minor,patch]=process.versions.node.split(".").map(Number);if(major!==24||minor<22||(minor===22&&patch<2))process.exit(1)' || fail 'Use Node.js >=24.22.2 <25.'
actual_hash="$(sha256sum -- "$ZIP_FILE")"; actual_hash="${actual_hash%% *}"
[[ "${actual_hash,,}" == "${EXPECTED_SHA256,,}" ]] || fail 'Release archive SHA-256 differs from the independently obtained expected digest.'
[[ -f "$APP_DIR/.env" && ! -L "$APP_DIR/.env" ]] || fail 'Private APP_DIR/.env must already exist as a regular file; this script never creates or edits it.'
[[ -f "$CADDY_CONFIG_FILE" ]] || fail 'Configure the active Caddy site before deployment.'
systemctl is-active --quiet caddy || fail 'Caddy must already be running with HTTPS configured.'
caddy validate --config "$CADDY_CONFIG_FILE" >/dev/null || fail 'Caddy configuration validation failed.'
id shopeasy >/dev/null 2>&1 || fail 'Create the dedicated shopeasy service account first.'
id "$BUILD_ACCOUNT" >/dev/null 2>&1 || fail 'Create the separate shopeasy-build account first; never add it to the shopeasy group.'
[[ "$(id -u "$BUILD_ACCOUNT")" != 0 && "$(id -u "$BUILD_ACCOUNT")" != "$(id -u shopeasy)" ]] || fail 'Build and service accounts must be distinct non-root accounts.'
if runuser -u "$BUILD_ACCOUNT" -- test -r "$APP_DIR/.env"; then fail 'The build account can read the live environment; fix private permissions before preparation.'; fi
for directory in releases data backups public public/uploads; do
  [[ ! -L "$APP_DIR/$directory" && ( ! -e "$APP_DIR/$directory" || -d "$APP_DIR/$directory" ) ]] || fail "Managed path must be a real directory: $directory"
done
for directory in data backups public/uploads; do
  if [[ -d "$APP_DIR/$directory" ]] && runuser -u "$BUILD_ACCOUNT" -- test -x "$APP_DIR/$directory"; then fail "The build account can access persistent state: $directory"; fi
done
# Only one deploy may prepare/switch against this persistent installation at a time.
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || fail 'Another deployment holds the installation lock.'
if [[ -e "$APP_DIR/current" || -L "$APP_DIR/current" ]]; then
  [[ -L "$APP_DIR/current" ]] || fail 'current must be a symlink; no live directory will be overwritten.'
  PREVIOUS_RELEASE="$(realpath -- "$APP_DIR/current")"
  [[ "$(dirname -- "$PREVIOUS_RELEASE")" == "$APP_DIR/releases" ]] || fail 'Current release escapes the managed releases directory.'
fi
install -d -o root -g shopeasy -m 755 "$APP_DIR/releases"
STAGE="$(mktemp -d "$APP_DIR/releases/.prepare-XXXXXXXX")"
chmod 755 "$STAGE"
node "$SCRIPT_DIR/scripts/release-archive.mjs" extract "$ZIP_FILE" "$STAGE/extracted"
release_root="$(node "$SCRIPT_DIR/scripts/release-files.mjs" resolve "$STAGE/extracted")"
# The build account cannot read the private environment or traverse live data/uploads/backups.
# Its dependency installation and mandatory test gates use a new private profile/cache.
chown -hR "$BUILD_ACCOUNT:$BUILD_ACCOUNT" "$release_root"
runuser -u "$BUILD_ACCOUNT" -- env -i PATH="$(dirname -- "$NODE_BINARY"):/usr/local/bin:/usr/bin:/bin" TMPDIR=/tmp "$NODE_BINARY" "$release_root/scripts/prepare-deployment.mjs" "$release_root"
chown -hR root:shopeasy "$release_root"
base_url="$(node "$release_root/scripts/validate-deployment.mjs" "$APP_DIR" "$CADDY_CONFIG_FILE")"
version="$(node --input-type=module - "$release_root/package.json" <<'NODE'
import fs from 'node:fs';const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).version;if(!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(value))process.exit(1);process.stdout.write(value);
NODE
)"
NEW_RELEASE="$APP_DIR/releases/$(date -u '+%Y%m%dT%H%M%SZ')-$version-$$"
[[ ! -e "$NEW_RELEASE" ]] || fail 'Release destination already exists.'
# Persistent state is outside every release and never copied, replaced or restored here.
for directory in data backups public/uploads; do
  [[ ! -L "$APP_DIR/$directory" ]] || fail "Persistent directory must not be a symlink: $directory"
  install -d -o shopeasy -g shopeasy -m 700 "$APP_DIR/$directory"
done
ln -s "$APP_DIR/.env" "$release_root/.env"
ln -s "$APP_DIR/data" "$release_root/data"
ln -s "$APP_DIR/backups" "$release_root/backups"
ln -s "$APP_DIR/public/uploads" "$release_root/public/uploads"
mv -- "$release_root" "$NEW_RELEASE"
chown -hR root:shopeasy "$NEW_RELEASE"
find "$NEW_RELEASE" -type d -exec chmod 750 {} +
find "$NEW_RELEASE" -type f -exec chmod 640 {} +
# rename(2) of a sibling symlink is atomic; no obsolete source is copied into the new release.
SWITCHED=1
node "$SCRIPT_DIR/scripts/release-layout.mjs" "$APP_DIR" "$NEW_RELEASE" >/dev/null
systemctl restart "$SERVICE_NAME"
healthy 'http://127.0.0.1:3000/health' || fail 'Local health check failed.'
healthy 'http://127.0.0.1:3000/ready' || fail 'Local readiness check failed.'
healthy "${base_url%/}/health" || fail 'Public HTTPS health check failed.'
SUCCESS=1
log 'VERIFIED: release prepared, code pointer switched, and local/public HTTP health checks returned 200.'
log 'Previous code releases remain available for an explicit rollback; no database backup or legal clearance is implied.'
