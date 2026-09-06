import {Storage} from '@apps-in-toss/framework';
import type {GatePromptLog, GateStore} from '@seorilabs/platform-sdk';

const UPDATE_GATE_STORAGE_KEY = 'babycare:update-gate';

function isGatePromptLog(value: unknown): value is GatePromptLog {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const log = value as Partial<GatePromptLog>;
  return typeof log.version === 'string' && typeof log.promptedAt === 'number';
}

/**
 * SDK 기본 gateStore는 브라우저 `localStorage`를 찾는데, AIT(Granite RN)에는
 * 그게 없어 메모리로 떨어진다 — 앱을 다시 켤 때마다 권장 안내가 다시 뜬다.
 * `@apps-in-toss/framework`의 `Storage`로 노출 이력을 영속한다.
 */
export function createAitGateStore(): GateStore {
  return {
    async load() {
      try {
        const raw = await Storage.getItem(UPDATE_GATE_STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const value: unknown = JSON.parse(raw);
        return isGatePromptLog(value) ? value : null;
      } catch {
        return null;
      }
    },
    async save(log: GatePromptLog) {
      try {
        await Storage.setItem(UPDATE_GATE_STORAGE_KEY, JSON.stringify(log));
      } catch {
        // 저장 실패가 안내 노출을 막으면 안 된다. 다음에 한 번 더 뜰 뿐이다.
      }
    },
  };
}
