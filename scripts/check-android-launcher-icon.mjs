import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const densities = new Map([
  ['mdpi', {legacy: 48, adaptive: 108}],
  ['hdpi', {legacy: 72, adaptive: 162}],
  ['xhdpi', {legacy: 96, adaptive: 216}],
  ['xxhdpi', {legacy: 144, adaptive: 324}],
  ['xxxhdpi', {legacy: 192, adaptive: 432}],
]);

const reactNativeTemplateHashes = new Set([
  'ded7aabf6a56b694e486e096efd89e2f0c9067d292b634663898e352c9491f10',
  '21304a0c9b00da6a72cfa31c7229c9528fc17b6e5eb4e68a969bce08c01a2fee',
  'eef20f25fb1477d8c9df15757e764811cc503fb0777f18d0f7fb2d19178b5bf6',
  '520d05f978a15ba0ccf23006a1a5691a054a02478c70cafc5ebafae76e600f0d',
  'e77c5045bfdb6f4bbe955b3a793bfed3baa369ce4811ae2a9103d5480637cfff',
  '2846e1a703e519791fe22f41bcb243b82f908d12e5ebcb43f020ddf9982780b0',
  'eb3a34b13632e0cb3b1c0f4273035866cbe81b1b17b7178ce29d19c78d394a5e',
  '363a569beb72e8b007bf046454612148d4c9f782b9391352059fe83179f18e30',
  '9ff27328b6916b7f75b99ef36153f154bb4724946e5654635cba2e257352c69f',
  '5bacd97a1b41e4413c6092cdbd83f65112a9124e823cfaa3a219c65e2761647b',
]);

function pngDimensions(buffer, path) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`${path} is not a valid PNG`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function checkPng(path, expectedSize, rejectTemplate) {
  const buffer = await readFile(path);
  const {width, height} = pngDimensions(buffer, path);
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(
      `${path} must be ${expectedSize}x${expectedSize}, got ${width}x${height}`,
    );
  }
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (rejectTemplate && reactNativeTemplateHashes.has(hash)) {
    throw new Error(`${path} still contains the React Native template launcher icon`);
  }
}

for (const [density, sizes] of densities) {
  const root = `apps/mobile/android/app/src/main/res/mipmap-${density}`;
  await checkPng(`${root}/ic_launcher.png`, sizes.legacy, true);
  await checkPng(`${root}/ic_launcher_round.png`, sizes.legacy, true);
  await checkPng(`${root}/ic_launcher_foreground.png`, sizes.adaptive, false);
}

for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const path = `apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/${name}`;
  const xml = await readFile(path, 'utf8');
  if (
    !xml.includes('<adaptive-icon') ||
    !xml.includes('@color/ic_launcher_background') ||
    !xml.includes('@mipmap/ic_launcher_foreground')
  ) {
    throw new Error(`${path} must wire the branded adaptive icon layers`);
  }
}

console.log('Android launcher icon branding check passed.');
