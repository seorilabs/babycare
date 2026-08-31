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
# marketing version은 exact tag 자체의 X.Y.Z이며, build number는 Xcode Cloud가
# 단조 증가시키는 CI_BUILD_NUMBER를 사용한다.
#
# 검증: CI_PRE_XCODEBUILD_DRY_RUN=1 로 실행하면 agvtool 없이 산출 버전만 출력한다.

set -e

# ci_scripts 는 항상 <repo>/apps/mobile/ios/ci_scripts 에 있으므로 4단계 상위가 저장소 루트다.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../../../.." && pwd)"
# agvtool 대상은 Xcode Cloud 체크아웃 루트. 로컬/테스트에서는 저장소 루트.
REPO="${CI_PRIMARY_REPOSITORY_PATH:-${REPO_ROOT}}"

RELEASE_TAG="${CI_TAG:-}"
if [ -z "${RELEASE_TAG}" ]; then
  echo "CI_TAG가 없는 빌드는 허용하지 않음 — Xcode Cloud를 vX.Y.Z 태그 또는 태그를 지정한 API 호출로 실행해야 함" >&2
  exit 1
fi

if ! printf '%s\n' "${RELEASE_TAG}" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo "stable SemVer 태그 vX.Y.Z만 허용함: ${RELEASE_TAG}" >&2
  exit 1
fi

TAG_COMMIT="$(git -C "${REPO}" rev-parse --verify "refs/tags/${RELEASE_TAG}^{commit}")" || {
  echo "체크아웃에서 exact tag commit을 확인할 수 없음: ${RELEASE_TAG}" >&2
  exit 1
}
HEAD_COMMIT="$(git -C "${REPO}" rev-parse --verify 'HEAD^{commit}')"
if [ "${TAG_COMMIT}" != "${HEAD_COMMIT}" ]; then
  echo "Xcode Cloud HEAD가 exact tag commit과 다름: tag=${TAG_COMMIT} HEAD=${HEAD_COMMIT}" >&2
  exit 1
fi

MARKETING="${RELEASE_TAG#v}"
BUILD="${CI_BUILD_NUMBER:-}"

if [ -z "${MARKETING}" ] || [ -z "${BUILD}" ]; then
  echo "  릴리즈 버전 산출 실패 (tag=${RELEASE_TAG}, CI_BUILD_NUMBER 필수)" >&2
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
