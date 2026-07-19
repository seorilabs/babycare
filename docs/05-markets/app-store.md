# App Store

> 등록 준비 원장. 확정값과 초안을 반영. `release-targets.md` deployment approval **미승인** — 준비만, 제출·TestFlight 외부 배포 금지.
> 기계 판독 source of truth: `app-store/app-store.config.json`

## App Identity

- **App Store Connect 앱 생성 + 메타데이터 draft 반영 (2026-07-18)** — appleId(adamId): `6792193162`, primaryLocale: `ko`. ASC API로 ko/en-US 설명·키워드·promo, subtitle, 6.9" 스크린샷 5컷 반영(버전 1.0). 심사 제출은 안 함.
- App name EN(App Store): `BabyNest: Shared Baby Care Log` (2026-07-18 확정) — 단독 `BabyNest`는 App Store 타 계정 선점이라 Play 타이틀과 동일한 고유 문자열 사용. 브랜드명은 BabyNest.
- Bundle ID: `com.seorilabs.babycare` (2026-07-13 확정)
- SKU: `babynet-app` (생성 시 확정)
- App name KO: `함께봄: 수유, 기저귀, 아기돌봄 기록 어플` (24/30, 생성된 실제 이름)
- App name EN: `BabyNest`
- Subtitle KO: `여러 양육자와 함께 실시간 공동 기록` (20/30)
- Subtitle EN: `Shared baby care tracker` (24/30)
- Category: primary `라이프스타일(Lifestyle)` / secondary `유틸리티(Utilities)` 제안 — 콘솔 확정
- Support URL: `https://www.seorilabs.com/support/` (ASC version loc 반영 완료)
- Marketing URL: `https://www.seorilabs.com/`(선택)

> App Store 이름은 정책(2.3.7) 키워드 나열 리스크로 브랜드명 `함께봄`을 쓰고, 설명 키워드는 subtitle/keywords로 분리. Play 타이틀(키워드형)과 의도적으로 다름.

## App Information

- Privacy policy URL: `https://www.seorilabs.com/privacy/` ✅ 게시·ASC appInfo(ko/en-US) 반영 완료
- Age rating: `4+` (아동 대상 아님, 부적절 콘텐츠 없음)
- Export compliance: `ITSAppUsesNonExemptEncryption = false` (표준 TLS/Firebase만)
- Review notes: `app-store/app-store.config.json`의 `review.notes` (공동 기록 데모 절차 포함)
- Demo account: 심사용 데모 계정 2개(owner/member) `확정 필요`
- App Privacy 답변: `docs/05-markets/store-data-disclosure.md` (Tracking 없음)
- DSA/trader: `확정 필요` (EU 배포 여부 결정 후)

## Assets

- App store icon (1024x1024): `app-store/assets/icon-1024.png` ✅ 생성 / Xcode `AppIcon.appiconset`는 마스터에서 채워야 함(`확정 필요`)
- Native launch screen: 구현됨 — 최종 브랜딩 `확정 필요`
- iPhone screenshots (6.9" 1320x2868): 홈/타임라인/통계/수유기록/더보기 5컷 ✅ `app-store/screenshots/6.9/` (실제 앱 시뮬레이터 캡처)
- iPad screenshots (13" 2064x2752): iPad 지원 여부 결정 후 `확정 필요`

## Release

- Signing team (Team ID) / Apple Distribution 인증서: `확정 필요` — task #3
- App Store provisioning profile: `확정 필요`
- TestFlight group: `확정 필요`
- Release notes: `확정 필요`
