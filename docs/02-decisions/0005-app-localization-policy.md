# ADR 0005: App Localization Policy

## Status

Accepted

## Context

App Store Connect와 Google Play 등록정보를 `ko`와 `en-US` 두 로케일로 게시했지만, `apps/mobile` 제품 화면은 한국어 문자열이 하드코딩되어 있었다. 영어 설명을 보고 설치한 사용자가 한국어 전용 UI를 만나는 상태이고, App Store 심사에서 metadata 정확성(2.3.x) 지적 소지가 있었다.

선택지는 두 가지였다. `en-US` 등록정보를 내리고 한국 단독 출시로 좁히거나, 앱을 실제로 이중 언어로 만들거나. 2026-08-08 사용자가 `en-US` 유지를 결정했으므로 앱 i18n을 구현한다.

## Decision

- 지원 로케일은 `ko`와 `en` 두 개다. 스토어 등록정보 로케일과 앱 번들 로케일을 일치시킨다.
- 번역은 의존성 없는 자체 타입 사전으로 관리한다. `apps/mobile/src/app/i18n/strings.ts`의 한국어 객체가 원본 shape이고 `Strings = typeof ko`에서 타입을 파생한다. `en: Strings` 선언이 키 누락을 typecheck 단계에서 실패시킨다.
- i18n 라이브러리(`react-i18next` 등)를 추가하지 않는다. 이 앱 규모에서 런타임 복수형/보간 엔진의 이득보다 타입 검증 상실이 크다.
- 언어는 기기 로케일에서 자동 결정한다. 앱 내 언어 선택 UI는 두지 않는다. 기본값은 `en`이고, 기기 선호 언어 목록에서 primary subtag가 `ko`인 항목을 먼저 만나면 `ko`를 쓴다. 지역(`ko-KR`/`ko-KP`)은 구분하지 않는다.
- `strings`는 `theme`과 동일하게 props로 내려보낸다. 별도 React Context를 만들지 않아 기존 화면 계약과 테스트 방식이 유지된다.
- 날짜·시간은 `strings.intlLocale`(`ko-KR`/`en-US`)을 `Intl.DateTimeFormat`에 전달한다. `'ko-KR'` 하드코딩을 남기지 않는다.
- 조사·복수형처럼 문법이 갈리는 문구는 사전에 함수로 둔다. 예: `more.groupName(babyName)`은 한국어 `${name}이네`, 영어 `${name}'s group`.
- adapter 내부 디코딩·검증 에러 메시지는 번역 대상이 아니다. 화면에 제품 문구로 치환되어 노출되므로 한국어를 유지한다.
- 런처 이름도 로컬라이즈한다. Android는 기본 `values/`가 `BabyNest`, `values-ko/`가 `함께봄`이다. iOS는 `CFBundleLocalizations`에 `ko`, `en`을 선언하고 `ko.lproj`/`en.lproj`의 `InfoPlist.strings`가 `CFBundleDisplayName`을 로케일별로 덮어쓴다. `Info.plist`의 `함께봄`은 development region fallback으로 남긴다.
- `apps/ait`(AppsInToss)은 한국 전용 채널이므로 범위 밖이다.

## Consequences

- 새 사용자 노출 문자열은 `ko`와 `en` 양쪽에 추가해야 하고, 누락 시 typecheck가 실패한다.
- `__tests__/i18n.test.ts` 14건이 로케일 판별·실패 경로·번역 커버리지를 검사한다. 영어 사전에 한글이 남았는지도 런타임으로 확인한다. 함수형 문구도 placeholder 인자로 실행해 템플릿 본문까지 확인한다.
- 화면 컴포넌트는 `strings` prop이 필수다. 테스트는 `createStrings('ko')`를 명시적으로 주입한다.
- `check_mobile_target.sh`가 한국어/영어 브랜드 문구와 `CFBundleLocalizations`를 함께 검증한다.
- **`en-US` 스토어 스크린샷은 영어 UI로 다시 촬영해야 한다.** 기존 5컷은 한국어 UI 캡처다.
- **이 변경이 포함된 새 릴리스 후보가 필요하다.** 현재 App Store 후보 `1.0.8`/`56`은 한국어 전용 빌드다.
- iOS `InfoPlist.strings`는 Xcode 프로젝트에 `PBXVariantGroup`으로 묶여 Resources build phase로 복사된다. `.lproj` 파일만 추가하고 프로젝트에 등록하지 않으면 조용히 fallback 이름으로 되돌아가므로, `check_mobile_target.sh`가 variant group 존재와 `knownRegions`의 `ko`/`en`을 함께 검증한다.
