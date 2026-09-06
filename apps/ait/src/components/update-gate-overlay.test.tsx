import React from 'react';
import {Linking, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {createStrings} from '@babycare/product-ui';
import {UpdateGateOverlay} from './update-gate-overlay';

const ko = createStrings('ko');
const en = createStrings('en');
const HANGUL = /[가-힣]/;

function existsByTestId(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): boolean {
  return (
    renderer.root.findAll(node => node.props.testID === testID).length > 0
  );
}

function pressByTestId(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): void {
  const [node] = renderer.root.findAll(
    n => n.props.testID === testID && typeof n.props.onPress === 'function',
  );
  if (node == null) {
    throw new Error(`no pressable node with testID ${testID}`);
  }
  act(() => {
    node.props.onPress();
  });
}

beforeEach(() => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('state가 null이면 아무것도 렌더링하지 않는다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay state={null} onDismiss={() => {}} strings={ko} />,
    );
  });

  expect(renderer.toJSON()).toBeNull();
});

test('ok면 아무것도 렌더링하지 않는다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay state={{kind: 'ok'}} onDismiss={() => {}} strings={ko} />,
    );
  });

  expect(renderer.toJSON()).toBeNull();
});

test('recommended로 떠 있다가 ok로 바뀌면 내려간다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{
          kind: 'recommended',
          message: 'm',
          updateUrl: 'https://play.google.com/x',
        }}
        onDismiss={() => {}}
        strings={ko}
      />,
    );
  });
  expect(renderer.toJSON()).not.toBeNull();

  act(() => {
    renderer.update(
      <UpdateGateOverlay state={{kind: 'ok'}} onDismiss={() => {}} strings={ko} />,
    );
  });

  expect(renderer.toJSON()).toBeNull();
});

test('recommended면 업데이트·나중에 버튼을 모두 그린다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{
          kind: 'recommended',
          message: '새 버전이 나왔어요',
          updateUrl: 'https://play.google.com/store/apps/details?id=x',
        }}
        onDismiss={() => {}}
        strings={ko}
      />,
    );
  });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(true);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(true);
  expect(
    renderer.root.findAllByType(Text).map(node => node.props.children),
  ).toContain('새 버전이 나왔어요');
});

test('required면 닫기(나중에) 버튼이 없다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{
          kind: 'required',
          message: '업데이트가 필요해요',
          updateUrl: 'https://play.google.com/store/apps/details?id=x',
        }}
        onDismiss={() => {}}
        strings={ko}
      />,
    );
  });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(true);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(false);
});

test('updateUrl이 없으면 어떤 버튼도 그리지 않는다(강제·점검 폴백)', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{kind: 'required', message: '업데이트가 필요해요'}}
        onDismiss={() => {}}
        strings={ko}
      />,
    );
  });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(false);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(false);
});

test('maintenance는 점검 문구를 보여주고 버튼이 없다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{kind: 'maintenance', message: '지금 점검 중이에요'}}
        onDismiss={() => {}}
        strings={ko}
      />,
    );
  });

  expect(existsByTestId(renderer, 'update-gate-update-button')).toBe(false);
  expect(existsByTestId(renderer, 'update-gate-later-button')).toBe(false);
  expect(
    renderer.root.findAllByType(Text).map(node => node.props.children),
  ).toContain('지금 점검 중이에요');
});

test('나중에를 누르면 onDismiss가 호출된다', () => {
  const onDismiss = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{
          kind: 'recommended',
          message: 'm',
          updateUrl: 'https://play.google.com/x',
        }}
        onDismiss={onDismiss}
        strings={ko}
      />,
    );
  });

  pressByTestId(renderer, 'update-gate-later-button');

  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('ko 로케일이면 지금과 같은 「업데이트하기」·「나중에」가 나온다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{
          kind: 'recommended',
          message: 'm',
          updateUrl: 'https://play.google.com/x',
        }}
        onDismiss={() => {}}
        strings={ko}
      />,
    );
  });

  const texts = renderer.root
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(texts).toContain('업데이트하기');
  expect(texts).toContain('나중에');
});

test('en 로케일로 그리면 한글이 하나도 남지 않는다(#112)', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{
          kind: 'recommended',
          message: 'A new version is available.',
          updateUrl: 'https://play.google.com/x',
        }}
        onDismiss={() => {}}
        strings={en}
      />,
    );
  });

  const texts = renderer.root
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(texts).toContain('Update');
  expect(texts).toContain('Later');
  for (const text of texts) {
    expect(String(text)).not.toMatch(HANGUL);
  }
});

test('업데이트하기를 누르면 스토어 주소를 연다', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <UpdateGateOverlay
        state={{
          kind: 'recommended',
          message: 'm',
          updateUrl: 'https://play.google.com/store/apps/details?id=x',
        }}
        onDismiss={() => {}}
        strings={ko}
      />,
    );
  });

  pressByTestId(renderer, 'update-gate-update-button');

  expect(Linking.openURL).toHaveBeenCalledWith(
    'https://play.google.com/store/apps/details?id=x',
  );
});
