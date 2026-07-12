#!/usr/bin/env bash
set -euo pipefail

required_dirs=(
  "packages/product-core/src/domain"
  "packages/product-core/src/use_cases"
  "packages/product-core/src/ports"
  "packages/product-core/tests"
)

for dir in "${required_dirs[@]}"; do
  if [ ! -d "${dir}" ]; then
    echo "Missing core directory: ${dir}" >&2
    exit 1
  fi
done

test_files=()
while IFS= read -r file; do
  test_files+=("${file}")
done < <(find packages/product-core/tests -type f \( -name "*.test.ts" -o -name "*.test.mjs" \) -print | sort)

if [ "${#test_files[@]}" -gt 0 ]; then
  node --test --experimental-strip-types "${test_files[@]}"
else
  echo "Core test scaffold is present. Add product-specific pure tests under packages/product-core/tests."
fi
