# API 키 갱신 매뉴얼

## API별 역할과 보관 위치

| 서비스 | 환경변수 | 용도 | 운영 저장소 | 확인 주기 |
|---|---|---|---|---|
| 학교알리미 | `SCHOOLINFO_API_KEY` | 학교 기준정보·학생·학급·교원·좌표 | GitHub Actions Secret, 로컬 `.dev.vars` | 분기 상태 확인·연 1회 공시 갱신 |
| EDSS 학교속성 | `EDSS_SCHOOL_ATTRIBUTE_API_KEY` | 학교코드·학교급·시군·운영상태 연결 | **GitHub Actions Secret만 등록** | 승인·키 수령 후 등록 |
| EDSS 학생·학급 등 | API별 `EDSS_…_API_KEY` | 학생·학급·개황·위치정보 보완 | **GitHub Actions Secret만 등록** | 각 API 승인·키 수령 시 |
| KOSIS | `KOSIS_API_KEY` | 출생아·연령별 인구·장래인구 | GitHub Actions Secret, 로컬 `.dev.vars` | 매월 개정 확인 |
| SGIS | `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` | 실제 위치 지도·연령별 시군 인구 | Cloudflare Secret, 로컬 `.dev.vars` | 분기 상태 확인 |
| 유치원알리미 | `KINDER_API_KEY` | 유치원 기본현황·원아·학급 | GitHub Actions Secret, 로컬 `.dev.vars` | 분기 새 공시 확인 |
| 변화 읽기 도우미 | `GEMINI_API_KEY` | 집계값의 쉬운 해설 | Cloudflare Secret, 로컬 `.dev.vars` | 월 1회와 장애 시 |
| 뉴스 검색 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 주간 뉴스 수집 | GitHub Actions Secret | 주간 자동 실행 결과 확인 |
| 배포 권한 | `DEPLOY_PAT` | 배포 저장소 자동 푸시 | GitHub Actions Secret | 권한 변경·만료 전 |

Cloudflare에는 운영 중 브라우저 요청에 필요한 키를, GitHub Actions에는 정기 수집과 배포에 필요한 키를 둡니다. 같은 API를 양쪽에서 쓰면 양쪽 Secret을 함께 갱신합니다.

EDSS는 현재 수집 전용이므로 GitHub Actions Secret만 사용합니다. 여러 EDSS 키를 한 Secret에 붙여 넣지 말고 API별 Secret으로 나눕니다. Cloudflare에 EDSS 키를 넣는 것은 나중에 서버가 EDSS를 직접 조회하도록 결정했을 때만 필요합니다. 상세 절차는 [EDSS 승인 후 연결 절차](./06_EDSS_승인후_연결절차.md)를 따릅니다.

## 키를 바꿔야 하는 경우

- 키가 메신저·화면 캡처·소스에 노출됨
- 담당자 변경 또는 계정 권한 회수
- 발급기관이 만료·재발급을 안내함
- API가 지속적으로 401·403 또는 인증 실패를 반환함
- 허용 도메인·서비스 URL·프로젝트가 변경됨

정상 작동하는 키를 일정 기간마다 무조건 바꾸기보다 발급기관 정책에 따릅니다. 다만 노출된 키는 즉시 폐기·재발급합니다.

## 교체 순서

1. 발급기관에서 새 키를 만들고 기존 키는 잠시 유지합니다.
2. Cloudflare 또는 GitHub Actions의 Secret 값을 새 키로 교체합니다.
3. 로컬 개발이 필요하면 `.dev.vars`도 교체합니다.
4. 새 배포 또는 수동 데이터 갱신을 실행합니다.
5. `/api/data-status`에서 설정 인식 여부를 확인합니다. 이 화면은 키 값이 아니라 등록 여부만 보여 줍니다.
6. 지도·데이터 수집·변화 읽기 기능을 각각 한 번 실행합니다.
7. 정상 확인 후 기존 키를 폐기하고 교체일·담당 역할·검증 결과만 갱신 이력에 적습니다.

## 오류별 조치

| 증상 | 뜻 | 조치 |
|---|---|---|
| 401·403·인증키 오류 | 키가 잘못됐거나 권한·도메인 제한 문제 | 발급기관 상태, 키 종류, 허용 도메인, Secret 이름 확인 |
| 429·할당량 초과 | 호출 한도 또는 무료 사용량 소진 | 반복 호출 중지, 다음 초기화 시점 확인, 직전 정상 데이터 유지 |
| 404 | API 주소·버전·통계표 ID 변경 가능성 | 공식 개발자 문서와 설정 ID 확인 |
| 5xx·시간 초과 | 제공기관 일시 장애 가능성 | 최대 3회만 재시도하고 실패 시 갱신 중단 |
| 응답은 성공했으나 행 수 0 | 연도 미공개·조건 오류·스키마 변경 가능성 | 공개하지 말고 기준연도·요청변수·응답 필드 확인 |

## 절대 하지 않을 일

- 실제 키를 Markdown, HTML, JavaScript, Git 커밋, 이슈에 기록하지 않음
- 키를 쿼리 문자열째 로그나 화면 캡처로 공유하지 않음
- 새 데이터 수집이 실패했을 때 직전 정상 데이터를 빈 값으로 덮지 않음
