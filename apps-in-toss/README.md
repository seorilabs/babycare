# AppsInToss 등록·릴리스 원장

AppsInToss Console 등록 metadata, 검증된 이미지 자산과 release readback을 둔다.

- `apps-in-toss.config.json`: 승인된 identity와 최신 비공개 deployment
- `assets-manifest.json`: 등록 이미지의 source·크기·배경 규칙
- `assets/`: 600×600 logo, 1932×828 thumbnail
- `screenshots/`: 636×1048 세로 screenshot 5장

이미지는 `registration-assets` 공통 validator와 AppsInToss 전용 validator를 모두 통과해야 한다.
screenshot 5장은 AppsInToss sandbox에서 실행한 실제 미니앱 화면 캡처다(2026-08-08).
크기·구성은 `node scripts/check-store-screenshots.mjs`가 저장소에서 검사한다.

## sandbox에서 미니앱 실행하기

Console 로그인 없이 로컬 dev server 번들로 실행할 수 있다.

```bash
echo "FIREBASE_WEB_API_KEY=<값>" > apps/ait/.env   # gitignore 대상
pnpm --dir apps/ait dev                            # 포트 8081 고정
xcrun simctl launch <UDID> com.vivarepublica.ent.cash.test
xcrun simctl openurl <UDID> "intoss-sandbox://babynest"
```

- 포트를 바꾸면 샌드박스가 "로컬서버를 찾을 수 없습니다"를 띄운다.
- 샌드박스 앱이 이미 떠 있어야 한다. cold start로 열면 Console 로그인 화면으로 떨어진다.
- iOS 확인 다이얼로그에서 `열기`를 눌러야 미니앱이 로드된다.
