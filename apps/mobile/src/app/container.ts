import {
  createEndSleepSession,
  createRecordCareEvent,
  createSoftDeleteCareEvent,
  type AnalyticsPort,
} from '@babycare/product-core';

import {PersistentCareEventRepository} from '../adapters/local/persistent-care-event-repository';
import {LocalSessionRepository} from '../adapters/local/local-session-repository';
import {NativeIdGenerator} from '../adapters/system/native-id-generator';

const repository = new PersistentCareEventRepository();
const clock = {now: () => Date.now()};
const analytics: AnalyticsPort = {
  async track() {
    // Firebase Analytics adapter is wired only after the dev Firebase app is registered.
  },
};

export const appContainer = {
  repository,
  sessionRepository: new LocalSessionRepository(),
  recordCareEvent: createRecordCareEvent({
    repository,
    clock,
    analytics,
    idGenerator: new NativeIdGenerator(),
  }),
  endSleepSession: createEndSleepSession({repository, clock, analytics}),
  softDeleteCareEvent: createSoftDeleteCareEvent({repository, clock, analytics}),
};
