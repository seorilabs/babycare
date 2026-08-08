#!/usr/bin/env node
// App Store 스크린샷 세트의 로케일·컷 구성·정확한 픽셀 크기를 검사한다.
//
// App Store Connect는 display type마다 정확한 해상도만 받는다. 잘못된 크기는
// 업로드 시점에야 거부되므로, 자산이 교체·재촬영될 때 저장소에서 먼저 막는다.
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const SHOTS = [
  {key: '01-home'},
  {key: '02-timeline'},
  {key: '03-stats'},
  {key: '04-record'},
  {key: '05-more'},
];

// ASC display type별 요구 해상도(세로). 로케일별로 같은 구성을 유지한다.
const SETS = [
  {locale: 'ko', dir: 'app-store/screenshots/6.9', width: 1320, height: 2868},
  {locale: 'ko', dir: 'app-store/screenshots/13', width: 2064, height: 2752},
  {locale: 'en-US', dir: 'app-store/screenshots/en-US/6.9', width: 1320, height: 2868},
  {locale: 'en-US', dir: 'app-store/screenshots/en-US/13', width: 2064, height: 2752},
];

/** PNG IHDR에서 크기를 읽는다. 의존성 없이 헤더만 확인한다. */
async function pngSize(file) {
  const buf = await readFile(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(signature)) {
    throw new Error(`PNG가 아님: ${file}`);
  }
  if (buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`IHDR 청크가 선두에 없음: ${file}`);
  }
  return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
}

const problems = [];

for (const set of SETS) {
  for (const shot of SHOTS) {
    const file = path.join(set.dir, `${shot.key}.png`);
    try {
      const {width, height} = await pngSize(file);
      if (width !== set.width || height !== set.height) {
        problems.push(
          `${file}: ${width}x${height} — ${set.width}x${set.height} 필요 (${set.locale})`,
        );
      }
    } catch (error) {
      problems.push(`${file}: ${error.code === 'ENOENT' ? '누락' : error.message}`);
    }
  }
}

if (problems.length > 0) {
  console.error('App Store 스크린샷 세트 검사 실패:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `App Store screenshot set check passed (${SETS.length} sets x ${SHOTS.length} shots).`,
);
