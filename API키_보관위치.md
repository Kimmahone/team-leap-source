# API 키 보관 위치

갱신: 2026-08-28

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
| EDSS | `EDSS_API_KEY` | 승인 후 학교속성·개황·학생·학급 자료 보완 |
| KOSIS | `KOSIS_API_KEY` | 출생아·연령별 인구·장래인구·이동 자료 |
| SGIS | `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` | 온라인 지도 인증 |
| 유치원알리미 | `KINDER_API_KEY` | 유치원 기본현황·교직원 현황 갱신 |
| 네이버 뉴스 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 주간 뉴스 자동 갱신 |
| GitHub 배포 | `DEPLOY_PAT` | 검증된 사이트를 배포 저장소로 자동 반영 |

## 운영 배포 때 등록할 Secret

Cloudflare에는 화면 실행에 필요한 아래 세 묶음을 암호화된 Secret으로 등록한다.

```text
GEMINI_API_KEY
SGIS_CONSUMER_KEY
SGIS_CONSUMER_SECRET
```

GitHub Actions에는 정기 수집·배포에 필요한 `SCHOOLINFO_API_KEY`, `EDSS_API_KEY`(승인 후), `KOSIS_API_KEY`, `KINDER_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `DEPLOY_PAT`을 Repository Secret으로 등록합니다. 기준 공시연도는 Secret이 아니라 Actions Variable `PUBLIC_DATA_YEAR`로 관리합니다.

Cloudflare Pages의 Variables and Secrets에 저장한 값은 빌드와 Pages Function에서 함께 쓸 수 있다.
다만 새로 등록하거나 바꾼 Secret은 **기존 배포에 소급되지 않으므로** Deployments에서 최신
Production 배포를 다시 실행해야 `context.env`에 반영된다.
`/api/data-status`는 실제 값을 노출하지 않고 런타임에서 각 묶음을 읽을 수 있는지만 알려 준다.

키 값은 이 안내 문서나 HTML, JavaScript 소스, GitHub Actions YAML에 직접 적지 않는다.

## 보안 상태

현재 값들은 대화와 화면 캡처에 한 번 노출되었으므로 개발 확인용으로만 사용한다. 공식 공개 전에 발급기관에서 재발급하고 Cloudflare Secret과 로컬 `.dev.vars`를 새 값으로 바꾼다.
