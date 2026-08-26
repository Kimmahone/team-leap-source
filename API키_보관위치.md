# API 키 보관 위치

갱신: 2026-08-27

## 한 곳에서 찾기

- 로컬 개발용 실제 값: 프로젝트 루트의 `.dev.vars`
- 값이 없는 공유용 견본: `.dev.vars.example`
- 과거 데이터 굽기 스크립트용 키: `open api/인증키.txt`
- 운영 배포용 실제 값: Cloudflare Pages 프로젝트의 **Settings → Variables and Secrets(Runtime)**

`.dev.vars`와 `open api/인증키.txt`는 `.gitignore`에 의해 GitHub에 올라가지 않는다. 새 키를 발급하면 `.dev.vars`를 먼저 갱신하고, 기존 굽기 스크립트가 사용하는 키는 `open api/인증키.txt`도 함께 갱신한다.

## 환경변수 이름

| 서비스 | 환경변수 | 현재 용도 |
|---|---|---|
| Gemini | `GEMINI_API_KEY` | Cloudflare의 AI 분석 중계 |
| 학교알리미 | `SCHOOLINFO_API_KEY` | 학교·학생·교원 자료 갱신 |
| KOSIS | `KOSIS_API_KEY` | 출생아·연령별 인구·장래인구·이동 자료 |
| SGIS | `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` | 온라인 지도 인증 |
| 유치원알리미 | `KINDER_API_KEY` | 유치원 기본현황·교직원 현황 갱신 |

## 운영 배포 때 등록할 Secret

아래 여섯 이름을 모두 암호화된 Secret으로 등록한다.

```text
GEMINI_API_KEY
SCHOOLINFO_API_KEY
KOSIS_API_KEY
SGIS_CONSUMER_KEY
SGIS_CONSUMER_SECRET
KINDER_API_KEY
```

Cloudflare 화면 오른쪽 메뉴에서 **Build**가 선택된 상태의 변수는 빌드 전용이다.
Pages Function이 읽는 키는 **Settings의 Runtime Variables and Secrets**에 같은 이름으로
등록해야 한다. 키를 바꾼 뒤에는 Deployments에서 최신 Production 배포를 다시 실행한다.
`/api/data-status`는 실제 값을 노출하지 않고 런타임에서 각 묶음을 읽을 수 있는지만 알려 준다.

키 값은 이 안내 문서나 HTML, JavaScript 소스, GitHub Actions YAML에 직접 적지 않는다.

## 보안 상태

현재 값들은 대화와 화면 캡처에 한 번 노출되었으므로 개발 확인용으로만 사용한다. 공식 공개 전에 발급기관에서 재발급하고 Cloudflare Secret과 로컬 `.dev.vars`를 새 값으로 바꾼다.
