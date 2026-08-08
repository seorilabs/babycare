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
if (policy?.ads !== true || policy?.rewardedPlacement !== "stats_detail" ||
    policy?.rewardDurationHours !== 24 ||
    policy?.adGroupIdSource !== "AIT_REWARDED_AD_GROUP_ID" ||
    policy?.inAppPurchase !== false || policy?.tossPay !== false) {
  console.error("AIT monetization must allow only the 24-hour stats-detail rewarded placement.");
  process.exit(1);
}
if (config.legal?.privacyUrl !== "https://www.seorilabs.com/privacy/" ||
    config.legal?.termsUrl !== "https://www.seorilabs.com/terms/") {
  console.error("AIT legal URLs must use the verified Seorilabs pages.");
  process.exit(1);
}
if (config.inAppFeatures?.length !== 1 || config.inAppFeatures[0]?.route !== "/") {
  console.error("AIT v1 must register exactly one root in-app feature.");
  process.exit(1);
}
if (config.release?.sandboxQa !==
    "latest-bundle-test-push-succeeded: runtime-qa-pending" ||
    config.release?.latestPrivateUpload?.isTested !== true) {
  console.error("AIT sandbox state must distinguish installation from runtime QA completion.");
  process.exit(1);
}
'

if rg -n 'createOneTimePurchaseOrder|getProductItemList|loadBannerAd|TossPay|tossPay|\bIAP\b' \
  apps/ait/package.json apps/ait/src; then
  echo "AIT contains an unapproved banner, IAP, or Toss Pay integration." >&2
  exit 1
fi

rg -q 'loadFullScreenAd' apps/ait/src/services/rewarded-ad.ts
rg -q 'userEarnedReward' apps/ait/src/services/rewarded-ad.ts

if rg -n '확정 필요|Welcome|About Granite' \
  apps/ait/granite.config.ts apps/ait/src apps/ait/pages; then
  echo "AIT target still contains placeholder or template UI." >&2
  exit 1
fi

echo "AppsInToss target contract check passed."
