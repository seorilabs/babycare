# BabyCare (가칭)

여러 성인 양육자가 한 아기의 수유·기저귀·수면·체온·복약 기록을 함께 남기고 확인하는 클라우드 육아 케어 앱이다. 의료 진단·처방 도구가 아니라 돌봄 정보 공유·기록 도구이며, 기존 로컬 전용 `BabyCareApp`을 새 구조로 재구축한다.

## 현재 상태

| 항목 | 상태 |
| --- | --- |
| Lifecycle | `build` |
| Planning approval | `approved` (2026-07-12) |
| Deployment approval | **미승인** — 제출·프로덕션 배포 금지 |
| 출시 목표 | Google Play, Apple App Store, AppsInToss |
| 모바일 식별자 | Android/iOS `com.seorilabs.babycare` (2026-07-13 확정) |
| 제품 이름 | 한국어 `함께봄`, 영어 `BabyNest` |

`apps/mobile`은 production Firebase Auth·공동 그룹·기록 동기화와 local-first outbox를 연결했고, `apps/ait`은 승인된 `babynest` Granite target으로 같은 핵심 흐름을 제공한다. 체온·복약은 소스·로컬 검증까지 완료했으며 새 Android/iOS/AIT 후보의 실기기 공동 기록 QA, 공개 개인정보처리방침·마켓 Console 재검토, 업로드·심사·공개는 별도 게이트다.

## MVP

- 계정 생성/로그인 → 돌봄 그룹과 아기 생성 → 다른 양육자 초대
- 수유·기저귀·수면·체온·복약 빠른 기록과 수면 세션 종료
- 홈의 마지막 기록·오늘 요약, 기록자 표시 타임라인, 기본 통계
- 두 기기 간 실시간 공동 기록, 오프라인 기록 후 재연결 동기화
- 초대된 그룹 멤버만 접근 가능한 Firestore/Storage 경계
- Google Play, App Store, AppsInToss에서 동일한 핵심 흐름 제공

성장·예방접종·증상, 알림, 다둥이, 내보내기, 구독, 위젯·워치·AI 예측은 현재 범위 밖이다. 상세 기준은 [제품 명세](docs/01-planning/product-spec.md)와 [백로그](docs/04-work/backlog.md)를 따른다.

## 식별자

| 용도 | 값 |
| --- | --- |
| repo/app id | `babycare` |
| 현재 native target/display name | `함께봄` / `BabyNest` |
| Android application ID | `com.seorilabs.babycare` |
| iOS bundle ID | `com.seorilabs.babycare` |
| 한국어/영어 제품명 | `함께봄` / `BabyNest` |
| AppsInToss `appName` | `babynest` |

## 구조

```text
docs/                  # 제품·의사결정·작업·마켓·QA 실행 원장
apps/mobile/           # Google Play/App Store bare React Native target
apps/ait/              # AppsInToss Granite RN + TDS target
packages/product-core/ # 플랫폼 독립 도메인·유스케이스·포트·순수 테스트
packages/product-data/ # target 공용 local-first 저장·outbox·동기화 정책
firebase/              # Security Rules/indexes와 privileged Functions
play-store/            # Google Play 등록·릴리스 원장
app-store/             # App Store 등록·릴리스 원장
apps-in-toss/          # AppsInToss 등록·릴리스 원장
scripts/               # 로컬/CI 품질 게이트
```

`packages/product-core`는 React Native, Firebase, AppsInToss 또는 마켓 SDK를 import하지 않는다. `apps/mobile/src/app/container.ts`는 현재 로컬 preview를 조립한다. 별도의 인증 컨텍스트 factory는 user/group/baby scoped durable envelope v3, revision별 outbox, pending/failed/conflict 상태, Firestore transaction·mutation receipt, server-only bounded timeline과 독립 window/latest/active-sleep projection을 조립한다. timeline과 overview feed는 인증 scope마다 각각 단일 owner로 동작하고, overview/active coverage는 한 번의 atomic commit으로 교체된다. 실제 Firebase project와 로그인 제공자가 확정되기 전에는 이 cloud factory를 기본 실행 경로로 바꾸거나 local preview 데이터를 자동 이관하지 않는다. AppsInToss도 같은 port와 주입형 string storage 계약을 target 밖에서 구현한다. 자세한 경계는 [Clean Architecture](docs/03-architecture/clean-architecture.md)를 참고한다.

## 마켓별 로컬 실행

공통으로 Node 24~26, pnpm 11을 사용한다. 처음 한 번 루트에서 의존성을 설치하고 native target 상태를 확인한다.

```bash
pnpm install
pnpm run check:mobile
```

### Google Play — Android

Android Studio/SDK, Temurin JDK 21, 실행 중인 Android Emulator 또는 USB debugging을 켠 기기가 필요하다. 현재 React Native/Gradle 조합은 JDK 22의 `jlink` 단계에서 실패하므로 JDK 21을 사용한다.

첫 터미널에서 Metro를 실행한다.

```bash
pnpm --filter @babycare/mobile start
```

다른 터미널에서 debug 앱을 설치하고 실행한다.

```bash
pnpm --filter @babycare/mobile android
```

Firebase 공동 기록 개발 흐름도 함께 확인하려면 앱을 실행하기 전에 별도 터미널에서 Emulator Suite를 시작한다. native Firebase client config가 없는 개발 빌드는 Metro 주소를 이용해 이 로컬 Emulator에 연결한다.

```bash
pnpm run firebase:mobile
```

Emulator를 쓰지 않거나 연결 오류가 나면 앱의 로컬 미리보기로 전환해 AsyncStorage 기반 단일 기기 흐름을 확인할 수 있다. 이는 실제 Firebase project나 두 기기 동기화를 검증하지 않는다.

### Apple App Store — iOS

macOS, Xcode, Ruby Bundler, CocoaPods와 iOS Simulator가 필요하다. 처음 설치했거나 `Podfile`/lockfile이 바뀌었을 때만 Pods를 설치한다.

```bash
cd apps/mobile
bundle install
cd ios
bundle exec pod install
cd ../../..
```

첫 터미널에서 Metro를 실행하고, 다른 터미널에서 Simulator용 debug 앱을 실행한다.

```bash
pnpm --filter @babycare/mobile start
pnpm --filter @babycare/mobile ios
```

실기기 실행에는 별도의 Apple signing team과 provisioning 설정이 필요하며, 현재 이는 출시 준비 항목으로 남아 있다. Firebase Emulator를 이용한 공동 기록 개발 흐름은 Android와 동일하게 `pnpm run firebase:mobile`을 먼저 실행한다.

### AppsInToss — Granite React Native

현재 `apps/ait`은 예시 파일만 있는 미초기화 상태다. AppsInToss `appName`과 정책 적합성이 아직 `확정 필요`이므로 지금은 실행할 로컬 target이나 `dev` 명령이 없다. `pnpm run check:ait`가 실패하는 것이 정상이다.

`appName`을 확정한 뒤에만 아래 순서로 target을 만들고 sandbox 개발 서버를 실행한다. `<app-name>`에는 확정된 AppsInToss `appName`을 넣는다.

```bash
pnpm run bootstrap:ait -- <app-name>
pnpm --dir apps/ait add @apps-in-toss/framework @toss/tds-react-native
pnpm --dir apps/ait ait init --template react-native --app-name <app-name>
pnpm --dir apps/ait dev
```

초기화 후 `granite.config.ts`, `TDSProvider`, AppsInToss `Storage` adapter, sandbox scheme을 구현·확인한 뒤 `pnpm run check:ait`를 통과시킨다. `.ait` build 또는 sandbox 실행은 콘솔 등록·심사·프로덕션 배포를 의미하지 않는다.

## 개발 검증

전체 정적/Emulator 검증은 다음 명령으로 실행한다.

```bash
pnpm run test
```

세부 게이트:

```bash
pnpm run test:core
pnpm run test:firebase
pnpm run typecheck
pnpm run check:architecture
pnpm run check:docs
pnpm run check:ait
pnpm run check:release
```

`check:release`는 제품명, AppsInToss `appName`, 마켓 config와 정책·자산 blocker가 남아 있어 현재 실패하는 것이 정상이다. `.aab`, archive 또는 `.ait` 생성만으로 release-ready가 되지 않으며, 별도 deployment approval 전에는 제출·프로덕션 승격을 수행하지 않는다.

## 문서 원장

- [제품 명세](docs/01-planning/product-spec.md)
- [출시 타깃](docs/01-planning/release-targets.md)
- [Clean Architecture](docs/03-architecture/clean-architecture.md)
- [보안 위협 모델](docs/03-architecture/security-threat-model.md)
- [작업 백로그](docs/04-work/backlog.md)
- [테스트 전략](docs/07-qa/test-strategy.md)

## 라이선스

이 저장소는 오픈소스가 아니다. 소스는 공개돼 있지만 복제, 수정, 재배포, 파생 앱의 스토어 배포는 허용하지 않는다. 자세한 조건은 [LICENSE](LICENSE)를 따른다.

공개 전환은 GitHub Actions 조직 쿼타 보호가 목적이다. public 저장소의 GitHub-hosted 표준 러너는 분당 과금이 없다.
