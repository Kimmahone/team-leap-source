# EDSS 승인 후 연결 절차

갱신: 2026-08-28

## 결론

EDSS 인증키는 지금 **Cloudflare에 넣지 않는다**. 정기 수집 프로그램이 사용할 키이므로 원본 저장소 team-leap-source의 **GitHub Actions Repository Secret**으로만 등록한다.

현재 공개 화면은 EDSS를 브라우저에서 직접 부르지 않는다. 따라서 Cloudflare Secret에 넣어도 현재 화면 기능은 달라지지 않으며, 필요한 곳보다 넓게 키를 보관하게 된다.

## 등록 위치와 이름

| 구분 | 지금 등록할 곳 | 이름 | 이유 |
|---|---|---|---|
| EDSS 수집 키 | GitHub → team-leap-source → Settings → Secrets and variables → Actions → Secrets | EDSS_API_KEY | 이후 정기 수집 스크립트만 읽도록 제한 |
| Cloudflare Pages | 등록하지 않음 | 해당 없음 | 현재 Pages Function·브라우저가 EDSS를 호출하지 않음 |
| 로컬 개발 | 필요할 때만 프로젝트 루트 .dev.vars | EDSS_API_KEY | 개발자가 승인 응답을 한 번 점검할 때만 사용 |

## GitHub에 안전하게 등록하는 방법

1. GitHub에서 Kimmahone/team-leap-source 저장소를 연다.
2. **Settings → Secrets and variables → Actions**를 연다.
3. **Secrets** 탭에서 **New repository secret**을 누른다.
4. Name에 정확히 EDSS_API_KEY를 입력한다.
5. Value에 EDSS에서 받은 인증키만 붙여 넣는다.
6. **Add secret**을 누른다.

Variables가 아니라 반드시 Secrets에 등록한다. 등록 후에는 값이 다시 표시되지 않는 것이 정상이다.

## 아직 자동 수집이 시작되지 않는 이유

현재는 학교속성 API만 승인됐고, EDSS의 실제 요청 URL·파라미터·응답 필드가 아직 대시보드 코드에 연결되지 않았다. 따라서 키를 등록해도 지금 즉시 화면의 숫자가 바뀌지는 않는다.

학생·학급 API가 승인된 뒤 개발 문서와 키를 확인하면 다음 순서로 연결한다.

1. 키가 노출되지 않는 테스트 요청 1회
2. 학교코드·조사연도·학년·학생수·학급수 필드 확인
3. 학교알리미 현재 자료와 합계·누락·중복 비교
4. 통과한 자료만 정기 수집 워크플로에 연결
5. 전체 검사 통과 뒤에만 공개 데이터 갱신

## Cloudflare에 키를 넣는 경우

나중에 서버 기능이 EDSS를 실시간으로 조회해야 한다는 별도 결정이 있을 때만 Cloudflare Pages의 **Settings → Variables and Secrets → Production → Secret**에 같은 이름 EDSS_API_KEY로 추가한다. 이 경우에도 브라우저 JavaScript에는 키를 절대 넣지 않는다.

## 전달할 때 지킬 원칙

- 키 값 전체가 보이는 화면 캡처를 보내지 않는다.
- 문서·메신저·Git 커밋에 키를 적지 않는다.
- 개발 문서나 응답 예시를 공유할 때는 인증 관련 값만 ***로 가린다.
- 키가 대화·캡처에 노출됐다고 판단되면 발급기관에서 폐기·재발급한 뒤 Secret 값만 교체한다.
