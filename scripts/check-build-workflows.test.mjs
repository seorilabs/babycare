import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
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
  const [workflow, graniteConfig] = await Promise.all([
    read('.github/workflows/build-ait.yml'),
    read('apps/ait/granite.config.ts'),
  ]);

  assert.match(workflow, /^name: Build Mini-app Candidate$/m);
  assert.match(workflow, /workflow_dispatch:[\s\S]*?release_tag:/);
  assert.match(workflow, /packages: read/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  // platform-sdk는 npm 공개 레지스트리에서 받으므로 registry 라우팅과 토큰이 없어야 한다.
  assert.doesNotMatch(workflow, /npm\.pkg\.github\.com/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm --dir apps\/ait build/);
  assert.match(workflow, /APP_VERSION: \$\{\{ inputs\.release_tag \|\| github\.ref_name \}\}/);
  assert.match(
    graniteConfig,
    /'process\.env\.APP_VERSION': JSON\.stringify\(\s*process\.env\.APP_VERSION \?\? ''/,
  );
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
  assert.match(
    babelConfig,
    /INLINED_ENV_KEYS = \['FIREBASE_WEB_API_KEY', 'APP_VERSION'\]/,
  );
  // 환경변수 우선이어야 CI 동작이 로컬 .env에 영향받지 않는다.
  assert.match(babelConfig, /process\.env\[key\] \?\? dotenv\[key\]/);

  // CI: 중앙 워크플로가 조직 표준 이름 VITE_FIREBASE_API_KEY 로 job env 에 넣어 준다.
  // caller 의 build_command 가 이 앱이 쓰는 이름으로 이어 주고, 값이 비면 build 전에 멈춘다.
  assert.match(workflow, /export FIREBASE_WEB_API_KEY="\$VITE_FIREBASE_API_KEY"/);
  assert.match(
    workflow,
    /export APP_VERSION="\$\{\{ inputs\.release_tag \|\| github\.ref_name \}\}"/,
  );
  assert.match(workflow, /if \[ -z "\$\{VITE_FIREBASE_API_KEY\/\/\[\[:space:\]\]\/\}" \]; then/);
  assert.match(workflow, /::error::FIREBASE_API_KEY repository variable is required\./);
  assert.ok(
    workflow.indexOf('export FIREBASE_WEB_API_KEY') < workflow.indexOf('pnpm --dir apps/ait build'),
    '키를 이어 준 뒤에 빌드해야 한다',
  );
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
  // caller 문맥에서 읽는다. Environment 범위가 아니라 repository variable 이어야
  // 얇은 caller 가 읽을 수 있다. 값이 비면 build 전에 멈춘다.
  assert.match(workflow, /ad_group="\$\{\{ vars\.AIT_REWARDED_AD_GROUP_ID \}\}"/);
  assert.match(workflow, /if \[ -z "\$\{ad_group\/\/\[\[:space:\]\]\/\}" \]; then/);
  assert.match(workflow, /::error::AIT_REWARDED_AD_GROUP_ID repository variable is required\./);
  assert.match(workflow, /export AIT_REWARDED_AD_GROUP_ID="\$ad_group"/);
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

// 빌드·업로드 본체는 org 중앙 워크플로에 한 벌만 둔다. 러너, 태그 authority, artifact
// 검증, 배포 memo 는 그쪽 계약이고 그쪽에서 시험한다. 여기서는 caller 가 무엇을 넘기는지만
// 본다. 예전 이 테스트는 "x64 Hermes 경로"를 전제로 runs-on: ubuntu-latest 와 인라인
// ait deploy 호출을 요구했다. 같은 Granite/Hermes 스택의 crossword-puzzle 이 ARM64 ARC
// 러너에서 .ait 빌드·업로드에 성공하면서 그 전제가 깨졌다.
test('AppsInToss 배포는 중앙 워크플로를 부르고 업로드는 upload 입력이 정한다', async () => {
  const workflow = await read('.github/workflows/deploy-apps-in-toss.yml');

  assert.match(workflow, /^name: Deploy AppsInToss$/m);
  assert.match(
    workflow,
    /uses: seorilabs\/\.github\/\.github\/workflows\/rn-deploy-ait\.yml@main/,
  );
  assert.match(workflow, /^      ait_dir: apps\/ait$/m);
  assert.match(workflow, /^      artifact_path: apps\/ait\/babynest\.ait$/m);
  assert.match(workflow, /node_version: "24\.16\.0"/);
  assert.match(workflow, /pnpm_version: "11\.14\.0"/);
  assert.match(workflow, /pnpm --dir apps\/ait build/);
  assert.match(workflow, /APPS_IN_TOSS_API_KEY: \$\{\{ secrets\.APPS_IN_TOSS_API_KEY \}\}/);

  // 업로드 여부를 caller 가 정하고 그 값이 중앙까지 간다. 기본값이 true 라 기존 동작과 같고,
  // false 로 부르면 실제 업로드 없이 배포 경로 전체를 확인할 수 있다.
  assert.match(workflow, /^      upload: \$\{\{ inputs\.upload \}\}$/m);
  assert.match(workflow, /upload:\n\s+type: boolean\n\s+required: false\n\s+default: true/);

  // 인라인 구현이 되살아나면 중앙에서 고쳐도 이 저장소에는 닿지 않는다.
  assert.doesNotMatch(workflow, /runs-on:|ait deploy|--location|--timeout/);
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
    /uses: seorilabs\/\.github\/\.github\/workflows\/rn-deploy-google-play\.yml@main/,
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
  assert.match(script, /version_code <= 2100000000/);
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

test('Google Play deployment is a thin central caller on @main', async () => {
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
    /uses: seorilabs\/\.github\/\.github\/workflows\/promote-google-play\.yml@main/,
  );
  assert.match(uploader, /--promote-version-code/);
  assert.match(uploader, /SEORI_EXPECTED_ANDROID_VERSION_CODE/);
});

test('App Store deployment is a thin central caller with tag-bound versions', async () => {
  const [workflow, deployAll, exportOptions, rootPackage] = await Promise.all([
    read('.github/workflows/deploy-app-store.yml'),
    read('.github/workflows/deploy-all.yml'),
    read('app-store/exportOptions.plist'),
    json('package.json'),
  ]);

  assert.match(
    workflow,
    /uses: seorilabs\/\.github\/\.github\/workflows\/rn-deploy-app-store\.yml@main/,
  );
  // 업로드는 중앙 워크플로만 소유한다. caller 가 xcodebuild 나 altool 을 직접 부르지 않는다.
  assert.doesNotMatch(workflow, /xcodebuild|altool|runs-on:|secrets:\s*inherit/);
  assert.match(workflow, /bundle_id: com\.seorilabs\.babycare/);
  assert.match(workflow, /xcode_workspace: BabyCare\.xcworkspace/);
  assert.match(workflow, /export_options_plist: app-store\/exportOptions\.plist/);
  assert.match(workflow, /firebase_restore_script: scripts\/restore-mobile-firebase-config\.mjs/);
  // dispatch 기본값은 업로드하지 않는다. 업로드는 명시적으로 켜야 한다.
  assert.match(workflow, /upload:[\s\S]*?type: boolean\n        default: false/);

  const pnpmVersion = rootPackage.packageManager.replace(/^pnpm@/, '');
  assert.match(workflow, new RegExp(`pnpm_version: "?${pnpmVersion.replace(/\./gu, '\\.')}"?`, 'u'));
  assert.match(workflow, /pnpm install [^\n]*--frozen-lockfile\b/);

  // 버전 정본은 태그 하나다. Xcode 가 App Store Connect 최신 build number 를 보고
  // CFBundleVersion 을 올리면 중앙이 archive 에서 검증한 값과 업로드된 값이 갈린다.
  assert.match(exportOptions, /<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/);
  assert.match(exportOptions, /<key>method<\/key>\s*<string>app-store-connect<\/string>/);
  assert.match(exportOptions, /<key>teamID<\/key>\s*<string>HCDUXX4Z3X<\/string>/);

  // deploy-all 은 세 마켓을 모두 fan-out 한다.
  assert.match(deployAll, /uses: \.\/\.github\/workflows\/deploy-app-store\.yml/);
  assert.match(deployAll, /deploy_app_store:/);
  // 호출 대상이 선언하지 않은 secret 을 넘기면 GitHub 가 실행 자체를 거부한다.
  assert.doesNotMatch(deployAll, /FIREBASE_WEB_API_KEY/);
});

// deploy-all 은 세 마켓 caller 를 부른다. GitHub 은 재사용 워크플로가 caller 보다 넓은 권한을
// 요구하면 job 하나가 아니라 run 전체를 startup_failure 로 죽인다. 로그도 남지 않아 진단이
// 어렵다. 실제로 packages: read 누락으로 한 번 죽었다.
test('deploy-all 권한은 호출하는 마켓 워크플로의 상위집합이다', async () => {
  const names = ['deploy-apps-in-toss.yml', 'deploy-google-play.yml', 'deploy-app-store.yml'];
  const [parent, ...children] = await Promise.all([
    read('.github/workflows/deploy-all.yml'),
    ...names.map((n) => read(`.github/workflows/${n}`)),
  ]);

  const perms = (text) => {
    const block = text.match(/^permissions:\n((?:[ \t]+\S[^\n]*\n)+)/mu);
    assert.ok(block, 'permissions 블록이 필요하다');
    return new Map(
      block[1]
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [scope, value] = line.trim().split(/:\s*/u);
          return [scope, value];
        }),
    );
  };

  const rank = { read: 1, write: 2 };
  const parentPerms = perms(parent);

  for (const [index, child] of children.entries()) {
    for (const [scope, value] of perms(child)) {
      const granted = parentPerms.get(scope);
      assert.ok(
        granted !== undefined,
        `deploy-all 에 ${scope} 권한이 없다. ${names[index]} 가 요구한다`,
      );
      assert.ok(
        rank[granted] >= rank[value],
        `deploy-all 의 ${scope}=${granted} 가 ${names[index]} 의 ${value} 보다 좁다`,
      );
    }
  }
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

// lockfile을 강제하지 않는 설치는 CI가 커밋된 pnpm-lock.yaml 대신 새로 해석한 트리로
// 통과할 수 있다. 그러면 @seorilabs/platform-sdk exact 해석이 깨져도 PR gate가 잡지
// 못하고 Platform discovery만 뒤늦게 CUSTOM_HTTP로 떨어진다.
test('every workflow installs with the committed pnpm lockfile', async () => {
  const [rootPackage, ...workflows] = await Promise.all([
    json('package.json'),
    read('.github/workflows/static-checks.yml'),
    read('.github/workflows/build-ait.yml'),
    read('.github/workflows/deploy-apps-in-toss.yml'),
  ]);

  const pnpmVersion = rootPackage.packageManager.replace(/^pnpm@/, '');
  assert.match(rootPackage.packageManager, /^pnpm@\d+\.\d+\.\d+$/);

  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /--frozen-lockfile=false/);
    assert.match(workflow, /pnpm install [^\n]*--frozen-lockfile\b/);
    for (const pinned of workflow.match(/pnpm@\d+\.\d+\.\d+/g) ?? []) {
      assert.equal(pinned, `pnpm@${pnpmVersion}`);
    }
    for (const pinned of workflow.match(/pnpm_version: "(\d+\.\d+\.\d+)"/g) ?? []) {
      assert.equal(pinned, `pnpm_version: "${pnpmVersion}"`);
    }
  }
});

// 중앙 재사용 워크플로는 org 호출 계약(seorilabs/.github README)에 따라 `@main`으로 부른다.
// 2026-09-19 Xcode Cloud 경로를 걷어내면서 raw.githubusercontent 에서 중앙 스크립트를 SHA 로
// 받아 오던 유일한 예외가 사라졌다. 이제 중앙 참조는 워크플로 `@main` 하나뿐이다.
test('중앙 참조는 전부 워크플로 @main 이다', async () => {
  const names = (await readdir('.github/workflows')).filter((name) => name.endsWith('.yml'));
  const workflows = await Promise.all(names.map((name) => read(`.github/workflows/${name}`)));

  let refCount = 0;
  for (const [index, text] of workflows.entries()) {
    for (const line of text.split('\n')) {
      const ref = line.match(/uses:\s*seorilabs\/\.github\/\.github\/workflows\/[\w.-]+@(\S+)/u);
      if (ref === null) continue;
      assert.equal(ref[1], 'main', `${names[index]}: 중앙 재사용 워크플로는 @main 으로 부른다`);
      refCount += 1;
    }
  }
  assert.ok(refCount > 0, '중앙 재사용 워크플로 참조를 찾지 못했다');

  // Xcode Cloud 경로가 남아 있으면 버전 정본이 두 갈래가 된다. 되살아나지 않게 막는다.
  for (const [index, text] of workflows.entries()) {
    assert.doesNotMatch(text, /AUTHORITY_SHA|ci_pre_xcodebuild|ciBuildRuns/u, names[index]);
  }
});
