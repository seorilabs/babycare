#!/usr/bin/env bash
set -euo pipefail

scan_paths=(
  "packages/product-core/src"
  "packages/product-core/tests"
  "packages/product-data/src"
)

for path in "${scan_paths[@]}"; do
  if [ ! -d "${path}" ]; then
    echo "Missing architecture scan path: ${path}" >&2
    exit 1
  fi
done

forbidden_pattern='(from|import|require|extends|class_name).*(react-native|@react-native|expo|Firebase|firebase|Firestore|firestore|AppsInToss|Toss|StoreKit|BillingClient|AdMob|NativeModules|AsyncStorage|Google|Apple|Android|iOS|axios|@tanstack|@reduxjs|zustand)'

if rg -n "${forbidden_pattern}" "${scan_paths[@]}" --glob '!README.md'; then
  echo "Architecture boundary violation found in product core/data." >&2
  exit 1
fi

if [ -f "packages/product-core/package.json" ]; then
  runtime_dependencies="$(node -e "const p=require('./packages/product-core/package.json'); process.stdout.write(Object.keys(p.dependencies || {}).join('\\n'))")"
  if [ -n "${runtime_dependencies}" ]; then
    echo "product-core must not have runtime dependencies:" >&2
    echo "${runtime_dependencies}" >&2
    exit 1
  fi
fi

if [ -f "packages/product-data/package.json" ]; then
  unexpected_data_dependencies="$(node -e "const p=require('./packages/product-data/package.json'); const allowed=new Set(['@babycare/product-core']); process.stdout.write(Object.keys(p.dependencies || {}).filter((name) => !allowed.has(name)).join('\n'))")"
  if [ -n "${unexpected_data_dependencies}" ]; then
    echo "product-data may depend only on product-core:" >&2
    echo "${unexpected_data_dependencies}" >&2
    exit 1
  fi
fi

echo "Architecture boundary check passed."
