# CarePlet 국가 보험 기준 자동 갱신

국가 기관의 공개 자료를 수집·검증하고 Ed25519로 서명한 월별 정책을 게시하는 별도 서비스입니다. CarePlet 앱 소스, Firebase 자격증명, 회사·직원·환자 데이터는 포함하지 않습니다.

## 실행과 공개 파일

- GitHub Actions 활성화: 한국시간 매일 **03:17 / 09:17 / 15:17 / 21:17** 예정. GitHub 스케줄은 지연·누락될 수 있으며 정시 실행을 보장하지 않습니다.
- [실행 결과](https://github.com/Kaf30120/careplet-public-policy/actions/workflows/policy.yml)
- [서명된 최신 정책](https://raw.githubusercontent.com/kaf30120/careplet-public-policy/main/public/latest.json)
- 2026-10-27 첫 발행과 후속 갱신을 실제 GitHub Linux에서 성공했습니다. 이후 상태는 위 실행 결과와 정책의 서명된 issuedAt/expiresAt으로 판단합니다.
- 공개 주소에 접근할 수 있다는 것만으로 신뢰하지 않습니다. 앱에 고정한 공개키로 서명을 확인합니다. 원문 정책은 envelope의 base64 payload이며 암호화된 개인정보가 아닙니다.
- 모든 출처를 다시 읽고 검증한 경우에만 sequence와 최신 확인시각을 갱신합니다. 실패 시 기존 파일과 만료시각을 유지합니다. CDN 캐시로 새 버전 반영이 몇 분 지연될 수 있습니다.
- 파일의 유효기간은 72시간입니다. 연결된 앱은 유효 정책이 없으면 새 계산 완료·확정을 차단하고 기존 확정 snapshot을 바꾸지 않습니다.

## 수집 범위

- 국민연금: [연도별 요율](https://m.nps.or.kr/pnsinfo/ntpsklg/getOHAF0016M0.do?menuId=MN24001108), [기준소득 상하한](https://m.nps.or.kr/pnsinfo/ntpsklg/getOHAF0056M0.do)
- 건강보험: [시행령 제44조](https://www.law.go.kr/법령/국민건강보험법시행령/제44조), [월별 보험료 상하한 고시](https://www.law.go.kr/행정규칙/월별건강보험료액의상한과하한에관한고시)
- 장기요양: [시행령 제4조](https://www.law.go.kr/법령/노인장기요양보험법시행령/제4조)
- 고용보험: [고용노동부 보험료 부담비율](https://moel.go.kr/info/astmgmt/employ/employList.do), 사업장 구분별 추가율

현재 월에 적용되는 검증된 국가 파라미터만 게시합니다. 미래 시행일 이전에 발표만으로 적용하거나 모르는 값을 추정하지 않습니다. 사업장별 산재 최종율, 실제 공단 고지액, 가입 자격·감면 결정, 세금표, 최저임금, 새 법률 산식은 이 서비스가 제공하지 않습니다. 출처 구조나 산식이 바뀌면 파서·계산기 유지보수가 필요하며 무인 법률 해석 기능은 아닙니다.

## 비용과 보안

공개 저장소의 표준 Ubuntu runner만 사용합니다. 유료 runner, 유료 외부 서비스, Actions cache/artifact 업로드, Pages, Firebase, 결제 연결은 사용하지 않습니다. [GitHub 공식 요금 조건](https://docs.github.com/en/billing/concepts/product-billing/github-actions)을 따릅니다.

서명 비밀키는 Actions Secret `POLICY_SIGNING_KEY`에만 보관합니다. 로그·소스·앱·문서에 넣지 않습니다. 승인된 운영자만 workflow와 secret을 관리해야 합니다. 외부 PR의 코드를 서명키와 함께 실행하는 트리거는 없습니다. 앱 배포와 이 서비스의 정책 갱신은 별개이며, 서비스 활성화만으로 기존 설치 앱이 새 기능을 받지는 않습니다.

## 운영·중지·복구

1. 저장소 변수 `POLICY_SERVICE_ENABLED=false`로 다음 실행의 게시를 중지합니다. 이미 실행 중인 작업은 별도로 취소해야 합니다.
2. 기존 feed와 commit 이력을 보존합니다. 원인을 고친 뒤 공식 자료 전체를 재조회하여 증가한 sequence로 발행합니다. 실패를 숨기려고 만료를 연장하거나 이전 파일을 삭제하지 않습니다.
3. 평상시 수동 실행은 bootstrap=false입니다. bootstrap=true는 파일이 전혀 없는 최초 초기화용입니다.
4. 비밀키 손실·유출 시 서비스 중지와 새 키를 신뢰하는 앱 배포가 필요합니다. 공개키 변경만으로 이전 앱의 신뢰가 자동 바뀌지 않습니다.
5. 운영자는 GitHub 개인 Settings → Notifications → Actions에서 실패 알림을 확인해야 합니다. 이 저장소가 개인 알림 설정이나 수신 성공을 보장하지 않습니다. 계정 설정은 대신 변경하지 않았습니다.

[GitHub 스케줄 제약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): 지연·누락과 60일 비활동 후 정지 가능성이 있습니다. 정상 발행은 실제 저장소 활동이지만 장애 장기화·계정 중단에서의 자동 복구나 SLA는 보장하지 않습니다. 독립 감시 서비스는 구성하지 않았습니다.

앱의 sequence 방어는 현재 실행 중 메모리에 적용되며 재시작 시 서명된 72시간 창과 기기 시계에 의존합니다. 서명된 값도 사용자별 실제 고지·납부 확정의 증거는 아닙니다.
