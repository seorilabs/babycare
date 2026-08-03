# Google Play

> 등록 준비 원장. 확정값과 초안을 반영. 2026-07-29 승인 범위는 internal draft 빌드 업로드까지이며, 릴리스 활성화·테스터 배포·프로덕션 승격은 미승인.
> 기계 판독 source of truth: `play-store/google-play.config.json`

## App Identity

- **Play Console 앱 생성 + 리스팅 draft 반영 (2026-07-18)** — publisher SA로 ko-KR·en-US 제목·설명, 아이콘 512·피처그래픽·phone 스크린샷 3컷 커밋(리스팅 콘텐츠 검토는 자동 트리거, 앱 게시/출시는 아님 — 릴리스 트랙 없음)
- Package name: `com.seorilabs.babycare` (2026-07-13 확정)
- App name KO(타이틀): `함께봄: 수유, 기저귀, 아기돌봄 기록 어플` (24자, 사용자 확정)
- App name EN(타이틀): `BabyNest: Shared Baby Care Log` (30자)
- Category: `육아(Parenting)` 제안 — 콘솔에서 확정
- Default language: `ko-KR`
- Support email: `cs@seorilabs.com`
- App type / 가격: `앱(비게임)` / `무료`, 광고 없음, 인앱결제 없음

## Store Listing

- Short description KO: `수유·기저귀·수면을 여러 양육자가 실시간으로 함께 기록하는 공동 돌봄 앱` (40/80)
- Full description: `play-store/google-play.config.json`의 `storeListing.fullDescription` (KO 656자 / EN 1254자, 한도 4000 내)
- App icon (512x512): `play-store/assets/icon-512.png` ✅ 생성
- Feature graphic (1024x500): `play-store/assets/feature-graphic-1024x500.png` ✅ 생성
- Native splash screen: 구현됨(제품 브랜딩 launch 화면) — 최종 브랜딩 `확정 필요`
- Phone screenshots (1620x2880, 9:16): 홈/타임라인/통계 3컷 ✅ `play-store/screenshots/phone/`
- Tablet screenshots: 선택(phone-first, 미제공)

## Release

- Signing key / Play App Signing: ✅ 업로드 keystore·서명 완료, signed AAB 업로드로 Play App Signing 등록 확인. GitHub WIF 인증은 성공하지만 Play Console 권한이 없어 workflow run `30776280174`의 업로드가 403으로 실패했고, 기존 승인된 로컬 publisher credential fallback을 사용했다.
- Internal testing track: ✅ `main@d11bbfa`(`v1.0.2`) signed AAB(`1.0.2`/`1000002`, target SDK 36) draft 업로드 및 Android Publisher API readback 완료(2026-08-03) / internal 릴리스 활성화·테스터 배포는 남음
- Production rollout policy: `확정 필요` (승인 후 결정)
- Release notes: `함께봄 브랜드 노출과 기록 화면 안정성을 개선하고, Platform custom token 인증 브리지를 반영했습니다.`

## Policy

- Data safety: 초안 `docs/05-markets/store-data-disclosure.md` — 콘솔 제출 `확정 필요`
- Ads declaration: 광고 없음(`no`)
- App access instructions: 심사용 데모 계정(owner/member) `확정 필요`
- Target audience/content rating: 성인 양육자용, 아동 대상 아님 / IARC 전체이용가 예상 — 콘솔 설문 `확정 필요`
- Financial/payment features: 없음
- Privacy policy URL: `https://www.seorilabs.com/privacy/` ✅ 게시 완료. Play는 API로 안 써지므로 **Play Console '앱 콘텐츠 > 개인정보처리방침'에 수동 입력** 필요
