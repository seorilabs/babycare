import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, 'scripts', 'check-app-privacy.mjs');

function setupSandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'check-app-privacy-'));
  mkdirSync(join(dir, 'app-store'), {recursive: true});
  mkdirSync(join(dir, 'apps', 'mobile', 'ios'), {recursive: true});
  cpSync(
    join(repoRoot, 'app-store', 'app-store.config.json'),
    join(dir, 'app-store', 'app-store.config.json'),
  );
  cpSync(
    join(repoRoot, 'apps', 'mobile', 'ios', 'Podfile.lock'),
    join(dir, 'apps', 'mobile', 'ios', 'Podfile.lock'),
  );
  cpSync(
    join(repoRoot, 'apps', 'mobile', 'ios', 'Podfile'),
    join(dir, 'apps', 'mobile', 'ios', 'Podfile'),
  );
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [scriptPath], {cwd: dir, encoding: 'utf8'});
}

test('현재 저장소의 App Privacy 선언과 iOS 의존성은 대조를 통과한다', () => {
  const result = run(setupSandbox());
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('appPrivacy.collected 항목이 어긋나면 실패한다', () => {
  const dir = setupSandbox();
  const configPath = join(dir, 'app-store', 'app-store.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.appPrivacy.collected[0].linked = !config.appPrivacy.collected[0].linked;
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Incorrect linked value/);
});

test('Podfile.lock 에 금지된 pod(FirebaseCrashlytics)이 들어가면 실패한다', () => {
  const dir = setupSandbox();
  const lockPath = join(dir, 'apps', 'mobile', 'ios', 'Podfile.lock');
  const lock = readFileSync(lockPath, 'utf8');
  writeFileSync(lockPath, `${lock}\n  - FirebaseCrashlytics (12.15.0)\n`);

  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /iOS dependency: /);
});

test('필수 iOS pod 이 하나라도 빠지면 실패한다', () => {
  const dir = setupSandbox();
  const lockPath = join(dir, 'apps', 'mobile', 'ios', 'Podfile.lock');
  const lock = readFileSync(lockPath, 'utf8').replaceAll('Google-Mobile-Ads-SDK', 'Removed-Ads-SDK');
  writeFileSync(lockPath, lock);

  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected iOS dependency missing/);
});
