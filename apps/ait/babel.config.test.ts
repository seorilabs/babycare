// `granite dev`가 esbuild define을 적용하지 않아 babel에서 환경변수를 인라인한다.
// 잘못 인라인하면 dev 번들이 조용히 깨지므로 치환 규칙을 고정한다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {transformSync} = require('@babel/core');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {inlineEnvPlugin} = require('./babel.config.js');

function transform(code: string): string {
  const result = transformSync(code, {
    babelrc: false,
    configFile: false,
    plugins: [[inlineEnvPlugin, {values: {FIREBASE_WEB_API_KEY: 'inlined-key'}}]],
  });
  return String(result?.code);
}

describe('inlineEnvPlugin', () => {
  it('읽기 위치의 process.env 값을 문자열 리터럴로 바꾼다', () => {
    const output = transform("const k = process.env.FIREBASE_WEB_API_KEY ?? '';");
    expect(output).toContain('inlined-key');
    expect(output).not.toContain('process.env.FIREBASE_WEB_API_KEY');
  });

  it('대입 대상은 그대로 둔다', () => {
    const output = transform("process.env.FIREBASE_WEB_API_KEY ??= 'fallback';");
    expect(output).toContain('process.env.FIREBASE_WEB_API_KEY');
    expect(output).not.toContain("'inlined-key'");
  });

  it('주입 대상이 아닌 키는 건드리지 않는다', () => {
    expect(transform('const n = process.env.NODE_ENV;')).toContain(
      'process.env.NODE_ENV',
    );
  });

  it('process.env가 아닌 동일 이름 속성은 건드리지 않는다', () => {
    expect(transform('const k = config.FIREBASE_WEB_API_KEY;')).toContain(
      'config.FIREBASE_WEB_API_KEY',
    );
  });
});
