#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# shellcheck disable=SC1091
source "$repo_root/build.env"

build_mode="${SEORI_BUILD_MODE:-market-upload}"

fail() {
  echo "$1" >&2
  exit 1
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "필수 빌드 환경변수가 없습니다: $name"
}

reject_env() {
  local name="$1"
  if printenv "$name" >/dev/null 2>&1; then
    fail "$build_mode 모드에서는 환경변수를 허용하지 않습니다: $name"
  fi
}

required_commands=(node pnpm java keytool jarsigner)
for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null 2>&1 || {
    fail "필수 빌드 도구가 없습니다: $command_name"
  }
done

actual_node="$(node --version)"
actual_pnpm="$(pnpm --version)"
actual_java="$(java -version 2>&1 | head -n 1)"
[[ "$actual_node" == "v$NODE_VERSION" ]] || {
  fail "Node 버전 불일치: expected=v$NODE_VERSION actual=$actual_node"
}
[[ "$actual_pnpm" == "$PNPM_VERSION" ]] || {
  fail "pnpm 버전 불일치: expected=$PNPM_VERSION actual=$actual_pnpm"
}
[[ "$actual_java" == *\"$JDK_VERSION.* ]] || {
  fail "JDK 버전 불일치: expected=$JDK_VERSION actual=$actual_java"
}
[[ "${GRADLE_MAX_WORKERS:-}" =~ ^[1-9][0-9]*$ ]] || {
  fail "Gradle worker 수가 올바르지 않습니다: ${GRADLE_MAX_WORKERS:-missing}"
}

firebase_config="$repo_root/apps/mobile/android/app/google-services.json"
key_properties="$repo_root/apps/mobile/android/key.properties"
secret_dir=""

require_clean_credential_files() {
  for local_secret_path in "$firebase_config" "$key_properties"; do
    [[ ! -e "$local_secret_path" ]] || {
      fail "기존 로컬 자격증명 파일을 덮어쓰지 않습니다: $local_secret_path"
    }
  done
}

cleanup() {
  rm -f "$firebase_config" "$key_properties"
  if [[ -n "$secret_dir" ]]; then
    rm -rf "$secret_dir"
  fi
}

write_key_properties() {
  local keystore_file="$1"
  local store_password="$2"
  local key_alias="$3"
  local key_password="$4"
  {
    printf 'storeFile=%s\n' "$keystore_file"
    printf 'storePassword=%s\n' "$store_password"
    printf 'keyAlias=%s\n' "$key_alias"
    printf 'keyPassword=%s\n' "$key_password"
  } > "$key_properties"
  chmod 600 "$key_properties"
}

build_release_bundle() {
  local version_name="$1"
  local version_code="$2"
  "$repo_root/apps/mobile/android/gradlew" \
    -p "$repo_root/apps/mobile/android" \
    --no-daemon \
    --max-workers="$GRADLE_MAX_WORKERS" \
    --console=plain \
    :app:bundleRelease \
    -PversionNameOverride="$version_name" \
    -PversionCodeOverride="$version_code"
}

source_aab="$repo_root/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"

run_build_only() {
  local name
  for name in \
    ANDROID_VERSION_NAME ANDROID_VERSION_CODE \
    FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64 \
    GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64 \
    GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD \
    GOOGLE_PLAY_UPLOAD_KEY_PASSWORD \
    GOOGLE_PLAY_UPLOAD_KEY_ALIAS; do
    reject_env "$name"
  done

  require_env SEORI_SOURCE_SHA
  require_env SEORI_ANDROID_AAB_OUTPUT
  [[ "$SEORI_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
    fail "SEORI_SOURCE_SHA는 40자리 소문자 Git SHA여야 합니다."
  }
  local expected_output="$repo_root/app-release.aab"
  [[ "$SEORI_ANDROID_AAB_OUTPUT" == "$expected_output" ]] || {
    fail "SEORI_ANDROID_AAB_OUTPUT이 중앙 계약 경로와 다릅니다: expected=$expected_output"
  }
  [[ ! -e "$SEORI_ANDROID_AAB_OUTPUT" ]] || {
    fail "build-only 출력 경로가 비어 있지 않습니다: $SEORI_ANDROID_AAB_OUTPUT"
  }

  local staged_store="${pnpm_config_store_dir:-}"
  require_env pnpm_config_store_dir
  [[ -d "$staged_store" ]] || fail "staged pnpm store가 없습니다."
  [[ "$(realpath "$staged_store")" == "$repo_root/.seorilabs-pnpm-store" ]] || {
    fail "staged pnpm store가 중앙 계약 경로와 다릅니다."
  }

  local version_name="0.0.0"
  local version_code
  local release_tag="${SEORI_RELEASE_TAG:-}"
  local release_version_name="${SEORI_RELEASE_VERSION_NAME:-}"
  local release_version_code="${SEORI_RELEASE_VERSION_CODE:-}"
  if [[ -n "$release_tag$release_version_name$release_version_code" ]]; then
    require_env SEORI_RELEASE_TAG
    require_env SEORI_RELEASE_VERSION_NAME
    require_env SEORI_RELEASE_VERSION_CODE
    [[ "$release_tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
      fail "중앙 release tag 형식이 올바르지 않습니다."
    }
    [[ "$release_version_name" == "${release_tag#v}" ]] || {
      fail "중앙 release versionName이 tag와 다릅니다."
    }
    [[ "$release_version_code" =~ ^[1-9][0-9]*$ ]] || {
      fail "중앙 release versionCode는 양의 정수여야 합니다."
    }
    version_name="$release_version_name"
    version_code="$release_version_code"
  else
    version_code="$(node -e 'process.stdout.write(String(Number.parseInt(process.argv[1].slice(0, 7), 16) + 1))' "$SEORI_SOURCE_SHA")"
  fi

  require_clean_credential_files
  secret_dir="$(mktemp -d)"
  trap cleanup EXIT INT TERM
  local source_prefix="${SEORI_SOURCE_SHA:0:12}"
  local ephemeral_alias="seori-build-only-$source_prefix"
  local ephemeral_password="seori-build-only"
  local ephemeral_keystore="$secret_dir/build-only.p12"
  keytool -genkeypair -noprompt \
    -keystore "$ephemeral_keystore" \
    -storetype PKCS12 \
    -storepass "$ephemeral_password" \
    -keypass "$ephemeral_password" \
    -alias "$ephemeral_alias" \
    -dname "CN=Seorilabs Build Only $source_prefix,OU=CI,O=Seorilabs,C=KR" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 2 >/dev/null
  chmod 600 "$ephemeral_keystore"
  write_key_properties \
    "$ephemeral_keystore" \
    "$ephemeral_password" \
    "$ephemeral_alias" \
    "$ephemeral_password"

  # RPI submit 단계가 token을 폐기하기 전에 exact lockfile store를 모두 채운다.
  # Cloud Build에서는 네트워크 보충을 허용하지 않아 누락/변조된 staging을 fail-closed한다.
  pnpm install --frozen-lockfile --offline
  build_release_bundle "$version_name" "$version_code"
  [[ -s "$source_aab" ]] || fail "Gradle 결과 AAB를 찾지 못했습니다: $source_aab"
  install -m 600 "$source_aab" "$SEORI_ANDROID_AAB_OUTPUT"
  jarsigner -verify -strict \
    -keystore "$ephemeral_keystore" \
    -storepass "$ephemeral_password" \
    "$SEORI_ANDROID_AAB_OUTPUT" "$ephemeral_alias" >/dev/null
  echo "Android build-only AAB 생성 완료: bytes=$(wc -c < "$SEORI_ANDROID_AAB_OUTPUT" | tr -d ' ') source=$SEORI_SOURCE_SHA versionName=$version_name versionCode=$version_code"
}

run_market_upload() {
  local name
  for name in \
    SEORI_SOURCE_SHA SEORI_ANDROID_AAB_OUTPUT \
    ANDROID_VERSION_NAME ANDROID_VERSION_CODE; do
    reject_env "$name"
  done
  local required_environment=(
    SEORI_RELEASE_TAG
    SEORI_RELEASE_VERSION_NAME
    SEORI_RELEASE_VERSION_CODE
    FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64
    GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64
    GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD
    GOOGLE_PLAY_UPLOAD_KEY_PASSWORD
    GOOGLE_PLAY_UPLOAD_KEY_ALIAS
  )
  for name in "${required_environment[@]}"; do
    require_env "$name"
  done
  [[ -d "$repo_root/$CLOUD_BUILD_PNPM_STORE" ]] || {
    fail "인증된 Cloud Build pnpm store가 없습니다: $CLOUD_BUILD_PNPM_STORE"
  }

  [[ "$SEORI_RELEASE_TAG" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
    fail "중앙 release tag 형식이 올바르지 않습니다."
  }
  local version_name="$SEORI_RELEASE_VERSION_NAME"
  local version_code="$SEORI_RELEASE_VERSION_CODE"
  [[ "$version_name" == "${SEORI_RELEASE_TAG#v}" ]] || {
    fail "중앙 release versionName이 tag와 다릅니다."
  }
  [[ "$version_code" =~ ^[1-9][0-9]*$ ]] || {
    fail "중앙 release versionCode는 양의 정수여야 합니다."
  }

  require_clean_credential_files
  secret_dir="$(mktemp -d)"
  trap cleanup EXIT INT TERM
  local keystore_file="$secret_dir/babycare-upload.jks"
  node -e "require('node:fs').writeFileSync(process.argv[1], Buffer.from(process.env.FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64, 'base64'))" "$firebase_config"
  node -e "require('node:fs').writeFileSync(process.argv[1], Buffer.from(process.env.GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64, 'base64'))" "$keystore_file"
  chmod 600 "$firebase_config" "$keystore_file"

  node - "$firebase_config" <<'NODE'
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = {
  projectId: 'seorilabs-babycare',
  appId: '1:104011164568:android:253ccbf60349b260c2d9ed',
  packageName: 'com.seorilabs.babycare',
};
const clients = Array.isArray(config.client) ? config.client : [];
const client = clients.find(
  item => item?.client_info?.android_client_info?.package_name === expected.packageName,
);
if (
  config?.project_info?.project_id !== expected.projectId ||
  client?.client_info?.mobilesdk_app_id !== expected.appId
) {
  console.error('Firebase Android 설정의 project/app/package identity가 일치하지 않습니다.');
  process.exit(1);
}
NODE

  local expected_fingerprint="DF0194ACA157C73C66ACBF0954D785B460412B6B632B5270A53BF10BF87CA860"
  local keystore_details
  local actual_fingerprint
  keystore_details="$(
    keytool -list -v \
      -J-Duser.language=en -J-Duser.country=US \
      -keystore "$keystore_file" \
      -storepass "$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD" \
      -alias "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS"
  )"
  actual_fingerprint="$(
    printf '%s\n' "$keystore_details" \
      | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' \
      | head -n 1 \
      | tr -d ':' \
      | tr '[:lower:]' '[:upper:]'
  )"
  [[ "$actual_fingerprint" == "$expected_fingerprint" ]] || {
    fail "BabyCare Google Play 업로드 인증서 fingerprint가 일치하지 않습니다."
  }
  write_key_properties \
    "$keystore_file" \
    "$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD" \
    "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" \
    "$GOOGLE_PLAY_UPLOAD_KEY_PASSWORD"

  pnpm install \
    --frozen-lockfile \
    --store-dir "$repo_root/$CLOUD_BUILD_PNPM_STORE"
  build_release_bundle "$version_name" "$version_code"
  [[ -s "$source_aab" ]] || fail "Gradle 결과 AAB를 찾지 못했습니다: $source_aab"
  local output_aab="$repo_root/$AAB_PATH"
  mkdir -p "$(dirname "$output_aab")"
  install -m 600 "$source_aab" "$output_aab"
  jarsigner -verify -strict \
    -keystore "$keystore_file" \
    -storepass "$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD" \
    "$output_aab" "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" >/dev/null
  echo "Android signed AAB 생성 완료: path=$AAB_PATH bytes=$(wc -c < "$output_aab" | tr -d ' ') versionName=$version_name versionCode=$version_code"
}

case "$build_mode" in
  build-only)
    run_build_only
    ;;
  market-upload)
    run_market_upload
    ;;
  *)
    fail "지원하지 않는 Android build mode입니다: $build_mode"
    ;;
esac
