# API 키 보관 위치

갱신: 2026-09-15

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
| 브이월드 | `VWORLD_API_KEY` | Cloudflare 지도 중계. ClassPlan/Google Cloud 키가 아니라 브이월드 발급 키 |
| 학교알리미 | `SCHOOLINFO_API_KEY` | 학교·학생·교원 자료 갱신 |
| EDSS 학교속성 | `EDSS_SCHOOL_ATTRIBUTE_API_KEY` | 학교코드·학교급·시군 기준정보 |
| EDSS 학생·학급 등 | API별 `EDSS_…_API_KEY` | 학교·학년·연도별 학생·학급 시계열, 개황·위치정보 교차검증 |
| KOSIS | `KOSIS_API_KEY` | 출생아·연령별 인구·장래인구·이동 자료 |
| SGIS | `SGIS_CONSUMER_KEY` (서비스 ID) | 온라인 지도 인증 — **코드가 읽는 것은 이것 하나** |
| SGIS | `SGIS_CONSUMER_SECRET` (보안 Key) | 지금은 읽는 코드가 없다. REST API 대비용 |
| 유치원알리미 | `KINDER_API_KEY` | 유치원 기본현황·교직원 현황 갱신 |
| 네이버 뉴스 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 주간 뉴스 자동 갱신 |
| GitHub 배포 | `DEPLOY_PAT` | 검증된 사이트를 배포 저장소로 자동 반영 |

## 지금 어디에 등록할지

Cloudflare에는 화면 실행에 필요한 아래 키를 암호화된 Secret으로 등록한다.

```text
GEMINI_API_KEY
VWORLD_API_KEY
SGIS_CONSUMER_KEY
SGIS_CONSUMER_SECRET
```

`SGIS_CONSUMER_SECRET`은 현재 지도 코드가 읽지 않는 선택 항목이다.

**ClassPlan/Google Cloud API 키는 이 대시보드에서 `GEMINI_API_KEY` 한 종류만 사용한다.**
ClassPlan에서 두 키를 새로 발급하더라도 두 번째 키의 사용 API를 확인하기 전에는
`VWORLD_API_KEY`나 `SGIS_CONSUMER_KEY`에 넣지 않는다. 두 이름은 각각 다른 발급기관의 키다.
Google Cloud 프로젝트 자체가 정지된 동안에는 키를 교체해도 Gemini 호출은 복구되지 않는다.

새 Gemini 키를 운영에 넣을 때는 **Cloudflare Workers & Pages → `team-leap` →
Settings → Variables and Secrets → Production → `GEMINI_API_KEY` → Edit/Replace(없으면 Add)
→ Secret/Encrypt → Save** 순서다. PR 미리보기에서도 AI 해설을 확인하려면
**`team-leap-source`의 Preview** 환경에 같은 이름으로 따로 등록한다.
변경 후 해당 환경의 Deployments에서 **Retry deployment**로 새 배포를 만들어야 반영된다.
지도 확인만 하려면 Gemini 키는 없어도 된다.

로컬 Pages Functions 개발에서는 프로젝트 루트의 `.dev.vars`에
`GEMINI_API_KEY=새로_발급한_키`를 넣는다. 이 파일은 Git에서 제외되어 있다.
`file:///`로 HTML을 직접 열거나 단순 정적 HTTP 서버로만 열면 Pages Functions가
실행되지 않으므로, `.dev.vars`에 키를 넣어도 지도 중계나 AI 중계는 동작하지 않는다.
실제 키는 이 문서, `.dev.vars.example`, HTML, GitHub 커밋·PR에 적지 않는다.

> **Cloudflare 쪽은 프로젝트도 둘, 환경도 둘이다.** 프로덕션에 넣은 값은 PR 미리보기에
> 적용되지 않는다. 아래 [Cloudflare는 프로젝트가 둘, 환경이 둘이다](#cloudflare는-프로젝트가-둘-환경이-둘이다-2026-09-09-추가)를 먼저 읽는다.

> **어느 저장소인지 틀리기 쉽다.** GitHub Actions Secret은 **원본 저장소 `Kimmahone/team-leap-source`** 에 넣는다. 배포 저장소 `Kimmahone/team-leap`에는 워크플로가 하나도 없어서, 거기 넣은 키는 아무도 읽지 않는다. 2026-08-31에 EDSS 7개가 실제로 그렇게 들어가 한 번 헛돌았다.

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
배포를 다시 실행해야 `context.env`에 반영된다.
`/api/data-status`는 Cloudflare 런타임 키의 등록 여부만 보여 준다. GitHub Actions 전용 키(학교알리미·KOSIS·유치원알리미·EDSS)는 여기서 미등록처럼 보여도 정상이며, GitHub Actions 실행 기록으로 확인한다.

---

## Cloudflare는 프로젝트가 둘, 환경이 둘이다 〔2026-09-09 추가〕

**여기서 네 번 틀릴 수 있다.** 실제로 PR 미리보기에서 지도가 안 떠서 알게 되었다.

### 무엇이 둘인가

| | 주소 | 무엇을 서비스하나 |
|---|---|---|
| **team-leap** | `team-leap.pages.dev` | 운영. 배포 저장소 `Kimmahone/team-leap` |
| **team-leap-source** | `<해시>.team-leap-source.pages.dev` | **PR 미리보기.** 원본 저장소 `Kimmahone/team-leap-source` |

그리고 **각 프로젝트마다** 환경이 다시 둘이다.

| 환경 | 언제 쓰이나 |
|---|---|
| 프로덕션(Production) | 기본 브랜치 배포 |
| **미리보기(Preview)** | **PR 브랜치 배포** |

**프로덕션에 넣은 값은 미리보기에 적용되지 않는다.** 환경마다 따로 갖는다.

### 실제로 겪은 것

PR #16 미리보기(`3399395d.team-leap-source.pages.dev`)에서 실제 위치 지도가 뜨지 않았다.

```
GET /api/sgis-map
→ window.SGIS_MAP_STATUS={ready:false,message:"서버에 SGIS 서비스 ID가 설정되지 않았습니다."}
```

같은 시각 운영(`team-leap.pages.dev/api/sgis-map`)은 SGIS 라이브러리를 정상으로 내려 주고 있었다.
**키가 team-leap 프로덕션에만 있었기 때문이다.**

함수 자체는 돌고 있었다(응답이 왔다). 키가 없다는 것을 함수가 스스로 말해 준 것이고,
그래서 화면은 죽지 않고 간편 지도로 내려앉았다. 이중화가 제 일을 한 자리다.

### 그래서 어디에 넣나

**PR 미리보기에서 실제 위치 지도를 보려면** `team-leap-source` 프로젝트의
**미리보기 환경**에 넣는다.

```
Cloudflare Pages → team-leap-source → 설정 → 변수 및 비밀
  → 환경: 미리보기
  → 추가 → 유형: 비밀
       이름  SGIS_CONSUMER_KEY
       값    SGIS 「서비스 ID」
```

넣은 뒤 **반드시 새 배포를 만든다.** 변수만 추가하고 기존 미리보기를 새로고침하면
그대로 안 뜬다 — Pages Function은 배포 시점에 비밀이 묶인다.
Deployments에서 **Retry deployment**를 누르거나 PR 브랜치에 커밋을 하나 더 민다.

한 번 넣어 두면 **그 뒤의 모든 PR 미리보기**에 적용된다. PR마다 넣을 필요는 없다.

### SGIS 인증키의 두 칸이 어느 이름인가

SGIS Developers → 인증키발급센터 → 나의 인증키 표에서 가져온다.

| SGIS 화면의 칸 | 환경변수 | 코드가 쓰나 |
|---|---|---|
| **서비스 ID** | `SGIS_CONSUMER_KEY` | **쓴다** — `javascriptAuth`의 `consumer_key` |
| 보안 Key | `SGIS_CONSUMER_SECRET` | **아직 안 쓴다** |

`functions/api/sgis-map.js`가 읽는 것은 `SGIS_CONSUMER_KEY` 하나뿐이다.
`SGIS_CONSUMER_SECRET`은 `functions/shared/data-catalog.js`에 **선택 항목**(`optionalEnv`)으로만
적혀 있고 읽는 코드가 없다. SGIS REST API(토큰 발급)를 붙일 때를 위해 이름만 잡아 둔 것이다.
**지도만 살리려면 서비스 ID 하나로 충분하다.**

### 미리보기에 키를 넣어도 되나

된다. 키는 서버(Pages Function) 안에서만 쓰이고 브라우저로 내려가지 않는다.
`sgis-map.js`는 SGIS가 돌려준 스크립트에 **키가 섞여 있으면 아예 내보내지 않고**
「안전하게 전달하지 않았습니다」로 답한다. 이 동작은 `tests/sgis-map.test.mjs`가 지킨다.

다만 `GEMINI_API_KEY`는 **넣지 않아도 지도 확인에 지장이 없다.** 넣으면 미리보기에서
시뮬레이터의 「이 결과 쉽게 읽기」까지 눌러 볼 수 있는 대신 사용량을 쓴다. 필요할 때 넣는다.

### 네 자리 한눈에

| 키 | GitHub Actions | team-leap 프로덕션 | team-leap-source 미리보기 |
|---|---|---|---|
| EDSS 7개 · 학교알리미 · KOSIS · 유치원알리미 · 네이버 · `DEPLOY_PAT` | **필요** | 불필요 | 불필요 |
| `SGIS_CONSUMER_KEY` | 불필요 | **필요** | **미리보기에서 지도를 보려면 필요** |
| `VWORLD_API_KEY` | 불필요 | **필요** | **미리보기에서 브이월드 지도를 보려면 필요** |
| `GEMINI_API_KEY` | 불필요 | **필요** | 선택 |

**굽는 키는 Actions, 화면이 실행 중에 읽는 키는 Cloudflare.** 이 한 줄이 기준이다.

키 값은 이 안내 문서나 HTML, JavaScript 소스, GitHub Actions YAML에 직접 적지 않는다.

## 보안 상태

현재 값들은 대화와 화면 캡처에 한 번 노출되었으므로 개발 확인용으로만 사용한다. 공식 공개 전에 발급기관에서 재발급하고 Cloudflare Secret과 로컬 `.dev.vars`를 새 값으로 바꾼다.
