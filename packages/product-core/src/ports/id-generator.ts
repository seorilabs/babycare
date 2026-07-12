import type { EventId } from '../domain/ids.ts';

export interface IdGeneratorPort {
  nextEventId(): EventId;
}
