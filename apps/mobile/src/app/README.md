# Mobile App Layer

React Native UI, navigation, lifecycle, composition root를 둔다.

Core use case와 adapter를 여기서 연결한다.

- `container.ts`: Firebase 설정 전 local preview composition
- `care-context.ts`: Auth identity·membership·group·baby 일치 검증
- `care-event-container.ts`: 인증된 context에서만 scoped outbox와 core use case를 조립하고 정상 `dispose` 시 cache 보존 teardown
- `care-session-lifecycle.ts`: Auth/remote 오류에서 identity·membership 제거를 재확인한 뒤 observer 중단과 cache purge
