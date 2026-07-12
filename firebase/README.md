# Firebase

Firebase Rules, indexes, Emulator 테스트와 privileged Functions를 둔다. 실제 Firebase project ID나 production 자격증명 없이 로컬 규칙·초대 transaction을 검증할 수 있다.

## 구조

- `firestore.rules`: 그룹 멤버십 기반 Firestore 접근 통제
- `firestore.indexes.json`: 아기별/종류별 event 타임라인 index
- `storage.rules`: 그룹-scoped 아기 이미지 접근 통제
- `firebase.json`: Firestore/Storage/Functions Emulator와 Node.js 22 runtime 설정
- `firebase.functions-test.json`: 연속 실행 port race를 피하는 Functions transaction 전용 Firestore 8086 설정
- `tests/security-rules.test.mjs`: client Rules allow/deny 회귀 테스트
- `functions/src/`: `createInvite`, `acceptInvite`, HMAC/rate-limit/transaction 구현
- `functions/tests/`: 순수 unit 및 Firestore Emulator transaction 테스트
- `.firebaserc.example`: 실제 project 확정 전 placeholder

## 검증

```bash
pnpm run test:firebase
pnpm run test:functions
pnpm run test:functions:emulator
```

`babycare-rules-test`, `babycare-functions-test`는 로컬 Emulator 전용 project ID다. 이 명령들은 production resource를 만들거나 deploy하지 않는다.

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
