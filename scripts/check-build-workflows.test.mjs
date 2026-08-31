import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return readFile(path, 'utf8');
}

async function json(path) {
  return JSON.parse(await read(path));
}

test('AppsInToss target matches the approved Console identity', async () => {
  const [pkg, config, appRoot, registration] = await Promise.all([
    json('apps/ait/package.json'),
    read('apps/ait/granite.config.ts'),
    read('apps/ait/src/_app.tsx'),
    json('apps-in-toss/apps-in-toss.config.json'),
  ]);

  assert.equal(pkg.name, '@babycare/ait');
  assert.equal(pkg.scripts.build, 'ait build');
  assert.match(pkg.dependencies['@apps-in-toss/framework'], /^2\./);
  assert.ok(pkg.dependencies['@toss/tds-react-native']);
  assert.equal(pkg.dependencies['react-native'], '0.84.0');
  assert.match(config, /appName: 'babynest'/);
  assert.match(config, /displayName: '함께봄: 아기돌봄 기록'/);
  assert.match(config, /primaryColor: '#5FB49C'/);
  assert.match(appRoot, /TDSProvider/);
  assert.equal(registration.appName, 'babynest');
});

test('latest AppsInToss private upload evidence stays consistent', async () => {
  const [registration, market, checklist, workLog] = await Promise.all([
    json('apps-in-toss/apps-in-toss.config.json'),
    read('docs/05-markets/apps-in-toss.md'),
    read('docs/06-release/release-checklist.md'),
    read('docs/04-work/work-log.md'),
  ]);
  const upload = registration.release.latestPrivateUpload;

  assert.deepEqual(upload, {
    ref: 'main',
    sourceSha: '21a857312fe4d5b64fb80bf3fdf8e0b638217b9a',
    buildMethod: 'local-main-worktree',
    artifactSha256:
      'baf0e95078a7156a74c54b2c8b3bb50bfeaf233feb68b54049a7567d7973c495',
    artifactBytes: 3153626,
    versionName: '20260811-7',
    deploymentId: '019ff016-36a2-75bc-a29e-ea987c0bfed4',
    status: 'created',
    isTested: true,
    deployed: false,
    uploadedAt: '2026-08-11T18:11:17+09:00',
  });
  assert.equal(
    registration.release.sandboxQa,
    'latest-bundle-test-push-succeeded: runtime-qa-pending',
  );

  for (const document of [market, checklist, workLog]) {
    assert.match(document, /21a8573/);
    assert.match(document, /20260811-7/);
    assert.match(document, /019ff016-36a2-75bc-a29e-ea987c0bfed4/);
  }
  assert.match(market, /isTested=true/);
  assert.match(checklist, /isTested=true/);
  assert.match(workLog, /isTested=true/);
  assert.match(
    market,
    /intoss-private:\/\/babynest\?_deploymentId=019ff016-36a2-75bc-a29e-ea987c0bfed4/,
  );

  assert.match(checklist, /- \[ \] AppsInToss private build sandbox/);
  assert.match(checklist, /- \[ \] AppsInToss production release 승인/);
});

test('AIT build workflow creates only a candidate artifact', async () => {
  const workflow = await read('.github/workflows/build-ait.yml');

  assert.match(workflow, /^name: Build Mini-app Candidate$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*?release_tag:/);
  assert.match(workflow, /packages: read/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /registry-url: https:\/\/npm\.pkg\.github\.com/);
  assert.match(workflow, /scope: '@seorilabs'/);
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm --dir apps\/ait build/);
  assert.match(workflow, /path: apps\/ait\/babynest\.ait/);
  assert.doesNotMatch(workflow, /APPS_IN_TOSS_API_KEY|ait deploy|run deploy/i);
});

// dev(Metro/babel)와 배포(esbuild define)는 키 주입 경로가 다르다. 한쪽만 바뀌면
// 로컬에서만 되거나 배포 번들만 되는 상태가 조용히 생기므로 두 경로를 함께 고정한다.
test('AppsInToss build and dev paths both inject the Firebase web API key', async () => {
  const [graniteConfig, babelConfig, workflow] = await Promise.all([
    read('apps/ait/granite.config.ts'),
    read('apps/ait/babel.config.js'),
    read('.github/workflows/deploy-apps-in-toss.yml'),
  ]);

  // 배포: esbuild define이 환경변수를 번들에 넣는다.
  assert.match(graniteConfig, /'process\.env\.FIREBASE_WEB_API_KEY': JSON\.stringify\(/);
  assert.match(graniteConfig, /process\.env\.FIREBASE_WEB_API_KEY \?\? ''/);

  // dev: granite dev는 위 define을 적용하지 않으므로 babel이 같은 키를 인라인한다.
  assert.match(babelConfig, /INLINED_ENV_KEYS = \['FIREBASE_WEB_API_KEY'\]/);
  // 환경변수 우선이어야 CI 동작이 로컬 .env에 영향받지 않는다.
  assert.match(babelConfig, /process\.env\[key\] \?\? dotenv\[key\]/);

  // CI는 secret으로 주입하고 값이 없으면 build 전에 실패한다.
  assert.match(workflow, /FIREBASE_WEB_API_KEY: \$\{\{ secrets\.FIREBASE_WEB_API_KEY \}\}/);
  assert.match(workflow, /\[ -n "\$FIREBASE_WEB_API_KEY" \] \|\|/);
});

test('AppsInToss production rewarded ad id comes from the environment', async () => {
  const [registration, graniteConfig, rewardedAd, workflow] = await Promise.all([
    json('apps-in-toss/apps-in-toss.config.json'),
    read('apps/ait/granite.config.ts'),
    read('apps/ait/src/services/rewarded-ad.ts'),
    read('.github/workflows/deploy-apps-in-toss.yml'),
  ]);

  assert.match(registration.monetization.adGroupId, /^ait\.v2\.live\.[0-9a-f]{16}$/);
  assert.equal(registration.monetization.adGroupIdSource, 'AIT_REWARDED_AD_GROUP_ID');
  assert.deepEqual(registration.release.latestRewardedAdBuild, {
    baseSourceSha: 'ff837dd1e16e27686a5c01d4888a35cbfb8316c8',
    artifactSha256:
      '3895283b679b2434cb5deab0a2716cf2d734df3799c5cb904c95d85fe1bc1e8e',
    artifactBytes: 3771389,
    deploymentId: '019ff443-31e2-79a2-b68b-cfde741ac42a',
    bundleCount: 4,
    operatingAdGroupIdEmbedded: true,
    uploaded: false,
    builtAt: '2026-08-12T13:38:12+09:00',
  });
  assert.match(
    graniteConfig,
    /'process\.env\.AIT_REWARDED_AD_GROUP_ID': JSON\.stringify\(/,
  );
  assert.match(rewardedAd, /ait-ad-test-rewarded-id/);
  assert.match(
    rewardedAd,
    /__DEV__ \? TEST_REWARDED_AD_GROUP_ID : AIT_REWARDED_AD_GROUP_ID/,
  );
  assert.match(
    workflow,
    /AIT_REWARDED_AD_GROUP_ID: \$\{\{ vars\.AIT_REWARDED_AD_GROUP_ID \}\}/,
  );
  assert.match(workflow, /\[ -n "\$AIT_REWARDED_AD_GROUP_ID" \] \|\|/);
});

// 등록 자산 목록과 실제 파일이 어긋나면 Console에 빠진 컷을 올리게 된다.
test('AppsInToss asset manifest matches the screenshot files on disk', async () => {
  const [manifest, checker] = await Promise.all([
    json('apps-in-toss/assets-manifest.json'),
    read('scripts/check-store-screenshots.mjs'),
  ]);
  const shots = manifest.items.filter(item => item.kind === 'screenshot');

  assert.equal(shots.length, 5);
  for (const shot of shots) {
    assert.equal(shot.width, 636);
    assert.equal(shot.height, 1048);
    // App Store 캡처 파생이 아니라 sandbox에서 실행한 미니앱 화면이다.
    assert.equal(shot.source, 'appsintoss-sandbox-capture');
    const name = shot.path.replace('apps-in-toss/screenshots/', '').replace('.png', '');
    assert.match(checker, new RegExp(`'${name}'`));
    await readFile(shot.path);
  }
});

test('AppsInToss upload workflow uses the x64 Hermes path', async () => {
  const workflow = await read('.github/workflows/deploy-apps-in-toss.yml');

  assert.match(workflow, /^name: Deploy AppsInToss$/m);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /environment: apps-in-toss/);
  assert.match(workflow, /node-version: 24\.16\.0/);
  assert.match(workflow, /pnpm@11\.14\.0/);
  assert.match(workflow, /pnpm --dir apps\/ait build/);
  assert.match(workflow, /test -f apps\/ait\/babynest\.ait/);
  assert.match(workflow, /APPS_IN_TOSS_API_KEY/);
  assert.match(workflow, /pnpm --dir apps\/ait exec ait deploy/);
  assert.match(workflow, /--location \.\/babynest\.ait/);
  assert.match(workflow, /--timeout 300/);
  assert.doesNotMatch(workflow, /seorilabs-rpi-arm64|rn-deploy-ait\.yml/);
});

test('stable tag creates a signed Android artifact without Play upload', async () => {
  const [workflow, deploy, gradle] = await Promise.all([
    read('.github/workflows/build-android.yml'),
    read('.github/workflows/deploy-google-play.yml'),
    read('apps/mobile/android/app/build.gradle'),
  ]);

  assert.match(workflow, /^name: Build Android Candidate$/m);
  assert.match(workflow, /push:[\s\S]*?tags:[\s\S]*?'v\*\.\*\.\*'/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*?release_tag:/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/deploy-google-play\.yml/);
  assert.match(workflow, /upload: false/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /secrets:\s*inherit/);
  assert.match(gradle, /rootProject\.file\('key\.properties'\)/);
  assert.match(gradle, /findProperty\('versionNameOverride'\)/);
  assert.match(gradle, /findProperty\('versionCodeOverride'\)/);
  assert.match(
    deploy,
    /uses: seorilabs\/\.github\/\.github\/workflows\/rn-deploy-google-play\.yml@8a11a145fed35479a4a89ebc7ca97edd0a0f05fd/,
  );
  assert.match(deploy, /package_name: com\.seorilabs\.babycare/);
  assert.doesNotMatch(workflow, /upload: true/);
});

test('Cloud Build build-only uses ephemeral signing and central tag-derived versions', async () => {
  const [script, buildEnv] = await Promise.all([
    read('scripts/build-android.sh'),
    read('build.env'),
  ]);

  assert.match(script, /SEORI_BUILD_MODE:-market-upload/);
  assert.match(script, /SEORI_ANDROID_AAB_OUTPUT.*repo_root\/app-release\.aab/s);
  assert.match(script, /pnpm_config_store_dir/);
  assert.match(script, /\.seorilabs-pnpm-store/);
  assert.match(script, /SEORI_RELEASE_TAG/);
  assert.match(script, /SEORI_RELEASE_VERSION_NAME/);
  assert.match(script, /SEORI_RELEASE_VERSION_CODE/);
  assert.match(script, /keytool -genkeypair -noprompt/);
  assert.match(script, /build-only\.p12/);
  assert.match(script, /pnpm install --frozen-lockfile --offline/);
  assert.match(script, /--no-daemon/);
  assert.match(script, /--max-workers="\$GRADLE_MAX_WORKERS"/);
  assert.match(buildEnv, /^GRADLE_MAX_WORKERS=2$/m);

  const buildOnlyStart = script.indexOf('run_build_only()');
  const marketStart = script.indexOf('run_market_upload()');
  const buildOnly = script.slice(buildOnlyStart, marketStart);
  for (const name of [
    'FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64',
    'GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64',
    'GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD',
    'GOOGLE_PLAY_UPLOAD_KEY_PASSWORD',
    'GOOGLE_PLAY_UPLOAD_KEY_ALIAS',
  ]) {
    assert.match(buildOnly, new RegExp(`\\b${name}\\b`));
  }
  assert.match(buildOnly, /reject_env "\$name"/);
  assert.doesNotMatch(buildOnly, /google-services\.json.*writeFileSync/s);
});

test('Google Play deployment is a thin exact-SHA central caller', async () => {
  const [workflow, workspace, setup, promotion, uploader] = await Promise.all([
    read('.github/workflows/deploy-google-play.yml'),
    read('pnpm-workspace.yaml'),
    read('docs/06-release/store-upload-setup.md'),
    read('.github/workflows/promote-google-play.yml'),
    read('scripts/upload-google-play-internal.py'),
  ]);

  assert.match(workflow, /release_tag: \$\{\{ inputs\.release_tag \}\}/);
  assert.match(workflow, /upload: \$\{\{ inputs\.upload \}\}/);
  assert.match(workflow, /package_name: com\.seorilabs\.babycare/);
  assert.match(workflow, /package_manager: pnpm/);
  assert.match(workflow, /pnpm_version: 11\.14\.0/);
  assert.match(workflow, /node_version: 24\.16\.0/);
  assert.match(workflow, /java_version: 21/);
  assert.match(workflow, /android_dir: apps\/mobile\/android/);
  assert.match(workflow, /packages: read/);
  assert.match(workspace, /patchedDependencies:[\s\S]*@react-native\/gradle-plugin@0\.85\.3/);
  assert.match(
    setup,
    /seorilabs-play-publisher@seorilabs-gws\.iam\.gserviceaccount\.com/,
  );
  assert.doesNotMatch(setup, /babycare-play-publisher@/);
  assert.doesNotMatch(workflow, /secrets:\s*inherit|scripts\/resolve-release-version|upload_script|gcloud builds submit/);
  assert.match(
    promotion,
    /uses: seorilabs\/\.github\/\.github\/workflows\/promote-google-play\.yml@8a11a145fed35479a4a89ebc7ca97edd0a0f05fd/,
  );
  assert.match(uploader, /--promote-version-code/);
  assert.match(uploader, /SEORI_EXPECTED_ANDROID_VERSION_CODE/);
});

test('Google Play upload tolerates slow resumable responses', async () => {
  const upload = await read('scripts/upload-google-play-internal.py');

  assert.match(upload, /HTTP_TIMEOUT_SECONDS = 600/);
  assert.match(
    upload,
    /AuthorizedHttp\(credentials, http=httplib2\.Http\(timeout=HTTP_TIMEOUT_SECONDS\)\)/,
  );
  assert.match(upload, /execute\(num_retries=API_RETRIES\)/);
});

test('Xcode Cloud release path is tag-only, secret-backed, and managed-signed', async () => {
  const [prebuild, postClone, project, plist, readme] = await Promise.all([
    read('apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh'),
    read('apps/mobile/ios/ci_scripts/ci_post_clone.sh'),
    read('apps/mobile/ios/BabyCare.xcodeproj/project.pbxproj'),
    read('apps/mobile/ios/BabyCare/Info.plist'),
    read('apps/mobile/ios/ci_scripts/README.md'),
  ]);

  assert.match(prebuild, /RELEASE_TAG="\$\{CI_TAG:-\}"/);
  assert.match(prebuild, /BUILD="\$\{CI_BUILD_NUMBER:-\}"/);
  assert.match(prebuild, /refs\/tags\/\$\{RELEASE_TAG\}\^\{commit\}/);
  assert.match(prebuild, /TAG_COMMIT/);
  assert.match(prebuild, /HEAD_COMMIT/);
  assert.match(prebuild, /MARKETING="\$\{RELEASE_TAG#v\}"/);
  assert.doesNotMatch(prebuild, /git[^\n]*describe/);
  assert.doesNotMatch(prebuild, /scripts\/resolve-release-version/);
  assert.match(postClone, /brew install node@24 cocoapods/);
  assert.match(postClone, /FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64:-/);
  assert.match(postClone, /FIREBASE_BUNDLE_ID/);
  assert.match(project, /CODE_SIGN_STYLE = Automatic;/);
  assert.doesNotMatch(project, /PROVISIONING_PROFILE_SPECIFIER/);
  assert.match(
    plist,
    /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/,
  );
  assert.match(readme, /시작 조건=태그\s*`v\*\.\*\.\*`/);
  assert.match(readme, /FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64/);
});

test('latest App Store candidate evidence stays consistent', async () => {
  const [config, market, checklist, setup, workLog] = await Promise.all([
    json('app-store/app-store.config.json'),
    read('docs/05-markets/app-store.md'),
    read('docs/06-release/release-checklist.md'),
    read('docs/06-release/store-upload-setup.md'),
    read('docs/04-work/work-log.md'),
  ]);
  const release = config.release;

  assert.deepEqual(
    {
      marketingVersion: release.marketingVersion,
      buildNumber: release.buildNumber,
      sourceTag: release.sourceTag,
      sourceCommit: release.sourceCommit,
      buildId: release.buildId,
      processingState: release.processingState,
      buildAudienceType: release.buildAudienceType,
      usesNonExemptEncryption: release.usesNonExemptEncryption,
      uploadedDate: release.uploadedDate,
      artifactSha256: release.artifactSha256,
      betaGroupBuildAssigned: release.betaGroupBuildAssigned,
      internalBuildState: release.internalBuildState,
      betaTesterCount: release.betaTesterCount,
    },
    {
      marketingVersion: '1.1.3',
      buildNumber: '61',
      sourceTag: 'v1.1.3',
      sourceCommit: '8ea2ceb656c46ecdf3975027f55c5b033e15e3a8',
      buildId: 'f9a718d7-829d-4838-8b61-e5d9a968fe6f',
      processingState: 'VALID',
      buildAudienceType: 'APP_STORE_ELIGIBLE',
      usesNonExemptEncryption: false,
      uploadedDate: '2026-08-10T06:06:53-07:00',
      artifactSha256: null,
      betaGroupBuildAssigned: true,
      internalBuildState: 'IN_BETA_TESTING',
      betaTesterCount: 2,
    },
  );

  for (const document of [market, checklist, setup, workLog]) {
    assert.match(document, /v1\.1\.3/);
    assert.match(document, /0abb7047-2126-44f7-979b-d5388314fabb/);
    assert.match(document, /f9a718d7-829d-4838-8b61-e5d9a968fe6f/);
    assert.match(document, /APP_STORE_ELIGIBLE/);
  }
});

test('candidate workflow names are not market deployment workflows', async () => {
  const workflows = await Promise.all([
    read('.github/workflows/build-ait.yml'),
    read('.github/workflows/build-android.yml'),
  ]);
  const marketName = /^(?:name:\s*).*(?:AIT|AppsInToss|Toss|Google|Play|App Store|iOS)/im;

  for (const workflow of workflows) assert.doesNotMatch(workflow, marketName);
});
