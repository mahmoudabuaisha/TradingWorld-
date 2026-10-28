#!/usr/bin/env bash
# DEPLOY-01 — brings the server to the newest commit on $DEPLOY_BRANCH (default main). Run every 2 minutes by the
# tradingworld-deploy.timer; does nothing when nothing changed. Images are tagged with the short commit; on a failed
# health check the previous commit and its images are put back, and the failed commit is skipped until a newer one.
#   deploy/deploy.sh            deploy if main moved
#   deploy/deploy.sh --force    rebuild and redeploy the current commit (e.g. after editing deploy/.env)
set -euo pipefail

# the whole script is one function: git reset below rewrites this file, and bash must not read the new copy mid-run
main() {
  DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT="$(dirname "$DIR")"
  STATE="$DIR/.state"
  BRANCH="${DEPLOY_BRANCH:-main}"
  FORCE=0
  [ "${1:-}" = "--force" ] && FORCE=1
  mkdir -p "$STATE"
  exec 9>"$STATE/lock"
  flock -n 9 || { echo "another deploy is running"; exit 0; }
  log() { echo "$(date -u +%FT%TZ) $*"; }
  cd "$ROOT"

  git fetch --quiet origin "$BRANCH"
  target="$(git rev-parse "origin/$BRANCH")"
  current="$(cat "$STATE/current" 2>/dev/null || echo none)"
  failed="$(cat "$STATE/failed" 2>/dev/null || echo none)"
  if [ "$FORCE" = 0 ] && [ "$target" = "$current" ]; then exit 0; fi
  if [ "$FORCE" = 0 ] && [ "$target" = "$failed" ]; then exit 0; fi

  tag="${target:0:7}"
  prev_tag="$(cat "$STATE/current-tag" 2>/dev/null || true)"
  log "deploying $BRANCH $tag (running: ${prev_tag:-nothing})"
  git reset --quiet --hard "$target"

  compose() { IMAGE_TAG="$1" docker compose --env-file "$DIR/.env" -f "$DIR/docker-compose.prod.yml" "${@:2}"; }

  # Compose recreates a container when its definition changes, not when a mounted config file does: after moving
  # from commit $1 to the checked-out one, reload Caddy and restart the monitoring services if their files changed.
  # A Caddyfile that fails to load fails the deploy (the running Caddy keeps the old one until the rollback).
  refresh() {
    [ "$1" = none ] && return 0
    if ! git diff --quiet "$1" HEAD -- deploy/caddy; then
      log "Caddyfile changed: reloading Caddy"
      compose "$2" exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || return 1
    fi
    if ! git diff --quiet "$1" HEAD -- infra/monitoring; then
      log "monitoring config changed: restarting Prometheus and Grafana"
      compose "$2" restart prometheus grafana || return 1
    fi
  }

  healthy() {
    # the API reports the commit it was built from; the web app answers its home page
    for _ in $(seq 1 "${DEPLOY_HEALTH_TRIES:-60}"); do
      if compose "$1" exec -T api wget -qO- http://127.0.0.1:4000/api/v1/health 2>/dev/null | grep -q "\"commit\":\"$1\"" &&
        compose "$1" exec -T web wget -qO /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
        return 0
      fi
      sleep "${DEPLOY_HEALTH_SLEEP:-5}"
    done
    return 1
  }

  if compose "$tag" build && compose "$tag" up -d --remove-orphans && refresh "$current" "$tag" && healthy "$tag"; then
    echo "$target" >"$STATE/current"
    echo "$tag" >"$STATE/current-tag"
    rm -f "$STATE/failed"
    # keep this release and the previous one; anything older goes
    for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^tradingworld-(api|web):' || true); do
      case "${img##*:}" in "$tag" | "$prev_tag") ;; *) docker rmi "$img" >/dev/null 2>&1 || true ;; esac
    done
    docker image prune -f >/dev/null
    log "deployed $tag"
    exit 0
  fi

  log "ERROR: $tag failed to build or become healthy"
  echo "$target" >"$STATE/failed"
  compose "$tag" logs --tail 80 api web >&2 || true
  if [ -n "$prev_tag" ] && [ "$current" != none ]; then
    git reset --quiet --hard "$current"
    compose "$prev_tag" up -d --remove-orphans
    refresh "$target" "$prev_tag" || log "WARNING: could not reload the previous configs"
    log "rolled back to $prev_tag"
  fi
  exit 1
}

main "$@"
