# Google Play

> 등록 준비 원장. 확정값과 초안을 반영. `release-targets.md` deployment approval **미승인** — 준비만, 제출·프로덕션 승격 금지.
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

- Signing key / Play App Signing: `확정 필요` — task #3
- Internal testing track: `확정 필요`
- Production rollout policy: `확정 필요`
- Release notes: `확정 필요`

## Policy

- Data safety: 초안 `docs/05-markets/store-data-disclosure.md` — 콘솔 제출 `확정 필요`
- Ads declaration: 광고 없음(`no`)
- App access instructions: 심사용 데모 계정(owner/member) `확정 필요`
- Target audience/content rating: 성인 양육자용, 아동 대상 아님 / IARC 전체이용가 예상 — 콘솔 설문 `확정 필요`
- Financial/payment features: 없음
- Privacy policy URL: `확정 필요` — 초안 `docs/legal/privacy-policy.md`, 호스팅 후 확정
