# EDSS 승인 후 연결 절차

갱신: 2026-08-31

## 지금 상태

신청한 EDSS API 7개가 **모두 승인**되었고, 요청주소 7개도 `open api/edss-endpoints.json`에 들어갔다. 수집·검사·자동 갱신 코드도 붙었다.

**남은 것은 인증키가 있는 저장소다.**

> 〔2026-08-31〕 키 7개가 **배포 저장소 `Kimmahone/team-leap`** 에 등록되어 있었다. 이름도 값도 맞지만 **그 저장소에는 워크플로가 하나도 없어 아무도 읽지 않는다.** 수집기가 도는 곳은 원본 저장소 `Kimmahone/team-leap-source`다. 같은 이름·같은 값으로 원본 저장소에 다시 등록해야 한다. Secret 값은 다시 읽을 수 없으므로 옮기는 명령은 없다 — 사람이 다시 붙여 넣어야 한다.
>
> 같은 이유로 `KOSIS_API_KEY`·`SCHOOLINFO_API_KEY`·`KINDER_API_KEY`도 두 저장소 어디에도 없다. 정기 갱신 워크플로가 그 셋을 계속 건너뛰고 있었다(경고만 남기고 성공으로 끝나므로 눈에 띄지 않았다).

Cloudflare에는 EDSS 키를 넣지 않는다. 브라우저·Pages Function이 EDSS를 호출하지 않으므로, 넣으면 필요한 곳보다 넓게 키를 보관하게 될 뿐이다.

## 1. 어디에 무엇이 있나

| 구분 | 위치 | 이름 |
|---|---|---|
| EDSS 수집 키 | GitHub → team-leap-source → Settings → Secrets and variables → Actions → Secrets | API별 `EDSS_…_API_KEY` 7개 |
| Cloudflare Pages | 등록하지 않음 | 해당 없음 |
| 로컬 개발 | 필요할 때만 프로젝트 루트 `.dev.vars` | 승인된 API의 `EDSS_…_API_KEY` |
| 요청주소 | `open api/edss-endpoints.json` | API별 `url` |
| 수집기 | `open api/bake-edss.mjs` | — |
| 검사 | `tests/edss.test.mjs` · `06. 실행계획(1)/prototype/test.js`의 「EDSS 실적 연결」절 | — |

키는 한 Secret에 하나만 넣는다. 여러 API의 키를 줄바꿈·쉼표로 합치지 않는다.

## 2. 코드는 이미 붙어 있다

`bake-edss.mjs`가 하는 일은 셋이다.

1. **받는다** — 승인된 API를 연도별·페이지별로 돌며 학교·학년 단위 학생수·학급수를 모은다.
2. **접는다** — 시군 × 학교급 × 학년 × 연도로 접는다. 학교별 원자료는 `open api/data/edss-series.json`에 따로 둔다(백테스트용).
3. **심는다** — 대시보드 `index.html`에 `EDSS_YEARS`·`EDSS_TOTAL`·`EDSS_SGG`·`EDSS_GRADE`·`EDSS_RATE`·`EDSS_COHORT`·`EDSS_BACKTEST`·`EDSS_BIRTH`를 넣는다.

대시보드는 그 값이 **있을 때만** 켜진다(`const EDSS = … : null`). 심기 전에는 지금과 한 글자도 다르지 않게 돈다. 심으면 셋이 한꺼번에 바뀐다.

- 2016~ 학생수 곡선이 **직선 보간 → 실적**
- 시군별 감소율이 **지어낸 값(군 0.062·시 0.033) → 실측 CAGR**
- 2027~ 전망이 **감소율 곱셈 → 코호트 진급법**(초1은 6년 전 출생아 × 실측 취학률)

그리고 화면의 설명 문구도 함께 바뀐다(`applyEdssWording`). 자료만 좋아지고 설명이 「가정한 감소율」로 남으면 그 설명이 거짓이 되기 때문이다.

## 3. 남은 일 — 요청주소 채우기

요청주소는 코드에 박혀 있지 않다. `open api/edss-endpoints.json`의 `url` 칸에서 읽는다. 지금 그 칸은 비어 있다.

1. 신청한 곳에 로그인한다. 둘 중 하나다.
   - [data.go.kr](https://www.data.go.kr) → **마이페이지 → 데이터활용 → Open API → 활용신청 현황**
   - [edss.moe.go.kr](https://edss.moe.go.kr) (또는 edmgr.kr) → **신청내역**
2. 승인된 API를 눌러 **요청주소(엔드포인트)** 복사 — `?serviceKey=…` 앞까지만

   2026-08-31 확인: 이 7개는 data.go.kr **공개 검색으로는 나오지 않는다.** 승인 계정으로 로그인해야 보이는 자리에 있다. 그래서 요청주소만은 사람이 한 번 옮겨 적어야 한다.
3. `edss-endpoints.json`의 그 API `url`에 붙여넣고 커밋
4. GitHub Actions → **공공데이터 정기 확인 및 갱신** → Run workflow → `dataset: edss-probe`

주소가 하나도 없으면 수집기는 조용히 0건을 만들지 않고 **「요청주소 없음」을 이름과 함께 적은 뒤 멈춘다.** 조용한 0건이 가장 나쁘기 때문이다.

한 개만 시험할 때는 파일을 고치지 않아도 된다. Run workflow 화면의 `edss_only`에 API 이름(`schoolAttribute`·`classStudent`·`studentStatus`·`classStatus`·`schoolLocation`·`schoolOverview`·`eduStatOverview` 중 하나), `edss_url`에 주소를 넣으면 그 한 번만 그 주소를 쓴다.

## 4. probe가 만드는 것

`edss-probe`는 API마다 **한 번씩만** 부른다. 결과는 `open api/data/edss-probe.json`에 적히고, 그 파일에는 다음이 들어간다.

- 응답 총건수와 봉투 모양
- **칸 이름 전부**와 각 칸의 자료형
- 수집기가 고른 칸(`고른칸`)과 고른 까닭(`고른까닭`)

들어가지 **않는** 것: 인증키, 학교 이름, 학생 수 — 어떤 값도 담지 않는다. 모양만 본다.

이 파일이 커밋되면 그것을 보고 짝짓기를 확정한다. 짐작이 틀렸으면 `edss-endpoints.json`의 `fields`에 실제 칸 이름을 적어 고정한다.

## 5. 짐작이 특히 조심하는 것

칸 이름을 미리 모르는 채로 붙였으므로 수집기는 이름을 보고 짐작한다. 가장 위험한 것은 **학생수·학급수**다. `특수학급학생수`·`남학생수`·`교원수` 같은 곁가지를 전체 학생수로 집으면 경북 학생이 조용히 1/20이 되는데 화면은 멀쩡해 보인다.

그래서 그런 낱말(`특수·장애·다문화·외국·탈북·중도·전입·전출·남·여·교원·교사·직원` 등)이 든 칸은 학생수·학급수 후보에서 아예 뺀다. 이 규칙은 `tests/edss.test.mjs`가 못 박고 있다.

## 6. 확인하는 순서

1. `edss-probe` 실행 → `edss-probe.json`의 `고른칸`이 맞는지 확인
2. 학교코드·조사연도·학년·학생수·학급수가 다 있는지 확인
3. 틀린 짝짓기가 있으면 `fields`에 고정
4. `dataset: edss`로 본 수집 — 시군이 22곳인지, 연도가 3개 이상인지 수집기가 스스로 경고한다
5. 백테스트 오차율 확인 — 첫 해로 마지막 해를 예측해 실제와 몇 % 차이인지 로그에 찍힌다
6. 전체 검사(`사이트 굽기.command`)가 통과해야만 커밋·배포된다

5번이 중요하다. 오차율이 크면 그 전망을 화면에 그대로 내보내지 않는다. 화면에도 이 오차율을 적으므로, 보는 사람이 전망을 얼마나 믿을지 스스로 정할 수 있다.

## 7. 전달할 때 지킬 원칙

- 키 값 전체가 보이는 화면 캡처를 보내지 않는다.
- 문서·메신저·Git 커밋에 키를 적지 않는다.
- 개발 문서나 응답 예시를 공유할 때는 인증 관련 값만 `***`로 가린다.
- 키가 대화·캡처에 노출됐다고 판단되면 발급기관에서 폐기·재발급한 뒤 Secret 값만 교체한다.

수집기는 내보내는 모든 글자를 한 번 거른다(`redact`). 오류 메시지에 요청 URL이 통째로 실려 나와도 `serviceKey=***`로 가려진다. GitHub Actions 로그는 저장소를 볼 수 있는 사람이면 누구나 읽기 때문이다.
