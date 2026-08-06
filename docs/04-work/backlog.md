# Backlog

기획은 2026-07-12 승인됐고 2026-08-06 재배포와 남은 출시 순서 진행 승인을 받았다. 범위 밖 제품 기능은 다음 planning approval을 거치며 국가 availability·법적 사업자 선택은 별도 확정한다.

## P0 — 공동 기록 MVP

| 상태 | 작업 | 완료 증거 / Blocker |
| --- | --- | --- |
| 구현·로컬 검증 완료 | platform-independent product core와 순수 테스트 | 수유·기저귀·수면·집계, 모유 좌·우 독립 시간, 날짜/ID·시계 역행 경계, 48시간 수면 복구와 로컬 active sleep 단일화. core 25건·architecture gate 통과 |
| 로컬 구현·native smoke 완료 | Android/iOS 로컬 UX 세로 슬라이스 | 온보딩·기록·홈·타임라인·통계·AsyncStorage 구현. Android JDK 21 build/실기기 process, iOS RNFirebase build와 light/dark Simulator first-screen 통과 |
| 로컬 검증 완료·실제 project 대기 | Firestore/Storage Rules와 Emulator 회귀 테스트 | 멤버십, 표시문자/달력 날짜, event schema/soft delete/close-only, active-sleep lock·receipt exact-get/list 경계, Storage 크기·권한 23건 통과. 실제 project 통합 검증 필요 |
| production project·native client 활성화 | Firebase non-production/prod project 전략과 client app 등록 | 전용 project `seorilabs-babycare`, Functions `asia-northeast3`, Android/iOS native client config를 운영 중이다. 남음: 환경 분리 전략과 App Check 또는 edge rate limit 확정 |
| platform custom token client·live backend 활성화 | Firebase Auth와 session/group/baby 생성 | native Firebase app은 platform bridge custom token으로 로그인하고 기존 anonymous ID token은 같은 uid로 전환한다. signer SA resource IAM·registry sync·production 배포와 신규·합성 legacy UID live smoke를 통과했다. direct anonymous는 `demo-babycare` Auth Emulator 전용. 남음: App Check/rate limit, 실제 기존 사용자·실기기 migration, account recovery/deletion 정책 |
| 개발 composition 구현·Emulator 검증 완료·실제 project 대기 | Firestore realtime/offline 동기화 | 인증 user/group/baby scoped 단일 envelope와 outbox, 실시간 Home/Timeline/Stats feed, pending/failed 상태와 retry 배너를 기본 Firebase 개발 UI에 연결. transaction receipt 멱등성과 server-confirmed merge를 검증했으며 실제 project의 비행기 모드→재실행→재연결·기기 2대 QA 필요 |
| 운영 callable 복구·실기기 수락 대기 | 초대 발급/수락 Functions와 client callable adapter | owner 초대 발급/공유와 6자리 코드 합류 UI, HMAC·만료·single-use·rate limit·audit 검증을 구현했다. 운영 `createInvite`/`acceptInvite`는 Secret Manager를 사용하며 Cloud Run Invoker IAM check 비활성화와 런타임 `roles/datastore.user`를 유지한다. production Platform custom token owner의 `createInvite` HTTP 200과 rate-limit·invite·audit 문서 생성을 확인했다. 남음: 실제 TestFlight 화면 확인, 다른 계정·기기 수락, App Check 또는 edge rate limit |
| Emulator 두 client 검증 완료·실기기 대기 | 두 계정·두 기기 공동 기록 end-to-end | Emulator direct anonymous 사용자 2명이 owner 생성→초대→합류→owner 기저귀 기록의 member 실시간 수신→멤버 제거 후 접근 거부를 통과. production custom token 계정의 offline/restart/reconnect와 실제 기기 2대는 미검증 |
| Rules/transaction 구현·실제 project 대기 | cross-device active sleep 단일성 | `activeSleeps/{babyId}` singleton lock을 event와 원자 생성·종료하고 동시 시작 2건 중 1건만 허용하는 Emulator 경쟁 테스트 통과. 실제 두 기기 conflict UX 검증 필요 |
| 구현·로컬 검증 완료·실제 project 대기 | 새 기기 active-sleep singleton projection | `activeSleeps/{babyId}`→event server-only read/observe와 lock/event identity 검증, v3 `unknown/confirmed_none/active` coverage를 구현. timeline prefix를 completeness source로 쓰지 않으며 실제 새 기기 QA 필요 |
| lifecycle·cloud context cache 구현/연결 완료·실제 Auth 대기 | 로컬 cache purge와 오류/동기화 상태 UX | UID-scoped versioned context/membership cache로 offline restart 경로를 구성하고 identity 불일치·손상 schema·확인된 membership 제거 시 purge한다. Auth sign-out/token refresh, 반복 401 차단, concurrent close/purge도 Jest 검증. production 인증과 실제 제거·재시작 QA 필요 |
| 개발 UI 연결·로컬 검증 완료·실제 project 대기 | bounded query와 timeline pagination | `(occurredAt DESC, documentId DESC)` raw cursor, server-only page, envelope v3 authoritative prefix, live page 변경 시 HEAD rebase, tombstone scan·cache cap과 SectionList load/retry를 기본 Firebase 개발 UI에 연결. 실제 index/기기 2대 경계 QA 필요 |
| 개발 UI 연결·로컬 검증 완료·실제 project 대기 | Home/Stats cloud 독립 projection | 기간 window+종류별 latest+active singleton을 결합하는 `CareEventOverviewFeed`, v3 named coverage와 atomic 교체를 구현해 Firebase 개발 root의 Home/Stats에 연결. 실제 Firebase/기기 2대에서 bounded timeline 밖 latest·active sleep 누락 여부 검증 필요 |

## P0 — AppsInToss

| 상태 | 작업 | 완료 증거 / Blocker |
| --- | --- | --- |
| 결정 대기 | 아동 정보·계정·그룹 공유·클라우드 저장 정책 적합성 확인 | 공식 정책/콘솔 기준 근거 기록 |
| 완료 | AppsInToss 영구 `appName` 확정 | Console 승인값 `babynest` readback 완료(2026-08-04) |
| 구현·운영 API E2E 완료 | `apps/ait` Granite RN + TDS 핵심 흐름 | 수유·기저귀·수면·홈·타임라인·통계·초대·삭제 구현, `.ait` local build 통과 |
| 구현·sandbox 대기 | AIT auth/storage/Firestore adapter | Platform/Firebase Auth REST, AppsInToss Storage session, Firestore REST/callable production 2계정 E2E 통과. realtime/offline queue·App Check/edge 보호는 남음 |
| 대기 | AIT 실제 기기 sandbox QA | 새 비공개 build 업로드 후 Storage·초대·기록·재실행·네트워크 복귀 검증 |

## P1 — Release candidate 준비

| 상태 | 작업 | 완료 증거 / Blocker |
| --- | --- | --- |
| 완료 | 최종 앱 이름과 대표 색상 | `함께봄`/`BabyNest`, `#5FB49C`를 2026-07-18 사용자 확정. Android/iOS 표시 이름에 `함께봄` 반영 |
| 내부 배포 완료·실기기 QA 대기 | Android release signing과 x64 Linux AAB | Play 1.0.8 internal `completed`, Play Store 설치본 QA 남음 |
| 내부 배포 완료·실기기 QA 대기 | iOS signing, archive/export와 TestFlight | TestFlight 1.0.8 `IN_BETA_TESTING`, 2인 실제 기기 QA 남음 |
| 대기 | 개인정보 처리방침·Data safety·Privacy Labels·연령등급 | 실제 SDK/데이터 흐름과 일치해야 함 |
| 대기 | 계정·그룹 완전 삭제, 데이터 export, owner 이전 | privileged workflow와 재인증 필요. 미구현 export는 제품 UI에 노출하지 않음 |
| 진행 | 3마켓 icon/thumbnail/screenshots/listing/review note | Android/iOS 자산과 AIT exact-size 후보 완료. AIT sandbox 실화면 교체·Console 등록, policy 설문 남음 |
| 대기 | 실제 project App Check/IAM/Rules/indexes 통합 QA | Emulator 통과만으로 완료 처리하지 않음 |
| 외부 입력 대기 | store 제출·production promotion | 진행 승인 완료. 국가 availability·법적 사업자 선택, Console privacy/policy 답변과 실기기 QA 필요 |

## P2 — 수익화(BM · 출시 후)

> 방향은 `docs/02-decisions/0004-monetization-strategy.md`(ADR 0004)에서 확정. **v1은 무료·무광고·무구독**으로 출시하고 아래는 후행한다.

| 상태 | 작업 | 완료 증거 / Blocker |
| --- | --- | --- |
| 결정 완료·구현 대기 | v1.x 보상형 광고 1개(통계 상세) | 옵트인 리워드·비개인화·24h unlock, 기록 루프 무광고 유지. AdMob 연동 + 개인정보/App Privacy/Data safety 라벨을 "광고 SDK 존재·비개인화"로 갱신. 실계정 인증 이후 |
| 아이디어·데이터 대기 | v2 또래 비교 인사이트(월령 밴드 익명 집계) | unlock 보상을 또래 비교로 격상. cohort당 최소 N명(k-익명), 비의료 프레이밍, 백엔드 집계 job + 개인정보방침 "익명 집계 벤치마크" 고지. 데이터 볼륨 확보 후 |
| 완료 | 비용 가드레일: GCP 예산 알림 | `seorilabs-babycare` 월 ₩20,000, 50/90/100% 이메일 알림 설정됨(2026-07-19) |
| 권장·대기 | 확장 전 App Check 활성화 | 남용성 비용·백엔드 보호. 현재 `ENFORCE_APP_CHECK=false` |

## MVP 밖 — 다음 Planning 후보

- 성장·KDCA 백분위, 체온·투약·예방접종 일정, 사진·메모·발달 기록.
- FCM 리마인더·공동 기록 알림, 다둥이·수정월령.
- CSV/PDF 리포트, 위젯·Watch, 음성 입력, 자장가, 적응형 수면 예측.
- 레거시 Realm 데이터 자동 migration.
- 수익화(광고·구독) 방향은 ADR 0004에서 확정 — 위 **P2** 참고. 소비자 일반 프리미엄 구독·개인화/강제 광고는 채택하지 않는다.

이 항목을 현재 MVP에 끼워 넣지 않는다. 지표·사용자 QA 또는 정책 근거가 생기면 새 기획서/ADR에서 범위와 개인정보 영향을 승인받는다.
