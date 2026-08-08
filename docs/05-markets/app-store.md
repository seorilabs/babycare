# App Store

> 등록·출시 준비 원장. 확정값과 실제 App Store Connect readback을 반영한다. 2026-08-06 사용자가 남은 출시 절차 진행을 승인했으며, 법적·사업자 선택은 확인값만 반영한다.
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
- Category: primary `라이프스타일(Lifestyle)` / secondary `유틸리티(Utilities)` — ASC API 반영·readback 완료
- Support URL: `https://www.seorilabs.com/support/` (ASC version loc 반영 완료)
- Marketing URL: `https://www.seorilabs.com/`(선택)

> App Store 이름은 정책(2.3.7) 키워드 나열 리스크로 브랜드명 `함께봄`을 쓰고, 설명 키워드는 subtitle/keywords로 분리. Play 타이틀(키워드형)과 의도적으로 다름.

## App Information

- Privacy policy URL: `https://www.seorilabs.com/privacy/` ✅ 게시·ASC appInfo(ko/en-US) 반영 완료
- Age rating: `4+` — 건강·웰니스 주제와 사용자 생성 돌봄 기록을 신고하고 나머지 콘텐츠를 없음으로 반영한 ASC 자동 등급 readback 완료
- Content rights: `DOES_NOT_USE_THIRD_PARTY_CONTENT` readback 완료
- Export compliance: `Info.plist`에 `ITSAppUsesNonExemptEncryption=false`를 반영했고, App Store Connect의 1.0.8/56 build readback에서도 `usesNonExemptEncryption=false`를 확인했다.
- Review notes: 로그인 없이 기기 기반 계정을 자동 생성하는 실제 온보딩·2기기 초대·계정 삭제 절차를 ASC에 반영 완료
- Demo account: 불필요. `demoAccountRequired=false`와 검증된 운영 연락처를 ASC에 반영 완료
- App Privacy 답변: `docs/05-markets/store-data-disclosure.md` (Tracking 없음, Name·Health·Other User Content·Other Data Types·User ID는 linked App Functionality, Firebase Other Diagnostic Data는 unlinked Analytics·App Functionality인 현재 1.0.8 기준) / 콘솔 입력 남음
- DSA/trader: `확정 필요` (EU 배포 여부 결정 후)

## Assets

- App store icon (1024x1024): `app-store/assets/icon-1024.png` 및 Xcode `AppIcon.appiconset`(iPhone/iPad/marketing) ✅ 반영
- Native launch screen: 제품명·브랜드 아이콘 기반 정적 화면 구현·release build 반영
- iPhone screenshots (6.9" 1320x2868): 홈/타임라인/통계/수유기록/더보기 5컷 ✅ `app-store/screenshots/6.9/` (실제 앱 시뮬레이터 캡처)
- iPad screenshots (13" 2064x2752): iPad target 유지. Release 시뮬레이터에서 production 그룹·수유·기저귀·수면 기록을 만든 실제 화면 5컷을 `app-store/screenshots/13/`에 캡처하고 한국어 `APP_IPAD_PRO_3GEN_129` set으로 업로드했다. ASC asset delivery state 5건 모두 `COMPLETE` readback 완료
- **en-US screenshots (2026-08-08 촬영, 업로드 남음)** — i18n 반영 `v1.0.9` Release 시뮬레이터 빌드에서 영어 로케일로 캡처했다. `app-store/screenshots/en-US/6.9/` 5컷(1320x2868), `app-store/screenshots/en-US/13/` 5컷(2064x2752). iPhone은 `Emma's group` owner `Mom`, iPad는 같은 그룹에 초대 코드로 합류한 member `Dad`라 `05-more`에 구성원 2명이 함께 보인다. **ASC `en-US` localization의 `appScreenshotSets`는 여전히 0건이라 업로드가 남았다.**

## Localization

- 앱 지원 언어: `ko`, `en` (ADR `0005-app-localization-policy.md`). 기기 로케일 자동 판별이고 앱 내 언어 선택은 없다.
- iOS `CFBundleLocalizations`에 `ko`, `en`을 선언했고 `CFBundleDevelopmentRegion`은 ASC primaryLocale과 같은 `ko`다.
- `CFBundleDisplayName`은 로케일별로 갈린다. `ko.lproj/InfoPlist.strings`가 `함께봄`, `en.lproj/InfoPlist.strings`가 `BabyNest`이고 `Info.plist`의 `함께봄`은 development region fallback이다. Xcode 프로젝트에 `PBXVariantGroup`으로 등록해 Resources build phase로 복사되며 `knownRegions`에 `ko`·`en`이 있다.
- **현재 ASC 후보 `1.0.8`/`56`은 i18n 이전 빌드라 한국어 전용이다.** `en-US` 등록정보를 유지한 채 심사 제출하려면 i18n 포함 새 후보가 필요하다.

## Release

- Signing team (Team ID): `HCDUXX4Z3X`. Xcode Cloud Release는 Automatic managed signing을 사용하며, Firebase plist는 redacted Xcode Cloud secret으로 복원한다.
- **`v1.0.9` i18n 후보 (2026-08-08)** — source `fe2b4b12be75d52e96bb3f0c267881efb8dd9072`, Xcode Cloud run `7faf6504-20e4-4064-a5f8-281dba2ce430` 성공(태그 `GIT_REF_CHANGE` 자동 시작). ASC build `95e65693-70a5-42cf-9590-d63e385a9951`는 실제 `1.0.9`/`57`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`다. ASC 버전 레코드를 `1.0.9`로 갱신하고 build 57 관계와 내부 그룹 `서리랩스 내부테스터` 연결을 반영했다. readback은 `versionString=1.0.9`, `related build=95e65693`, `internalBuildState=IN_BETA_TESTING`, `appStoreState=PREPARE_FOR_SUBMISSION`, 테스터 2명이다.

> `hasAccessToAllBuilds=true` 그룹에서는 `/v1/builds/{id}/betaGroups`가 항상 빈 값을 반환한다. 직전 후보 build 56도 동일하므로 이 엔드포인트를 연결 확인 오라클로 쓰지 않는다. 유효한 신호는 `internalBuildState`다.
- 이전 후보: `main@c66f7e7`(`v1.0.8`)의 Xcode Cloud run `a9c4b9b4-7c0e-4592-95ef-22039fa50962`이 성공했다. App Store Connect build `454e15f2-4075-4828-b613-a67085b3e7d4`는 실제 `1.0.8`/`56`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`다. Xcode Cloud build를 내부 그룹 `서리랩스 내부테스터`에 명시적으로 연결한 뒤 `IN_BETA_TESTING`을 API로 readback했다(2026-08-06). 실제 테스터 설치·실기기 QA와 App Review 제출은 하지 않았다.
- App Store version: version string `1.0.8`, Build 56 관계, `AFTER_APPROVAL`, copyright `2026 Seorilabs`, review detail을 ASC API로 반영·readback했다. 현재 `PREPARE_FOR_SUBMISSION`이며 App Privacy·availability·실기기 QA 전이라 제출하지 않았다.
- App Check: Firebase iOS 앱에 Team ID `HCDUXX4Z3X`와 App Store ID `6792193162`를 등록했고 App Attest·DeviceCheck provider 설정을 readback했다. 실제 TestFlight 1.0.8 token 확인 전 enforcement는 false다.
- 1.0.2 후보(과거 실패): `main@d11bbfa`(`v1.0.2`)의 device archive는 암호화 선언 키 누락과 strict codesign `CSSMERR_TP_NOT_TRUSTED`로 업로드하지 않았다. 이 실패는 1.0.5 Xcode Cloud 성공으로 빌드 경로 기준 해결됐다.
- App Store provisioning profile: ✅ App Store profile로 export 완료
- TestFlight group: ✅ 내부 그룹 `서리랩스 내부테스터`에 `1.0.8`/`56` build 연결, `IN_BETA_TESTING`, 테스터 2명 API readback 완료 / 실제 테스터 설치·실기기 QA는 남음
- Release notes: 첫 공개 버전이므로 What's New 입력 대상이 아니다.
