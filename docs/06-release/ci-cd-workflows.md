# CI/CD 워크플로우 (org 표준)

이 repo의 마켓 workflow는 주로 org 재사용 워크플로우(`seorilabs/.github`)를 호출하는 얇은 caller다. `nightly.yml`과 `deploy-all.yml`에는 tag 비교·fan-out용 local job도 있다. 전체 설계는 `seorilabs/.github`의 `docs/ci-cd/org-cicd-release-system.md`를 참조한다.

## 워크플로우

| 파일 | 트리거 | 역할 | 러너 |
|---|---|---|---|
| `static-checks.yml` | push/PR→main, dispatch | 정적 게이트(`pnpm run test`) | ARC(private)/ubuntu |
| `build-ait.yml` | dispatch | 업로드 없는 `.ait` 후보 빌드 | ubuntu(x64) |
| `build-android.yml` | dispatch | 업로드 없는 signed AAB 후보 빌드 | ubuntu(x64) |
| `release-tag.yml` | dispatch | 명시적 SemVer 태그 | ARC |
| `deploy-apps-in-toss.yml` | dispatch, call | .ait build + AppsInToss | ARC |
| `deploy-google-play.yml` | dispatch, call | 서명 AAB + Google Play | ubuntu |
| `deploy-app-store.yml` | dispatch, call | Xcode archive + App Store | macos-26 |
| `deploy-all.yml` | dispatch | 태그 1개로 3마켓 한 번에 | — |
| `cleanup-actions-storage.yml` | dispatch | 아티팩트/캐시 정리 | ARC |
| `release-inventory.yml` | dispatch | 릴리즈 준비 점검 | — |
| `nightly.yml` | dispatch, schedule은 주석 상태 | 변경이 있을 때 AIT 테스트 채널 호출 | ARC |

- **main = 정적 게이트만.** 마켓 업로드는 명시적 Release/Tag 후 dispatch(보통 Backoffice/Telegram).
- 아티팩트 retention = 3.

## 현재 실행 Blocker

1. AppsInToss target은 초기화됐지만 로그인·공동 기록 adapter와 sandbox 실기기 QA가 남아 있다.
2. Google Play/App Store 식별자는 `com.seorilabs.babycare`로 확정했다. build-only workflow는 업로드 권한·WIF 없이 artifact만 만든다.
3. `deploy-app-store.yml`의 `ios_scheme`/`ios_workspace`/`ios_bundle_id`는 dispatch 또는 caller 입력이 필요하며 `ios_bundle_id`에는 확정값 `com.seorilabs.babycare`를 전달한다.
4. org workflow가 기대하는 다음 repo-local 표준 스크립트는 아직 없다. release workflow 실행 전에 구현·검증해야 한다.

   - `scripts/resolve-release-version.mjs --tag <tag> --github-output` → `version_name`, `android_version_code`, `apple_marketing_version`, `apple_build_number`, `release_name`
   - `scripts/upload-google-play-internal.py` (Android Publisher API 업로드)
   - `scripts/restore-mobile-firebase-config.mjs --android|--ios --require`
5. Android Gradle wrapper와 version/signing override 계약은 구현됐다. release credential 없는 build는 조기 실패한다. 실제 x64 Linux signed AAB는 signing 준비 뒤 검증한다.
6. secrets/variables와 `apps-in-toss`, `google-play`, `app-store` Environment의 실제 존재·보호 규칙은 아직 release-ready 증거로 확인하지 않았다. 값은 출력하지 않고 필요한 이름만 release 작업에서 검증한다.

## @ref 핀

build-only caller는 검증한 공용 workflow merge SHA에 고정한다. 기존 deploy caller의 `@main` 고정 전환은 별도 release pipeline 정비 범위다.
