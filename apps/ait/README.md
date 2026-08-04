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

현재 첫 화면은 build·sandbox 검증용 후보이며, 로그인·공동 기록·AppsInToss Storage adapter는
아직 연결하지 않았다. `.ait` 생성 성공은 sandbox 실기기 QA나 production 출시 승인이 아니다.
