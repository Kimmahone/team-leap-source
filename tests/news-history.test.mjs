/* 주간 뉴스 클리핑 — 보관 규칙 검사.

   〔2026. 8. 31.〕 화면은 「주간(7일) · 월간(30일) · 전체 보기」를 내놓는데
   히스토리에 여드레치밖에 없었습니다. 건수(60건)로 잘랐기 때문입니다.
   기사가 하루 5~6건 들어오니 60건이면 열흘치이고, 「월간」을 눌러도 반쪽만
   보였습니다. **화면이 내놓은 기간을 자료가 못 받쳐 준 것**입니다.

   그래서 여기서 지키는 것은 「몇 건이냐」가 아니라
   **「화면이 내놓은 가장 긴 기간을 자료가 덮느냐」**입니다. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const news = require(path.join(ROOT, 'fetch-news.js'));

let pass = 0, fail = 0;
const check = (n, ok, why) => {
  if (ok) pass++;
  else { fail++; console.error('✗ ' + n + (why ? '\n         ' + why : '')); }
};

/* ── 자르는 규칙 ─────────────────────────────────────────────────── */
const NOW = Date.UTC(2026, 7, 31);
const at = (daysAgo) => ({ title: 't', link: 'L' + daysAgo, description: '',
  pubDate: new Date(NOW - daysAgo * 864e5).toUTCString() });

check('보관 기간 안의 기사는 남긴다', news.trimHistory([at(0), at(30), at(119)], NOW).length === 3);
check('보관 기간을 넘긴 기사는 내린다', news.trimHistory([at(121), at(400)], NOW).length === 0);
check('경계 하루 차이를 가른다',
  news.trimHistory([at(news.HISTORY_DAYS - 1)], NOW).length === 1 &&
  news.trimHistory([at(news.HISTORY_DAYS + 1)], NOW).length === 0);
/* 날짜를 못 읽는 것과 오래된 것은 다릅니다. 못 읽는다고 버리면 조용히 사라집니다. */
check('날짜를 못 읽는 기사는 버리지 않는다',
  news.trimHistory([{ title: 'x', link: 'z', pubDate: '알 수 없음' }], NOW).length === 1);
check('건수 상한이 안전장치로 걸린다', (() => {
  const many = [];
  for (let i = 0; i < news.HISTORY_MAX + 50; i++) many.push(at(0));
  return news.trimHistory(many, NOW).length === news.HISTORY_MAX;
})());
check('빈 목록도 견딘다', news.trimHistory([], NOW).length === 0);

/* ── 화면이 내놓은 기간을 자료가 덮는가 ──────────────────────────
   이 두 검사가 원래 있었다면 여드레짜리 히스토리를 바로 잡았을 것입니다. */
const dash = fs.readFileSync(path.join(ROOT, '06. 실행계획(1)/prototype/index.html'), 'utf8');
const offered = [...dash.matchAll(/data-news-days="(\d+)"/g)].map((m) => Number(m[1]));
check('화면이 기간 단추를 내놓는다', offered.length >= 2, '찾은 값: ' + offered.join(','));
const longest = Math.max(...offered.filter((d) => d > 0));
check('보관 기간이 화면의 가장 긴 기간보다 넉넉하다',
  news.HISTORY_DAYS >= longest * 2,
  '보관 ' + news.HISTORY_DAYS + '일 · 화면 ' + longest + '일');

const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'news-history.json'), 'utf8'));
check('히스토리가 배열이다', Array.isArray(hist));
check('기사마다 제목·링크·날짜가 있다',
  hist.every((n) => n && n.title && n.link && n.pubDate));
check('같은 링크가 두 번 들어 있지 않다',
  new Set(hist.map((n) => n.link)).size === hist.length);
check('날짜 내림차순이다 (화면이 이 순서를 믿는다)',
  hist.every((n, i) => i === 0 || new Date(hist[i - 1].pubDate) >= new Date(n.pubDate)));

/* 「몇 일치가 모였나」로는 못 가려냅니다 — 이제 막 모으기 시작한 것과
   오래된 것을 조용히 버리고 있는 것이 똑같이 짧아 보이기 때문입니다.

   가려내는 자리는 여기입니다: **버리는 쪽에 눌려 있는가.**
   예전 코드는 60건에서 딱 잘렸고, 히스토리는 «언제나 정확히 60건»이었습니다.
   상한에 닿아 있다는 것은 자료가 젊은 게 아니라 잘려 나가고 있다는 뜻입니다. */
const span = hist.length
  ? (new Date(hist[0].pubDate) - new Date(hist[hist.length - 1].pubDate)) / 864e5
  : 0;
console.log(`   (모아 둔 기간 ${span.toFixed(0)}일 · ${hist.length}건 · 보관 ${news.HISTORY_DAYS}일)`);
check('건수 상한에 눌려 있지 않다 (눌려 있으면 오래된 것이 밀려나고 있다)',
  hist.length < news.HISTORY_MAX, '지금 ' + hist.length + ' / 상한 ' + news.HISTORY_MAX);
check('보관 기간이 지난 기사가 남아 있지 않다',
  news.trimHistory(hist).length === hist.length);
check('적어도 주간 클리핑은 채운다 (이 화면의 이름이 주간이다)',
  span >= 7, '모은 기간 ' + span.toFixed(0) + '일');
check('건수도 화면 한 쪽을 채울 만큼 있다', hist.length >= 30, '지금 ' + hist.length + '건');

/* ── push 마다 받아오지 않는가 ───────────────────────────────────
   창이 17일치에서 8일치로 줄어든 진짜 까닭입니다. 하루 서른 번 밀어 넣으면
   서른 번 받아오고, 그때마다 오래된 기사가 뒤로 밀려 사라집니다. */
const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/update-news.yml'), 'utf8');
const fetchStep = wf.slice(wf.indexOf('- name: 뉴스 받아오기'), wf.indexOf('- name: 변경된 뉴스 커밋'));
check('뉴스 받아오기 단계에 조건이 있다', /if:\s*github\.event_name/.test(fetchStep));
check('push 때는 받아오지 않는다', /!=\s*'push'/.test(fetchStep));
check('주간 일정은 그대로 있다', /schedule:/.test(wf) && /cron:/.test(wf));
check('손으로도 돌릴 수 있다', /workflow_dispatch:/.test(wf));
/* 막으려는 것은 «수집»이지 «배포»가 아닙니다. push 때 배포까지 멈추면
   고친 것이 라이브에 안 나갑니다. 단계 이름으로 자리를 잡습니다 —
   머리말 주석에도 「배포 저장소」라는 말이 있어서 그것으로 자르면 헛집습니다. */
const deployStep = wf.slice(wf.indexOf('- name: 배포 저장소'));
check('배포 단계가 있다', deployStep.length > 0);
check('배포는 push 때도 돈다 (수집만 막는다)',
  !/if:\s*github\.event_name/.test(deployStep));
check('굽기와 검사도 push 때 돈다',
  !/if:/.test(wf.slice(wf.indexOf('- name: 사이트'), wf.indexOf('- name: 배포 저장소')) || ''));

console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
