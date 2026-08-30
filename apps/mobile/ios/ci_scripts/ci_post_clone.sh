#!/bin/sh

# Xcode Cloud — babycare(React Native 모노레포) iOS 빌드 사전 준비.
#
# 이 스크립트는 반드시 .xcworkspace 와 같은 디렉터리 트리(apps/mobile/ios/ci_scripts/)에
# 있어야 하며, Xcode Cloud 가 저장소 클론 직후 자동 실행한다. Xcode Cloud 환경에는
# Node/pnpm/CocoaPods 가 기본 제공되지 않으므로 여기서 설치하고 JS 의존성 + Pods 를
# 구성한다. 코드 서명은 Xcode Cloud 매니지드 서명이 처리하므로 여기서 다루지 않는다.
#
# Firebase iOS 설정(GoogleService-Info.plist)은 저장소에 커밋하지 않는다.
# Xcode Cloud secret FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64로 복원하며,
# 누락되거나 bundle id가 다르면 archive 전에 실패한다.

set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

REPO="${CI_PRIMARY_REPOSITORY_PATH}"
MOBILE="${REPO}/apps/mobile"
IOS="${MOBILE}/ios"

echo "▸ Node 24 / CocoaPods 설치 (Homebrew)"
brew install node@24 cocoapods
export PATH="/opt/homebrew/opt/node@24/bin:/usr/local/opt/node@24/bin:${PATH}"
node --version

echo "▸ pnpm 설치 (저장소 핀 버전)"
# Homebrew node 는 최신 버전에서 corepack 을 번들하지 않으므로 npm 으로 직접 설치한다.
# 버전은 package.json 의 packageManager 핀(pnpm@11.14.0)과 일치시킨다.
npm install -g pnpm@11.14.0

echo "▸ GitHub Packages 인증 (@seorilabs 비공개 패키지)"
if [ -z "${GITHUB_PACKAGES_TOKEN:-}" ]; then
  echo "GITHUB_PACKAGES_TOKEN secret이 없어 private package를 설치할 수 없음" >&2
  exit 1
fi
printf '//npm.pkg.github.com/:_authToken=%s\n' "${GITHUB_PACKAGES_TOKEN}" >> "${HOME}/.npmrc"

echo "▸ JS 의존성 설치 (pnpm workspace — 저장소 루트)"
cd "${REPO}"
pnpm install --frozen-lockfile

echo "▸ Firebase iOS 설정 확인 (GoogleService-Info.plist)"
GS_PLIST="${IOS}/GoogleService-Info.plist"
if [ -z "${FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64:-}" ]; then
  echo "FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64 secret이 없어 iOS Firebase 설정을 복원할 수 없음" >&2
  exit 1
fi

node -e 'const fs=require("node:fs"); fs.writeFileSync(process.argv[1], Buffer.from(process.env.FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64, "base64"));' "${GS_PLIST}"
plutil -lint "${GS_PLIST}"

FIREBASE_BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "${GS_PLIST}" 2>/dev/null || true)"
if [ "${FIREBASE_BUNDLE_ID}" != "com.seorilabs.babycare" ]; then
  echo "GoogleService-Info.plist BUNDLE_ID 불일치: ${FIREBASE_BUNDLE_ID:-missing}" >&2
  exit 1
fi
echo "  Xcode Cloud secret에서 복원 및 bundle id 검증 완료"

echo "▸ CocoaPods 설치 (use_frameworks + RNFB 혼합 링키지)"
cd "${IOS}"
pod install

echo "✅ ci_post_clone 완료"
