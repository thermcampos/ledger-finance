#!/usr/bin/env bash
# Smoke test for a built (native) backend image, run as prod runs it (QUARKUS_PROFILE=prod,
# Flyway migrate-at-start, JWT keys mounted like terraform/main.tf, TOTP key required).
# Starts Postgres + the given image, then exercises:
#   health -> sign-up -> login -> create account -> create transaction
#   -> list transactions -> account balance re-derived -> list budgets
#
# Usage: BACKEND_IMAGE=ghcr.io/thermcampos/ledger-finance/backend:pr-123 bash scripts/smoke-test-backend.sh
# Optional: GHCR_USER + GHCR_TOKEN to log in to GHCR before pulling.
# Needs: docker, curl, openssl, jq.
set -euo pipefail

BACKEND_IMAGE="${BACKEND_IMAGE:?BACKEND_IMAGE env var is required}"
DB_IMAGE="postgres:16"
NETWORK="ledger-smoke"
DB_CONTAINER="ledger-smoke-db"
API_CONTAINER="ledger-smoke-api"
DB_PASSWORD="ledger"
API_PORT="${API_PORT:-18080}"
API_URL="http://localhost:${API_PORT}"
EMAIL="smoke-test@ledger.app"
PASSWORD="Teste@123"
TXN_DESCRIPTION="smoke test transaction $(date +%s)"
KEYS_DIR="$(mktemp -d)"

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "Smoke test failed. Backend logs:"
    docker logs "$API_CONTAINER" 2>&1 | tail -n 200 || true
  fi
  docker rm -f "$API_CONTAINER" "$DB_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$KEYS_DIR"
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*"
  exit 1
}

# Splits curl's "-w '\n%{http_code}'" output into $status and $body.
request() {
  local out
  out=$(curl -s -w '\n%{http_code}' "$@")
  status=$(tail -n1 <<<"$out")
  body=$(sed '$d' <<<"$out")
}

if [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER is required with GHCR_TOKEN}" --password-stdin
fi

echo "Pulling images..."
docker pull "$BACKEND_IMAGE"
docker pull "$DB_IMAGE"

echo "Generating throwaway JWT key pair and TOTP key..."
openssl genrsa -out "$KEYS_DIR/privateKey.pem" 2048 2>/dev/null
openssl rsa -in "$KEYS_DIR/privateKey.pem" -pubout -out "$KEYS_DIR/publicKey.pem" 2>/dev/null
chmod 755 "$KEYS_DIR"
chmod 644 "$KEYS_DIR"/*.pem
TOTP_KEY=$(openssl rand -base64 32)

docker network create "$NETWORK" >/dev/null

echo "Starting Postgres..."
docker run -d --name "$DB_CONTAINER" --network "$NETWORK" \
  -e POSTGRES_DB=ledger \
  -e POSTGRES_USER=ledger \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  "$DB_IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -h 127.0.0.1 -U ledger -d ledger >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$DB_CONTAINER" pg_isready -h 127.0.0.1 -U ledger -d ledger >/dev/null || fail "Postgres not ready"

echo "Starting backend ${BACKEND_IMAGE}..."
docker run -d --name "$API_CONTAINER" --network "$NETWORK" -p "${API_PORT}:8080" \
  -v "$KEYS_DIR:/run/secrets/jwt:ro" \
  -e POSTGRES_DB=ledger \
  -e POSTGRES_HOST="$DB_CONTAINER" \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER=ledger \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -e SMALLRYE_JWT_SIGN_KEY_LOCATION=/run/secrets/jwt/privateKey.pem \
  -e MP_JWT_VERIFY_PUBLICKEY_LOCATION=/run/secrets/jwt/publicKey.pem \
  -e TOTP_ENCRYPTION_KEY="$TOTP_KEY" \
  -e DIGEST_TRIGGER_SECRET=smoke-test-digest-secret \
  -e RESEND_API_KEY=invalid-api-key-only-placeholder \
  "$BACKEND_IMAGE" >/dev/null

echo "Waiting for ${API_URL}/q/health..."
healthy=false
for _ in $(seq 1 60); do
  if curl -fsS "${API_URL}/q/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
done
[ "$healthy" = true ] || fail "backend did not become healthy"
echo "OK: health (Flyway migrated, datasource up)"

echo "Signing up ${EMAIL}..."
request -X POST -H 'Content-Type: application/json' "${API_URL}/auth/signup" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"displayName\":\"Smoke Test\"}"
[ "$status" = "201" ] || fail "sign-up returned HTTP ${status}, expected 201: ${body}"
echo "OK: sign-up"

echo "Logging in..."
request -X POST -H 'Content-Type: application/json' "${API_URL}/auth/login" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
[ "$status" = "200" ] || fail "login returned HTTP ${status}, expected 200: ${body}"
[ "$(jq -r '.status' <<<"$body")" = "AUTHENTICATED" ] || fail "login status is not AUTHENTICATED: ${body}"
TOKEN=$(jq -r '.token // empty' <<<"$body")
[ -n "$TOKEN" ] || fail "login response has no token: ${body}"
AUTH=(-H "Authorization: Bearer ${TOKEN}")
echo "OK: login"

echo "Creating account..."
request -X POST -H 'Content-Type: application/json' "${AUTH[@]}" "${API_URL}/accounts" \
  -d '{"name":"Smoke Checking","institution":"Smoke Bank","kind":"CHECKING","balance":100.00}'
[ "$status" = "200" ] || fail "create account returned HTTP ${status}, expected 200: ${body}"
ACCOUNT_ID=$(jq -r '.id // empty' <<<"$body")
[ -n "$ACCOUNT_ID" ] || fail "create account response has no id: ${body}"
echo "OK: create account (id ${ACCOUNT_ID})"

echo "Creating transaction..."
TODAY=$(date +%F)
request -X POST -H 'Content-Type: application/json' "${AUTH[@]}" "${API_URL}/transactions" \
  -d "{\"accountId\":${ACCOUNT_ID},\"description\":\"${TXN_DESCRIPTION}\",\"amount\":-25.50,\"occurredOn\":\"${TODAY}\"}"
[ "$status" = "200" ] || fail "create transaction returned HTTP ${status}, expected 200: ${body}"
echo "OK: create transaction"

echo "Listing transactions..."
request "${AUTH[@]}" "${API_URL}/transactions/account/${ACCOUNT_ID}"
[ "$status" = "200" ] || fail "list transactions returned HTTP ${status}, expected 200: ${body}"
grep -q "$TXN_DESCRIPTION" <<<"$body" || fail "created transaction not found in list: ${body}"
echo "OK: list transactions"

echo "Checking account balance was re-derived..."
request "${AUTH[@]}" "${API_URL}/accounts"
[ "$status" = "200" ] || fail "list accounts returned HTTP ${status}, expected 200: ${body}"
BALANCE=$(jq -r ".[] | select(.id == ${ACCOUNT_ID}) | .balance" <<<"$body")
[ "$(jq -n "${BALANCE:-0} == 74.5")" = "true" ] || fail "balance is '${BALANCE}', expected 74.50"
echo "OK: balance 74.50"

echo "Listing budgets..."
request "${AUTH[@]}" "${API_URL}/budgets"
[ "$status" = "200" ] || fail "list budgets returned HTTP ${status}, expected 200: ${body}"
echo "OK: list budgets"

echo "Backend smoke test passed."
