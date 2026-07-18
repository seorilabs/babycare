#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# These values exist only for the local Emulator Suite. They do not select the
# production Functions region or persist a deployable invite secret.
export FUNCTIONS_REGION="${FUNCTIONS_REGION:-us-central1}"
export INVITE_CODE_HMAC_KEY="${INVITE_CODE_HMAC_KEY:-$(openssl rand -hex 32)}"
export ENFORCE_APP_CHECK=false

SECRET_FILE="$ROOT_DIR/firebase/functions/.secret.local"
if [[ ! -f "$SECRET_FILE" ]]; then
  umask 077
  printf 'INVITE_CODE_HMAC_KEY=%s\n' "$INVITE_CODE_HMAC_KEY" > "$SECRET_FILE"
fi

# A physical Android device reaches Metro through adb reverse. It needs the
# same tunnel for every Emulator Suite service used by the native Firebase SDK.
if command -v adb >/dev/null 2>&1; then
  while read -r serial state; do
    [[ "$state" == "device" ]] || continue
    for port in 9099 8085 9150 9199 5001; do
      adb -s "$serial" reverse "tcp:$port" "tcp:$port"
    done
    echo "Configured Firebase Emulator tunnels for Android device $serial"
  done < <(adb devices | awk 'NR > 1 {print $1, $2}')
fi

cd "$ROOT_DIR"
pnpm --dir firebase/functions build
exec pnpm exec firebase emulators:start \
  --config firebase/firebase.mobile.json \
  --project demo-babycare \
  --only auth,firestore,storage,functions
