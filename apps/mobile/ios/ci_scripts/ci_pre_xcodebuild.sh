#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../../../.." && pwd)"
REPO="${CI_PRIMARY_REPOSITORY_PATH:-${REPO_ROOT}}"
RELEASE_TAG="${CI_TAG:-}"
INFO_PLIST="${REPO}/apps/mobile/ios/BabyCare/Info.plist"

fail() {
  echo "[xcode-cloud] $1" >&2
  exit 1
}

printf '%s\n' "$RELEASE_TAG" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
  || fail "stable SemVer 태그 vX.Y.Z만 허용함: ${RELEASE_TAG:-missing}"
command -v node >/dev/null 2>&1 || fail "중앙 release authority를 실행할 Node.js가 없다"
[ -f "$INFO_PLIST" ] || fail "Info.plist를 찾지 못함: $INFO_PLIST"

AUTHORITY_SHA="9afa357f9ba6c8d6a813c7cec7ad3d35c626bdd5"
APPLIER_SHA256="b399afde0016e23947e173437e266aa83071079d1345b41ff580ebfe63357d6f"
AUTHORITY_SHA256="ca9ef5b4fe326323840b171f9e6ed069cb182d2aee8e88b72e352c57514d466b"
AUTHORITY_DIR="$(mktemp -d)"
trap 'rm -rf -- "$AUTHORITY_DIR"' EXIT INT TERM
git -C "$REPO" fetch --force --tags origin >/dev/null
BASE_URL="https://raw.githubusercontent.com/seorilabs/.github/${AUTHORITY_SHA}/scripts/release"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "${BASE_URL}/xcode-cloud-apply-tag-version.mjs" -o "${AUTHORITY_DIR}/xcode-cloud-apply-tag-version.mjs"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "${BASE_URL}/tag-version-authority.mjs" -o "${AUTHORITY_DIR}/tag-version-authority.mjs"
(
  cd "$AUTHORITY_DIR"
  printf '%s  %s\n' "$APPLIER_SHA256" xcode-cloud-apply-tag-version.mjs | shasum -a 256 -c
  printf '%s  %s\n' "$AUTHORITY_SHA256" tag-version-authority.mjs | shasum -a 256 -c
)

BINDING="$(node "${AUTHORITY_DIR}/xcode-cloud-apply-tag-version.mjs" \
  --tag "$RELEASE_TAG" --repository "$REPO" --info-plist "$INFO_PLIST" --dry-run)"
MARKETING="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).appleMarketingVersion ?? ""))' "$BINDING")"
BUILD="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).appleBuildNumber ?? ""))' "$BINDING")"
[ -n "$MARKETING" ] && printf '%s\n' "$BUILD" | grep -Eq '^[1-9][0-9]*$' \
  || fail "중앙 release binding 결과가 불완전함"
echo "  marketing=${MARKETING} build=${BUILD}"

if [ "${CI_PRE_XCODEBUILD_DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN resolved marketing=${MARKETING} build=${BUILD} tag=${RELEASE_TAG}"
  exit 0
fi

node "${AUTHORITY_DIR}/xcode-cloud-apply-tag-version.mjs" \
  --tag "$RELEASE_TAG" --repository "$REPO" --info-plist "$INFO_PLIST" \
  > "${REPO}/apps/mobile/ios/.seori-release-binding.json"
cd "${REPO}/apps/mobile/ios"
agvtool new-marketing-version "$MARKETING"
agvtool new-version -all "$BUILD"
echo "✅ 중앙 태그 버전 설정 완료: ${MARKETING} (${BUILD})"
