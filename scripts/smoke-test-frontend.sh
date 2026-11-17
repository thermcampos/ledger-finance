#!/usr/bin/env bash
# Smoke test for a built frontend image.
# Starts the given image (nginx on :80) and checks that it serves the app shell,
# the hashed JS bundle it references, the SPA fallback for client-side routes,
# and the security headers from the nginx config in frontend/Dockerfile.
#
# Usage: FRONTEND_IMAGE=ghcr.io/thermcampos/ledger-finance/frontend:pr-123 bash scripts/smoke-test-frontend.sh
# Optional: GHCR_USER + GHCR_TOKEN to log in to GHCR before pulling.
set -euo pipefail

FRONTEND_IMAGE="${FRONTEND_IMAGE:?FRONTEND_IMAGE env var is required}"
APP_CONTAINER="ledger-smoke-frontend"
APP_PORT="${APP_PORT:-18081}"
APP_URL="http://localhost:${APP_PORT}"

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "Smoke test failed. Frontend logs:"
    docker logs "$APP_CONTAINER" 2>&1 | tail -n 200 || true
  fi
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*"
  exit 1
}

if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER is required with GHCR_TOKEN}" --password-stdin
fi

echo "Pulling ${FRONTEND_IMAGE}..."
docker pull "$FRONTEND_IMAGE"

echo "Starting frontend..."
docker run -d --name "$APP_CONTAINER" -p "${APP_PORT}:80" "$FRONTEND_IMAGE" >/dev/null

echo "Waiting for ${APP_URL}..."
ready=false
for _ in $(seq 1 30); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[ "$ready" = true ] || fail "frontend did not respond"

echo "Fetching index..."
body=$(curl -fsS "$APP_URL/")
grep -q '<div id="root"></div>' <<<"$body" || fail "index.html has no #root element"
echo "OK: index"

echo "Fetching JS bundle..."
BUNDLE=$(grep -o '/assets/[^"]*\.js' <<<"$body" | head -n1)
[ -n "$BUNDLE" ] || fail "index.html references no /assets/*.js bundle"
headers=$(curl -fsS -D - -o /dev/null "$APP_URL$BUNDLE") || fail "bundle ${BUNDLE} not served"
grep -qi 'cache-control: public, max-age=31536000, immutable' <<<"$headers" \
  || fail "bundle ${BUNDLE} missing immutable Cache-Control"
echo "OK: bundle ${BUNDLE}"

echo "Fetching a client-side route..."
headers=$(curl -fsS -D - -o /dev/null "$APP_URL/budgets")
body=$(curl -fsS "$APP_URL/budgets")
grep -q '<div id="root"></div>' <<<"$body" || fail "SPA fallback did not serve index.html"
echo "OK: SPA fallback"

echo "Checking security headers..."
grep -qi 'x-frame-options: SAMEORIGIN' <<<"$headers" || fail "missing X-Frame-Options"
grep -qi 'x-content-type-options: nosniff' <<<"$headers" || fail "missing X-Content-Type-Options"
grep -qi 'cache-control: no-cache' <<<"$headers" || fail "index missing Cache-Control: no-cache"
echo "OK: headers"

echo "Frontend smoke test passed."
