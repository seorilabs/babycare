# AppsInToss 등록·릴리스 원장

AppsInToss Console 등록 metadata, 검증된 이미지 자산과 release readback을 둔다.

- `apps-in-toss.config.json`: 승인된 identity와 최신 비공개 deployment
- `assets-manifest.json`: 등록 이미지의 source·크기·배경 규칙
- `assets/`: 600×600 logo, 1932×828 thumbnail
- `screenshots/`: 636×1048 세로 screenshot 5장

이미지는 `registration-assets` 공통 validator와 AppsInToss 전용 validator를 모두 통과해야 한다.
현재 screenshot은 같은 제품의 App Store 캡처를 규격에 맞춘 후보이며, 실제 AIT sandbox UI 캡처로
교체한 뒤 Console에 등록한다.
