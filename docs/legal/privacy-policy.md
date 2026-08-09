# 함께봄 개인정보처리방침 원장

> **상태: 제품별 공개 방침의 근거 원장.** 스토어 `privacyPolicyUrl`은 `https://www.seorilabs.com/apps/babycare/privacy/`(en: `/en/apps/babycare/privacy/`)를 사용한다. 공개 페이지 source는 `seorilabs-official` PR #6에서 2026-08-09 병합했다.

Seorilabs(이하 "회사")는 **함께봄 / BabyNest**(이하 "서비스") 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 서비스가 어떤 정보를 어떤 목적으로 처리하고 어떻게 보호하는지 설명합니다.

- 서비스 성격: 성인 양육자가 아기의 수유·기저귀·수면을 함께 기록·공유하는 도구입니다. 의료 진단·처방·치료 판단을 제공하지 않습니다.
- 이용 대상: 만 14세 이상 성인 양육자(부모·조부모·베이비시터 등). 아동이 직접 가입·이용하는 서비스가 아닙니다. 서비스에 입력되는 아기 관련 정보는 양육자가 자신이 돌보는 아기에 대해 직접 입력하는 정보입니다.

## 1. 수집하는 개인정보 항목

| 구분 | 항목 | 수집 방식 |
| --- | --- | --- |
| 계정 정보 | 사용자 식별자(UID), 표시 이름 | 앱 최초 실행 시 기기 기반 계정 자동 생성, 이용자 직접 입력 |
| 돌봄 기록 | 아기의 이름·생년월일, 수유·기저귀·수면 기록 값과 시각, 메모, 기록자 정보 | 이용자가 앱에서 직접 입력 |
| 그룹 정보 | 돌봄 그룹 구성, 초대·합류 이력, 멤버십 | 그룹 생성·초대·합류 시 |
| 이용·광고 정보 | 화면 조회, 온보딩·기록·초대 이벤트, 광고 요청·노출·보상, 광고/앱 인스턴스·기기 식별자, IP 기반 대략적 위치, SDK 진단·성능 정보 | Firebase Analytics, Seorilabs Platform Events, Google Mobile Ads 또는 AppsInToss 통합 광고 |

- 정밀 위치와 결제 정보는 수집하지 않습니다. Google Mobile Ads SDK는 IP 주소로 대략적 위치를 추정하고 광고·앱 인스턴스 식별자, 앱 상호작용과 SDK 진단 정보를 처리할 수 있습니다.
- 돌봄 메모·아기 이름·생년월일·양육자 표시 이름은 Analytics 또는 광고 이벤트 파라미터로 보내지 않습니다.

## 2. 개인정보의 처리 목적

- 계정 인증 및 이용자 식별
- 돌봄 기록의 저장, 실시간 동기화, 초대된 돌봄 그룹 내 공유
- 오프라인 기록의 저장 및 재연결 시 동기화
- 서비스 이용 현황·핵심 흐름·광고 보상 완료 분석, 오류·성능 진단
- 통계 상세의 선택형 비개인화 리워드 광고 제공과 부정 이용 방지

## 3. 개인정보의 보관 및 파기

- 이용자의 계정·돌봄 기록은 회원 탈퇴(계정 삭제) 시 또는 관련 법령이 정한 기간 경과 시 파기합니다.
- 이용자는 앱 내에서 본인 기록의 삭제 및 계정 삭제를 요청할 수 있으며, 계정 삭제 시 연동된 개인정보와 로컬 캐시를 삭제합니다. 앱 내 절차와 외부 요청 방법은 `https://www.seorilabs.com/apps/babycare/account-deletion/`에서 안내합니다.

## 4. 개인정보의 제3자 제공 및 처리위탁

- 회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않으며, 판매하지 않습니다.
- 서비스 운영을 위해 아래 처리위탁을 이용합니다.

| 수탁자 | 위탁 업무 | 관련 정보 |
| --- | --- | --- |
| Google (Firebase) | 기기 기반 계정 인증, 데이터 저장·동기화, 서버 기능 | Firebase Authentication, Cloud Firestore, Cloud Functions |
| Google | 제품 이용 분석과 비개인화 리워드 광고 제공 | Google Analytics for Firebase, Google Mobile Ads, User Messaging Platform |
| Viva Republica (AppsInToss) | AppsInToss 미니앱 내 통합 리워드 광고 제공 | AppsInToss 통합 광고 |

- 돌봄 데이터는 **초대된 돌봄 그룹 구성원에게만** 표시되며, 공개 다운로드 토큰 URL을 저장하지 않습니다.

## 5. 이용자의 권리

- 이용자는 언제든지 본인의 개인정보 열람·정정·삭제, 처리 정지, 계정 삭제를 요청할 수 있습니다.
- 그룹에서 제거된 멤버는 이후 그룹 데이터에 접근할 수 없습니다.

## 6. 개인정보의 안전성 확보 조치

- 전송 구간 암호화(HTTPS/TLS)를 적용합니다.
- 그룹 멤버십 기반 접근 통제(서버 보안 규칙)로 비멤버·제거된 멤버의 접근을 차단합니다.
- service account·비공개 키·관리자 SDK는 앱에 포함하지 않습니다.
- AppsInToss용 GA4 API secret은 Cloud Functions Secret Manager에만 두며 미니앱 번들에 포함하지 않습니다.

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

- **Data we collect:** account info (automatically generated user ID and display name), care records you enter (baby name/birth date, feeding/diaper/sleep entries, notes), and care-group membership.
- **Usage and ads:** screen, onboarding, care-log, invitation, and rewarded-ad events are sent to Google Analytics and Seorilabs Platform Events. An optional rewarded ad unlocks detailed stats for 24 hours; the Android/iOS app requests non-personalized ads.
- Google Mobile Ads may process app interactions, SDK diagnostics, advertising/app-instance identifiers, and approximate location inferred from IP. We do not collect precise location, payment data, or sell data.
- **Purpose:** authentication, storing and real-time syncing of records within your invited care group, offline support, usage analytics, rewarded advertising, fraud prevention, and reliability/diagnostics.
- **Processors:** Google (Firebase, Google Analytics, Google Mobile Ads and UMP) and Viva Republica (AppsInToss integrated ads).
- **Your rights:** access, correct, delete your data and account; removed members lose access to group data.
- **Security:** TLS in transit, membership-based access control; no admin keys shipped in the app.
- **Contact:** cs@seorilabs.com

> This English text is a summary of the Korean policy for reference and must be finalized with legal review before publishing.
