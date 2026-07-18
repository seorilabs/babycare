#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export INVITE_CODE_HMAC_KEY="${INVITE_CODE_HMAC_KEY:-$(openssl rand -hex 32)}"

SECRET_FILE="$ROOT_DIR/firebase/functions/.secret.local"
if [[ ! -f "$SECRET_FILE" ]]; then
  umask 077
  printf 'INVITE_CODE_HMAC_KEY=%s\n' "$INVITE_CODE_HMAC_KEY" > "$SECRET_FILE"
fi

cd "$ROOT_DIR"
pnpm --dir firebase/functions build
exec pnpm exec firebase emulators:exec \
  --config firebase/firebase.mobile.json \
  --project demo-babycare \
  --only auth,firestore,functions \
  "node --experimental-strip-types --test firebase/tests/mobile-shared-flow.test.mjs"
