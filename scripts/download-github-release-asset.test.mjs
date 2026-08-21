import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {downloadReleaseAsset} from './download-github-release-asset.mjs';

test('downloads the exact named asset through the GitHub release API', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'babycare-release-asset-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const outputPath = join(directory, 'release-notes.json');
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({url, options});
    if (requests.length === 1) {
      return new Response(
        JSON.stringify({
          assets: [
            {name: 'release-notes.json.bak', url: 'https://api.github.test/assets/1'},
            {name: 'release-notes.json', url: 'https://api.github.test/assets/2'},
          ],
        }),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      );
    }
    return new Response('{"ko-KR":"새 버전"}', {status: 200});
  };

  const result = await downloadReleaseAsset({
    repo: 'seorilabs/babycare',
    tag: 'v1.1.9',
    assetName: 'release-notes.json',
    outputPath,
    token: 'test-token',
    fetchImpl,
  });

  assert.deepEqual(result, {assetName: 'release-notes.json', bytes: 22});
  assert.equal(await readFile(outputPath, 'utf8'), '{"ko-KR":"새 버전"}');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, 'https://api.github.test/assets/2');
  assert.equal(requests[1].options.headers.Accept, 'application/octet-stream');
});

test('fails when the exact asset is missing', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({assets: [{name: 'release-notes.json.bak'}]}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });

  await assert.rejects(
    downloadReleaseAsset({
      repo: 'seorilabs/babycare',
      tag: 'v1.1.9',
      assetName: 'release-notes.json',
      outputPath: '/unused/release-notes.json',
      token: 'test-token',
      fetchImpl,
    }),
    /release-notes\.json 자산이 없습니다/,
  );
});
