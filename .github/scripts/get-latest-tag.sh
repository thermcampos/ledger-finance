#!/usr/bin/env bash
# Usage: get-latest-tag.sh <namespace/repo>
# Requires DOCKERHUB_USERNAME and DOCKERHUB_TOKEN in env (inject via Doppler)
set -euo pipefail

REPO="$1"

TOKEN=$(printf '{"username":"%s","password":"%s"}' "$DOCKERHUB_USERNAME" "$DOCKERHUB_TOKEN" \
  | curl -sf -X POST \
    -H "Content-Type: application/json" \
    --data @- \
    https://hub.docker.com/v2/users/login \
  | jq -r .token)

TAG=$(curl -sf \
  -H "Authorization: JWT ${TOKEN}" \
  "https://hub.docker.com/v2/repositories/${REPO}/tags?page_size=25&ordering=-last_updated" \
  | jq -r '[.results[] | select(.name != "latest")] | first | .name')

if [ -z "$TAG" ] || [ "$TAG" = "null" ]; then
  echo "ERROR: no tag found for ${REPO}" >&2
  exit 1
fi

echo "$TAG"
