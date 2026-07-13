# BabyCare Product Spec

## 승인과 원장

| 항목 | 값 |
| --- | --- |
| Lifecycle state | `build` |
| Planning approval | `approved` — 2026-07-12 |
| Deployment approval | **미승인** |
| 분류 / 기본 스택 | non-game / bare React Native + Firebase |
| 출시 타깃 | Google Play / App Store / AppsInToss |
| 기획 출처 | Obsidian `프로젝트/개인/babycare/01 기획서` |
| 실행 source of truth | 이 repo의 `docs/` |

기획 승인으로 제품 구현과 QA는 진행할 수 있다. 다만 스토어 제출, production track 승격, AppsInToss 프로덕션 릴리스와 공개 배포는 별도 deployment approval 전에는 수행하지 않는다.

## 제품 정의

- 한 줄 가치: 여러 양육자가 한 아기의 돌봄 기록을 실시간으로 함께 남기고 확인한다.
- 주요 사용자: 신생아~영유아를 교대로 돌보는 성인 부모, 조부모, 베이비시터와 보육교사.
- 해결할 문제: 로컬 한 기기에 고립된 기록, 구두·메신저에 흩어진 인수인계, 밤중 한 손 입력의 마찰, 기기 교체 시 데이터 소실.
- 제품 성격: 성인 양육자용 기록·공유 도구. 의료 진단·처방·치료 판단을 제공하지 않는다.
- 핵심 원칙: 공동 기록을 1급 기능으로, 자주 쓰는 입력은 5~15초 안에, 기록은 오프라인에서도 시작할 수 있게, 아동 데이터는 초대된 그룹 내부에만 둔다.

## 제품 식별자

후보를 확정값처럼 사용하지 않는다. Android application ID와 iOS bundle ID는 사용자가 확정한 `com.seorilabs.babycare`를 Debug/Release에 공통 사용한다.

| 항목 | 현재 값 | 상태 |
| --- | --- | --- |
| app id | `babycare` | repo 내부 식별자 |
| 현재 native target/display name | `BabyCare` | 개발용 기술 이름 |
| 한국어 앱 이름 | 후보 `함께봄` | `확정 필요` |
| 영어 앱 이름 | 후보 `BabyNest` | `확정 필요` |
| Android application ID | `com.seorilabs.babycare` | 2026-07-13 사용자 확정 |
| iOS bundle ID | `com.seorilabs.babycare` | 2026-07-13 사용자 확정 |
| AppsInToss `appName` | `확정 필요` | 정책 확인 후, target 생성 전에 확정 |
| 대표 색상 | 후보 `#5FB49C` | `확정 필요` |
| 고객지원 이메일 | `cs@seorilabs.com` | 해당 마켓에 사용 |

## MVP 범위

### In

1. 성인 양육자 계정 생성/로그인.
2. 아기 1명과 돌봄 그룹 생성, 소유자가 다른 양육자를 코드/링크로 초대하고 상대가 합류.
3. 수유(모유 좌·우 타이머, 유축·분유·이유식 양), 기저귀(소변·대변·혼합), 수면(낮잠·밤잠 시작/종료) 기록.
4. 홈에서 마지막 수유·기저귀·수면과 오늘 요약 확인.
5. 기록자와 시각이 보이는 타임라인, 본인 기록 soft delete, 수유·수면·기저귀 기본 통계.
6. 두 명 이상의 양육자 기기 사이 Firestore 실시간 공동 기록.
7. 오프라인 기록, 앱 재시작 후 보존, 온라인 복귀 시 동기화와 실패/재시도 상태.
8. 그룹 멤버십 기반 Firestore/Storage 접근 통제와 멤버 제거 시 새 요청 차단.
9. 시스템 다크모드, 작은 화면과 한 손 조작, 제품 브랜딩 native launch 화면.
10. Google Play/App Store mobile target과 AppsInToss target에서 동일한 핵심 기록·확인 흐름.

### Out

- 성장·백분위, 체온·증상, 투약, 예방접종, 목욕·활동·발달, 사진·자유 일지.
- FCM 리마인더와 다른 양육자 기록 알림.
- 다둥이·수정월령, CSV/PDF 내보내기와 데이터 리포트.
- 구독·결제, 광고, 유료 기능 경계.
- 위젯, Apple Watch/Wear OS, 음성 입력, 자장가, 적응형 수면 예측.
- 공개 SNS/커뮤니티, 위치 추적, 커머스, 원격진료와 의료 판정.
- 레거시 Realm 데이터 자동 마이그레이션. 사용자 규모 확인 후 별도 결정한다.

Out 항목을 구현 범위에 넣으려면 다음 planning approval 대상으로 다시 검토한다. 개인정보 보호를 위한 계정 삭제·데이터 완전 삭제·기본 내보내기 의무는 유료 제품 기능과 별개로 release blocker에서 다룬다.

## 핵심 흐름

```mermaid
flowchart LR
  Auth["로그인"] --> Setup["아기·돌봄 그룹 생성"]
  Setup --> Invite["양육자 초대·합류"]
  Invite --> Home["마지막 기록·오늘 요약"]
  Home --> Record["수유·기저귀·수면 기록"]
  Record --> Queue["로컬 반영·오프라인 큐"]
  Queue --> Firestore["Firestore 동기화"]
  Firestore --> Other["다른 양육자 화면에 반영"]
```

초대는 client가 `invites` 문서를 직접 읽거나 쓰지 않고 privileged server transaction이 발급·만료·1회 사용·합류를 처리한다.

## 기능 요구사항

| ID | 요구사항 | MVP 완료 증거 |
| --- | --- | --- |
| FR-01 | 계정과 그룹 멤버십으로 사용자·권한을 식별한다. | 실제 Auth 계정 2개로 owner/member 시나리오 통과 |
| FR-02 | 수유·기저귀·수면을 현재/과거 시각으로 기록한다. | core 테스트 + Android/iOS/AIT 입력 smoke |
| FR-03 | 진행 중 수면을 다른 그룹 멤버도 종료할 수 있고 원 기록 identity는 보존한다. | core/Rules 회귀 테스트 + 두 기기 QA |
| FR-04 | 홈·타임라인·기본 통계가 soft-deleted 기록을 제외하고 일관된 값을 보인다. | core 집계 테스트 + UI smoke |
| FR-05 | 기록이 로컬에 즉시 보이고 재연결 후 한 번만 서버에 반영된다. | 비행기 모드→재실행→재연결 QA |
| FR-06 | A의 기록이 B 기기에 실시간 반영되고 기록자가 표시된다. | 서로 다른 계정·기기 2대 QA |
| FR-07 | 비멤버와 제거된 멤버는 그룹 데이터와 사진의 새 요청에 접근할 수 없다. | Firebase Emulator + 실제 비프로덕션 project 검증 |
| FR-08 | 소유자만 초대·멤버 제거·그룹 관리 작업을 수행한다. | Functions/Rules 테스트 + UI 권한 QA |

## 비기능·보안 요구사항

- `packages/product-core`는 디바이스, 네트워크, Firebase emulator 없이 테스트 가능해야 한다.
- core에는 React Native, Firebase, AppsInToss, Google/Apple SDK와 native module import를 두지 않는다.
- 아기 이름·생년월일·사진 경로·기록 값·메모는 Analytics/Crashlytics에 보내지 않는다. 이벤트 type 등 allowlist만 보낸다.
- 민감 데이터는 초대된 그룹 내부에만 보이고 공개 download token URL을 저장하지 않는다.
- service account, private key, Firebase Admin SDK는 client app에 포함하지 않는다.
- 멤버 제거·로그아웃·계정 삭제 시 로컬 캐시 purge 경로를 검증한다.
- 성장·건강 기능을 후속 도입해도 결과를 참고 정보로 표시하고 의료 판단 표현을 사용하지 않는다.

상세 위협과 통제는 [Security Threat Model](../03-architecture/security-threat-model.md)을 따른다.

## 현재 구현 기준선

| 영역 | 현재 구현 | MVP까지 남은 핵심 |
| --- | --- | --- |
| product core | `Baby`, `CareGroup`, `Membership`, `CareGroupInvite`, `CareEvent`; 기록·수면종료·soft delete·대시보드 use case; Auth/그룹/아기/초대/기록·remote mutation·string storage port | 실제 Auth/group boot composition과 2인 use-case 검증 |
| mobile | 기존 로컬 UX에 더해 인증 context assertion, scoped event+outbox envelope, local-first coordinator, 독립 sync status/retry component 계약, membership/auth cache purge lifecycle과 RNFirebase transaction adapter 구현 | 기본 composition은 여전히 local preview. Firebase project/client config, production Auth provider, 실제 session/group/invite UI·sync banner와 2인 흐름 연결 필요 |
| Firebase | 기존 Rules/Functions에 payload-bound mutation receipt와 baby별 active-sleep singleton lock을 추가. Rules 22건에서 event/receipt/lock 원자성·receipt exact-get/list 경계·미래 receipt 선점 차단·동시 시작 1건만 성공 검증 | 실제 non-production project, App Check·Secret Manager·IAM·client composition 통합 검증 |
| AppsInToss | 문서와 example만 있고 Granite target은 미초기화 | 정책 적합성·영구 `appName`, Granite+TDS 초기화, auth/storage/realtime adapter, sandbox QA |
| release | 3마켓 문서 구조와 Android/iOS 식별자 확정 | 제품명·AppsInToss `appName`·서명·정책 답변·자산·콘솔 등록·사람 QA |

RNFirebase adapter 파일이 존재하는 것과 production composition이 연결된 것은 다르다. 현재 실행 경로인 로컬 AsyncStorage 세로 슬라이스는 UX와 core wiring 검증용이며, 클라우드 보존·공동 기록 MVP가 완료됐다는 증거로 사용하지 않는다.

## MVP 완료 기준

- `pnpm run test`, `pnpm run check:mobile`, `pnpm run check:ait`가 통과한다.
- 실제 비프로덕션 Firebase에서 Auth, Firestore, Storage, Functions, App Check 경계를 통합 검증한다.
- 서로 다른 계정과 기기 2대에서 초대→합류→실시간 기록→오프라인 복귀→멤버 제거 흐름을 통과한다.
- Android/iOS/AIT에서 수유·기저귀·수면의 입력·홈·타임라인·기본 통계가 동등하게 동작한다.
- native cold start에서 framework/template 문구가 노출되지 않는다.
- privacy/data safety, 계정 삭제·export, signing, 스토어 자산과 review note blocker가 repo 원장에 반영된다.
- release candidate가 준비되어도 deployment approval 전에는 제출하지 않는다.
