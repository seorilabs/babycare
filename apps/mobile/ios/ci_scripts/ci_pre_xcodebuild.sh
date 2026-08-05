#!/bin/sh

# Xcode Cloud — archive 직전 iOS 마케팅/빌드 버전 주입.
#
# 정책: 어떤 트리거로 만든 빌드든 프로젝트 기본값(project.pbxproj 의 MARKETING_VERSION)이
# 그대로 아카이브·업로드되지 않도록 한다. 기본값이 스토어의 기존 버전 train 보다 낮으면
# TestFlight 업로드가 거부되거나, 더 나쁘게는 구버전 표기로 심사에 나가 신규 유저가 구버전
# 빌드를 받게 된다.
#
# 버전 소스:
#   CI_TAG(vX.Y.Z) 트리거 빌드만 허용한다. 브랜치 push나 태그가 아닌 API 호출은
#   비-제로 종료해 기본 프로젝트 버전의 archive를 차단한다.
# 산출은 scripts/resolve-release-version.mjs 로 marketing/build number 를 계산한다
# (GitHub Actions Google Play 배포 경로와 동일 로직 재사용). node 는 ci_post_clone 에서 설치됨.
#
# 검증: CI_PRE_XCODEBUILD_DRY_RUN=1 로 실행하면 agvtool 없이 산출 버전만 출력한다.

set -e

# resolver 스크립트는 이 스크립트 위치 기준으로 찾는다(ci_scripts 는 항상
# <repo>/apps/mobile/ios/ci_scripts 에 있으므로 4단계 상위가 저장소 루트).
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../../../.." && pwd)"
RESOLVER="${REPO_ROOT}/scripts/resolve-release-version.mjs"
# agvtool 대상은 Xcode Cloud 체크아웃 루트. 로컬/테스트에서는 저장소 루트.
REPO="${CI_PRIMARY_REPOSITORY_PATH:-${REPO_ROOT}}"

RELEASE_TAG="${CI_TAG:-}"
if [ -z "${RELEASE_TAG}" ]; then
  echo "CI_TAG가 없는 빌드는 허용하지 않음 — Xcode Cloud를 vX.Y.Z 태그 또는 태그를 지정한 API 호출로 실행해야 함" >&2
  exit 1
fi

echo "▸ 릴리즈 버전 산출 (tag=${RELEASE_TAG})"
OUTFILE="$(mktemp)"
trap 'rm -f "${OUTFILE}"' EXIT
# babycare 의 resolver 는 --tag 를 요구한다(RELEASE_TAG env 는 읽지 않음).
GITHUB_OUTPUT="${OUTFILE}" node "${RESOLVER}" --tag "${RELEASE_TAG}" --github-output >/dev/null

MARKETING="$(grep '^apple_marketing_version=' "${OUTFILE}" | cut -d= -f2)"
BUILD="$(grep '^apple_build_number=' "${OUTFILE}" | cut -d= -f2)"

if [ -z "${MARKETING}" ] || [ -z "${BUILD}" ]; then
  echo "  릴리즈 버전 산출 실패 (tag=${RELEASE_TAG})" >&2
  exit 1
fi

echo "  marketing=${MARKETING} build=${BUILD}"

if [ "${CI_PRE_XCODEBUILD_DRY_RUN}" = "1" ]; then
  # 검증용: 실제 프로젝트를 수정하지 않고 산출 결과만 남긴다.
  echo "DRY_RUN resolved marketing=${MARKETING} build=${BUILD} tag=${RELEASE_TAG}"
  exit 0
fi

cd "${REPO}/apps/mobile/ios"
agvtool new-marketing-version "${MARKETING}"
agvtool new-version -all "${BUILD}"
echo "✅ 버전 설정 완료: ${MARKETING} (${BUILD})"
