# Google Play

> 등록 준비 원장. 2026-08-07 Play Console 초기 설정 11개와 앱 콘텐츠를 완료·readback했다. Play Store app-signing 설치본 QA 뒤 production 후보를 구성한다.
> 기계 판독 source of truth: `play-store/google-play.config.json`

## App Identity

- **Play Console 앱 생성 + 리스팅 draft 반영 (2026-07-18)** — publisher SA로 ko-KR·en-US 제목·설명, 아이콘 512·피처그래픽·phone 스크린샷 3컷 커밋(리스팅 콘텐츠 검토는 자동 트리거, 앱 게시/출시는 아님 — 릴리스 트랙 없음)
- **Localization (2026-08-08)** — 앱이 `ko`/`en` 이중 언어가 됐다(ADR `0005-app-localization-policy.md`). 런처 이름은 `values/`가 `BabyNest`, `values-ko/`가 `함께봄`이다. en-US 리스팅 스크린샷은 한국어 UI 캡처이므로 영어 UI로 교체 검토가 필요하다 — `확정 필요`
- Package name: `com.seorilabs.babycare` (2026-07-13 확정)
- App name KO(타이틀): `함께봄: 수유, 기저귀, 아기돌봄 기록 어플` (24자, 사용자 확정)
- App name EN(타이틀): `BabyNest: Shared Baby Care Log` (30자)
- Category: `출산/육아` ✅ Console 확정
- Default language: `ko-KR`
- Support email: `cs@seorilabs.com`
- App type / 가격: `앱(비게임)` / `무료`, 광고 없음, 인앱결제 없음

## Store Listing

- Short description KO: `수유·기저귀·수면을 여러 양육자가 실시간으로 함께 기록하는 공동 돌봄 앱` (40/80)
- Full description: `play-store/google-play.config.json`의 `storeListing.fullDescription` (KO 656자 / EN 1254자, 한도 4000 내)
- App icon (512x512): `play-store/assets/icon-512.png` ✅ 생성
- Android launcher icon: 제품 브랜드 legacy/adaptive icon ✅ `1.0.8` Release AAB에 포함 확인
- Feature graphic (1024x500): `play-store/assets/feature-graphic-1024x500.png` ✅ 생성
- Native splash screen: `함께봄` 제품 브랜딩 launch 화면 구현됨 — 실제 store 설치본 cold-start 사람 QA 남음
- Phone screenshots (1620x2880, 9:16): 홈/타임라인/통계 3컷 ✅ `play-store/screenshots/phone/`
- Tablet screenshots: 선택(phone-first, 미제공)

## Release

- Signing key / Play App Signing: ✅ 업로드 keystore·서명 완료, signed AAB 업로드로 Play App Signing 등록 확인. 2026-08-07 `seorilabs-gws`의 IAM API를 활성화하고 공용 publisher `seorilabs-play-publisher@seorilabs-gws.iam.gserviceaccount.com`에 repo-scoped `seorilabs/babycare` principal의 `roles/iam.workloadIdentityUser`를 추가·readback했다. GitHub Actions run `31132461743`의 OIDC 인증과 Android Publisher commit이 성공해 기존 `iam.serviceAccounts.getAccessToken` blocker가 해소됐다. 새 SA·정적 키는 만들지 않았다.
- Internal testing track: ✅ `v1.0.8` / `c66f7e7` signed AAB(`1.0.8`/`1000008`, target SDK 36, SHA-256 `2a0e627480e3f30d1d7feeb886bd30af4492ab6b9b4d60ff755cae2208297c84`)를 x64/JDK 21 build run `31116493641`에서 생성했다. package·version·target SDK·upload certificate 서명·브랜드 launcher icon을 검증한 뒤 internal `completed` 업로드를 마쳤다. WIF 복구 뒤 run `31132461743`에서 AAB 재업로드 없이 `internal → internal`로 동일 versionCode를 재적용했고 API에서 `v1.0.8`/`1000008`, 한국어·영어 출시노트, `completed`를 readback했다(2026-08-07).
- Device candidate QA: 같은 AAB에서 생성한 upload-signed 기기별 APK를 격리 API 36 AVD에 설치해 `1.0.8`/`1000008`, 함께봄 adaptive icon·label, 잎사귀 splash→온보딩 cold start, no-crash를 확인했다(2026-08-07). Play Store app-signing 설치본 token QA는 별도다.
- Play App Signing/App Check: Play가 운영하는 app signing SHA-256 `7D:B2:8B:B6:FA:A6:65:16:B8:28:25:A2:7C:F2:C5:E5:E6:1F:B9:3E:0A:FC:7E:9B:97:3C:E9:69:14:4B:EE:07`을 Firebase Android 앱에 등록했고 Play Integrity API를 활성화했다. sideload 허용과 debug SHA는 QA 뒤 제거했으며, 실제 Play Store 설치본 token 확인 전 enforcement는 false다.
- Production rollout policy: 심사 승인 뒤 staged rollout로 시작하고 crash/ANR·핵심 흐름을 확인해 100% 승격. 최초 비율·간격은 production 승격 시 운영자가 확정
- Release notes: `서비스 안정성과 앱 사용 성능을 개선했습니다.`

## Policy

- Data safety: ✅ `play-store/data-safety-responses.json` 원장 기준 Android Publisher API 제출 후 Play Console 완료 상태 readback. 이름·사용자 ID·생년월일·사용자 제작 콘텐츠·건강 정보·기기 ID를 수집, 공유 없음으로 신고
- Ads declaration: 광고 없음(`no`)
- App access instructions: 제한된 로그인 없음. 앱이 기기 기반 계정을 자동 생성하며, 첫 기기에서 그룹 생성 후 초대 코드로 두 번째 기기가 합류함. 데모 계정 불필요
- Target audience/content rating: ✅ 만 18세 이상, 아동 대상 아님 / IARC 한국 `12세 이상`(초대된 친구 사이의 비공개 사용자 상호작용)
- Health declaration: ✅ `영양 및 체중 관리`, `수면 관리`; 지역별 추가 요구사항 없음. 의료 진단·처방 기능은 없음
- Financial/payment features: 없음
- Advertising ID / government app: 광고 ID 사용 안 함 / 정부 앱 아님
- Privacy policy URL: `https://www.seorilabs.com/privacy/` ✅ 게시·Play Console readback
- Account deletion URL: `https://www.seorilabs.com/apps/babycare/account-deletion/` ✅ live 200·Play Console readback
- Review submission: 앱 콘텐츠 변경은 게시 개요에 대기 중. 최초 production release 후보가 없어 `검토를 위해 앱 전송` 비활성. Play Store 설치본 QA 뒤 production 후보를 구성하고 함께 제출
