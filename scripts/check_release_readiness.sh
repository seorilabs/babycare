#!/usr/bin/env bash
set -euo pipefail

required_paths=(
  "docs/01-planning/product-spec.md"
  "docs/01-planning/release-targets.md"
  "docs/05-markets/google-play.md"
  "docs/05-markets/app-store.md"
  "docs/05-markets/apps-in-toss.md"
  "docs/05-markets/firebase.md"
  "docs/06-release/release-checklist.md"
)

required_release_configs=(
  "play-store/google-play.config.json"
  "app-store/app-store.config.json"
  "apps-in-toss/apps-in-toss.config.json"
  "apps/ait/granite.config.ts"
)

echo "Release readiness inventory"
echo

blockers=0

for path in "${required_paths[@]}"; do
  if [ ! -f "${path}" ]; then
    echo "Missing release source file: ${path}" >&2
    blockers=1
  fi
done

existing_release_configs=()
for file in "${required_release_configs[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "Missing release config: ${file}" >&2
    blockers=1
    continue
  fi

  existing_release_configs+=("${file}")
done

scan_targets=("${required_paths[@]}")
if [ "${#existing_release_configs[@]}" -gt 0 ]; then
  scan_targets+=("${existing_release_configs[@]}")
fi

if rg -n "확정 필요|TBD|TODO" "${scan_targets[@]}"; then
  echo
  echo "Release blockers remain. Resolve placeholders before public submission or deployment." >&2
  blockers=1
fi

if rg -n '^- \[ \]' "docs/06-release/release-checklist.md"; then
  echo
  echo "Release checklist still has incomplete approval, signing, privacy, asset, or QA gates." >&2
  blockers=1
fi

if ! bash scripts/check_mobile_target.sh; then
  echo "Mobile target or startup asset gate failed." >&2
  blockers=1
fi

if [ -f "apps/ait/granite.config.ts" ] && ! bash scripts/check_ait_target.sh; then
  echo "AppsInToss target gate failed." >&2
  blockers=1
fi

if ! node scripts/check-app-privacy.mjs; then
  echo "App Store privacy source-of-truth gate failed." >&2
  blockers=1
fi

if ! node scripts/check-store-screenshots.mjs; then
  echo "App Store screenshot set gate failed." >&2
  blockers=1
fi

if rg -n "ca-app-pub-3940256099942544|MOBILE_REWARDED_AD_UNIT_ID = ''" \
  apps/mobile/app.json \
  apps/mobile/src/adapters/ads/mobile-rewarded-ad.ts; then
  echo
  echo "Production AdMob app IDs and rewarded unit ID are not configured." >&2
  blockers=1
fi

if [ "${blockers}" -ne 0 ]; then
  exit 1
fi

echo "Release readiness checklist is complete."
