import {eventId, type IdGeneratorPort} from '@babycare/product-core';

export class NativeIdGenerator implements IdGeneratorPort {
  #sequence = 0;

  nextEventId() {
    this.#sequence += 1;
    const random = Math.random().toString(36).slice(2, 12);
    return eventId(`${Date.now().toString(36)}-${this.#sequence.toString(36)}-${random}`);
  }
}
