# Release Checklist

## Planning Gate

- [x] Planning approval 완료 — 2026-07-12
- [x] Product spec와 MVP 범위 repo 원장 반영
- [x] Android package name / iOS bundle ID 확정 — `com.seorilabs.babycare`, 2026-07-13
- [ ] AppsInToss `appName` 확정
- [ ] Firebase project strategy 확정

## Architecture Gate

- [x] `pnpm run test:core` — 40건 통과(2026-07-29)
- [x] `pnpm run check:architecture`
- [x] platform SDK import 없이 `packages/product-core` 경계 구현
- [x] 현재 변경 snapshot의 architecture/core gate 재실행 증거

## Market Gate

- [ ] Google Play metadata와 config 확정 — 진행: `play-store/google-play.config.json`(이름·설명·키워드), 개인정보처리방침 게시, 아이콘 512·피처그래픽·phone 스크린샷 생성, signed AAB 1.0.2/1000002 internal draft 업로드 완료 / 남음: Play Console privacy URL·data safety·content rating 확정
- [ ] App Store metadata와 config 확정 — 진행: `app-store/app-store.config.json`(이름·subtitle·설명·키워드), 개인정보처리방침, 아이콘 1024·6.9" 스크린샷 5컷, signing·ASC 앱 생성, 1.0.1/1000001 `VALID` 완료 / 1.0.2 archive는 암호화 선언 누락으로 미업로드 / 남음: 선언 수정과 새 후보, App Privacy 콘솔 확정
- [ ] AppsInToss metadata와 config 확정
- [x] Firebase rules/indexes/functions와 local test 코드 구현
- [x] platform custom token bridge client와 기존 anonymous UID 보존 회귀 구현
- [x] platform `platform-auth@seorilabs-babycare` SA·resource-level Token Creator·registry sync·API 배포 — 최초 활성화 workflow run `30750253253`, revision `platform-api-00015-xpx`
- [x] live custom token 신규 로그인과 합성 legacy UID 보존 smoke — UID 주입 거부·no-store·Firebase 교환·cleanup 포함
- [ ] 실제 project의 App Check 또는 edge rate limit, Secret Manager/IAM 통합 확정
- [ ] 실제 기존 사용자·실기기의 UID·Firestore 소유권 migration smoke
- [ ] Privacy/data safety/review notes 확정 — 진행: **개인정보처리방침 게시·반영 완료**(`https://www.seorilabs.com/privacy/`, App Store ASC + config 반영), review notes·store-data-disclosure 작성 / 남음: Play Console '앱 콘텐츠' 개인정보 URL 수동 입력·Data safety·연령등급 콘솔 제출, App Privacy 답변

## QA Gate

- [x] Android debug build·실기기 설치·process 기동 smoke
- [x] iOS RNFirebase arm64 Simulator build·light/dark first-screen smoke
- [ ] Android/iOS cold-start에서 제품 브랜딩 스플래시만 노출됨
- [ ] React Native/프레임워크 기본 런치 화면 문구가 노출되지 않음
- [ ] AppsInToss sandbox smoke
- [ ] Offline/local-first smoke
- [ ] 서로 다른 계정·기기 2대의 초대·실시간·offline 복귀
- [ ] cross-device active sleep 단일성
- [ ] 로그아웃·멤버 제거·계정 삭제 후 민감 cache purge
- [ ] Analytics/crash/ad/purchase smoke, 해당 시

## Deployment Gate

- [x] Google Play internal draft와 App Store Connect/TestFlight 빌드 업로드 승인 — 2026-07-29
- [x] Google Play 1.0.1/1000001 internal draft 업로드·API readback
- [x] App Store 1.0.1/1000001 업로드·ASC `VALID`, 내부 그룹 모든 빌드 접근 확인
- [x] Google Play 1.0.2/1000002 internal draft 업로드·API readback — `v1.0.2` / `d11bbfaa3dcea221067d60c43fd888f4c0e93f55`, 2026-08-03
- [ ] App Store 1.0.2/1000002 업로드 — device archive는 생성했으나 최종 `Info.plist`에 `ITSAppUsesNonExemptEncryption`이 없고 strict codesign이 `CSSMERR_TP_NOT_TRUSTED`로 실패해 업로드 중단. 수정 커밋과 유효 서명 경로의 새 후보 필요
- [ ] Google Play internal 릴리스 활성화·테스터 배포 또는 production 승격 승인
- [ ] App Store 실제 테스터 설치·실기기 QA 또는 App Review 제출 승인
- [ ] AppsInToss production release 승인
