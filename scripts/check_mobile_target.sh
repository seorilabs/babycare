#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "apps/mobile/README.md"
  "apps/mobile/package.json"
  "apps/mobile/App.tsx"
  "apps/mobile/android/app/src/main/AndroidManifest.xml"
  "apps/mobile/android/app/src/main/res/drawable/launch_screen.xml"
  "apps/mobile/android/app/src/main/res/drawable/babycare_sprout.xml"
  "apps/mobile/android/app/src/main/res/values/styles.xml"
  "apps/mobile/android/app/src/main/res/values-v31/styles.xml"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "Missing mobile target scaffold file: ${file}" >&2
    exit 1
  fi
done

if [ ! -d "apps/mobile/android" ] || [ ! -d "apps/mobile/ios" ]; then
  echo "apps/mobile native projects are not initialized yet."
  echo "Run: pnpm run bootstrap:mobile -- <AppName>"
  exit 1
fi

if ! node -e "const pkg = require('./apps/mobile/package.json'); process.exit(pkg.dependencies?.['react-native'] ? 0 : 1)"; then
  echo "apps/mobile/package.json is not an initialized React Native target package." >&2
  exit 1
fi

mobile_id='com.seorilabs.babycare'
mobile_id_regex="${mobile_id//./\\.}"
brand_name='함께봄'
android_build='apps/mobile/android/app/build.gradle'
android_sources='apps/mobile/android/app/src/main/java/com/seorilabs/babycare'
ios_project='apps/mobile/ios/BabyCare.xcodeproj/project.pbxproj'
android_strings='apps/mobile/android/app/src/main/res/values/strings.xml'
app_json='apps/mobile/app.json'

android_namespace_count="$(rg -c "^[[:space:]]*namespace[[:space:]]+\"${mobile_id_regex}\"[[:space:]]*$" "${android_build}" || true)"
android_namespace_count="${android_namespace_count:-0}"
android_namespace_total="$(rg -c '^[[:space:]]*namespace[[:space:]]+' "${android_build}" || true)"
android_namespace_total="${android_namespace_total:-0}"
android_application_id_count="$(rg -c "^[[:space:]]*applicationId[[:space:]]+\"${mobile_id_regex}\"[[:space:]]*$" "${android_build}" || true)"
android_application_id_count="${android_application_id_count:-0}"
android_application_id_total="$(rg -c '^[[:space:]]*applicationId[[:space:]]+' "${android_build}" || true)"
android_application_id_total="${android_application_id_total:-0}"

if [ "${android_namespace_count}" -ne 1 ] || [ "${android_namespace_total}" -ne 1 ] || \
  [ "${android_application_id_count}" -ne 1 ] || [ "${android_application_id_total}" -ne 1 ]; then
  echo "Android namespace/applicationId must be ${mobile_id}." >&2
  exit 1
fi

for source in \
  "${android_sources}/MainActivity.kt" \
  "${android_sources}/MainApplication.kt"; do
  if [ ! -f "${source}" ] || ! rg -Fqx "package ${mobile_id}" "${source}"; then
    echo "Android Kotlin source ${source} must use package ${mobile_id}." >&2
    exit 1
  fi
done

if [ ! -f "${ios_project}" ]; then
  echo "Missing iOS project file: ${ios_project}." >&2
  exit 1
fi

ios_identifier_count="$(rg -F -c "PRODUCT_BUNDLE_IDENTIFIER = ${mobile_id};" "${ios_project}" || true)"
ios_identifier_count="${ios_identifier_count:-0}"
ios_identifier_total="$(rg -c 'PRODUCT_BUNDLE_IDENTIFIER = ' "${ios_project}" || true)"
ios_identifier_total="${ios_identifier_total:-0}"
if [ "${ios_identifier_count}" -ne 2 ] || [ "${ios_identifier_total}" -ne 2 ]; then
  echo "iOS PRODUCT_BUNDLE_IDENTIFIER must be ${mobile_id}." >&2
  exit 1
fi

if ! BRAND_NAME="${brand_name}" node -e \
  "const app = require('./${app_json}'); process.exit(app.displayName === process.env.BRAND_NAME ? 0 : 1)"; then
  echo "React Native displayName must be ${brand_name}." >&2
  exit 1
fi

if ! rg -Fq "<string name=\"app_name\">${brand_name}</string>" "${android_strings}"; then
  echo "Android launcher name must be ${brand_name}." >&2
  exit 1
fi

launch_storyboard="$(find "apps/mobile/ios" -name "LaunchScreen.storyboard" -type f | sed -n '1p')"
info_plist="$(find "apps/mobile/ios" -name "Info.plist" -type f | sed -n '1p')"

if [ -z "${launch_storyboard}" ]; then
  echo "Missing iOS LaunchScreen.storyboard. Keep an approved native launch surface." >&2
  exit 1
fi

if [ -z "${info_plist}" ] || \
  ! rg -Uq '<key>UILaunchStoryboardName</key>[[:space:]]*<string>LaunchScreen</string>' "${info_plist}"; then
  echo "iOS UILaunchStoryboardName must reference LaunchScreen." >&2
  exit 1
fi

if ! rg -Uq "<key>CFBundleDisplayName</key>[[:space:]]*<string>${brand_name}</string>" "${info_plist}"; then
  echo "iOS launcher name must be ${brand_name}." >&2
  exit 1
fi

default_surface_pattern='Powered by React Native|Welcome to React Native|Welcome to React Native App|Hello World'

if rg -n "${default_surface_pattern}" "${launch_storyboard}" "apps/mobile/App.tsx"; then
  echo "Default framework text remains on a startup surface." >&2
  exit 1
fi

if rg -n 'text="(BabyCare|React Native)([^\"]*)?"' "${launch_storyboard}" || \
  rg -n '>(BabyCare|React Native)([^<]*)?<' "apps/mobile/App.tsx" "apps/mobile/src/screens/MoreScreen.tsx"; then
  echo "A framework default or technical target name remains on a user-visible surface." >&2
  exit 1
fi

if ! rg -Fq "message: \`${brand_name} 돌봄 그룹 초대 코드:" \
  "apps/mobile/src/screens/MoreScreen.tsx"; then
  echo "Invite sharing must use the confirmed ${brand_name} brand." >&2
  exit 1
fi

if ! rg -q 'android:theme="@style/AppTheme"' "apps/mobile/android/app/src/main/AndroidManifest.xml"; then
  echo "Android application must use AppTheme for its launch surface." >&2
  exit 1
fi

if ! rg -q 'android:windowBackground[^<]*@drawable/launch_screen' \
  "apps/mobile/android/app/src/main/res/values/styles.xml"; then
  echo "Android pre-12 AppTheme must reference @drawable/launch_screen." >&2
  exit 1
fi

if ! rg -q '@color/babycare_background' "apps/mobile/android/app/src/main/res/drawable/launch_screen.xml" || \
  ! rg -q '@drawable/babycare_sprout' "apps/mobile/android/app/src/main/res/drawable/launch_screen.xml"; then
  echo "Android pre-12 launch drawable must contain the approved background and launch icon." >&2
  exit 1
fi

if ! rg -q 'android:windowSplashScreenBackground' \
  "apps/mobile/android/app/src/main/res/values-v31/styles.xml" || \
  ! rg -q 'android:windowSplashScreenAnimatedIcon[^<]*@drawable/babycare_sprout' \
  "apps/mobile/android/app/src/main/res/values-v31/styles.xml"; then
  echo "Android 12+ AppTheme must define splash background and icon resources." >&2
  exit 1
fi

echo "Mobile target is initialized."
