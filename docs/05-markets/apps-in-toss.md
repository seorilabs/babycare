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
- Local storage: AppsInToss `Storage` 우선
- Auth: Platform custom token → Firebase Auth REST
- Attestation: `appLogin` 일회용 인가 코드 → Babycare mTLS Function의 Toss 사용자 검증 → 1시간 Firebase App Check custom token
- Data: Firestore REST commit/query + Firebase callable invite/delete
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
- Latest private upload: `main@2704ff7`, local isolated worktree build, `.ait` SHA-256 `02a268b0dae3ff8f8ae0817e319b78b0c1ec511da7bbc0133c186fc4465e4b26`, 3,117,587 bytes
- AppsInToss deployment: `20260811-6` / `019fee32-8415-761c-be38-9c5769aa00b2`, `CREATED`, `isTested=true`, `deployed=false` readback(2026-08-11 09:22 KST)
- Private entry: `intoss-private://babynest?_deploymentId=019fee32-8415-761c-be38-9c5769aa00b2`
- Console test push: `20260811-6`을 요청자 본인 Toss 앱으로 발송했고 `isTested=true`를 readback했다. 테스트 푸시는 비공개 후보 전달 증거이며 실제 runtime QA 완료나 공개 배포를 뜻하지 않는다
- Unused upload record: `20260811-5` / `019fee31-b55a-7bde-907e-cb8125a5d3fe`는 1회용 upload URL을 보존하지 못해 파일 PUT 없이 `PREPARE`로 남은 항목이다. 후보·심사·배포에 사용하지 않는다
- Candidate evidence: Granite/TDS 핵심 UI, AppsInToss Storage, 운영 Auth/Firestore/Functions adapter 구현. production 두 계정 그룹 생성→기록→초대→합류→공동 조회→삭제 E2E 통과
- Toss Login: 필수 최소 scope `USER_NAME`과 서비스 이용약관 `https://www.seorilabs.com/terms/`을 설정·readback했다. 전화번호·생년월일·CI·국적 scope와 callback은 구성하지 않았다
- App Check runtime: mTLS 인증서 `babynestAppCheckProd20260811`, fingerprint `0C:B8:EB:23:B4:0F:2E:B4:25:A0:A8:BF:28:90:26:46:E0:63:F6:C2:BD:ED:9F:D5:9F:2F:E1:FF:4D:78:DA:57`, expiry `2027-09-05`. app credential catalog `app/babycare/apps-in-toss/mtls-client`, local·BeeStation 암호화 backup/restore 검증과 Secret Manager cert/key version 1 연결을 완료했다
- App Check Function: `mintAitAppCheckToken`은 `asia-northeast3`, Node 22, revision `mintaitappchecktoken-00001-law`, ACTIVE다. runtime SA 자기 자신 대상 `roles/iam.serviceAccountTokenCreator`, 두 secret version 1과 Invoker IAM check 비활성화 계약을 readback했다. GET은 405, 가짜 SANDBOX code POST는 Toss mTLS 교환까지 도달한 뒤 401 `verification-failed`였다
- Sandbox QA device: iOS 18.1 `iPhone 16 Pro` simulator (`07D9A5CC-AB1D-43AA-915F-7A8128044B5B`). 공식 `apps-in-toss-sandbox-202606022149.zip`의 `AppsInTossSandbox.app` (`com.vivarepublica.ent.cash.test`) 설치 완료
- **로컬 dev server 경로는 Console 로그인이 필요 없다 (2026-08-08 실측).** 샌드박스 앱이 실행 중일 때 `xcrun simctl openurl <UDID> "intoss-sandbox://babynest"`를 열고 iOS 확인 다이얼로그에서 `열기`를 누르면 Toss 호스트 chrome 안에서 미니앱이 로드된다. `granite dev`는 포트 8081이어야 하고, cold start로 열면 Console 로그인 화면으로 떨어진다. 절차는 `apps-in-toss/README.md` 참고
- 이 경로로 2026-08-08에 온보딩→그룹 생성→수유·기저귀·수면 기록→탭 전환까지 운영 Firebase 대상으로 실행하고 화면을 캡처했다. Console 로그인이 필요한 것은 배포된 번들을 여는 경우다
- 체온·복약은 소스와 로컬 테스트까지 구현됐으며 2026-08-08 기존 sandbox 캡처·비공개 번들에는 포함되지 않는다. 새 `.ait` 후보의 입력·간격 경고·두 계정 동기화 실기기 QA가 필요하다
- Console review: 승인 완료(2026-08-04 readback)
- Ads/payment policy answers: **광고 있음 · 인앱 결제 없음 · Toss Pay 없음**으로 변경 필요. 운영 `AIT_REWARDED_AD_GROUP_ID` 등록과 Console QR/private bundle 실기기에서 load→show→`userEarnedReward`→24시간 해제를 확인해야 한다. Sandbox는 광고 검증 근거가 아니다.
- Release review prerequisite: 최신 후보 test push·`isTested=true`는 완료. 연결된 Android `Seeker`에는 운영 Toss가 아닌 `viva.republica.toss.test` 셸만 있어 앱 목록·scheme 입력 화면까지만 진입했고, Cloud Run 로그에도 가짜 smoke 외 유효 POST가 없었다. 로그인된 실제 Toss 설치 기기에서 private scheme을 열어 App Check token 발급·Storage·초대·기록·재실행·네트워크 복귀를 확인한 뒤 검수를 요청한다
- 기존 `019fd827-571d-791d-bd50-08f2da35afec` 번들은 App Check header가 없어 보호 API가 거부된다. 최신 후보는 `019fee32-8415-761c-be38-9c5769aa00b2`이며 운영 강제를 낮추지 않는다.

## 주의

운영 API E2E와 비공개 `.ait` 업로드 성공은 sandbox 실기기 QA, Console 이미지·정책 등록, 심사 준비나 production 공개 완료를 의미하지 않는다.
최초 route에서 framework template 화면이나 빈 화면이 먼저 보이면 release blocker로 본다.
