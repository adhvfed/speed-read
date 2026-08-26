#!/usr/bin/env bash
# Build and deploy speed-read to its Cloudflare Pages project.
set -euo pipefail

PROJECT="${PROJECT:-speed-read}"
DIST_DIR="${DIST_DIR:-dist}"
BRANCH="${BRANCH:-main}"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  npm run build
fi

if [[ ! -d "$DIST_DIR" ]]; then
  echo "deploy.sh: $DIST_DIR not found — build first" >&2
  exit 1
fi

npx wrangler pages deploy "$DIST_DIR" \
  --project-name "$PROJECT" \
  --branch "$BRANCH" \
  --commit-dirty=true

echo "Deployed $PROJECT to Cloudflare Pages"
