# Work Log

## 2026-07-31 — 빠른 기록 더보기 문구 정합성 수정

- 홈의 `더보기` 빠른 동작은 설정 화면을 열지만 다른 기록 동작과 같은 `바로 남기기` 보조 문구를 노출해 실제 동작을 잘못 안내했다.
- 빠른 동작별 보조 문구를 명시해 수유·기저귀·수면 기록 문구는 유지하고 `더보기`만 `설정 열기`로 수정했다.
- Home 화면 회귀 테스트가 `더보기 바로 남기기`의 재노출을 막고 실제 설정 이동 문구를 검증한다. 테스트는 수정 전 실패하고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/236건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 문구 정합성 수정만 수행해 이번 실행에서는 simulator/device 화면을 직접 보지 않았다.

## 2026-07-31 — 미구현 아기 선택 표시 제거

- 홈 상단의 아기 이름 뒤 `▾`가 선택 가능한 드롭다운처럼 보였지만 실제 press handler나 선택 화면이 없었다.
- 현재 승인 MVP는 단일 아기이며 다둥이 지원은 MVP 밖이므로 기능을 임의 확장하지 않고 오해를 만드는 표시만 제거했다.
- Home 화면 회귀 테스트를 추가해 아기 이름은 유지하면서 미구현 선택 표시가 다시 노출되지 않도록 했다. 테스트는 수정 전 실패하고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/236건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 텍스트 표시 제거만 수행해 이번 실행에서는 simulator/device 화면을 직접 보지 않았으며 다둥이 지원은 기존 MVP 밖 backlog로 유지한다.

## 2026-07-30 — 고정 개발 버전 문구 노출 제거

- 더보기 화면이 workspace package의 초기값인 `개발 빌드 0.1.0`을 고정 노출했지만, 실제 Android/iOS 최신 업로드 빌드는 1.0.1(1000001)이고 release workflow는 태그에서 native 버전을 주입한다.
- 잘못된 버전을 제품 정보로 안내하지 않도록 고정 문구를 제거했다. 실제 native 버전 readback 경로를 도입하기 전까지 임의 값으로 대체하지 않는다.
- More 화면 회귀 테스트가 미구현 export 문구와 함께 고정 개발 버전의 재노출을 막는다.
- `pnpm run test:static`에서 core 40건, mobile 29 suites/235건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다. 텍스트 제거만 수행해 이번 실행에서는 simulator/device 화면을 직접 보지 않았다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.

## 2026-07-30 — 미구현 데이터 내보내기 노출 제거

- 더보기 화면이 누를 수 없는 `데이터 내보내기 — 준비 중` 행으로 아직 제공하지 않는 기능을 사용자에게 약속하고 있었다.
- CSV/PDF 내보내기는 승인 MVP 밖이며, 개인정보 보호 목적의 기본 export 절차는 재인증·privileged backend 정책이 필요한 P1 release blocker다. 범위를 임의 확장하지 않고 해당 행만 제품 UI에서 숨겼으며 backlog blocker는 유지했다.
- More 화면 회귀 테스트가 `데이터 내보내기`와 `준비 중` 문구의 재노출을 막는다.
- `pnpm run test:static`에서 core 40건, mobile 29 suites/235건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다. 이번 실행에서는 simulator/device 화면을 직접 보지 않았다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.

## 2026-07-30 — 확정 제품명 사용자 표면 반영

- 2026-07-18 확정·스토어 반영된 한국어 제품명 `함께봄`과 달리 Android/iOS launcher label, React Native `displayName`, 초대 공유 문구가 개발용 기술 이름 `BabyCare`를 노출하고 있음을 확인했다. 기존 `pnpm run check:mobile`도 이 상태를 통과했다.
- Android `app_name`, iOS `CFBundleDisplayName`, React Native `displayName`과 초대 공유 문구를 `함께봄`으로 통일했다. 내부 JS/native target 이름 `BabyCare`는 module·scheme 호환을 위해 유지한다.
- `check:mobile`이 세 native 표시 이름과 초대 공유 브랜드를 검사하도록 보강하고, 초대 공유 payload 회귀 테스트와 접근성 label을 추가했다. 기획서·backlog의 과거 `확정 필요` 표기도 현재 승인 상태에 맞췄다.
- `pnpm run test:static`에서 core 40건, mobile 29 suites/234건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`, iOS plist lint도 통과했다.
- JDK 21 Android debug APK를 빌드하고 `aapt dump badging`에서 package `com.seorilabs.babycare`, application/activity label `함께봄`을 확인했다. 이번 실행에서는 Android/iOS 화면·cold start를 직접 보지 않았으므로 QA checklist는 완료 처리하지 않았다.
- `pnpm run check:release`는 이번 변경과 무관한 AppsInToss `appName`/target, 스토어 정책 답변, 실제 계정·기기 QA와 deployment approval blocker로 예상대로 실패했다.

## 2026-07-13 — Android/iOS 식별자 확정

- 사용자가 Android application ID와 iOS bundle ID를 `com.seorilabs.babycare`로 확정했다. Debug/Release native target이 같은 식별자를 사용하며 Android Kotlin package 경로와 iOS Debug/Release build setting도 함께 맞췄다.
- 이전 `.dev` 앱과 새 앱은 별도 설치·별도 로컬 데이터 컨테이너이므로 AsyncStorage 데이터는 자동 승계하지 않는다. 실제 Firebase client app과 Play Console/App Store Connect 등록도 새 식별자를 사용해야 한다.
- 최종 한국어/영어 표시 이름, AppsInToss `appName`, signing, Firebase project와 deployment approval은 별도 미완료 게이트로 유지한다.
- `pnpm run test:static`과 mobile/docs gate가 통과했다. Android JDK 21 clean debug 빌드의 APK application ID와 iPhone 16 Pro Simulator Debug 빌드의 `.app` `CFBundleIdentifier`가 모두 `com.seorilabs.babycare`임을 확인했다.

## 2026-07-13 — Cloud overview and active-sleep projections

- core에 Firebase type을 포함하지 않는 `CareEventProjectionRemotePort`를 추가했다. Home/Stats용 half-open 기간 window, 종류별 latest와 active-sleep singleton의 fetch/observe 계약을 분리하고, 통계 core는 delivery layer가 만든 명시적 범위만 집계한다.
- RNFirebase adapter는 window/latest/active를 server-only로 읽고 cache·pending snapshot을 authoritative 값으로 취급하지 않는다. active singleton은 `activeSleeps/{babyId}` lock에서 event를 따라가며 group/baby/event/caregiver/start/create identity와 실제 active 상태를 함께 검증한다.
- scoped durable envelope를 v3로 올려 bounded timeline coverage와 독립된 `overviewEventIds`, `unknown | confirmed_none | active(eventId)` coverage를 저장한다. overview와 active singleton은 `replaceRemoteProjections` 한 번으로 atomic 교체하며 pending/failed local mutation은 optimistic overlay로 보존한다.
- `CareEventOverviewFeed`는 최근 통계 window, feeding/diaper/sleep latest와 active singleton을 결합한다. source 간 동일 revision payload/identity 불일치, observer epoch supersession, terminal error와 recovery 재연결에서 last-good projection을 보존한다.
- 인증 cloud container는 scope마다 `CareEventTimelineFeed`와 `CareEventOverviewFeed` owner를 각각 하나씩 시작해 반환한다. Auth/membership 복구 시 두 feed를 refresh하고, revocation/teardown에서는 둘 다 중단한 뒤 기존 purge/close 불변식을 따른다.
- Home은 진행 중 수면을 bounded event 목록에서 추론하지 않고 explicit `activeSleep`을 받는다. 기본 local preview도 전체 snapshot을 `{events, activeSleep}` overview source로 원자 전달해 cloud feed와 같은 presentation 경계를 사용한다. 구독 stop은 idempotent하고 stale callback을 차단하며, local delete marker는 해당 ID가 complete snapshot에서 사라지면 해제해 후속 active singleton을 숨기지 않는다. Stats의 7일/30일 bucket은 device-local calendar의 `setDate` 경계를 사용하고 DST 변화에서도 명시적 `[from, to)` 범위를 core에 전달한다.
- 기본 `App.tsx`는 계속 전체 local event를 사용하는 preview다. production authenticated UI root/Auth/group/baby composition, 실제 Firebase project/index/listener, 두 계정·두 기기 및 새 기기 active-sleep 복구 QA, AppsInToss와 배포는 완료하지 않았다.

검증 범위:

- projection port/use case, Firebase server-only adapter, envelope v1/v2→v3 migration·atomic rollback, overview observer/recovery, container owner/lifecycle, Home/Stats 날짜·DST 회귀 suite를 추가했다. `test:core` 40건, mobile Jest 24 suites/204건, Rules Emulator 23건, Functions unit 10건, Functions transaction Emulator 5건이 통과했고 typecheck, lint, architecture, docs, mobile target gate도 통과했다.

## 2026-07-13 — Bounded timeline pagination

- core에 `(occurredAt DESC, documentId DESC)` UTF-8 tie-break, scalar cursor, runtime page request validation과 pure pagination reference를 추가했다.
- RNFirebase transport는 soft-delete를 포함한 raw page를 server-only로 `pageSize + 1` 조회한다. cache/pending snapshot은 authoritative page로 취급하지 않고 decode 실패 시 partial page를 반환하지 않는다.
- local sync envelope를 v2로 확장해 authoritative remote prefix ID, end cursor, raw count와 `hasMore`를 저장한다. v1은 outbox/conflict overlay를 분리해 보수적으로 이관하고, prefix 교체에서 사라진 synced row만 제거한다.
- `CareEventTimelineFeed`는 명시적으로 주입된 page/cache/scan bound 안에서 load-more를 수행한다. 어느 live page든 signature가 변하면 현재 로드 깊이를 HEAD부터 재조회해 한 번의 local commit으로 교체하며, tombstone은 cursor에는 포함하고 UI에서는 숨긴다.
- cloud container에서는 기존 전체 baby snapshot listener를 끄고 인증 scope당 bounded page feed 하나를 명시적 config로 즉시 시작해 원격 read/reconnect를 독점한다. observer epoch로 이전 cursor callback을 무효화하고, 새 observer 설치를 prefix commit 전에 준비해 설치 실패 시 기존 coverage/listener를 유지한다. server-confirmed page는 retryable/unauthenticated outbox retry/flush 신호를 겸하고, Auth/membership 확인 복구 뒤 HEAD listener를 다시 bind한다.
- offline 최초 fetch와 활성 listener의 terminal retryable 오류는 bounded HEAD recovery 경로로 전환한다. 첫 server-confirmed page에서 자동 rebase하고, 연속 terminal 오류에는 무한 재설치 loop를 만들지 않는다.
- mobile 타임라인을 `SectionList`로 바꾸고 loading/error/retry/end footer와 중복 `onEndReached` one-flight guard를 추가했다. 현재 기본 local preview도 20건씩 최대 200건의 presentation pagination을 실제 연결하되, Home/Stats에는 전체 local event projection을 유지한다.
- 실제 Firebase project/client config와 production Auth composition이 없어 cloud timeline factory는 기본 화면에 아직 연결하지 않았다. Home/Stats용 기간별 독립 cloud projection도 연결 전 P0다. 실제 index, 두 기기 head insertion/move/delete, offline 복귀와 read 비용은 non-production QA 게이트다.

검증 상태:

- core 30건, mobile Jest 140건, Firestore/Storage Rules 23건, Functions unit 10건, transaction Emulator 5건이 통과했다. 실제 `App → useLocalTimelinePagination → TimelineScreen` 연결은 45건 fixture의 20→40→45 확장과 탭 재진입 상태 유지, 주입형 error→retry→해제 조합으로 검증한다.
- 실제 Firestore Emulator에서 동일 timestamp 4건과 soft-delete tombstone을 `documentId DESC` cursor로 `d,c,b → a` 순서로 조회해 중복·누락이 없음을 확인했다.
- workspace typecheck/lint, architecture/docs gate와 `git diff --check`가 통과했다.

## 2026-07-13 — Local-first cloud sync foundation

- 승인 MVP를 요구사항별로 다시 감사해 FR-05 offline/retry, cross-device active sleep, cache purge가 adapter 파일 존재만으로는 충족되지 않음을 확인했다.
- `packages/product-data`와 `StringStoragePort`를 추가했다. 인증 user/group/baby scoped 단일 envelope에 event projection과 revision별 outbox mutation을 한 번의 serialized write로 커밋한다. 동일 storage/scope 다중 writer를 거부하고 persist 실패 시 memory/observer를 rollback하며 local preview cache를 자동 이관하지 않는다.
- `LocalFirstCareEventRepository`는 UI 저장을 local durable commit에서 반환하고 remote transaction을 background에서 revision 순서대로 drain한다. `rev1 → rev2`를 coalesce하지 않으며 retryable·conflict·Auth/permission 상태를 분리하고 server-confirmed snapshot만 reconcile한다.
- Firestore `setDoc` transport를 transaction으로 바꿨다. canonical payload SHA-256을 사용하는 `eventMutationReceipts/{eventId@revision@payloadHash}`와 event의 마지막 mutation metadata를 Rules에서 양방향 원자 결합한다. receipt에 revision 당시 transport payload를 보존해 Rules가 event map과 직접 비교하고, adapter는 actor/hash/domain payload가 모두 일치할 때만 commit 응답 유실의 증거로 인정한다.
- active sleep은 `activeSleeps/{babyId}` singleton lock을 event와 원자 생성·종료한다. Rules가 event-only/lock-only write와 reopen을 막고 Emulator 동시 시작 2건 중 정확히 1건만 허용함을 검증했다.
- 인증 identity·membership·group·baby 일치 assertion과 cloud event factory를 추가했다. Auth sign-out, identity 변경, server-confirmed membership 제거 시 Auth/membership/event observer 중단→in-flight sync generation 무효화→serialized cache purge→revoked 통지 순서를 구현했다. remote permission 오류는 server-only membership query, Auth 오류는 `reload`와 강제 ID-token refresh로 검증한다. 복구 중 반복 401은 재귀 retry하지 않고, 정상 teardown 뒤에는 유효 identity의 지연 retry를 실행하지 않는다.
- cache 보존용 `close()`와 privacy `clear()`가 경쟁해도 purge가 우선되며 모든 caller가 실제 storage removal을 기다린다. 완료된 close 뒤에는 scoped writer claim을 다시 획득해야만 purge하고, replacement writer가 있으면 삭제하지 않는다. 손상 envelope와 storage read/remove 실패도 명시적으로 surface하고 재시도한다.
- pending/retryable/conflict 상태 banner 계약을 추가했다. 실제 Firebase project/client config와 production Auth provider가 없으므로 기본 `container.ts`는 계속 local preview이며 cloud factory를 아직 화면에 연결하지 않았다.

검증 상태:

- core 25건, mobile Jest 103건, Firestore/Storage Rules 22건, Functions unit 10건, Functions transaction Emulator 5건이 통과했다.
- workspace typecheck/lint, architecture/docs gate, `check:mobile`, `git diff --check`가 통과했다.
- frozen lockfile install과 Android production Metro bundle로 새 workspace package 해석을 확인했다.
- 실제 non-production Firebase project, 두 계정·두 기기 초대/재연결/충돌/purge QA와 AppsInToss target은 아직 미완료다.

## 2026-07-12

- Obsidian `프로젝트/개인/babycare/01 기획서`의 planning approval을 확인하고 repo `docs/`를 실행 source of truth로 승격했다.
- GitHub `origin/main`과 로컬 `main`이 동일한 `bcce524`에서 시작함을 확인했다. 기존 dirty worktree는 사용자/병렬 작업으로 보존했다.
- lifecycle을 `build`, deployment approval을 미승인으로 기록하고 Google Play/App Store/AppsInToss 3마켓 범위를 유지했다.
- Android/iOS 개발 ID를 `com.seorilabs.babycare.dev`로 사용한다. 최종 제품명, production package/bundle ID, AppsInToss `appName`은 `확정 필요`로 유지했다.
- `packages/product-core`에 수유·기저귀·수면 domain/value object, 기록·수면 종료·soft delete·대시보드 use case, Auth/그룹/아기/초대/기록 port와 순수 테스트를 구현했다. 모유 좌·우 시간은 독립 field로 저장하고, 자정을 넘는 수면 집계와 48시간 초과 active sleep 복구를 보강했다.
- active sleep 중복 시작은 현재 한 app process의 기록 요청만 직렬화한다. 서로 다른 기기의 동시 시작을 막는 server-side atomic 경로는 구현·검증하지 않았다.
- `apps/mobile`에 로컬 온보딩, 빠른 기록, 홈, 타임라인, 통계, 시스템 다크모드와 AsyncStorage 개발 adapter를 구현했다. 이는 Firebase 공동 기록 완료가 아닌 로컬 UX 기준선이다.
- RNFirebase 기반 Auth, 그룹·멤버십, 아기, 돌봄 기록 원격 transport, invite callable adapter와 외부 문서 decoder를 추가했다. Firestore write는 server acknowledgement 계약인 `CareEventRemoteStorePort`로 분리해 화면 repository로 직접 구성할 수 없게 했다. 실제 Firebase project/client config, production Auth provider와 durable outbox/coordinator가 없고 `app/container.ts`는 로컬 adapter를 선택하므로 production composition은 아직 연결하지 않았다.
- Firestore/Storage Rules와 indexes에 `isDeleted` query, 모유 좌·우 field, collection-group membership read와 close-only 수면 전이를 반영하고 Emulator 회귀 테스트를 추가했다.
- Node.js 22 Functions workspace에 `createInvite`/`acceptInvite`를 구현했다. raw code 비저장 HMAC lookup, current owner, expiry, single-use transaction, UID rate limit, 7-field membership과 actor audit 테스트를 둔다. 실제 callable deploy, verified Auth, App Check, Secret Manager와 IAM 통합은 남아 있다.
- React Native는 `0.85.3`, React는 `19.2.3`, RNFirebase는 `25.1.0`으로 고정했다. iOS는 static framework와 RNFB pod static-library workaround를 사용하며, Android local build JDK는 21을 기준으로 한다.
- local session/event cache와 Firebase decoder, Functions, Rules의 경계 검증을 강화했다. 실제 달력 날짜·미래 생년월일, document ID, C0/C1·bidi control 표시문자, 단일 baby 참조와 partial snapshot 오류를 안전하게 거부한다.
- 제품 명세, 출시 타깃, 아키텍처, backlog, QA, mobile 실행 문서를 현재 코드와 승인 기획 기준으로 동기화했다.

검증 상태:

- 로컬 AsyncStorage composition으로 iPhone 16 Pro와 작은 화면 iPhone SE(3세대) Simulator에서 온보딩→기록→타임라인→통계→초기화 흐름을 확인했다. 최종 RN `0.85.3`/RNFirebase 빌드도 iPhone 16 Pro light와 iPhone SE(3세대) dark mode에서 첫 화면을 다시 렌더링했다.
- iOS arm64 Simulator clean build와 incremental build가 RNFirebase Auth/Firestore/Functions를 포함해 `BUILD SUCCEEDED`였다. `GoogleService-Info.plist`가 없는 local build는 Firebase configure를 건너뛴다.
- Android는 Temurin JDK 21에서 `:app:assembleDebug`를 통과했다. 연결된 실기기에 development ID APK를 데이터 보존 방식으로 설치하고 process 기동·fatal log 부재를 확인했지만 기기가 잠금 상태여서 화면 visual은 증거로 사용하지 않았다.
- 최종 `pnpm test` 전체 통과: core 25건, mobile Jest 37건, Firestore/Storage Rules 18건, Functions unit 10건, Functions transaction Emulator 5건. workspace typecheck/lint와 architecture/docs gate도 같은 실행에서 통과했다.
- Android release build는 signing credential이 없으면 task 실행 전에 실패하도록 검증했다. `check:release`와 `check:ait`은 승인·확정값/target이 없어 실패하는 것이 정상이다.
- AppsInToss target, 실제 Firebase project의 두 계정·두 기기 검증, cache purge는 수행하지 않았다.

## 2026-06-16 — Upstream template provenance

- Seorilabs 비게임 앱 starter template 초기 구조를 생성했다.
- upstream private template repo `seorilabs/starter-template-app`의 docs-as-source-of-truth, Clean Architecture, 멀티마켓 target과 native launch 정책을 기반으로 했다.
- BabyCare 제품 상태는 위 2026-07-12 기록부터 추적한다.
