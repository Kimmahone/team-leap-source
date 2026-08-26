# 1. 깃허브 탑재 (배포)

**밖으로 나가는 것과, 그것을 만드는 재료가 들어 있습니다.**

---

## 먼저 — 깃허브에 실제로 올라간 것은 하나뿐입니다

| | 깃허브에 있나 |
|---|---|
| **`배포/site/`** | **예. 이 폴더가 곧 저장소입니다** (`Kimmahone/team-leap`, 현재 비공개) |
| 나머지 전부 | **아니오.** 내 컴퓨터에만 있습니다 |

폴더 이름이 「깃허브 탑재」인 것은 **「배포와 관련된 것들」** 이라는 뜻이지,
이 안의 모든 파일이 깃허브에 올라가 있다는 뜻이 아닙니다.

> **특히 `open api/인증키.txt` 는 절대 올라가지 않습니다.**
> 굽기 스크립트가 배포물 안에 인증키가 섞였는지 검사하고, 발견되면 폴더째 지웁니다.

---

## 무엇이 무엇을 만드는가

```
index.html                    ──┐
06. 실행계획(1)/prototype/    ──┤   사이트 굽기.command    ┌─ 배포/site/index.html
08. 실행계획(3)/apps/         ──┼─────────────────────────>├─ 배포/site/dashboard/
open api/인증키.txt (검사용)  ──┘                          └─ 배포/site/apps/
                                                              ↑ 이것만 깃허브
```

| 폴더 · 파일 | 무엇 |
|---|---|
| `index.html` | 사이트 메인 화면의 **원본**. 고치려면 여기를 고칩니다 |
| `test.js` | 메인 화면 검사 |
| `06. 실행계획(1)/` | 학령인구 대시보드의 **원본** → `배포/site/dashboard/` |
| `08. 실행계획(3)/` | **앱 9종 + 카탈로그·활용 가이드의 원본** → `배포/site/apps/` |
| `open api/` | 학교알리미 공공데이터를 굽는 도구. **인증키가 있으므로 절대 공개 금지** |
| `배포/site/` | **★ 깃허브 저장소.** 굽기 결과물이 담깁니다 |
| `배포/*.zip` | 오프라인 배포용 묶음 |

---

## 스크립트 세 개

**셋 다 자기가 있는 폴더를 기준으로 파일을 찾습니다. 이 폴더 밖으로 옮기면 동작하지 않습니다.**

| 스크립트 | 하는 일 |
|---|---|
| `사이트 굽기.command` | 원본 → `배포/site/` 로 굽고, 링크를 고치고, **인증키·외부 CDN이 섞였는지 검사** |
| `배포 묶기.command` | 검사를 전부 돌린 뒤 zip으로 묶음 |
| `열어보기.command` | 로컬 서버를 띄워 원본 상태 그대로 확인 |

### 권장 배포 순서 — GitHub와 Cloudflare Pages 연결

```
① 원본 저장소(team-leap-source)에 수정사항을 커밋·푸시
② GitHub Actions가 검사·굽기를 실행
③ Actions가 결과와 functions/를 배포 저장소(team-leap) main에 푸시
④ Cloudflare Pages가 team-leap main의 변경을 감지해 자동 배포
```

아직 Cloudflare Git 연동을 하지 않았다면 Cloudflare 대시보드에서 한 번만 설정합니다.

1. **Workers & Pages → Create application → Pages → Connect to Git**
2. GitHub 저장소 **`Kimmahone/team-leap`**, 배포 브랜치 **`main`** 선택
3. 프레임워크는 `None`, 빌드 명령은 비움, 출력 디렉터리는 `/`(저장소 루트)
4. 프로젝트 **Settings → Variables and Secrets의 Runtime 영역**에 아래 이름을 암호화 값으로 등록

   - `GEMINI_API_KEY`
   - `SGIS_CONSUMER_KEY`
   - `SGIS_CONSUMER_SECRET`
   - `KOSIS_API_KEY`
   - `SCHOOLINFO_API_KEY`
   - `KINDER_API_KEY`

주의: **Build → Variables and Secrets**에만 넣으면 사이트를 굽는 과정에서는 보이지만
Pages Function의 `context.env`에서는 보이지 않습니다. Gemini와 SGIS처럼 `/api/...`가
읽는 키는 반드시 Runtime Secret에도 있어야 합니다.

원본 저장소의 GitHub Actions가 `team-leap`에 푸시하려면 `team-leap-source`의
**Settings → Secrets and variables → Actions**에 `DEPLOY_PAT`도 필요합니다.
GitHub의 **Settings → Developer settings → Personal access tokens → Fine-grained tokens**에서
`team-leap` 저장소만 선택하고 `Contents: Read and write` 권한으로 만든 뒤 그 값을 `DEPLOY_PAT`에 넣습니다.
만료일은 짧게 두고, 만료되면 같은 이름의 Secret 값만 교체합니다.

로컬 키의 실제 값은 공개 문서가 아니라 루트의 `.dev.vars`에만 있습니다.
이 파일은 Git에서 제외됩니다. 위치와 갱신 방법은 `API키_보관위치.md`를 참고합니다.

Git 연동 전 임시로만 수동 배포하려면 다음처럼 명시적으로 실행합니다.

```bash
DEPLOY_LIVE=1 ./사이트\ 굽기.command
```

평소 `사이트 굽기.command`는 검사와 빌드만 하고 라이브 사이트를 임의로 바꾸지 않습니다.

이미 연결된 프로젝트를 다시 배포하려면 원본 `main`에 커밋·푸시하면 됩니다.
GitHub Actions가 끝나면 Cloudflare가 배포 저장소의 새 커밋을 감지합니다. 키만 바꾼 경우에는
Cloudflare **Deployments → 최신 Production 배포 → Retry deployment**를 누릅니다.
배포 뒤 `/api/data-status`에서 Gemini와 SGIS의 `configured` 값이 `true`인지 확인할 수 있으며,
실제 키 값은 응답에 나오지 않습니다.

> **배포 직후 확인은 캐시를 우회해서 하세요.**
> `curl -sI "https://team-leap.pages.dev/?cb=$RANDOM"`
> 그냥 부르면 **엣지에 남은 옛 응답**이 옵니다. 실제로 한 번 「배포가 안 됐다」고
> 잘못 판단한 적이 있습니다 (`할 일.md` 2026. 8. 8. 항목).

---

## 공개로 바꾸기 전에 반드시 할 것

저장소는 지금 **비공개**입니다. 공개 전에 네 가지를 처리해야 합니다.
자세한 내용은 루트의 **`할 일.md`** 에 있습니다.

1. `index.html` 의 **개인 지메일 두 곳**을 학교 메일로 교체
2. `LICENSE` 파일 추가 (CC BY-NC-SA 4.0 권고)
3. `사이트 굽기.command` 43번째 줄 수정 + `.gitignore` 복구
4. 공개하는 날 `배포/site/robots.txt` 의 `Disallow: /` 삭제

**순서가 중요합니다. 1 → 3 → 2 → 4 → 다시 굽기 → 푸시 → 그다음에 공개.**
먼저 공개해 버리면 그 사이에 메일 주소가 크롤러에 수집됩니다.

---

## 주의

- `사이트 굽기.command` 는 `배포/site/` 에서 **`.git` 만 남기고 전부 지웁니다.**
  굽기가 만들지 않는 파일(예: `LICENSE`, `.gitignore`)은 다음 굽기 때 조용히 사라집니다.
  살리려면 스크립트 43번째 줄의 예외 목록에 넣어야 합니다.
- `08. 실행계획(3)/apps/kit/` 이 **원본**이고, 각 앱 안의 것은 **사본**입니다.
  원본을 고치면 앱 안의 블록도 함께 고쳐야 합니다.
