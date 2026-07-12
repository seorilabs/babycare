# Backlog

기획은 2026-07-12 승인됐다. 아래 MVP 작업은 planning 재승인 없이 진행할 수 있지만, 범위 밖 제품 기능은 다음 planning approval을 거친다. 배포는 release candidate 이후 별도 deployment approval이 필요하다.

## P0 — 공동 기록 MVP

| 상태 | 작업 | 완료 증거 / Blocker |
| --- | --- | --- |
| 구현·로컬 검증 완료 | platform-independent product core와 순수 테스트 | 수유·기저귀·수면·집계, 모유 좌·우 독립 시간, 날짜/ID·시계 역행 경계, 48시간 수면 복구와 로컬 active sleep 단일화. core 25건·architecture gate 통과 |
| 로컬 구현·native smoke 완료 | Android/iOS 로컬 UX 세로 슬라이스 | 온보딩·기록·홈·타임라인·통계·AsyncStorage 구현. Android JDK 21 build/실기기 process, iOS RNFirebase build와 light/dark Simulator first-screen 통과 |
| 로컬 검증 완료·실제 project 대기 | Firestore/Storage Rules와 Emulator 회귀 테스트 | 멤버십, 표시문자/달력 날짜, event schema/soft delete/close-only, active-sleep lock·receipt exact-get/list 경계, Storage 크기·권한 22건 통과. 실제 project 통합 검증 필요 |
| 대기 | Firebase non-production/prod project 전략과 client app 등록 | 실제 project ID와 환경별 config `확정 필요` |
| adapter 구현·composition 대기 | Firebase Auth와 실제 session/group/baby 생성 | RNFirebase Auth/그룹/아기 adapter는 구현. production 로그인 provider, account recovery/deletion 정책, app composition 연결은 `확정 필요` |
| local-first 구현·실제 project composition 대기 | Firestore realtime/offline 동기화 | 인증 user/group/baby scoped 단일 envelope에 event+revision별 outbox를 원자 저장하고 pending/failed/conflict·retry UI 계약을 구현. transaction receipt로 lost-ack 멱등성, server-confirmed snapshot만 merge하는 adapter/Jest 검증 완료. 실제 project 재연결·2기기 QA 필요 |
| 로컬 구현·검증 완료·실제 통합 대기 | 초대 발급/수락 Functions와 client callable adapter | HMAC, 만료, single-use, rate limit, audit unit 10건과 transaction Emulator 검증. 실제 verified Auth/callable/App Check/Secret Manager/IAM 통합 필요 |
| 대기 | 두 계정·두 기기 공동 기록 end-to-end | 초대→합류→실시간 반영→오프라인 복귀→멤버 제거 통과 |
| Rules/transaction 구현·실제 project 대기 | cross-device active sleep 단일성 | `activeSleeps/{babyId}` singleton lock을 event와 원자 생성·종료하고 동시 시작 2건 중 1건만 허용하는 Emulator 경쟁 테스트 통과. 실제 두 기기 conflict UX 검증 필요 |
| read adapter 구현 대기 | 새 기기 active-sleep singleton projection | bounded timeline 밖에서도 진행 중 수면을 복구하도록 `activeSleeps/{babyId}`→event server read/observe를 별도 연결. timeline prefix를 active-session completeness source로 사용 금지 |
| lifecycle 구현·실제 Auth composition 대기 | 로컬 cache purge와 오류/동기화 상태 UX | Auth sign-out·identity 변경·확인된 membership 제거, 강제 token refresh, 반복 401 차단, concurrent close/purge와 replacement-writer 보호를 Jest로 검증. RNFirebase disk persistence 비활성화와 실제 제거 QA 필요 |
| 구현·로컬 검증 완료·실제 project 대기 | bounded query와 timeline pagination | `(occurredAt DESC, documentId DESC)` raw cursor, server-only page, authoritative prefix envelope v2, live page 변경 시 HEAD rebase, tombstone scan·cache cap과 SectionList load/retry를 구현. cloud 화면 composition·실제 index/2기기 경계 QA 필요 |
| 설계·구현 대기 | Home/Stats cloud 독립 projection | cloud container의 전체 baby listener는 bounded feed와 공존하지 않도록 비활성화했다. 오늘/12시간/7일/30일 기간 query 또는 server aggregate를 별도 authoritative projection으로 연결해야 하며 timeline prefix를 전체 통계로 사용 금지 |

## P0 — AppsInToss

| 상태 | 작업 | 완료 증거 / Blocker |
| --- | --- | --- |
| 결정 대기 | 아동 정보·계정·그룹 공유·클라우드 저장 정책 적합성 확인 | 공식 정책/콘솔 기준 근거 기록 |
| 결정 대기 | 한국어/영어 제품명과 영구 `appName` 확정 | target 생성 전 사용자 결정 필요 |
| 대기 | `apps/ait` Granite RN + TDS 초기화 | 현재 example 문서만 존재. `appName` 확정 뒤 생성, `pnpm run check:ait` |
| 대기 | AIT auth/storage/realtime adapter | native Firebase module, App Check, 알림 지원 범위를 실제 sandbox에서 검증 |
| 대기 | AIT 핵심 흐름과 실제 기기 sandbox QA | mobile과 같은 수유·기저귀·수면·홈·타임라인·통계 흐름 |

## P1 — Release candidate 준비

| 상태 | 작업 | 완료 증거 / Blocker |
| --- | --- | --- |
| 결정 대기 | 최종 앱 이름, production package/bundle ID, 대표 색상 | 후보를 확정값으로 사용하지 않음 |
| 대기 | Android release signing과 x64 Linux AAB | Play App Signing/upload key, internal track |
| 대기 | iOS signing, archive/export와 TestFlight | macOS/Xcode, App ID/profile, 2인 TestFlight |
| 대기 | 개인정보 처리방침·Data safety·Privacy Labels·연령등급 | 실제 SDK/데이터 흐름과 일치해야 함 |
| 대기 | 계정·그룹 완전 삭제, 데이터 export, owner 이전 | privileged workflow와 재인증 필요 |
| 대기 | 3마켓 icon/thumbnail/screenshots/listing/review note | 최종 제품명·브랜딩 이후 생성 |
| 대기 | 실제 project App Check/IAM/Rules/indexes 통합 QA | Emulator 통과만으로 완료 처리하지 않음 |
| 차단 | store 제출·production promotion | **Deployment approval 미승인** |

## MVP 밖 — 다음 Planning 후보

- 성장·KDCA 백분위, 체온·투약·예방접종 일정, 사진·메모·발달 기록.
- FCM 리마인더·공동 기록 알림, 다둥이·수정월령.
- CSV/PDF 리포트, 구독·결제, 프리미엄 경계와 테마.
- 위젯·Watch, 음성 입력, 자장가, 적응형 수면 예측.
- 레거시 Realm 데이터 자동 migration.
- 광고는 아동 데이터 신뢰·정책을 별도 검토하기 전까지 보류한다.

이 항목을 현재 MVP에 끼워 넣지 않는다. 지표·사용자 QA 또는 정책 근거가 생기면 새 기획서/ADR에서 범위와 개인정보 영향을 승인받는다.
