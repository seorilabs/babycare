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
    tag: 'v1.0.3',
    sourceSha: '089eb0c888f54dd4636a58458f62e44d346103a4',
    workflowRun: 30909365541,
    deploymentId: '019fccc1-8e5b-775f-99a4-ab190d4d1726',
    status: 'uploaded',
    uploadedAt: '2026-08-04T21:31:44+09:00',
  });
  assert.equal(registration.release.sandboxQa, '미검증');

  for (const document of [market, checklist, workLog]) {
    assert.match(document, /v1\.0\.3/);
    assert.match(document, /089eb0c/);
    assert.match(document, /30909365541/);
    assert.match(document, /019fccc1-8e5b-775f-99a4-ab190d4d1726/);
  }

  assert.match(checklist, /- \[ \] AppsInToss private build sandbox/);
  assert.match(checklist, /- \[ \] AppsInToss production release 승인/);
});

test('AIT build workflow creates only a candidate artifact', async () => {
  const workflow = await read('.github/workflows/build-ait.yml');

  assert.match(workflow, /^name: Build Mini-app Candidate$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*?release_tag:/);
  assert.match(
    workflow,
    /rn-build-ait\.yml@73972d2b34e92145e61e3409c91085c40da10c54/,
  );
  assert.match(workflow, /build_command: "pnpm --dir apps\/ait build"/);
  assert.match(workflow, /artifact_path: "apps\/ait\/\*\.ait"/);
  assert.match(workflow, /runs_on: ubuntu-latest/);
  assert.doesNotMatch(workflow, /APPS_IN_TOSS_API_KEY|ait deploy|run deploy/i);
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

test('Android build workflow creates a signed AAB without Play upload', async () => {
  const [workflow, gradle] = await Promise.all([
    read('.github/workflows/build-android.yml'),
    read('apps/mobile/android/app/build.gradle'),
  ]);

  assert.match(workflow, /^name: Build Android Candidate$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*?release_tag:/);
  assert.match(
    workflow,
    /rn-build-android\.yml@bf14204ee13dba657e31dcf1a71a64c0dc526ae3/,
  );
  assert.match(workflow, /android_dir: apps\/mobile\/android/);
  assert.match(workflow, /java_version: "21"/);
  assert.match(gradle, /rootProject\.file\('key\.properties'\)/);
  assert.doesNotMatch(
    workflow,
    /rn-deploy-google-play|upload:|track:|release_status:|id-token:|environment:/,
  );
});

test('Google Play deployment pins the shared publisher toolchain contract', async () => {
  const [workflow, setup] = await Promise.all([
    read('.github/workflows/deploy-google-play.yml'),
    read('docs/06-release/store-upload-setup.md'),
  ]);

  assert.match(workflow, /pnpm_version: 11\.14\.0/);
  assert.match(workflow, /node_version: 24\.16\.0/);
  assert.match(workflow, /java_version: "21"/);
  assert.match(workflow, /android_dir: apps\/mobile\/android/);
  assert.match(
    setup,
    /seorilabs-play-publisher@seorilabs-gws\.iam\.gserviceaccount\.com/,
  );
  assert.doesNotMatch(setup, /babycare-play-publisher@/);
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
  assert.doesNotMatch(prebuild, /git[^\n]*describe/);
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

test('candidate workflow names are not market deployment workflows', async () => {
  const workflows = await Promise.all([
    read('.github/workflows/build-ait.yml'),
    read('.github/workflows/build-android.yml'),
  ]);
  const marketName = /^(?:name:\s*).*(?:AIT|AppsInToss|Toss|Google|Play|App Store|iOS)/im;

  for (const workflow of workflows) assert.doesNotMatch(workflow, marketName);
});
