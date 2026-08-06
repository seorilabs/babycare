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
- Terms / 추가 feature URL: `확정 필요`

현재 screenshot은 같은 제품의 native 화면을 AppsInToss 규격에 맞춘 후보다. 실제 AIT sandbox UI를
캡처해 기능·화면 일치성을 확인한 뒤 Console 등록본을 교체한다.

## Release

- `.ait` artifact: `apps/ait/*.ait`
- Latest private upload: `main@707df10` / workflow run `31123595821` / artifact `8974273502`
- AppsInToss deployment ID: `019fd827-571d-791d-bd50-08f2da35afec` (2026-08-07 02:38 KST 업로드 완료)
- Private entry: `intoss-private://babynest?_deploymentId=019fd827-571d-791d-bd50-08f2da35afec`
- Candidate evidence: Granite/TDS 핵심 UI, AppsInToss Storage, 운영 Auth/Firestore/Functions adapter 구현. production 두 계정 그룹 생성→기록→초대→합류→공동 조회→삭제 E2E 통과
- Sandbox QA device: `확정 필요`
- Console review: 승인 완료(2026-08-04 readback)
- Ads/payment policy answers: `확정 필요`
- Release review prerequisite: private scheme을 실제 Toss 앱에서 최소 1회 테스트하고 in-app feature를 함께 등록

## 주의

운영 API E2E와 비공개 `.ait` 업로드 성공은 sandbox 실기기 QA, Console 이미지·정책 등록, 심사 준비나 production 공개 완료를 의미하지 않는다.
최초 route에서 framework template 화면이나 빈 화면이 먼저 보이면 release blocker로 본다.
