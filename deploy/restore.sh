#!/usr/bin/env bash
# OPS-02b — disaster recovery: bring the data back from the R2 copy (docs/13 §8). Typical case, a new server:
#   bash /opt/tradingworld/deploy/setup.sh trading.mediatechnologies.uk     (as for the first install)
#   deploy/restore.sh                                                       (as root)
# It asks for the backup key saved from the old server (deploy/offsite.sh --show-key) and, if this server has none yet,
# the R2 settings; lists the backups on R2 with their date and row counts; restores the chosen one (default: newest)
# and starts the platform on it. The database it replaces is kept, renamed tradingworld_before_<UTC time>. On any
# failure the data and the backup key are left as they were (R2 settings entered here stay saved for the next try).
#   deploy/restore.sh [--latest] [--yes]    tests: BACKUP_KEY=AGE-SECRET-KEY-1… and the R2_* variables of offsite.sh
set -euo pipefail

main() {
  DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV="$DIR/.env"
  TW="$DIR/tw"
  KEY="$DIR/secrets/age-identity.txt"
  LATEST=0 YES=0
  for a in "$@"; do case "$a" in --latest) LATEST=1 ;; --yes) YES=1 ;; *) echo "unknown option $a"; exit 2 ;; esac; done
  [ -f "$ENV" ] || { echo "deploy/.env not found: run deploy/setup.sh first"; exit 2; }
  [ "$(id -u)" = 0 ] || { echo "run as root"; exit 2; }
  say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
  envval() { grep "^$1=" "$ENV" | tail -1 | cut -d= -f2-; }
  set_env() {
    awk -v k="$1" -v v="$2" 'BEGIN { done = 0 } index($0, k "=") == 1 { print k "=" v; done = 1; next } { print } END { if (!done) print k "=" v }' \
      "$ENV" >"$ENV.new"
    cat "$ENV.new" >"$ENV" && rm -f "$ENV.new"
  }

  say "1. the backup key"
  key="${BACKUP_KEY:-}"
  if [ -z "$key" ]; then
    echo "Paste the key you saved from the old server (one line, starts with AGE-SECRET-KEY-1)."
    echo "Press Enter without pasting to use this server's own key (only right if this server made the backups)."
    read -r -s -p "key (hidden): " key && echo
  fi
  key="$(printf %s "$key" | tr -d '[:space:]')"
  # the key is only tried here; it becomes this server's key after a successful restore (a wrong one changes nothing)
  TRY="$DIR/secrets/restore-key.txt"
  if [ -n "$key" ]; then
    [[ "$key" =~ ^AGE-SECRET-KEY-1[0-9A-Z]{58}$ ]] || { echo "that is not an age key (AGE-SECRET-KEY-1 and 58 more characters)"; exit 2; }
    pub="$(printf '%s\n' "$key" | age-keygen -y 2>/dev/null)" || { echo "age could not read that key"; exit 2; }
    (umask 077 && printf '%s\n' "$key" >"$TRY")
    echo "key read (public part $pub)"
  else
    cp -p "$KEY" "$TRY"
  fi
  trap 'rm -f "$TRY"' EXIT

  say "2. the R2 copy"
  if [ -z "$(envval BACKUP_RCLONE_REMOTE)" ]; then
    echo "this server has no R2 settings yet: the same account, bucket and key as the old server"
    "$DIR/offsite.sh" --configure-only
  fi
  REMOTE="$(envval BACKUP_RCLONE_REMOTE)"
  oneoff() { "$TW" run --rm --no-deps -T -e RCLONE_LOG_LEVEL=ERROR "$@"; }
  mapfile -t manifests < <(oneoff backup rclone lsf --files-only --include '*.manifest.json' "$REMOTE" | sort -r | head -10)
  [ "${#manifests[@]}" -gt 0 ] || { echo "no backups in $REMOTE"; exit 1; }

  # each manifest is small and not encrypted: date, size and row counts, to choose with
  oneoff backup sh -c 'mkdir -p /backups/restore && for m in "$@"; do rclone copyto "$0/$m" "/backups/restore/$m"; done' "$REMOTE" "${manifests[@]}"
  echo
  oneoff backup node -e '
    const fs = require("node:fs");
    process.argv.slice(1).forEach((f, i) => {
      const m = JSON.parse(fs.readFileSync("/backups/restore/" + f, "utf8"));
      const rows = (t) => m.tables.find((x) => x.table === t)?.rows ?? "?";
      const total = m.tables.reduce((a, t) => a + t.rows, 0);
      console.log(`  ${i + 1}. ${m.createdAt.replace("T", " ").slice(0, 16)} UTC · ${(m.bytes / 1048576).toFixed(1)} MB · users ${rows("public.\"User\"")} · rows ${total}`);
    });' "${manifests[@]}"
  pick=1
  if [ "$LATEST" = 0 ] && [ "$YES" = 0 ]; then
    read -r -p "Which backup? [1 = newest] " pick
    pick="${pick:-1}"
  fi
  [[ "$pick" =~ ^[0-9]+$ ]] && [ "$pick" -ge 1 ] && [ "$pick" -le "${#manifests[@]}" ] || { echo "no such choice"; exit 2; }
  MANIFEST="${manifests[$((pick - 1))]}"
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  OLD="tradingworld_before_$STAMP"
  if [ "$YES" = 0 ]; then
    echo
    echo "The data now on this server is replaced by $MANIFEST. It is kept as the database $OLD."
    read -r -p "Restore? [y/N] " yn
    [[ "$yn" =~ ^[Yy] ]] || { echo "nothing changed"; exit 0; }
  fi

  psql() { "$TW" exec -T -e PGOPTIONS='-c client_min_messages=error' db psql -v ON_ERROR_STOP=1 -U tradingworld -d postgres -qAt -c "$1"; }
  # on any failure from here the server goes back to how it was: only what was actually changed is undone
  stage=start
  undo() {
    echo "RESTORE FAILED: putting the previous database back"
    if [ "$stage" = renamed ]; then
      psql "DROP DATABASE IF EXISTS tradingworld" || true
      psql "ALTER DATABASE \"$OLD\" RENAME TO tradingworld" || true
    fi
    psql "ALTER DATABASE tradingworld ALLOW_CONNECTIONS true" || true
    rm -f "$TRY"
    "$TW" start api backup || true
    echo "nothing changed: the data and the backup key are as before (R2 settings entered here stay saved)"
  }
  trap undo EXIT

  say "3. stopping the API and the backup job (nothing is written while the data is replaced)"
  "$TW" stop backup api

  say "4. keeping the current database as $OLD"
  # TimescaleDB's background workers reconnect at once: refuse new connections before closing the open ones
  psql "ALTER DATABASE tradingworld ALLOW_CONNECTIONS false"
  psql "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname = 'tradingworld' AND pid <> pg_backend_pid()" >/dev/null
  sleep 1
  psql "ALTER DATABASE tradingworld RENAME TO \"$OLD\""
  stage=renamed
  psql "ALTER DATABASE \"$OLD\" ALLOW_CONNECTIONS true"
  psql "CREATE DATABASE tradingworld OWNER tradingworld"

  say "5. restoring $MANIFEST (downloaded from R2, decrypted, checked)"
  oneoff -v "$TRY:/run/secrets/restore-key:ro" -e BACKUP_AGE_IDENTITY_FILE=/run/secrets/restore-key backup \
    sh -c 'node apps/api/dist/tools/backup.js restore "/backups/restore/$0" --target "$DATABASE_URL"' "$MANIFEST"
  trap - EXIT

  if [ -n "$key" ] && ! grep -qx "$key" "$KEY"; then
    # the key that opened the backups becomes this server's: same file (mounted in the backup job), new content, and
    # new backups are encrypted to it, so the one copy saved off the server keeps opening all of them
    cp -p "$KEY" "$KEY.replaced-$STAMP"
    printf '# installed by deploy/restore.sh on %s\n# public key: %s\n%s\n' "$(date -u +%F)" "$pub" "$key" >"$KEY"
    chmod 600 "$KEY"
    set_env BACKUP_AGE_RECIPIENTS "$pub"
    echo "the saved key is now this server's backup key"
  fi
  rm -f "$TRY"

  say "6. starting the platform on the restored data"
  "$TW" up -d api backup
  for _ in $(seq 1 60); do
    "$TW" exec -T api wget -qO /dev/null http://127.0.0.1:4000/api/v1/health 2>/dev/null && break
    sleep 3
  done
  health="$("$TW" exec -T api wget -qO- http://127.0.0.1:4000/api/v1/health 2>/dev/null || true)"
  [[ "$health" == *'"ok":true'* ]] && echo "platform up ✓ ($(echo "$health" | grep -o '"commit":"[^"]*"'))" || echo "WARNING: the API is not answering yet: deploy/tw logs api"
  oneoff backup rm -rf /backups/restore

  say "done"
  cat <<EOF
  restored : $MANIFEST
  kept     : the replaced database, as $OLD. When the site looks right, free its space with:
             deploy/tw exec db psql -U tradingworld -d postgres -c 'DROP DATABASE "$OLD"'
  accounts : every password is the one from the old server, the admin's too (not the one setup.sh printed here).
             Everyone signs in again (new session keys); browser notifications are switched on again (new push keys).
             Grafana keeps this server's password (the one setup.sh printed).
  next     : deploy/smoke-test.sh $(envval DOMAIN), then a drill: deploy/tw exec backup node apps/api/dist/tools/backup.js drill
EOF
}

main "$@"
