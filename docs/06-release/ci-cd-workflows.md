# CI/CD 워크플로우 (org 표준)

이 repo의 마켓 workflow는 org 표준을 따른다. 정적 검사와 orchestration은 ARC를 쓰고,
Android release build만 GitHub Actions의 RPI caller가 `seorilabs-ci` Cloud Build x64 빌더로
위임한다. `nightly.yml`과 `deploy-all.yml`에는 tag 비교·fan-out용 local job도 있다.

## 워크플로우

| 파일 | 트리거 | 역할 | 러너 |
|---|---|---|---|
| `static-checks.yml` | push/PR→main, dispatch | 정적 게이트(`pnpm run test`) | ARC(private)/ubuntu |
| `build-ait.yml` | dispatch | 업로드 없는 `.ait` 후보 빌드 | ubuntu(x64) |
| `build-android.yml` | dispatch | 업로드 없는 signed AAB 후보 빌드 | ARC caller → Cloud Build x64 |
| `release-tag.yml` | dispatch | 명시적 SemVer 태그 | ARC |
| `deploy-apps-in-toss.yml` | dispatch, call | `.ait` build + AppsInToss 비공개 업로드 | ubuntu(x64) |
| `deploy-google-play.yml` | dispatch, call | Cloud Build 서명 AAB + 선택적 Google Play 업로드 | ARC caller → Cloud Build x64 |
| `deploy-app-store.yml` | dispatch, call | Xcode archive + App Store | macos-26 |
| `deploy-all.yml` | dispatch | 태그 1개로 3마켓 한 번에 | — |
| `cleanup-actions-storage.yml` | dispatch | 아티팩트/캐시 정리 | ARC |
| `release-inventory.yml` | dispatch | 릴리즈 준비 점검 | — |
| `nightly.yml` | dispatch, schedule은 주석 상태 | 변경이 있을 때 AIT 테스트 채널 호출 | ARC preflight + ubuntu(x64) 업로드 |

- **main = 정적 게이트만.** 마켓 업로드는 명시적 Release/Tag 후 dispatch(보통 Backoffice/Telegram).
- 아티팩트 retention = 3.

## 현재 실행 Blocker

1. AppsInToss target은 초기화됐지만 로그인·공동 기록 adapter와 sandbox 실기기 QA가 남아 있다.
2. Google Play/App Store 식별자는 `com.seorilabs.babycare`로 확정했다. build-only workflow도
   Cloud Build submit용 WIF가 필요하지만 Google Play 업로드는 `upload=false`로 분리한다.
3. `deploy-app-store.yml`의 `ios_scheme`/`ios_workspace`/`ios_bundle_id`는 dispatch 또는 caller 입력이 필요하며 `ios_bundle_id`에는 확정값 `com.seorilabs.babycare`를 전달한다.
4. repo-local 버전 resolver, Google Play 업로더, Firebase config 복원 스크립트와 Android
   Gradle version/signing override 계약은 구현돼 있다. Cloud Build는 `build.env`,
   `cloudbuild-android.yaml`, `scripts/build-android.sh`를 단일 계약으로 사용한다.
5. Android release 비밀값은 로컬 자격증명 catalog가 원본이며, Cloud Build에는
   `babycare-*` Secret Manager 실행 복제본만 제공한다. 빌드 스크립트는 Firebase identity,
   upload alias와 공개 인증서 fingerprint를 검증하고 값이 빠지거나 다르면 조기 실패한다.

## Workflow 핀과 AppsInToss 러너

AppsInToss build-only caller는 검증한 공용 workflow merge SHA에 고정한다. AppsInToss 업로드는
Granite Linux Hermes compiler의 x86-64 제약 때문에 repo-local `ubuntu-latest` job에서
`babynest.ait`를 다시 빌드한 뒤 `ait deploy --location`으로 업로드한다.
