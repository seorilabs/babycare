import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('../firebase/callable-access.json', import.meta.url), 'utf8'),
);
const functionsSource = await readFile(
  new URL('../firebase/functions/src/index.ts', import.meta.url),
  'utf8',
);
const mobileRuntimeSource = await readFile(
  new URL('../apps/mobile/src/app/firebase-runtime.ts', import.meta.url),
  'utf8',
);

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test('production callable exports have a DRS-compatible Cloud Run access contract', () => {
  assert.equal(manifest.projectId, 'seorilabs-babycare');
  assert.match(manifest.region, /^[a-z]+-[a-z]+\d$/);
  assert.match(
    manifest.runtime.serviceAccountEmail,
    /^[^@]+@[^@]+\.iam\.gserviceaccount\.com$|^[^@]+@developer\.gserviceaccount\.com$/,
  );
  assert.deepEqual(manifest.runtime.projectRoles, [
    'roles/datastore.user',
    'roles/firebaseauth.admin',
    'roles/storage.objectAdmin',
  ]);
  assert.ok(Array.isArray(manifest.services));

  const callableExports = sorted(
    [...functionsSource.matchAll(/export const (\w+)\s*=\s*onCall\(/g)].map(
      match => match[1],
    ),
  );
  const configuredFunctions = sorted(
    manifest.services.map(service => service.functionName),
  );

  assert.deepEqual(
    configuredFunctions,
    callableExports,
    'every callable export must have an explicit production access contract',
  );

  for (const service of manifest.services) {
    assert.equal(
      service.serviceName,
      service.functionName.toLowerCase(),
      `${service.functionName} must target its generated Cloud Run service`,
    );
    assert.equal(
      service.invokerIamCheck,
      'disabled',
      `${service.functionName} must allow Firebase callable requests through Cloud Run IAM`,
    );
  }
});

test('mobile cloud Functions region matches the callable access contract', () => {
  const cloudRegion = mobileRuntimeSource.match(
    /FIREBASE_CLOUD_RUNTIME_CONFIG\s*=\s*{\s*functionsRegion:\s*'([^']+)'/,
  )?.[1];

  assert.equal(
    cloudRegion,
    manifest.region,
    'mobile callable region and deployed callable region must stay aligned',
  );
});
