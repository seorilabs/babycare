import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const API_VERSION = '2022-11-28';

function assertNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} 값이 필요합니다.`);
  }
}

function requestHeaders(token, accept) {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'User-Agent': 'seorilabs-babycare-release-pipeline',
    'X-GitHub-Api-Version': API_VERSION,
  };
}

async function assertOk(response, operation) {
  if (!response.ok) {
    throw new Error(`${operation} 실패: GitHub API HTTP ${response.status}`);
  }
}

export async function downloadReleaseAsset({
  repo,
  tag,
  assetName,
  outputPath,
  token,
  fetchImpl = fetch,
}) {
  assertNonEmpty('repo', repo);
  assertNonEmpty('tag', tag);
  assertNonEmpty('assetName', assetName);
  assertNonEmpty('outputPath', outputPath);
  assertNonEmpty('GH_TOKEN', token);

  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error('repo는 owner/name 형식이어야 합니다.');
  }

  const releaseUrl =
    `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  const releaseResponse = await fetchImpl(releaseUrl, {
    headers: requestHeaders(token, 'application/vnd.github+json'),
  });
  await assertOk(releaseResponse, `릴리스 ${tag} 조회`);
  const release = await releaseResponse.json();
  const asset = release.assets?.find(candidate => candidate.name === assetName);

  if (!asset?.url) {
    throw new Error(`릴리스 ${tag}에 ${assetName} 자산이 없습니다.`);
  }

  const assetResponse = await fetchImpl(asset.url, {
    headers: requestHeaders(token, 'application/octet-stream'),
  });
  await assertOk(assetResponse, `${assetName} 다운로드`);
  const bytes = new Uint8Array(await assetResponse.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw new Error(`${assetName} 자산이 비어 있습니다.`);
  }

  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, bytes);
  return {assetName, bytes: bytes.byteLength};
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error('인자는 --name value 형식이어야 합니다.');
    }
    parsed[flag.slice(2)] = value;
  }
  return parsed;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await downloadReleaseAsset({
    repo: args.repo,
    tag: args.tag,
    assetName: args.asset,
    outputPath: args.output,
    token: process.env.GH_TOKEN,
  });
  console.log(`${result.assetName} 다운로드 완료: ${result.bytes} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
