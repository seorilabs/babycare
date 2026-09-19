# Release Checklist

## Planning Gate

- [x] Planning approval 완료 — 2026-07-12
- [x] Product spec와 MVP 범위 repo 원장 반영
- [x] Android package name / iOS bundle ID 확정 — `com.seorilabs.babycare`, 2026-07-13
- [x] AppsInToss `appName` 확정 — Console 승인값 `babynest`, 2026-08-04 readback
- [x] Firebase 전용 production project와 Functions region 확정 — `seorilabs-babycare`, `asia-northeast3`

## Architecture Gate

- [x] `pnpm run test:core` — 40건 통과(2026-07-29)
- [x] `pnpm run check:architecture`
- [x] platform SDK import 없이 `packages/product-core` 경계 구현
- [x] 현재 변경 snapshot의 architecture/core gate 재실행 증거

## Market Gate

- [x] Google Play metadata와 config 재확정 — Analytics·AdMob 기준 Data Safety, 광고·광고 ID, 체온·복약 리스팅과 `약물 및 치료 관리`, 제품별 개인정보처리방침을 저장·readback하고 production 변경사항과 함께 검토에 전송, 2026-08-10
- [x] App Store metadata와 config 확정 — 앱 정보·자산·영문 UI 스크린샷, 전국가 availability, DSA trader, App Privacy 12개 유형·Tracking `No`, 제3자 광고 콘텐츠 권리·광고 연령등급 응답, 비규제 의료기기 선언, 체온·복약 설명·심사 노트와 제품별 개인정보처리방침을 반영·readback하고 App Review 제출, 2026-08-10
- [x] 앱 i18n `ko`/`en` 구현 — 자체 타입 사전, 기기 로케일 자동 판별, Android `values-ko` 런처 이름, iOS `CFBundleLocalizations`. ADR `0005-app-localization-policy.md`. 310건 mobile 테스트·typecheck·lint 통과(2026-08-08)
- [x] i18n 포함 App Store 후보 재빌드 — `v1.0.9` / `fe2b4b1`, Xcode Cloud run `7faf6504-20e4-4064-a5f8-281dba2ce430`, ASC build `95e65693-70a5-42cf-9590-d63e385a9951`(`1.0.9`/`57`, `VALID`, `APP_STORE_ELIGIBLE`), 2026-08-08
- [x] `1.0.9`/build 57을 ASC 버전 레코드·내부 TestFlight 그룹에 연결 — `versionString=1.0.9`, `related build=95e65693`, `internalBuildState=IN_BETA_TESTING` readback, 2026-08-08
- [x] `en-US` 영어 UI 스크린샷 촬영·업로드 — `v1.0.9` Release 시뮬레이터에서 6.9" 5컷·13" iPad 5컷 캡처 후 ASC `APP_IPHONE_67`·`APP_IPAD_PRO_3GEN_129`에 업로드, delivery state 10건 `COMPLETE` readback, 2026-08-08
- [ ] AppsInToss metadata와 config 확정 — 진행: 승인된 이름·카테고리·아이콘·지원 이메일·브랜드 색상, 등록 자산 검증, 통계 상세 리워드 1개·인앱결제/Toss Pay 없음, Terms URL과 root in-app feature 1개 확정, 운영 adGroupId `ENABLED` readback·GitHub environment 등록·로컬 production 번들 주입 검증 완료(2026-08-12) / 남음: Console 광고 답변·업로드·readback
- [x] AppsInToss 로컬 dev 실행 배선 — `granite dev`가 `granite.config.ts`의 esbuild define을 적용하지 않아 dev 번들의 `FIREBASE_WEB_API_KEY`가 비어 첫 화면이 Firebase 연결 오류로 멈추던 문제를 babel 인라인으로 해결했다. CI는 환경변수, 로컬은 gitignore된 `apps/ait/.env`. 치환 규칙은 `apps/ait/babel.config.test.ts`가 고정한다(2026-08-08)
- [x] Firebase rules/indexes/functions와 local test 코드 구현 — `members.userId` collection-group index 운영 `READY` 포함
- [x] platform custom token bridge client와 기존 anonymous UID 보존 회귀 구현
- [x] platform `platform-auth@seorilabs-babycare` SA·resource-level Token Creator·registry sync·API 배포 — 최초 활성화 workflow run `30750253253`, revision `platform-api-00015-xpx`
- [x] live custom token 신규 로그인과 합성 legacy UID 보존 smoke — UID 주입 거부·no-store·Firebase 교환·cleanup 포함
- [x] production 초대 callable Secret Manager·Cloud Run 진입 계약 확인 — Domain Restricted Sharing 환경에서 `createInvite`·`acceptInvite` Invoker IAM check 비활성화, Firebase Auth/owner 검사는 유지
- [x] 실제 project의 App Check 검증 경계 확정 — mobile Play Integrity·App Attest·DeviceCheck provider 운영 구성, Platform registry `require_app_check=true`, production callable `ENFORCE_APP_CHECK=true`, App Check 없는 custom-token 요청 `401 app_check_required` readback. 사용자가 `v1.1.3` 실기기 QA 통과를 보고함, 2026-08-10
- [x] AppsInToss App Check attestation source·unit test — `appLogin` 일회용 코드 → mTLS Toss 검증 → 1시간 Firebase custom token, Platform·Firestore·Functions 전체 요청 header와 Storage 만료 갱신 구현, 2026-08-11
- [ ] AppsInToss App Check 운영 연결 — 진행: mTLS 인증서 app별 catalog·local/BeeStation backup/restore, Secret Manager cert/key version 1, runtime SA self Token Creator, `mintAitAppCheckToken` revision `mintaitappchecktoken-00001-law` ACTIVE·Invoker 계약, 실제 Toss 로그인에서 token mint POST 200과 운영 그룹·owner membership·아기 생성 readback, `main@21a8573` 날짜·키보드 후보 `20260811-7` 업로드·test push / 남음: 이 후보의 토큰 만료 갱신·재실행 Storage 복구·초대·공동 기록·네트워크 복귀 QA
- [x] production 계정 삭제 callable과 외부 삭제 경로 — `deleteAccount` ACTIVE·IAM 적용, Platform 삭제 mapping API production 배포, 외부 안내 페이지 live 200, 일회성 owner/member 계정 삭제·정리 live QA 완료
- [x] GA4·Platform Analytics 운영 연결 — GA4 property `549232169`·3개 stream·BigQuery link, Secret Manager API secret, `logAnalyticsEvents` ACTIVE를 구성했다. 인증 callable `accepted=1`, GA4 Realtime `core_screen_view=1`, Platform registry의 14개 allowlist, ingest `accepted=1`, BigQuery `babycare-launch-smoke-20260809-0803`를 readback했다(2026-08-09)
- 계측 등록 어긋남 — 제품 이벤트 계약(`packages/product-core/src/ports/analytics.ts`)은 21종이고, Platform registry 의 allowlist 14개 중 계약과 겹치는 것은 11종이다(나머지 3개는 계약 밖 레거시 이름). 계약의 나머지 **10종은 등록 대기**이며 서버가 `200 OK` 안에서 조용히 버린다: `bc_boot_failed`, `bc_boot_ready`, `bc_invite_join_attempt`, `bc_invite_join_failed`, `bc_invite_shared`, `bc_medication_history_unconfirmed`, `bc_onboarding_step_back`, `bc_onboarding_step_blocked`, `bc_onboarding_step_view`, `seori_analytics_dropped`. 목록의 원장은 `firebase/platform-event-allowlist.json` 이고 `pnpm run test:firebase-config` 가 계약과 대조한다. 등록 대기가 남아 있는 동안 `pnpm run check:release` 가 blocker 로 보고한다. 등록 자체는 `seorilabs/platform` 의 registry 갱신과 운영 regsync 로만 끝난다
- [x] 최소 광고 운영 연결 — AdMob Android/iOS app·rewarded unit production ID, EU UMP·미국 주 privacy message, privacy options UI를 반영했다. 사용자가 `v1.1.3` Android/iOS 실기기 QA 통과를 보고함. AppsInToss 광고는 이번 Play/App Store 출시 범위 밖
- [x] 실제 기존 사용자·실기기의 UID·Firestore 소유권 migration smoke — 사용자가 현재 `v1.1.3` 실기기 QA 통과를 보고함. 기기 모델·OS와 세부 체크 로그는 제공되지 않음
- [x] Privacy/data safety/review notes 확정 — Google Play Data Safety·광고·광고 ID·건강 기능과 제품별 방침 URL, App Store App Privacy·DSA trader·비규제 의료기기·전국가 availability·ko/en-US 심사 정보를 2026-08-10 readback. 양쪽 심사 제출은 별도 deployment gate

## QA Gate

- [x] Android debug build·실기기 설치·process 기동 smoke
- [x] iOS RNFirebase arm64 Simulator build·light/dark first-screen smoke
- [x] Android 1.0.8 AAB의 제품 브랜드 launcher icon·cold-start splash·온보딩 전환 확인 — 격리 API 36 AVD, `LaunchState: COLD`, template 문구 없음
- [x] iOS TestFlight cold-start 제품 브랜딩 — 사용자가 현재 `v1.1.3` 실기기 QA 통과를 보고함. 기기 모델·OS 상세는 제공되지 않음
- [ ] AppsInToss sandbox smoke — 운영 두 계정 합성 API E2E와 공식 iOS Sandbox 로컬 dev 흐름 통과. `main@21a8573`, `20260811-7`은 `CREATED`, test push, `isTested=true`, `deployed=false`이며 이전 실제 Toss 로그인에서 App Check token mint와 그룹·owner membership·아기 생성까지 확인했다 / 남음: 새 후보의 날짜 달력·키보드 입력·Storage·초대·기록·재실행·토큰 갱신·네트워크 복귀
- [x] Offline/local-first smoke — Android 1.0.8 upload-signed AAB를 격리 API 36 AVD에 설치해 비행기 모드 기록·강제 종료·재실행 보존, online 복귀 뒤 수동 새로고침과 두 번째 기기 server readback 통과(2026-08-07)
- [x] 서로 다른 계정·기기 2대의 초대·실시간·offline 복귀 — production custom-token 계정 `QAOwnerA`/`QAMemberB`, 격리 Android AVD 2대에서 초대·합류·양방향 기록자 반영·offline 기록 공유 통과. Play Store app-signing 설치본·물리 기기 App Check token은 별도 게이트
- [x] TestFlight 인증 owner의 초대 코드 발급과 다른 계정 수락 재확인 — 기존 iPhone owner 발급 확인과 production API 독립 2계정 E2E에 더해 사용자가 현재 `v1.1.3` 실기기 QA 통과를 보고함
- [x] cross-device active sleep 단일성 — owner 기기에서 시작한 낮잠을 member 기기에서 종료해 단일 `낮잠 · 36초` event와 active lock 해제를 양쪽에서 확인(2026-08-07)
- [x] 로그아웃·멤버 제거·계정 삭제 후 민감 cache purge — member 삭제는 본인 membership·작성 기록만 제거하고 owner 기록 유지, owner 삭제는 그룹 전체 제거, 양쪽 기기 온보딩 복귀 확인. QA Auth·그룹·기록 정리 완료(2026-08-07)
- [x] GA4·Platform Analytics 및 Android/iOS 리워드 광고 smoke — 운영 수신 readback과 사용자의 현재 `v1.1.3` 실기기 QA 통과 보고. AppsInToss는 이번 공개 범위 밖이며 별도 gate 유지

## Deployment Gate

- [x] Google Play internal draft와 App Store Connect/TestFlight 빌드 업로드 승인 — 2026-07-29
- [x] Google Play 1.0.1/1000001 internal draft 업로드·API readback
- [x] App Store 1.0.1/1000001 업로드·ASC `VALID`, 내부 그룹 모든 빌드 접근 확인
- [x] Google Play 1.0.2/1000002 internal draft 업로드·API readback — `v1.0.2` / `d11bbfaa3dcea221067d60c43fd888f4c0e93f55`, 2026-08-03
- [x] AppsInToss `v1.0.3` 비공개 빌드 업로드 — source `089eb0c`, workflow run `30909365541`, deployment `019fccc1-8e5b-775f-99a4-ab190d4d1726`, 2026-08-04
- [x] App Store 수정 후보 업로드 — `v1.0.5` / `f972da16f5f2f81468f576b233434a59a5863680`, Xcode Cloud run `137ca847-3c34-4d5b-8931-4f70c5b023d8`, ASC build `5ca352a5-449e-4997-b730-315ead4d02e8`, 실제 `1.0.5`/`52`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`, 2026-08-05
- [x] App Store `v1.0.6` 내부 TestFlight 후보 — source `1d768c265740c91b6e0967ba20ca6ce380cc2def`, Xcode Cloud run `1341ac47-4e2e-438e-9713-739a837fb4f0`, ASC build `fbe23a81-a5b5-4a39-bcae-da15e59e957d`, 실제 `1.0.6`/`54`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`, 내부 그룹 연결·`IN_BETA_TESTING`·테스터 2명 readback, 2026-08-06
- [x] Google Play `v1.0.6` internal draft 업로드 — x64/JDK 21 build run `31061827436`, source `1d768c265740c91b6e0967ba20ca6ce380cc2def`, AAB `1.0.6`/`1000006`, target SDK 36, SHA-256 `4589cc4b5d12646a06a33628dd15d669f8b047488926b79f2eefb5fbb17fe50e`, 승인된 로컬 publisher fallback 업로드·API readback, 2026-08-06
- [x] Google Play `v1.0.8` 내부 테스트 활성 후보 — source `c66f7e763470f041ea8eec79f1a24a9a13352589`, workflow run `31116493641`, AAB `1.0.8`/`1000008`, target SDK 36, SHA-256 `2a0e627480e3f30d1d7feeb886bd30af4492ab6b9b4d60ff755cae2208297c84`, 브랜드 launcher icon·upload certificate 서명 검증, internal `completed` API readback, 2026-08-06
- [x] App Store `v1.0.8` 내부 TestFlight 후보 — source `c66f7e763470f041ea8eec79f1a24a9a13352589`, Xcode Cloud run `a9c4b9b4-7c0e-4592-95ef-22039fa50962`, ASC build `454e15f2-4075-4828-b613-a67085b3e7d4`, 실제 `1.0.8`/`56`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`, 내부 그룹 연결·`IN_BETA_TESTING` readback, 2026-08-06
- [x] AppsInToss 기능 후보 local build·production API E2E — Platform custom-token/Firebase Auth REST, Storage session, Firestore 기록·조회, callable 초대·삭제로 독립 두 계정 공동 기록 및 정리 통과, exact-size 등록 자산 검증, 2026-08-07
- [x] AppsInToss 기능 후보 비공개 업로드 — source `707df10`, workflow run `31123595821`, artifact `8974273502`, deployment `019fd827-571d-791d-bd50-08f2da35afec`, 2026-08-07
- [x] AppsInToss App Check 후보 비공개 업로드·test push — source `2704ff7`, `.ait` SHA-256 `02a268b0dae3ff8f8ae0817e319b78b0c1ec511da7bbc0133c186fc4465e4b26`, `20260811-6`, deployment `019fee32-8415-761c-be38-9c5769aa00b2`, `CREATED`, `isTested=true`, `deployed=false`, 2026-08-11. `20260811-5` / `019fee31-b55a-7bde-907e-cb8125a5d3fe`는 파일 PUT 없는 `PREPARE` 미사용 항목
- [x] AppsInToss 날짜·키보드 수정 후보 비공개 업로드·test push — source `21a8573`, `.ait` SHA-256 `baf0e95078a7156a74c54b2c8b3bb50bfeaf233feb68b54049a7567d7973c495`, 3,153,626 bytes, `20260811-7`, deployment `019ff016-36a2-75bc-a29e-ea987c0bfed4`, `CREATED`, `isTested=true`, `deployed=false`, 2026-08-11
- [x] Google Play WIF 자동 업로드 복구 — `iam.googleapis.com` 활성화, 공용 publisher SA에 repo-scoped `seorilabs/babycare` principal의 `roles/iam.workloadIdentityUser` 추가·readback. run `31132461743`에서 GitHub OIDC 인증과 `internal → internal` 재배포가 성공했고 API에서 `v1.0.8`/`1000008`, `completed` 확인, 2026-08-07
- [x] Google Play internal 릴리스 활성화·테스터 배포 — `1.0.8`/`1000008`, `status=completed` API readback
- [x] Google Play 초기 설정·앱 콘텐츠 — 대시보드 11개 완료, Data Safety 완료, IARC 한국 12세 이상, 타깃 18세 이상, 출산/육아, 건강 기능 `영양 및 체중 관리`·`수면 관리`, 2026-08-07
- [x] 체온·복약 후보의 Google Play Data Safety·건강 기능 `약물 및 치료 관리`·스토어 면책 문구와 Apple Health privacy 답변 재입력·readback — 공개 방침 live 200, Play 건강 기능 저장 재확인, ASC App Privacy published·비규제 의료기기 선언, 2026-08-10
- [x] Google Play `v1.0.9` i18n 후보 internal 업로드 — workflow run `31243326802`, AAB `1.0.9`/`1000009`, Android Publisher API 독립 readback `completed`, 2026-08-08
- [x] Google Play `v1.1.3` 체온·복약 후보 internal 업로드 — source `8ea2ceb`, AAB `1.1.3`/`1001003`, SHA-256 `6861f9c1e72452972e683c6a0fbbd5a5750fc55a37e1ce4f8d14859cce87eedb`, Publisher API `name=1.1.3`, `status=completed`, `versionCodes=['1001003']` 독립 readback. Workflow run `31390061940`의 60초 upload read timeout 뒤 동일 소스 재현 빌드·600초 timeout/3회 재시도로 복구, 2026-08-10
- [x] App Store `v1.1.3` 체온·복약 내부 TestFlight 후보 — source `8ea2ceb`, Xcode Cloud run `0abb7047-2126-44f7-979b-d5388314fabb`, ASC build `f9a718d7-829d-4838-8b61-e5d9a968fe6f`, `1.1.3`/`61`, `VALID`, `APP_STORE_ELIGIBLE`, `usesNonExemptEncryption=false`, 버전 레코드·내부 그룹 연결, `IN_BETA_TESTING`, 테스터 2명 readback, 2026-08-10
- [x] Google Play app-signing 내부 설치본의 로그인·초대·기록·App Check token QA — 사용자가 현재 `v1.1.3` 실기기 QA 통과를 보고함
- [x] Google Play production 승격·심사 제출 — internal `1001003`을 production draft로 재빌드 없이 승격하고 전체 출시·176개 국가/지역·변경사항 12개를 제출. 2026-08-11 00:14 KST Publisher production track은 `completed`지만 제출 ID `1`은 `검토 중`, 한국 공개 listing은 HTTP 404
- [x] Google Play 심사 승인·production 공개·공개 listing `1.1.3` readback — 한국 listing HTTP 200, 제품명·version 확인, 2026-08-21
- [x] 세 마켓 GitHub Actions 통합 배포 `v1.1.10` — Deploy All run `35424137734`, source `0bc9951`, iOS `1.1.10`/`1001010`(App Store Connect 업로드 성공), Google Play internal `1.1.10`/`1001010`, AppsInToss 업로드 성공. App Review 제출·production 승격은 하지 않음, 2026-09-19
- [ ] `v1.1.10` ASC readback — build id, `processingState`, `buildAudienceType`, `internalBuildState`, 테스터 수 확인 후 `app-store.config.json`의 `확정 필요` 대체
- [x] App Store 실제 테스터 설치·실기기 QA와 App Review 제출 — 사용자의 실기기 QA 통과 보고 뒤 review submission `ee65dd96-0297-4a11-b71d-c4bc73e6a39d` 제출. 제출 당시 `WAITING_FOR_REVIEW`, release type `AFTER_APPROVAL`, 2026-08-10
- [x] App Store 심사 승인·자동 공개·listing `1.1.3` readback — Apple public lookup `resultCount=1`, `currentVersionReleaseDate=2026-08-14T05:35:05Z`, 2026-08-21 재확인
- [ ] Google Play·App Store 공개 listing 설치본의 launch·로그인·기록 핵심 흐름 smoke — 심사 전 app-signing/TestFlight QA와 공개 listing readback은 완료했지만 공개 후 설치 QA는 별도 미실행
- [ ] AppsInToss private build sandbox 실기기 설치·초기 route QA — App Check 포함 이전 후보에서 유효 token과 최초 데이터 생성은 확인했다. 날짜 달력·키보드 수정 deployment `019ff016-36a2-75bc-a29e-ea987c0bfed4`를 test push했으며 입력·재실행·초대·공동 기록까지 확인해야 한다
- [ ] AppsInToss production release 승인
