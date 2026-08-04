# GitHub Actions

## Workflows

| 파일 / 표시 이름 | 트리거 | 현재 역할 |
| --- | --- | --- |
| `static-checks.yml` / `Static Checks` | PR·push→`main`, dispatch | org RN static workflow로 `test:static`, 별도 Java 21 job으로 Firebase Emulator |
| `build-ait.yml` / `Build Mini-app Candidate` | dispatch | 마켓 업로드 없는 `.ait` artifact |
| `build-android.yml` / `Build Android Candidate` | dispatch | Play 업로드 없는 signed AAB artifact |
| `release-inventory.yml` / `Release Inventory` | dispatch | `check_release_readiness.sh`; placeholder가 남아 있어 현재 실패가 정상 |
| `release-tag.yml` / `Release Tag` | dispatch | 명시적 SemVer tag |
| `deploy-apps-in-toss.yml` / `Deploy AppsInToss` | dispatch/call | AIT build·배포 caller; 별도 deployment approval 필요 |
| `deploy-google-play.yml` / `Deploy Google Play` | dispatch/call | x64 Linux AAB·선택 upload caller; signing/config 미구성 |
| `deploy-app-store.yml` / `Deploy App Store` | dispatch/call | macOS archive·선택 upload caller; production 입력 미구성 |
| `deploy-all.yml` / `Deploy All` | dispatch | tag 기준 마켓 fan-out |
| `nightly.yml` / `Nightly` | dispatch, schedule 주석 | 새 commit이 있을 때 AIT test build |
| `cleanup-actions-storage.yml` / `Cleanup Actions Storage` | dispatch | Actions artifact/cache 정리 |

## Runner Routing

- 현재 `seorilabs/babycare`는 private repo다. caller는 public/private 양쪽을 고려해 `github.event.repository.private` 조건을 둔다.
- private repo의 JS/TS/docs/AIT candidate는 `seorilabs-rpi-arm64`를 우선 사용한다.
- Firebase Emulator job도 private repo에서는 `seorilabs-rpi-arm64`를 사용하되 runner image의 Java를 가정하지 않고 `actions/setup-java@v5`로 Temurin 21을 준비한다.
- public repo 또는 public PR path에서는 `ubuntu-latest` fallback을 사용한다.
- Android release build는 RPI ARC로 보내지 않고 `ubuntu-latest` x64 Linux runner를 사용한다.
- App Store/Xcode build는 RPI ARC로 보내지 않고 `macos-latest` runner를 사용한다.

## Central Source

수정 전 확인:

```bash
cat /Users/syous/Workspace/kubectl/github-actions-runners/global-versions.yaml
```

2026-07-12 중앙 파일과 cluster live state 확인값:

- `seorilabs-rpi-arm64`: `minRunners: 2`, `maxRunners: 4`
- `seorilabs-rpi-arm64-dind`: `minRunners: 0`, `maxRunners: 1`
- Node: `24.16.0`

수치는 운영 중 바뀔 수 있으므로 workflow 수정 전 중앙 파일을 다시 확인한다.

## Runner Group Membership

2026-07-12 확인:

- Repo: `seorilabs/babycare`
- Visibility: private
- Runner group: `RPI ARM64 Builders`
- Runner group ID: `3`
- Runner group visibility: `all`
- Repo ID: `1298244321`

`Static Checks`의 `main` push run `29191886926`은 commit `bcce524`에서 성공했다. 이 결과는 현재 feature branch 변경의 검증 결과가 아니므로 PR head의 새 run을 별도로 확인한다.
