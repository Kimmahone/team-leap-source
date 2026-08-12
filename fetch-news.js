/* 주간 뉴스 클리핑 — 네이버 검색 API 에서 「학령인구 감소」 기사를 받아
   news-latest.json 에 적습니다.

   쓰는 법
     NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node fetch-news.js
     node fetch-news.js --dry     받기만 하고 파일은 고치지 않습니다

   ★ 이 파일에는 열쇠를 적지 않습니다 〔2026. 8. 12.〕
     예전에는 CLIENT_ID·CLIENT_SECRET 이 여기 그대로 박혀 있었고,
     그대로 저장소에 커밋됐습니다. 저장소가 비공개라 덜 나빴을 뿐입니다.
     이제 **환경변수로만** 받습니다. GitHub Actions 에서는 Secrets 로 넣습니다.

   ★ 받은 것을 화면이 바로 쓰지 않습니다
     news-latest.json 은 «재료»입니다. 화면에 올라가려면 `사이트 굽기.command`
     가 대시보드 안에 심어야 합니다. 그렇게 한 까닭은 그 스크립트의 1-b 에
     적어 두었습니다 (CSP connect-src 를 열지 않기 위해서입니다).

   ★ 실패하면 시끄럽게 죽습니다
     예전에는 두 곳 다 실패해도 조용히 끝났습니다. 그래서 열쇠가 죽은 것을
     아무도 몰랐고, 화면에는 손으로 적어 둔 «지어낸 기사» 넉 장이 그대로
     떠 있었습니다. 이제 실패는 종료코드 1 입니다 — Actions 가 빨개집니다. */

'use strict';

const fs = require('fs');
const https = require('https');

const DRY = process.argv.includes('--dry');
const QUERY = '학령인구 감소';
const WANT = 4;

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

if (!ID || !SECRET) {
  console.error('✗ NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 환경변수가 없습니다.');
  console.error('  로컬:   NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node fetch-news.js');
  console.error('  Actions: 저장소 Settings → Secrets and variables → Actions 에 등록');
  process.exit(1);
}

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
   네이버 개발자센터(openapi.naver.com)와 NCP API Hub 입니다.
   어느 쪽 열쇠를 받았는지에 따라 되는 쪽이 다르므로 둘 다 두드립니다. */
const ENDPOINTS = [
  {
    name: '네이버 개발자센터',
    options: {
      hostname: 'openapi.naver.com',
      path: `/v1/search/news.json?query=${encodeURIComponent(QUERY)}&display=${WANT}&sort=date`,
      headers: { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET }
    }
  },
  {
    name: 'NCP API Hub',
    options: {
      hostname: 'naverapihub.apigw.ntruss.com',
      path: `/search/v1/news?query=${encodeURIComponent(QUERY)}&display=${WANT}&sort=date`,
      headers: { 'X-NCP-APIGW-API-KEY-ID': ID, 'X-NCP-APIGW-API-KEY': SECRET }
    }
  }
];

/* 네이버는 제목·요약에 <b> 태그와 HTML 실체를 섞어 보냅니다.
   태그는 걷어 내고 실체는 풀어 둡니다 — 화면 쪽에서 다시 이스케이프합니다. */
function clean(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

async function main() {
  const problems = [];

  for (const ep of ENDPOINTS) {
    process.stdout.write(`📰 ${ep.name} 두드리는 중… `);
    const res = await get(ep.options);

    if (res.status !== 200) {
      const why = res.error || res.body.slice(0, 200);
      console.log(`실패 (${res.status || '연결 안 됨'})`);
      problems.push(`${ep.name}: ${res.status || '연결 안 됨'} ${why}`);
      continue;
    }

    let data;
    try { data = JSON.parse(res.body); }
    catch (e) { console.log('실패 (JSON 아님)'); problems.push(`${ep.name}: 응답이 JSON 이 아닙니다`); continue; }

    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) { console.log('기사 0건'); problems.push(`${ep.name}: 기사가 0건입니다`); continue; }

    console.log(`기사 ${items.length}건`);

    /* 화면이 쓰는 네 칸만 남깁니다. link 는 여기서 한 칸으로 정리합니다 —
       예전에는 originallink 와 link 를 둘 다 적어 두고 화면이 다시 골랐습니다. */
    const formatted = items.slice(0, WANT).map((it) => ({
      title: clean(it.title),
      link: it.originallink || it.link || '',
      description: clean(it.description),
      pubDate: it.pubDate || ''
    }));

    if (DRY) {
      console.log('— 확인만 (--dry). 파일을 고치지 않았습니다.');
      console.log(formatted.map((f, i) => `  ${i + 1}. ${f.title}`).join('\n'));
      return;
    }

    fs.writeFileSync('news-latest.json', JSON.stringify(formatted, null, 2) + '\n', 'utf8');
    console.log(`🎉 뉴스 ${formatted.length}건을 news-latest.json 에 적었습니다.`);
    console.log('   ※ 화면에 올리려면 `사이트 굽기.command` 를 돌려야 합니다.');
    return;
  }

  console.error('\n✗ 뉴스를 받지 못했습니다. 어느 쪽도 되지 않았습니다:');
  problems.forEach((p) => console.error('  · ' + p));
  console.error('\n  열쇠가 만료됐을 수 있습니다. 401 이 뜨면 재발급이 필요합니다.');
  console.error('  news-latest.json 은 그대로 두었습니다 — 지어낸 기사로 덮지 않습니다.');
  process.exit(1);
}

main();
