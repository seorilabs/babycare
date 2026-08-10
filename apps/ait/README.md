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
- `FIREBASE_WEB_API_KEY`는 빌드 시 주입한다. 값이 없으면 build를 실패시킨다.

## 구현 범위

- Platform custom-token bridge와 Firebase Auth REST 로그인
- AppsInToss `Storage` 기반 refresh token·그룹 session 보존
- Firestore REST 기반 그룹·아기 생성/복구, 수유·기저귀·수면·체온·복약 기록
- 아세트아미노펜·이부프로펜·항생제·직접 입력 약의 실제 투여량과 사용자 확인 간격 기록. 앱은 용량을 계산하거나 추천하지 않음
- Firebase callable 기반 6자리 초대 코드 발급·수락과 계정 삭제
- product-core 규칙을 재사용한 event·mutation receipt·active-sleep lock 원자 commit
- 홈·타임라인·통계·더보기와 네트워크 재조회

운영 Firebase를 사용하는 선택형 E2E는 `RUN_LIVE_AIT_E2E=1`일 때만 실행한다. 이 검증은
서로 다른 두 계정의 그룹 생성→기록→초대→합류→공동 조회→계정 삭제를 수행하고 시험 데이터를
정리한다. `.ait` 생성 및 API E2E 성공은 AppsInToss sandbox 실기기 QA나 production 출시 승인이 아니다.
