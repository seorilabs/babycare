# BabyCare Mobile

Google Play와 Apple App Store용 Community CLI 기반 bare React Native target이다. 현재 native target name `BabyCare`와 bundle/application ID `com.seorilabs.babycare.dev`는 개발용이다. 최종 한국어/영어 앱 이름과 production package/bundle ID는 `확정 필요`다.

## 현재 구현

- 로컬 온보딩: 양육자 이름, 아기 이름·생년월일.
- 수유(모유 타이머/유축/분유/이유식), 기저귀, 수면 시작·종료 기록.
- 마지막 기록과 오늘 요약 홈, 기록자 타임라인, 12시간/7일/30일 기본 통계.
- 본인 기록 soft delete, 시스템 dark mode, AsyncStorage 재실행 보존.
- iOS/Android 제품형 native launch surface.
- RNFirebase Auth, Firestore 그룹·아기·돌봄 기록, Functions invite callable adapter와 외부 문서 decoder.
- 인증 user/group/baby별 durable event+outbox, local-first coordinator, sync 상태 banner와 권한 회수 cache purge lifecycle.

현재 실행 composition은 **로컬 개발 모드**다. `LocalSessionRepository`와 `PersistentCareEventRepository`가 기기 AsyncStorage를 사용하고 analytics는 no-op이다. cloud용 `care-event-container.ts`와 `packages/product-data` 기반 local-first 경로는 구현했지만 실제 project/client config와 production Auth provider가 없어 `src/app/container.ts`에서 선택하지 않는다. 화면의 초대 코드는 미리보기일 뿐 다른 기기와 연결되지 않는다.

아직 제공하지 않는 것:

- production Auth 계정/provider와 실제 session/group/baby 화면 흐름.
- Firebase adapter의 기본 화면 composition, 실제 Firestore 공동 기록과 cloud 복구.
- 실제 project의 초대 발급·수락 callable과 멤버 제거/cache purge 실기기 검증.
- 서로 다른 기기의 active sleep 충돌 UX와 실제 project 검증.
- Firebase Analytics/Crashlytics/App Check/FCM.
- production signing과 마켓용 ID·아이콘.

## 구조

```text
App.tsx                         # target delivery/UI composition
src/app/container.ts            # core use case + adapter composition root
src/app/care-event-container.ts # 인증된 cloud sync composition factory
src/app/session.ts              # local development session mapping
src/screens/                    # home/timeline/stats/more/onboarding
src/components/                 # quick record modal, tab bar, sync status banner
src/adapters/local/             # AsyncStorage development adapters
src/adapters/firebase/          # RNFirebase port adapters + document decoders
src/adapters/system/            # target system adapters
../../packages/product-data/    # target 공용 local-first store/coordinator
android/                        # com.seorilabs.babycare.dev
ios/BabyCare/                   # com.seorilabs.babycare.dev
```

`packages/product-core`의 use case/port와 `packages/product-data`의 target 공용 동기화 정책을 import한다. Firebase/AsyncStorage/native API 구현은 adapter 또는 app layer에 두고 core/data package로 올리지 않는다.

## 요구 환경

- repo 기준 Node 24~26, pnpm 11.12.
- React Native `0.85.3`, React `19.2.3`, RNFirebase `25.1.0`은 lock/package 기준 조합이다.
- Android Studio/SDK, Temurin JDK 21과 emulator 또는 device. JDK 22는 현재 RN/Gradle 조합의 `jlink` 단계에서 실패한다.
- iOS는 macOS, Xcode, Ruby Bundler와 CocoaPods.

루트에서 의존성을 설치한다.

```bash
pnpm install
```

iOS native dependency를 처음 설치하거나 Podfile/lock이 바뀌었을 때:

```bash
cd apps/mobile
bundle install
cd ios
bundle exec pod install
```

iOS는 Firebase 권장 static framework 설정과 RNFirebase 호환을 위해 `use_frameworks! :linkage => :static`, `$RNFirebaseAsStaticFramework = true`를 사용한다. RN 0.84+ prebuilt RNCore module visibility 문제를 피하려고 `pre_install`에서 `RNFB*` pod만 static library로 강제한다. RN/RNFirebase를 올릴 때 이 workaround 제거 가능 여부를 먼저 확인한다.

## 실행

repo 루트의 첫 터미널:

```bash
pnpm --filter @babycare/mobile start
```

다른 터미널에서 target을 실행한다.

```bash
pnpm --filter @babycare/mobile android
pnpm --filter @babycare/mobile ios
```

Metro를 별도로 실행하지 않아도 target 명령이 시작을 제안할 수 있지만, 반복 QA에서는 Metro를 먼저 띄워 로그를 분리한다.

로컬 데이터를 다시 만들려면 앱 `더보기 → 로컬 데이터 초기화`를 사용한다.

## 검증

repo 루트에서 실행한다.

```bash
pnpm --filter @babycare/mobile lint
pnpm --filter @babycare/mobile typecheck
pnpm --filter @babycare/mobile test
pnpm run check:mobile
```

현재 Jest는 root render, local session/event cache hydration, 날짜·통계 경계, Firebase document decoder뿐 아니라 durable outbox 재시작·revision 충돌·remote snapshot, Auth/membership cache purge lifecycle과 sync banner 계약을 포함한다. Firestore transaction/Rules는 별도 Emulator 테스트가 있고, 실제 project integration과 빠른 기록 interaction은 추가 검증이 필요하다. Android/iOS device QA와 두 계정 공동 기록 기준은 [`docs/07-qa/test-strategy.md`](../../docs/07-qa/test-strategy.md)를 따른다.

## Native identity와 launch

- Android `namespace`/`applicationId`: `com.seorilabs.babycare.dev`.
- iOS `PRODUCT_BUNDLE_IDENTIFIER`: `com.seorilabs.babycare.dev`.
- JS/native target name: `BabyCare` — 최종 제품명이 아니다.
- iOS `UILaunchStoryboardName`은 유지하고 `LaunchScreen.storyboard`를 제품형 정적 화면으로 사용한다.
- Android launch theme/splash도 첫 RN 화면 배경과 맞춘다.

최종 제품명·아이콘·대표 색상이 확정되면 두 native launch 화면과 첫 RN 화면을 함께 교체하고 실제 cold start를 다시 확인한다. framework/template 문구를 숨기기 위해 launch storyboard 연결을 삭제하지 않는다.

## Firebase production composition 조건

로컬 adapter를 기본 production 경로로 두지 않는다. Firebase port adapter 구현 뒤 남은 연결 순서는 다음과 같다.

1. non-production Firebase project와 Android/iOS dev app 등록.
2. production Auth provider, 계정 recovery/deletion 정책 확정.
3. composition root에서 Auth/그룹/아기/기록/invite adapter와 app session 흐름 연결.
4. 인증된 app session/navigation에 cloud factory와 pending/retry/conflict UI 연결.
5. Emulator 테스트 후 실제 project에서 두 계정·두 기기 초대·실시간·offline·active sleep 충돌·접근 회수 QA.
6. PII-free Analytics allowlist, App Check와 native Firestore persistence OFF·로그아웃·멤버 제거 purge 실기기 검증.

Firebase client config를 추가해도 service account, private key와 Admin SDK는 이 target에 포함하지 않는다.
