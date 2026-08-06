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
- Data: Firestore REST commit/query + Firebase callable invite/delete

## Registration

- Logo: AppsInToss Console 등록 완료
- Logo source file: `apps-in-toss/assets/logo-600.png` — 600×600 RGB 검증
- Thumbnail: `apps-in-toss/assets/thumbnail-1932x828.png` — 1932×828 RGB 검증
- Vertical screenshots: `apps-in-toss/screenshots/*.png` — 636×1048 RGB 5장 검증
- Brand color: `#5FB49C`
- Initial route branding: `함께봄` 제품 화면 반영
- Privacy URL: `https://www.seorilabs.com/privacy/`
- In-app feature candidate: 한국어 `돌봄 기록하기`, 영어 `Log baby care`, route `/`. 비게임은 최소 1개 등록·검토가 필요하며 현재 root route로 정상 진입 가능
- Terms URL: `https://www.seorilabs.com/terms/` — Seorilabs 앱·서비스 공용 이용약관, 2026-08-07 live 200 확인
- 추가 in-app feature: 없음 — v1은 root `/`의 `돌봄 기록하기` 1개만 Console 등록 후보로 유지

현재 screenshot은 같은 제품의 native 화면을 AppsInToss 규격에 맞춘 후보다. 실제 AIT sandbox UI를
캡처해 기능·화면 일치성을 확인한 뒤 Console 등록본을 교체한다.

## Release

- `.ait` artifact: `apps/ait/*.ait`
- Latest private upload: `main@707df10` / workflow run `31123595821` / artifact `8974273502`
- AppsInToss deployment ID: `019fd827-571d-791d-bd50-08f2da35afec` (2026-08-07 02:38 KST 업로드 완료)
- Private entry: `intoss-private://babynest?_deploymentId=019fd827-571d-791d-bd50-08f2da35afec`
- Console test push: 최신 `20260807-3` 번들을 요청자 본인 Toss 앱으로 발송했고 `isTested=true` readback 완료(2026-08-07). 실제 기기에서 열어 기능을 확인한 증거는 아직 없음
- Candidate evidence: Granite/TDS 핵심 UI, AppsInToss Storage, 운영 Auth/Firestore/Functions adapter 구현. production 두 계정 그룹 생성→기록→초대→합류→공동 조회→삭제 E2E 통과
- Sandbox QA device: iOS 18.1 `iPhone 16 Pro` simulator (`07D9A5CC-AB1D-43AA-915F-7A8128044B5B`). 공식 `apps-in-toss-sandbox-202606022149.zip`의 `AppsInTossSandbox.app` (`com.vivarepublica.ent.cash.test`) 설치·로그인 화면 실행 완료 / Console 계정 로그인·Toss 인증 대기
- Console review: 승인 완료(2026-08-04 readback)
- Ads/payment policy answers: **광고 없음 · 인앱 결제 없음 · Toss Pay 없음** — v1 무료·무광고·무구독 ADR과 `apps/ait` 의존성·호출 기준 확정. Console readback은 로그인 세션 연결 뒤 확인
- Release review prerequisite: Console test push·`isTested=true`는 완료. 실제 Toss 앱에서 private scheme을 열어 기능을 확인한 뒤 in-app feature와 함께 검수 요청

## 주의

운영 API E2E와 비공개 `.ait` 업로드 성공은 sandbox 실기기 QA, Console 이미지·정책 등록, 심사 준비나 production 공개 완료를 의미하지 않는다.
최초 route에서 framework template 화면이나 빈 화면이 먼저 보이면 release blocker로 본다.
