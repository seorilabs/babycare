# Xcode Cloud ci_scripts

babycare iOS(App Store) 배포는 **Xcode Cloud** 경로를 정본으로 한다. Xcode Cloud 가 빌드
각 단계에서 자동 실행하는 훅 스크립트 모음.

- `ci_post_clone.sh` — 클론 직후 Node 24/pnpm/CocoaPods 설치 + Firebase secret 복원 + JS 의존성 + `pod install`.
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
스토어로 나가는 것을 원천 차단**한다. `ci_pre_xcodebuild.sh` 는 다음 계약만 허용한다.

1. **`CI_TAG`(vX.Y.Z) 트리거 빌드** → 그 태그로 `scripts/resolve-release-version.mjs`가
   `CFBundleShortVersionString`을 산출하고, Xcode Cloud의 `CI_BUILD_NUMBER`를
   `CFBundleVersion`으로 `agvtool`에 주입한다.
2. **`CI_TAG` 또는 `CI_BUILD_NUMBER` 부재(브랜치/잘못된 API 호출)** → **비-제로 종료**로
   archive를 실패시킨다.

> 마케팅 버전의 정본은 릴리즈 태그이고, build number의 정본은 Xcode Cloud의 monotonic
> `CI_BUILD_NUMBER`다. `v1.0.5` 실제 App Store Connect readback은 `1.0.5`/`52`였다.

## App Store Connect 쪽 수동 설정(1회)

repo 파일만으로는 완결되지 않는다. App Store Connect / Xcode 에서:

1. babycare 앱(`com.seorilabs.babycare`)에 **Xcode Cloud workflow** 생성 — 소스=이 저장소,
   워크스페이스 `apps/mobile/ios/BabyCare.xcworkspace`, scheme `BabyCare`, 시작 조건=태그
   `v*.*.*`(또는 API 트리거).
2. **매니지드 서명** 사용(cert/profile 시크릿 불필요).
3. archive 액션의 **배포 준비 = `App Store Connect`** (TestFlight 내부 전용으로 두면 App Store
   버전의 "빌드 추가"에서 회색·선택 불가).
4. secret 환경 변수 `FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64`에 prod
   `GoogleService-Info.plist`의 base64를 저장한다. 누락·오염 시 `ci_post_clone.sh`가 실패한다.
5. `@seorilabs/platform-sdk` 설치를 위해 read-only GitHub Packages 권한을 가진
   `GITHUB_PACKAGES_TOKEN` secret을 저장한다. 누락 시 `ci_post_clone.sh`가 의존성 설치 전에
   fail-closed 한다. 토큰 값은 저장소나 로그에 남기지 않는다.
6. ASC API 키(팀 공용 `APP_STORE_CONNECT_*`)로 백오피스가 `ciBuildRuns` 를 트리거하도록
   `XCODE_CLOUD_APP_STORE_REPOS` 에 `seorilabs/babycare` 추가.

## 로컬 검증 (dry-run)

`agvtool`(macOS 전용) 없이 산출 버전만 확인:

```sh
# CI_TAG 경로
CI_TAG=v1.0.0 CI_BUILD_NUMBER=52 CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
# 실패 경로 (CI_TAG 또는 CI_BUILD_NUMBER 없음 — 항상 실패가 정상)
CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
```
