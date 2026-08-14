import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pairs = [
  ['apps/mobile/src/screens/HomeScreen.tsx', 'apps/ait/src/parity/HomeScreen.tsx'],
  ['apps/mobile/src/screens/TimelineScreen.tsx', 'apps/ait/src/parity/TimelineScreen.tsx'],
  ['apps/mobile/src/screens/StatsScreen.tsx', 'apps/ait/src/parity/StatsScreen.tsx'],
  ['apps/mobile/src/screens/MoreScreen.tsx', 'apps/ait/src/parity/MoreScreen.tsx'],
  ['apps/mobile/src/components/QuickRecordModal.tsx', 'apps/ait/src/parity/QuickRecordModal.tsx'],
  ['apps/mobile/src/components/SyncStatusBanner.tsx', 'apps/ait/src/parity/SyncStatusBanner.tsx'],
  ['apps/mobile/src/components/TabBar.tsx', 'apps/ait/src/parity/TabBar.tsx'],
  ['apps/mobile/src/app/format.ts', 'apps/ait/src/parity/format.ts'],
  ['apps/mobile/src/app/i18n/locale.ts', 'apps/ait/src/parity/locale.ts'],
  ['apps/mobile/src/app/i18n/strings.ts', 'apps/ait/src/parity/strings.ts'],
  ['apps/mobile/src/app/theme.ts', 'apps/ait/src/parity/theme.ts'],
  ['apps/mobile/src/app/stats-ranges.ts', 'apps/ait/src/parity/stats-ranges.ts'],
  ['apps/mobile/src/app/session.ts', 'apps/ait/src/parity/session.ts'],
];

function normalize(source) {
  return source
    .replace(/import React(?:, \{([^}]*)\})? from 'react';/g, (_match, names) =>
      names ? `import {${names}} from 'react';` : '',
    )
    .replaceAll("'@babycare/product-core'", "'CORE'")
    .replaceAll("'@babycare/product-data'", "'DATA'")
    .replaceAll("'../../../../packages/product-core/src/index.ts'", "'CORE'")
    .replaceAll("'../../../../packages/product-data/src/index.ts'", "'DATA'")
    .replace(/'\.\.\/app\/i18n'/g, "'./strings'")
    .replaceAll("'./i18n'", "'./strings'")
    .replace(/'\.\.\/app\/(format|session|theme|stats-ranges)'/g, "'./$1'")
    .replace(/\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps/g, '')
    .replace(/\s+/g, '')
    .replace(/,([}\]])/g, '$1');
}

for (const [mobilePath, aitPath] of pairs) {
  assert.equal(
    normalize(readFileSync(aitPath, 'utf8')),
    normalize(readFileSync(mobilePath, 'utf8')),
    `AIT UI source drifted from mobile: ${aitPath}`,
  );
}

console.log(`AIT UI source parity check passed (${pairs.length} source pairs).`);
