# Release Targets

## 원칙

- Google Play, Apple App Store, AppsInToss를 모두 공식 타깃으로 준비한다.
- 세 타깃의 release candidate 준비는 병행하되 최초 제출 순서는 `확정 필요`다.
- 2026-07-29 Google Play internal draft와 App Store Connect/TestFlight 빌드 업로드만 승인·완료했다. 릴리스 활성화·테스터 배포·store review submission·production promotion·AppsInToss production release는 별도 승인 전까지 금지한다.
- `.aab`, archive/`.ipa`, `.ait` 생성은 packaging 증거일 뿐 release-ready 증거가 아니다.

## 식별자 기준

| 항목 | 값 | 상태 |
| --- | --- | --- |
| Android application ID | `com.seorilabs.babycare` | Debug/Release 공통, 2026-07-13 확정 |
| iOS bundle ID | `com.seorilabs.babycare` | Debug/Release 공통, 2026-07-13 확정 |
| AppsInToss `appName` | target 미생성 | `확정 필요` |
| 한국어 앱 이름 | `함께봄` (Play 타이틀 `함께봄: 수유, 기저귀, 아기돌봄 기록 어플`) | 2026-07-18 사용자 확정 |
| 영어 앱 이름 | `BabyNest` | 2026-07-18 사용자 확정 |
| 대표 색상 | `#5FB49C` | 2026-07-18 사용자 확정 |
| native target 이름 | `BabyCare` | 기술 이름, 상품명 아님 |

Android/iOS는 환경 suffix 없이 같은 식별자를 사용하므로 기존 `.dev` 앱과 별도 앱·별도 로컬 데이터 컨테이너가 된다. 향후 Debug/Release도 같은 식별자라 한 기기에 병렬 설치할 수 없다. 동일 signing/provisioning으로 업데이트 설치되면 컨테이너를 이어 쓰지만, signing/provisioning이 호환되지 않으면 설치가 거부되어 기존 앱을 삭제해야 할 수 있고 이 경우 로컬 데이터도 삭제된다. `BabyCare` target name은 최종 상품명으로 승격하지 않는다. AppsInToss `appName`은 영구 식별자 변경 리스크와 정책 적합성을 확인한 뒤 target 생성 전에 확정한다.

## 타깃 상태

| Target | Repo 위치 | 목표 Artifact | 현재 상태 | 다음 Gate |
| --- | --- | --- | --- | --- |
| Google Play | `apps/mobile`, `play-store/` | signed `.aab` | ✅ 앱 생성·리스팅 draft·서명 keystore. **`main@8c5196e`(`v1.0.1`) AAB(1.0.1/1000001)를 internal draft 업로드하고 API readback 완료**. 남음: App content 설문·internal 릴리스 활성화 | App content 설문 → internal 테스터 릴리스 |
| App Store | `apps/mobile`, `app-store/` | Xcode archive/export | ✅ 앱 생성·리스팅·아이콘·스크린샷·서명(cert/profile). **`main@8c5196e`(`v1.0.1`) 1.0.1(1000001) archive→export→업로드, ASC `VALID`**. 내부 그룹 `서리랩스 내부테스터`는 모든 빌드 접근 활성화. 남음: App Privacy·실기기 QA | TestFlight 테스트 → 심사 제출(승인 후) |
| AppsInToss | `apps/ait`, `apps-in-toss/` | `.ait` | Granite target 미초기화 | 정책 적합성·영구 `appName` 확정 → 초기화 → sandbox |
| **백엔드(Firebase + Platform)** | `firebase/`, `seorilabs/platform` | 프로덕션 프로젝트 | Firebase Firestore·Functions·Rules는 LIVE. platform custom token bridge도 `platform-api-00015-xpx`에 배포했고 신규·합성 legacy UID live smoke를 통과 | App Check 또는 edge rate limit → 실제 기존 사용자 migration·2기기 QA |

## 공통 Blocker

- ~~최종 한국어/영어 앱 이름 확정~~ 완료(`함께봄`/`BabyNest`, 2026-07-18). AppsInToss `appName`은 여전히 `확정 필요`.
- 실제 비프로덕션/프로덕션 Firebase project 전략과 환경별 client config 확정.
- platform custom token의 실제 기존 사용자·실기기 UID 보존 migration. signer SA/IAM, registry sync, API 배포와 신규·합성 legacy UID live smoke는 2026-08-02 완료했다.
- App Check 또는 edge rate limit, 실시간/offline sync, 멤버 제거와 cache purge 통합 검증.
- 개인정보 처리방침, 아동 관련 정보·사진·건강/돌봄 기록 disclosure, 계정 삭제·데이터 export 절차.
- 연령등급, 성인 양육자용·비의료 목적 review note, 지역별 규제 검토.
- 앱 아이콘, feature/thumbnail, phone screenshot, native launch 화면의 최종 제품명·브랜딩.
- 서로 다른 계정·기기 2대의 초대·실시간·오프라인·접근 회수 사람 QA.
- internal 빌드 활성화·테스터 배포·심사 제출·프로덕션 승격별 별도 deployment approval.

## Google Play Blocker

- ~~확정 package `com.seorilabs.babycare`로 Play Console 앱 생성.~~ 완료.
- ~~Play App Signing과 upload key, x64 Linux 기반 signed AAB release build.~~ 완료(1.0.1/1000001).
- Data safety에 아동 관련 프로필·사진·돌봄/건강 데이터의 수집·공유·삭제를 실제 SDK와 일치시켜 신고.
- IARC/GRAC, target audience, 광고/결제 여부와 Families 적용 범위 확인.
- internal → closed test, crash/ANR, 오프라인 복귀와 계정 삭제 검증.
- ~~`play-store/google-play.config.json`, listing text, icon/feature graphic/screenshots~~ 완료(아이콘 512·피처 1024×500·phone 9:16 3컷). release note와 privacy URL 호스팅은 남음.
- 업로드 자동화: `deploy-google-play.yml` + `scripts/{resolve-release-version.mjs,upload-google-play-internal.py,restore-mobile-firebase-config.mjs}` 준비 완료. 시크릿·WIF·keystore는 `docs/06-release/store-upload-setup.md` 참고.

## App Store Blocker

- ~~확정 bundle ID `com.seorilabs.babycare`의 App ID, signing certificate/profile과 App Store Connect 앱 생성.~~ 완료.
- ~~macOS/Xcode에서 archive/export 및 TestFlight 업로드 검증.~~ 완료(1.0.1/1000001, ASC `VALID`).
- Privacy Labels, age rating, export compliance, 계정 삭제와 review note 확정.
- 성인 양육자용·비의료 목적, 초대된 그룹 내 아동 정보 공유 구조를 review note에 설명.
- 양육자 2인 이상 TestFlight 테스트. 내부 그룹 `서리랩스 내부테스터`는 모든 빌드 접근 활성화. ~~iPhone 6.9" screenshot~~ 완료(실기 시뮬레이터 캡처 5컷). store 아이콘 1024와 Xcode `AppIcon.appiconset` 반영 완료.
- ~~`app-store/app-store.config.json` 작성~~ 완료(이름·subtitle·설명·키워드·review·export·privacy 초안).
- 업로드 자동화: `deploy-app-store.yml`(scheme/workspace/bundle 기본값 채움) 준비 완료. signing·ASC 키는 `docs/06-release/store-upload-setup.md` 참고.

## AppsInToss Blocker

- 아동 관련 민감정보, 계정 로그인, 그룹 공유, 클라우드 저장과 향후 구독의 AppsInToss 정책 적합성 확인.
- 영구 `appName`과 제품명을 확정한 뒤 `apps/ait` Granite RN target 생성.
- TDS React Native UI, AppsInToss `Storage`, 인증/Firebase bridge, realtime listener, App Check와 알림 지원 범위 검증.
- native Firebase module이 없는 runtime을 전제로 adapter와 server API 경계를 확정.
- sandbox 실제 기기에서 로그인·초대·기록·재실행·네트워크 복귀 QA.
- console metadata, 600×600 logo, 1932×828 thumbnail, 636×1048 screenshots와 customer support email 등록.
- `apps-in-toss/apps-in-toss.config.json`과 `apps/ait/granite.config.ts` 작성.

## Release 순서

1. 세 타깃 공통 core와 Firebase 계약을 먼저 완료한다.
2. Android/iOS mobile에서 2인 공동 기록과 offline sync를 검증한다.
3. AppsInToss 정책·runtime 제약을 확인하고 같은 핵심 흐름을 별도 adapter로 검증한다.
4. 세 타깃 release candidate와 blocker inventory를 사용자에게 제시한다.
5. 사용자가 deployment approval을 명시한 타깃만 제출·승격한다.

First submission target과 국가 availability는 `확정 필요`이며, listing 언어/i18n 확대와 별도 결정으로 관리한다.
