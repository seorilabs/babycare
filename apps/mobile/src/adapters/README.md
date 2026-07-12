# Mobile Adapters

Android/iOS native SDK adapter를 둔다.

예:

- FirebaseAnalyticsAdapter
- CrashReporterAdapter
- RemoteConfigAdapter
- NativeStorageAdapter
- PlayBillingAdapter
- StoreKitAdapter

현재 돌봄 기록 cloud 경로는 다음 adapter를 사용한다.

- `packages/product-data/src/persistent-care-event-sync-store.ts`: 주입형 string storage에 user/group/baby scoped event+revision outbox 단일 envelope 저장
- `packages/product-data/src/local-first-care-event-repository.ts`: local commit 후 background transaction drain, retry/conflict/server snapshot reconcile
- `firebase/firebase-care-event-repository.ts`: Firestore transaction, immutable mutation receipt, active-sleep singleton lock, 서버 확정 `(occurredAt DESC, documentId DESC)` raw page transport

기본 `container.ts`의 local preview와 cloud cache는 자동으로 섞지 않는다.
