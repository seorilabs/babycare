# AppsInToss

## App Identity

- appName: `babynest` (2026-08-04 Console readback)
- Korean display name: `함께봄: 아기돌봄 기록`
- English display name: `BabyNest`
- Category: `생활 > 일상 > 가족`
- Support email: `cs@seorilabs.com`

## Runtime

- Framework: Granite React Native
- TDS: `@toss/tds-react-native`
- Entry scheme: `intoss://babynest/`
- Local storage: AppsInToss `Storage` 기반 session + event envelope v3/outbox
- Auth: Platform custom token → Firebase Auth REST
- Attestation: `appLogin` 일회용 인가 코드 → Babycare mTLS Function의 Toss 사용자 검증 → 1시간 Firebase App Check custom token
- Data: 공통 `LocalFirstCareEventRepository` + Firestore REST mutation/query/polling + Firebase callable invite/delete
- Analytics: GA4 callable relay + Platform Events 이중 전송
- Ads: 통계 상세의 선택형 통합 리워드 1개, 보상 완료 후 24시간 해제

## Registration

- Logo: AppsInToss Console 등록 완료
- Logo source file: `apps-in-toss/assets/logo-600.png` — 600×600 RGB 검증
- Thumbnail: `apps-in-toss/assets/thumbnail-1932x828.png` — 1932×828 RGB 검증
- Vertical screenshots: `apps-in-toss/screenshots/*.png` — 636×1048 RGB 5장 검증. **2026-08-08에 AppsInToss sandbox에서 실행한 실제 미니앱 화면으로 교체했다** — 온보딩·홈·기록·통계·더보기. 이전 등록본은 같은 제품의 `apps/mobile` native 화면을 규격에 맞춘 것이라 미니앱 UI와 달랐다. 크기·구성은 `node scripts/check-store-screenshots.mjs`가 검사한다
- Brand color: `#5FB49C`
- Initial route branding: `함께봄` 제품 화면 반영
- Privacy URL: `https://www.seorilabs.com/apps/babycare/privacy/` — 체온·복약과 2026-08-10 시행일을 반영한 한국어·영어 공개 페이지 live 200 readback 완료
- In-app feature candidate: 한국어 `수유·수면·체온·복약 기록하기`, 영어 `Log feeding, sleep, temperature and medication`, route `/`. 비게임은 최소 1개 등록·검토가 필요하며 현재 root route로 정상 진입 가능. Console 문구 재입력은 새 후보 QA 뒤 진행한다
- Terms URL: `https://www.seorilabs.com/terms/` — Seorilabs 앱·서비스 공용 이용약관, 2026-08-07 live 200 확인
- 추가 in-app feature: 없음 — v1은 root `/`의 `돌봄 기록하기` 1개만 Console 등록 후보로 유지

screenshot은 sandbox에서 실행한 미니앱 실제 화면이다. 저장소 자산은 교체를 마쳤고 Console 업로드는
수동 절차로 남아 있다.

## Release

- `.ait` artifact: `apps/ait/*.ait`
- Latest private upload: `main@21a8573`, local isolated worktree build, `.ait` SHA-256 `baf0e95078a7156a74c54b2c8b3bb50bfeaf233feb68b54049a7567d7973c495`, 3,153,626 bytes
- AppsInToss deployment: `20260811-7` / `019ff016-36a2-75bc-a29e-ea987c0bfed4`, `CREATED`, `isTested=true`, `deployed=false` readback(2026-08-11 18:11 KST)
- Private entry: `intoss-private://babynest?_deploymentId=019ff016-36a2-75bc-a29e-ea987c0bfed4`
- Console test push: `20260811-7`을 요청자 본인 Toss 앱으로 발송했고 `isTested=true`를 readback했다. 테스트 푸시는 비공개 후보 전달 증거이며 실제 runtime QA 완료나 공개 배포를 뜻하지 않는다
- Unused upload record: `20260811-5` / `019fee31-b55a-7bde-907e-cb8125a5d3fe`는 1회용 upload URL을 보존하지 못해 파일 PUT 없이 `PREPARE`로 남은 항목이다. 후보·심사·배포에 사용하지 않는다
- Candidate evidence: Granite/TDS 핵심 UI, AppsInToss Storage, 운영 Auth/Firestore/Functions adapter 구현. production 두 계정 그룹 생성→기록→초대→합류→공동 조회→삭제 E2E 통과
- Toss Login: 필수 최소 scope `USER_NAME`과 서비스 이용약관 `https://www.seorilabs.com/terms/`을 설정·readback했다. 전화번호·생년월일·CI·국적 scope와 callback은 구성하지 않았다
- App Check runtime: mTLS 인증서 `babynestAppCheckProd20260811`, fingerprint `0C:B8:EB:23:B4:0F:2E:B4:25:A0:A8:BF:28:90:26:46:E0:63:F6:C2:BD:ED:9F:D5:9F:2F:E1:FF:4D:78:DA:57`, expiry `2027-09-05`. app credential catalog `app/babycare/apps-in-toss/mtls-client`, local·BeeStation 암호화 backup/restore 검증과 Secret Manager cert/key version 1 연결을 완료했다
- App Check Function: `mintAitAppCheckToken`은 `asia-northeast3`, Node 22, revision `mintaitappchecktoken-00001-law`, ACTIVE다. runtime SA 자기 자신 대상 `roles/iam.serviceAccountTokenCreator`, 두 secret version 1과 Invoker IAM check 비활성화 계약을 readback했다. GET은 405, 가짜 SANDBOX code POST는 Toss mTLS 교환까지 도달한 뒤 401 `verification-failed`였다
- Positive Toss runtime readback: 사용자의 실제 Toss 로그인 뒤 `mintAitAppCheckToken` POST가 2026-08-11 17:44:16 KST에 200을 반환했고, 17:44:46 KST에 운영 Firestore 새 그룹 1건·owner membership 1건·아기 1건이 생성됐다. 최초 돌봄 기록은 0건이며 PII 원문은 출력·기록하지 않았다
- Onboarding input fix: 문자열 생년월일 입력을 오늘 이후 날짜를 막는 AIT 호환 달력으로 교체하고, 온보딩·체온·복약 입력에 keyboard inset·포커스 자동 스크롤을 적용했다. `20260811-7` 비공개 업로드·test push까지 완료했고 실제 Toss 기기 재검증은 아직 남아 있다
- Feature parity source: mobile의 주요 UI·표시 로직 11개(클라우드 온보딩 포함)와 탭 destination 계약을 `check:ait:parity`로 계속 대조하며, 이 검사는 `pnpm run test:static`을 통해 PR·main push마다 실행된다. AIT 탭바의 시각 구조만 AppsInToss 브랜딩 정책에 따라 mobile과 분리하고 홈·기록·통계·더보기 4개 destination은 동일하게 유지한다. 수유 4종·좌우 timer, 기저귀 3종, 수면 종류, 체온·복약, 과거 시각·메모, 첫 기록 가이드, latest 5종 홈, 20개 단위 timeline pagination, 날짜/작성자/삭제, 12시간·7일·30일 chart, 전체 구성원·초대 공유·privacy를 AIT RN 0.84 renderer에 반영했다. native DateTimePicker는 Granite에서 동일한 날짜 선택 계약을 제공하는 AIT 달력 adapter로 대체하며, mobile target RN 0.85를 import하지 않는다
- Store review UI: 첫 렌더는 서비스 가치·기능·초대 그룹 공유 범위를 설명하는 인트로이며 `토스로 시작하기`를 누르기 전에는 Toss 로그인 bootstrap을 호출하지 않는다. 하단 탭은 공식 UI/UX 가이드에 맞춰 화면 가장자리와 시스템 내비게이션에서 분리된 둥근 플로팅 surface로 구현한다. 이 두 항목은 source/unit gate를 통과해도 최신 `.ait`의 Toss sandbox 시각 QA와 Console 재검수는 별도 gate다
- AIT offline sync: event는 AppsInToss Storage envelope에 먼저 저장되고 REST 전송 실패는 outbox failed 상태로 남는다. 15초 polling, Toss host active 복귀, 사용자 retry에서 같은 mutation receipt ID로 재시도한다. 로컬 contract test는 통과했지만 실제 Toss 설치 기기의 강제 종료·재실행·offline→online readback은 남아 있다
- Parity local artifact: `019ff122-6c76-7f8d-81b5-9a92efed2cc5`, SHA-256 `6d5e2fc10ec60118689ca7b42e70cb0b3cf68f10be6191b3b7f5c52a3a6fd69c`. RN 0.84.0/0.72.6 iOS·Android bundle 4개를 오류·경고 없이 생성했고 source map에서 패리티 화면·local-first runtime 포함과 mobile native dependency 제외를 확인했다. 비공개 Console 업로드·test push·실기기 QA·운영 배포는 수행하지 않았다
- Sandbox QA device: iOS 18.1 `iPhone 16 Pro` simulator (`07D9A5CC-AB1D-43AA-915F-7A8128044B5B`). 공식 `apps-in-toss-sandbox-202606022149.zip`의 `AppsInTossSandbox.app` (`com.vivarepublica.ent.cash.test`) 설치 완료
- **로컬 dev server 경로는 Console 로그인이 필요 없다 (2026-08-08 실측).** 샌드박스 앱이 실행 중일 때 `xcrun simctl openurl <UDID> "intoss-sandbox://babynest"`를 열고 iOS 확인 다이얼로그에서 `열기`를 누르면 Toss 호스트 chrome 안에서 미니앱이 로드된다. `granite dev`는 포트 8081이어야 하고, cold start로 열면 Console 로그인 화면으로 떨어진다. 절차는 `apps-in-toss/README.md` 참고
- 이 경로로 2026-08-08에 온보딩→그룹 생성→수유·기저귀·수면 기록→탭 전환까지 운영 Firebase 대상으로 실행하고 화면을 캡처했다. Console 로그인이 필요한 것은 배포된 번들을 여는 경우다
- 체온·복약은 소스와 로컬 테스트까지 구현됐으며 2026-08-08 기존 sandbox 캡처·비공개 번들에는 포함되지 않는다. 새 `.ait` 후보의 입력·간격 경고·두 계정 동기화 실기기 QA가 필요하다
- Console review: 승인 완료(2026-08-04 readback)
- Ads/payment policy answers: **광고 있음 · 인앱 결제 없음 · Toss Pay 없음**으로 변경 필요. `통계 보상형 광고`는 2026-08-12 11:31 KST 생성 후 13:35 KST `ENABLED`와 정식 `groupId`를 Console API로 readback했고, 같은 ID를 GitHub `apps-in-toss` environment의 `AIT_REWARDED_AD_GROUP_ID` variable로 등록했다. 운영 ID는 production build에만 주입한다. 개발·QA의 load→show→`userEarnedReward`→24시간 해제는 공식 test ID `ait-ad-test-rewarded-id`로 확인하며, 실제 광고 ID를 테스트 노출에 사용하지 않는다.
- Rewarded-ad local production artifact: `origin/main@ff837dd` 기반 `019ff443-31e2-79a2-b68b-cfde741ac42a`, SHA-256 `3895283b679b2434cb5deab0a2716cf2d734df3799c5cb904c95d85fe1bc1e8e`, 3,771,389 bytes. RN 0.84.0/0.72.6 Android·iOS 번들 4개 모두 운영 ID 포함, 광고/Firebase 환경 placeholder 없음, Firebase key 인라인, test ID 제외를 확인했다. 로컬 생성만 했으며 Console 업로드·test push·배포는 수행하지 않았다.
- Release review prerequisite: 날짜·키보드 수정 후보 `20260811-7` test push·`isTested=true`와 실제 Toss 로그인 기반 App Check token 발급·그룹·membership·아기 생성은 확인했다. 이 후보에서 날짜·키보드, Storage 재실행 복구·토큰 만료 갱신·초대·공동 기록·네트워크 복귀를 확인하고 검수를 요청한다
- 기존 `019fd827-571d-791d-bd50-08f2da35afec` 번들은 App Check header가 없어 보호 API가 거부된다. 최신 후보는 `019ff016-36a2-75bc-a29e-ea987c0bfed4`이며 운영 강제를 낮추지 않는다.

## 주의

운영 API E2E와 비공개 `.ait` 업로드 성공은 sandbox 실기기 QA, Console 이미지·정책 등록, 심사 준비나 production 공개 완료를 의미하지 않는다.
최초 route에서 framework template 화면이나 빈 화면이 먼저 보이면 release blocker로 본다.
