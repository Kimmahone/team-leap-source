/* 주간 뉴스 클리핑 — 학령인구 감소·소규모학교 기사를 모읍니다.

   쓰는 법
     NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node fetch-news.js
     node fetch-news.js --dry     받기만 하고 파일은 고치지 않습니다

   내는 것 하나
     news-history.json   지금까지 모은 것. 「이번 주」는 날짜로 뽑으므로
                         따로 파일을 두지 않습니다 — 둘을 두면 조용히 어긋납니다.

   ★ 열쇠를 코드에 적지 않습니다 〔2026. 8. 12.〕
     예전에는 여기 그대로 박혀 저장소에 커밋됐습니다. 이제 환경변수로만 받습니다.
     GitHub Actions 에서는 Secrets 로 넣습니다.

   ★ 받은 것을 화면이 바로 쓰지 않습니다
     이 파일들은 «재료»입니다. 화면에 올라가려면 `사이트 굽기.command` 가
     대시보드 안에 심어야 합니다. 그렇게 한 까닭은 그 스크립트 1-b 에 있습니다
     (CSP 의 connect-src 를 열지 않기 위해서입니다).

   ★ 실패하면 시끄럽게 죽습니다
     예전에는 실패해도 조용히 끝나서 열쇠가 죽은 것을 아무도 몰랐고,
     그 자리를 손으로 적은 «지어낸 기사» 넉 장이 메우고 있었습니다.
     이제 실패는 종료코드 1 이고, 실패해도 기존 파일을 덮지 않습니다. */

'use strict';

const fs = require('fs');
const https = require('https');

const DRY = process.argv.includes('--dry');
const WANT = 4;              // 카드에 올릴 수
const HISTORY_MAX = 60;      // 히스토리에 남길 최대 건수

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

if (!ID || !SECRET) {
  console.error('✗ NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 환경변수가 없습니다.');
  console.error('  로컬:    NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node fetch-news.js');
  console.error('  Actions: 저장소 Settings → Secrets and variables → Actions 에 등록');
  process.exit(1);
}

/* ── 질의 ──────────────────────────────────────────────────────────
   하나로는 안 됩니다. 「학령인구 감소」만 넣으면 그 말이 **설명문에만** 스치는
   기사(문구회사 실적·대학 평가 등급)가 잔뜩 옵니다 — 실제로 그랬습니다.
   주제를 가리키는 질의 셋을 돌려 합치고, 아래에서 점수로 거릅니다. */
const QUERIES = ['소규모학교 통폐합', '학령인구 감소 학교', '경북 학령인구'];

/* ── 점수 ──────────────────────────────────────────────────────────
   우리가 찾는 것은 「학령인구 감소에 학교가 어떻게 대응하는가」입니다.
   낱말이 있느냐가 아니라 **무엇에 대한 기사냐**를 봅니다. */
const SCORE = [
  /* 경북 가중치를 5 로 둡니다 — 이 대시보드는 경북 것입니다.
     3 이었을 때 경기도 포천시 기사가 경북 기사와 **같은 점수**로 묶여
     카드 넉 장 가운데 셋이 포천이 된 적이 있습니다.
     ※ 「고령」은 «고령화» 에, 「영양」은 «영양» 에, 「상주」는 «상주인구» 에,
        「청도」는 중국 «칭다오» 에 걸립니다. 그 넷만 군·시를 붙여 봅니다. */
  [5, /경북|경상북도|포항|경주|김천|안동|구미|영주|영천|문경|경산|의성|청송|영덕|성주|칠곡|예천|봉화|울진|울릉|고령군|영양군|상주시|청도군/],
  [3, /폐교|통폐합|통합 ?운영|적정규모|분교|소규모 ?학교|작은 ?학교/],
  [2, /학교|교육청|교육지원청|학급|교원|초등|중학교|고등학교|유치원/],
  [1, /학령인구|저출생|저출산|지역소멸|인구감소/]
];
/* 같은 낱말이 스쳤을 뿐인 기사들 — 실제로 걸려 나왔던 것들입니다 */
const NOISE = /주가|증시|종목|코스닥|코스피|상승세|실적|매출|분기|총장|대학 ?평가|S등급|장학금|아파트|분양|청약/;

function get(options) {
  return new Promise((resolve) => {
    const req = https.get(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: '', error: '시간 초과' }); });
  });
}

/* 두 포털이 같은 검색을 다른 주소·다른 머리글로 받습니다.
   어느 쪽 열쇠를 받았는지에 따라 되는 쪽이 다르므로 둘 다 두드립니다. */
function endpoints(query) {
  const q = encodeURIComponent(query);
  return [
    {
      name: 'NCP API Hub',
      options: {
        hostname: 'naverapihub.apigw.ntruss.com',
        path: `/search/v1/news?query=${q}&display=30&sort=date`,
        headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET }
      }
    },
    {
      name: '네이버 개발자센터',
      options: {
        hostname: 'openapi.naver.com',
        path: `/v1/search/news.json?query=${q}&display=30&sort=date`,
        headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET }
      }
    }
  ];
}

/* 네이버는 제목·요약에 <b> 태그와 HTML 실체를 섞어 보냅니다.
   태그는 걷어 내고 실체는 풀어 둡니다 — 화면 쪽에서 다시 이스케이프합니다. */
function clean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreOf(item) {
  const text = item.title + ' ' + item.description;
  if (NOISE.test(text)) return -1;

  /* ★ 둘 중 하나는 반드시 있어야 합니다 —
       ① 경북 이야기이거나  ② 학교 통폐합·소규모학교 이야기이거나.
     둘 다 없으면 그냥 「교육 기사」입니다. 실제로 경기도 포천시의
     교육혁신선도지역 공모 기사 넷이 카드에 올라와 있었습니다.
     우리 대시보드는 경북 것이고, 주제는 학령인구 감소 대응입니다. */
  const isLocal = SCORE[0][1].test(text);
  const isTopic = SCORE[1][1].test(text);
  if (!isLocal && !isTopic) return -1;

  let s = 0;
  for (const [w, re] of SCORE) if (re.test(text)) s += w;
  /* 제목에 주제가 없으면 «스친» 기사입니다 */
  if (!/폐교|통폐합|소규모|작은 ?학교|학령인구|학교|교육|분교|학급|저출생/.test(item.title)) s -= 4;
  return s;
}

/* ── 같은 사건 묶기 ────────────────────────────────────────────────
   링크가 다르다고 다른 기사가 아닙니다. 같은 보도자료를 여러 매체가 쓰면
   제목만 조금씩 다른 기사가 넷씩 옵니다 — 실제로 카드 4장이 전부
   「경북교육청, 교직단체와 교육현안 논의」한 건이었습니다.
   제목의 낱말이 절반 넘게 겹치면 같은 사건으로 보고 **먼저 온 것만** 남깁니다. */
function titleTokens(t) {
  return new Set(
    String(t).replace(/[^가-힣A-Za-z0-9 ]/g, ' ')
      .split(/\s+/).filter((w) => w.length >= 2)
  );
}
function headOf(t) {
  return String(t).replace(/[^가-힣A-Za-z0-9 ]/g, ' ')
    .split(/\s+/).filter((w) => w.length >= 2).slice(0, 2).join(' ');
}
function sameStory(a, b) {
  const A = titleTokens(a), B = titleTokens(b);
  if (!A.size || !B.size) return false;
  let hit = 0;
  A.forEach((w) => { if (B.has(w)) hit++; });
  if (hit / Math.min(A.size, B.size) >= 0.45) return true;
  /* 매체가 보도자료를 고쳐 쓰면 낱말 겹침이 문턱을 아슬아슬하게 비껴갑니다.
     실제로 「경북교육청 교직단체와 …」 두 건이 0.43 으로 빠져나갔습니다.
     주어 두 낱말이 같고 다른 낱말도 겹치면 같은 사건으로 봅니다. */
  const ha = headOf(a), hb = headOf(b);
  return !!ha && ha === hb && hit >= 2;
}
function dedupeStories(list) {
  const kept = [];
  for (const it of list) {
    if (!kept.some((k) => sameStory(k.title, it.title))) kept.push(it);
  }
  return kept;
}

function readJson(file, fallback) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(v) ? v : fallback; }
  catch (e) { return fallback; }
}

async function collect() {
  const bag = new Map();          // link → item (같은 기사가 여러 질의에 걸립니다)
  const problems = [];
  let anyOk = false;

  for (const query of QUERIES) {
    let got = false;
    for (const ep of endpoints(query)) {
      const res = await get(ep.options);
      if (res.status !== 200) {
        problems.push(`${query} · ${ep.name}: ${res.status || '연결 안 됨'} ${res.error || res.body.slice(0, 120)}`);
        continue;
      }
      let data;
      try { data = JSON.parse(res.body); }
      catch (e) { problems.push(`${query} · ${ep.name}: 응답이 JSON 이 아닙니다`); continue; }

      const items = Array.isArray(data.items) ? data.items : [];
      for (const it of items) {
        const link = it.originallink || it.link || '';
        if (!link || bag.has(link)) continue;
        bag.set(link, {
          title: clean(it.title),
          link,
          description: clean(it.description),
          pubDate: it.pubDate || ''
        });
      }
      console.log(`  「${query}」 ${ep.name} — ${items.length}건`);
      got = true; anyOk = true;
      break;                       // 한 포털이 되면 다른 쪽은 두드리지 않습니다
    }
    if (!got) console.log(`  「${query}」 — 실패`);
  }

  return { items: [...bag.values()], problems, anyOk };
}

async function main() {
  console.log('📰 뉴스 모으는 중…');
  const { items, problems, anyOk } = await collect();

  if (!anyOk) {
    console.error('\n✗ 뉴스를 받지 못했습니다. 어느 질의도 되지 않았습니다:');
    problems.slice(0, 6).forEach((p) => console.error('  · ' + p));
    console.error('\n  열쇠가 만료됐을 수 있습니다 (401 이면 재발급).');
    console.error('  기존 파일은 그대로 두었습니다 — 지어낸 기사로 덮지 않습니다.');
    process.exit(1);
  }

  const ranked = items
    .map((it) => ({ it, s: scoreOf(it) }))
    .filter((x) => x.s >= 5)
    .sort((a, b) => (b.s - a.s) || (new Date(b.it.pubDate) - new Date(a.it.pubDate)))
    .map((x) => x.it);

  /* ── 같은 주체가 몰리는 것 막기 ──────────────────────────────────
     제목 낱말만으로는 안 잡히는 겹침이 있습니다. 「포천 교육혁신 해법…」과
     「포천시, 교육부 교육혁신선도지역 공모…」는 겹치는 낱말이 둘뿐이라
     빠져나가는데, 사람이 보면 같은 이야기입니다.
     그래서 **앞 두 글자가 같은 기사는 둘까지만** 남깁니다. */
  function capBySubject(list, cap) {
    const seen = {}, out = [];
    for (const it of list) {
      const key = String(it.title).replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 2);
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] <= cap) out.push(it);
    }
    return out;
  }

  const scored = capBySubject(dedupeStories(ranked), 2);

  console.log(`\n모은 기사 ${items.length}건 → 주제에 맞는 것 ${ranked.length}건 → 같은 사건 묶어 ${scored.length}건`);

  if (scored.length === 0) {
    console.error('✗ 주제에 맞는 기사가 하나도 없습니다. 기존 파일을 그대로 둡니다.');
    process.exit(1);
  }

  /* 히스토리 — 이미 있는 것에 «더합니다». 같은 링크는 한 번만.
     날짜 내림차순으로 정렬해 최근 것이 앞에 오게 하고 HISTORY_MAX 로 자릅니다. */
  const prev = readJson('news-history.json', []);
  const seen = new Set(prev.map((p) => p.link));
  const added = scored.filter((it) => !seen.has(it.link));
  const history = dedupeStories([...added, ...prev])
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, HISTORY_MAX);

  console.log(`히스토리 ${prev.length}건 + 새로 ${added.length}건 → ${history.length}건`);
  console.log(`\n가장 최근 ${WANT}건:`);
  history.slice(0, WANT).forEach((f, i) => console.log(`  ${i + 1}. ${f.title}`));

  if (DRY) { console.log('\n— 확인만 (--dry). 파일을 고치지 않았습니다.'); return; }

  fs.writeFileSync('news-history.json', JSON.stringify(history, null, 2) + '\n', 'utf8');
  console.log('\n🎉 news-history.json 에 적었습니다.');
  console.log('   ※ 화면에 올리려면 `사이트 굽기.command` 를 돌려야 합니다.');
}

main();
