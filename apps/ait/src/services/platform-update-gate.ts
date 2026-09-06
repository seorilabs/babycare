import {
  evaluateUpdateGate,
  type UpdateGateState,
} from '../../../../packages/product-core/src/index.ts';
import {AIT_APP_VERSION, aitPresencePlatform} from './platform-presence';

/**
 * 로그인(부트스트랩) 뒤 서버 판정을 가져와 화면에 반영할 상태를 돌려준다.
 *
 * Presence 활성화 여부와 무관하게 동작한다 — `/v1/config`는 세션 없이도
 * 조회할 수 있다. 설정 조회가 던져도 null로 흡수한다: 업데이트 안내는 부가
 * 기능이고, 이 실패가 부트스트랩 결과를 막아서는 안 된다(#110).
 */
export async function checkAitUpdateGate(): Promise<UpdateGateState | null> {
  try {
    await aitPresencePlatform.config.fetch({
      appVersion: AIT_APP_VERSION,
      platform: 'ait',
    });
    const state = await evaluateUpdateGate(aitPresencePlatform.config);
    if (state != null) {
      await aitPresencePlatform.config.markPrompted(state);
    }
    return state;
  } catch {
    return null;
  }
}
