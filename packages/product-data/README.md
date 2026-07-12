# Product Data

React Native와 AppsInToss target이 공유하는 local-first 돌봄 기록 데이터 정책이다.

- `care-event-codec.ts`: durable/remote 경계의 canonical `CareEvent` 검증
- `care-event-revision.ts`: revision 비교, canonical payload, platform-neutral SHA-256
- `persistent-care-event-sync-store.ts`: user/group/baby scoped event+outbox envelope, single-writer·serialized persistence·purge
- `local-first-care-event-repository.ts`: local commit, revision 순서 remote drain, reconnect retry, conflict/server snapshot reconcile
- `care-event-timeline-feed.ts`: server raw page를 bounded prefix로 유지하고 page 경계 변경 시 HEAD부터 원자 rebase하는 timeline coordinator

runtime dependency는 `@babycare/product-core`만 허용한다. AsyncStorage, Firebase, React Native, Granite/TDS를 import하지 않고 target이 `StringStoragePort`와 `CareEventRemoteStorePort` 구현을 주입한다.

정상 화면 teardown은 repository `quiesce()` 후 lifecycle의 pending verification을 drain하고 `close()`해 cache를 보존한다. sign-out·identity 변경·membership 제거는 `clear()`로 observer/in-flight generation을 폐기하고 storage envelope를 삭제한다. 두 경로가 경쟁하면 `clear()`가 진행 중 close를 purge로 승격하며, 완료된 close 뒤에는 scoped writer claim을 재획득해야만 삭제한다.

timeline cache envelope v2는 soft-delete tombstone을 포함한 raw server ID와 `(occurredAt, eventId)` end cursor를 별도로 저장한다. live page 하나라도 바뀌면 로드된 prefix 전체를 HEAD부터 다시 조회해 한 번에 교체한다. authoritative prefix 밖 synced row는 제거하되 pending/failed/conflict와 active-sleep singleton projection은 보존한다. `pageSize`, `maxCachedEvents`, `maxScanPagesPerLoad`는 target composition이 명시적으로 주입하며, Home/Stats projection은 이 bounded timeline을 completeness source로 사용하지 않는다.

cloud container에서는 `LocalFirstCareEventRepository`를 `external_pages` mode로 구성하고 인증 scope마다 명시적 config의 `CareEventTimelineFeed` 하나를 즉시 시작한다. 따라서 기존 전체 baby listener·0개 feed·복수 feed가 원격 prefix를 경쟁할 수 없다. server-confirmed page 뒤에는 retryable/unauthenticated mutation을 requeue·flush하며, 확인된 Auth/membership 복구 뒤 feed를 다시 bind한다. Home/Stats를 cloud 화면에 연결하기 전에는 기간별 독립 projection 또는 server aggregate를 별도로 구성해야 한다.

현재 순수 정책과 mobile adapter의 결합 회귀 테스트는 `apps/mobile/__tests__/local-first-care-event-repository.test.ts`, revision/hash 테스트는 `apps/mobile/__tests__/care-event-revision.test.ts`에 있다. AIT target 생성 시 같은 port fake를 별도 target integration test에서 다시 검증한다.
