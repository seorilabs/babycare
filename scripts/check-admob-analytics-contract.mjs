import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const EXPECTED = {
  publisherId: '9932778305312246',
  packageId: 'com.seorilabs.babycare',
  androidAppId: 'ca-app-pub-9932778305312246~3839518050',
  iosAppId: 'ca-app-pub-9932778305312246~3609252062',
  androidRewarded: 'ca-app-pub-9932778305312246/1805215803',
  iosRewarded: 'ca-app-pub-9932778305312246/4239807450',
};

const [
  appConfig,
  rewardedSource,
  androidGradle,
  iosProject,
  platformAnalytics,
  firebaseAnalytics,
  aitAnalytics,
  legacyRelay,
  legacyRelayEntry,
  graniteConfig,
  aitCandidateWorkflow,
  aitDeployWorkflow,
] = await Promise.all([
  readFile('apps/mobile/app.json', 'utf8').then(JSON.parse),
  readFile('apps/mobile/src/adapters/ads/mobile-rewarded-ad.ts', 'utf8'),
  readFile('apps/mobile/android/app/build.gradle', 'utf8'),
  readFile('apps/mobile/ios/BabyCare.xcodeproj/project.pbxproj', 'utf8'),
  readFile('packages/product-data/src/analytics.ts', 'utf8'),
  readFile('apps/mobile/src/adapters/analytics/firebase-analytics-adapter.ts', 'utf8'),
  readFile('apps/ait/src/services/analytics.ts', 'utf8'),
  readFile('firebase/functions/src/analytics-service.ts', 'utf8'),
  readFile('firebase/functions/src/index.ts', 'utf8'),
  readFile('apps/ait/granite.config.ts', 'utf8'),
  readFile('.github/workflows/build-ait.yml', 'utf8'),
  readFile('.github/workflows/deploy-apps-in-toss.yml', 'utf8'),
]);

const mobileAdsConfig = appConfig['react-native-google-mobile-ads'];
assert.equal(mobileAdsConfig.android_app_id, EXPECTED.androidAppId);
assert.equal(mobileAdsConfig.ios_app_id, EXPECTED.iosAppId);
assert.match(androidGradle, new RegExp(`namespace ['"]${EXPECTED.packageId}['"]`));
assert.match(iosProject, new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${EXPECTED.packageId};`));
assert.match(rewardedSource, new RegExp(EXPECTED.androidRewarded.replace('/', '\\/')));
assert.match(rewardedSource, new RegExp(EXPECTED.iosRewarded.replace('/', '\\/')));
assert.match(rewardedSource, /__DEV__[\s\S]*TestIds\.REWARDED/);

const productionAdSources = JSON.stringify(mobileAdsConfig) + rewardedSource;
assert.doesNotMatch(
  productionAdSources,
  /ca-app-pub-3940256099942544/,
  'Google demo IDs must not enter production app/unit configuration',
);
const identifiers = productionAdSources.match(/ca-app-pub-\d+[~/]\d+/g) ?? [];
assert.ok(identifiers.length >= 4, 'both app IDs and rewarded units are required');
for (const identifier of identifiers) {
  assert.match(
    identifier,
    new RegExp(`^ca-app-pub-${EXPECTED.publisherId}[~/]`),
    `publisher mismatch: ${identifier}`,
  );
}

for (const parameter of [
  'app_market',
  'runtime_platform',
  'release_version',
  'session_id',
  'engagement_time_msec',
]) {
  assert.match(
    platformAnalytics,
    new RegExp(`\\b${parameter}\\b`),
    `Platform analytics is missing ${parameter}`,
  );
}
assert.match(firebaseAnalytics, /firebaseAnalyticsParams\(event, this\.#context\)/);
assert.match(platformAnalytics, /ANALYTICS_SESSION_TIMEOUT_MS = 30 \* 60 \* 1_000/);

assert.match(aitAnalytics, /new PlatformAnalytics\(/);
assert.match(aitAnalytics, /ga4ClientId: analyticsClientId/);
assert.doesNotMatch(aitAnalytics, /sendAnalyticsEventsToGa4|AitGa4Analytics/);
assert.match(legacyRelay, /relayAnalyticsToGa4/);
assert.match(legacyRelayEntry, /export const logAnalyticsEvents/);

assert.match(graniteConfig, /'process\.env\.APP_VERSION': JSON\.stringify\(/);
assert.match(aitCandidateWorkflow, /APP_VERSION: \$\{\{ inputs\.release_tag \|\| github\.ref_name \}\}/);
assert.match(aitDeployWorkflow, /export APP_VERSION=/);

console.log('AdMob and analytics release contract is valid.');
