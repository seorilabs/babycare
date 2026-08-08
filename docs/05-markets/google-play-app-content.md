# Google Play "앱 콘텐츠(App content)" 답변 시트

> 2026-08-07 Play Console readback 이후 2026-08-08 Analytics·리워드 광고 도입으로 재입력이 필요해진 답변 원장이다. 심사 전송과 production 배포는 별도 게이트다.
> 근거: `docs/05-markets/store-data-disclosure.md`, `docs/01-planning/product-spec.md`.

## 1. 개인정보처리방침 (Privacy policy)
- URL: `https://www.seorilabs.com/privacy/`
- 계정 삭제 URL: `https://www.seorilabs.com/apps/babycare/account-deletion/`

## 2. 앱 액세스 (App access)
- **일부 기능이 제한됨** 선택 후 지침 제공(또는 "모든 기능 이용 가능"). 앱은 별도 로그인 없이 익명 인증으로 자동 시작하므로 심사용 자격증명은 불필요.
- 지침 예시(심사자 안내):
  > 별도 로그인 없이 앱 실행 시 자동으로 익명 세션이 생성됩니다. 공동 기록 확인: 홈에서 아기·돌봄 그룹 생성 → 6자리 초대 코드 발급 → 두 번째 기기에서 코드 입력 시 합류·실시간 반영. 통계 요약은 무료이며 상세 통계는 사용자가 선택한 리워드 광고를 끝까지 보면 24시간 열립니다. 인앱결제는 없습니다.

## 3. 광고 (Ads)
- **예, 앱에 광고가 있습니다.**
- 위치: 통계 탭의 `상세 통계 24시간 열기` 선택형 리워드 광고 1개.
- 강제 전면 광고·배너·인앱결제는 없다. 광고를 보지 않아도 오늘 요약과 기본 통계는 계속 사용할 수 있다.
- **Console 재입력·readback 대기.** 운영 AdMob app/unit ID, UMP 메시지와 새 release 설치본 QA가 선행돼야 한다.

## 4. 콘텐츠 등급 (Content ratings, IARC 설문)
- 이메일: `cs@seorilabs.com`
- 카테고리: **다른 모든 앱 유형**
- 설문 답변:
  - 폭력/무서움/공포: 없음
  - 성적 콘텐츠/노출: 없음
  - 비속어/저속한 유머: 없음
  - 통제 물질(술·담배·마약): 없음
  - 도박/모의 도박: 없음
  - 사용자 간 상호작용/콘텐츠 공유: **예**. 사용자 제작 돌봄 기록을 공유하지만 상호작용은 **초대된 친구로 제한**. 공개 채팅·차단/신고·위치 공유 없음
  - 온라인 콘텐츠 추천·홍보: 없음
  - 개인정보 공유/디지털 구매: 위 Data safety와 일치하게 표기
- **발급 등급: 대한민국 12세 이상**

## 5. 타깃 대상 및 콘텐츠 (Target audience and content)
- 대상 연령대: **만 18세 이상** (성인 양육자 대상). 아동 연령대 **선택 안 함**.
- "앱이 아동을 대상으로 설계되었나요?" → **아니요**.
- 아동에게 어필하는 요소(캐릭터·놀이 등)? → **아니요**(성인용 기록·관리 도구).
- 결과: **Families(Designed for Families) 정책 비대상.** (아기 데이터를 다루지만 이용자는 성인이며 아동 이용 설계 아님)

## 6. 데이터 보안 (Data safety)
- 데이터 수집/공유 여부: **예(수집함)**
- 전송 중 암호화: **예 (HTTPS/TLS)**
- 사용자 데이터 삭제 요청 제공: **예** (앱 내 계정 삭제 + `cs@seorilabs.com` 요청)
- 제3자 공유: **예**. Firebase 처리위탁·사용자 주도 그룹 공유는 제외하되, Google Mobile Ads가 자동 수집하는 광고 관련 데이터는 공유로 신고한다.
- 계정 생성 방식: **기타** (별도 로그인 입력 없이 기기 기반 Firebase 계정을 자동 생성)
- 계정 삭제 URL: `https://www.seorilabs.com/apps/babycare/account-deletion/`

### 수집 데이터 유형(모두 수집=예, 공유=아니요)
| 카테고리 | 데이터 유형 | 목적 | 필수/선택 | 비고 |
| --- | --- | --- | --- | --- |
| 개인 정보 | 이름 | 앱 기능 | 필수 | 양육자 표시 이름·아기 이름 |
| 개인 정보 | 사용자 ID | 앱 기능·계정 관리 | 필수 | Firebase Authentication UID |
| 개인 정보 | 기타 정보 | 앱 기능 | 필수 | 아기 생년월일 |
| 앱 활동 | 기타 사용자 제작 콘텐츠 | 앱 기능 | 선택 | 수유·기저귀·수면 기록과 메모 |
| 건강 및 피트니스 | 건강 정보 | 앱 기능 | 선택 | 수유·수면 등 돌봄 기록 |
| 기기 또는 기타 ID | 기기 또는 기타 ID | 앱 기능·사기 방지/보안 | 필수 | Firebase Installation ID·Play Integrity/App Check attestation |
| 위치 | 대략적 위치 | 광고·분석·사기 방지 | SDK 자동 수집 | Google Mobile Ads가 IP 주소로 추정 가능 |
| 앱 활동 | 앱 상호작용 | 분석·광고 | SDK 자동 수집 | 화면·기능·광고 요청·노출·보상 이벤트 |
| 앱 정보 및 성능 | 비정상 종료 로그·진단 | 분석·광고·사기 방지 | SDK 자동 수집 | Google Mobile Ads 진단·성능 정보 |

- 미수집: 이메일, 금융 정보, 연락처, 사진·동영상, 메시지, 정밀 위치.
- 위 추가 행의 정확한 최신 Play CSV response ID는 임의 작성하지 않는다. Console에서 새 template CSV를 내보낸 뒤 `play-store/data-safety-responses.json`의 `pendingSdkRevision`을 실제 응답으로 교체하고 API 제출·Console readback한다.

### 확정·참고
1. **아기 생년월일 = "개인 정보 > 기타 정보", 돌봄 기록·메모 = "앱 활동 > 기타 사용자 제작 콘텐츠"**로 신고한다. 구조화된 수유·수면 기록은 비의료 도구라도 Google Play의 광범위한 분류에 따라 **"건강 및 피트니스 > 건강 정보"**에도 신고한다.
2. **계정 삭제 기능(참고)**: Data safety의 "삭제 요청 가능=예"는 앱 내 계정 삭제 + 외부 삭제 안내 페이지의 `cs@seorilabs.com` 이메일 요청으로 답한다. production `deleteAccount` 배포와 독립 owner/member 계정 E2E는 통과했고 실제 Store/TestFlight 설치본의 사람 QA가 남았다.

## 7. 기타 선언 (해당 없음)
- 금융 기능: **없음**
- 건강 기능: **영양 및 체중 관리**, **수면 관리**. 지역별 추가 요구사항 없음. 의료 진단·처방·치료 기능은 없음
- 정부 앱/뉴스 앱/AI 생성 콘텐츠: **아니요**
- 광고 ID: **사용함**. Google Mobile Ads SDK가 포함되므로 광고 ID 선언을 `예`로 갱신한다. **Console 재입력·readback 대기.**

## Data safety API 자동 반영에 대해
- Android Publisher API에 `applications.dataSafety`(safetyLabels CSV) 쓰기 엔드포인트가 존재한다.
- 답변 원장은 `play-store/data-safety-responses.json`이다. Play Console에서 내보내거나 공식 도움말에서 받은 최신 CSV를 `scripts/apply-google-play-data-safety.py --template-csv <csv> --output <filled.csv>`로 생성한다.
- 생성본을 검토한 뒤 `--apply`를 추가하면 Android Publisher API로 반영한다. 2026-08-07 기존 무광고 runtime 답변은 제출·readback했지만, 2026-08-08 SDK 추가분은 최신 Console template 확보 전이라 아직 제출하지 않았다.
