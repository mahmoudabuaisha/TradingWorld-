#!/usr/bin/env bash
# DEPLOY-01 — read-only checks of a running deployment, from outside, through Caddy:
#   deploy/smoke-test.sh trading.mediatechnologies.uk
# Creates nothing and changes nothing. Exit code = number of failed checks.
set -uo pipefail
DOMAIN="${1:?usage: smoke-test.sh DOMAIN}"
CURL=(curl -sS --max-time 15)
# localhost gets Caddy's internal certificate (CI and local tests); a real domain must present a trusted one
[ "$DOMAIN" = localhost ] && CURL+=(-k)
BASE="https://$DOMAIN"
fails=0
check() {
  if eval "$2" >/dev/null 2>&1; then echo "✓ $1"; else echo "✗ $1"; fails=$((fails + 1)); fi
}

home="$("${CURL[@]}" "$BASE/" 2>/dev/null || true)"
check "web app answers on $BASE/" '[[ "$home" == *"<html"* ]]'
health="$("${CURL[@]}" "$BASE/api/v1/health" 2>/dev/null || true)"
check "API answers on /api/v1/health (same origin)" '[[ "$health" == *"\"ok\":true"* ]]'
echo "  commit: $(echo "$health" | grep -o '"commit":"[^"]*"' | cut -d'"' -f4)"
check "plain HTTP redirects to HTTPS" '[[ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$DOMAIN/")" =~ ^30[178]$ ]]'
check "HSTS header present" '"${CURL[@]}" -D - -o /dev/null "$BASE/" | grep -qi "^strict-transport-security"'
ws="$("${CURL[@]}" --http1.1 -i -N --max-time 4 "$BASE/ws" -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" 2>/dev/null | head -1 || true)"
check "WebSocket upgrades on /ws" '[[ "$ws" == *" 101"* ]]'
check "/metrics is not public" '[ "$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$BASE/metrics")" = 404 ]'
grafana="$("${CURL[@]}" "$BASE/grafana/api/health" 2>/dev/null || true)"
check "Grafana answers on /grafana (OPS-01b)" '[[ "$grafana" == *"\"database\""*"\"ok\""* ]]'
check "Grafana data needs a login" '[ "$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$BASE/grafana/api/search")" = 401 ]'
check "the database port is closed to the outside" '! timeout 4 bash -c "</dev/tcp/$DOMAIN/5432"'
check "the API port is closed to the outside" '! timeout 4 bash -c "</dev/tcp/$DOMAIN/4000"'
check "Prometheus, Jaeger and the node exporter are closed to the outside" \
  '! timeout 4 bash -c "</dev/tcp/$DOMAIN/9090" && ! timeout 4 bash -c "</dev/tcp/$DOMAIN/16686" && ! timeout 4 bash -c "</dev/tcp/$DOMAIN/9100"'

echo
[ "$fails" = 0 ] && echo "all checks passed" || echo "$fails check(s) failed"
exit "$fails"
