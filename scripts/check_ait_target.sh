#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "apps-in-toss/apps-in-toss.config.json"
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

node -e '
const {readFileSync} = require("node:fs");
const config = JSON.parse(readFileSync("apps-in-toss/apps-in-toss.config.json", "utf8"));
const policy = config.monetization;
if (policy?.ads !== false || policy?.inAppPurchase !== false || policy?.tossPay !== false) {
  console.error("AIT v1 monetization policy must keep ads, IAP, and Toss Pay disabled.");
  process.exit(1);
}
'

if rg -n 'createOneTimePurchaseOrder|getProductItemList|loadFullScreenAd|loadBannerAd|TossPay|tossPay|\bIAP\b' \
  apps/ait/package.json apps/ait/src; then
  echo "AIT v1 contains an ad, IAP, or Toss Pay integration without a policy update." >&2
  exit 1
fi

if rg -n '확정 필요|Welcome|About Granite' \
  apps/ait/granite.config.ts apps/ait/src apps/ait/pages; then
  echo "AIT target still contains placeholder or template UI." >&2
  exit 1
fi

echo "AppsInToss target contract check passed."
