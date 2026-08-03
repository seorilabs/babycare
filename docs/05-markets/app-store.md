# App Store

> 등록 준비 원장. 확정값과 초안을 반영. 2026-07-29 승인 범위는 App Store Connect/TestFlight 빌드 업로드까지이며, 테스터 실기기 QA·App Review 제출·공개 출시는 미승인.
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
- Export compliance: 정책 판단은 `false`(표준 TLS/Firebase만)이나, `main@d11bbfa`의 source `Info.plist`와 1.0.2 archive에 `ITSAppUsesNonExemptEncryption` 키가 없어 수정 전 업로드 금지
- Review notes: `app-store/app-store.config.json`의 `review.notes` (공동 기록 데모 절차 포함)
- Demo account: 심사용 데모 계정 2개(owner/member) `확정 필요`
- App Privacy 답변: `docs/05-markets/store-data-disclosure.md` (Tracking 없음)
- DSA/trader: `확정 필요` (EU 배포 여부 결정 후)

## Assets

- App store icon (1024x1024): `app-store/assets/icon-1024.png` 및 Xcode `AppIcon.appiconset`(iPhone/iPad/marketing) ✅ 반영
- Native launch screen: 구현됨 — 최종 브랜딩 `확정 필요`
- iPhone screenshots (6.9" 1320x2868): 홈/타임라인/통계/수유기록/더보기 5컷 ✅ `app-store/screenshots/6.9/` (실제 앱 시뮬레이터 캡처)
- iPad screenshots (13" 2064x2752): iPad 지원 여부 결정 후 `확정 필요`

## Release

- Signing team (Team ID) / Apple Distribution 인증서: ✅ `main@8c5196e`(`v1.0.1`) 기준 `1.0.1`(`1000001`) archive→export→App Store Connect 업로드, ASC `VALID` 확인(2026-07-29). **단 CI 업로드용 secret(Environment `app-store`)은 미구성** — 현재까지 업로드는 로컬 수동
- 1.0.2 후보: `main@d11bbfa`(`v1.0.2`)에서 App Store profile·Apple Distribution·Firebase plist·아이콘을 포함한 device archive(`1.0.2`/`1000002`)와 codesign을 검증했으나, 최종 archive에 암호화 선언 키가 없어 업로드하지 않음(2026-08-03). source 수정 후 기존 태그를 이동하지 않고 새 후보를 만든다.
- App Store provisioning profile: ✅ App Store profile로 export 완료
- TestFlight group: ✅ 내부 그룹 `서리랩스 내부테스터` 존재, 모든 빌드 접근 활성화 / 실제 테스터 설치·실기기 QA는 남음
- Release notes: `확정 필요`
