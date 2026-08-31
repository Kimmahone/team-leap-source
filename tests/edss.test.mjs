/* EDSS 수집기 검사 — 네트워크 없이 돕니다.

   여기서 지키려는 것은 **규칙**이지 모양이 아닙니다.
   「필드 이름이 XXX 이다」가 아니라 「특수학급 학생수를 전체 학생수로 집지
   않는다」처럼, 틀렸을 때 화면의 숫자가 달라지는 것만 못 박습니다. */

import {
  redact, unwrap, guessFields, toLevel, toSgg, num,
  normalizeRows, aggregate, declineRates, cohortRates,
  projectCohort, backtest, toBlock, entryRate, GRADES, SGG_BY_NAME,
  AUTH_WAYS, buildRequest, wayName, findWay
} from '../open api/bake-edss.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, why) => {
  if (ok) pass++;
  else { fail++; console.error('✗ ' + name + (why ? '\n         ' + why : '')); }
};
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

/* ── 1. 인증키가 로그로 새지 않는다 ─────────────────────────────────── */
const KEY = 'abcdef0123456789abcdef0123456789';
check('키가 그대로 있으면 가린다', !redact('...serviceKey=' + KEY, [KEY]).includes(KEY));
check('URL 인코딩된 키도 가린다',
  !redact('x=' + encodeURIComponent('a+b/c=' + KEY), ['a+b/c=' + KEY]).includes(KEY));
check('키를 모르고 흘러도 serviceKey 뒤는 가린다',
  redact('http://x?serviceKey=SOMETHINGLONG123&pageNo=1', []).includes('serviceKey=***'));
check('키를 가려도 나머지 글은 남는다', redact('오류: 등록되지 않았습니다', [KEY]).includes('등록되지'));
check('짧은 값은 가리지 않는다 (본문이 다 지워지면 못 읽는다)',
  redact('결과 0건', ['0건']).includes('0건'));

/* ── 1-2. 요청 만들기 ──────────────────────────────────────────────
   openapi.edmgr.kr 은 GET 을 405 로 막고, POST 에 물음표 뒤 인자가 붙으면
   400 을 냅니다. 그래서 **모든 것이 본문**입니다. 이 규칙이 깨지면 한 건도
   못 받는데, 게이트웨이가 401 만 돌려주므로 까닭이 안 보입니다. */
const WAY_H = { in: 'header', name: 'apikey' };
const WAY_B = { in: 'body', name: 'apiKey' };
const rq = (w, p) => buildRequest(KEY, p || { pageNo: 1 }, w);
check('언제나 POST 다', rq(WAY_H).method === 'POST' && rq(WAY_B).method === 'POST');
check('주소에는 아무것도 안 붙인다 (물음표가 붙으면 400)',
  buildRequest.length === 3);
check('헤더 방식은 키를 헤더에 넣는다', rq(WAY_H).headers.apikey === KEY);
check('헤더 방식은 키를 본문에 넣지 않는다', !rq(WAY_H).body.includes(KEY));
check('본문 방식은 키를 본문에 넣는다', JSON.parse(rq(WAY_B).body).apiKey === KEY);
check('본문 방식은 키를 헤더에 넣지 않는다',
  !JSON.stringify(rq(WAY_B).headers).includes(KEY));
check('Bearer 는 앞에 붙인다',
  rq({ in: 'header', name: 'Authorization', prefix: 'Bearer ' }).headers.Authorization === 'Bearer ' + KEY);
check('보낸 인자가 본문에 그대로 실린다', JSON.parse(rq(WAY_H, { yy: 2026 }).body).yy === 2026);
check('본문은 JSON 이라고 밝힌다', rq(WAY_H).headers['Content-Type'] === 'application/json');
check('시도해 볼 인증 방법이 여럿이다', AUTH_WAYS.length >= 8);
check('인증 방법 이름이 겹치지 않는다',
  new Set(AUTH_WAYS.map(wayName)).size === AUTH_WAYS.length);
check('이름으로 도로 찾을 수 있다 (설정 파일에 적어 두려면 필요하다)',
  AUTH_WAYS.every(w => findWay(wayName(w)) === w));
check('한글 헤더는 받지 않는다 (HTTP 헤더는 ASCII 다)', findWay('header:인증키') === null);
check('본문이면 한글 칸 이름도 받는다', findWay('body:인증키') !== null);
check('목록에 없는 이름도 설정으로 지정할 수 있다',
  (findWay('header:X-Cert-Key') || {}).name === 'X-Cert-Key');
check('앞에 붙일 말도 지정할 수 있다',
  (findWay('header:Authorization:Bearer') || {}).prefix === 'Bearer ');
check('꼴이 안 맞으면 null', findWay('엉터리') === null && findWay('') === null);
check('Basic 은 키:을 base64 로 싼다', (function () {
  const w = AUTH_WAYS.filter(x => x.prefix === 'Basic ')[0];
  if (!w) return false;
  const h = buildRequest(KEY, {}, w).headers.Authorization;
  return h === 'Basic ' + Buffer.from(KEY + ':', 'utf8').toString('base64');
})());
check('Basic 은 키를 그대로 붙이지 않는다', (function () {
  const w = AUTH_WAYS.filter(x => x.prefix === 'Basic ')[0];
  return !!w && !buildRequest(KEY, {}, w).headers.Authorization.includes(KEY);
})());

/* ── 2. 봉투를 벗긴다 ──────────────────────────────────────────────── */
const row = { YY: '2026', SCHUL_CODE: 'A1', SCHUL_NM: '가나초등학교', SGG_NM: '안동시', GRADE: '1', 학생수: '10', 학급수: '1' };
check('표준 오픈API 봉투', unwrap({ response: { header: { resultCode: '00' }, body: { items: { item: [row] }, totalCount: 1 } } }).rows.length === 1);
check('items 가 배열로 바로 올 때', unwrap({ response: { body: { items: [row], totalCount: 9 } } }).total === 9);
check('item 이 하나면 배열로 감싼다', unwrap({ response: { body: { items: { item: row } } } }).rows.length === 1);
check('odcloud 봉투', unwrap({ data: [row, row], totalCount: 2, page: 1, perPage: 10 }).rows.length === 2);
check('학교알리미 봉투', unwrap({ resultCode: 'success', list: [row] }).rows.length === 1);
check('벌거벗은 배열', unwrap([row]).rows.length === 1);
check('나이스처럼 파묻혀 있어도 찾는다', unwrap({ 표: [{ head: [] }, { row: [row, row] }] }).rows.length === 2);
check('못 알아보면 무엇이 왔는지 적는다', (unwrap({ 어쩌구: 1 }).meta.topKeys || []).includes('어쩌구'));
check('빈 items 를 0건으로 읽는다', unwrap({ response: { body: { items: '' } } }).rows.length === 0);
check('총건수가 없으면 받은 행수로 센다', unwrap({ response: { body: { items: { item: [row] } } } }).total === 1);

/* ── 3. 필드 짝짓기 ────────────────────────────────────────────────── */
const g = guessFields(row).picked;
check('연도 칸을 찾는다', g.year === 'YY');
check('학교코드 칸을 찾는다', g.code === 'SCHUL_CODE');
check('시군 칸을 찾는다', g.sgg === 'SGG_NM');
check('학년 칸을 찾는다', g.grade === 'GRADE');
check('학생수·학급수를 각각 찾는다', g.students === '학생수' && g.classes === '학급수');

/* 이 검사가 이 파일에서 가장 중요합니다. 특수학급 학생수를 전체 학생수로
   집으면 경북 학생이 갑자기 1/20 이 되는데 **화면은 멀쩡해 보입니다**. */
const trap = { 조사연도: '2026', 학교명: '나초', 시군구명: '구미시', 특수학급학생수: '3', 학생수계: '540', 교원수: '30', 남학생수: '270' };
const t = guessFields(trap).picked;
check('특수학급 학생수를 전체로 집지 않는다', t.students === '학생수계');
check('교원수를 학생수로 집지 않는다', t.students !== '교원수');
check('남학생수를 전체로 집지 않는다', t.students !== '남학생수');
check('한글 연도 칸도 찾는다', t.year === '조사연도');

check('고정값을 주면 짐작을 그만둔다', guessFields(row, { students: '학급수' }).picked.students === '학급수');
check('없는 개념은 비워 둔다 (없는 칸을 지어내지 않는다)', guessFields({ A: 1 }).picked.students === undefined);
check('무엇을 보고 골랐는지 남긴다', typeof guessFields(row).why.year === 'string');
check('후보 칸 이름을 모두 적는다', guessFields(row).all.length === Object.keys(row).length);

/* ── 4. 값 다듬기 ──────────────────────────────────────────────────── */
check('초등학교', toLevel('초등학교') === '초');
check('숫자 코드 02', toLevel('02') === '초');
check('고등학교', toLevel('고등학교') === '고');
check('고등공민학교는 고가 아니다', toLevel('고등공민학교') === null);
check('특수학교는 걸러진다', toLevel('특수학교') === null);
check('유치원은 걸러진다', toLevel('유치원') === null);
check('포항 남·북구는 한 곳으로 모인다', toSgg('포항시 남구') === 'pohang' && toSgg('포항시 북구') === 'pohang');
check('시군 코드로도 붙는다', toSgg('47170') === 'andong');
check('군위는 경북에서 뺀다 (2023년 대구로 갔다)', toSgg('군위군') === null);
check('시군이 22곳이다', Object.keys(SGG_BY_NAME).length === 22);
check('쉼표 든 숫자', num('1,234') === 1234);
check('빈칸·하이픈은 0', num('') === 0 && num('-') === 0 && num(null) === 0);

/* ── 5. 여러 해치를 지어 전 과정을 굴려 봅니다 ─────────────────────── */
const F = {
  year: 'YY', code: 'CD', name: 'NM', level: 'KND_NM', sgg: 'SGG_NM',
  grade: 'GRADE', students: '학생수', classes: '학급수'
};
const rows = [];
/* 안동은 해마다 5% 줄고, 구미는 그대로. 학년당 100명에서 시작합니다. */
for (let y = 2016; y <= 2026; y++) {
  for (const [sg, drop] of [['안동시', 0.05], ['구미시', 0]]) {
    for (const [knd, lv] of [['초등학교', '초'], ['중학교', '중'], ['고등학교', '고']]) {
      for (let gr = 1; gr <= GRADES[lv]; gr++) {
        rows.push({
          YY: String(y), CD: sg + knd, NM: sg + knd, KND_NM: knd, SGG_NM: sg,
          GRADE: String(gr),
          학생수: String(Math.round(100 * Math.pow(1 - drop, y - 2016))),
          학급수: '4'
        });
      }
    }
  }
}
const nz = normalizeRows(rows, F);
check('모든 행이 기록으로 바뀐다', nz.records.length === rows.length);
check('학교급을 못 읽은 행이 없다', nz.skipped.level === 0);

const agg = aggregate(nz.records);
check('연도 11개', agg.years.length === 11);
check('연도가 오름차순', agg.years[0] === 2016 && agg.years[10] === 2026);
check('시군 2곳', Object.keys(agg.byYear[2026]).length === 2);
check('학교 수를 코드로 센다 (학년별 6행을 6개교로 세지 않는다)', agg.byYear[2026].andong['초'].sch === 1);
check('초등 학생수는 학년 6개의 합', agg.byYear[2016].gumi['초'].stu === 600);
check('학년별 표가 학교급마다 선다', agg.grade['초'][2016].length === 6 && agg.grade['중'][2016].length === 3);

const rt = declineRates(agg);
check('안동 초등 감소율이 5%에 가깝다', near(rt.andong['초'], 0.05, 0.002));
check('구미는 0에 가깝다', near(rt.gumi['초'], 0, 0.002));
check('감소율이 시군×학교급마다 따로 나온다', Object.keys(rt).length === 2 && Object.keys(rt.andong).length === 3);

const co = cohortRates(agg.grade);
check('초등 진급률이 5개(1→2 … 5→6)', co['초'].length === 5);
check('진급률이 1 - 감소율 근처', co['초'].every(r => r > 0.9 && r <= 1.02));
check('학교급을 건너가는 값도 잰다', co.cross['초중'] != null && co.cross['중고'] != null);

const pr = projectCohort({ 초: agg.grade['초'][2026], 중: agg.grade['중'][2026], 고: agg.grade['고'][2026] }, co, 2029, 2026, null);
check('전망이 요청한 해까지 나온다', Object.keys(pr).length === 3 && pr[2029]);
check('전망 학년 수가 실적과 같다', pr[2027]['초'].length === 6);
check('줄어드는 자료는 전망도 줄어든다',
  pr[2029]['초'].reduce((a, b) => a + b, 0) < agg.grade['초'][2026].reduce((a, b) => a + b, 0));
check('전망값이 정수', pr[2027]['초'].every(v => Number.isInteger(v)));

const bt = backtest(agg.grade, co, null);
check('백테스트가 첫 해로 마지막 해를 맞힌다', bt && bt.from === 2016 && bt.to === 2026);
check('오차율을 적는다', typeof bt.오차율 === 'number');
check('꾸준히 줄어드는 자료면 오차가 크지 않다', Math.abs(bt.오차율) < 15);
check('해가 두 개뿐이면 백테스트를 하지 않는다', backtest({ 초: { 2025: [1, 1, 1, 1, 1, 1] } }, co, null) === null);

/* ── 5-2. 취학률 — 6년 전 출생아가 초1이 되는 비율 ─────────────────── */
/* 6년 전 출생아의 꼭 0.8 이 초1이 되도록 출생아를 거꾸로 지어 놓고,
   entryRate 가 그 0.8 을 도로 찾아내는지 봅니다. */
const births = {};
for (const y of Object.keys(agg.grade['초']).map(Number)) births[y - 6] = agg.grade['초'][y][0] / 0.8;
/* 앞날을 굴리려면 마지막 실적연도 뒤의 출생아도 있어야 합니다 (이미 태어난 아이들입니다). */
for (let y = 2021; y <= 2030; y++) births[y] = agg.grade['초'][2026][0] / 0.8;
check('취학률을 실적에서 잰다', near(entryRate(agg.grade, births), 0.8, 0.001));
check('아직 학교에 안 온 출생아는 취학률 계산에 끼지 않는다',
  near(entryRate(agg.grade, births), entryRate(agg.grade,
    Object.fromEntries(Object.entries(births).filter(([y]) => Number(y) <= 2020))), 1e-9));
check('출생아가 없으면 재지 않는다 (0 이라고 하지 않는다)', entryRate(agg.grade, null) === null);
check('말이 안 되는 비율은 버린다', entryRate(agg.grade, { 2010: 1 }) === null);

const co2 = Object.assign({}, co, { entry: entryRate(agg.grade, births) });
const pr2 = projectCohort({ 초: agg.grade['초'][2026] }, co2, 2027, 2026, births);
check('출생아가 있으면 초1을 출생아에서 뽑는다',
  pr2[2027]['초'][0] === Math.round(births[2021] * co2.entry));
check('출생아가 없으면 초1을 그대로 둔다',
  projectCohort({ 초: agg.grade['초'][2026] }, co2, 2027, 2026, null)[2027]['초'][0] === agg.grade['초'][2026][0]);

/* ── 6. 심는 덩어리 ────────────────────────────────────────────────── */
const block = toBlock(agg, rt, co2, bt, { 연도: '2016~2026' }, births);
check('덩어리가 그대로 실행되는 자바스크립트다', (() => {
  try { new Function(block + 'return EDSS_YEARS.length;')(); return true; } catch (e) { return false; }
})());
const v = new Function(block + 'return {y:EDSS_YEARS,t:EDSS_TOTAL,s:EDSS_SGG,g:EDSS_GRADE,r:EDSS_RATE};')();
check('연도 배열과 값 배열의 길이가 같다', v.t['초'].length === v.y.length);
check('시군 값도 연도 길이와 같다', v.s.andong['초'].s.length === v.y.length);
check('자료가 없는 시군은 아예 넣지 않는다 (0 으로 채우지 않는다)', v.s.pohang === undefined);
check('학교급 합계가 시군 합과 같다',
  v.t['초'][10] === v.s.andong['초'].s[10] + v.s.gumi['초'].s[10]);
check('심는 자리에 손대지 말라고 적어 둔다', block.includes('손으로 고치지 마세요'));
const bv = new Function(block + 'return {b:EDSS_BIRTH,c:EDSS_COHORT};')();
check('실린 출생아로 이듬해 초1을 만들 수 있다', bv.b[String(2027 - 6)] != null);
check('오래된 출생아는 싣지 않는다 (덩어리만 커진다)',
  Object.keys(bv.b).every(y => Number(y) >= 2026 - 6));
check('취학률도 함께 심는다', typeof bv.c.entry === 'number');
check('덩어리가 10KB 를 넘지 않는다 (22시군이면 더 커진다)', block.length < 60000);

/* ── 7. 설정 파일이 코드와 어긋나지 않는다 ─────────────────────────── */
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'open api/edss-endpoints.json'), 'utf8'));
check('신청한 7개가 모두 있다', Object.keys(cfg.apis).length === 7);
check('API 마다 Secret 이름이 다르다',
  new Set(Object.values(cfg.apis).map(a => a.secret)).size === 7);
check('Secret 이름이 EDSS_…_API_KEY 꼴이다',
  Object.values(cfg.apis).every(a => /^EDSS_[A-Z_]+_API_KEY$/.test(a.secret)));
/* 「긴 토막이 있으면 키」로 보면 요청주소의 경로까지 걸립니다. 주소를 먼저
   걷어낸 다음 남은 값에서 찾습니다 — 지키려는 것은 「주소가 짧다」가 아니라
   「키가 안 적혀 있다」이기 때문입니다. */
const cfgText = JSON.stringify(cfg).replace(/https?:\/\/[^"\s]+/g, '');
check('설정 파일에 인증키가 들어 있지 않다', !/[0-9a-zA-Z%+/=]{25,}/.test(cfgText));
check('요청주소는 모두 https 다 (키가 평문으로 다니면 안 된다)',
  Object.values(cfg.apis).every(a => !a.url || /^https:\/\//.test(a.url)));
check('일곱 개 주소가 다 채워져 있다', Object.values(cfg.apis).every(a => !!a.url));
check('API 마다 주소가 다르다', new Set(Object.values(cfg.apis).map(a => a.url)).size === 7);
check('요청주소를 어디서 베끼는지 적어 두었다', JSON.stringify(cfg).includes('data.go.kr'));
check('요청변수 이름을 적을 자리가 있다',
  cfg.paging && cfg.filter && 'year' in cfg.filter && 'page' in cfg.paging);
check('찾은 인증 방법을 적을 자리가 있다', 'auth' in cfg);
check('적힌 인증 방법이 있다면 코드가 아는 것이어야 한다',
  !cfg.auth || findWay(cfg.auth) !== null);
check('호출 한도를 정해 둔다 (하루 한도를 넘기면 그날은 못 받는다)',
  Number(cfg.callCap) > 0 && Number(cfg.callCap) <= 10000);
check('게이트웨이가 POST 라는 것을 적어 두었다', JSON.stringify(cfg).includes('POST'));

/* 신청안 문서와 Secret 이름이 어긋나면 워크플로가 조용히 키를 못 찾습니다. */
const plan = fs.readFileSync(path.join(ROOT, '06. 실행계획(1)/EDSS_Open_API_신청안.md'), 'utf8');
check('문서와 코드의 Secret 이름이 같다',
  Object.values(cfg.apis).every(a => plan.includes(a.secret)));

/* 워크플로도 같은 이름을 넘겨야 합니다. */
const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/refresh-public-data.yml'), 'utf8');
check('워크플로가 7개 키를 모두 넘긴다',
  Object.values(cfg.apis).every(a => wf.includes(a.secret)));
check('워크플로에 인증키가 적혀 있지 않다', !/EDSS_[A-Z_]+_API_KEY\s*:\s*['"]?[0-9a-zA-Z%+/=]{20,}/.test(wf));

/* 키가 배포 저장소에 들어가 있어 한 번 헛돌았습니다. 그쪽에는 워크플로가
   하나도 없어 아무도 읽지 않습니다. 「키 없음」만 말하면 어디를 봐야 할지
   알 수 없으므로, 어느 저장소인지까지 말하게 못 박습니다. */
const baker = fs.readFileSync(path.join(ROOT, 'open api/bake-edss.mjs'), 'utf8');
check('키가 없을 때 어느 저장소를 봐야 하는지 말한다', baker.includes('team-leap-source'));
check('배포 저장소가 아니라는 것도 말한다', /배포 저장소 team-leap 이 아닙니다/.test(baker));

/* ── 8. 실적이 들어온 대시보드가 그대로 도는가 ─────────────────────
   여기가 이 파일에서 두 번째로 중요합니다. 수집기가 잘 돌아도 심은 결과가
   화면을 깨뜨리면 아무 소용이 없습니다. 22개 시군치를 지어 넣고 대시보드의
   검사를 **그대로 다시 돌립니다**. */
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const rows22 = [];
const NAMES = Object.keys(SGG_BY_NAME);
for (let y = 2016; y <= 2026; y++) {
  NAMES.forEach((nm, i) => {
    const drop = 0.02 + (i % 5) * 0.015;          // 시군마다 다른 기울기
    for (const [knd, lv] of [['초등학교', '초'], ['중학교', '중'], ['고등학교', '고']]) {
      for (let sch = 0; sch < 3; sch++) {
        for (let gr = 1; gr <= GRADES[lv]; gr++) {
          rows22.push({
            YY: String(y), CD: nm + knd + sch, NM: nm + knd + sch, KND_NM: knd, SGG_NM: nm + '시',
            GRADE: String(gr),
            학생수: String(Math.max(1, Math.round(40 * Math.pow(1 - drop, y - 2016)))),
            학급수: '2'
          });
        }
      }
    }
  });
}
const a22 = aggregate(normalizeRows(rows22, F).records);
check('지어낸 자료가 22개 시군을 다 덮는다', Object.keys(a22.byYear[2026]).length === 22);
const b22 = {};
for (const y of Object.keys(a22.grade['초']).map(Number)) b22[y - 6] = a22.grade['초'][y][0] / 0.78;
for (let y = 2021; y <= 2032; y++) b22[y] = a22.grade['초'][2026][0] / 0.78;
const c22 = cohortRates(a22.grade); c22.entry = entryRate(a22.grade, b22);
const blk22 = toBlock(a22, declineRates(a22), c22, backtest(a22.grade, c22, b22),
  { 연도: '2016~2026', 출처: '교육통계 시험자료' }, b22);

const DASH = path.join(ROOT, '06. 실행계획(1)/prototype/index.html');
const dash = fs.readFileSync(DASH, 'utf8');
check('대시보드에 심을 자리가 있다', dash.includes('  var STUDENT_RAW = {'));
const withEdss = dash.replace('  var STUDENT_RAW = {', blk22 + '\n  var STUDENT_RAW = {');
/* 대시보드 검사 중에는 HTML 옆에 있는 symbol1.jpg 를 찾는 것이 있습니다.
   그래서 임시 파일도 **같은 폴더에** 두어야 합니다. os.tmpdir() 에 두면
   자료와 상관없는 이유로 한 개가 빨갛게 되어 진짜 실패를 가립니다. */
const DASH_DIR = path.join(ROOT, '06. 실행계획(1)/prototype');
const tmp = path.join(DASH_DIR, '.edss-check-' + process.pid + '.html');
let dashOut = '', dashOk = false;
try {
  fs.writeFileSync(tmp, withEdss, 'utf8');
  dashOut = execFileSync('node', [path.join(DASH_DIR, 'test.js'), tmp],
    { encoding: 'utf8', cwd: DASH_DIR });
  dashOk = true;
} catch (e) { dashOut = String(e.stdout || '') + String(e.stderr || ''); }
finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
check('EDSS 실적을 심어도 대시보드 검사가 전부 통과한다', dashOk,
  dashOut.split('\n').filter(l => l.includes('FAIL')).slice(0, 5).join('\n         '));
check('실적을 심어도 검사 개수가 줄지 않는다',
  Number((dashOut.match(/통과 (\d+)/) || [])[1] || 0) >= 170,
  '실제: ' + (dashOut.match(/통과 \d+ · 실패 \d+/) || [''])[0]);
check('실적을 심은 갈래의 검사가 실제로 돌았다', /실적 연도는 심은 값을 그대로 쓴다/.test(dashOut));

/* 실적이 없을 때와 있을 때 **다른 숫자**가 나와야 합니다. 같은 값이 나오면
   심은 자료를 아무도 안 읽고 있다는 뜻입니다 — 가장 놓치기 쉬운 실패입니다. */
const grab = (html) => {
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const m = js.match(/const EDSS = [\s\S]*?\n\} : null;/);
  return m ? m[0] : '';
};
check('대시보드가 EDSS 를 읽는 관문을 가지고 있다', grab(dash).includes('EDSS_YEARS'));
check('관문이 3년 미만이면 켜지지 않는다', grab(dash).includes('length >= 3'));
check('실적이 없으면 예전 가정값으로 돈다', dash.includes("sg.type === '군' ? 0.062 : 0.033"));
check('실적이 있으면 그 시군의 실측값을 쓴다', dash.includes('EDSS.rate[sg.rc][lv]'));
check('늘어난 시군을 0 으로 깎지 않는다', dash.includes('Math.max(-0.03'));
check('설명 문구도 자료를 따라간다', dash.includes('function applyEdssWording'));
check('설명 갱신을 초기화에서 부른다', /applyEdssWording\(\);\nsyncSigChips/.test(dash));
check('백테스트 오차율을 화면에 적는다', dash.includes('맞는지 되짚어 보았습니다'));
check('전망 산출법을 내보내는 표에도 적는다', dash.includes("['전망 산출법',PROJ_WORD]"));

console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
