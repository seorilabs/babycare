// Metro와 Granite 번들러가 정의하는 전역이다. Node 테스트처럼 번들러를 거치지
// 않는 실행에는 없다.
declare const __DEV__: boolean | undefined;

/**
 * 지금 실행 중인 번들이 개발용 빌드인지. 마켓 출시 번들은 `__DEV__=false`로
 * 만들어지므로 여기서 false가 된다.
 */
export function isDevelopmentBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/**
 * Platform 요청에 붙이는 빌드 표시 헤더다. 개발용 빌드에만 `X-Seori-Build: debug`를
 * 붙이고, 마켓 출시 빌드에는 아무것도 붙이지 않는다.
 *
 * Platform은 이 표시가 있는 요청을 그대로 처리하되 운영 관측(신규 가입 알림·버전
 * 최초 관측·이벤트 수집·presence·광고 보상 알림·사용자 수)에서 뺀다. QA 기기가
 * 운영 서버에 붙어도 가짜 가입 알림과 지표 오염이 생기지 않게 한다. 사람이 빌드마다
 * 켜고 끄는 값이면 결국 빠지므로 번들러의 개발 표시를 그대로 따른다.
 */
export function platformBuildHeaders(
  debugBuild: boolean = isDevelopmentBuild(),
): Readonly<Record<string, string>> {
  return debugBuild ? {'X-Seori-Build': 'debug'} : {};
}
