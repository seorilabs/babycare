#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# shellcheck disable=SC1091
source "$repo_root/build.env"

required_commands=(node pnpm java keytool jarsigner)
for command_name in "${required_commands[@]}"; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "필수 빌드 도구가 없습니다: $command_name" >&2
    exit 1
  }
done

actual_node="$(node --version)"
actual_pnpm="$(pnpm --version)"
actual_java="$(java -version 2>&1 | head -n 1)"
[[ "$actual_node" == "v$NODE_VERSION" ]] || {
  echo "Node 버전 불일치: expected=v$NODE_VERSION actual=$actual_node" >&2
  exit 1
}
[[ "$actual_pnpm" == "$PNPM_VERSION" ]] || {
  echo "pnpm 버전 불일치: expected=$PNPM_VERSION actual=$actual_pnpm" >&2
  exit 1
}
[[ "$actual_java" == *\"$JDK_VERSION.* ]] || {
  echo "JDK 버전 불일치: expected=$JDK_VERSION actual=$actual_java" >&2
  exit 1
}

required_environment=(
  ANDROID_VERSION_NAME
  FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64
  GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64
  GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD
  GOOGLE_PLAY_UPLOAD_KEY_PASSWORD
  GOOGLE_PLAY_UPLOAD_KEY_ALIAS
)
for variable_name in "${required_environment[@]}"; do
  [[ -n "${!variable_name:-}" ]] || {
    echo "필수 빌드 환경변수가 없습니다: $variable_name" >&2
    exit 1
  }
done

version_name="${ANDROID_VERSION_NAME#v}"
version_output="$(node scripts/resolve-release-version.mjs --tag "v$version_name")"
resolved_version_name="$(printf '%s\n' "$version_output" | sed -n 's/^version_name=//p')"
resolved_version_code="$(printf '%s\n' "$version_output" | sed -n 's/^android_version_code=//p')"
[[ "$resolved_version_name" == "$version_name" ]] || {
  echo "Android versionName 해석에 실패했습니다." >&2
  exit 1
}
version_code="${ANDROID_VERSION_CODE:-$resolved_version_code}"
[[ "$version_code" =~ ^[0-9]+$ ]] || {
  echo "Android versionCode는 양의 정수여야 합니다." >&2
  exit 1
}

secret_dir="$(mktemp -d)"
firebase_config="$repo_root/apps/mobile/android/app/google-services.json"
key_properties="$repo_root/apps/mobile/android/key.properties"
keystore_file="$secret_dir/babycare-upload.jks"
for local_secret_path in "$firebase_config" "$key_properties"; do
  [[ ! -e "$local_secret_path" ]] || {
    echo "기존 로컬 자격증명 파일을 덮어쓰지 않습니다: $local_secret_path" >&2
    rm -rf "$secret_dir"
    exit 1
  }
done
cleanup() {
  rm -f "$firebase_config" "$key_properties"
  rm -rf "$secret_dir"
}
trap cleanup EXIT

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

expected_fingerprint="DF0194ACA157C73C66ACBF0954D785B460412B6B632B5270A53BF10BF87CA860"
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
  echo "BabyCare Google Play 업로드 인증서 fingerprint가 일치하지 않습니다." >&2
  exit 1
}

cat >"$key_properties" <<EOF
storeFile=$keystore_file
storePassword=$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD
keyAlias=$GOOGLE_PLAY_UPLOAD_KEY_ALIAS
keyPassword=$GOOGLE_PLAY_UPLOAD_KEY_PASSWORD
EOF
chmod 600 "$key_properties"

pnpm install --frozen-lockfile
"$repo_root/apps/mobile/android/gradlew" \
  -p "$repo_root/apps/mobile/android" \
  --console=plain \
  :app:bundleRelease \
  -PversionNameOverride="$version_name" \
  -PversionCodeOverride="$version_code"

source_aab="$repo_root/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"
[[ -f "$source_aab" ]] || {
  echo "Gradle 결과 AAB를 찾지 못했습니다: $source_aab" >&2
  exit 1
}

output_aab="$repo_root/$AAB_PATH"
mkdir -p "$(dirname "$output_aab")"
cp "$source_aab" "$output_aab"
jarsigner -verify -strict \
  -keystore "$keystore_file" \
  -storepass "$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD" \
  "$output_aab" "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" >/dev/null

artifact_bytes="$(wc -c <"$output_aab" | tr -d ' ')"
echo "Android signed AAB 생성 완료: path=$AAB_PATH bytes=$artifact_bytes versionName=$version_name versionCode=$version_code"
