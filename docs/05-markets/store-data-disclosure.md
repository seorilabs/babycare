# 스토어 데이터 공개 (Data Safety / App Privacy)

> **상태: 광고·Analytics 도입에 따른 Google Play 재제출과 Apple 입력 대기.** `apps/mobile/package.json`과 production composition을 기준으로 확인한 스토어 공개 원장이다.

## 공통 원칙 (product-spec 근거)

- 새 후보는 Firebase Analytics와 Google Mobile Ads/UMP를 포함한다. Crashlytics와 Firebase Performance는 포함하지 않는다.
- 이메일/비밀번호 로그인이 없으며, 기기 기반 Firebase 사용자 계정을 자동 생성한다.
- 정밀 위치·결제 정보·데이터 판매는 없다. 통계 상세에 선택형 비개인화 리워드 광고 1개가 있고, Google Mobile Ads는 IP 기반 대략적 위치·광고/앱 식별자·상호작용·진단을 처리할 수 있다.
- 앱 이벤트는 Firebase Analytics와 Seorilabs Platform Events에 함께 전송한다. 이름·메모·생년월일·UID를 이벤트 파라미터에 포함하지 않으며 Platform 세션에서 사용자 계정과 연결될 수 있다.
- 민감 데이터는 초대된 그룹 내부에만 노출. 공개 download token URL 미저장.

## Google Play — Data Safety

| 데이터 유형 | 수집 | 공유 | 목적 | 비고 |
| --- | --- | --- | --- | --- |
| 개인 정보 — 이름 | 예(필수) | 아니요 | 앱 기능 | 양육자 표시 이름·아기 이름 |
| 개인 정보 — 사용자 ID | 예(필수) | 아니요 | 앱 기능·계정 관리 | Firebase Authentication UID |
| 개인 정보 — 기타 정보 | 예(필수) | 아니요 | 앱 기능 | 아기 생년월일 |
| 앱 활동 — 기타 사용자 제작 콘텐츠 | 예(선택) | 아니요 | 앱 기능 | 수유·기저귀·수면 기록과 메모. 그룹 내부 공유 |
| 건강 및 피트니스 — 건강 정보 | 예(선택) | 아니요 | 앱 기능 | 구조화된 수유·수면 등 돌봄 기록 |
| 기기 또는 기타 ID | 예(필수) | 아니요 | 앱 기능·사기 방지/보안 | Firebase Installation ID·Play Integrity/App Check attestation |
| 위치 — 대략적 위치 | 예 | 예 | 광고·분석·사기 방지 | Google Mobile Ads가 IP 주소를 수집해 대략적 위치를 추정할 수 있음 |
| 앱 활동 — 앱 상호작용 | 예 | 예 | 분석·광고 | 화면, 탭, 광고 요청·노출·보상, 앱 실행·탭·동영상 조회 |
| 앱 정보 및 성능 — 비정상 종료 로그·진단 | 예 | 예 | 분석·광고·사기 방지 | Google Mobile Ads SDK 진단·성능 정보 |
| 금융 정보 | 아니요 | — | — | 결제 없음 |

- 전송 중 데이터 암호화: **예** (HTTPS/TLS)
- 사용자가 데이터 삭제 요청 가능: **예** (앱 내 계정 삭제 구현, production `deleteAccount` ACTIVE, 독립 owner/member 계정 삭제 E2E 통과, 외부 경로 `https://www.seorilabs.com/apps/babycare/account-deletion/` live 200 확인)
- Firebase 처리위탁과 초대 그룹의 사용자 주도 전송은 제3자 공유에서 제외한다. Google Mobile Ads가 자동 수집하는 위 광고 데이터는 Google 공식 안내에 따라 공유로 신고한다.
- Firebase Authentication UID는 공식 분류상 "사용자 ID"다. Android release runtime에 `firebase-installations`가 포함되고 App Check가 Play Integrity를 사용하므로 "기기 또는 기타 ID"도 별도로 신고한다.
- 대상 연령: 아동 대상 아님(성인 양육자용). Families 정책 비대상.
- 건강 선언은 Google Play 분류 기준으로 `영양 및 체중 관리`, `수면 관리`를 선택했다. 앱은 의료 진단·처방·치료를 제공하지 않는다.

## Apple — App Privacy

| 데이터 유형 | 수집 | 연결(linked) | 추적 | 목적 |
| --- | --- | --- | --- | --- |
| Contact Info — Name | 예 | 예 | 아니요 | App Functionality |
| Health & Fitness — Health(수유·기저귀·수면 기록) | 예 | 예 | 아니요 | App Functionality |
| User Content — Other User Content(자유 입력 메모) | 예 | 예 | 아니요 | App Functionality |
| Other Data — Other Data Types(생년월일) | 예 | 예 | 아니요 | App Functionality |
| Identifiers — User ID | 예 | 예 | 아니요 | App Functionality |
| Diagnostics — Other Diagnostic Data | 예 | 아니요 | 아니요 | Analytics·App Functionality |
| Location — Coarse Location | 예 | 아니요 | 아니요 | Third-Party Advertising·Analytics |
| Identifiers — Device ID | 예 | 아니요 | 아니요 | Third-Party Advertising·Analytics |
| Usage Data — Product Interaction | 예 | 예 | 아니요 | Analytics·Third-Party Advertising |
| Usage Data — Advertising Data | 예 | 아니요 | 아니요 | Third-Party Advertising·Analytics |
| Diagnostics — Crash Data | 예 | 아니요 | 아니요 | Analytics |
| Diagnostics — Performance Data | 예 | 예 | 아니요 | Analytics·Third-Party Advertising |

- `Name`에는 양육자 표시 이름과 아기 이름, `Health`에는 구조화된 수유·기저귀·수면 기록, `Other User Content`에는 자유 입력 메모, `Other Data Types`에는 아기 생년월일을 답한다. 비의료 도구 포지셔닝은 Apple의 광범위한 Health data type 신고를 면제하지 않는다.
- Google Mobile Ads 공식 공개는 IP 주소, crash/performance, Device ID, Advertising Data, Product Interaction 처리를 명시한다. Firebase Analytics의 실제 이벤트와 Platform 연계 여부까지 합쳐 위 표를 보수적으로 작성했다.
- **Data Used to Track You: 잠정 없음.** 앱은 ATT를 요청하지 않고 비개인화 요청만 사용한다. 다만 운영 AdMob/UMP 설정과 archive privacy report에서 교차 앱 추적이 없음을 확인하기 전에는 App Privacy 입력을 완료하지 않는다.
- Export Compliance: `ITSAppUsesNonExemptEncryption = false` (표준 TLS/Firebase만 사용)
- `PrivacyInfo.xcprivacy`는 App Privacy 콘솔 답변을 대체하지 않음 — 별도 유지.

## 미확정 (blocker)

- Google Play Data Safety·광고 있음·광고 ID 답변 재제출 및 readback.
- Apple App Privacy 콘솔 입력·archive privacy report readback.
- AdMob UMP 메시지·비개인화/limited ads 설정 검증.
- 실제 Play Store/TestFlight 1.0.8 설치본의 계정 삭제 화면·cache purge 사람 QA.
- 처리위탁/제3자 공유 판단 legal 확정.
