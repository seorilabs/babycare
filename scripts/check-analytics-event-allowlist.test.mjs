import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const portSource = await readFile(
  new URL('../packages/product-core/src/ports/analytics.ts', import.meta.url),
  'utf8',
);
const relaySource = await readFile(
  new URL('../firebase/functions/src/analytics-service.ts', import.meta.url),
  'utf8',
);
const platformAllowlist = JSON.parse(
  await readFile(
    new URL('../firebase/platform-event-allowlist.json', import.meta.url),
    'utf8',
  ),
);

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function productEventNames(source) {
  return sorted(
    new Set(
      [...source.matchAll(/readonly name:\s*'([a-z0-9_]+)'/g)].map(
        match => match[1],
      ),
    ),
  );
}

function relayAllowlist(source) {
  const block = /const ALLOWED_EVENT_NAMES = new Set\(\[([\s\S]*?)\]\);/.exec(
    source,
  );
  assert.ok(block, 'GA4 relay must declare ALLOWED_EVENT_NAMES as a Set literal');
  return sorted(
    new Set([...block[1].matchAll(/'([a-z0-9_]+)'/g)].map(match => match[1])),
  );
}

test('GA4 relay allowlist stays in sync with the product analytics contract', () => {
  const productEvents = productEventNames(portSource);
  assert.ok(
    productEvents.length > 0,
    'product analytics contract must declare event names',
  );
  // AppsInToss는 이 callable을 유일한 GA4 경로로 쓴다. 목록이 어긋나면 새 이벤트가
  // invalid-argument로 거부되고 같은 배치의 다른 이벤트까지 재시도에 묶인다.
  assert.deepEqual(relayAllowlist(relaySource), productEvents);
});

// Platform 수집은 allowlist 밖 이름을 오류가 아니라 200 OK 안의 dropped 로 조용히
// 버린다(seorilabs/platform 의 server/internal/events/handler.go). 앱에서는 정상
// 수집과 구분되지 않으므로, 계약과 등록 목록이 갈리는 것을 배포 전에 여기서 잡는다.
test('Platform 수집 등록 목록이 제품 이벤트 계약과 정확히 일치한다', () => {
  const productEvents = productEventNames(portSource);
  const registered = platformAllowlist.registered ?? [];
  const pending = platformAllowlist.pendingRegistration ?? [];

  const overlap = registered.filter(name => pending.includes(name));
  assert.deepEqual(
    overlap,
    [],
    `등록과 등록 대기에 같은 이름이 있습니다: ${overlap.join(', ')}`,
  );

  const listed = sorted(new Set([...registered, ...pending]));
  const missing = productEvents.filter(name => !listed.includes(name));
  const extra = listed.filter(name => !productEvents.includes(name));

  assert.deepEqual(
    missing,
    [],
    'firebase/platform-event-allowlist.json 에 없는 계약 이벤트가 있습니다.'
      + ` 등록 여부를 정해 registered 또는 pendingRegistration 에 넣으세요: ${missing.join(', ')}`,
  );
  assert.deepEqual(
    extra,
    [],
    'firebase/platform-event-allowlist.json 에만 있고 제품 이벤트 계약에 없는 이름이 있습니다.'
      + ` 계약에서 지운 이름이면 이 파일에서도 지우세요: ${extra.join(', ')}`,
  );
});
