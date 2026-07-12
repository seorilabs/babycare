/* eslint-env jest, node */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

describe('buildStatsRanges daylight-saving boundary', () => {
  it('uses a 23-hour local calendar day when daylight saving begins', () => {
    const duration = execFileSync(
      process.execPath,
      [
        '--no-warnings',
        '--experimental-strip-types',
        '--input-type=module',
        '--eval',
        [
          "const {buildStatsRanges}=await import('./src/app/stats-ranges.ts')",
          'const now=new Date(2026,2,9,12).getTime()',
          "const range=buildStatsRanges(now,'7d').find(({from})=>{const date=new Date(from);return date.getMonth()===2&&date.getDate()===8})",
          'process.stdout.write(String(range.to-range.from))',
        ].join(';'),
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, TZ: 'America/New_York' },
        encoding: 'utf8',
      },
    );

    expect(Number(duration)).toBe(23 * 60 * 60 * 1_000);
  });
});
