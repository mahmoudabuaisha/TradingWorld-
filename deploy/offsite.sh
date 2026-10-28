#!/usr/bin/env bash
# OPS-02b — a copy of every database backup outside this server, on Cloudflare R2 (docs/13 §6). Run as root:
#   deploy/offsite.sh                   set up R2, back up now, copy it to R2 and restore it back from R2 in a drill
#   deploy/offsite.sh --show-key        print the backup decryption key again (to save it somewhere safe)
#   deploy/offsite.sh --configure-only  only store and check the R2 settings (used by deploy/restore.sh)
# It asks for the R2 account ID, bucket, access key ID and secret (the secret is not shown while typed) and keeps them in
# deploy/.env, never in Git. Tests pass them as R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (and
# R2_ENDPOINT for an S3 server that is not R2) with OFFSITE_YES=1.
set -euo pipefail

main() {
  DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV="$DIR/.env"
  TW="$DIR/tw"
  KEY="$DIR/secrets/age-identity.txt"
  [ -f "$ENV" ] || { echo "deploy/.env not found: run deploy/setup.sh first"; exit 2; }
  say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

  show_key() {
    [ -f "$KEY" ] || { echo "no key at $KEY"; return 1; }
    cat <<EOF

  ================================================================================
  THE BACKUP KEY. Every backup is encrypted with it: without it NO backup, on this
  server or on R2, can ever be restored. Save the line below now, off this server
  (a password manager, or on paper). Never in chat, email or Git.
  ================================================================================

$(grep '^AGE-SECRET-KEY-' "$KEY")

  (public part, for reference: $(grep -o 'age1[0-9a-z]*' "$KEY" | head -1))
  To see it again: deploy/offsite.sh --show-key
EOF
  }

  if [ "${1:-}" = "--show-key" ]; then show_key; exit 0; fi
  CONFIGURE_ONLY=0
  [ "${1:-}" = "--configure-only" ] && CONFIGURE_ONLY=1

  say "Cloudflare R2 settings (docs/13 §6 shows where to find each one)"
  ask() { # VAR "prompt" [secret]
    local v="${!1:-}"
    if [ -z "$v" ]; then
      if [ "${3:-}" = secret ]; then read -r -s -p "$2: " v && echo; else read -r -p "$2: " v; fi
    fi
    v="$(printf %s "$v" | tr -d '[:space:]')"
    [ -n "$v" ] || { echo "$1 is required"; exit 2; }
    printf -v "$1" %s "$v"
  }
  ask R2_ACCOUNT_ID "Account ID (or the S3 API URL shown under the bucket's settings)"
  # the S3 API URL works too: https://<account>.r2.cloudflarestorage.com[/bucket]
  R2_ACCOUNT_ID="$(printf %s "$R2_ACCOUNT_ID" | sed -E 's#^https?://##; s#\.r2\.cloudflarestorage\.com.*$##; s#\..*$##')"
  ask R2_BUCKET "Bucket name"
  ask R2_ACCESS_KEY_ID "Access Key ID"
  ask R2_SECRET_ACCESS_KEY "Secret Access Key (hidden while you type or paste)" secret
  if [ -z "${R2_ENDPOINT:-}" ]; then
    [[ "$R2_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]] || { echo "the account ID is 32 characters, 0-9 and a-f; got '$R2_ACCOUNT_ID'"; exit 2; }
    [[ "$R2_ACCESS_KEY_ID" =~ ^[0-9a-f]{32}$ ]] || { echo "an R2 Access Key ID is 32 characters, 0-9 and a-f"; exit 2; }
    [[ "$R2_SECRET_ACCESS_KEY" =~ ^[0-9a-f]{64}$ ]] || { echo "an R2 Secret Access Key is 64 characters, 0-9 and a-f"; exit 2; }
  fi
  [[ "$R2_BUCKET" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { echo "bucket names are 3-63 characters: a-z, 0-9 and -"; exit 2; }
  ENDPOINT="${R2_ENDPOINT:-https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com}"
  REMOTE="r2:$R2_BUCKET/db"

  # deploy/.env is rewritten in place (it keeps its 600 mode); the previous version is restored if R2 refuses
  set_env() {
    awk -v k="$1" -v v="$2" 'BEGIN { done = 0 } index($0, k "=") == 1 { print k "=" v; done = 1; next } { print } END { if (!done) print k "=" v }' \
      "$ENV" >"$ENV.new"
    cat "$ENV.new" >"$ENV" && rm -f "$ENV.new"
  }
  cp -p "$ENV" "$ENV.before-offsite"
  set_env BACKUP_RCLONE_REMOTE "$REMOTE"
  set_env RCLONE_CONFIG_R2_TYPE s3
  set_env RCLONE_CONFIG_R2_PROVIDER Cloudflare
  set_env RCLONE_CONFIG_R2_ENDPOINT "$ENDPOINT"
  set_env RCLONE_CONFIG_R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID"
  set_env RCLONE_CONFIG_R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY"
  # the key only needs object read and write: rclone must not try to create the bucket
  set_env RCLONE_CONFIG_R2_NO_CHECK_BUCKET true

  say "checking access to $R2_BUCKET"
  # a one-off container of the backup job with the new settings: the running services are not touched yet
  # the bucket, not db/: a folder that does not exist yet is an error on S3, an empty bucket is not
  if ! out="$("$TW" run --rm --no-deps -T backup rclone lsf -R --files-only "r2:$R2_BUCKET" 2>&1)"; then
    cat "$ENV.before-offsite" >"$ENV"
    echo "$out" | tail -5
    case "$out" in
      *NoSuchBucket* | *"bucket does not exist"* | *"directory not found"*) echo "→ no bucket called '$R2_BUCKET' in this account: check the name" ;;
      *InvalidAccessKeyId* | *SignatureDoesNotMatch* | *Unauthorized* | *AccessDenied* | *403*)
        echo "→ R2 refused the key: check the Access Key ID and secret, and that the token may read and write this bucket" ;;
      *"no such host"* | *"dial tcp"* | *timeout*) echo "→ R2 not reachable: check the account ID and this server's internet access" ;;
    esac
    echo "deploy/.env left as it was."
    exit 1
  fi
  rm -f "$ENV.before-offsite"
  earlier="$(echo "$out" | grep -c '^db/.*\.manifest\.json$' || true)"
  echo "R2 answered ✓ (backups already there: $earlier)"
  [ "$CONFIGURE_ONLY" = 1 ] && exit 0

  if [ "$earlier" -gt 0 ] && [ "${OFFSITE_YES:-}" != 1 ]; then
    cat <<EOF

This bucket already holds $earlier backup(s). If THIS is a new server replacing a lost one, answer n and run
deploy/restore.sh: it brings those backups' data back. Continuing adds this server's backups next to them.
EOF
    read -r -p "Continue? [y/N] " yn
    [[ "$yn" =~ ^[Yy] ]] || { echo "stopped; the R2 settings are saved in deploy/.env"; exit 0; }
  fi

  say "restarting the API and the backup job with the new settings (a few seconds)"
  "$TW" up -d --no-deps api backup
  for _ in $(seq 1 60); do
    "$TW" exec -T api wget -qO /dev/null http://127.0.0.1:4000/api/v1/health 2>/dev/null && break
    sleep 3
  done

  say "backup now, copied to R2 and checked there"
  "$TW" exec -T backup node apps/api/dist/tools/backup.js run

  say "restore drill FROM R2 (downloads the copy, decrypts it, restores it into a scratch database, compares)"
  "$TW" exec -T backup node apps/api/dist/tools/backup.js drill

  say "done"
  echo "  every day at 02:30 UTC a backup is made and copied to $REMOTE; every week one is restored from R2 to prove it"
  echo "  the admin sheet shows OFFSITE next to the last backup"
  show_key
}

main "$@"
