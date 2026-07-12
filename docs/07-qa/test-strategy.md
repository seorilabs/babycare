# Test Strategy

## 목표

테스트는 core 규칙, adapter 동작, 보안 경계, target별 UX와 3마켓 release gate를 분리한다. 로컬 UI 또는 Emulator 하나의 성공으로 클라우드 공동 기록이나 release-ready 전체를 증명하지 않는다.

## 자동화 레이어

| Layer | 목적 | 명령/위치 | 현재 범위 |
| --- | --- | --- | --- |
| Core unit | domain/use case 순수 로직 | `pnpm run test:core` | 모유 좌·우 독립 시간, 수유·기저귀·수면 validation, 자정 경계 집계, 시간/단위, 기록·수면종료·로컬 active sleep 단일화 |
| Firebase Rules | 그룹 접근·이벤트 불변·soft delete·Storage 권한 | `pnpm run test:firebase` | Firestore/Storage Emulator allow/deny |
| Functions unit | HMAC·입력·Auth·rate/error mapping 순수 검증 | `pnpm run test:functions` | callable boundary와 invite service |
| Functions transaction | owner·expiry·single-use·audit·rate limit | `pnpm run test:functions:emulator` | Firestore Admin transaction Emulator |
| TypeScript | workspace compile contract | `pnpm run typecheck` | core와 mobile의 `tsc --noEmit` |
| Architecture | core import/runtime dependency boundary | `pnpm run check:architecture` | core의 RN/Firebase/AIT/native/network 의존 탐지 |
| Docs | docs source-of-truth 구조 | `pnpm run check:docs` | 필수 planning/architecture/market/release/QA 문서 |
| Mobile unit/adapter | RN root와 Firebase document boundary | `pnpm --filter @babycare/mobile test` | root render, care event/group/baby/membership/invite callable decoder와 path/schema 위조 거부 |
| Mobile lint | RN source 정적 검사 | `pnpm --filter @babycare/mobile lint` | mobile source |
| Mobile target | RN Android/iOS target과 iOS launch | `pnpm run check:mobile` | native project 존재, framework launch 문구 탐지 |
| AIT target | Granite target 초기화 | `pnpm run check:ait` | 현재 미초기화라 실패가 정상 |
| Release inventory | market/release blocker | `pnpm run check:release` | placeholder와 필수 market config; 현재 실패가 정상 |

전체 개발 게이트:

```bash
pnpm run test
```

현재 root `test`는 core/mobile unit, Firebase Rules, Functions unit/transaction, workspace typecheck/lint, architecture/docs를 순서대로 검증한다. Firebase Emulator 실행에는 Java와 의존성 설치가 필요하다. target/device build와 `check:release`는 별도다.

## Core Test 기준

- 디바이스, emulator, network, wall-clock 실환경 없이 실행한다. 시간·ID·repository·analytics는 port/fake로 주입한다.
- 수유 subtype 필수값과 상한, 미래 시각, 수면 시작/종료와 48시간 상한을 경계값으로 검증한다.
- 홈/통계 집계는 soft delete 제외, 오늘 범위, 진행 중 수면 clipping을 검증한다.
- use case는 저장 결과와 PII-free analytics event를 함께 검증한다.
- production bug를 고치면 재현 순수 테스트를 먼저 추가하고 가장 좁은 test부터 재실행한다.

## Firebase Test 기준

- 비로그인·비멤버 read/write deny와 멤버 read/record allow를 모두 둔다.
- owner/member 권한, owner 불변, 초대 client 직접 접근 금지를 검증한다.
- event identity/revision, 작성자 soft delete, 다른 멤버의 active sleep close-only 전이를 검증한다.
- group/baby hard delete와 tombstoned ID 재사용, 미래 timestamp를 거부한다.
- Storage는 group/baby membership, image MIME/size, unscoped path, 멤버 제거 후 접근 회수를 검증한다.
- Emulator 통과 뒤 실제 non-production project에서 Auth, Rules, indexes, Storage↔Firestore, App Check/IAM 통합 smoke를 별도 수행한다.

## Functions Test 기준

- callable `.run()`에서 Auth 누락과 object가 아닌 payload를 먼저 거부한다.
- raw invite code 비저장, HMAC hash/domain separation, 안전 alphabet과 입력 normalization을 순수 테스트한다.
- Firestore Emulator에서 current owner 확인, 만료, 동시 single-use accept, idempotent replay, 7-field membership, actor audit를 검증한다.
- 존재하지 않는 유효 형식 code도 UID rate counter에 누적되어 threshold 뒤 차단되는지 검증한다.
- 이 로컬 테스트는 실제 Functions/Auth callable protocol, App Check enforcement, Secret Manager binding, IAM을 증명하지 않는다. 해당 항목은 non-production release gate다.

## Adapter / Sync Test 기준

현재 화면 composition의 `PersistentCareEventRepository`는 AsyncStorage 기반 개발 adapter다. RNFirebase의 `FirebaseCareEventRemoteStore`는 server acknowledgement transport이며 실제 project와 화면에는 연결하지 않았다. production에서는 이를 화면 repository로 직접 바꾸지 않고 durable local repository/outbox/coordinator 앞에 둔다. 아래 계약을 target별 Firestore/AIT adapter에 동일하게 적용하고 실제 환경에서 다시 검증한다.

| 시나리오 | 기대 결과 |
| --- | --- |
| 저장 후 list/observe | 새 event가 한 번만 최신순으로 보임 |
| 앱 종료·재시작 | 로컬 event/session이 복구됨 |
| 비행기 모드 기록 | UI에 즉시 반영되고 pending 상태가 보임 |
| 온라인 복귀 | 같은 event ID로 서버에 한 번 반영됨 |
| 두 기기 동시 기록 | 두 event 모두 보존되고 순서가 일관됨 |
| active sleep 동시 종료 | 허용된 단일 close 전이만 남음 |
| 멤버 제거·로그아웃 | 새 server 요청 실패, 민감 cache purge |
| 손상된 local cache | crash하지 않고 안전한 복구/오류 상태 제공 |

## Mobile Device QA

### 공통 핵심 흐름

1. 첫 실행에서 성인 양육자와 아기 정보를 입력한다.
2. 수유 4종, 기저귀 3종, 낮잠/밤잠 시작과 종료를 기록한다.
3. 홈 마지막 기록·오늘 요약, 타임라인 기록자/시각, 12시간·7일·30일 통계를 대조한다.
4. 과거 시각·메모·본인 기록 soft delete와 잘못된 입력 오류를 확인한다.
5. 앱 재시작, 시스템 dark mode, 작은 화면, 키보드/하단 safe area와 한 손 조작을 확인한다.
6. cold start에서 `BabyCare` 기술 target 또는 React Native/template 문구가 노출되지 않는지 확인한다. 최종 제품명 확정 뒤 자산을 다시 검수한다.

### 공동 기록 필수 시나리오

한 명의 테스트로 MVP를 승인하지 않는다.

- 서로 다른 계정·실제 기기 2대에서 owner 초대→member 합류.
- A가 기록한 내용과 기록자가 B의 홈/타임라인에 반영.
- B가 A의 active sleep을 종료하되 event identity 보존.
- 한 기기를 offline으로 전환해 기록·재실행 후 online 복귀.
- owner가 member를 제거한 직후 Firestore/Storage 접근 차단과 local cache purge.

### Target Matrix

| Target | 빌드/실행 | 사람 QA | 현재 상태 |
| --- | --- | --- | --- |
| Android | debug device/emulator, 이후 signed AAB internal | 작은 화면·back·offline·cold start | RN `0.85.3`/RNFirebase JDK 21 debug build 통과, 실기기 설치·process 기동 확인. 잠금 상태로 최종 visual 미확인 |
| iOS | simulator/device, 이후 archive/TestFlight | safe area·keyboard·dark mode·cold start | RN `0.85.3`/RNFirebase arm64 Simulator clean/incremental build, iPhone 16 Pro light와 SE(3세대) dark first-screen 통과 |
| AppsInToss | Granite sandbox 실제 기기 | TDS, Storage, auth/realtime, 재실행 | target 미초기화 |

## Regression Rules

- core 변경은 device 없이 검증 가능한 테스트를 먼저 추가한다.
- Firestore/Storage schema나 권한 변경은 Emulator deny/allow 회귀 테스트를 함께 추가한다.
- adapter 변경은 target-specific contract/integration test를 추가한다.
- market policy나 SDK 데이터 수집 변경은 `docs/05-markets/`와 privacy/data safety 원장을 함께 갱신한다.
- native startup 변경은 cold start를 확인한다. iOS `LaunchScreen`과 Android splash/launch theme에서 framework/template 문구가 보이면 release blocker다.
- bug fix는 재현 테스트 → 좁은 게이트 → 관련 전체 게이트 순으로 검증한다.
- flaky 재실행 성공만으로 통과 처리하지 않고 원인과 환경을 work log에 남긴다.

## Release Candidate 증거

- 자동 게이트 로그와 commit SHA.
- Android/iOS/AIT target별 artifact, build 환경, signing/console 상태.
- 두 계정·두 기기 공동 기록 QA 결과와 실패/재시도 기록.
- 실제 Firebase non-production 통합 결과.
- native launch, 핵심 화면, empty/error/offline 상태 screenshot.
- 각 마켓 privacy/policy/asset/manual gate inventory.

위 증거가 모두 있어도 deployment approval 전에는 제출하지 않는다.
