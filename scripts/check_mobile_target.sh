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

default_surface_pattern='Powered by React Native|Welcome to React Native|Welcome to React Native App|Hello World'

if rg -n "${default_surface_pattern}" "${launch_storyboard}" "apps/mobile/App.tsx"; then
  echo "Default framework text remains on a startup surface." >&2
  exit 1
fi

if rg -n 'text="(BabyCare|React Native)([^\"]*)?"' "${launch_storyboard}" || \
  rg -n '>(BabyCare|React Native)([^<]*)?<' "apps/mobile/App.tsx" "apps/mobile/src/screens/MoreScreen.tsx"; then
  echo "A framework default or unconfirmed product name remains on a user-visible surface." >&2
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
