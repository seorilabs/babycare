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
  [
    'apps/mobile/src/components/UpdateGateOverlay.tsx',
    'apps/ait/src/components/update-gate-overlay.tsx',
  ],
  [
    'apps/mobile/src/screens/CloudOnboardingScreen.tsx',
    'apps/ait/src/parity/CloudOnboardingScreen.tsx',
  ],
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
    // 생년월일 입력 위젯은 플랫폼별로 다르다: 모바일은 네이티브
    // @react-native-community/datetimepicker를 쓰고, 앱인토스(Granite/RN 0.84
    // 렌더러)는 그 네이티브 모듈이 없어 자체 구현한 BirthDatePicker를 쓴다
    // (birth-date-picker.tsx, #114/#115). 이 위젯 자체의 구현 차이는 대조에서
    // 제외하고, 그 앞뒤의 실제 화면 로직(선택 화면·초대코드 화면·제출 흐름 등)만 대조한다.
    .replace(
      /import DateTimePicker from '@react-native-community\/datetimepicker';\n/,
      '',
    )
    .replace(
      /import \{BirthDatePicker\} from '\.\.\/components\/birth-date-picker';\n/,
      '',
    )
    .replace(
      /function isoCalendarDate\(value: Date\): string \{[\s\S]*?\n\}\n\nfunction dateFromIso\(value: string\): Date \{[\s\S]*?\n\}\n\n/,
      '',
    )
    .replace(/\s*const \[showDatePicker, setShowDatePicker\] = useState\(false\);\n/, '\n')
    .replace(/\s*setShowDatePicker\(false\);\n/g, '\n')
    .replace(
      /\{step === 'birthDate' \? \([\s\S]*?\n(\s*)\) : null\}\n(?=\s*\{step === 'inviteCode')/,
      "$1{/* BIRTH_DATE_FIELD */}\n",
    )
    .replace(
      /\{step === 'birthDate' \? <BirthDatePicker\b[^>]*\/> : null\}\n(?=\s*\{step === 'inviteCode')/,
      '{/* BIRTH_DATE_FIELD */}\n',
    )
    // 위와 같은 이유로, 모바일 전용 날짜 버튼 스타일 3종도 대조에서 뺀다 — 앱인토스는
    // BirthDatePicker 자체 스타일을 쓰고 이 키들이 필요 없다.
    .replace(
      /\s*dateButton: \{[\s\S]*?\n\s*\},\n\s*dateValue: \{[^}]*\},\n\s*dateHint: \{[^}]*\},\n/,
      '\n',
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

// normalize()가 생년월일 입력 위젯 구현 차이를 통째로 지우기 때문에, 그 위젯 자체가
// 양쪽에서 사라지는 회귀는 위 비교로 잡히지 않는다 — 최소한 그 위젯이 실제로
// 남아 있는지는 직접 확인한다.
{
  const [mobilePath, aitPath] = pairs.find(([, p]) =>
    p.endsWith('CloudOnboardingScreen.tsx'),
  );
  assert.ok(
    readFileSync(mobilePath, 'utf8').includes('DateTimePicker'),
    `${mobilePath} must still render its native date picker.`,
  );
  assert.ok(
    readFileSync(aitPath, 'utf8').includes('BirthDatePicker'),
    `${aitPath} must still render its custom date picker.`,
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
