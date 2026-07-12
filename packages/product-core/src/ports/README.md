# Ports

platform adapter가 구현할 interface를 둔다.

현재 제품 경계:

- `CareEventRepositoryPort`: 로컬 durable command/query와 observer
- `CareEventPageRepositoryPort`: Firestore와 동일한
  `(occurredAt DESC, documentId DESC)` cursor page
- `CareEventRemoteStorePort`: revision mutation, legacy full snapshot, server-only raw page transport
- `AuthPort`, `CareGroupRepositoryPort`, `BabyRepositoryPort`,
  `InviteServicePort`
- `StringStoragePort`, `ClockPort`, `IdGeneratorPort`, `AnalyticsPort`

타임라인 page cursor는 soft-delete 여부나 local pending 상태가 아니라 raw server
event의 `occurredAt`과 `eventId`만 사용한다. target adapter는 soft-deleted row도
page 경계 계산에 포함하고 화면 projection에서만 숨긴다.
