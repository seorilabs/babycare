# Release Targets

## 원칙

- Google Play, Apple App Store, AppsInToss를 모두 공식 타깃으로 준비한다.
- 세 타깃 release candidate 준비와 내부 배포를 병행하고, 실기기·정책 gate가 끝난 타깃부터 심사 제출한다.
- 2026-08-10 체온·복약 `v1.1.3`을 Google Play internal `completed`와 App Store Connect/TestFlight `IN_BETA_TESTING`까지 배포했다. store review submission·production promotion·AppsInToss production release는 아직 완료되지 않았다.
- `.aab`, archive/`.ipa`, `.ait` 생성은 packaging 증거일 뿐 release-ready 증거가 아니다.

## 식별자 기준

| 항목 | 값 | 상태 |
| --- | --- | --- |
| Android application ID | `com.seorilabs.babycare` | Debug/Release 공통, 2026-07-13 확정 |
| iOS bundle ID | `com.seorilabs.babycare` | Debug/Release 공통, 2026-07-13 확정 |
| AppsInToss `appName` | `babynest` | Console 승인·readback 완료, 2026-08-04 |
| 한국어 앱 이름 | `함께봄` (Play 타이틀 `함께봄: 수유, 기저귀, 아기돌봄 기록 어플`) | 2026-07-18 사용자 확정 |
| 영어 앱 이름 | `BabyNest` | 2026-07-18 사용자 확정 |
| 대표 색상 | `#5FB49C` | 2026-07-18 사용자 확정 |
| native target 이름 | `BabyCare` | 기술 이름, 상품명 아님 |

Android/iOS는 환경 suffix 없이 같은 식별자를 사용하므로 기존 `.dev` 앱과 별도 앱·별도 로컬 데이터 컨테이너가 된다. 향후 Debug/Release도 같은 식별자라 한 기기에 병렬 설치할 수 없다. 동일 signing/provisioning으로 업데이트 설치되면 컨테이너를 이어 쓰지만, signing/provisioning이 호환되지 않으면 설치가 거부되어 기존 앱을 삭제해야 할 수 있고 이 경우 로컬 데이터도 삭제된다. `BabyCare` target name은 최종 상품명으로 승격하지 않는다. AppsInToss 영구 `appName`은 Console 승인값 `babynest`를 사용한다.

## 타깃 상태

| Target | Repo 위치 | 목표 Artifact | 현재 상태 | 다음 Gate |
| --- | --- | --- | --- | --- |
| Google Play | `apps/mobile`, `play-store/` | signed `.aab` | ✅ **`v1.1.3` AAB(1.1.3/1001003)를 internal `completed` 업로드·API readback 완료**. 체온·복약·Analytics·AdMob/UMP 포함 | Play Store app-signing 설치본 실기기 QA → production 심사·승격 |
| App Store | `apps/mobile`, `app-store/` | Xcode archive/export | ✅ **`v1.1.3` 1.1.3(61), ASC `VALID`·`APP_STORE_ELIGIBLE`·`IN_BETA_TESTING`**. App Privacy·DSA·비규제 의료기기·버전 레코드 반영 완료 | TestFlight 2기기 실기기 QA → App Review 제출 |
| AppsInToss | `apps/ait`, `apps-in-toss/` | `.ait` | Granite RN·TDS UI와 운영 Auth/Firestore/Functions adapter 구현. Toss Login·mTLS secret·App Check mint Function 운영 연결, 최신 private `20260811-6` / `019fee32-8415-761c-be38-9c5769aa00b2` test push·`isTested=true` 완료 | 로그인된 실제 Toss 설치 기기 App Check·핵심 흐름 QA → 정책 답변·프로덕션 승인 |
| **백엔드(Firebase + Platform)** | `firebase/`, `seorilabs/platform` | 프로덕션 프로젝트 | 체온·복약 Rules를 포함한 Firestore·Storage·Functions·Platform 인증 bridge·GA4 relay·Platform Events가 LIVE. GA4 Realtime과 Platform BigQuery 실수집 readback 완료 | `v1.1.3` 기기 이벤트와 App Check token 검증 |

## 공통 Blocker

- ~~최종 한국어/영어 앱 이름과 AppsInToss `appName` 확정~~ 완료(`함께봄`/`BabyNest`, `babynest`).
- ~~실제 production Firebase project와 Android/iOS client config 확정~~ 완료(`seorilabs-babycare`).
- platform custom token의 실제 기존 사용자·실기기 UID 보존 migration. signer SA/IAM, registry sync, API 배포와 신규·합성 legacy UID live smoke는 2026-08-02 완료했다.
- mobile App Check 강제와 cache purge는 완료. AIT mTLS attestation backend·새 비공개 후보 연결도 완료했으며 실제 Toss QA, AIT 실시간/offline sync는 별도 gate.
- ~~개인정보 처리방침·계정 삭제 절차와 아동·돌봄·건강 기록의 Google Play Data Safety·Apple App Privacy 공개~~ 완료. 체온·복약 공개 방침과 Console readback은 2026-08-10 완료.
- ~~연령등급, 성인 양육자용·비의료 목적 review note, DSA trader와 비규제 의료기기 선언~~ 완료. 마켓 심사 제출은 실기기 QA 뒤 별도 수행.
- ~~AdMob Android/iOS app ID·rewarded unit ID와 EU/미국 privacy message 발급·게시~~ 완료. AppsInToss adGroupId는 별도 타깃 gate다.
- ~~Firebase Analytics와 Platform Events 양측 live 수집~~ 완료. GA4 Realtime·Platform BigQuery에서 PII 없는 `core_screen_view` smoke를 readback했다.
- Google Play/App Store 앱 아이콘·feature graphic·phone screenshot은 완료. AppsInToss logo·thumbnail·vertical screenshot은 exact size·RGB와 실제 AIT sandbox 화면 교체를 완료했고 Console 업로드·readback이 남았다. native launch 화면 사람 QA는 남음.
- 서로 다른 계정·기기 2대의 초대·실시간·오프라인·접근 회수 사람 QA.
- ~~Google Play internal과 TestFlight 내부 빌드 활성화~~ 완료. 심사 제출·프로덕션 승격·공개 검증은 남음.

## Google Play Blocker

- ~~확정 package `com.seorilabs.babycare`로 Play Console 앱 생성.~~ 완료.
- ~~Play App Signing과 upload key, x64 Linux 기반 signed AAB release build.~~ 완료(1.0.1/1000001).
- ~~Data safety에 아동 관련 프로필·돌봄/건강 데이터와 Analytics·Google Mobile Ads 자동 수집을 실제 SDK와 일치시켜 신고~~ 완료.
- ~~IARC/GRAC, target audience, 광고/결제 여부와 Families 적용 범위 확인~~ 완료.
- internal → closed test, crash/ANR, 오프라인 복귀와 계정 삭제 검증.
- ~~`play-store/google-play.config.json`, listing text, icon/feature graphic/screenshots, release note와 privacy URL~~ 완료(아이콘 512·피처 1024×500·phone 9:16 3컷).
- 업로드 자동화: `deploy-google-play.yml` + `scripts/{resolve-release-version.mjs,upload-google-play-internal.py,restore-mobile-firebase-config.mjs}` 준비 완료. Publisher resumable upload는 600초 timeout·3회 재시도로 보강했다. 시크릿·WIF·keystore는 `docs/06-release/store-upload-setup.md` 참고.

## App Store Blocker

- ~~확정 bundle ID `com.seorilabs.babycare`의 App ID, signing certificate/profile과 App Store Connect 앱 생성.~~ 완료.
- ~~macOS/Xcode에서 archive/export 및 TestFlight 업로드 검증.~~ 완료(1.0.1/1000001, ASC `VALID`).
- ~~Privacy Labels, age rating, export compliance, 계정 삭제와 review note 확정~~ 완료.
- ~~성인 양육자용·비의료 목적, 초대된 그룹 내 아동 정보 공유 구조를 review note에 설명~~ 완료.
- 양육자 2인 이상 TestFlight 테스트. 내부 그룹 `서리랩스 내부테스터`는 모든 빌드 접근 활성화. ~~iPhone 6.9" screenshot~~ 완료(실기 시뮬레이터 캡처 5컷). store 아이콘 1024와 Xcode `AppIcon.appiconset` 반영 완료.
- ~~`app-store/app-store.config.json` 작성~~ 완료(이름·subtitle·설명·키워드·review·export·privacy 초안).
- 업로드 자동화: `deploy-app-store.yml`(scheme/workspace/bundle 기본값 채움) 준비 완료. signing·ASC 키는 `docs/06-release/store-upload-setup.md` 참고.

## AppsInToss Blocker

- 아동 관련 민감정보, 계정 로그인, 그룹 공유, 클라우드 저장과 향후 구독의 AppsInToss 정책 적합성 확인.
- ~~영구 `appName`과 제품명 확정, `apps/ait` Granite RN target 생성~~ 완료(`babynest`, `함께봄`/`BabyNest`).
- ~~TDS React Native UI, AppsInToss `Storage`, 인증/Firebase bridge와 native Firebase module 없는 REST adapter 경계 확정~~ 완료. sandbox runtime 검증은 남음.
- ~~AIT mTLS App Check custom provider 운영 연결~~ 완료. 로그인된 실제 Toss 설치 기기의 유효 token 발급·갱신과 알림 지원 범위 검증.
- sandbox 실제 기기에서 로그인·초대·기록·재실행·네트워크 복귀 QA.
- console metadata, 600×600 logo, 1932×828 thumbnail, 636×1048 screenshots와 customer support email 등록.
- ~~`apps-in-toss/apps-in-toss.config.json`과 `apps/ait/granite.config.ts` 작성~~ 완료.

## Release 순서

1. 세 타깃 공통 core와 Firebase 계약을 먼저 완료한다.
2. Android/iOS mobile에서 2인 공동 기록과 offline sync를 검증한다.
3. AppsInToss 정책·runtime 제약을 확인하고 같은 핵심 흐름을 별도 adapter로 검증한다.
4. 세 타깃 release candidate와 blocker inventory를 사용자에게 제시한다.
5. 2026-08-09 확정한 EU 포함 전국가 availability와 Apple DSA trader를 사용해 Google Play·App Store 제출을 진행한다.

Google Play·App Store는 EU 포함 전국가 출시와 Apple DSA trader가 확정됐다. AppsInToss 공개 출시는 별도 gate로 유지한다.
