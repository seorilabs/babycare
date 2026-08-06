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

- [ ] Google Play metadata와 config 확정 — 진행: `play-store/google-play.config.json`(이름·설명·키워드), 개인정보처리방침 게시, 아이콘 512·피처그래픽·phone 스크린샷 생성, signed AAB 1.0.8/1000008 internal `completed` 업로드, Data Safety API 제출 성공 / 남음: Play Console Data Safety 완료 readback·privacy URL·content rating 확정
- [ ] App Store metadata와 config 확정 — 진행: `app-store/app-store.config.json`(이름·subtitle·설명·키워드), 개인정보처리방침, 아이콘 1024·6.9"·13" iPad 실제 스크린샷 각 5컷, signing·ASC 앱 생성, Xcode Cloud 1.0.8/56 `VALID`·`APP_STORE_ELIGIBLE`, build 관계·4+ 등급·카테고리·content rights·review detail·내부 TestFlight 연결 확인 완료 / 남음: App Privacy·availability 콘솔 확정
- [ ] AppsInToss metadata와 config 확정 — 진행: 승인된 이름·카테고리·아이콘·지원 이메일·브랜드 색상, 600×600 logo·1932×828 thumbnail·636×1048 screenshot 5장 exact-size/RGB 검증, v1 광고·인앱 결제·Toss Pay 없음, Terms URL과 root in-app feature 1개 확정 / 남음: 실제 AIT sandbox 화면 screenshot 교체·Console readback
- [x] Firebase rules/indexes/functions와 local test 코드 구현 — `members.userId` collection-group index 운영 `READY` 포함
- [x] platform custom token bridge client와 기존 anonymous UID 보존 회귀 구현
- [x] platform `platform-auth@seorilabs-babycare` SA·resource-level Token Creator·registry sync·API 배포 — 최초 활성화 workflow run `30750253253`, revision `platform-api-00015-xpx`
- [x] live custom token 신규 로그인과 합성 legacy UID 보존 smoke — UID 주입 거부·no-store·Firebase 교환·cleanup 포함
- [x] production 초대 callable Secret Manager·Cloud Run 진입 계약 확인 — Domain Restricted Sharing 환경에서 `createInvite`·`acceptInvite` Invoker IAM check 비활성화, Firebase Auth/owner 검사는 유지
- [ ] 실제 project의 App Check 또는 edge rate limit 확정 — mobile Play Integrity·App Attest·DeviceCheck와 Platform 검증 경계 구현·provider 운영 구성 readback 완료. 새 후보 실기기 token 확인 전 `require_app_check=false`, `ENFORCE_APP_CHECK=false`
- [x] production 계정 삭제 callable과 외부 삭제 경로 — `deleteAccount` ACTIVE·IAM 적용, Platform 삭제 mapping API production 배포, 외부 안내 페이지 live 200, 일회성 owner/member 계정 삭제·정리 live QA 완료
- [ ] 실제 기존 사용자·실기기의 UID·Firestore 소유권 migration smoke
- [ ] Privacy/data safety/review notes 확정 — 진행: **개인정보처리방침 게시·반영 완료**(`https://www.seorilabs.com/privacy/`, App Store ASC + config 반영), 실제 기기 기반 인증과 SDK 의존성 기준으로 Data Safety 답변을 재분류하고 2026-08-07 Android Publisher API 제출 성공 / 남음: Play Console Data Safety 완료 readback·개인정보 URL·연령등급 콘솔 제출, App Privacy 답변

## QA Gate

- [x] Android debug build·실기기 설치·process 기동 smoke
- [x] iOS RNFirebase arm64 Simulator build·light/dark first-screen smoke
- [x] Android 1.0.8 AAB의 제품 브랜드 launcher icon·cold-start splash·온보딩 전환 확인 — 격리 API 36 AVD, `LaunchState: COLD`, template 문구 없음
- [ ] iOS TestFlight cold-start에서 제품 브랜딩 스플래시만 노출되고 React Native/프레임워크 문구가 없음
- [ ] AppsInToss sandbox smoke — 운영 두 계정 API E2E, `main@707df10` 비공개 deployment 업로드, 공식 iOS Sandbox 앱 설치·로그인 화면 실행, 최신 `20260807-3` 본인 test push와 `isTested=true` readback 통과 / 남음: Toss 설치 기기에서 private scheme을 열어 Storage·초대·기록·재실행·네트워크 복귀
- [x] Offline/local-first smoke — Android 1.0.8 upload-signed AAB를 격리 API 36 AVD에 설치해 비행기 모드 기록·강제 종료·재실행 보존, online 복귀 뒤 수동 새로고침과 두 번째 기기 server readback 통과(2026-08-07)
- [x] 서로 다른 계정·기기 2대의 초대·실시간·offline 복귀 — production custom-token 계정 `QAOwnerA`/`QAMemberB`, 격리 Android AVD 2대에서 초대·합류·양방향 기록자 반영·offline 기록 공유 통과. Play Store app-signing 설치본·물리 기기 App Check token은 별도 게이트
- [ ] TestFlight 인증 owner의 초대 코드 발급과 다른 계정 수락 재확인 — 사용자가 iPhone에서 owner 초대 코드 발급 동작을 확인했고 production API의 독립 2계정 발급·수락 E2E도 통과 / 남음: TestFlight 1.0.8 실제 2기기 수락·실시간 동기화
- [x] cross-device active sleep 단일성 — owner 기기에서 시작한 낮잠을 member 기기에서 종료해 단일 `낮잠 · 36초` event와 active lock 해제를 양쪽에서 확인(2026-08-07)
- [x] 로그아웃·멤버 제거·계정 삭제 후 민감 cache purge — member 삭제는 본인 membership·작성 기록만 제거하고 owner 기록 유지, owner 삭제는 그룹 전체 제거, 양쪽 기기 온보딩 복귀 확인. QA Auth·그룹·기록 정리 완료(2026-08-07)
- [ ] Analytics/crash/ad/purchase smoke, 해당 시

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
- [x] Google Play WIF 자동 업로드 복구 — `iam.googleapis.com` 활성화, 공용 publisher SA에 repo-scoped `seorilabs/babycare` principal의 `roles/iam.workloadIdentityUser` 추가·readback. run `31132461743`에서 GitHub OIDC 인증과 `internal → internal` 재배포가 성공했고 API에서 `v1.0.8`/`1000008`, `completed` 확인, 2026-08-07
- [x] Google Play internal 릴리스 활성화·테스터 배포 — `1.0.8`/`1000008`, `status=completed` API readback
- [ ] Google Play production 승격 승인·심사·공개 배포
- [ ] App Store 실제 테스터 설치·실기기 QA와 App Review 제출
- [ ] AppsInToss private build sandbox 실기기 설치·초기 route QA — `intoss-private://babynest?_deploymentId=019fd827-571d-791d-bd50-08f2da35afec`, 검토 요청 전 실제 테스트 최소 1회 필요
- [ ] AppsInToss production release 승인
