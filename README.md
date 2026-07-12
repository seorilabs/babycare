# BabyCare (가칭)

여러 성인 양육자가 한 아기의 수유·기저귀·수면 기록을 함께 남기고 확인하는 클라우드 육아 케어 앱이다. 의료 진단·처방 도구가 아니라 돌봄 정보 공유·기록 도구이며, 기존 로컬 전용 `BabyCareApp`을 새 구조로 재구축한다.

## 현재 상태

| 항목 | 상태 |
| --- | --- |
| Lifecycle | `build` |
| Planning approval | `approved` (2026-07-12) |
| Deployment approval | **미승인** — 제출·프로덕션 배포 금지 |
| 출시 목표 | Google Play, Apple App Store, AppsInToss |
| 모바일 개발 ID | Android/iOS `com.seorilabs.babycare.dev` |
| 제품 이름·프로덕션 ID | `확정 필요` |

현재 `apps/mobile`의 기본 `App.tsx`는 로컬 개발 세로 슬라이스다. 온보딩, 수유·기저귀·수면 기록, 수면 종료, 홈 요약, 타임라인, 기본 통계와 기기 로컬 저장을 확인할 수 있다. 별도 인증 context factory에는 bounded timeline과 Home/Stats·active-sleep용 cloud projection 기반을 구현했지만, production Auth/group/baby UI root와 실제 Firebase project에는 아직 연결하지 않았다. `apps/ait`은 AppsInToss 정책 적합성과 영구 `appName`을 확정한 뒤 초기화한다.

## MVP

- 계정 생성/로그인 → 돌봄 그룹과 아기 생성 → 다른 양육자 초대
- 수유·기저귀·수면 원터치 기록과 수면 세션 종료
- 홈의 마지막 기록·오늘 요약, 기록자 표시 타임라인, 기본 통계
- 두 기기 간 실시간 공동 기록, 오프라인 기록 후 재연결 동기화
- 초대된 그룹 멤버만 접근 가능한 Firestore/Storage 경계
- Google Play, App Store, AppsInToss에서 동일한 핵심 흐름 제공

성장·투약·예방접종, 알림, 다둥이, 내보내기, 구독, 광고, 위젯·워치·AI 예측은 MVP 밖이다. 상세 기준은 [제품 명세](docs/01-planning/product-spec.md)와 [백로그](docs/04-work/backlog.md)를 따른다.

## 식별자

| 용도 | 값 |
| --- | --- |
| repo/app id | `babycare` |
| 현재 native target/display name | `BabyCare` (개발용, 최종 제품명 아님) |
| Android development application ID | `com.seorilabs.babycare.dev` |
| iOS development bundle ID | `com.seorilabs.babycare.dev` |
| 한국어/영어 제품명 | `확정 필요` (`함께봄` / `BabyNest`는 후보) |
| Android production package | `확정 필요` |
| iOS production bundle ID | `확정 필요` |
| AppsInToss `appName` | `확정 필요` |

## 구조

```text
docs/                  # 제품·의사결정·작업·마켓·QA 실행 원장
apps/mobile/           # Google Play/App Store bare React Native target
apps/ait/              # AppsInToss Granite RN + TDS target (초기화 전)
packages/product-core/ # 플랫폼 독립 도메인·유스케이스·포트·순수 테스트
packages/product-data/ # target 공용 local-first 저장·outbox·동기화 정책
firebase/              # Security Rules/indexes와 privileged Functions
play-store/            # Google Play 등록·릴리스 원장
app-store/             # App Store 등록·릴리스 원장
apps-in-toss/          # AppsInToss 등록·릴리스 원장
scripts/               # 로컬/CI 품질 게이트
```

`packages/product-core`는 React Native, Firebase, AppsInToss 또는 마켓 SDK를 import하지 않는다. `apps/mobile/src/app/container.ts`는 현재 로컬 preview를 조립한다. 별도의 인증 컨텍스트 factory는 user/group/baby scoped durable envelope v3, revision별 outbox, pending/failed/conflict 상태, Firestore transaction·mutation receipt, server-only bounded timeline과 독립 window/latest/active-sleep projection을 조립한다. timeline과 overview feed는 인증 scope마다 각각 단일 owner로 동작하고, overview/active coverage는 한 번의 atomic commit으로 교체된다. 실제 Firebase project와 로그인 제공자가 확정되기 전에는 이 cloud factory를 기본 실행 경로로 바꾸거나 local preview 데이터를 자동 이관하지 않는다. AppsInToss도 같은 port와 주입형 string storage 계약을 target 밖에서 구현한다. 자세한 경계는 [Clean Architecture](docs/03-architecture/clean-architecture.md)를 참고한다.

## 개발

루트에서 Node 24~26, pnpm 11을 사용한다.

```bash
pnpm install
pnpm run test
pnpm run check:mobile
pnpm --filter @babycare/mobile start
pnpm --filter @babycare/mobile android
pnpm --filter @babycare/mobile ios
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

`check:release`는 제품명, 프로덕션 ID, 마켓 config와 정책·자산 blocker가 남아 있어 현재 실패하는 것이 정상이다. `.aab`, archive 또는 `.ait` 생성만으로 release-ready가 되지 않으며, 별도 deployment approval 전에는 제출·프로덕션 승격을 수행하지 않는다.

## 문서 원장

- [제품 명세](docs/01-planning/product-spec.md)
- [출시 타깃](docs/01-planning/release-targets.md)
- [Clean Architecture](docs/03-architecture/clean-architecture.md)
- [보안 위협 모델](docs/03-architecture/security-threat-model.md)
- [작업 백로그](docs/04-work/backlog.md)
- [테스트 전략](docs/07-qa/test-strategy.md)
