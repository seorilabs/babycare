// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

// `granite build`는 granite.config.ts의 esbuild define으로 값을 넣지만 `granite dev`는
// Metro/babel 경로라 그 define이 적용되지 않는다. 그래서 dev 번들에서는
// `process.env.FIREBASE_WEB_API_KEY`가 비어 첫 화면이 Firebase 연결 오류로 멈춘다.
// 두 경로가 같은 값을 보도록 babel에서 인라인한다. CI는 환경변수로, 로컬은 gitignore된
// `apps/ait/.env`로 주입한다.
const INLINED_ENV_KEYS = ['FIREBASE_WEB_API_KEY'];

function readDotenv() {
  const file = path.join(__dirname, '.env');
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const values = {};
  for (const line of raw.split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function resolveInlinedEnv() {
  const dotenv = readDotenv();
  const values = {};
  for (const key of INLINED_ENV_KEYS) {
    // 환경변수가 우선이라 CI 동작은 바뀌지 않는다.
    const value = process.env[key] ?? dotenv[key];
    if (value) {
      values[key] = value;
    }
  }
  return values;
}

// 값이 있는 키만 문자열 리터럴로 바꾼다. 값이 없으면 원본 표현식을 그대로 두어
// `?? ''` fallback과 build 경로의 define이 그대로 동작한다.
function inlineEnvPlugin({types: t}, options) {
  const values = options.values ?? {};
  return {
    name: 'inline-granite-env',
    visitor: {
      MemberExpression(nodePath) {
        const {node} = nodePath;
        if (node.computed || !t.isIdentifier(node.property)) {
          return;
        }
        const value = values[node.property.name];
        if (value === undefined) {
          return;
        }
        // `process.env.X ??= '...'`처럼 대입 대상이면 리터럴로 바꿀 수 없다.
        const parent = nodePath.parent;
        if (
          (t.isAssignmentExpression(parent) && parent.left === node) ||
          (t.isUpdateExpression(parent) && parent.argument === node) ||
          (t.isUnaryExpression(parent, {operator: 'delete'}) && parent.argument === node)
        ) {
          return;
        }
        const object = node.object;
        if (
          !t.isMemberExpression(object) ||
          object.computed ||
          !t.isIdentifier(object.object, {name: 'process'}) ||
          !t.isIdentifier(object.property, {name: 'env'})
        ) {
          return;
        }
        nodePath.replaceWith(t.stringLiteral(value));
      },
    },
  };
}

module.exports = function babelConfig(api) {
  // jest는 node에서 그대로 실행돼 process.env를 읽을 수 있으므로 인라인하지 않는다.
  // 인라인하면 jest.setup의 테스트용 기본값이 무시된다.
  const values = api.env('test') ? {} : resolveInlinedEnv();
  // 주입값이 바뀌면 babel 캐시를 무효화한다.
  api.cache.invalidate(() => JSON.stringify(values));
  return {
    presets: ['babel-preset-granite'],
    plugins: [[inlineEnvPlugin, {values}]],
  };
};

module.exports.inlineEnvPlugin = inlineEnvPlugin;
module.exports.resolveInlinedEnv = resolveInlinedEnv;
