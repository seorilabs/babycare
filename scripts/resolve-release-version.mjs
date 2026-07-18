#!/usr/bin/env node
// Resolve a SemVer release tag into version fields for Google Play + App Store.
//
// Contract (seorilabs/.github rn-deploy-google-play / rn-deploy-app-store):
//   node scripts/resolve-release-version.mjs --tag vX.Y.Z --github-output
//
// Emits (GITHUB_OUTPUT and stdout):
//   version_name            X.Y.Z            (Android versionName)
//   android_version_code    integer          (Android versionCode, monotonic)
//   apple_marketing_version X.Y.Z            (CFBundleShortVersionString)
//   apple_build_number      integer          (CFBundleVersion, monotonic)
//   release_name            X.Y.Z            (Play release name / display)
import fs from 'node:fs';

function parseArgs(argv) {
  const args = {githubOutput: false};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--tag') args.tag = argv[(i += 1)];
    else if (a === '--github-output') args.githubOutput = true;
  }
  return args;
}

const {tag, githubOutput} = parseArgs(process.argv.slice(2));
if (!tag) {
  console.error('--tag vX.Y.Z is required');
  process.exit(1);
}
const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
if (!match) {
  console.error(`tag must be SemVer vX.Y.Z, got: ${tag}`);
  process.exit(1);
}
const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);
if (minor > 999 || patch > 999) {
  console.error('minor and patch must each be < 1000 for the versionCode scheme');
  process.exit(1);
}
const versionName = `${major}.${minor}.${patch}`;
// Monotonic across SemVer; stays well under Play's 2100000000 ceiling.
const versionCode = major * 1_000_000 + minor * 1_000 + patch;

const out = {
  version_name: versionName,
  android_version_code: String(versionCode),
  apple_marketing_version: versionName,
  apple_build_number: String(versionCode),
  release_name: versionName,
};

for (const [key, value] of Object.entries(out)) {
  console.log(`${key}=${value}`);
}
if (githubOutput) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    console.error('--github-output set but GITHUB_OUTPUT env is empty');
    process.exit(1);
  }
  fs.appendFileSync(
    file,
    `${Object.entries(out)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );
}
