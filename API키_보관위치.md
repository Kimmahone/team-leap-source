# API 키 보관 위치

갱신: 2026-08-31

상세한 담당 역할·교체 순서·오류별 조치는 [API 키 갱신 매뉴얼](./06.%20실행계획(1)/00.%20운영문서/02_API키_갱신_매뉴얼.md)을 기준으로 합니다.

## 한 곳에서 찾기

- 로컬 개발용 실제 값: 프로젝트 루트의 `.dev.vars`
- 값이 없는 공유용 견본: `.dev.vars.example`
- 과거 데이터 굽기 스크립트용 키: `open api/인증키.txt`
- 운영 배포용 실제 값: Cloudflare Pages 프로젝트의 **Settings → Variables and Secrets**

`.dev.vars`와 `open api/인증키.txt`는 `.gitignore`에 의해 GitHub에 올라가지 않는다. 새 키를 발급하면 `.dev.vars`를 먼저 갱신하고, 기존 굽기 스크립트가 사용하는 키는 `open api/인증키.txt`도 함께 갱신한다.

## 환경변수 이름

| 서비스 | 환경변수 | 현재 용도 |
|---|---|---|
| Gemini | `GEMINI_API_KEY` | Cloudflare의 AI 분석 중계 |
| 학교알리미 | `SCHOOLINFO_API_KEY` | 학교·학생·교원 자료 갱신 |
| EDSS 학교속성 | `EDSS_SCHOOL_ATTRIBUTE_API_KEY` | 학교코드·학교급·시군 기준정보 |
| EDSS 학생·학급 등 | API별 `EDSS_…_API_KEY` | 학교·학년·연도별 학생·학급 시계열, 개황·위치정보 교차검증 |
| KOSIS | `KOSIS_API_KEY` | 출생아·연령별 인구·장래인구·이동 자료 |
| SGIS | `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` | 온라인 지도 인증 |
| 유치원알리미 | `KINDER_API_KEY` | 유치원 기본현황·교직원 현황 갱신 |
| 네이버 뉴스 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 주간 뉴스 자동 갱신 |
| GitHub 배포 | `DEPLOY_PAT` | 검증된 사이트를 배포 저장소로 자동 반영 |

## 지금 어디에 등록할지

Cloudflare에는 화면 실행에 필요한 아래 세 묶음만 암호화된 Secret으로 등록한다.

```text
GEMINI_API_KEY
SGIS_CONSUMER_KEY
SGIS_CONSUMER_SECRET
```

EDSS는 브라우저·Cloudflare Pages Function이 직접 조회하지 않는다. 따라서 **EDSS 키를 Cloudflare에 넣지 않는다.** 신청한 7개 API는 2026-08-31 기준 **모두 승인되었고**, 인증키는 GitHub Actions의 Repository Secret에 API별로 하나씩 등록되어 있다. 여러 API의 키를 하나의 Secret 값에 줄바꿈·쉼표 등으로 합쳐 넣으면 안 된다.

```text
EDSS_SCHOOL_ATTRIBUTE_API_KEY
EDSS_CLASS_STUDENT_API_KEY
EDSS_STUDENT_STATUS_API_KEY
EDSS_CLASS_STATUS_API_KEY
EDSS_SCHOOL_LOCATION_API_KEY
EDSS_SCHOOL_OVERVIEW_API_KEY
EDSS_EDU_STAT_SCHOOL_OVERVIEW_API_KEY
```

일곱 개 모두 등록되어 있다. 키를 교체할 때도 이름은 그대로 두고 값만 바꾼다.

GitHub Actions에는 정기 수집·배포에 필요한 `SCHOOLINFO_API_KEY`, EDSS API별 키, `KOSIS_API_KEY`, `KINDER_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `DEPLOY_PAT`을 Repository Secret으로 등록한다. 기준 공시연도는 Secret이 아니라 Actions Variable `PUBLIC_DATA_YEAR`로 관리한다.

### EDSS 키를 새로 넣거나 바꿀 때

1. GitHub `Kimmahone/team-leap-source` → **Settings → Secrets and variables → Actions → Secrets**
2. 있는 이름이면 **Update**, 없으면 **New repository secret**
3. 이름(예: `EDSS_SCHOOL_ATTRIBUTE_API_KEY`)에 해당 API 키 **하나만** 입력
4. **Add secret** 선택

`Variables`에는 넣지 않는다.

**키만으로는 데이터가 바뀌지 않는다.** 요청주소가 있어야 한다. EDSS 요청주소는 코드가 아니라 `open api/edss-endpoints.json`의 `url` 칸에서 읽으며, 지금 그 칸은 비어 있다. 채우는 방법은 [EDSS 승인 후 연결 절차](./06.%20실행계획(1)/00.%20운영문서/06_EDSS_승인후_연결절차.md) 3장에 있다.

Cloudflare Pages의 Variables and Secrets에 저장한 값은 빌드와 Pages Function에서 함께 쓸 수 있다.
다만 새로 등록하거나 바꾼 Secret은 **기존 배포에 소급되지 않으므로** Deployments에서 최신
Production 배포를 다시 실행해야 `context.env`에 반영된다.
`/api/data-status`는 Cloudflare 런타임 키의 등록 여부만 보여 준다. GitHub Actions 전용 키(학교알리미·KOSIS·유치원알리미·EDSS)는 여기서 미등록처럼 보여도 정상이며, GitHub Actions 실행 기록으로 확인한다.

키 값은 이 안내 문서나 HTML, JavaScript 소스, GitHub Actions YAML에 직접 적지 않는다.

## 보안 상태

현재 값들은 대화와 화면 캡처에 한 번 노출되었으므로 개발 확인용으로만 사용한다. 공식 공개 전에 발급기관에서 재발급하고 Cloudflare Secret과 로컬 `.dev.vars`를 새 값으로 바꾼다.
