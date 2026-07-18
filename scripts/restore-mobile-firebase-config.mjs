#!/usr/bin/env node
// Restore Firebase mobile config files from base64 env vars into native paths.
//
// Contract (seorilabs/.github rn-deploy-google-play / rn-deploy-app-store):
//   node scripts/restore-mobile-firebase-config.mjs --android --require
//   node scripts/restore-mobile-firebase-config.mjs --ios --require
//
//   --android  FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64
//              -> apps/mobile/android/app/google-services.json
//   --ios      FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64
//              -> apps/mobile/ios/BabyCare/GoogleService-Info.plist
//   --require  fail if the corresponding env var is empty (else skip with a warning)
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const want = {
  android: argv.includes('--android'),
  ios: argv.includes('--ios'),
  require: argv.includes('--require'),
};
if (!want.android && !want.ios) {
  console.error('one of --android / --ios is required');
  process.exit(1);
}

const targets = [];
if (want.android) {
  targets.push({
    env: 'FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64',
    dest: 'apps/mobile/android/app/google-services.json',
  });
}
if (want.ios) {
  targets.push({
    env: 'FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64',
    dest: 'apps/mobile/ios/BabyCare/GoogleService-Info.plist',
  });
}

for (const target of targets) {
  const encoded = process.env[target.env];
  if (!encoded) {
    if (want.require) {
      console.error(`${target.env} is required but empty`);
      process.exit(1);
    }
    console.error(`${target.env} empty; skipping ${target.dest}`);
    continue;
  }
  fs.mkdirSync(path.dirname(target.dest), {recursive: true});
  fs.writeFileSync(target.dest, Buffer.from(encoded, 'base64'));
  console.log(`restored ${target.dest}`);
}
