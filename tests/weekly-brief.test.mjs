/* 주간 브리프 만들기 — 셈과 검증 〔로컬 실험 · 2026. 9. 26.〕
   news-pipeline/brief-lib.mjs 의 약속 셋을 지키는지 봅니다.
     ① 문장마다 근거 기사가 있다  ② 숫자는 지어내지 않는다  ③ 그림의 숫자는 코드가 센다
   실제 자료의 숫자를 박지 않습니다 — 작은 가짜 자료로 «관계»만 봅니다. */
import {
  kstDate, mondayOf, lastCompleteWeek, regionsOf, primaryRegion, topicsOf, outletOf, articleId,
  weekArticles, weekStats, factsDigest, chartFor, validateDraft, pruneDraft, ruleDraft, resolveFactcheck, assembleIssue
} from '../news-pipeline/brief-lib.mjs';

let pass = 0, fail = 0;
const check = (n, c, extra) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n + (extra ? '\n         ' + extra : '')); } };

console.log('\n■ 날짜 — 한국시간 월~일');
check('밤 11시 30분(한국)은 그날이다', kstDate('Sun, 20 Sep 2026 23:30:00 +0900') === '2026-09-20');
check('UTC 로 적힌 기사도 한국 날짜로 센다', kstDate('Sun, 20 Sep 2026 15:30:00 GMT') === '2026-09-21');
check('월요일을 찾는다', mondayOf('2026-09-27') === '2026-09-21' && mondayOf('2026-09-21') === '2026-09-21');
{
  const w = lastCompleteWeek(Date.parse('2026-09-27T20:17:00Z'));   // 한국 월요일 05:17
  check('월요일 새벽에 돌면 «지난주» 월~일을 만든다', w.from === '2026-09-21' && w.to === '2026-09-27', JSON.stringify(w));
}

console.log('\n■ 지역 — 흔한 낱말에 속지 않는다');
check('«부안 교육 대전환»은 대전이 아니다', !regionsOf('부안군-부안교육지원청, 부안 교육 대전환').includes('대전') && regionsOf('부안군 교육').includes('전북'));
check('«예산 확보»는 충남 예산군이 아니다', !regionsOf('교육 예산 확보에 총력').includes('충남'));
check('«충남 예산·충북 괴산»은 둘 다 잡는다', ['충남', '충북'].every((r) => regionsOf('충남 예산·충북 괴산 선정').includes(r)));
check('«고양이»는 경기 고양시가 아니다', !regionsOf('학교 고양이 돌봄').includes('경기'));
check('«영양 불균형»은 경북 영양군이 아니다', !regionsOf('학생 영양 불균형 해소').includes('경북') && regionsOf('영양군 작은학교').includes('경북'));
check('경북 시군 이름이면 경북이다', primaryRegion('포항시, 교육혁신선도지역 도전', '') === '경북');
check('제목에 다른 시·도가 있으면 그 시·도가 주된 지역이다', primaryRegion('경남 내년 10곳 폐교', '경북·경남 비교') === '경남');
check('정부 발표만 있으면 전국이다', primaryRegion('폐교 7곳에 120억', '교육부와 행정안전부는') === '전국');

console.log('\n■ 주제 — 정원(garden)·유학생·대학');
check('«생태치유정원»은 교원 정원이 아니다', !topicsOf('생태치유정원과 로컬마켓').includes('교원·정원'));
check('«교원 정원 감축»은 교원·정원이다', topicsOf('교원 정원 감축 우려').includes('교원·정원'));
check('«유학생 유치»는 작은학교 살리기가 아니다', !topicsOf('외국인 유학생 유치').includes('작은학교 살리기'));
check('«전북유학»은 작은학교 살리기다', topicsOf('전북유학이 지역을 깨운다').includes('작은학교 살리기'));
check('제목이 대학 이야기면 대학 기사다', topicsOf('대학 간 통폐합 진통', '지역 대학 통폐합')[0] === '대학 구조조정');

console.log('\n■ 매체·번호');
check('아는 매체는 이름으로', outletOf('https://www.imaeil.com/page/view/1') === '매일신문');
check('모르는 매체는 주소 그대로 (지어내지 않는다)', outletOf('https://unknown-press.kr/a') === 'unknown-press.kr');
check('같은 링크는 같은 번호', articleId('https://x.kr/1') === articleId('https://x.kr/1') && articleId('https://x.kr/1') !== articleId('https://x.kr/2'));

/* ── 작은 가짜 세상 ─────────────────────────────────────────────── */
const F = {
  source: { students: '시험', classes: '시험', grades: '시험', closed: '시험', births: '시험' },
  province: [2016, 2021, 2025, 2026, 2031, 2036].map((y, i) => ({ year: y, total: 1000 - i * 100, kind: y < 2026 ? '실적' : y === 2026 ? '공시' : '전망', 초: 500 - i * 50, 중: 300 - i * 30, 고: 200 - i * 20 })),
  classes: [{ year: 2016, classes: 100, students: 1000 }, { year: 2025, classes: 98, students: 800 }],
  sigungu: [{ s: '가군', type: '군', students2016: 100, students2026: 80, students2036: 40, schools: 10, small: 6, change10yPast: -20, change10yNext: -50, smallShare: 60 },
            { s: '나시', type: '시', students2016: 900, students2026: 720, students2036: 460, schools: 20, small: 2, change10yPast: -20, change10yNext: -36.1, smallShare: 10 }],
  grades: { 초: [10, 11, 12, 13, 14, 15], 중: [16, 17, 18], 고: [19, 20, 21] },
  schools: { total: 30, bySize: { appropriate: 22, small: 6, minimum: 2, unclassified: 0 } },
  myeonElementary: [{ s: '가군', schools: 3, students: 90, list: [{ name: '가초등학교', stu: 40 }, { name: '나초등학교', stu: 30 }, { name: '읍초등학교', stu: 20 }] }],
  closed: { total: 50, byUse: { 매각: 30, 대부: 8, 자체활용: 5, 미활용: 7 }, byDecade: { '1990년대': 30, '2020년대': 20 }, unusedByDecade: { '2020년대': 7 }, unusedBySig: { 가군: 7 }, bySig: { 가군: 50 } },
  births: { 2020: 99, 2025: 77 }
};
const day = (d, h = 9) => new Date(`${d}T0${h}:00:00+09:00`).toUTCString();
const history = [
  { title: '가군 면 지역 초등학생 70명 — 살리기 지원 3천만 원', link: 'https://imaeil.com/1', description: '가군 면 지역 초등학교 학생 수는 70명으로 집계됐다.', pubDate: day('2026-09-15') },
  { title: '폐교를 교육 거점으로…정부 120억 지원', link: 'https://imaeil.com/2', description: '교육부와 행정안전부는 폐교 활용 7건을 선정했다.', pubDate: day('2026-09-16') },
  { title: '충북 교육혁신선도지역 공모 공동 대응', link: 'https://imaeil.com/3', description: '충북 11개 시·군이 공모를 추진한다.', pubDate: day('2026-09-17') },
  { title: '지난주 기사', link: 'https://imaeil.com/0', description: '통폐합 논의', pubDate: day('2026-09-10') }
];
const arts = weekArticles(history, '2026-09-14', '2026-09-20');
const prev = weekArticles(history, '2026-09-07', '2026-09-13');
const stats = weekStats(arts, prev);
const digest = factsDigest(F);
const ctx = { arts, digest, F, stats, from: '2026-09-14', to: '2026-09-20' };
const [A1, A2, A3] = arts.map((a) => a.id);

console.log('\n■ 한 주 기사');
check('그 주 기사만 담는다', arts.length === 3 && prev.length === 1);
check('지난주 건수를 함께 센다', stats.prevArticles === 1);

console.log('\n■ 그림 — 값은 코드가 센다');
{
  const c = chartFor('students_vs_classes', F);
  check('학생·학급 지수 그림은 첫 해를 100 으로', c.rows[0].value === 80 && c.rows[1].value === 98);
  const m = chartFor('myeon:가군', F, { exclude: ['읍초등학교'] });
  check('면 지역 그림은 뺀 학교를 빼고, 뺐다고 적는다', m.rows.length === 2 && /읍초등학교/.test(m.note));
  check('모르는 그림 이름은 그리지 않는다', chartFor('made_up', F) === null);
}

console.log('\n■ 검증 — 근거 없는 문장·숫자는 싣지 않는다');
const good = {
  title: '폐교 120억과 작은 학교', lead: '이번 주 기사는 3건입니다. 정부는 폐교 활용 7건에 120억 원을 지원합니다.', leadArticles: [A2],
  takeaways: ['경북 폐교 50곳 가운데 미활용 7곳'],
  numbers: [{ metric: 'closed_by_use', headline: '폐교 50곳 중 30곳은 팔렸다', sub: '남은 20곳', body: '미활용은 7곳입니다.', articles: [A2] }],
  issues: [{ kicker: '폐교 활용', title: '폐교 거점', what: '정부가 120억 원을 지원합니다.', why: '매각이 30곳입니다.', ask: ['미활용 7곳은?'], facts: ['closed_total'], articles: [A2] }],
  regions: [{ region: '충북', what: '11개 시·군 공동 대응', detail: '', compare: '가군은 60.0%가 참고선 아래입니다.', facts: ['sgg_under_share_가군'], articles: [A3] }],
  factchecks: [{ claim: '가군 면 지역 초등학생 70명', article: A1, articleValue: 70, fact: 'myeon_elem_가군', exclude: ['읍초등학교'], note: '읍초(20명)를 빼면 70명입니다.' }],
  watch: [{ text: '다음 공모', articles: [A3] }]
};
{
  const v = validateDraft(good, ctx);
  check('근거가 다 있는 초안은 통과한다', v.ok, v.errors.join(' / '));
  const bad1 = JSON.parse(JSON.stringify(good)); bad1.lead += ' 학생은 12,345명입니다.';
  check('지어낸 숫자는 걸린다', !validateDraft(bad1, ctx).ok && validateDraft(bad1, ctx).errors.some((e) => /12345/.test(e)));
  const bad2 = JSON.parse(JSON.stringify(good)); bad2.issues[0].articles = ['a_none'];
  check('그 주에 없는 기사 번호는 걸린다', !validateDraft(bad2, ctx).ok);
  const bad3 = JSON.parse(JSON.stringify(good)); bad3.issues[0].articles = [];
  check('근거 기사가 없는 항목은 걸린다', !validateDraft(bad3, ctx).ok);
  const bad4 = JSON.parse(JSON.stringify(good)); bad4.numbers[0].metric = 'made_up';
  check('모르는 그림 이름은 걸린다', !validateDraft(bad4, ctx).ok);
  const bad5 = JSON.parse(JSON.stringify(good)); bad5.regions[0].region = '가나다';
  check('시·도 이름이 아니면 걸린다', !validateDraft(bad5, ctx).ok);
  const bad6 = JSON.parse(JSON.stringify(good)); bad6.factchecks[0].articleValue = 71;
  check('기사에 없는 값을 «기사 값»이라 하면 걸린다', !validateDraft(bad6, ctx).ok);
  const bad7 = JSON.parse(JSON.stringify(good)); bad7.issues[0].facts = ['no_such_fact'];
  check('모르는 자료 이름은 걸린다', !validateDraft(bad7, ctx).ok);
  const ok8 = JSON.parse(JSON.stringify(good)); ok8.lead += ' 2029년까지 3곳을 더 봅니다.';
  check('연도와 한 자리 수는 셈에서 뺀다', validateDraft(ok8, ctx).ok);
}
{
  const mixed = JSON.parse(JSON.stringify(good));
  mixed.issues.push({ kicker: 'x', title: '지어낸 이슈', what: '학생 99,999명', why: '', ask: [], facts: [], articles: [A2] });
  const p = pruneDraft(mixed, ctx);
  check('AI 초안은 틀린 항목만 떼어 낸다', p.draft.issues.length === 1 && p.dropped.length === 1 && validateDraft(p.draft, ctx).ok);
}

console.log('\n■ 수치 맞춰 보기 — 판정은 코드가');
{
  const r = resolveFactcheck(good.factchecks[0], ctx);
  check('뺀 학교를 빼고 센다', r.ours === 70 && r.excluded.length === 1);
  check('차이 2% 안이면 «맞음»', r.verdict === '맞음' && r.gapPct === 0);
  const r2 = resolveFactcheck({ ...good.factchecks[0], exclude: [] }, ctx);
  check('차이가 크면 «차이 큼»', r2.verdict === '차이 큼');
}

console.log('\n■ 규칙 초안 — AI 열쇠가 없을 때');
{
  const d = ruleDraft(ctx);
  const v = validateDraft(d, ctx);
  check('규칙 초안도 같은 검증을 통과한다', v.ok, v.errors.join(' / '));
  check('규칙 초안은 다른 시·도 정책 기사를 따로 모은다', d.regions.some((r) => r.region === '충북'));
  const issue = assembleIssue({ draft: d, ...ctx, generator: { kind: 'rule', label: '규칙 초안' }, no: 1, status: '자동 생성 · 검토 전' });
  check('묶은 호에는 기사 본문(요약)을 싣지 않는다', issue.articles.every((a) => a.description === undefined));
  check('묶은 호는 인용한 기사를 표시한다', issue.articles.some((a) => a.cited));
  check('묶은 호의 숫자 카드에는 코드가 센 그림이 붙는다', issue.numbers.every((n) => n.chart && n.chart.rows.length));
}


console.log('\n■ 배포 길 — 새 판은 기존 사이트를 덮지 않는다');
{
  const fs = await import('node:fs');
  const read = (f) => { try { return fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'); } catch { return ''; } };
  const v2 = read('.github/workflows/v2-deploy.yml'), dep = read('.github/deploy.sh');
  check('새 판 워크플로가 있다', v2.length > 0);
  check('새 판 워크플로는 v2 가지에서만 돈다', /if: github\.ref == 'refs\/heads\/v2'/.test(v2) && /branches: \[v2\]/.test(v2));
  check('새 판 워크플로는 기존 배포(deploy.sh)를 부르지 않는다', !/deploy\.sh/.test(v2.replace(/#[^\n]*/g, '')));
  check('새 판은 team-leap-v2 로만 올린다', /--project-name=team-leap-v2/.test(v2) && !/--project-name=team-leap(?!-v2)/.test(v2));
  check('기존 배포 스크립트는 main 이 아니면 멈춘다', /"\$\{GITHUB_REF\}" != "refs\/heads\/main"/.test(dep));
  check('기존 사이트로 새 판을 올리던 옛 주간 워크플로가 없다', read('.github/workflows/weekly-brief.yml') === '');
  check('브리프 시험(brief-test)은 커밋·굽기·배포를 하지 않는다',
    /- name: 바뀐 자료 커밋 \(v2\)\n\s+if: env\.JOB == 'daily' \|\| env\.JOB == 'weekly'\n/.test(v2) &&
    /- name: 사이트 굽기[^\n]*\n\s+if: env\.JOB != 'brief-test'/.test(v2) &&
    /- name: team-leap-v2 로 배포\n\s+if: [^\n]*env\.JOB != 'brief-test'/.test(v2) &&
    /build-weekly-brief\.mjs --dry --force --out/.test(v2));
}

console.log(`\n${fail ? '✗' : '✓'}  통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail ? 1 : 0);
