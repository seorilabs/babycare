# Work Log

## 2026-08-07 — Firebase production Billing 활성 상태 확인

- 자동화 service account로 `seorilabs-babycare`의 Cloud Billing 연결을 조회해 `billingEnabled=true`를 readback했다. 기존 `Billing plan: 확정 필요` 표시는 실제 운영 상태와 달라 `활성`으로 정정했다.
- billing account 식별자는 출시 원장에 필요하지 않고 민감한 운영 정보이므로 기록하지 않았다. 이 확인은 Auth·Firestore·Functions가 이미 production에서 동작 중인 상태와 일치한다.

## 2026-08-07 — Google Play Data Safety API 제출

- 현재 Android 1.0.8 release runtime을 다시 검사해 Firebase Authentication UID를 `사용자 ID`, transitive `firebase-installations`와 Play Integrity/App Check를 `기기 또는 기타 ID`로 분리했다. 생년월일은 `기타 개인 정보`, 사용자가 남기는 돌봄 기록·메모는 `기타 사용자 제작 콘텐츠`로 정렬했다. Analytics·Crashlytics·Performance·광고·결제는 현재 바이너리에 없어 신고하지 않았다.
- 최신 Play Console CSV schema의 계정 생성·삭제 문항을 반영했다. 별도 자격증명 입력 없이 Firebase 계정을 자동 생성하므로 계정 생성 방식은 `기타`, 앱 내 삭제와 외부 삭제 URL을 제공하므로 두 삭제 URL에 운영 페이지를 답했다.
- 답변 원장 `play-store/data-safety-responses.json`과 CSV 생성·제출 도구 `scripts/apply-google-play-data-safety.py`를 추가했다. 생성본은 782개 schema row 중 34개 응답만 활성화하며, `applications.dataSafety` API가 서버 검증 후 성공했다.
- Data Safety API는 성공 시 빈 응답만 반환하고 GET readback을 제공하지 않는다. Play Console의 완료 표시 확인, 개인정보처리방침 URL·콘텐츠 등급 등 나머지 앱 콘텐츠 입력은 Chrome 로그인 세션 연결 뒤 계속한다.

## 2026-08-07 — Android 1.0.8 production 두 기기·offline·삭제 QA

- Google Play internal과 같은 `1.0.8`/`1000008` upload-signed AAB를 서로 독립된 Android API 36 AVD 2대에 설치했다. owner `QAOwnerA`가 production 그룹 `QABabyA`를 만들고 분유 120ml·기저귀 소변·낮잠을 기록한 뒤, 비행기 모드에서 기저귀 대변을 추가하고 강제 종료·재실행해 local 보존과 `동기화 실패 1건` 표시를 확인했다.
- 네트워크 복귀 뒤 수동 새로고침으로 오류 배너가 해제됐고, owner UI에서 발급한 6자리 초대 코드로 별도 production 계정 `QAMemberB`가 두 번째 기기에서 합류했다. member 홈이 offline 작성 대변을 포함한 기존 기록을 읽어 outbox의 server 반영을 확인했다.
- owner 기기에서 낮잠을 시작하고 member 기기에서 종료해 단일 `낮잠 · 36초` 기록과 active lock 해제를 확인했다. member가 추가한 기저귀 소변은 owner 타임라인에 `QAMemberB` 작성자로 반영됐다.
- member 계정 삭제는 본인 membership과 작성 기록만 제거하고 owner 기록을 유지했으며 member 기기는 온보딩으로 복귀했다. 이어 owner 계정 삭제가 그룹·아기·전체 기록을 제거하고 owner 기기도 온보딩으로 복귀했다. QA Auth·그룹·기록은 UI 삭제 경로로 정리했고 임시 AVD 2대도 종료했다.
- 이번 증거는 upload certificate 서명의 sideload AAB와 emulator 기반이다. Play Store app signing 설치본, 물리 Android의 Play Integrity App Check token, iOS TestFlight 물리 기기, AppsInToss Toss 앱 runtime은 아직 별도 출시 게이트다.

## 2026-08-07 — Android v1.0.8 브랜드 아이콘·cold start 검증

- Google Play internal과 같은 AAB SHA-256 `2a0e627480e3f30d1d7feeb886bd30af4492ab6b9b4d60ff755cae2208297c84`에서 API 36 arm64 기기별 APK를 생성해 사용자 상태가 없는 격리 AVD에 설치했다. package `com.seorilabs.babycare`, `1.0.8`/`1000008`을 readback했다.
- Pixel Launcher에서 기본 Android 아이콘이 아닌 함께봄 민트색 잎사귀 adaptive icon과 label `함께봄`을 확인했다. 기존 1.0.7 AVD는 서명 불일치로 update가 거부됐고 사용자 데이터를 삭제하지 않았다.
- `am start -W` cold launch는 `LaunchState: COLD`, `TotalTime: 554ms`였고, 녹화 frame에서 브랜드 잎사귀 launch 화면→공동 기록 로딩→온보딩으로 전환됐다. React Native/template 문구와 치명적 AndroidRuntime 오류는 없었다. 이는 upload-signed AAB 설치 증거이며 Play Store app-signing 설치본 App Check token 증거는 아니다.

## 2026-08-07 — AppsInToss 핵심 기능 후보와 등록 자산 준비

- AppsInToss 브랜드 셸을 Granite RN·TDS 기반 제품 흐름으로 교체했다. Platform custom-token/Firebase Auth REST 로그인, AppsInToss `Storage` session, Firestore REST 그룹·아기·기록·조회, callable 초대·수락·계정 삭제를 연결하고 홈·타임라인·통계·더보기에서 수유·기저귀·수면을 사용할 수 있게 했다.
- 기록은 product-core validation과 canonical payload hash를 재사용해 event, mutation receipt, active-sleep lock을 원자 commit한다. 운영 두 계정으로 그룹 생성→수유·기저귀·수면 시작/종료→초대→합류→공동 조회→member/owner 삭제 E2E를 통과했고 남은 시험 Auth·Firestore·Platform 데이터를 exact target으로 정리한 뒤 QA prefix 0건을 readback했다.
- `FIREBASE_WEB_API_KEY`를 AppsInToss environment secret에서 build-time 주입하도록 workflow를 보강했다. local `.ait` build와 lint·typecheck·Jest를 통과했으며 build 성공을 Console 비공개 업로드나 sandbox 실기기 QA로 간주하지 않는다.
- 기존 승인 icon·feature graphic·iPhone screenshot을 source로 600×600 logo, 1932×828 thumbnail, 636×1048 vertical screenshot 5장을 RGB·무알파로 만들고 공통·AppsInToss validator를 통과했다. screenshot은 실제 AIT sandbox UI 캡처로 교체한 뒤 Console에 등록한다.
- PR #25를 squash merge해 `main@707df10`에 반영했다. workflow run `31123595821`은 artifact `8974273502`를 만들고 AppsInToss 비공개 deployment `019fd827-571d-791d-bd50-08f2da35afec` 업로드를 완료했다.
- 남음: 실제 Toss sandbox의 Storage·초대·기록·재실행·네트워크 복귀 QA, App Check 또는 edge 보호, Console 정책·URL·실화면 자산 등록과 production 심사·공개 배포.

## 2026-08-06 — v1.0.8 내부 후보와 production 보호 경계 검증

- App Store Connect의 기존 version을 `1.0.8`로 정렬하고 Build 56을 연결했다. 4+ age rating, Lifestyle·Utilities 카테고리, third-party content 미사용, AFTER_APPROVAL, 검증된 심사 연락처와 로그인 없는 실제 심사 절차를 API로 반영·readback했다. App Privacy·availability·13" iPad 스크린샷·실기기 QA 전이라 `PREPARE_FOR_SUBMISSION`을 유지하고 심사 제출하지 않았다.
- 현재 1.0.8 mobile 의존성과 composition을 다시 검사해 email/password login, Firebase Analytics, Crashlytics, Performance가 없고 analytics port가 no-op임을 확인했다. store disclosure에서 이메일·진단 수집 오신고를 제거하고 실제 수집인 양육자 표시 이름, 아기 이름·생년월일·돌봄 기록·메모, Firebase 사용자 ID로 정렬했다.
- iPad Pro 13-inch iOS 26.5 Simulator용 Release build를 만들고 2064x2752 실제 화면에서 온보딩 레이아웃이 깨지지 않음을 확인했다. 첫 무서명 build는 simulator keychain entitlement가 없어 Firebase Auth 저장이 실패했고, ad-hoc 서명 build에서는 production 그룹 생성과 수유·기저귀·수면 기록을 모두 통과했다. 홈·타임라인·통계·수유 기록·더보기 5컷을 캡처해 한국어 `APP_IPAD_PRO_3GEN_129` set에 업로드하고 ASC `COMPLETE`를 readback했다.
- App Check token 발급이 일시적으로 실패해도 Platform custom-token 요청 자체를 막지 않도록 client를 fail-open으로 보강했다. server enforcement가 켜진 환경에서는 기존대로 누락 token을 거부한다. PR #24를 merge했고 `pnpm run test:static`에서 core 40건, mobile 37 suites/296건, Functions 14건과 typecheck·lint·architecture·docs·workflow gate가 통과했다.
- Android `v1.0.8` / source `c66f7e763470f041ea8eec79f1a24a9a13352589`를 workflow run `31116493641`에서 빌드했다. AAB `1.0.8`/`1000008`, target SDK 36, SHA-256 `2a0e627480e3f30d1d7feeb886bd30af4492ab6b9b4d60ff755cae2208297c84`, upload certificate 서명과 제품 브랜드 launcher icon을 검증하고 Google Play internal `completed` 업로드·API readback을 마쳤다.
- iOS는 같은 source의 Xcode Cloud run `a9c4b9b4-7c0e-4592-95ef-22039fa50962`이 성공했다. ASC build `454e15f2-4075-4828-b613-a67085b3e7d4`는 `1.0.8`/`56`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`이며 내부 그룹에 연결해 `IN_BETA_TESTING`을 readback했다.
- Firebase Android 앱에는 Play app signing SHA-256을 등록하고 Play Integrity API를 활성화했다. iOS 앱에는 Team ID와 App Store ID를 등록하고 App Attest·DeviceCheck 설정을 readback했다. sideload QA에 사용한 debug SHA와 unrecognized-version 허용은 즉시 제거했다. 실제 Play Store/TestFlight 설치본 token 확인 전 Platform `require_app_check=false`, Functions `ENFORCE_APP_CHECK=false`를 유지한다.
- `createInvite`, `acceptInvite`, `deleteAccount`는 production ACTIVE다. 기본 Storage bucket을 `asia-northeast3`에 만들고 rules를 배포했으며, 독립 owner/member 계정으로 초대 발급·수락·member 삭제·owner 삭제 E2E를 통과하고 시험 데이터를 정리했다. 계정 삭제 외부 안내 페이지도 한국어·영어 URL의 live 200을 확인했다.
- 남음: 잠긴 iPhone을 해제한 뒤 TestFlight 1.0.8 App Check·초대/수락 실기기 QA, Play Store 내부 설치본 token QA, enforcement 전환, Play/App Store 정책 설문·심사·production 공개 배포, AppsInToss 제품 runtime·sandbox·production 배포.

## 2026-08-06 — 계정 삭제·App Check와 Android 브랜드 후보 준비

- 더보기 화면에 owner/member 범위를 구분한 계정 삭제 확인 UX를 추가했다. callable `deleteAccount`는 `DELETE` 명시 확인 뒤 member의 멤버십·작성 기록·active sleep·mutation receipt를 삭제하거나, owner의 그룹 하위 데이터·Storage 객체·초대·감사 기록을 정리하고 재사용 방지 tombstone을 남긴 뒤 Firebase Auth 사용자를 삭제한다. 응답 유실 뒤 재실행을 위한 local deletion intent와 민감 cache purge도 추가했다.
- mobile App Check를 앱 초기화보다 먼저 연결했다. Android Release는 Play Integrity, iOS Release는 App Attest와 DeviceCheck fallback, 개발 빌드는 debug provider를 사용하며 Platform custom-token·계정 삭제 요청에도 `X-Firebase-AppCheck`를 전달한다. production provider 구성은 readback했지만 기존 후보 보호를 위해 Platform `require_app_check`와 Functions `ENFORCE_APP_CHECK`는 새 후보 실기기 확인 전까지 false로 유지했다.
- Platform에 Firebase ID token과 App Check를 검증하는 `DELETE /v1/auth/firebase-account`를 배포했다. PR #26 merge commit `bfa34a5`를 production runtime run `31108912145`로 배포했고, 네 service와 worker가 같은 image를 사용하며 API/IAP/ingest readiness 200과 삭제 경로의 400 입력 검증을 확인했다.
- Android 기본 launcher icon을 제품 브랜드 legacy/adaptive icon으로 교체하고 회귀 검사를 mobile gate에 연결했다. 로컬 Release AAB `1.0.7`/`1000007`은 package `com.seorilabs.babycare`, target SDK 36, SHA-256 `f1dc8b6d9a46502a97f42adee8911621a71c4c9348f702d1233265fda426fcfe`이며 release 서명과 브랜드 icon 리소스를 확인했다. 아직 Play Console에는 업로드하지 않았다.
- iOS Release `1.0.7`/`55`를 production App Attest entitlement로 빌드·서명해 연결된 iPhone 12 Pro에 설치했다. 기기 readback은 성공했지만 기기가 잠겨 있어 cold start와 App Check token 발급은 아직 확인하지 못했다. App Store Connect에는 업로드하지 않았다.
- 전체 검증에서 core 40건, mobile 37 suites/294건, Rules 23건, Functions unit 14건, Functions Emulator 7건, mobile 2계정 emulator flow 1건, Firebase config 3건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했다. 남음: `deleteAccount` production 배포·일회성 계정 live QA, 새 양쪽 스토어 후보 업로드, 실제 2계정·2기기 흐름, App Check 강제 전환, 마켓 설문·심사·공개 배포.

## 2026-08-06 — 초대 함수 Firestore 런타임 권한 복구

- Cloud Run Invoker IAM check 복구 뒤 TestFlight `1.0.6`의 인증된 `createInvite` 요청 두 건이 함수까지 도달했지만 HTTP 500으로 실패했다. 운영 그룹과 owner membership은 정상이고 `functionRateLimits/{uid}/actions/invite-create`가 생성되지 않아 첫 Firestore transaction 진입에서 실패한 것으로 특정했다.
- `createInvite`·`acceptInvite`의 공통 런타임 계정 `104011164568-compute@developer.gserviceaccount.com`에는 `roles/cloudbuild.builds.builder`만 있고 Firestore data-plane 권한이 없었다. 같은 계정을 사용하는 Cloud Run service가 두 초대 함수뿐임을 확인하고 production project에 `roles/datastore.user`를 추가했다.
- 최신 `origin/main@0d1e7e1`의 초대 함수만 재배포했다. 새 ready revision은 `createinvite-00003-ziv`, `acceptinvite-00003-qic`이며 두 함수 모두 ACTIVE다. Cloud Run Invoker IAM check 비활성화와 Firebase callable의 인증 없는 HTTP 401 `UNAUTHENTICATED` 경계도 유지됐다.
- `firebase/callable-access.json`에 런타임 계정과 필수 project role을 추가하고 운영 readback/apply 명령이 서비스 계정·역할·두 Cloud Run service를 함께 검증하도록 보강했다. `pnpm run test:static`에서 core 40건, mobile 34 suites/279건, Functions 10건, Firebase 설정 3건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`과 운영 callable readback도 통과했다.
- production Platform bridge로 일회성 사용자를 발급해 Firebase custom token을 교환하고 합성 owner 그룹에서 새 `createInvite`를 호출했다. HTTP 200과 rate-limit·invite·audit 문서 생성을 확인했으며 테스트 Firestore 문서와 Auth 사용자는 즉시 삭제했다. 남음: 실제 TestFlight owner 화면의 발급 표시와 다른 계정·기기의 `acceptInvite`를 확인한다.

## 2026-08-06 — TestFlight 초대 callable 진입 복구

- TestFlight `1.0.6`에서 `초대코드 만들기`를 누른 운영 요청 두 건을 Cloud Run request log에서 확인했다. `2026-08-06T06:50:08.978505Z`, `06:50:14.928695Z` 모두 `createInvite` 함수 코드에 도달하기 전 Cloud Run Invoker IAM에서 HTTP 401로 거부됐다.
- production `createInvite`·`acceptInvite`는 `asia-northeast3`에서 ACTIVE였고 HMAC Secret Manager 연결도 유지돼 있어 region·배포·secret 누락은 원인이 아니었다. 두 Cloud Run service에는 invoker binding이 없었고 조직 Domain Restricted Sharing 정책은 `allUsers` binding 추가도 거부했다.
- DRS 환경의 공개 callable 진입 계약에 맞춰 두 service의 Invoker IAM check를 비활성화했다. 기존 ready revision은 각각 `createinvite-00001-rar`, `acceptinvite-00001-hud`이며 새 함수 코드나 앱 바이너리는 만들지 않았다.
- 변경 뒤 인증 없는 callable probe는 두 endpoint 모두 Firebase callable의 HTTP 401 `UNAUTHENTICATED` 응답까지 도달했다. 따라서 Cloud Run 앞단 차단은 제거됐고 Firebase Auth token 검증과 함수의 owner/membership 검사는 유지된다. 실제 TestFlight 인증 owner의 코드 발급과 다른 계정 수락은 사용자 재시도 증거가 필요하다.
- `firebase/callable-access.json`에 project·region·service 계약을 기록하고 callable export·mobile region drift를 막는 정적 검사와 운영 readback/apply 명령을 추가했다.
- `pnpm run test:static`에서 core 40건, mobile 34 suites/279건, Functions 10건, Firebase 설정 3건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했다. `pnpm run check:mobile`, Rules 23건, Functions transaction Emulator 5건, Firebase mobile 2계정 초대 흐름 1건, 권한 있는 운영 구성의 callable readback도 통과했다.
- `pnpm run check:release`는 App Check 또는 edge rate limit, TestFlight 2계정 재확인, 마켓 정책·자산·QA 등 기존 blocker로 예상대로 실패했다. 새 TestFlight/Play artifact나 업로드는 만들지 않았다.

## 2026-08-06 — TestFlight 돌봄 그룹 생성 복구

- TestFlight에서 이름·생년월일 입력 후 `돌봄 그룹 만들기`가 실패한 시각의 운영 로그를 확인했다. Platform custom-token 요청은 HTTP 200이었고 Firebase 사용자도 같은 시각 생성되어 인증·연결 단계는 통과했다.
- 그룹 생성 전에 실행하는 `members.userId` collection-group 조회와 달리 운영 Firestore와 `firestore.indexes.json`에는 해당 collection-group scope index가 없었다. 운영 Rules는 저장소와 동일했으므로 Rules drift가 아닌 index 누락으로 특정했다.
- 기존 collection 범위 index 3개를 보존하면서 `members.userId`의 ascending collection-group index를 선언하고 운영 프로젝트에 적용했다. 네 index가 모두 `READY`임을 확인했고, 빈 probe 값의 동일 collection-group query가 HTTP 200으로 완료됐다. 기존 TestFlight 바이너리에서 재시도할 수 있으며 새 앱 빌드는 필요하지 않다.
- 필수 index가 다시 빠지거나 기존 범위를 지우면 static gate가 실패하도록 회귀 테스트를 추가했다. `pnpm run test:static`에서 core 40건, mobile 34 suites/279건, Functions 10건, index 1건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`, Firestore/Storage Rules 23건, Firebase mobile shared-flow 1건도 통과했다. `pnpm run check:release`는 마켓 정책·App Check·실기기 QA 등 기존 외부 blocker로 예상대로 실패했다.

## 2026-08-06 — 하단 탭 safe area 보강

- mobile의 두 runtime root는 상단·좌우 safe area만 처리하지만 공통 `TabBar`는 하단 패딩을 6으로 고정해, 홈 인디케이터나 제스처 내비게이션 영역이 있는 기기에서 탭이 시스템 UI와 겹칠 수 있었다.
- 기존 `SafeAreaProvider`의 bottom inset을 `TabBar`가 직접 읽고 최소 6 이상의 하단 패딩으로 반영했다. navigation과 각 탭 handler는 변경하지 않았으며 숨기거나 새로 약속한 기능은 없다.
- TabBar 회귀 테스트는 수정 전 bottom inset 34를 반영하지 못해 실패했고, 수정 후 inset 34와 inset 0의 기존 최소 패딩을 포함해 2건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 34 suites/279건, Functions 10건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- iPhone 16 Pro iOS 18.1 Simulator에서 현재 소스를 ad-hoc 서명으로 빌드·설치하고 cold start와 emulator 기반 그룹 생성을 거쳐 홈을 확인했다. 기본·다크 모드 모두 하단 탭이 홈 인디케이터 위에 분리되어 잘림·겹침이 없음을 스크린샷으로 확인했다. 저장소에 없는 `GoogleService-Info.plist`는 Simulator 명령에서만 제외했으며 실제 VoiceOver·큰 글꼴·Android·실기기는 확인하지 않았다.
- `pnpm run check:release`는 Play Data Safety·등급·WIF binding, App Store privacy·review 정보, AIT 자산·URL·정책·sandbox QA, production Firebase·App Check·실기기 migration 등 기존 외부 blocker로 예상대로 실패했다. 마켓 artifact 생성·업로드·processing·테스터 QA·공개 출시는 수행하지 않았다.

## 2026-08-06 — v1.0.6 양 스토어 내부 후보 정합화

- `v1.0.6` / `1d768c265740c91b6e0967ba20ca6ce380cc2def`은 App Store 업로드만 성공하고 Google Play가 WIF impersonation에서 실패한 부분 후보였다. 기존 태그를 이동하거나 새 버전을 만들지 않고 실패한 Play 쪽만 재시도했다.
- `pnpm run test:static`, Firestore/Storage Rules 23건, Functions emulator 5건, Firebase mobile shared flow 1건, `pnpm run check:mobile`과 태그 SHA의 GitHub Static Checks run `31008932756`을 확인했다. 현재 `origin/main@ece5cb8`의 Static Checks run `31055508183`도 성공 상태다.
- x64/JDK 21 Build Android Candidate run `31061827436`이 signed AAB를 생성했다. artifact는 package `com.seorilabs.babycare`, `1.0.6`/`1000006`, min SDK 24, target SDK 36, SHA-256 `4589cc4b5d12646a06a33628dd15d669f8b047488926b79f2eefb5fbb17fe50e`이며 strict JAR 검증과 babycare 전용 `upload` 인증서 fingerprint 일치를 확인했다.
- GitHub deploy run `31009039603`은 `iam.serviceAccounts.getAccessToken` 권한 누락으로 실패했다. 같은 artifact를 승인된 로컬 publisher credential로 Google Play internal `draft`에 한 번 업로드했고 Android Publisher API에서 `1.0.6`/`1000006`, `status=draft`를 readback했다. completed 활성화·테스터 배포·production 승격은 하지 않았다.
- Xcode Cloud run `1341ac47-4e2e-438e-9713-739a837fb4f0`의 ASC build `fbe23a81-a5b5-4a39-bcae-da15e59e957d`은 `1.0.6`/`54`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`다. 내부 그룹에는 과거 build만 연결돼 있어 `서리랩스 내부테스터`에 명시적으로 추가한 뒤 `IN_BETA_TESTING`과 테스터 2명을 API로 확인했다. 외부 TestFlight·App Review·공개 출시는 하지 않았다.
- `v1.0.6` 이후 `origin/main`에는 모유 타이머·기록 시각·모유 저장 조건 안내의 실질 runtime 변경 3건이 남아 있다. 부분 후보 우선 수렴 규칙에 따라 이번 실행에서는 `v1.0.7`을 만들지 않았고, 다음 실행은 이 변경들을 새 양쪽 후보 비교 기준으로 삼는다.

## 2026-08-06 — 모유 기록 저장 조건 안내

- 빠른 모유 기록은 좌·우 타이머가 1초 미만이면 도메인 규칙에 맞춰 저장 버튼을 비활성화하지만, 화면에는 이유가 없어 사용자가 핵심 수유 기록을 왜 저장할 수 없는지 알기 어려웠다.
- 저장 버튼의 접근성 힌트와 `polite` 안내로 `모유 타이머를 1초 이상 측정하면 저장할 수 있어요.`를 표시하고, 1초 이상 측정하면 안내가 사라지면서 기존 저장 동작이 활성화되도록 했다. 타이머·도메인 검증·저장 handler는 변경하지 않았다.
- Quick record 회귀 테스트는 수정 전 비활성 저장 버튼의 안내가 없어 실패했고, 수정 후 안내와 비활성 상태, 1초 측정 뒤 안내 해제와 활성 상태를 포함해 8건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/277건, Functions 10건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- Android API 36 emulator에서 Temurin 21·Node 24.16.0으로 현재 소스의 debug APK를 빌드·설치해 cold start를 확인했다. UI 계층에서 안내 노출·저장 버튼 비활성화를 확인하고, 타이머 시작 뒤 안내가 사라지며 저장 버튼이 활성화되는 것을 대조했다. 기본·다크 모드와 시스템 글자 크기 130% 화면에서 하단 안내·저장 버튼의 잘림·겹침이 없음을 스크린샷으로 확인했다. 실제 TalkBack 음성 탐색과 iOS·AppsInToss 화면은 확인하지 않았다.
- `pnpm run check:release`는 Play Data Safety·등급·WIF binding, App Store privacy·review 정보, AIT 자산·URL·정책·sandbox QA, production Firebase·App Check·실기기 migration 등 기존 외부 blocker로 예상대로 실패했다. 빌드 artifact의 마켓 업로드·processing·테스터 QA·공개 출시는 수행하지 않았다.

## 2026-08-06 — 기록 시각 조정 동작 접근성 보강

- 수유·기저귀·수면 빠른 기록의 `−10분`·`지금`은 실제 기록 시각을 바꾸는 handler가 있지만 접근성 역할과 동작 이름이 없어, 화면낭독기 사용자가 어떤 시각 조정인지 구분하기 어려웠다.
- 두 동작을 `button`으로 노출하고 각각 `기록 시각 10분 앞당기기`, `기록 시각을 지금으로 설정`이라는 이름을 부여했다. 기존 시각 변경·저장 handler는 유지했다.
- Quick record 회귀 테스트는 수정 전 새 접근성 이름을 찾지 못해 실패했고, 수정 후 두 버튼 역할과 `−10분` 조작 뒤 실제 `diaper`·10분 이전 `occurredAt` 저장 payload를 포함해 7건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/276건, Functions 10건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- Android API 36 emulator에서 Temurin 21·Node 24.16.0으로 현재 소스의 debug APK를 빌드했다. 첫 AVD 설치는 저장 공간 부족으로 실패했지만 사용자 데이터를 지우지 않고 여유 공간이 있는 대체 AVD에 설치해 cold start를 확인했다. 접근성 계층에서 두 동작이 실제 `Button`과 지정한 이름으로 노출되고 `−10분` 조작 후 화면 시각이 오전 4:09에서 3:59로 바뀌는 것을 스크린샷과 UI 계층으로 확인했다. 실제 TalkBack 음성 탐색과 iOS·AppsInToss 화면은 확인하지 않았다.
- `pnpm run check:release`는 Play Data Safety·등급·WIF binding, App Store privacy·review 정보, AIT 자산·URL·정책·sandbox QA, production Firebase·App Check·실기기 migration 등 기존 외부 blocker로 예상대로 실패했다. 빌드 artifact의 마켓 업로드·processing·테스터 QA·공개 출시는 수행하지 않았다.

## 2026-08-06 — 모유 타이머 동작 접근성 보강

- 빠른 모유 기록의 `시작`·`일시정지`·`계속`과 `초기화`는 실제 측정·저장 handler가 있지만 접근성 역할과 동작 이름이 없어, 화면낭독기 사용자가 어느 쪽 타이머를 어떻게 조작하는지 구분하기 어려웠다.
- 타이머 동작을 `button`으로 노출하고 현재 방향과 실행 상태를 `왼쪽 모유 타이머 시작`처럼 동적으로 안내하며, 초기화에도 명확한 버튼 이름을 부여했다. 기존 좌우 측정·일시정지·초기화·저장 handler는 유지했다.
- Quick record 회귀 테스트는 수정 전 새 접근성 이름을 찾지 못해 실패했고, 수정 후 시작→5초 경과→일시정지→계속 안내와 실제 `breast`·`leftDurationSeconds: 5` 저장 payload를 포함해 6건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/275건, Functions 10건, build-workflow 9건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- Android API 36 emulator에 Temurin 21로 debug APK를 빌드·설치해 cold start를 확인했다. 접근성 계층에서 시작·일시정지·계속·초기화가 실제 `Button`으로 노출됐고, 기본·다크 모드와 시스템 글자 크기 130% 화면에서 타이머 영역의 잘림·겹침이 없음을 스크린샷으로 확인했다. 실제 TalkBack 음성 탐색과 iOS·AppsInToss 화면은 확인하지 않았다.
- `pnpm run check:release`는 Play Data Safety·등급·WIF binding, App Store privacy·review 정보, AIT 자산·URL·정책·sandbox QA, production Firebase·App Check·실기기 migration 등 기존 외부 blocker로 예상대로 실패했다. 빌드 artifact의 마켓 업로드·processing·테스터 QA·공개 출시는 수행하지 않았다.

## 2026-08-05 — 스토어 빌드 경로 복구 및 v1.0.5 검증

- PR #20(`f972da16f5f2f81468f576b233434a59a5863680`)에서 Google Play 배포 toolchain을 Node 24.16.0·pnpm 11.14.0·Temurin 21로 고정하고, Xcode Cloud의 Automatic managed signing·태그 전용 시작·redacted Firebase plist 복원·암호화 선언을 반영했다. Static Checks run `31005828559`와 로컬 iOS Release Simulator build가 통과했다.
- Google Play publisher는 새 계정을 만들지 않고 기존 `seorilabs-play-publisher@seorilabs-gws.iam.gserviceaccount.com`만 사용하도록 repo variable과 원장을 정렬했다. 이 계정으로 Android Publisher edit 생성·삭제가 성공해 Play API 권한은 확인됐다.
- `v1.0.5` Xcode Cloud run `137ca847-3c34-4d5b-8931-4f70c5b023d8`은 source `f972da1`에서 성공했다. ASC build `5ca352a5-449e-4997-b730-315ead4d02e8`은 실제 `1.0.5`/`52`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`, 내부 beta testing 준비 상태다. 실제 테스터 설치·실기기 QA, App Review 제출·공개 출시는 수행하지 않았다.
- Google Play run `31006207820`은 같은 태그의 signed AAB 생성과 GitHub OIDC credential 구성까지 성공했다. 공용 publisher SA에 babycare repo principal의 `roles/iam.workloadIdentityUser`가 없어 `iam.serviceAccounts.getAccessToken`에서 중단됐고 Android Publisher edit/upload는 시작되지 않았다. GCP owner 조직 재인증 후 이 단일 binding을 추가하고 재실행해야 하며, 최신 실제 internal 업로드는 계속 1.0.2/1000002 draft다.

## 2026-08-05 — 수유량 조절 접근성 보강

- 빠른 수유 기록의 분유·유축·이유식 수유량은 `−`·`＋` 아이콘으로만 조절해, 화면낭독기 사용자가 버튼 동작과 현재 저장될 양을 알 수 없었다.
- 두 증감 동작에 `button` 역할과 10밀리리터 단위의 명확한 이름을 부여하고, 현재 수유량을 하나의 접근성 문구와 `polite` 갱신 영역으로 묶었다. 기존 10~2,000ml 범위와 저장 handler는 유지했다.
- Quick record 회귀 테스트는 수정 전 `수유량 120밀리리터` 접근성 정보를 찾지 못해 실패했고, 수정 후 120→130ml 변경과 실제 `formula`·`volumeMl: 130` 저장 payload를 포함해 5건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/274건, Functions 10건, build-workflow 6건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- `pnpm run check:release`는 AIT 자산·URL·정책·sandbox QA, Firebase project/App Check·실기기 migration, Play/App Store 설문·서명·승인 등 기존 외부 blocker로 예상대로 실패했다. 부팅된 iOS Simulator와 연결된 Android device가 없어 실제 화면낭독기·화면·다크 모드·작은 화면·큰 글꼴은 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-05 — 앱 내 개인정보 처리방침 연결

- 더보기의 `개인정보 보호` 행은 회사 공용 개인정보 처리방침이 게시·마켓 원장에 확정돼 있는데도 handler와 이동 표시가 없는 정적 문구라 사용자가 앱에서 정책을 직접 확인할 수 없었다.
- 행을 `개인정보 처리방침` 버튼으로 바꾸고 확정 URL `https://www.seorilabs.com/privacy/`을 여는 실제 handler를 연결했다. 열기 실패 시 SDK 진단 대신 연결 확인 안내만 표시한다.
- More 화면 회귀 테스트는 수정 전 정책 버튼을 찾지 못해 실패했고, 수정 후 URL 호출과 기술 오류 비노출을 포함해 9건이 통과했다. 같은 URL은 `curl -fsSIL`에서 HTTP 200을 반환했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/273건, Functions 10건, build-workflow 6건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- `pnpm run check:release`는 AIT 자산·URL·정책·sandbox QA, Firebase project/App Check·실기기 migration, Play/App Store 설문·서명·승인 등 기존 외부 blocker로 예상대로 실패했다. 부팅된 iOS Simulator와 연결된 Android device가 없어 실제 외부 브라우저 전환·화면·다크 모드·작은 화면·큰 글꼴은 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-05 — 빠른 기록 선택 상태 접근성 보강

- 수유 유형·모유 방향·기저귀 상태·수면 유형 선택지는 실제 저장 payload와 시각 강조를 바꾸지만, 접근성 트리에는 현재 선택 상태가 없어 스크린 리더 사용자가 어떤 값으로 저장되는지 구분할 수 없었다.
- 공통 `Choice`에 `radio` 역할과 실제 선택 값에 연결된 `selected` 상태를 추가해 네 입력 그룹에 같은 계약을 적용했고, 기존 선택 handler와 저장 동작은 유지했다.
- Quick record 회귀 테스트는 수정 전 `radio`가 0개라 실패했고, 수정 후 기본 `소변` 선택에서 `대변`으로 전환한 접근성 상태와 실제 `dirty` 저장 payload를 포함해 4건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/272건, Functions 10건, build-workflow 6건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- `pnpm run check:release`는 AIT 자산·URL·정책·sandbox QA, Firebase project/App Check·실기기 migration, Play/App Store 설문·서명·승인 등 기존 외부 blocker로 예상대로 실패했다. 부팅된 iOS Simulator와 연결된 Android device가 없어 실제 화면·스크린 리더·다크 모드·작은 화면·큰 글꼴은 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-05 — 통계 기간 선택 상태 접근성 보강

- 통계 화면의 `12시간`·`7일`·`30일` 선택기는 실제 기간 상태와 선택 강조를 바꾸지만, 접근성 트리에는 선택기 역할과 현재 선택 상태가 없어 스크린 리더 사용자가 어떤 기간의 통계인지 구분할 수 없었다.
- 선택기 묶음에 `tablist`, 각 기간 버튼에 `tab` 역할과 실제 `period` 상태에 연결된 `selected` 상태를 추가했다. 기존 기간 변경 handler와 통계 계산 동작은 그대로 유지했다.
- Stats 회귀 테스트는 수정 전 `tablist`가 0개라 실패했고, 수정 후 초기 `7일` 선택과 `12시간` 전환 시 선택 상태가 함께 바뀌는 것을 포함해 3건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/271건, Functions 10건, build-workflow 6건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- `pnpm run check:release`는 AIT 자산·URL·정책·sandbox QA, Firebase project/App Check·실기기 migration, Play/App Store 설문·서명·승인 등 기존 외부 blocker로 예상대로 실패했다. 부팅된 iOS Simulator와 연결된 Android device가 없어 실제 화면·스크린 리더·다크 모드·작은 화면·큰 글꼴은 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-05 — 생년월일 안내의 미지원 성장 기능 약속 제거

- 공동 기록 생성의 생년월일 단계는 값을 홈의 `생후 N일` 표시에 사용하지만, 화면 문구는 MVP 밖인 `성장 기록`을 이해하는 데 쓴다고 안내해 지원하지 않는 기능을 약속하고 있었다.
- 생년월일 안내를 실제 렌더 경로와 일치하는 `홈에서 아기의 생후 일수를 표시하는 데 사용해요.`로 바꾸고, 날짜 선택·그룹 생성 payload와 생후 일수 계산 동작은 그대로 유지했다.
- Cloud onboarding 회귀 테스트는 수정 전 새 제품 문구가 없어 실패했고 수정 후 실제 용도 안내와 `성장 기록` 비노출을 포함해 8건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/270건, Functions 10건, build-workflow 6건과 typecheck·lint·architecture·docs gate가 통과했고 `pnpm run check:mobile`도 통과했다.
- `pnpm run check:release`는 AIT 자산·URL·정책·sandbox QA, Firebase project/App Check·실기기 migration, Play/App Store 설문·서명·승인 등 기존 외부 blocker로 예상대로 실패했다. 부팅된 iOS Simulator와 연결된 Android device가 없어 실제 화면·다크 모드·작은 화면·큰 글꼴은 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-05 — AppsInToss 미완 기능·내부 상태 문구 비노출

- AppsInToss 첫 화면은 인증·저장·실시간 adapter나 버튼 handler가 없는데도 `수유`·`기저귀`·`수면` 기능 카드를 노출하고 `build-only 후보`, `sandbox` 같은 내부 배포 상태를 사용자에게 안내하고 있었다.
- 동작하지 않는 기능 카드와 내부 상태 안내를 제거하고, 브랜드와 성인 양육자 대상·비의료 고지만 남겼다. 인증·공동 기록·동기화·sandbox QA blocker는 제품 화면에서 완료처럼 보이게 숨기지 않고 planning/release 원장에 명시적으로 유지했다.
- AIT 회귀 테스트는 수정 전 `수유` 기능 약속 노출로 실패했고 수정 후 브랜드·비의료 고지는 유지하면서 미완 기능명과 내부 상태 문자열 8종이 없는지 검증해 1건 통과했다. 기존 `@types/jest`를 AIT TypeScript types에 연결해 lint·typecheck·test도 함께 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/269건, Functions 10건, build-workflow 6건과 typecheck·lint·architecture·docs gate가 통과했다. `pnpm run check:mobile`, `pnpm run check:ait`, `pnpm --dir apps/ait check`, `pnpm run check:docs`, `git diff --check`도 통과했다.
- `pnpm --dir apps/ait build`는 Android/iOS RN 0.84.0·0.72.6 bundle을 오류·경고 없이 만들고 로컬 `babynest.ait` artifact를 생성했다. `deploy`는 실행하지 않아 신규 비공개 업로드나 Console processing·sandbox QA 증거는 아니다.
- `pnpm run check:release`는 AIT thumbnail·vertical screenshots·URL·정책 답변·sandbox QA, Firebase project/App Check·실기기 migration, Play/App Store 설문·서명·승인 등 기존 외부 blocker로 예상대로 실패했다. 부팅된 iOS Simulator와 연결된 Android device가 없어 실제 화면·다크 모드·작은 화면·큰 글꼴은 확인하지 않았다.

## 2026-08-04 — BabyNest v1.0.3 AppsInToss 비공개 빌드 업로드

- 기존 `Deploy AppsInToss`는 ARM64 ARC에서 실행되어 `v1.0.2`의 미초기화 target 실패 뒤에도 BabyNest Granite의 x86-64 Hermes compiler와 호환되지 않는 경로였다.
- PR #18에서 deploy job을 `ubuntu-latest` x64로 전환하고 API 키 fail-closed, `babynest.ait` 존재 확인, 3일 artifact 보관과 명시적 `ait deploy --location` 계약을 추가했다.
- Seori 가이드 thread를 인수조건·테스트 근거로 소명해 Resolve했고 Static Checks·Firebase Emulator·Seori Review 통과 후 `3dbba5b`로 squash merge했다.
- `v1.0.3` source `089eb0c`를 workflow run `30909365541`에서 다시 빌드해 artifact `8892413606`을 생성하고 AppsInToss 비공개 업로드를 완료했다. deployment ID는 `019fccc1-8e5b-775f-99a4-ab190d4d1726`이다.
- 이번 완료 범위는 private build upload까지다. sandbox 실기기 설치·초기 route·로그인/공동 기록 QA, 정책 답변과 production 공개는 미완료로 유지한다.

## 2026-08-04 — 빠른 기록 시각 조정 행의 작은 화면 줄바꿈 보강

- 수유·기저귀·수면이 공통으로 쓰는 빠른 기록 모달은 시각 안내와 `−10분`·`지금` 버튼을 줄바꿈 없는 한 행에 배치해 작은 화면·큰 글꼴에서 안내와 버튼이 겹칠 수 있었다.
- 시각 행을 줄바꿈 가능한 flex 컨테이너로 바꾸고 안내 영역에는 축소 가능한 최소 너비를, 버튼 묶음에는 고정 축소 경계를 적용해 공간이 부족하면 버튼 전체가 다음 줄로 이동하도록 했다.
- Quick record 회귀 테스트가 시각 행의 줄바꿈, 안내 영역의 유연한 너비, 버튼 묶음의 고정 경계를 검증한다. 테스트는 수정 전 줄바꿈 컨테이너가 없어 실패했고 수정 후 3건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/269건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없어 작은 화면·큰 글꼴 화면을 실제로 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-04 — 긴 아기 이름과 상태 배지의 작은 화면 충돌 방지

- 제품 입력 계약은 아기 이름을 최대 80자까지 허용하지만, 홈과 더보기 상단은 이름 영역과 `공동 기록` 상태 배지를 축소 경계 없이 한 행에 배치해 작은 화면·큰 글꼴에서 서로 겹칠 수 있었다.
- 두 화면의 이름 영역에 `flex: 1`·`minWidth: 0`을 적용하고 이름을 최대 두 줄로 제한했으며, 상태 배지는 `flexShrink: 0`과 간격을 가져 이름만 안전하게 줄바꿈·말줄임되도록 했다.
- Home/More 회귀 테스트가 허용 상한인 80자 이름에서 두 줄 제한, 이름 영역 축소, 배지 고정 계약을 검증한다. 테스트는 수정 전 `numberOfLines`가 없어 두 화면 모두 실패했고 수정 후 13건이 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/268건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `pnpm run check:docs`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없어 작은 화면·큰 글꼴 화면을 실제로 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-04 — 공동 기록 화면 로딩 실패의 내부 진단·막힘 해소

- 프로덕션 진입점이 공동 기록 화면 모듈을 불러오지 못하면 `Cannot find module ./src/app/FirebaseBabyCareApp` 같은 내부 모듈 경로를 그대로 표시하고, 앱 안에서 다시 시도할 동작도 제공하지 않았다.
- 실패 화면은 `공동 기록 화면을 준비하지 못했어요. 다시 시도해 주세요.`만 표시하고, 명시적 `다시 시도` 버튼이 오류 상태를 지운 뒤 같은 제품 화면 loader를 다시 실행하도록 연결했다.
- RuntimeApp 회귀 테스트가 실제 loader의 첫 실패와 다음 성공을 주입해 내부 진단 비노출, 재시도 버튼, 두 번째 로드 후 제품 화면 전환을 검증한다. 테스트는 수정 전 내부 모듈 경로 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/266건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없어 모듈 로딩 실패·재시도 화면을 실제 기기로 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-04 — 손상 캐시 복구 배너의 내부 schema 노출 차단

- UID-scoped 공동돌봄 캐시가 손상되면 캐시를 purge하고 서버 세션을 정상 복구하면서도 `돌봄 context 값이 객체가 아닙니다` 같은 내부 schema 진단을 상단 배너에 그대로 노출했다.
- 기존 캐시 purge와 서버 세션 복구는 유지하고, 화면에는 `저장된 공동 돌봄 정보를 새로 불러왔어요`만 전달하며 원래 hydration 오류는 렌더하지 않는 `cause`로 보존했다.
- Firebase 제품 root 회귀 테스트가 손상된 cache envelope를 주입해 purge 뒤 실제 서버 세션 복구와 제품 문구·진단 원인 분리를 검증한다. 테스트는 수정 전 내부 `context` 진단 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/265건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없어 손상 캐시 복구 배너를 실제 화면으로 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-04 — 접근 해제 캐시 삭제 오류의 내부 진단 노출 차단

- 멤버십 또는 계정 상태 변경으로 공동 기록 접근이 해제된 뒤 로컬 공동돌봄 캐시 삭제가 실패하면 `[storage/unavailable]`과 내부 캐시 키를 전체 연결 오류 화면에 그대로 노출했다.
- 접근 해제와 민감 캐시 삭제 시도는 유지하고, 실패 화면에는 `해제된 공동 돌봄 정보를 기기에서 지우지 못했어요`만 전달하며 원래 저장소 오류는 렌더하지 않는 `cause`로 보존했다.
- Firebase 제품 root 회귀 테스트가 실제 세션 복원 뒤 `membership_removed` lifecycle callback과 캐시 삭제 실패를 재현해 제품 문구와 내부 진단 분리를 검증한다. 테스트는 수정 전 저장소 오류 원문 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/264건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없어 접근 해제 오류 화면을 실제 기기로 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-04 — 공동 기록 세션 복구 오류의 내부 진단 노출 차단

- 인증·멤버십 확인 또는 원격 동기화 복구가 실패해 session lifecycle이 `onError`를 호출하면 `[firestore/unavailable] Membership verification failed` 같은 SDK 코드와 영문 내부 진단을 상단 오류 배너에 그대로 노출했다.
- lifecycle의 자동 확인·복구 동작은 유지하고, 화면에는 `공동 기록 연결 상태를 확인하지 못했어요`만 전달하며 원래 오류는 렌더하지 않는 `cause`로 보존했다.
- Firebase 제품 root 회귀 테스트가 실제 세션 복원과 care container 조립 뒤 lifecycle callback에 기술 오류를 주입해 제품 문구와 진단 원인 분리를 검증한다. 테스트는 수정 전 원문 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/264건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없어 세션 복구 오류 배너를 실제 화면으로 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-03 — 공동 기록 읽기·재시도 오류의 내부 진단 노출 차단

- 공동 기록 조회, 오류 배너의 새로고침, 실패한 동기화의 재시도가 실패하면 `[firestore/permission-denied]`, `[firestore/unavailable]`, `[firestore/aborted]` 같은 Firestore 코드와 영문 내부 진단을 상단 오류 상태에 그대로 노출했다.
- 세 경로 모두 실제 동작에 맞는 `공동 기록을 새로 불러오지 못했어요` 또는 `동기화를 다시 시도하지 못했어요`만 화면에 전달하고, 원래 오류는 렌더하지 않는 `cause`로 보존했다.
- Firebase dashboard 회귀 테스트가 조회 observer와 새로고침·동기화 재시도 handler에 기술 오류를 주입해 제품 문구와 진단 원인 분리를 검증한다. 테스트는 수정 전 조회 오류 원문 노출로 실패했고 수정 후 세 경로 모두 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/263건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없어 공동 기록 오류·재시도 배너를 실제 화면으로 확인하지 않았고, 빌드·마켓 업로드도 실행하지 않았다.

## 2026-08-03 — 기록 변경 오류의 내부 진단 노출 차단

- 본인 기록 삭제와 진행 중 수면 종료가 실패하면 `[firestore/unavailable]`, `[firestore/aborted]` 같은 Firestore 코드와 영문 내부 진단을 Alert와 상단 오류 상태에 그대로 노출했다.
- 원래 오류는 화면에 렌더하지 않는 `cause`로 보존하고, 삭제는 `기록을 삭제하지 못했어요`, 수면 종료는 `수면을 종료하지 못했어요`와 연결 확인·재시도 안내만 표시하도록 같은 기록 변경 오류 handler를 보정했다.
- Firebase dashboard 회귀 테스트가 실제 삭제·수면 종료 handler에 기술 오류를 주입해 동작별 제품 안내만 Alert·runtime error 경계로 전달하는지 검증한다. 테스트는 수정 전 삭제 오류 원문 노출로 실패했고 수정 후 두 경로 모두 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/263건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 삭제·수면 종료 실패 UI를 직접 확인하지 않았다.

## 2026-08-03 — 초대 공유 오류의 내부 진단 노출 차단

- 유효한 양육자 초대 코드를 공유할 때 기기 공유 시트 호출이 실패하면 `[share/unavailable]` 같은 OS/SDK 코드와 영문 내부 진단을 Alert에 그대로 노출했다.
- 공유 실패 Alert는 `기기의 공유 기능을 열지 못했어요. 다시 시도해 주세요.`로 제한하고, 기존 초대 코드와 `Share.share` 호출 동작은 유지했다.
- More 화면 회귀 테스트가 실제 기술 오류를 주입해 제품 안내만 표시하고 SDK 코드와 영문 진단을 숨기는지 검증한다. 테스트는 수정 전 기술 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/262건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA, iOS 암호화 선언·유효 서명과 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device에서 기기 공유 시트 실패 Alert를 직접 확인하지 않았다.

## 2026-08-03 — v1.0.2 스토어 후보 부분 업로드

- 마지막 양쪽 성공 후보 `v1.0.1` 이후 `origin/main@d11bbfaa3dcea221067d60c43fd888f4c0e93f55`에 production 인증 bridge, 제품 브랜딩과 런타임 오류 문구 등 실질 변경이 있어 `v1.0.2`(`1000002`) 후보를 생성했다. 태그는 검증한 SHA에만 push했다.
- `pnpm run test:static`, `pnpm run test:firebase`, `pnpm run test:functions:emulator`, `pnpm run test:firebase:mobile-flow`, `pnpm run check:mobile`과 같은 SHA의 GitHub Static Checks run `30771469667`이 통과했다. `check:release`의 AppsInToss·정책 콘솔·실기기 QA·외부 승인 blocker는 유지했다.
- GitHub Google Play run `30776280174`는 signed AAB 빌드와 WIF 인증까지 성공했지만 Android Publisher `edits` 권한 403으로 업로드가 실패했다. 동일 AAB를 기존 승인된 로컬 publisher credential로 한 번 업로드했고, API에서 internal `1.0.2`/`1000002`, `status=draft`를 확인했다. internal 활성화·테스터 배포·production 승격은 하지 않았다.
- 로컬 JDK 21 signed AAB는 package `com.seorilabs.babycare`, version `1.0.2`/`1000002`, target SDK 36, release 서명과 SHA-256 `4a04f25eb8fcb4abce7559a56717a8ae91dc9fcac0bf4e312f51a26a5d240a78`을 검증했다.
- Xcode Cloud workflow는 App Store 배포 audience와 tag start condition이 연결되지 않았고 최근 run도 실패 상태라 로컬 fallback을 점검했다. bundle `com.seorilabs.babycare`, version `1.0.2`/`1000002`, App Store profile·Firebase plist·아이콘을 포함한 arm64 device archive는 생성됐다.
- 그러나 source와 최종 archive `Info.plist`에 `ITSAppUsesNonExemptEncryption`이 없고 strict codesign도 `CSSMERR_TP_NOT_TRUSTED`로 실패해 iOS 업로드를 중단했다. ASC에는 기존 `1.0.1`/`1000001`만 `VALID`이며 내부 그룹 `서리랩스 내부테스터`의 모든 빌드 접근 상태도 그대로다. 선언을 source에 반영하고 유효 서명으로 검증한 커밋에서 기존 태그를 이동하지 않고 다음 patch 후보로 재시도한다.

## 2026-08-03 — 구성원 갱신 오류의 내부 진단 노출 차단

- 구성원 목록 새로고침이 실패하면 `[firestore/unavailable]` 같은 Firestore SDK 코드와 영문 내부 진단을 Alert에 그대로 노출했다.
- 실패 Alert는 `연결을 확인하고 다시 시도해 주세요.`로 제한하고, 실제 구성원 갱신 handler와 성공 동작은 유지했다.
- More 화면 회귀 테스트가 실제 Firestore 기술 오류를 주입해 제품 안내만 표시하고 SDK 코드와 영문 진단을 숨기는지 검증한다. 테스트는 수정 전 기술 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/261건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 구성원 갱신 실패 Alert를 직접 확인하지 않았다.

## 2026-08-03 — 초대 코드 생성 오류의 내부 진단 노출 차단

- 양육자 초대 코드 생성이 실패하면 `[functions/resource-exhausted]` 같은 Functions SDK 코드와 영문 내부 진단을 Alert에 그대로 노출했다.
- 생성 실패 Alert는 `연결을 확인하고 잠시 후 다시 시도해 주세요.`로 제한하고, 기존 중복 요청 잠금과 버튼 재활성화 동작은 유지했다.
- More 화면 회귀 테스트가 실제 Functions 기술 오류를 주입해 제품 안내만 표시하고 SDK 코드와 영문 진단을 숨기는지 검증한다. 테스트는 수정 전 기술 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/261건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 초대 생성 실패 Alert를 직접 확인하지 않았다.

## 2026-08-03 — 빠른 기록 저장 오류의 내부 진단 노출 차단

- 수유·기저귀·수면 빠른 기록 저장이 실패하면 `[firestore/unavailable]` 같은 SDK 코드와 영문 내부 진단이 Alert와 모달 오류 문구에 그대로 노출됐다.
- 저장 실패는 모달 안에서 `기록을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.`로만 안내하고, 같은 실패를 별도 Alert로 중복 표시하던 dashboard 경로를 제거했다. 입력값과 저장 요청은 유지해 사용자가 모달에서 바로 재시도할 수 있다.
- Quick record 회귀 테스트가 실제 Firestore 기술 오류를 주입해 제품 안내만 표시하고 SDK 코드와 영문 진단을 숨기는지 검증한다. 테스트는 수정 전 기술 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 33 suites/260건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, App Check 또는 edge rate limit, 마켓 정책·privacy 답변, 실제 기존 사용자 migration·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator와 연결된 Android device가 없고 격리 worktree에는 `GoogleService-Info.plist`가 없어 저장 실패 화면을 실제 기기로 확인하지 않았다.

## 2026-08-02 — platform custom token bridge 운영 활성화

- `platform-auth@seorilabs-babycare.iam.gserviceaccount.com`을 생성하고 `platform-api@seorilabs-platform.iam.gserviceaccount.com`에 해당 service account의 resource-level `roles/iam.serviceAccountTokenCreator`만 부여했다. 프로젝트 전체 Token Creator binding은 추가하지 않았다.
- platform 앱 레지스트리를 Firestore에 동기화하고 최초 활성화 workflow [run 30750253253](https://github.com/seorilabs/platform/actions/runs/30750253253)로 `platform-api-00015-xpx`를 배포했다. 활성화 시점에는 `platform:b57bfc82a6cf7cf5f5fb2b9c612adc4612d5754d` 이미지를 100% 제공했다.
- live endpoint에서 임의 `uid` 주입 거부, 신규 custom token의 Firebase 교환, 합성 legacy Firebase ID token의 동일 UID 전환, `Cache-Control: no-store`를 검증했다.
- 같은 날 후속 main production [run 30750946141](https://github.com/seorilabs/platform/actions/runs/30750946141)이 `platform-api-00016-cdv` / `platform:bdbd69428900d85ab7ae4e9a58b32eee09e48f20`로 전진한 뒤에도 babycare config 200과 custom-token route의 POST-only 405를 다시 확인했다.
- smoke가 만든 Firebase Auth 사용자와 platform identity/user mapping은 종료 시 삭제했다. token·API key·UID는 로그나 문서에 남기지 않았다.
- App Check 또는 edge rate limit과 실제 기존 사용자·실기기 migration은 별도 release gate로 남는다.

## 2026-08-02 — 익명 인증을 platform custom token bridge로 전환

- production mobile 인증에서 RNFirebase `signInAnonymously`를 제거하고 Seorilabs platform의 custom token endpoint를 호출한 뒤 `signInWithCustomToken`으로 연결한다. direct anonymous는 Firebase Emulator 전용으로 제한했다.
- 기존 anonymous Firebase 사용자는 강제 갱신한 ID token을 platform이 검증해 같은 uid로 custom token을 발급받는다. bridge 응답이나 Firebase credential uid가 다르면 새 사용자로 조용히 전환하지 않고 fail closed 한다.
- 신규 사용자는 uid를 클라이언트가 고르지 않고 platform 서버가 생성한다. custom token은 저장하지 않고 즉시 Firebase 로그인에 한 번 사용한다.
- 당시 코드 검증과 분리했던 signer SA/IAM, registry sync, API 배포와 live 신규·합성 legacy UID smoke는 같은 날 후속 운영 작업으로 완료했다.

## 2026-08-02 — 공동 기록 온보딩의 작은 화면·키보드 경로 보강

- 제품의 공동 기록 온보딩은 `KeyboardAvoidingView` 안에 고정 `View`만 사용해 작은 화면·큰 글꼴·키보드가 열린 조건에서 입력 필드와 제출 버튼이 화면 밖으로 밀려도 스크롤로 복구할 수 없었다.
- 화면 전체를 safe area 안에 두고 내용 컨테이너를 `flexGrow` 기반 `ScrollView`로 바꿔, 키보드가 열린 상태에서도 모든 입력·이전·제출 동작까지 세로 스크롤할 수 있게 했다.
- 온보딩 회귀 테스트가 safe area와 키보드 탭을 보존하는 스크롤 컨테이너, 세로 스크롤 표시 제거, `flexGrow` 확장 계약을 검증한다. 테스트는 수정 전 safe area·scroll 경로 누락으로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/251건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- iPhone SE(3세대) Simulator에서 Firebase Emulator·Metro와 Debug build를 시도했지만, 격리 worktree에 `GoogleService-Info.plist`가 없어 app target 빌드가 중단됐다. 실제 작은 화면·큰 글꼴·키보드 화면은 확인하지 않았고 native client config blocker를 완료 처리하지 않는다.

## 2026-08-02 — 공동 기록 생성·참여 오류의 내부 진단 노출 차단

- 공동 기록 생성·초대 참여 요청이 Firebase/Auth/Functions 오류로 실패하면 `[firestore/unavailable]`, `[functions/failed-precondition]` 같은 SDK 코드와 영문 내부 진단을 온보딩 화면에 그대로 표시했다.
- 입력 단계의 검증은 기존대로 유지하고, 실제 생성 실패는 연결 확인·재시도 안내로, 참여 실패는 코드 확인·재발급 안내로 제한해 내부 구현 정보를 사용자 화면에서 분리했다.
- 온보딩 회귀 테스트가 생성·참여 각각에 실제 기술 오류를 주입해 제품 안내만 표시하고 SDK 코드와 영문 진단은 노출하지 않는지 검증한다. 두 테스트는 수정 전 내부 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/250건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 생성·참여 오류 화면을 직접 확인하지 않았다.

## 2026-08-02 — 공동 기록 시작 오류의 내부 진단 노출 차단

- 공동 기록 bootstrap이 실제 `Error`로 실패하면 제품 fallback 대신 `Firebase native client configuration…` 같은 영문 내부 진단을 연결 오류 화면에 그대로 표시했다.
- 시작 실패 화면은 항상 `공동 기록을 시작하지 못했어요`를 표시하고, 원래 오류는 화면에 렌더하지 않는 `cause`로 보존해 사용자 안내와 진단 경계를 분리했다. 기록 저장·동기화 등 다른 동작 오류의 세부 안내는 이번 범위에서 일괄 숨기지 않았다.
- Firebase 제품 root 회귀 테스트가 실제 기술 오류를 주입해 내부 구성명은 노출하지 않고 제품 fallback만 표시하는지 검증한다. 테스트는 수정 전 영문 기술 오류 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/248건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연결 오류 화면을 직접 확인하지 않았다.

## 2026-08-02 — 제품 화면 Firebase 기술 문구 제거

- 기본 제품 런타임의 공동 기록 로딩·시작 실패·계정 상태 변경 안내가 `Firebase 계정`, `Firebase 공동 기록`처럼 사용자에게 필요 없는 백엔드 구현명을 노출했다.
- 로딩은 계정과 돌봄 그룹을 확인하는 실제 동작만 안내하고, 시작 실패와 계정 상태 변경도 `공동 기록` 제품 용어로 통일했다. 개발 코드의 Firebase 식별자와 진단 경계는 유지했다.
- Firebase 제품 root 렌더 회귀 테스트를 추가해 로딩 화면과 메시지 없는 시작 실패 fallback이 제품 문구를 표시하고 `Firebase`를 노출하지 않는지 검증한다. 테스트는 수정 전 두 화면 모두 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 32 suites/248건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 로딩·오류 화면을 직접 확인하지 않았다.

## 2026-08-02 — 본인 기록 삭제 접근성 경로 추가

- 타임라인의 본인 기록 soft delete는 길게 누르기에만 연결돼 있어 화면낭독기 사용자가 MVP 삭제 기능을 안정적으로 실행할 명시적 접근성 동작이 없었다.
- 본인 기록 행에 button 역할과 `기록 삭제` 활성화 동작을 추가해 화면낭독기의 기본 활성화가 기존 삭제 확인창을 열도록 연결했다. 터치 사용자의 길게 누르기는 유지하고 다른 양육자의 기록에는 삭제 역할·동작을 노출하지 않는다.
- Timeline 회귀 테스트가 본인 기록의 접근성 활성화와 길게 누르기가 같은 확인창을 열고, 다른 양육자 기록에는 삭제 접근성 동작이 없는지 검증한다. 테스트는 수정 전 접근성 역할 누락으로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 31 suites/246건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 VoiceOver/TalkBack과 simulator/device 화면을 직접 확인하지 않았다.

## 2026-08-02 — 수면 종료 중복 요청 방지

- 홈의 활성 수면 `기상` 버튼은 종료 요청이 진행 중이어도 재입력이 가능해, 빠른 연속 탭으로 같은 수면의 종료 mutation을 두 번 요청하고 첫 성공 뒤 불필요한 충돌 오류를 노출할 수 있었다.
- 화면 상태와 별개인 동기식 요청 잠금을 추가해 첫 종료 요청이 끝날 때까지 재입력을 차단했다. 버튼은 `종료 중…`·`잠시만 기다려주세요`로 바뀌며 접근성 이름과 `busy`·`disabled` 상태도 함께 제공한다.
- Home 화면 회귀 테스트가 같은 렌더의 수면 종료 버튼을 연속 두 번 눌러도 요청이 한 번만 실행되고 완료 뒤 다시 활성화되는지 검증한다. 테스트는 수정 전 종료 요청 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 31 suites/246건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연속 탭과 종료 진행 상태 화면을 직접 확인하지 않았다.

## 2026-08-01 — 빠른 돌봄 기록 중복 저장 방지

- 수유·기저귀·수면 빠른 기록 모달은 React의 `saving` 상태만 확인해, 버튼 비활성화 재렌더 전에 빠르게 두 번 누르면 서로 다른 이벤트 ID의 돌봄 기록 두 건을 저장할 수 있었다.
- 저장 payload를 만든 직후 동기식 요청 잠금을 걸어 저장이 끝날 때까지 재입력을 차단했다. 저장 버튼에는 `돌봄 기록 저장`·`돌봄 기록 저장 중` 접근성 이름과 `busy`·`disabled` 상태를 추가했다.
- Quick record modal 회귀 테스트가 같은 렌더의 저장 버튼을 연속 두 번 눌러도 요청과 닫기 동작이 각각 한 번만 실행되는지 검증한다. 테스트는 수정 전 저장 요청 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 31 suites/245건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연속 탭과 저장 진행 상태 화면을 직접 확인하지 않았다.

## 2026-08-01 — 공동 기록 온보딩 중복 제출 방지

- 공동 기록 생성·참여 버튼은 React의 `saving` 상태만 확인해, 비활성화 재렌더 전에 같은 버튼을 빠르게 두 번 누르면 Firebase 그룹 생성 또는 참여 요청이 중복 실행될 수 있었다. 특히 생성 요청이 겹치면 한 익명 계정에 여러 그룹이 만들어져 다음 세션 복원이 중단될 수 있다.
- 화면 상태와 별개인 동기식 요청 잠금을 추가해 생성·참여 요청이 끝날 때까지 재입력을 차단했다. 진행 버튼은 기존 `공동 기록을 준비하는 중…` 문구와 함께 접근성 `busy`·`disabled` 상태도 노출한다.
- Cloud onboarding 회귀 테스트가 같은 렌더의 생성 버튼을 연속 두 번 눌러도 요청이 한 번만 실행되고 완료 뒤 다시 활성화되는지 검증한다. 테스트는 수정 전 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/244건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 연속 탭과 진행 상태 화면을 직접 확인하지 않았다.

## 2026-08-01 — 공동 기록 온보딩 내부 개발 문구 제거

- 공동 기록 온보딩이 `Firebase Cloud/Emulator`, `현재 개발 빌드`, `출시 전에 추가`처럼 사용자와 무관한 구현 기술과 미완성 TODO를 제품 화면에 노출했다.
- 상단 문구를 확정 제품명 기반 `함께봄 공동 기록`으로 바꾸고 runtime 기술 label prop을 제거했다. 익명 계정의 복구 미지원은 숨기지 않고, 앱 삭제·기기 변경 시 계정과 기록에 다시 접근하지 못할 수 있다는 현재 위험으로 안내한다.
- Cloud onboarding 회귀 테스트가 제품 문구와 계정 안전 안내를 검증하고 `Firebase`·`현재 개발 빌드`·`출시 전에`의 재노출을 막는다. 테스트는 수정 전 내부 문구 노출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/243건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, production 인증·App Check, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다. 계정 복구·삭제 정책도 완료 처리하지 않았다.
- 부팅된 iOS Simulator가 없었고, 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 설치 시 서명·앱 데이터 영향 가능성이 있으므로 현재 문구를 설치하거나 화면으로 직접 확인하지 않았다.

## 2026-08-01 — 타임라인 실시간 연결 오표시 제거

- 타임라인은 Firebase 공동 기록 모드라는 이유만으로 `● LIVE` 배지를 표시해, 오프라인 기록·재시도·연결 오류 상태에서도 실시간 연결 중이라고 안내했다. 실제 pending/failed 상태는 별도 동기화 배너가 담당한다.
- 연결 상태를 추정하지 않고 제품 모드만 설명하도록 Firebase 배지를 `● 공동 기록`, Jest 전용 local preview 배지를 `● 로컬 저장`으로 바꿨다.
- Timeline 회귀 테스트가 Firebase 모드에서 `공동 기록`을 표시하고 `LIVE`를 다시 노출하지 않는지 검증한다. 테스트는 수정 전 `● LIVE`로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/242건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 부팅된 iOS Simulator가 없었고, 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 설치 시 서명·앱 데이터 영향 가능성이 있으므로 현재 변경을 설치하거나 화면으로 직접 확인하지 않았다.

## 2026-08-01 — 만료 초대 코드 공유 차단

- 더보기 화면은 초대 만료 시각이 지났어도 코드를 `까지 유효`로 표시하고 공유 버튼을 계속 제공해, 서버가 거부할 만료 코드를 다른 양육자에게 전달할 수 있었다.
- 만료된 코드는 화면에서 가리고 `초대 코드가 만료됐어요` 상태와 `새 코드 만들기` 동작을 노출했다. 만료되지 않은 기존 코드의 공유 흐름은 유지했다.
- More 화면 회귀 테스트가 만료 코드·공유 동작이 노출되지 않고 replacement 생성 요청만 실행되는지 검증한다. 테스트는 수정 전 만료 상태 누락으로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/241건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 서명 충돌이나 앱 데이터 영향 가능성이 있으므로 설치하지 않았다. 부팅된 iOS Simulator도 없어 실제 만료 상태 화면은 직접 확인하지 않았다.

## 2026-08-01 — 초대 코드 중복 생성 요청 방지

- 더보기의 초대 코드 생성 버튼은 진행 중 잠금이 없어 빠른 연속 탭마다 privileged Functions 요청을 다시 보내고 rate-limit 오류를 만들 수 있었다.
- 동기식 요청 잠금과 진행 상태를 추가해 완료 전 재입력을 막고, 버튼을 `만드는 중…`으로 비활성화하며 접근성 `busy`/`disabled` 상태도 함께 노출했다.
- More 화면 회귀 테스트가 같은 렌더의 연속 탭 두 번에서도 생성 요청이 한 번만 실행되고 완료 뒤 버튼이 다시 활성화되는지 검증한다. 테스트는 수정 전 2회 호출로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/240건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 연결된 Android 기기는 Debug/Release가 같은 application ID를 사용해 서명 충돌이나 앱 데이터 영향 가능성이 있으므로 설치하지 않았다. 부팅된 iOS Simulator도 없어 실제 진행 상태 화면은 직접 확인하지 않았다.

## 2026-07-31 — 작은 화면 빠른 기록 2열 안정화

- 홈 빠른 기록 카드는 `48.5%` 고정 너비 두 개와 10px gap을 사용해 320px 화면에서 가용 content 폭 284px보다 합계가 약 1.5px 커지고, 단일 열로 밀리거나 가로로 넘칠 수 있었다.
- 카드 기준 폭을 `47%`로 낮추고 남는 폭을 `flexGrow`로 균등 분배해 좁은 화면에서도 두 카드와 gap이 먼저 맞도록 수정했다.
- Home 회귀 테스트가 네 빠른 동작의 가변 2열 스타일과 고정 width 제거를 검증한다. 테스트는 수정 전 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/239건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.
- 이번 실행에서는 simulator/device로 작은 화면과 큰 글꼴을 직접 확인하지 않았다.

## 2026-07-31 — 구성원 새로고침 안내 정합성 수정

- 더보기의 `동기화 상태` 행은 상태 화면을 열지 않고 구성원 목록만 다시 읽었으며, 요청 실패도 조용히 무시해 실제 동작과 문구가 어긋났다.
- Firebase 구성에서는 행을 `구성원 목록 새로고침`으로 바꾸고 실제 동작을 설명했다. 실행 가능한 설정 행에는 button 접근성 역할·라벨을 부여하고 실패 원인을 Alert로 표시한다.
- More 화면 회귀 테스트가 실제 동작 문구, 접근성 라벨, 실패 안내를 검증한다. 테스트는 수정 전 문구 불일치로 실패했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/238건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 이번 실행은 설정 행의 정적 UI·오류 처리 수정이라 simulator/device 화면은 직접 확인하지 않았다.

## 2026-07-31 — 공동 기록 오류의 로컬 미리보기 우회 제거

- Firebase 화면 import 또는 초기화 실패 시 `로컬 미리보기로 계속`을 노출해, 사용자가 공동 기록과 분리된 개발용 로컬 저장소에 기록을 만들 수 있었다.
- 제품 runtime 오류 화면은 공동 기록 실패를 명확히 유지하고 재시도만 제공하도록 fail-closed 처리했다. local preview composition은 기존 Jest 경로에만 남겼다.
- `check:mobile`에 제품 runtime source의 `로컬 미리보기` 문구와 우회 handler 재노출 방지 검사를 추가했다. 검사는 수정 전 두 오류 화면을 찾아 실패했고 수정 후 통과했다.
- 기획 기준선과 QA 전략의 local preview 범위를 Jest 전용으로 맞췄다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/237건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 이번 실행은 오류 경계의 정적 UI 수정이라 simulator/device 화면은 직접 확인하지 않았다.

## 2026-07-31 — 새 기기 진행 중 수면 표시 복구

- Home은 별도 active-sleep projection을 받아 기상 동작에는 사용했지만 최근 수면 카드는 bounded 이벤트 목록의 latest 값만 렌더링했다. 새 기기나 timeline 범위 밖 active sleep에서는 `마지막 수면 · 아직 기록이 없어요`와 `기상` 동작이 동시에 노출될 수 있었다.
- authoritative `activeSleep`이 있으면 최근 수면 카드에서도 우선 표시하고, 없을 때만 overview의 마지막 완료 수면을 사용하도록 수정했다.
- bounded 이벤트 목록이 비어 있고 active-sleep projection만 있는 조건을 Home 회귀 테스트로 추가했다. 테스트는 수정 전 `밤잠 자는 중` 누락을 재현했고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/237건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 이번 실행은 정적 렌더 경계 수정이라 simulator/device 화면은 직접 확인하지 않았다.

## 2026-07-31 — 빠른 기록 더보기 문구 정합성 수정

- 홈의 `더보기` 빠른 동작은 설정 화면을 열지만 다른 기록 동작과 같은 `바로 남기기` 보조 문구를 노출해 실제 동작을 잘못 안내했다.
- 빠른 동작별 보조 문구를 명시해 수유·기저귀·수면 기록 문구는 유지하고 `더보기`만 `설정 열기`로 수정했다.
- Home 화면 회귀 테스트가 `더보기 바로 남기기`의 재노출을 막고 실제 설정 이동 문구를 검증한다. 테스트는 수정 전 실패하고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/236건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 문구 정합성 수정만 수행해 이번 실행에서는 simulator/device 화면을 직접 보지 않았다.

## 2026-07-31 — 미구현 아기 선택 표시 제거

- 홈 상단의 아기 이름 뒤 `▾`가 선택 가능한 드롭다운처럼 보였지만 실제 press handler나 선택 화면이 없었다.
- 현재 승인 MVP는 단일 아기이며 다둥이 지원은 MVP 밖이므로 기능을 임의 확장하지 않고 오해를 만드는 표시만 제거했다.
- Home 화면 회귀 테스트를 추가해 아기 이름은 유지하면서 미구현 선택 표시가 다시 노출되지 않도록 했다. 테스트는 수정 전 실패하고 수정 후 통과했다.
- `pnpm run test:static`에서 core 40건, mobile 30 suites/236건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다.
- 텍스트 표시 제거만 수행해 이번 실행에서는 simulator/device 화면을 직접 보지 않았으며 다둥이 지원은 기존 MVP 밖 backlog로 유지한다.

## 2026-07-30 — 고정 개발 버전 문구 노출 제거

- 더보기 화면이 workspace package의 초기값인 `개발 빌드 0.1.0`을 고정 노출했지만, 실제 Android/iOS 최신 업로드 빌드는 1.0.1(1000001)이고 release workflow는 태그에서 native 버전을 주입한다.
- 잘못된 버전을 제품 정보로 안내하지 않도록 고정 문구를 제거했다. 실제 native 버전 readback 경로를 도입하기 전까지 임의 값으로 대체하지 않는다.
- More 화면 회귀 테스트가 미구현 export 문구와 함께 고정 개발 버전의 재노출을 막는다.
- `pnpm run test:static`에서 core 40건, mobile 29 suites/235건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다. 텍스트 제거만 수행해 이번 실행에서는 simulator/device 화면을 직접 보지 않았다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.

## 2026-07-30 — 미구현 데이터 내보내기 노출 제거

- 더보기 화면이 누를 수 없는 `데이터 내보내기 — 준비 중` 행으로 아직 제공하지 않는 기능을 사용자에게 약속하고 있었다.
- CSV/PDF 내보내기는 승인 MVP 밖이며, 개인정보 보호 목적의 기본 export 절차는 재인증·privileged backend 정책이 필요한 P1 release blocker다. 범위를 임의 확장하지 않고 해당 행만 제품 UI에서 숨겼으며 backlog blocker는 유지했다.
- More 화면 회귀 테스트가 `데이터 내보내기`와 `준비 중` 문구의 재노출을 막는다.
- `pnpm run test:static`에서 core 40건, mobile 29 suites/235건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`도 통과했다. 이번 실행에서는 simulator/device 화면을 직접 보지 않았다.
- `pnpm run check:release`는 AppsInToss target/`appName`, 마켓 정책·privacy 답변, 실제 계정·기기 QA와 deployment approval 등 기존 blocker로 예상대로 실패했다.

## 2026-07-30 — 확정 제품명 사용자 표면 반영

- 2026-07-18 확정·스토어 반영된 한국어 제품명 `함께봄`과 달리 Android/iOS launcher label, React Native `displayName`, 초대 공유 문구가 개발용 기술 이름 `BabyCare`를 노출하고 있음을 확인했다. 기존 `pnpm run check:mobile`도 이 상태를 통과했다.
- Android `app_name`, iOS `CFBundleDisplayName`, React Native `displayName`과 초대 공유 문구를 `함께봄`으로 통일했다. 내부 JS/native target 이름 `BabyCare`는 module·scheme 호환을 위해 유지한다.
- `check:mobile`이 세 native 표시 이름과 초대 공유 브랜드를 검사하도록 보강하고, 초대 공유 payload 회귀 테스트와 접근성 label을 추가했다. 기획서·backlog의 과거 `확정 필요` 표기도 현재 승인 상태에 맞췄다.
- `pnpm run test:static`에서 core 40건, mobile 29 suites/234건, Functions 10건과 typecheck, lint, architecture, docs gate가 통과했고 `pnpm run check:mobile`, `git diff --check`, iOS plist lint도 통과했다.
- JDK 21 Android debug APK를 빌드하고 `aapt dump badging`에서 package `com.seorilabs.babycare`, application/activity label `함께봄`을 확인했다. 이번 실행에서는 Android/iOS 화면·cold start를 직접 보지 않았으므로 QA checklist는 완료 처리하지 않았다.
- `pnpm run check:release`는 이번 변경과 무관한 AppsInToss `appName`/target, 스토어 정책 답변, 실제 계정·기기 QA와 deployment approval blocker로 예상대로 실패했다.

## 2026-07-13 — Android/iOS 식별자 확정

- 사용자가 Android application ID와 iOS bundle ID를 `com.seorilabs.babycare`로 확정했다. Debug/Release native target이 같은 식별자를 사용하며 Android Kotlin package 경로와 iOS Debug/Release build setting도 함께 맞췄다.
- 이전 `.dev` 앱과 새 앱은 별도 설치·별도 로컬 데이터 컨테이너이므로 AsyncStorage 데이터는 자동 승계하지 않는다. 실제 Firebase client app과 Play Console/App Store Connect 등록도 새 식별자를 사용해야 한다.
- 최종 한국어/영어 표시 이름, AppsInToss `appName`, signing, Firebase project와 deployment approval은 별도 미완료 게이트로 유지한다.
- `pnpm run test:static`과 mobile/docs gate가 통과했다. Android JDK 21 clean debug 빌드의 APK application ID와 iPhone 16 Pro Simulator Debug 빌드의 `.app` `CFBundleIdentifier`가 모두 `com.seorilabs.babycare`임을 확인했다.

## 2026-07-13 — Cloud overview and active-sleep projections

- core에 Firebase type을 포함하지 않는 `CareEventProjectionRemotePort`를 추가했다. Home/Stats용 half-open 기간 window, 종류별 latest와 active-sleep singleton의 fetch/observe 계약을 분리하고, 통계 core는 delivery layer가 만든 명시적 범위만 집계한다.
- RNFirebase adapter는 window/latest/active를 server-only로 읽고 cache·pending snapshot을 authoritative 값으로 취급하지 않는다. active singleton은 `activeSleeps/{babyId}` lock에서 event를 따라가며 group/baby/event/caregiver/start/create identity와 실제 active 상태를 함께 검증한다.
- scoped durable envelope를 v3로 올려 bounded timeline coverage와 독립된 `overviewEventIds`, `unknown | confirmed_none | active(eventId)` coverage를 저장한다. overview와 active singleton은 `replaceRemoteProjections` 한 번으로 atomic 교체하며 pending/failed local mutation은 optimistic overlay로 보존한다.
- `CareEventOverviewFeed`는 최근 통계 window, feeding/diaper/sleep latest와 active singleton을 결합한다. source 간 동일 revision payload/identity 불일치, observer epoch supersession, terminal error와 recovery 재연결에서 last-good projection을 보존한다.
- 인증 cloud container는 scope마다 `CareEventTimelineFeed`와 `CareEventOverviewFeed` owner를 각각 하나씩 시작해 반환한다. Auth/membership 복구 시 두 feed를 refresh하고, revocation/teardown에서는 둘 다 중단한 뒤 기존 purge/close 불변식을 따른다.
- Home은 진행 중 수면을 bounded event 목록에서 추론하지 않고 explicit `activeSleep`을 받는다. 기본 local preview도 전체 snapshot을 `{events, activeSleep}` overview source로 원자 전달해 cloud feed와 같은 presentation 경계를 사용한다. 구독 stop은 idempotent하고 stale callback을 차단하며, local delete marker는 해당 ID가 complete snapshot에서 사라지면 해제해 후속 active singleton을 숨기지 않는다. Stats의 7일/30일 bucket은 device-local calendar의 `setDate` 경계를 사용하고 DST 변화에서도 명시적 `[from, to)` 범위를 core에 전달한다.
- 기본 `App.tsx`는 계속 전체 local event를 사용하는 preview다. production authenticated UI root/Auth/group/baby composition, 실제 Firebase project/index/listener, 두 계정·두 기기 및 새 기기 active-sleep 복구 QA, AppsInToss와 배포는 완료하지 않았다.

검증 범위:

- projection port/use case, Firebase server-only adapter, envelope v1/v2→v3 migration·atomic rollback, overview observer/recovery, container owner/lifecycle, Home/Stats 날짜·DST 회귀 suite를 추가했다. `test:core` 40건, mobile Jest 24 suites/204건, Rules Emulator 23건, Functions unit 10건, Functions transaction Emulator 5건이 통과했고 typecheck, lint, architecture, docs, mobile target gate도 통과했다.

## 2026-07-13 — Bounded timeline pagination

- core에 `(occurredAt DESC, documentId DESC)` UTF-8 tie-break, scalar cursor, runtime page request validation과 pure pagination reference를 추가했다.
- RNFirebase transport는 soft-delete를 포함한 raw page를 server-only로 `pageSize + 1` 조회한다. cache/pending snapshot은 authoritative page로 취급하지 않고 decode 실패 시 partial page를 반환하지 않는다.
- local sync envelope를 v2로 확장해 authoritative remote prefix ID, end cursor, raw count와 `hasMore`를 저장한다. v1은 outbox/conflict overlay를 분리해 보수적으로 이관하고, prefix 교체에서 사라진 synced row만 제거한다.
- `CareEventTimelineFeed`는 명시적으로 주입된 page/cache/scan bound 안에서 load-more를 수행한다. 어느 live page든 signature가 변하면 현재 로드 깊이를 HEAD부터 재조회해 한 번의 local commit으로 교체하며, tombstone은 cursor에는 포함하고 UI에서는 숨긴다.
- cloud container에서는 기존 전체 baby snapshot listener를 끄고 인증 scope당 bounded page feed 하나를 명시적 config로 즉시 시작해 원격 read/reconnect를 독점한다. observer epoch로 이전 cursor callback을 무효화하고, 새 observer 설치를 prefix commit 전에 준비해 설치 실패 시 기존 coverage/listener를 유지한다. server-confirmed page는 retryable/unauthenticated outbox retry/flush 신호를 겸하고, Auth/membership 확인 복구 뒤 HEAD listener를 다시 bind한다.
- offline 최초 fetch와 활성 listener의 terminal retryable 오류는 bounded HEAD recovery 경로로 전환한다. 첫 server-confirmed page에서 자동 rebase하고, 연속 terminal 오류에는 무한 재설치 loop를 만들지 않는다.
- mobile 타임라인을 `SectionList`로 바꾸고 loading/error/retry/end footer와 중복 `onEndReached` one-flight guard를 추가했다. 현재 기본 local preview도 20건씩 최대 200건의 presentation pagination을 실제 연결하되, Home/Stats에는 전체 local event projection을 유지한다.
- 실제 Firebase project/client config와 production Auth composition이 없어 cloud timeline factory는 기본 화면에 아직 연결하지 않았다. Home/Stats용 기간별 독립 cloud projection도 연결 전 P0다. 실제 index, 두 기기 head insertion/move/delete, offline 복귀와 read 비용은 non-production QA 게이트다.

검증 상태:

- core 30건, mobile Jest 140건, Firestore/Storage Rules 23건, Functions unit 10건, transaction Emulator 5건이 통과했다. 실제 `App → useLocalTimelinePagination → TimelineScreen` 연결은 45건 fixture의 20→40→45 확장과 탭 재진입 상태 유지, 주입형 error→retry→해제 조합으로 검증한다.
- 실제 Firestore Emulator에서 동일 timestamp 4건과 soft-delete tombstone을 `documentId DESC` cursor로 `d,c,b → a` 순서로 조회해 중복·누락이 없음을 확인했다.
- workspace typecheck/lint, architecture/docs gate와 `git diff --check`가 통과했다.

## 2026-07-13 — Local-first cloud sync foundation

- 승인 MVP를 요구사항별로 다시 감사해 FR-05 offline/retry, cross-device active sleep, cache purge가 adapter 파일 존재만으로는 충족되지 않음을 확인했다.
- `packages/product-data`와 `StringStoragePort`를 추가했다. 인증 user/group/baby scoped 단일 envelope에 event projection과 revision별 outbox mutation을 한 번의 serialized write로 커밋한다. 동일 storage/scope 다중 writer를 거부하고 persist 실패 시 memory/observer를 rollback하며 local preview cache를 자동 이관하지 않는다.
- `LocalFirstCareEventRepository`는 UI 저장을 local durable commit에서 반환하고 remote transaction을 background에서 revision 순서대로 drain한다. `rev1 → rev2`를 coalesce하지 않으며 retryable·conflict·Auth/permission 상태를 분리하고 server-confirmed snapshot만 reconcile한다.
- Firestore `setDoc` transport를 transaction으로 바꿨다. canonical payload SHA-256을 사용하는 `eventMutationReceipts/{eventId@revision@payloadHash}`와 event의 마지막 mutation metadata를 Rules에서 양방향 원자 결합한다. receipt에 revision 당시 transport payload를 보존해 Rules가 event map과 직접 비교하고, adapter는 actor/hash/domain payload가 모두 일치할 때만 commit 응답 유실의 증거로 인정한다.
- active sleep은 `activeSleeps/{babyId}` singleton lock을 event와 원자 생성·종료한다. Rules가 event-only/lock-only write와 reopen을 막고 Emulator 동시 시작 2건 중 정확히 1건만 허용함을 검증했다.
- 인증 identity·membership·group·baby 일치 assertion과 cloud event factory를 추가했다. Auth sign-out, identity 변경, server-confirmed membership 제거 시 Auth/membership/event observer 중단→in-flight sync generation 무효화→serialized cache purge→revoked 통지 순서를 구현했다. remote permission 오류는 server-only membership query, Auth 오류는 `reload`와 강제 ID-token refresh로 검증한다. 복구 중 반복 401은 재귀 retry하지 않고, 정상 teardown 뒤에는 유효 identity의 지연 retry를 실행하지 않는다.
- cache 보존용 `close()`와 privacy `clear()`가 경쟁해도 purge가 우선되며 모든 caller가 실제 storage removal을 기다린다. 완료된 close 뒤에는 scoped writer claim을 다시 획득해야만 purge하고, replacement writer가 있으면 삭제하지 않는다. 손상 envelope와 storage read/remove 실패도 명시적으로 surface하고 재시도한다.
- pending/retryable/conflict 상태 banner 계약을 추가했다. 실제 Firebase project/client config와 production Auth provider가 없으므로 기본 `container.ts`는 계속 local preview이며 cloud factory를 아직 화면에 연결하지 않았다.

검증 상태:

- core 25건, mobile Jest 103건, Firestore/Storage Rules 22건, Functions unit 10건, Functions transaction Emulator 5건이 통과했다.
- workspace typecheck/lint, architecture/docs gate, `check:mobile`, `git diff --check`가 통과했다.
- frozen lockfile install과 Android production Metro bundle로 새 workspace package 해석을 확인했다.
- 실제 non-production Firebase project, 두 계정·두 기기 초대/재연결/충돌/purge QA와 AppsInToss target은 아직 미완료다.

## 2026-07-12

- Obsidian `프로젝트/개인/babycare/01 기획서`의 planning approval을 확인하고 repo `docs/`를 실행 source of truth로 승격했다.
- GitHub `origin/main`과 로컬 `main`이 동일한 `bcce524`에서 시작함을 확인했다. 기존 dirty worktree는 사용자/병렬 작업으로 보존했다.
- lifecycle을 `build`, deployment approval을 미승인으로 기록하고 Google Play/App Store/AppsInToss 3마켓 범위를 유지했다.
- Android/iOS 개발 ID를 `com.seorilabs.babycare.dev`로 사용한다. 최종 제품명, production package/bundle ID, AppsInToss `appName`은 `확정 필요`로 유지했다.
- `packages/product-core`에 수유·기저귀·수면 domain/value object, 기록·수면 종료·soft delete·대시보드 use case, Auth/그룹/아기/초대/기록 port와 순수 테스트를 구현했다. 모유 좌·우 시간은 독립 field로 저장하고, 자정을 넘는 수면 집계와 48시간 초과 active sleep 복구를 보강했다.
- active sleep 중복 시작은 현재 한 app process의 기록 요청만 직렬화한다. 서로 다른 기기의 동시 시작을 막는 server-side atomic 경로는 구현·검증하지 않았다.
- `apps/mobile`에 로컬 온보딩, 빠른 기록, 홈, 타임라인, 통계, 시스템 다크모드와 AsyncStorage 개발 adapter를 구현했다. 이는 Firebase 공동 기록 완료가 아닌 로컬 UX 기준선이다.
- RNFirebase 기반 Auth, 그룹·멤버십, 아기, 돌봄 기록 원격 transport, invite callable adapter와 외부 문서 decoder를 추가했다. Firestore write는 server acknowledgement 계약인 `CareEventRemoteStorePort`로 분리해 화면 repository로 직접 구성할 수 없게 했다. 실제 Firebase project/client config, production Auth provider와 durable outbox/coordinator가 없고 `app/container.ts`는 로컬 adapter를 선택하므로 production composition은 아직 연결하지 않았다.
- Firestore/Storage Rules와 indexes에 `isDeleted` query, 모유 좌·우 field, collection-group membership read와 close-only 수면 전이를 반영하고 Emulator 회귀 테스트를 추가했다.
- Node.js 22 Functions workspace에 `createInvite`/`acceptInvite`를 구현했다. raw code 비저장 HMAC lookup, current owner, expiry, single-use transaction, UID rate limit, 7-field membership과 actor audit 테스트를 둔다. 실제 callable deploy, verified Auth, App Check, Secret Manager와 IAM 통합은 남아 있다.
- React Native는 `0.85.3`, React는 `19.2.3`, RNFirebase는 `25.1.0`으로 고정했다. iOS는 static framework와 RNFB pod static-library workaround를 사용하며, Android local build JDK는 21을 기준으로 한다.
- local session/event cache와 Firebase decoder, Functions, Rules의 경계 검증을 강화했다. 실제 달력 날짜·미래 생년월일, document ID, C0/C1·bidi control 표시문자, 단일 baby 참조와 partial snapshot 오류를 안전하게 거부한다.
- 제품 명세, 출시 타깃, 아키텍처, backlog, QA, mobile 실행 문서를 현재 코드와 승인 기획 기준으로 동기화했다.

검증 상태:

- 로컬 AsyncStorage composition으로 iPhone 16 Pro와 작은 화면 iPhone SE(3세대) Simulator에서 온보딩→기록→타임라인→통계→초기화 흐름을 확인했다. 최종 RN `0.85.3`/RNFirebase 빌드도 iPhone 16 Pro light와 iPhone SE(3세대) dark mode에서 첫 화면을 다시 렌더링했다.
- iOS arm64 Simulator clean build와 incremental build가 RNFirebase Auth/Firestore/Functions를 포함해 `BUILD SUCCEEDED`였다. `GoogleService-Info.plist`가 없는 local build는 Firebase configure를 건너뛴다.
- Android는 Temurin JDK 21에서 `:app:assembleDebug`를 통과했다. 연결된 실기기에 development ID APK를 데이터 보존 방식으로 설치하고 process 기동·fatal log 부재를 확인했지만 기기가 잠금 상태여서 화면 visual은 증거로 사용하지 않았다.
- 최종 `pnpm test` 전체 통과: core 25건, mobile Jest 37건, Firestore/Storage Rules 18건, Functions unit 10건, Functions transaction Emulator 5건. workspace typecheck/lint와 architecture/docs gate도 같은 실행에서 통과했다.
- Android release build는 signing credential이 없으면 task 실행 전에 실패하도록 검증했다. `check:release`와 `check:ait`은 승인·확정값/target이 없어 실패하는 것이 정상이다.
- AppsInToss target, 실제 Firebase project의 두 계정·두 기기 검증, cache purge는 수행하지 않았다.

## 2026-06-16 — Upstream template provenance

- Seorilabs 비게임 앱 starter template 초기 구조를 생성했다.
- upstream private template repo `seorilabs/starter-template-app`의 docs-as-source-of-truth, Clean Architecture, 멀티마켓 target과 native launch 정책을 기반으로 했다.
- BabyCare 제품 상태는 위 2026-07-12 기록부터 추적한다.
