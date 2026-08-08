#!/usr/bin/env node
// 마켓 스크린샷 세트의 컷 구성과 정확한 픽셀 크기를 검사한다.
//
// App Store Connect는 display type마다, AppsInToss Console은 세로 규격마다 정확한
// 해상도만 받는다. 잘못된 크기는 업로드 시점에야 거부되므로, 자산이 교체·재촬영될 때
// 저장소에서 먼저 막는다.
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const APP_STORE_SHOTS = ['01-home', '02-timeline', '03-stats', '04-record', '05-more'];
// AppsInToss는 미니앱 실제 화면 구성이 달라 컷 이름도 다르다.
const AIT_SHOTS = ['01-start', '02-home', '03-timeline', '04-stats', '05-more'];

// 마켓별 요구 해상도(세로). 같은 마켓 안에서는 로케일별 구성을 동일하게 유지한다.
const SETS = [
  {locale: 'ko', dir: 'app-store/screenshots/6.9', width: 1320, height: 2868, shots: APP_STORE_SHOTS},
  {locale: 'ko', dir: 'app-store/screenshots/13', width: 2064, height: 2752, shots: APP_STORE_SHOTS},
  {locale: 'en-US', dir: 'app-store/screenshots/en-US/6.9', width: 1320, height: 2868, shots: APP_STORE_SHOTS},
  {locale: 'en-US', dir: 'app-store/screenshots/en-US/13', width: 2064, height: 2752, shots: APP_STORE_SHOTS},
  {
    locale: 'ko',
    dir: 'apps-in-toss/screenshots',
    width: 636,
    height: 1048,
    shots: AIT_SHOTS,
    requireOpaqueRgb: true,
  },
];

// IHDR color type 2 = 알파 없는 truecolor. AppsInToss 등록 자산은 RGB만 받는다.
// App Store는 현재 등록·`COMPLETE`된 컷이 모두 color type 6(RGBA)이므로 강제하지 않는다.
const COLOR_TYPE_RGB = 2;

/** PNG IHDR에서 크기와 색상 형식을 읽는다. 의존성 없이 헤더만 확인한다. */
async function pngHeader(file) {
  const buf = await readFile(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(signature)) {
    throw new Error(`PNG가 아님: ${file}`);
  }
  if (buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`IHDR 청크가 선두에 없음: ${file}`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf.readUInt8(24),
    colorType: buf.readUInt8(25),
  };
}

const problems = [];

for (const set of SETS) {
  for (const shot of set.shots) {
    const file = path.join(set.dir, `${shot}.png`);
    try {
      const {width, height, bitDepth, colorType} = await pngHeader(file);
      if (width !== set.width || height !== set.height) {
        problems.push(
          `${file}: ${width}x${height} — ${set.width}x${set.height} 필요 (${set.locale})`,
        );
      }
      if (set.requireOpaqueRgb && (colorType !== COLOR_TYPE_RGB || bitDepth !== 8)) {
        problems.push(
          `${file}: color type ${colorType}/bit depth ${bitDepth} — 알파 없는 8bit RGB 필요`,
        );
      }
    } catch (error) {
      problems.push(`${file}: ${error.code === 'ENOENT' ? '누락' : error.message}`);
    }
  }
}

if (problems.length > 0) {
  console.error('마켓 스크린샷 세트 검사 실패:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const total = SETS.reduce((count, set) => count + set.shots.length, 0);
console.log(`Store screenshot set check passed (${SETS.length} sets, ${total} shots).`);
