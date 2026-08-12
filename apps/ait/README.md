# 함께봄 AppsInToss target

AppsInToss Console에서 승인된 `babynest` Granite React Native target이다.

## 명령

```bash
pnpm --dir apps/ait lint
pnpm --dir apps/ait typecheck
pnpm --dir apps/ait test
pnpm --dir apps/ait build
```

- sandbox scheme: `intoss://babynest/`
- build artifact: `apps/ait/*.ait`
- TDS React Native와 `react-native-safe-area-context`를 사용한다.
- `FIREBASE_WEB_API_KEY`와 운영 `AIT_REWARDED_AD_GROUP_ID`는 빌드 시 주입한다.
  CI는 `apps-in-toss` environment의 secret/variable을 사용하며 로컬 값은 gitignore된 `.env`에 둔다.

## 구현 범위

- Platform custom-token bridge와 Firebase Auth REST 로그인
- AppsInToss `appLogin` 인가 코드를 mTLS 보호 Function에서 검증해 발급하는 Firebase App Check custom token
- AppsInToss `Storage` 기반 refresh token·그룹 session 보존
- Firestore REST 기반 그룹·아기 생성/복구, 수유·기저귀·수면·체온·복약 기록
- 아세트아미노펜·이부프로펜·항생제·직접 입력 약의 실제 투여량과 사용자 확인 간격 기록. 앱은 용량을 계산하거나 추천하지 않음
- Firebase callable 기반 6자리 초대 코드 발급·수락과 계정 삭제
- product-core 규칙을 재사용한 event·mutation receipt·active-sleep lock 원자 commit
- 홈·타임라인·통계·더보기와 네트워크 재조회

App Check token은 `babynest.app-check-token.v1` 키로 만료 시각과 함께 보관하며 만료 5분 전 갱신한다.
Platform custom-token, Firestore REST, Firebase callable, 계정 삭제 요청은 모두
`X-Firebase-AppCheck`를 포함한다. 서버는 Toss access token과 `userKey`를 저장하거나 로그에 남기지 않는다.

Node 기반 합성 E2E는 실제 Toss `appLogin`·mTLS attestation을 증명할 수 없으므로 제공하지 않는다.
`.ait` 생성과 단위 테스트 성공은 AppsInToss 비공개 번들의 실제 Toss 앱 로그인·초대·기록·재실행 QA나
production 출시 승인이 아니다.
