#!/usr/bin/env bash
# Usage: get-latest-tag.sh <package-name>
#   e.g. get-latest-tag.sh ledger-finance/backend
# Requires GITHUB_TOKEN (with read:packages) in env.
# Optional: GITHUB_OWNER (defaults to "thermcampos").
set -euo pipefail

PACKAGE="$1"
OWNER="${GITHUB_OWNER:-thermcampos}"

# URL-encode slashes so nested package names survive the path segment.
PACKAGE_ENC="${PACKAGE//\//%2F}"

TAG=$(curl -sf \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/users/${OWNER}/packages/container/${PACKAGE_ENC}/versions?per_page=100" \
  | jq -r '
      [ .[]
        | { updated_at,
            tags: (.metadata.container.tags | map(select(. != "latest" and . != "buildcache"))) }
        | select(.tags | length > 0) ]
      | sort_by(.updated_at) | last | .tags[0]
    ')

if [ -z "$TAG" ] || [ "$TAG" = "null" ]; then
  echo "ERROR: no tag found for ${OWNER}/${PACKAGE}" >&2
  exit 1
fi

echo "$TAG"
