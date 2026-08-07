# 스토어 데이터 공개 (Data Safety / App Privacy)

> **상태: Google Play 제출·Console readback 완료, Apple 입력 대기.** `apps/mobile/package.json`과 production composition을 기준으로 확인한 스토어 공개 원장이다.

## 공통 원칙 (product-spec 근거)

- 현재 1.0.8 바이너리는 Firebase Analytics, Crashlytics, Performance SDK를 포함하거나 초기화하지 않는다. 앱의 analytics port는 no-op이다.
- 이메일/비밀번호 로그인이 없으며, 기기 기반 Firebase 사용자 계정을 자동 생성한다.
- 위치정보·광고 식별자·결제 정보 미수집. 광고 없음, 인앱결제 없음, 데이터 판매 없음, 추적(tracking) 없음.
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
| 위치 | 아니요 | — | — | 미수집 |
| 금융 정보 | 아니요 | — | — | 결제 없음 |

- 전송 중 데이터 암호화: **예** (HTTPS/TLS)
- 사용자가 데이터 삭제 요청 가능: **예** (앱 내 계정 삭제 구현, production `deleteAccount` ACTIVE, 독립 owner/member 계정 삭제 E2E 통과, 외부 경로 `https://www.seorilabs.com/apps/babycare/account-deletion/` live 200 확인)
- "공유(shared)"는 Firebase를 처리위탁(processor)으로 보아 제3자 공유에 해당하지 않고, 초대 그룹 공유는 사용자 주도 전송 예외로 판단했다.
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
| Location | 아니요 | — | — | — |

- `Name`에는 양육자 표시 이름과 아기 이름, `Health`에는 구조화된 수유·기저귀·수면 기록, `Other User Content`에는 자유 입력 메모, `Other Data Types`에는 아기 생년월일을 답한다. 비의료 도구 포지셔닝은 Apple의 광범위한 Health data type 신고를 면제하지 않는다.
- iOS `Podfile.lock`의 Firebase 12.15.0과 실제 `FirebaseAuth`·`FirebaseFirestore` privacy manifest는 `Other Diagnostic Data`를 비연결·비추적 Analytics 용도로 선언한다. Firebase Functions 호출 metadata는 보안·service operation을 위한 App Functionality에도 사용된다. 현재 release에 Crashlytics·Performance·Google Analytics SDK는 없다.
- **Data Used to Track You: 없음** (ATT/IDFA 불필요, `NSUserTrackingUsageDescription` 불필요)
- Export Compliance: `ITSAppUsesNonExemptEncryption = false` (표준 TLS/Firebase만 사용)
- `PrivacyInfo.xcprivacy`는 App Privacy 콘솔 답변을 대체하지 않음 — 별도 유지.

## 미확정 (blocker)

- Apple App Privacy 콘솔 입력·readback.
- 실제 Play Store/TestFlight 1.0.8 설치본의 계정 삭제 화면·cache purge 사람 QA.
- 처리위탁/제3자 공유 판단 legal 확정.
