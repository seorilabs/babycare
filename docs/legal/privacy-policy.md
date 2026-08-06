# 개인정보처리방침 (내부 참고 — 회사 공용 정책으로 대체됨)

> **상태: 참고용.** 스토어 `privacyPolicyUrl`은 **회사 공용 정책** `https://www.seorilabs.com/privacy/`(en: `/en/privacy/`, 총 8개 언어)를 사용한다. 회사 공용 정책 본문의 "아동" 섹션에 babycare 케이스(성인이 비공개 그룹 내 아동 돌봄 기록 입력·공유)를 포괄하는 조항을 보강했다(seorilabs-official). 이 문서는 그 보강의 근거가 된 앱별 상세 초안으로 내부 참고용으로 남긴다.

Seorilabs(이하 "회사")는 **함께봄 / BabyNest**(이하 "서비스") 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 서비스가 어떤 정보를 어떤 목적으로 처리하고 어떻게 보호하는지 설명합니다.

- 서비스 성격: 성인 양육자가 아기의 수유·기저귀·수면을 함께 기록·공유하는 도구입니다. 의료 진단·처방·치료 판단을 제공하지 않습니다.
- 이용 대상: 만 14세 이상 성인 양육자(부모·조부모·베이비시터 등). 아동이 직접 가입·이용하는 서비스가 아닙니다. 서비스에 입력되는 아기 관련 정보는 양육자가 자신이 돌보는 아기에 대해 직접 입력하는 정보입니다.

## 1. 수집하는 개인정보 항목

| 구분 | 항목 | 수집 방식 |
| --- | --- | --- |
| 계정 정보 | 이메일 주소, 사용자 식별자(UID), 표시 이름 | 회원가입·로그인 시 |
| 돌봄 기록 | 아기의 이름·생년월일(선택), 수유·기저귀·수면 기록 값과 시각, 메모, 기록자 정보 | 이용자가 앱에서 직접 입력 |
| 그룹 정보 | 돌봄 그룹 구성, 초대·합류 이력, 멤버십 | 그룹 생성·초대·합류 시 |
| 진단 정보 | 비정상 종료 로그, 성능·이벤트 유형 등 진단 데이터(이벤트 종류 allowlist에 한함) | 앱 이용 중 자동 |

- 아기의 이름·생년월일·사진 경로·기록 값·메모 등 **민감한 돌봄 데이터는 분석/오류 진단 도구로 전송하지 않습니다.** 진단 목적으로는 이벤트 유형 등 허용 목록(allowlist) 정보만 전송합니다.
- 위치정보, 광고 식별자, 결제 정보는 수집하지 않습니다.

## 2. 개인정보의 처리 목적

- 계정 인증 및 이용자 식별
- 돌봄 기록의 저장, 실시간 동기화, 초대된 돌봄 그룹 내 공유
- 오프라인 기록의 저장 및 재연결 시 동기화
- 서비스 안정성 확보와 오류 진단·개선

## 3. 개인정보의 보관 및 파기

- 이용자의 계정·돌봄 기록은 회원 탈퇴(계정 삭제) 시 또는 관련 법령이 정한 기간 경과 시 파기합니다.
- 이용자는 앱 내에서 본인 기록의 삭제 및 계정 삭제를 요청할 수 있으며, 계정 삭제 시 연동된 개인정보와 로컬 캐시를 삭제합니다. 앱 내 절차와 외부 요청 방법은 `https://www.seorilabs.com/apps/babycare/account-deletion/`에서 안내합니다.

## 4. 개인정보의 제3자 제공 및 처리위탁

- 회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않으며, 판매하지 않습니다.
- 서비스 운영을 위해 아래 처리위탁을 이용합니다.

| 수탁자 | 위탁 업무 | 관련 정보 |
| --- | --- | --- |
| Google (Firebase) | 인증, 데이터 저장·동기화, 서버 기능, 오류/성능 진단 | Firebase Authentication, Cloud Firestore, Cloud Functions, Crashlytics/Analytics |

- 돌봄 데이터는 **초대된 돌봄 그룹 구성원에게만** 표시되며, 공개 다운로드 토큰 URL을 저장하지 않습니다.

## 5. 이용자의 권리

- 이용자는 언제든지 본인의 개인정보 열람·정정·삭제, 처리 정지, 계정 삭제를 요청할 수 있습니다.
- 그룹에서 제거된 멤버는 이후 그룹 데이터에 접근할 수 없습니다.

## 6. 개인정보의 안전성 확보 조치

- 전송 구간 암호화(HTTPS/TLS)를 적용합니다.
- 그룹 멤버십 기반 접근 통제(서버 보안 규칙)로 비멤버·제거된 멤버의 접근을 차단합니다.
- service account·비공개 키·관리자 SDK는 앱에 포함하지 않습니다.

## 7. 아동 관련 정보

서비스는 아동이 직접 이용하는 서비스가 아닙니다. 서비스에 입력되는 아기 관련 정보는 성인 양육자가 자신의 책임 하에 입력·관리하는 정보이며, 초대된 돌봄 그룹 내부에서만 공유됩니다.

## 8. 개인정보 보호책임자 및 문의

- 문의: cs@seorilabs.com
- 개인정보 보호책임자: `확정 필요`
- 회사 법적 상호·주소: `확정 필요`

## 9. 고지

- 본 방침의 내용 추가·삭제·수정이 있을 경우 개정 최소 7일 전에 공지합니다.
- 시행일: `확정 필요`

---

### English summary (draft)

**BabyNest** is a tool for adult caregivers to log and share a baby's feeding, diaper, and sleep records. It is not a medical service and is not directed to children as users.

- **Data we collect:** account info (email, user ID, display name), care records you enter (baby name/birth date optional, feeding/diaper/sleep entries, notes), care-group membership, and diagnostics (crash/performance, event-type allowlist only).
- **We do NOT send** baby names, birth dates, photo paths, record values, or notes to analytics/crash tools; only allowlisted event types are sent.
- **We do not collect** location or advertising identifiers, and we do not show ads or sell data.
- **Purpose:** authentication, storing and real-time syncing of records within your invited care group, offline support, and reliability/diagnostics.
- **Processors:** Google Firebase (Auth, Firestore, Cloud Functions, Crashlytics/Analytics).
- **Your rights:** access, correct, delete your data and account; removed members lose access to group data.
- **Security:** TLS in transit, membership-based access control; no admin keys shipped in the app.
- **Contact:** cs@seorilabs.com

> This English text is a summary of the Korean policy for reference and must be finalized with legal review before publishing.
