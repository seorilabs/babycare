import {readFileSync} from 'node:fs';

const config = JSON.parse(
  readFileSync('app-store/app-store.config.json', 'utf8'),
);
const lockfile = readFileSync('apps/mobile/ios/Podfile.lock', 'utf8');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const privacy = config.appPrivacy;
if (privacy?.tracking !== false || !Array.isArray(privacy.collected)) {
  fail('App Privacy must declare tracking=false and a collected data list.');
}

const expected = new Map([
  ['이름 (Contact Info)', {linked: true, purposes: ['app-functionality']}],
  ['건강 (Health & Fitness)', {linked: true, purposes: ['app-functionality']}],
  ['기타 사용자 콘텐츠 (User Content)', {linked: true, purposes: ['app-functionality']}],
  ['기타 데이터 유형 (Other Data)', {linked: true, purposes: ['app-functionality']}],
  ['사용자 ID (Identifiers)', {linked: true, purposes: ['app-functionality']}],
  [
    '기타 진단 데이터 (Diagnostics)',
    {linked: false, purposes: ['analytics', 'app-functionality']},
  ],
]);

if (privacy.collected.length !== expected.size) {
  fail(`Expected ${expected.size} App Privacy data types.`);
}

for (const item of privacy.collected) {
  const contract = expected.get(item.type);
  if (!contract) {
    fail(`Unexpected App Privacy data type: ${item.type}`);
  }
  if (item.linked !== contract.linked) {
    fail(`Incorrect linked value for ${item.type}.`);
  }
  if (
    !Array.isArray(item.purposes) ||
    item.purposes.length !== contract.purposes.length ||
    !contract.purposes.every((purpose) => item.purposes.includes(purpose))
  ) {
    fail(`Incorrect purposes for ${item.type}.`);
  }
}

for (const requiredPod of [
  'Firebase/Auth (12.15.0)',
  'Firebase/Firestore (12.15.0)',
  'Firebase/Functions (12.15.0)',
  'Firebase/AppCheck (12.15.0)',
]) {
  if (!lockfile.includes(requiredPod)) {
    fail(`Expected iOS dependency missing: ${requiredPod}`);
  }
}

for (const forbiddenPod of [
  /^\s+- Firebase\/Analytics /m,
  /^\s+- FirebaseCrashlytics /m,
  /^\s+- FirebasePerformance /m,
]) {
  if (forbiddenPod.test(lockfile)) {
    fail(`App Privacy must be updated for iOS dependency: ${forbiddenPod}`);
  }
}

console.log('App Store privacy source-of-truth check passed.');
