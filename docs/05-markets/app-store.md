# App Store

> 등록·출시 원장. 확정값과 실제 공개 readback을 반영한다. 2026-08-10 사용자가 `v1.1.3` 실기기 QA 통과와 빠른 공개를 승인했고, Apple public lookup에서 version `1.1.3`, `currentVersionReleaseDate=2026-08-14T05:35:05Z`를 2026-08-21 재확인했다.
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
- Marketing URL: `https://seorilabs.com/` — AdMob 앱 확인을 위한 필수 운영값. 공개 `1.1.3`의 `ko`·`en-US` localization은 2026-08-21 ASC API readback에서 `null`이었고, `READY_FOR_SALE` 상태라 PATCH가 `409 STATE_ERROR`로 거부됐다. 다음 편집 가능한 App Store 버전에 반영하고 제출 전 readback한다.

> App Store 이름은 정책(2.3.7) 키워드 나열 리스크로 브랜드명 `함께봄`을 쓰고, 설명 키워드는 subtitle/keywords로 분리. Play 타이틀(키워드형)과 의도적으로 다름.

## App Information

- Privacy policy URL: `https://www.seorilabs.com/apps/babycare/privacy/` ✅ 체온·복약 항목과 2026-08-10 시행일을 반영한 한국어·영어 방침 live 200 확인. ASC API readback은 `ko=/apps/babycare/privacy/`, `en-US=/en/apps/babycare/privacy/`다.
- Age rating: `4+` — 건강·웰니스 주제와 사용자 생성 돌봄 기록을 신고하고 나머지 콘텐츠를 없음으로 반영한 ASC 자동 등급 readback 완료
- Content rights: Google Mobile Ads를 사용하는 실제 구성에 맞춰 `USES_THIRD_PARTY_CONTENT`로 수정·readback 완료
- Export compliance: `Info.plist`에 `ITSAppUsesNonExemptEncryption=false`를 반영했고, App Store Connect의 1.0.8/56 build readback에서도 `usesNonExemptEncryption=false`를 확인했다.
- Review notes: 로그인 없이 기기 기반 계정을 자동 생성하는 실제 온보딩·2기기 초대·계정 삭제 절차를 ASC에 반영 완료
- Demo account: 불필요. `demoAccountRequired=false`와 검증된 운영 연락처를 ASC에 반영 완료
- App Privacy 답변: `docs/05-markets/store-data-disclosure.md`. 이름·Health·사용자 콘텐츠·기타 데이터·사용자 ID와 Firebase/Google Mobile Ads 자동 수집 유형 7개를 포함한 12개 유형, Tracking `No`를 2026-08-10 App Store Connect에 게시하고 published 상태를 readback했다. 광고 포함 연령등급 응답은 `advertising=true`, build 61의 IDFA 응답은 비개인화 광고 구현에 맞춰 `usesIdfa=false`로 readback했다.
- DSA/trader: **trader**. App Store Connect에서 기존 검증 trader 상태를 2026-08-10 재확인했다. EU를 포함한 App Store의 모든 제공 가능 국가·지역에 출시한다.
- Regulated Medical Device: 모든 국가·지역에서 규제 의료기기가 아님을 2026-08-10 App Store Connect에 선언·readback했다. 앱은 성인 양육자의 기록·공유 도구이며 진단·치료·예방·용량 처방을 하지 않는다.
- Availability: ASC API v2로 활성 App Store 지역 175개를 모두 `available=true`로 생성하고 `availableInNewTerritories=true`를 readback했다(2026-08-09). 현재 전 지역 `AVAILABLE_FOR_SALE_UNRELEASED_APP`와 미출시 앱 공통 `CANNOT_SELL` 상태이며, EU trader 누락 상태 코드는 반환되지 않았다.

## Assets

- App store icon (1024x1024): `app-store/assets/icon-1024.png` 및 Xcode `AppIcon.appiconset`(iPhone/iPad/marketing) ✅ 반영
- Native launch screen: 제품명·브랜드 아이콘 기반 정적 화면 구현·release build 반영
- iPhone screenshots (6.9" 1320x2868): 홈/타임라인/통계/수유기록/더보기 5컷 ✅ `app-store/screenshots/6.9/` (실제 앱 시뮬레이터 캡처)
- iPad screenshots (13" 2064x2752): iPad target 유지. Release 시뮬레이터에서 production 그룹·수유·기저귀·수면 기록을 만든 실제 화면 5컷을 `app-store/screenshots/13/`에 캡처하고 한국어 `APP_IPAD_PRO_3GEN_129` set으로 업로드했다. ASC asset delivery state 5건 모두 `COMPLETE` readback 완료
- **en-US screenshots (2026-08-08 촬영·업로드 완료)** — i18n 반영 `v1.0.9` Release 시뮬레이터 빌드에서 영어 로케일로 캡처했다. `app-store/screenshots/en-US/6.9/` 5컷(1320x2868), `app-store/screenshots/en-US/13/` 5컷(2064x2752). iPhone은 `Emma's group` owner `Mom`, iPad는 같은 그룹에 초대 코드로 합류한 member `Dad`라 `05-more`에 구성원 2명이 함께 보인다. ASC `en-US` localization에 `APP_IPHONE_67`·`APP_IPAD_PRO_3GEN_129` set을 만들어 각 5컷을 업로드했고, asset delivery state 10건 모두 `COMPLETE` readback을 마쳤다(2026-08-08). 이로써 `ko`·`en-US` 두 로케일이 각각 두 display type을 모두 갖춘다.

## Localization

- 앱 지원 언어: `ko`, `en` (ADR `0005-app-localization-policy.md`). 기기 로케일 자동 판별이고 앱 내 언어 선택은 없다.
- iOS `CFBundleLocalizations`에 `ko`, `en`을 선언했고 `CFBundleDevelopmentRegion`은 ASC primaryLocale과 같은 `ko`다.
- `CFBundleDisplayName`은 로케일별로 갈린다. `ko.lproj/InfoPlist.strings`가 `함께봄`, `en.lproj/InfoPlist.strings`가 `BabyNest`이고 `Info.plist`의 `함께봄`은 development region fallback이다. Xcode 프로젝트에 `PBXVariantGroup`으로 등록해 Resources build phase로 복사되며 `knownRegions`에 `ko`·`en`이 있다.
- 현재 제출 대상 `v1.1.3`은 i18n·Analytics·AdMob/UMP와 체온·복약 기능을 포함한다. 사용자가 TestFlight 실기기 QA 통과를 보고했으며 기기 모델·OS 상세는 제공되지 않았다.

## Release

- Signing team (Team ID): `HCDUXX4Z3X`. GitHub Actions `rn-deploy-app-store.yml`이 automatic signing으로 archive하고 `exportArchive`가 `app-store/exportOptions.plist`로 배포 서명을 다시 한다. 인증서·프로파일·Firebase plist는 저장소 `app-store` environment secret에서 복원한다.
- **`v1.1.3` 공개 (2026-08-14)** — source `8ea2ceb656c46ecdf3975027f55c5b033e15e3a8`, Xcode Cloud run `0abb7047-2126-44f7-979b-d5388314fabb`(Build 61) 성공. ASC build `f9a718d7-829d-4838-8b61-e5d9a968fe6f`는 `1.1.3`/`61`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`다. review submission `ee65dd96-0297-4a11-b71d-c4bc73e6a39d`의 `AFTER_APPROVAL`로 공개됐고, Apple public lookup에서 `currentVersionReleaseDate=2026-08-14T05:35:05Z`를 2026-08-21 재확인했다.
- **`v1.0.9` i18n 후보 (2026-08-08)** — source `fe2b4b12be75d52e96bb3f0c267881efb8dd9072`, Xcode Cloud run `7faf6504-20e4-4064-a5f8-281dba2ce430` 성공(태그 `GIT_REF_CHANGE` 자동 시작). ASC build `95e65693-70a5-42cf-9590-d63e385a9951`는 실제 `1.0.9`/`57`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`다. ASC 버전 레코드를 `1.0.9`로 갱신하고 build 57 관계와 내부 그룹 `서리랩스 내부테스터` 연결을 반영했다. readback은 `versionString=1.0.9`, `related build=95e65693`, `internalBuildState=IN_BETA_TESTING`, `appStoreState=PREPARE_FOR_SUBMISSION`, 테스터 2명이다.

> `hasAccessToAllBuilds=true` 그룹에서는 `/v1/builds/{id}/betaGroups`가 항상 빈 값을 반환한다. 직전 후보 build 56도 동일하므로 이 엔드포인트를 연결 확인 오라클로 쓰지 않는다. 유효한 신호는 `internalBuildState`다.
- 이전 후보: `main@c66f7e7`(`v1.0.8`)의 Xcode Cloud run `a9c4b9b4-7c0e-4592-95ef-22039fa50962`이 성공했다. App Store Connect build `454e15f2-4075-4828-b613-a67085b3e7d4`는 실제 `1.0.8`/`56`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`다. Xcode Cloud build를 내부 그룹 `서리랩스 내부테스터`에 명시적으로 연결한 뒤 `IN_BETA_TESTING`을 API로 readback했다(2026-08-06). 실제 테스터 설치·실기기 QA와 App Review 제출은 하지 않았다.
- App Store version: version string `1.1.3`, Build 61 관계, `AFTER_APPROVAL`, copyright `2026 Seorilabs`, 체온·복약 설명과 review detail을 ASC에 반영·readback했다. App Privacy·DSA·비규제 의료기기·전국가 availability 입력을 완료했고 2026-08-14 자동 공개됐다.
- App Check: Firebase iOS 앱에 Team ID `HCDUXX4Z3X`와 App Store ID `6792193162`를 등록하고 App Attest·DeviceCheck provider를 구성했다. Platform registry `require_app_check=true`, production callable `ENFORCE_APP_CHECK=true`, App Check 없는 custom-token 요청 `401 app_check_required`를 2026-08-10 readback했다.
- 1.0.2 후보(과거 실패): `main@d11bbfa`(`v1.0.2`)의 device archive는 암호화 선언 키 누락과 strict codesign `CSSMERR_TP_NOT_TRUSTED`로 업로드하지 않았다. 이 실패는 1.0.5 Xcode Cloud 성공으로 빌드 경로 기준 해결됐다.
- App Store provisioning profile: ✅ App Store profile로 export 완료
- TestFlight group: ✅ 내부 그룹 `서리랩스 내부테스터`에 `1.1.3`/`61` build 연결, `IN_BETA_TESTING`, 테스터 2명 API readback 완료. 사용자가 실제 설치·실기기 QA 통과를 보고했다.
- Release notes: 아직 첫 공개 버전이므로 App Store의 What's New 필드는 편집 대상이 아니다. 체온·복약 내용은 promotional text·description·review notes에 반영했다.
