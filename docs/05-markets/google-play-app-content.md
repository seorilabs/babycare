# Google Play "앱 콘텐츠(App content)" 답변 시트

> Play Console → 앱 콘텐츠(App content)의 각 섹션을 이 시트대로 입력한다. 대부분 **콘솔 전용**(Android Publisher API로 못 씀)이라 수동 입력한다. deployment approval 전에는 제출/게시하지 않되, 설문 작성·저장은 가능하다.
> 근거: `docs/05-markets/store-data-disclosure.md`, `docs/01-planning/product-spec.md`.

## 1. 개인정보처리방침 (Privacy policy)
- URL: `https://www.seorilabs.com/privacy/`
- 계정 삭제 URL: `https://www.seorilabs.com/apps/babycare/account-deletion/`

## 2. 앱 액세스 (App access)
- **일부 기능이 제한됨** 선택 후 지침 제공(또는 "모든 기능 이용 가능"). 앱은 별도 로그인 없이 익명 인증으로 자동 시작하므로 심사용 자격증명은 불필요.
- 지침 예시(심사자 안내):
  > 별도 로그인 없이 앱 실행 시 자동으로 익명 세션이 생성됩니다. 공동 기록 확인: 홈에서 아기·돌봄 그룹 생성 → 6자리 초대 코드 발급 → 두 번째 기기에서 코드 입력 시 합류·실시간 반영. 광고·인앱결제 없음.

## 3. 광고 (Ads)
- **아니요, 앱에 광고가 없습니다.**

## 4. 콘텐츠 등급 (Content ratings, IARC 설문)
- 이메일: `cs@seorilabs.com`
- 카테고리: **유틸리티, 생산성, 커뮤니케이션 또는 기타 (Utility, Productivity, Communication, or Other)**
- 설문 답변(모두 해당 없음 → 전체이용가 예상):
  - 폭력/무서움/공포: 없음
  - 성적 콘텐츠/노출: 없음
  - 비속어/저속한 유머: 없음
  - 통제 물질(술·담배·마약): 없음
  - 도박/모의 도박: 없음
  - 사용자 간 상호작용/콘텐츠 공유: **초대된 비공개 돌봄 그룹 내에서만** 기록을 공유(공개 커뮤니케이션·UGC 아님). 위치 공유 없음. → 해당 시 "사용자가 콘텐츠를 공유/상호작용" 항목에 비공개 그룹 공유로 표기.
  - 개인정보 공유/디지털 구매: 위 Data safety와 일치하게 표기
- **예상 등급: 전체이용가 (Everyone / 만 3세 이상)**

## 5. 타깃 대상 및 콘텐츠 (Target audience and content)
- 대상 연령대: **만 18세 이상** (성인 양육자 대상). 아동 연령대 **선택 안 함**.
- "앱이 아동을 대상으로 설계되었나요?" → **아니요**.
- 아동에게 어필하는 요소(캐릭터·놀이 등)? → **아니요**(성인용 기록·관리 도구).
- 결과: **Families(Designed for Families) 정책 비대상.** (아기 데이터를 다루지만 이용자는 성인이며 아동 이용 설계 아님)

## 6. 데이터 보안 (Data safety)
- 데이터 수집/공유 여부: **예(수집함)**
- 전송 중 암호화: **예 (HTTPS/TLS)**
- 사용자 데이터 삭제 요청 제공: **예** (앱 내 계정 삭제 + `cs@seorilabs.com` 요청)
- 제3자 **공유: 없음** (Firebase는 처리위탁 processor)

### 수집 데이터 유형(모두 수집=예, 공유=아니요)
| 카테고리 | 데이터 유형 | 목적 | 필수/선택 | 비고 |
| --- | --- | --- | --- | --- |
| 개인 정보 | 이메일 주소 | 앱 기능, 계정 관리 | 필수 | 인증 |
| 개인 정보 | 이름 | 앱 기능 | 선택 | 표시 이름(기록자) |
| 개인 정보 | 기타 정보 | 앱 기능 | 선택 | **아기 이름·생년월일(선택)과 수유·기저귀·수면 돌봄 기록** (2026-07-19 확정 분류) |
| 기기 또는 기타 ID | 기기 또는 기타 ID | 앱 기능 | 필수 | Firebase 사용자 ID |
| 앱 활동·성능 | 비정상 종료 로그 | 분석 | — | Crashlytics(allowlist) |
| 앱 활동·성능 | 진단 | 분석 | — | 이벤트 유형만 |

- 미수집: 위치, 금융 정보, 연락처, 사진·동영상, 메시지, 광고 ID.

### 확정·참고
1. **돌봄 기록 분류 = "개인 정보 > 기타 정보"** (2026-07-19 확정). 비의료 기록 도구 포지셔닝과 일관. "건강 정보"로 분류하지 않는다.
2. **계정 삭제 기능(참고)**: Data safety의 "삭제 요청 가능=예"는 앱 내 계정 삭제 + 외부 삭제 안내 페이지의 `cs@seorilabs.com` 이메일 요청으로 답한다. 앱 UX·server workflow·Emulator 검증은 완료했고 production callable 배포와 실기기 일회성 계정 QA가 남았다.

## 7. 기타 선언 (해당 없음)
- 금융 기능: **없음**
- 건강 앱(Health): **아니요**(비의료 기록 도구)
- 정부 앱/뉴스 앱/AI 생성 콘텐츠: **아니요**

## Data safety API 자동 반영에 대해
- Android Publisher API에 `applications.dataSafety`(safetyLabels CSV) 쓰기 엔드포인트가 존재한다.
- 단, Google Play Data safety CSV 형식이 정밀·비공개적이라 **손으로 만든 CSV를 라이브에 적용하면 잘못된 데이터 안전 신고 위험**이 있다. 자동 반영을 원하면 **Play Console → 데이터 보안 → CSV 내보내기로 정확한 템플릿을 받아** 이 시트대로 채운 뒤 import(또는 `apply_play_store_listing.py --apply-data-safety`)하는 것이 안전하다.
- 현재는 위 표대로 **콘솔에서 직접 입력**을 권장한다.
