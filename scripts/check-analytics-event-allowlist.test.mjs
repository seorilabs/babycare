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
