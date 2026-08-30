import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {eventId} from '@babycare/product-core';
import {createTheme} from '@babycare/product-ui';
import { createStrings } from '@babycare/product-ui';
import {SyncStatusBanner} from '../src/components/SyncStatusBanner';

describe('SyncStatusBanner', () => {
  const theme = createTheme(false);

  it('stays hidden when every event is synced', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SyncStatusBanner
          onRetry={jest.fn()}
          states={[
            {
              eventId: eventId('event-1'),
              status: 'synced',
              attempts: 0,
              pendingRevisions: [],
            },
          ]}
          strings={createStrings('ko')}
          theme={theme}
        />,
      );
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('shows a retry action only for retryable failures', async () => {
    const onRetry = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SyncStatusBanner
          onRetry={onRetry}
          states={[
            {
              eventId: eventId('event-1'),
              status: 'failed',
              attempts: 2,
              pendingRevisions: [1],
              failureKind: 'retryable',
            },
          ]}
          strings={createStrings('ko')}
          theme={theme}
        />,
      );
    });
    const button = renderer.root.findByProps({
      accessibilityLabel: '동기화 다시 시도',
    });
    button.props.onPress();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('explains a conflict without offering a blind retry', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SyncStatusBanner
          onRetry={jest.fn()}
          states={[
            {
              eventId: eventId('event-1'),
              status: 'failed',
              attempts: 1,
              pendingRevisions: [1],
              failureKind: 'conflict',
            },
          ]}
          strings={createStrings('ko')}
          theme={theme}
        />,
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('동기화 충돌 1건');
    expect(
      renderer.root.findAllByProps({accessibilityLabel: '동기화 다시 시도'}),
    ).toHaveLength(0);
  });
});
