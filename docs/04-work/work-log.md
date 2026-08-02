# Work Log

## 2026-08-02 — platform custom token bridge 운영 활성화

- `platform-auth@seorilabs-babycare.iam.gserviceaccount.com`을 생성하고 `platform-api@seorilabs-platform.iam.gserviceaccount.com`에 해당 service account의 resource-level `roles/iam.serviceAccountTokenCreator`만 부여했다. 프로젝트 전체 Token Creator binding은 추가하지 않았다.
- platform 앱 레지스트리를 Firestore에 동기화하고 최초 활성화 workflow [run 30750253253](https://github.com/seorilabs/platform/actions/runs/30750253253)로 `platform-api-00015-xpx`를 배포했다. 활성화 시점에는 `platform:b57bfc82a6cf7cf5f5fb2b9c612adc4612d5754d` 이미지를 100% 제공했다.
- live endpoint에서 임의 `uid` 주입 거부, 신규 custom token의 Firebase 교환, 합성 legacy Firebase ID token의 동일 UID 전환, `Cache-Control: no-store`를 검증했다.
- 같은 날 후속 main production [run 30750946141](https://github.com/seorilabs/platform/actions/runs/30750946141)이 `platform-api-00016-cdv` / `platform:bdbd69428900d85ab7ae4e9a58b32eee09e48f20`로 전진한 뒤에도 babycare config 200과 custom-token route의 POST-only 405를 다시 확인했다.
- smoke가 만든 Firebase Auth 사용자와 platform identity/user mapping은 종료 시 삭제했다. token·API key·UID는 로그나 문서에 남기지 않았다.
- App Check 또는 edge rate limit과 실제 기존 사용자·실기기 migration은 별도 release gate로 남는다.

## 2026-08-02 — 익명 인증을 platform custom token bridge로 전환

- production mobile 인증에서 RNFirebase `signInAnonymously`를 제거하고 Seorilabs platform의 custom token endpoint를 호출한 뒤 `signInWithCustomToken`으로 연결한다. direct anonymous는 Firebase Emulator 전용으로 제한했다.
- 기존 anonymous Firebase 사용자는 강제 갱신한 ID token을 platform이 검증해 같은 uid로 custom token을 발급받는다. bridge 응답이나 Firebase credential uid가 다르면 새 사용자로 조용히 전환하지 않고 fail closed 한다.
- 신규 사용자는 uid를 클라이언트가 고르지 않고 platform 서버가 생성한다. custom token은 저장하지 않고 즉시 Firebase 로그인에 한 번 사용한다.
- 당시 코드 검증과 분리했던 signer SA/IAM, registry sync, API 배포와 live 신규·합성 legacy UID smoke는 같은 날 후속 운영 작업으로 완료했다.

## 2026-08-02 — 공동 기록 온보딩의 작은 화면·키보드 경로 보강

- 제품의 공동 기록 온보딩은 `KeyboardAvoidingView` 안에 고정 `View`만 사용해 작은 화면·큰 글꼴·키보드가 열린 조건에서 입력 필드와 제출 버튼이 화면 밖으로 밀려도 스크롤로 복구할 수 없었다.
- 화면 전체를 safe area 안에 두고 내용 컨테이너를 `flexGrow` 기반 `ScrollView`로 바꿔, 키보드가 열린 상태에서도 모든 입력·이전·제출 동작까지 세로 스크롤할 수 있게 했다.
- 온보딩 회귀 테스트가 safe area와 키보드 탭을 보존하는 스크롤 컨테이너, 세로 스크롤 표시 제거, `flexGrow` 확장 계약을 검증한다. 테스트는 수정 전 safe area·scroll 경로 누락으로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/251건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- iPhone SE(3세대) Simulator에서 Firebase Emulator·Metro와 Debug build를 시도했지만, 격리 worktree에 `GoogleService-Info.plist`가 없어 app target 빌드가 중단됐다. 실제 작은 화면·큰 글꼴·키보드 화면은 확인하지 않았고 native client config blocker를 완료 처리하지 않는다.

## 2026-08-02 — 공동 기록 생성·참여 오류의 내부 진단 노출 차단

- 공동 기록 생성·초대 참여 요청이 Firebase/Auth/Functions 오류로 실패하면 `[firestore/unavailable]`, `[functions/failed-precondition]` 같은 SDK 코드와 영문 내부 진단을 온보딩 화면에 그대로 표시했다.
- 입력 단계의 검증은 기존대로 유지하고, 실제 생성 실패는 연결 확인·재시도 안내로, 참여 실패는 코드 확인·재발급 안내로 제한해 내부 구현 정보를 사용자 화면에서 분리했다.
- 온보딩 회귀 테스트가 생성·참여 각각에 실제 기술 오류를 주입해 제품 안내만 표시하고 SDK 코드와 영문 진단은 노출하지 않는지 검증한다. 두 테스트는 수정 전 내부 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/250건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 생성·참여 오류 화면을 직접 확인하지 않았다.

## 2026-08-02 — 공동 기록 시작 오류의 내부 진단 노출 차단

- 공동 기록 bootstrap이 실제 `Error`로 실패하면 제품 fallback 대신 `Firebase native client configuration…` 같은 영문 내부 진단을 연결 오류 화면에 그대로 표시했다.
- 시작 실패 화면은 항상 `공동 기록을 시작하지 못했어요`를 표시하고, 원래 오류는 화면에 렌더하지 않는 `cause`로 보존해 사용자 안내와 진단 경계를 분리했다. 기록 저장·동기화 등 다른 동작 오류의 세부 안내는 이번 범위에서 일괄 숨기지 않았다.
- Firebase 제품 root 회귀 테스트가 실제 기술 오류를 주입해 내부 구성명은 노출하지 않고 제품 fallback만 표시하는지 검증한다. 테스트는 수정 전 영문 기술 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/248건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연결 오류 화면을 직접 확인하지 않았다.

## 2026-08-02 — 제품 화면 Firebase 기술 문구 제거

- 기본 제품 런타임의 공동 기록 로딩·시작 실패·계정 상태 변경 안내가 `Firebase 계정`, `Firebase 공동 기록`처럼 사용자에게 필요 없는 백엔드 구현명을 노출했다.
- 로딩은 계정과 돌봄 그룹을 확인하는 실제 동작만 안내하고, 시작 실패와 계정 상태 변경도 `공동 기록` 제품 용어로 통일했다. 개발 코드의 Firebase 식별자와 진단 경계는 유지했다.
- Firebase 제품 root 렌더 회귀 테스트를 추가해 로딩 화면과 메시지 없는 시작 실패 fallback이 제품 문구를 표시하고 `Firebase`를 노출하지 않는지 검증한다. 테스트는 수정 전 두 화면 모두 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/248건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 로딩·오류 화면을 직접 확인하지 않았다.

## 2026-08-02 — 본인 기록 삭제 접근성 경로 추가

- 타임라인의 본인 기록 soft delete는 길게 누르기에만 연결돼 있어 화면낭독기 사용자가 MVP 삭제 기능을 안정적으로 실행할 명시적 접근성 동작이 없었다.
- 본인 기록 행에 button 역할과 `기록 삭제` 활성화 동작을 추가해 화면낭독기의 기본 활성화가 기존 삭제 확인창을 열도록 연결했다. 터치 사용자의 길게 누르기는 유지하고 다른 양육자의 기록에는 삭제 역할·동작을 노출하지 않는다.
- Timeline 회귀 테스트가 본인 기록의 접근성 활성화와 길게 누르기가 같은 확인창을 열고, 다른 양육자 기록에는 삭제 접근성 동작이 없는지 검증한다. 테스트는 수정 전 접근성 역할 누락으로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 31 suites/246건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 VoiceOver/TalkBack과 simulator/device 화면을 직접 확인하지 않았다.

## 2026-08-02 — 수면 종료 중복 요청 방지

- 홈의 활성 수면 `기상` 버튼은 종료 요청이 진행 중이어도 재입력이 가능해, 빠른 연속 탭으로 같은 수면의 종료 mutation을 두 번 요청하고 첫 성공 뒤 불필요한 충돌 오류를 노출할 수 있었다.
- 화면 상태와 별개인 동기식 요청 잠금을 추가해 첫 종료 요청이 끝날 때까지 재입력을 차단했다. 버튼은 `종료 중…`·`잠시만 기다려주세요`로 바뀌며 접근성 이름과 `busy`·`disabled` 상태도 함께 제공한다.
- Home 화면 회귀 테스트가 같은 렌더의 수면 종료 버튼을 연속 두 번 눌러도 요청이 한 번만 실행되고 완료 뒤 다시 활성화되는지 검증한다. 테스트는 수정 전 종료 요청 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 31 suites/246건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연속 탭과 종료 진행 상태 화면을 직접 확인하지 않았다.

## 2026-08-01 — 빠른 돌봄 기록 중복 저장 방지

- 수유·기저귀·수면 빠른 기록 모달은 React의 `saving` 상태만 확인해, 버튼 비활성화 재렌더 전에 빠르게 두 번 누르면 서로 다른 이벤트 ID의 돌봄 기록 두 건을 저장할 수 있었다.
- 저장 payload를 만든 직후 동기식 요청 잠금을 걸어 저장이 끝날 때까지 재입력을 차단했다. 저장 버튼에는 `돌봄 기록 저장`·`돌봄 기록 저장 중` 접근성 이름과 `busy`·`disabled` 상태를 추가했다.
- Quick record modal 회귀 테스트가 같은 렌더의 저장 버튼을 연속 두 번 눌러도 요청과 닫기 동작이 각각 한 번만 실행되는지 검증한다. 테스트는 수정 전 저장 요청 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 31 suites/245건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연속 탭과 저장 진행 상태 화면을 직접 확인하지 않았다.

## 2026-08-01 — 공동 기록 온보딩 중복 제출 방지

- 공동 기록 생성·참여 버튼은 React의 `saving` 상태만 확인해, 비활성화 재렌더 전에 같은 버튼을 빠르게 두 번 누르면 Firebase 그룹 생성 또는 참여 요청이 중복 실행될 수 있었다. 특히 생성 요청이 겹치면 한 익명 계정에 여러 그룹이 만들어져 다음 세션 복원이 중단될 수 있다.
- 화면 상태와 별개인 동기식 요청 잠금을 추가해 생성·참여 요청이 끝날 때까지 재입력을 차단했다. 진행 버튼은 기존 `공동 기록을 준비하는 중…` 문구와 함께 접근성 `busy`·`disabled` 상태도 노출한다.
- Cloud onboarding 회귀 테스트가 같은 렌더의 생성 버튼을 연속 두 번 눌러도 요청이 한 번만 실행되고 완료 뒤 다시 활성화되는지 검증한다. 테스트는 수정 전 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/244건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연속 탭과 진행 상태 화면을 직접 확인하지 않았다.

## 2026-08-01 — 공동 기록 온보딩 내부 개발 문구 제거

- 공동 기록 온보딩이 `Firebase Cloud/Emulator`, `현재 개발 빌드`, `출시 전에 추가`처럼 사용자와 무관한 구현 기술과 미완성 TODO를 제품 화면에 노출했다.
- 상단 문구를 확정 제품명 기반 `함께봄 공동 기록`으로 바꾸고 runtime 기술 label prop을 제거했다. 익명 계정의 복구 미지원은 숨기지 않고, 앱 삭제·기기 변경 시 계정과 기록에 다시 접근하지 못할 수 있다는 현재 위험으로 안내한다.
- Cloud onboarding 회귀 테스트가 제품 문구와 계정 안전 안내를 검증하고 `Firebase`·`현재 개발 빌드`·`출시 전에`의 재노출을 막는다. 테스트는 수정 전 내부 문구 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/243건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다. 계정 복구·삭제 정책도 완료 처리하지 않았다.
- 부팅된 iOS Simulator가 없었고, 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 설치 시 서명·앱 데이터 영향 가능성이 있으므로 현재 문구를 설치하거나 화면으로 직접 확인하지 않았다.

## 2026-08-01 — 타임라인 실시간 연결 오표시 제거

- 타임라인은 Firebase 공동 기록 모드라는 이유만으로 `● LIVE` 배지를 표시해, 오프라인 기록·재시도·연결 오류 상태에서도 실시간 연결 중이라고 안내했다. 실제 pending/failed 상태는 별도 동기화 배너가 담당한다.
- 연결 상태를 추정하지 않고 제품 모드만 설명하도록 Firebase 배지를 `● 공동 기록`, Jest 전용 local preview 배지를 `● 로컬 저장`으로 바꿨다.
- Timeline 회귀 테스트가 Firebase 모드에서 `공동 기록`을 표시하고 `LIVE`를 다시 노출하지 않는지 검증한다. 테스트는 수정 전 `● LIVE`로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/242건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator가 없었고, 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 설치 시 서명·앱 데이터 영향 가능성이 있으므로 현재 변경을 설치하거나 화면으로 직접 확인하지 않았다.

## 2026-08-01 — 만료 초대 코드 공유 차단

- 더보기 화면은 초대 만료 시각이 지났어도 코드를 `까지 유효`로 표시하고 공유 버튼을 계속 제공해, 서버가 거부할 만료 코드를 다른 양육자에게 전달할 수 있었다.
- 만료된 코드는 화면에서 가리고 `초대 코드가 만료됐어요` 상태와 `새 코드 만들기` 동작을 노출했다. 만료되지 않은 기존 코드의 공유 흐름은 유지했다.
- More 화면 회귀 테스트가 만료 코드·공유 동작이 노출되지 않고 replacement 생성 요청만 실행되는지 검증한다. 테스트는 수정 전 만료 상태 누락으로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/241건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 서명 충돌이나 앱 데이터 영향 가능성이 있으므로 설치하지 않았다. 부팅된 iOS Simulator도 없어 실제 만료 상태 화면은 직접 확인하지 않았다.

## 2026-08-01 — 초대 코드 중복 생성 요청 방지

- 더보기의 초대 코드 생성 버튼은 진행 중 잠금이 없어 빠른 연속 탭마다 privileged Functions 요청을 다시 보내고 rate-limit 오류를 만들 수 있었다.
- 동기식 요청 잠금과 진행 상태를 추가해 완료 전 재입력을 막고, 버튼을 `만드는 중…`으로 비활성화하며 접근성 `busy`/`disabled` 상태도 함께 노출했다.
- More 화면 회귀 테스트가 같은 렌더의 연속 탭 두 번에서도 생성 요청이 한 번만 실행되고 완료 뒤 버튼이 다시 활성화되는지 검증한다. 테스트는 수정 전 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/240건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 서명 충돌이나 앱 데이터 영향 가능성이 있으므로 설치하지 않았다. 부팅된 iOS Simulator도 없어 실제 진행 상태 화면은 직접 확인하지 않았다.

## 2026-07-31 — 작은 화면 빠른 기록 2열 안정화

- 홈 빠른 기록 카드는 `48.5%` 고정 너비 두 개와 10px gap을 사용해 320px 화면에서 가용 content 폭 284px보다 합계가 약 1.5px 커지고, 단일 열로 밀리거나 가로로 넘칠 수 있었다.
- 카드 기준 폭을 `47%`로 낮추고 남는 폭을 `flexGrow`로 균등 분배해 좁은 화면에서도 두 카드와 gap이 먼저 맞도록 수정했다.
- Home 회귀 테스트가 네 빠른 동작의 가변 2열 스타일과 고정 width 제거를 검증한다. 테스트는 수정 전 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/239건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 작은 화면과 큰 글꼴을 직접 확인하지 않았다.

## 2026-07-31 — 구성원 새로고침 안내 정합성 수정

- 더보기의 `동기화 상태` 행은 상태 화면을 열지 않고 구성원 목록만 다시 읽었으며, 요청 실패도 조용히 무시해 실제 동작과 문구가 어긋났다.
- Firebase 구성에서는 행을 `구성원 목록 새로고침`으로 바꾸고 실제 동작을 설명했다. 실행 가능한 설정 행에는 button 접근성 역할·라벨을 부여하고 실패 원인을 Alert로 표시한다.
- More 화면 회귀 테스트가 실제 동작 문구, 접근성 라벨, 실패 안내를 검증한다. 테스트는 수정 전 문구 불일치로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/238건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 이번 실행은 설정 행의 정적 UI·오류 처리 수정이라 simulator/device 화면은 직접 확인하지 않았다.

## 2026-07-31 — 공동 기록 오류의 로컬 미리보기 우회 제거

- Firebase 화면 import 또는 초기화 실패 시 `로컬 미리보기로 계속`을 노출해, 사용자가 공동 기록과 분리된 개발용 로컬 저장소에 기록을 만들 수 있었다.
- 제품 runtime 오류 화면은 공동 기록 실패를 명확히 유지하고 재시도만 제공하도록 fail-closed 처리했다. local preview composition은 기존 Jest 경로에만 남겼다.
- `check:mobile`에 제품 runtime source의 `로컬 미리보기` 문구와 우회 handler 재노출 방지 검사를 추가했다. 검사는 수정 전 두 오류 화면을 찾아 실패했고 수정 후 통과했다.
- 기획 기준선과 QA 전략의 local preview 범위를 Jest 전용으로 맞췄다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/237건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 이번 실행은 오류 경계의 정적 UI 수정이라 simulator/device 화면은 직접 확인하지 않았다.

## 2026-07-31 — 새 기기 진행 중 수면 표시 복구

- Home은 별도 active-sleep projection을 받아 기상 동작에는 사용했지만 최근 수면 카드는 bounded 이벤트 목록의 latest 값만 렌더링했다. 새 기기나 timeline 범위 밖 active sleep에서는 `마지막 수면 · 아직 기록이 없어요`와 `기상` 동작이 동시에 노출될 수 있었다.
- authoritative `activeSleep`이 있으면 최근 수면 카드에서도 우선 표시하고, 없을 때만 overview의 마지막 완료 수면을 사용하도록 수정했다.
- bounded 이벤트 목록이 비어 있고 active-sleep projection만 있는 조건을 Home 회귀 테스트로 추가했다. 테스트는 수정 전 `밤잠 자는 중` 누락을 재현했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/237건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 이번 실행은 정적 렌더 경계 수정이라 simulator/device 화면은 직접 확인하지 않았다.

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
