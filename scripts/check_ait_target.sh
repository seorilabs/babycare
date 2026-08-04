#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "apps/ait/package.json"
  "apps/ait/granite.config.ts"
  "apps/ait/src/_app.tsx"
  "apps/ait/src/pages/index.tsx"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "Missing initialized AIT target file: ${file}" >&2
    exit 1
  fi
done

rg -q '"build": "ait build"' apps/ait/package.json
rg -q "appName: 'babynest'" apps/ait/granite.config.ts
rg -q "displayName: '함께봄: 아기돌봄 기록'" apps/ait/granite.config.ts
rg -q 'TDSProvider' apps/ait/src/_app.tsx

if rg -n '확정 필요|Welcome|About Granite' \
  apps/ait/granite.config.ts apps/ait/src apps/ait/pages; then
  echo "AIT target still contains placeholder or template UI." >&2
  exit 1
fi

echo "AppsInToss target contract check passed."
