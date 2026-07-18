# 스토어 데이터 공개 (Data Safety / App Privacy)

> **상태: 초안.** Google Play Data Safety와 Apple App Privacy 콘솔 답변의 근거 원장이다. 실제 데이터 처리 구성(특히 Firebase Analytics/Crashlytics 전송 필드)과 legal 검토로 확정한다. 콘솔 제출 자체는 deployment approval 이후.

## 공통 원칙 (product-spec 근거)

- 아기 이름·생년월일·사진 경로·기록 값·메모는 Analytics/Crashlytics로 전송하지 않는다. 이벤트 유형 allowlist만 전송.
- 위치정보·광고 식별자·결제 정보 미수집. 광고 없음, 인앱결제 없음, 데이터 판매 없음, 추적(tracking) 없음.
- 민감 데이터는 초대된 그룹 내부에만 노출. 공개 download token URL 미저장.

## Google Play — Data Safety

| 데이터 유형 | 수집 | 공유 | 목적 | 비고 |
| --- | --- | --- | --- | --- |
| 개인 정보 — 이메일 주소 | 예 | 아니요 | 계정 관리, 앱 기능 | 인증 |
| 개인 정보 — 이름(표시 이름) | 예(선택) | 아니요 | 앱 기능 | 기록자 표시 |
| 앱 활동 — 앱 내 콘텐츠(돌봄 기록) | 예 | 아니요 | 앱 기능 | 그룹 내부 공유 |
| 앱 정보 및 성능 — 비정상 종료 로그 | 예 | 아니요 | 분석 | Crashlytics, allowlist |
| 앱 정보 및 성능 — 진단 | 예 | 아니요 | 분석 | 이벤트 유형만 |
| 기기 또는 기타 ID — 사용자 ID | 예 | 아니요 | 앱 기능 | Firebase UID |
| 위치 | 아니요 | — | — | 미수집 |
| 금융 정보 | 아니요 | — | — | 결제 없음 |

- 전송 중 데이터 암호화: **예** (HTTPS/TLS)
- 사용자가 데이터 삭제 요청 가능: **예** (계정 삭제 경로 — 구현·검증 `확정 필요`)
- "공유(shared)"는 Firebase를 처리위탁(processor)으로 보아 제3자 공유에 해당하지 않는 것으로 판단. 콘솔 정책 문구로 최종 확인 필요.
- 대상 연령: 아동 대상 아님(성인 양육자용). Families 정책 비대상.

## Apple — App Privacy

| 데이터 유형 | 수집 | 연결(linked) | 추적 | 목적 |
| --- | --- | --- | --- | --- |
| Contact Info — Email Address | 예 | 예 | 아니요 | App Functionality |
| User Content — Other User Content(돌봄 기록) | 예 | 예 | 아니요 | App Functionality |
| Identifiers — User ID | 예 | 예 | 아니요 | App Functionality |
| Diagnostics — Crash Data | 예 | 아니요 | 아니요 | App Functionality |
| Diagnostics — Performance Data | 예 | 아니요 | 아니요 | App Functionality |
| Location | 아니요 | — | — | — |

- **Data Used to Track You: 없음** (ATT/IDFA 불필요, `NSUserTrackingUsageDescription` 불필요)
- Export Compliance: `ITSAppUsesNonExemptEncryption = false` (표준 TLS/Firebase만 사용)
- `PrivacyInfo.xcprivacy`는 App Privacy 콘솔 답변을 대체하지 않음 — 별도 유지.

## 미확정 (blocker)

- Firebase Analytics/Crashlytics 실제 전송 필드 최종 점검(allowlist 준수 검증).
- 계정 삭제·데이터 완전 삭제 절차 구현·검증.
- 처리위탁/제3자 공유 판단 legal 확정.
- 개인정보처리방침 호스팅 URL — `docs/legal/privacy-policy.md` 초안 참고.
