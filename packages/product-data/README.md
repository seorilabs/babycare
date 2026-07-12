# Product Data

React Native와 AppsInToss target이 공유하는 local-first 돌봄 기록 데이터 정책이다.

- `care-event-codec.ts`: durable/remote 경계의 canonical `CareEvent` 검증
- `care-event-revision.ts`: revision 비교, canonical payload, platform-neutral SHA-256
- `persistent-care-event-sync-store.ts`: user/group/baby scoped event+outbox envelope, single-writer·serialized persistence·purge
- `local-first-care-event-repository.ts`: local commit, revision 순서 remote drain, reconnect retry, conflict/server snapshot reconcile

runtime dependency는 `@babycare/product-core`만 허용한다. AsyncStorage, Firebase, React Native, Granite/TDS를 import하지 않고 target이 `StringStoragePort`와 `CareEventRemoteStorePort` 구현을 주입한다.

정상 화면 teardown은 repository `quiesce()` 후 lifecycle의 pending verification을 drain하고 `close()`해 cache를 보존한다. sign-out·identity 변경·membership 제거는 `clear()`로 observer/in-flight generation을 폐기하고 storage envelope를 삭제한다. 두 경로가 경쟁하면 `clear()`가 진행 중 close를 purge로 승격하며, 완료된 close 뒤에는 scoped writer claim을 재획득해야만 삭제한다.

현재 순수 정책과 mobile adapter의 결합 회귀 테스트는 `apps/mobile/__tests__/local-first-care-event-repository.test.ts`, revision/hash 테스트는 `apps/mobile/__tests__/care-event-revision.test.ts`에 있다. AIT target 생성 시 같은 port fake를 별도 target integration test에서 다시 검증한다.
