# Work Log

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

- core 30건, mobile Jest 141건, Firestore/Storage Rules 23건, Functions unit 10건, transaction Emulator 5건이 통과했다. 실제 `App → useLocalTimelinePagination → TimelineScreen` 연결은 45건 fixture의 20→40→45 확장과 탭 재진입 상태 유지, 주입형 error→retry→해제 조합으로 검증한다.
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
