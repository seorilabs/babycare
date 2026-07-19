# Release Checklist

## Planning Gate

- [x] Planning approval 완료 — 2026-07-12
- [x] Product spec와 MVP 범위 repo 원장 반영
- [x] Android package name / iOS bundle ID 확정 — `com.seorilabs.babycare`, 2026-07-13
- [ ] AppsInToss `appName` 확정
- [ ] Firebase project strategy 확정

## Architecture Gate

- [x] `pnpm run test:core` — 25건 통과
- [x] `pnpm run check:architecture`
- [x] platform SDK import 없이 `packages/product-core` 경계 구현
- [x] 현재 변경 snapshot의 architecture/core gate 재실행 증거

## Market Gate

- [ ] Google Play metadata와 config 확정 — 진행: `play-store/google-play.config.json`(이름·설명·키워드), 아이콘 512·피처그래픽·phone 스크린샷 생성 완료 / 남음: privacy URL 호스팅, data safety·content rating 콘솔 확정
- [ ] App Store metadata와 config 확정 — 진행: `app-store/app-store.config.json`(이름·subtitle·설명·키워드), 아이콘 1024·6.9" 스크린샷 5컷 생성 완료 / 남음: privacy URL, signing, ASC 앱 생성, App Privacy 콘솔 확정
- [ ] AppsInToss metadata와 config 확정
- [x] Firebase rules/indexes/functions와 local test 코드 구현
- [ ] 실제 project의 Auth/client composition/App Check/Secret Manager/IAM 통합 확정
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

- [ ] Deployment approval 완료
- [ ] Google Play production 또는 testing track 배포 승인
- [ ] App Store TestFlight 또는 App Review 제출 승인
- [ ] AppsInToss production release 승인
