import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pairs = [
  ['apps/mobile/src/screens/HomeScreen.tsx', 'apps/ait/src/parity/HomeScreen.tsx'],
  ['apps/mobile/src/screens/TimelineScreen.tsx', 'apps/ait/src/parity/TimelineScreen.tsx'],
  ['apps/mobile/src/screens/StatsScreen.tsx', 'apps/ait/src/parity/StatsScreen.tsx'],
  ['apps/mobile/src/screens/MoreScreen.tsx', 'apps/ait/src/parity/MoreScreen.tsx'],
  ['apps/mobile/src/components/QuickRecordModal.tsx', 'apps/ait/src/parity/QuickRecordModal.tsx'],
  ['apps/mobile/src/components/SyncStatusBanner.tsx', 'apps/ait/src/parity/SyncStatusBanner.tsx'],
  ['apps/mobile/src/app/format.ts', 'apps/ait/src/parity/format.ts'],
  ['apps/mobile/src/app/stats-ranges.ts', 'apps/ait/src/parity/stats-ranges.ts'],
  ['apps/mobile/src/app/session.ts', 'apps/ait/src/parity/session.ts'],
];

const tabBarPair = [
  'apps/mobile/src/components/TabBar.tsx',
  'apps/ait/src/parity/TabBar.tsx',
];

function stripFormattingWhitespace(source) {
  let result = '';
  let quote;
  let escaped = false;
  for (const character of source) {
    if (quote) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character;
      result += character;
    } else if (!/\s/.test(character)) {
      result += character;
    }
  }
  return result;
}

function normalize(source) {
  const rewritten = source
    .replace(/Platform,\s*/g, '')
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
    .replace(
      /import\s+\{aitBottomInset(?:,\s*aitTopInset)?\}\s+from\s+'\.\/system-insets';/g,
      '',
    )
    .replace(/\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps/g, '')
    .replace(/^\s*\/\/[^\n]*(?:\n|$)/gm, '');
  // Keep string and template literal whitespace intact because it can be
  // user-visible copy. Only formatting whitespace outside literals is ignored.
  return stripFormattingWhitespace(rewritten)
    .replace(/constbottomInset=aitBottomInset\(insets\.bottom,Platform\.OS\);/g, '')
    .replace(/consttopInset=aitTopInset\(insets\.top,Platform\.OS\);/g, '')
    .replace(/Platform\.OS==='ios'\?'padding':'height'/g, "Platform.OS==='ios'?'padding':undefined")
    .replace(/testID="quick-record-header"/g, '')
    .replace(/testID="quick-record-footer"/g, '')
    .replace(/,minHeight:58\+topInset,paddingTop:topInset/g, '')
    .replace(/Math\.max\(24,bottomInset\+8\)/g, 'Math.max(16,insets.bottom+8)')
    .replace(/Math\.max\(6,bottomInset\)/g, 'Math.max(6,insets.bottom)')
    .replace(/,([}\]])/g, '$1');
}

assert.ok(
  normalize("const url = 'https://example.com/path';").includes(
    "'https://example.com/path'",
  ),
  'Parity normalization must preserve URL literals.',
);

for (const [mobilePath, aitPath] of pairs) {
  assert.equal(
    normalize(readFileSync(aitPath, 'utf8')),
    normalize(readFileSync(mobilePath, 'utf8')),
    `AIT UI source drifted from mobile: ${aitPath}`,
  );
}

function tabContract(source) {
  return [
    ...source.matchAll(
      /\{\s*id:\s*'([^']+)'\s*,\s*icon:\s*'[^']+'\s*,\s*label:\s*(?:\(\s*strings\s*\)|strings)\s*=>\s*strings\.tabs\.([A-Za-z_$][A-Za-z0-9_$]*)\s*,?\s*\}/g,
    ),
  ].map(([, id, label]) => ({id, label}));
}

assert.deepEqual(
  tabContract("{ id: 'timeline2', icon: '≡', label: (strings) => strings.tabs.timeline_v2 }"),
  [{id: 'timeline2', label: 'timeline_v2'}],
  'Tab contract parser must preserve the full destination identifier.',
);

const mobileTabs = tabContract(readFileSync(tabBarPair[0], 'utf8'));
const aitTabs = tabContract(readFileSync(tabBarPair[1], 'utf8'));

assert.ok(
  mobileTabs.length > 0,
  `Failed to parse tab contract: ${tabBarPair[0]}`,
);
assert.ok(
  aitTabs.length > 0,
  `Failed to parse tab contract: ${tabBarPair[1]}`,
);
assert.ok(
  aitTabs.length >= 2 && aitTabs.length <= 5,
  `${tabBarPair[1]} must contain between two and five tabs.`,
);
assert.deepEqual(
  aitTabs,
  mobileTabs,
  `${tabBarPair[1]} destinations drifted from ${tabBarPair[0]}.`,
);

console.log(
  `AIT UI source parity check passed (${pairs.length} source pairs + tab contract).`,
);
