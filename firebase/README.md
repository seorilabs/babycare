# Firebase

Firebase Rules, indexes, Emulator 테스트와 privileged Functions를 둔다. 실제 Firebase project ID나 production 자격증명 없이 로컬 규칙·초대 transaction을 검증할 수 있다.

## 구조

- `firestore.rules`: 그룹 멤버십, event revision, active-sleep singleton lock, mutation receipt 접근 통제
- `firestore.indexes.json`: 아기별/종류별 event 타임라인 index
- `storage.rules`: 그룹-scoped 아기 이미지 접근 통제
- `firebase.json`: Firestore/Storage/Functions Emulator와 Node.js 22 runtime 설정
- `firebase.mobile.json`: 실기기 개발을 위해 Auth/Firestore/Storage/Functions Emulator를 LAN에 bind하는 별도 설정
- `firebase.functions-test.json`: 연속 실행 port race를 피하는 Functions transaction 전용 Firestore 8086 설정
- `tests/security-rules.test.mjs`: client Rules allow/deny와 active-sleep 동시 시작 경쟁 회귀 테스트
- `tests/mobile-shared-flow.test.mjs`: 익명 사용자 2명의 그룹 생성·초대·실시간 기록·멤버 제거 통합 테스트
- `functions/src/`: `createInvite`, `acceptInvite`, HMAC/rate-limit/transaction 구현
- `functions/tests/`: 순수 unit 및 Firestore Emulator transaction 테스트
- `.firebaserc.example`: 실제 project 확정 전 placeholder

## 검증

```bash
pnpm run test:firebase
pnpm run test:functions
pnpm run test:functions:emulator
pnpm run test:firebase:mobile-flow
```

`babycare-rules-test`, `babycare-functions-test`, `demo-babycare`는 로컬 Emulator 전용 project ID다. 이 명령들은 production resource를 만들거나 deploy하지 않는다. `test:firebase:mobile-flow`는 독립 익명 client 2개로 owner 그룹/아기 생성, callable 초대 발급·수락, member의 realtime event 수신과 멤버 제거 후 접근 거부를 검증한다. 실제 Firebase project, App Check, 실제 기기 2대와 offline/restart/reconnect 증거는 별도다.

## Mobile 개발 runtime

개발 빌드는 native Firebase client config가 없을 때 `demo-babycare` Emulator runtime을 사용한다. 실기기에서 Mac의 Emulator에 접근하려면 첫 터미널에서 다음을 실행한다.

```bash
pnpm run firebase:mobile
```

별도 터미널에서 Metro와 target을 실행한다.

```bash
pnpm --dir apps/mobile exec react-native start --host 0.0.0.0
pnpm --dir apps/mobile exec react-native run-ios --udid <DEVICE_UDID> --no-packager
```

Android는 마지막 명령을 `pnpm --dir apps/mobile exec react-native run-android --no-packager`로 바꾼다. runtime은 Metro bundle URL의 host를 사용해 Auth 9099, Firestore 8085, Functions 5001에 연결한다. `firebase.mobile.json`은 Emulator를 LAN에 노출하므로 신뢰할 수 있는 개발 네트워크에서만 사용한다. 스크립트가 만드는 `firebase/functions/.secret.local`은 Emulator 전용 HMAC secret이며 ignore 대상이다.

native Firebase app이 등록된 빌드는 Emulator로 fallback하지 않고 cloud mode를 사용한다. 이 경우 실제 client config와 Functions region을 명시해야 한다. 현재 실제 project ID/region/client config, production Auth provider, App Check와 deployment approval은 모두 미확정 또는 미승인 상태다.

돌봄 기록 remote adapter는 `setDoc` offline queue를 UI completion으로 사용하지 않는다. user/group/baby scoped custom outbox가 revision mutation을 보존하고, online Firestore transaction이 event와 `eventMutationReceipts/{eventId@revision@payloadHash}`를 원자 적용한다. Rules는 event의 마지막 mutation metadata와 receipt를 양방향 결합하며 active sleep은 `activeSleeps/{babyId}` lock을 같은 transaction에서 만들고 제거한다. 실제 composition에서는 Firestore native disk persistence를 꺼 custom outbox를 유일한 durable queue로 유지해야 한다.

BabyCare Firestore Emulator는 다른 로컬 앱/Metro와 충돌하지 않도록 Rules 8085, Functions transaction 8086을 사용한다.

## Deploy-time params

- `FUNCTIONS_REGION`: `확정 필요`
- `INVITE_CODE_HMAC_KEY`: `확정 필요`, Secret Manager 전용
- `INVITE_TTL_HOURS`: 기본 24
- `INVITE_CREATE_LIMIT_PER_HOUR`: 기본 10
- `INVITE_ACCEPT_LIMIT_PER_HOUR`: 기본 20
- `ENFORCE_APP_CHECK`: 기본 false, AppsInToss 검증 후 출시 전 결정

## 금지

- service account JSON commit
- private key/`.secret.local` commit
- Admin SDK credential client app 포함
- client의 `invites`, `auditLogs`, `functionRateLimits` 직접 read/write
- raw invite code를 Firestore/audit/log에 저장
- Storage 공개 download token URL을 Firestore에 영구 저장
