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
- Vertical screenshots: `apps-in-toss/screenshots/*.png` — 636×1048 RGB 5장 검증. **2026-08-08에 AppsInToss sandbox에서 실행한 실제 미니앱 화면으로 교체했다** — 온보딩·홈·기록·통계·더보기. 이전 등록본은 같은 제품의 `apps/mobile` native 화면을 규격에 맞춘 것이라 미니앱 UI와 달랐다. 크기·구성은 `node scripts/check-store-screenshots.mjs`가 검사한다
- Brand color: `#5FB49C`
- Initial route branding: `함께봄` 제품 화면 반영
- Privacy URL: `https://www.seorilabs.com/privacy/`
- In-app feature candidate: 한국어 `돌봄 기록하기`, 영어 `Log baby care`, route `/`. 비게임은 최소 1개 등록·검토가 필요하며 현재 root route로 정상 진입 가능
- Terms URL: `https://www.seorilabs.com/terms/` — Seorilabs 앱·서비스 공용 이용약관, 2026-08-07 live 200 확인
- 추가 in-app feature: 없음 — v1은 root `/`의 `돌봄 기록하기` 1개만 Console 등록 후보로 유지

screenshot은 sandbox에서 실행한 미니앱 실제 화면이다. 저장소 자산은 교체를 마쳤고 Console 업로드는
수동 절차로 남아 있다.

## Release

- `.ait` artifact: `apps/ait/*.ait`
- Latest private upload: `main@707df10` / workflow run `31123595821` / artifact `8974273502`
- AppsInToss deployment ID: `019fd827-571d-791d-bd50-08f2da35afec` (2026-08-07 02:38 KST 업로드 완료)
- Private entry: `intoss-private://babynest?_deploymentId=019fd827-571d-791d-bd50-08f2da35afec`
- Console test push: 최신 `20260807-3` 번들을 요청자 본인 Toss 앱으로 발송했고 `isTested=true` readback 완료(2026-08-07). 실제 기기에서 열어 기능을 확인한 증거는 아직 없음
- Candidate evidence: Granite/TDS 핵심 UI, AppsInToss Storage, 운영 Auth/Firestore/Functions adapter 구현. production 두 계정 그룹 생성→기록→초대→합류→공동 조회→삭제 E2E 통과
- Sandbox QA device: iOS 18.1 `iPhone 16 Pro` simulator (`07D9A5CC-AB1D-43AA-915F-7A8128044B5B`). 공식 `apps-in-toss-sandbox-202606022149.zip`의 `AppsInTossSandbox.app` (`com.vivarepublica.ent.cash.test`) 설치 완료
- **로컬 dev server 경로는 Console 로그인이 필요 없다 (2026-08-08 실측).** 샌드박스 앱이 실행 중일 때 `xcrun simctl openurl <UDID> "intoss-sandbox://babynest"`를 열고 iOS 확인 다이얼로그에서 `열기`를 누르면 Toss 호스트 chrome 안에서 미니앱이 로드된다. `granite dev`는 포트 8081이어야 하고, cold start로 열면 Console 로그인 화면으로 떨어진다. 절차는 `apps-in-toss/README.md` 참고
- 이 경로로 2026-08-08에 온보딩→그룹 생성→수유·기저귀·수면 기록→탭 전환까지 운영 Firebase 대상으로 실행하고 화면을 캡처했다. Console 로그인이 필요한 것은 배포된 번들을 여는 경우다
- Console review: 승인 완료(2026-08-04 readback)
- Ads/payment policy answers: **광고 없음 · 인앱 결제 없음 · Toss Pay 없음** — v1 무료·무광고·무구독 ADR과 `apps/ait` 의존성·호출 기준 확정. Console readback은 로그인 세션 연결 뒤 확인
- Release review prerequisite: Console test push·`isTested=true`는 완료. 실제 Toss 앱에서 private scheme을 열어 기능을 확인한 뒤 in-app feature와 함께 검수 요청

## 주의

운영 API E2E와 비공개 `.ait` 업로드 성공은 sandbox 실기기 QA, Console 이미지·정책 등록, 심사 준비나 production 공개 완료를 의미하지 않는다.
최초 route에서 framework template 화면이나 빈 화면이 먼저 보이면 release blocker로 본다.
