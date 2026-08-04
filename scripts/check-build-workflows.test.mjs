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

test('candidate workflow names are not market deployment workflows', async () => {
  const workflows = await Promise.all([
    read('.github/workflows/build-ait.yml'),
    read('.github/workflows/build-android.yml'),
  ]);
  const marketName = /^(?:name:\s*).*(?:AIT|AppsInToss|Toss|Google|Play|App Store|iOS)/im;

  for (const workflow of workflows) assert.doesNotMatch(workflow, marketName);
});
