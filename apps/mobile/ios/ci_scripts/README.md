# Xcode Cloud ci_scripts

babycare iOS(App Store) 배포는 **Xcode Cloud** 경로를 정본으로 한다. Xcode Cloud 가 빌드
각 단계에서 자동 실행하는 훅 스크립트 모음.

- `ci_post_clone.sh` — 클론 직후 툴체인(node/pnpm/CocoaPods) 설치 + JS 의존성 + `pod install`.
- `ci_pre_xcodebuild.sh` — **archive 직전 iOS 마케팅/빌드 버전 주입**.

## 왜 Xcode Cloud 인가

- macOS Action Minutes 쿼타 절감(GitHub Actions macos 러너 대신).
- Xcode 26.x + Firebase 정적 라이브러리 회귀 대응. babycare 는 RNFirebase 를 쓰므로
  `apps/mobile/ios/Podfile` 이 `use_frameworks! :linkage => :static` +
  `$RNFirebaseAsStaticFramework = true` + `pre_install` 에서 RNFB* 브리지 pod 만
  `static_library` 로 강제하는 혼합 링키지여야 archive 가 성공한다(이미 구성됨).

GitHub Actions 경로(`.github/workflows/deploy-app-store.yml`)는 fallback 으로만 남겨두며,
백오피스는 이 repo 를 `XCODE_CLOUD_APP_STORE_REPOS` allowlist 에 넣어 App Store 배포를
GH workflow_dispatch 가 아니라 App Store Connect `POST /v1/ciBuildRuns` 로 트리거한다.

## 버전 주입 정책

`project.pbxproj` 의 `MARKETING_VERSION` 기본값이 그대로 아카이브되어 **구버전 표기 빌드가
스토어로 나가는 것을 원천 차단**한다. `ci_pre_xcodebuild.sh` 가 버전을 결정하는 순서:

1. **`CI_TAG`(vX.Y.Z) 트리거 빌드** → 그 태그로 `scripts/resolve-release-version.mjs` 가
   `CFBundleShortVersionString`(marketing) / `CFBundleVersion`(build number)을 산출해
   `agvtool` 로 주입. build number = `major*1_000_000 + minor*1_000 + patch`
   (예: v1.0.0 → marketing `1.0.0`, build `1000000`). SemVer 증가에 따라 단조 증가.
2. **`CI_TAG` 부재(브랜치/검증 빌드)** → `git describe --tags --abbrev=0` 로 찾은 **가장 최근
   릴리즈 태그**로 폴백 주입.
3. **태그를 전혀 결정할 수 없음** → **비-제로 종료**로 archive 를 실패시킨다.

> Xcode Cloud UI 의 자체 빌드번호(monotonic auto-increment)와 무관하게, `agvtool` 주입이
> archive 시점의 `CFBundleVersion` authoritative 소스다. 최종 버전 소스는 항상 릴리즈 태그다.

## App Store Connect 쪽 수동 설정(1회)

repo 파일만으로는 완결되지 않는다. App Store Connect / Xcode 에서:

1. babycare 앱(`com.seorilabs.babycare`)에 **Xcode Cloud workflow** 생성 — 소스=이 저장소,
   워크스페이스 `apps/mobile/ios/BabyCare.xcworkspace`, scheme `BabyCare`, 시작 조건=태그
   `v*.*.*`(또는 API 트리거).
2. **매니지드 서명** 사용(cert/profile 시크릿 불필요).
3. archive 액션의 **배포 준비 = `App Store Connect`** (TestFlight 내부 전용으로 두면 App Store
   버전의 "빌드 추가"에서 회색·선택 불가).
4. ASC API 키(팀 공용 `APP_STORE_CONNECT_*`)로 백오피스가 `ciBuildRuns` 를 트리거하도록
   `XCODE_CLOUD_APP_STORE_REPOS` 에 `seorilabs/babycare` 추가.

## 로컬 검증 (dry-run)

`agvtool`(macOS 전용) 없이 산출 버전만 확인:

```sh
# CI_TAG 경로
CI_TAG=v1.0.0 CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
# 폴백/실패 경로 (CI_TAG 없음 — 최신 태그 없으면 실패 처리가 정상)
CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
```
