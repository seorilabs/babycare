# Release Targets

## 원칙

- Google Play, Apple App Store, AppsInToss를 모두 공식 타깃으로 준비한다.
- 세 타깃의 release candidate 준비는 병행하되 최초 제출 순서는 `확정 필요`다.
- Deployment approval은 **미승인** 상태다. 빌드·QA·등록 자료 준비는 가능하지만 store submission, production promotion, AppsInToss production release는 금지한다.
- `.aab`, archive/`.ipa`, `.ait` 생성은 packaging 증거일 뿐 release-ready 증거가 아니다.

## 식별자 기준

| 항목 | 값 | 상태 |
| --- | --- | --- |
| Android application ID | `com.seorilabs.babycare` | Debug/Release 공통, 2026-07-13 확정 |
| iOS bundle ID | `com.seorilabs.babycare` | Debug/Release 공통, 2026-07-13 확정 |
| AppsInToss `appName` | target 미생성 | `확정 필요` |
| 제품명 | native target `BabyCare` | 한국어/영어 모두 `확정 필요` |

Android/iOS는 환경 suffix 없이 같은 식별자를 사용하므로 기존 `.dev` 앱과 별도 앱·별도 로컬 데이터 컨테이너가 된다. 향후 Debug/Release도 같은 식별자라 한 기기에 병렬 설치할 수 없다. 동일 signing/provisioning으로 업데이트 설치되면 컨테이너를 이어 쓰지만, signing/provisioning이 호환되지 않으면 설치가 거부되어 기존 앱을 삭제해야 할 수 있고 이 경우 로컬 데이터도 삭제된다. `BabyCare` target name은 최종 상품명으로 승격하지 않는다. AppsInToss `appName`은 영구 식별자 변경 리스크와 정책 적합성을 확인한 뒤 target 생성 전에 확정한다.

## 타깃 상태

| Target | Repo 위치 | 목표 Artifact | 현재 상태 | 다음 Gate |
| --- | --- | --- | --- | --- |
| Google Play | `apps/mobile`, `play-store/` | signed `.aab` | package 확정, 서명/Play config/console app 없음 | release signing → Play app 생성 → internal test |
| App Store | `apps/mobile`, `app-store/` | Xcode archive/export | bundle ID와 product launch screen 확정, signing/App Store config/console app 없음 | App ID·signing → archive → TestFlight |
| AppsInToss | `apps/ait`, `apps-in-toss/` | `.ait` | Granite target 미초기화 | 정책 적합성·영구 `appName` 확정 → 초기화 → sandbox |

## 공통 Blocker

- 최종 한국어/영어 앱 이름과 AppsInToss `appName` 확정.
- 실제 비프로덕션/프로덕션 Firebase project 전략과 환경별 client config 확정.
- production Auth provider와 Firebase composition 연결, 실시간/offline sync, 멤버 제거와 cache purge 통합 검증. 초대 Functions와 client adapter는 로컬 코드만 구현된 상태다.
- 개인정보 처리방침, 아동 관련 정보·사진·건강/돌봄 기록 disclosure, 계정 삭제·데이터 export 절차.
- 연령등급, 성인 양육자용·비의료 목적 review note, 지역별 규제 검토.
- 앱 아이콘, feature/thumbnail, phone screenshot, native launch 화면의 최종 제품명·브랜딩.
- 서로 다른 계정·기기 2대의 초대·실시간·오프라인·접근 회수 사람 QA.
- 별도 deployment approval.

## Google Play Blocker

- 확정 package `com.seorilabs.babycare`로 Play Console 앱 생성.
- Play App Signing과 upload key, x64 Linux 기반 signed AAB release build.
- Data safety에 아동 관련 프로필·사진·돌봄/건강 데이터의 수집·공유·삭제를 실제 SDK와 일치시켜 신고.
- IARC/GRAC, target audience, 광고/결제 여부와 Families 적용 범위 확인.
- internal → closed test, crash/ANR, 오프라인 복귀와 계정 삭제 검증.
- `play-store/google-play.config.json`, listing text, icon/feature graphic/screenshots와 release note.

## App Store Blocker

- 확정 bundle ID `com.seorilabs.babycare`의 App ID, signing certificate/profile과 App Store Connect 앱 생성.
- macOS/Xcode에서 archive/export 및 TestFlight 업로드 검증.
- Privacy Labels, age rating, export compliance, 계정 삭제와 review note 확정.
- 성인 양육자용·비의료 목적, 초대된 그룹 내 아동 정보 공유 구조를 review note에 설명.
- 양육자 2인 이상 TestFlight 테스트, iPhone 크기별 screenshot과 최종 AppIcon.
- `app-store/app-store.config.json` 작성.

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
