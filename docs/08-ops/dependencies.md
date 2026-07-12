# Dependencies

## Package Manager

- pnpm: `11.12.0` (`packageManager`)
- Node in Seorilabs ARC: `24.16.0`
- Root engine: `>=24 <27`

## React Native

2026-07-12 repo-local lock/package 기준:

- `react-native`: `0.85.3`
- `react`: `19.2.3`
- `@react-native-community/cli`: `20.0.2`
- `typescript`: `6.0.3`
- `react-native-safe-area-context`: `5.8.0`

정책:

- BabyCare native target은 초기화되어 있으므로 `apps/mobile/package.json`, `Podfile.lock`, Gradle 설정과 root lockfile이 기준이다.
- RNFirebase `25.1.0`의 iOS static framework 조합 때문에 `Podfile`의 `pre_install`에서 `RNFB*` pod만 static library로 강제하고 RNCore는 공식 prebuilt artifact를 사용한다. upstream 호환성 확인 전 RN/RNFirebase를 독립적으로 올리지 않는다.
- Android local debug build는 Temurin JDK 21을 기준으로 한다. JDK 22에서는 RN/Android Gradle toolchain의 `jlink` 단계 실패를 확인했다.

## AppsInToss

AppsInToss target 생성 전 참고값(실제 target/lockfile 없음):

- `@apps-in-toss/framework`: `2.8.0`
- `@toss/tds-react-native`: `2.0.3`
- `react-native-safe-area-context`: `5.8.0`

정책:

- 신규 AppsInToss 비게임 app은 Granite RN + TDS React Native를 사용한다.
- `apps/ait` 생성 후 `granite.config.ts`와 AppsInToss console 값을 `docs/05-markets/apps-in-toss.md`에 반영한다.
- `.ait` artifact는 기본적으로 커밋하지 않는다.

## Firebase

2026-07-12 repo-local package 기준:

- root test tooling `firebase`: `12.16.0`
- `@react-native-firebase/app`, `auth`, `firestore`, `functions`: `25.1.0`
- Functions `firebase-functions`: `7.2.5`
- Functions `firebase-admin`: `13.10.0`

정책:

- `apps/mobile`은 RNFirebase adapter를 구현했지만 실제 project/client config와 production composition은 아직 연결하지 않았다.
- `apps/ait`은 native Firebase module을 가정하지 않는다. AIT runtime 검증 전에는 server API 또는 constrained adapter로 둔다.
- Firebase가 필요 없는 local-only MVP에는 Firebase 코드를 미리 추가하지 않는다.

## GitHub Actions

중앙 source of truth 확인 기준:

- `actions/checkout@v6`
- `actions/setup-node@v6`
- `actions/setup-java@v5`
- `actions/upload-artifact@v7`

일부 repo caller는 `actions/checkout@v7`을 직접 사용하고 중앙 `global-versions.yaml`은 아직 `@v6`이다. workflow를 다음에 수정할 때 공식 stable release와 중앙 pin을 함께 재확인한다.

## Policy

- SDK 버전은 실제 프로젝트 생성 시 공식 문서와 repo-local lockfile로 확정한다.
- `@latest`나 branch ref보다 확인된 stable major tag를 선호한다.
- Dependabot은 GitHub Actions와 root npm ecosystem을 감시한다.
