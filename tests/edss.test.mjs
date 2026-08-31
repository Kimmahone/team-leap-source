/* EDSS 수집기 검사 — 네트워크 없이 돕니다.

   여기서 지키려는 것은 **규칙**이지 모양이 아닙니다.
   「필드 이름이 XXX 이다」가 아니라 「특수학급 학생수를 전체 학생수로 집지
   않는다」처럼, 틀렸을 때 화면의 숫자가 달라지는 것만 못 박습니다. */

import {
  redact, unwrap, guessFields, toLevel, toSgg, num,
  normalizeWide, parseSchoolList, sggLookup, aggregate, declineRates, cohortRates,
  projectCohort, backtest, toBlock, entryRate, GRADES, SGG_BY_NAME,
  AUTH_WAYS, buildRequest, wayName, findWay, wrapBody, pickProvinceBirths
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

/* ── 5. 여러 해치를 지어 전 과정을 굴려 봅니다 ───────────────────────
   명세서대로 **한 줄이 한 학교**입니다. 학년은 칸 이름에 박혀 있습니다. */
/* 보통 학교는 «일반 학년 칸»을, 겸하는 과정은 «과정 칸»을 씁니다.
   실제 응답을 세어 보고 알았습니다 — 명세서만 보고는 못 가려냅니다.
   경북 초등학교 504곳 가운데 elscCrsGrdr* 에 값이 있는 곳은 없었습니다. */
const GEN = { stu: n => 'grdr' + n + 'FstnClasStdntNope', cls: n => 'grdr' + n + 'FstnClasCnt' };
const GENH = { stu: n => 'grdr' + n + 'WkStdntNope', cls: n => 'grdr' + n + 'WkClasCnt' };
const GDBL = { stu: 'dblsClasStdntNope', cls: 'dblsClasCnt' };
const TOT = { stu: 'kescStdntNope', cls: 'kescClasCnt' };
const COL = {
  stu: { 초: n => 'elscCrsGrdr' + n + 'StdntNope', 중: n => 'mdscCrsGrdr' + n + 'StdntNope', 고: n => 'hgscCrsGrdr' + n + 'StdntNope' },
  cls: { 초: n => 'elscCrsGrdr' + n + 'FstnClasCnt', 중: n => 'mdscCrsGrdr' + n + 'FstnClasCnt', 고: n => 'hgscCrsGrdr' + n + 'FstnClasCnt' }
};
const DBL = { stu: { 초: 'elscCrsDblsClasStdntNope' }, cls: { 초: 'elscCrsDblsClasCnt' } };
const F = (kind) => ({
  year: 'crtrYr', code: 'opnId', name: 'schlNm', level: 'scsmTypeNm', sido: 'ctpvNm',
  total: TOT[kind],
  generic: { 초: [1, 2, 3, 4, 5, 6].map(GEN[kind]),
             중: [1, 2, 3].map(GENH[kind]), 고: [1, 2, 3].map(GENH[kind]) },
  genericDbls: { 초: GDBL[kind] },
  초: [1, 2, 3, 4, 5, 6].map(COL[kind]['초']),
  중: [1, 2, 3].map(COL[kind]['중']),
  고: [1, 2, 3].map(COL[kind]['고']),
  복식: DBL[kind]
});
/* 이름 → 시군. 실제로는 대시보드의 917곳에서 옵니다. */
const SGGOF = (name) => (/안동/.test(name) ? 'andong' : /구미/.test(name) ? 'gumi' : null);

function wideRow(kind, y, town, knd, stu, cls) {
  const lv = knd === '초등학교' ? '초' : knd === '중학교' ? '중' : '고';
  const v = kind === 'stu' ? stu : cls;
  /* 실제 응답과 같은 모양: scclNm 은 '해당없음'이고 학교급은 scsmTypeNm 이,
     학년별 값은 일반 학년 칸이 들고 있습니다. */
  const r = { crtrYr: String(y), opnId: town + knd, schlNm: town + knd,
              scclNm: '해당없음', scsmTypeNm: knd, ctpvNm: '경북' };
  const col = lv === '초' ? GEN[kind] : GENH[kind];
  for (let g = 1; g <= GRADES[lv]; g++) r[col(g)] = String(v);
  r[TOT[kind]] = String(v * GRADES[lv]);
  return r;
}
const rowsStu = [], rowsCls = [];
/* 안동은 해마다 5% 줄고, 구미는 그대로. 학년당 100명에서 시작합니다. */
for (let y = 2016; y <= 2026; y++) {
  for (const [town, drop] of [['안동', 0.05], ['구미', 0]]) {
    for (const knd of ['초등학교', '중학교', '고등학교']) {
      const n = Math.round(100 * Math.pow(1 - drop, y - 2016));
      rowsStu.push(wideRow('stu', y, town, knd, n, 4));
      rowsCls.push(wideRow('cls', y, town, knd, n, 4));
    }
  }
}
const nzS = normalizeWide(rowsStu, F('stu'), SGGOF, 'stu');
const nzC = normalizeWide(rowsCls, F('cls'), SGGOF, 'cls');
check('한 줄이 학년 수만큼 펼쳐진다', nzS.records.length === 11 * 2 * (6 + 3 + 3));
check('학교급을 못 읽은 줄이 없다', nzS.skipped.level === 0);
check('시군을 못 붙인 줄이 없다', nzS.skipped.sgg === 0);
check('학생 표는 학생만 채운다', nzS.records.every(r => r.cls === 0));
check('학급 표는 학급만 채운다', nzC.records.every(r => r.stu === 0));
check('학년 번호가 1부터 붙는다',
  nzS.records.filter(r => r.lv === '초' && r.year === 2016 && r.sgg === 'andong')
    .map(r => r.grade).sort((a, b) => a - b).join(',') === '1,2,3,4,5,6');

/* 값이 하나도 없는 과정은 줄을 만들지 않습니다. 0 으로 채우면 초등학교가
   중·고 학생 0명을 가진 것처럼 보이고, 학교 수가 세 배가 됩니다. */
check('값 없는 과정은 기록을 만들지 않는다',
  normalizeWide([wideRow('stu', 2026, '안동', '초등학교', 10, 0)], F('stu'), SGGOF, 'stu')
    .records.every(r => r.lv === '초'));
/* 초·중 통합운영학교는 한 줄에 두 과정이 다 들어 있습니다. 학교급명 하나로
   가르면 둘 중 하나를 통째로 잃습니다. */
const both = Object.assign(wideRow('stu', 2026, '안동', '초등학교', 10, 0),
  { mdscCrsGrdr1StdntNope: '7', mdscCrsGrdr2StdntNope: '7', mdscCrsGrdr3StdntNope: '7' });
const nzBoth = normalizeWide([both], F('stu'), SGGOF, 'stu');
check('통합운영학교는 두 과정이 다 나온다',
  new Set(nzBoth.records.map(r => r.lv)).size === 2);
check('학교급명이 「초등학교」여도 중학교 과정을 버리지 않는다',
  nzBoth.records.filter(r => r.lv === '중').length === 3);

/* 복식학급은 어느 학년인지 알 수 없습니다. 버리지 않고 학년 0 으로 둡니다 —
   작은 학교일수록 복식이 많아서, 버리면 시골 학교만 줄어 보입니다. */
const dbl = Object.assign(wideRow('cls', 2026, '안동', '초등학교', 0, 1), { dblsClasCnt: '2', kescClasCnt: '8' });
const nzDbl = normalizeWide([dbl], F('cls'), SGGOF, 'cls');
check('복식학급을 버리지 않는다', nzDbl.records.some(r => r.grade === 0 && r.cls === 2));
check('복식은 학년을 지어내지 않는다', nzDbl.records.filter(r => r.grade === 0)[0].dbls === true);

/* ── 5-1-2. 일반 칸과 과정 칸을 가려 읽는가 ─────────────────────────
   보통 초등학교는 일반 학년 칸에만 값이 있습니다. 과정 칸을 보면 0기록이 됩니다. */
const plain = wideRow('stu', 2023, '안동', '초등학교', 20, 0);
check('보통 학교는 일반 학년 칸에서 읽는다',
  normalizeWide([plain], F('stu'), SGGOF, 'stu').records
    .filter(r => r.grade > 0).reduce((a, r) => a + r.stu, 0) === 120);
/* 초·중 통합운영학교: 제 학제는 일반 칸, 겸하는 중학교 과정은 과정 칸. */
const mix = Object.assign(wideRow('stu', 2023, '안동', '초등학교', 20, 0), {
  mdscCrsGrdr1StdntNope: '5', mdscCrsGrdr2StdntNope: '5', mdscCrsGrdr3StdntNope: '5',
  kescStdntNope: '135'
});
const nzMix = normalizeWide([mix], F('stu'), SGGOF, 'stu');
check('통합운영학교는 초는 일반 칸, 중은 과정 칸에서 읽는다',
  nzMix.records.filter(r => r.lv === '초' && r.grade > 0).reduce((a, r) => a + r.stu, 0) === 120 &&
  nzMix.records.filter(r => r.lv === '중' && r.grade > 0).reduce((a, r) => a + r.stu, 0) === 15);
check('제 학제를 과정 칸에서 또 읽지 않는다 (두 번 세면 안 된다)',
  nzMix.records.filter(r => r.lv === '초').length === 6);
check('읽은 합이 API 가 준 계와 같으면 조용하다', nzMix.mismatch.length === 0);

/* 계에는 학년별 말고 특수학급·순회학급도 들어 있습니다. 빼먹으면 학교
   310곳쯤에서 학년별 합이 계보다 작아지는데, 그 차이는 한 자리 수라 눈에
   잘 안 띕니다. 학년을 알 수 없으므로 복식과 같이 학년 0 으로 담습니다. */
const FX = (kind) => Object.assign(F(kind), { extra: { 초: ['sclsStdntNope', 'tourClasStdntNope'] } });
const sped = Object.assign(wideRow('stu', 2023, '안동', '초등학교', 20, 0),
  { sclsStdntNope: '8', tourClasStdntNope: '3', kescStdntNope: '131' });
const nzSp = normalizeWide([sped], FX('stu'), SGGOF, 'stu');
check('특수·순회 학생을 버리지 않는다',
  nzSp.records.filter(r => r.grade === 0).reduce((a, r) => a + r.stu, 0) === 11);
check('특수·순회를 담으면 합이 계와 맞는다', nzSp.mismatch.length === 0);
check('특수·순회는 학년을 지어내지 않는다',
  nzSp.records.filter(r => r.grade === 0).every(r => r.dbls === true));
check('특수·순회를 빼면 합이 계보다 작다',
  /131/.test(normalizeWide([sped], F('stu'), SGGOF, 'stu').mismatch[0] || ''));
/* 중·고의 주간학생수는 특수·순회를 «이미 품고» 있습니다. 또 더하면 두 번 셉니다 —
   초등 기준으로 다 더했다가 경산중 815/800 처럼 15명씩 넘쳤습니다. */
const spedM = Object.assign(wideRow('stu', 2023, '안동', '중학교', 20, 0),
  { sclsStdntNope: '8', kescStdntNope: '60' });
check('중·고는 특수·순회를 또 더하지 않는다',
  normalizeWide([spedM], FX('stu'), SGGOF, 'stu').mismatch.length === 0);
/* 합계만 보면 틀린 것이 안 보입니다. 학년 칸을 하나 잘못 집어도 화면의
   총계는 그럴듯합니다. 그래서 학교마다 계와 맞춰 봅니다. */
const bad = Object.assign(wideRow('stu', 2023, '안동', '초등학교', 20, 0), { kescStdntNope: '999' });
check('읽은 합이 계와 다르면 그 학교를 적는다',
  normalizeWide([bad], F('stu'), SGGOF, 'stu').mismatch.length === 1);
check('어느 학교가 얼마나 다른지 함께 적는다',
  /안동초등학교 120\/999/.test(normalizeWide([bad], F('stu'), SGGOF, 'stu').mismatch[0]));
check('계가 0 이면 트집 잡지 않는다 (자료가 없는 것뿐이다)',
  normalizeWide([Object.assign(wideRow('stu', 2023, '안동', '초등학교', 20, 0), { kescStdntNope: '0' })],
    F('stu'), SGGOF, 'stu').mismatch.length === 0);

check('못 붙인 학교의 학생 수도 센다 (줄 수만으로는 크기를 모른다)',
  normalizeWide([wideRow('stu', 2026, '서울', '초등학교', 10, 0)], F('stu'), SGGOF, 'stu')
    .skipped.sggStu === 60);
check('시군을 못 붙이면 이름을 세어 알린다',
  normalizeWide([wideRow('stu', 2026, '서울', '초등학교', 10, 0)], F('stu'), SGGOF, 'stu')
    .missing['서울초등학교'] === 1);
check('시군을 못 붙인 줄은 기록으로 만들지 않는다',
  normalizeWide([wideRow('stu', 2026, '서울', '초등학교', 10, 0)], F('stu'), SGGOF, 'stu')
    .records.length === 0);
check('개방ID 로 이으면 이름이 겹쳐도 갈라진다',
  normalizeWide([wideRow('stu', 2026, '남산', '초등학교', 10, 0)], F('stu'),
    (nm, cd) => (cd === '남산초등학교' ? 'yeongju' : null), 'stu').records[0].sgg === 'yeongju');

/* 이 API 는 시도 인자를 보내도 전국을 줍니다(2026-08-31 확인). 받은 뒤에 거릅니다.
   안 거르면 못 붙인 이름이 만 개 넘게 쌓여서 정작 봐야 할 것이 묻힙니다. */
const 전국 = [wideRow('stu', 2023, '안동', '초등학교', 10, 0),
             Object.assign(wideRow('stu', 2023, '서울', '초등학교', 10, 0), { ctpvNm: '서울' })];
const nzSido = normalizeWide(전국, F('stu'), SGGOF, 'stu', { sido: '경북' });
check('다른 시도는 걸러 낸다', nzSido.skipped.sido === 1);
check('걸러 낸 줄은 못 붙인 이름으로 세지 않는다',
  Object.keys(nzSido.missing).length === 0);
check('시도를 안 주면 다 받는다',
  normalizeWide(전국, F('stu'), SGGOF, 'stu', {}).skipped.sido === 0);

/* 특수학교 8곳은 bake-special.mjs 가 따로 심습니다. 여기서 초·중·고에 섞으면
   두 번 세어집니다. 학제유형명으로 뺍니다. */
for (const t of ['특수학교', '각종학교', '고등공민학교', '고등기술학교', '유치원']) {
  const row = Object.assign(wideRow('stu', 2023, '안동', '초등학교', 10, 0), { scsmTypeNm: t });
  check(t + '은 초·중·고에 섞지 않는다',
    normalizeWide([row], Object.assign(F('stu'), { level: 'scsmTypeNm' }), SGGOF, 'stu', {}).records.length === 0);
}
/* 그 학교급이 실제로 쓰는 칸에 값을 넣고 지어야 합니다. 초등학교 모양으로
   지어 놓고 학교급명만 바꾸면, 중·고가 안 읽히는 것이 「걸러진 것」처럼 보입니다. */
for (const t of ['초등학교', '중학교', '일반고등학교', '자율고등학교', '특성화고등학교', '특수목적고등학교']) {
  const row = wideRow('stu', 2023, '안동', t, 10, 0);
  check(t + '은 받는다', normalizeWide([row], F('stu'), SGGOF, 'stu', {}).records.length > 0);
}
check('초등학교는 6학년까지 나온다',
  normalizeWide([wideRow('stu', 2023, '안동', '초등학교', 10, 0)], F('stu'), SGGOF, 'stu', {})
    .records.filter(r => r.grade > 0).length === 6);
check('중학교는 3학년까지만 나온다',
  normalizeWide([wideRow('stu', 2023, '안동', '중학교', 10, 0)], F('stu'), SGGOF, 'stu', {})
    .records.filter(r => r.grade > 0).length === 3);
check('중학교를 초등 칸에서 읽지 않는다 (읽으면 2%만 잡힌다)',
  normalizeWide([Object.assign(wideRow('stu', 2023, '안동', '중학교', 10, 0),
    { grdr1FstnClasStdntNope: '999' })], F('stu'), SGGOF, 'stu', {})
    .records.filter(r => r.grade === 1)[0].stu === 10);

/* ── 5-1. 대시보드에서 시군을 읽어 온다 ─────────────────────────────── */
const DASH_HTML = fs.readFileSync(path.join(ROOT, '06. 실행계획(1)/prototype/index.html'), 'utf8');
const smap = parseSchoolList(DASH_HTML);
check('대시보드에서 학교 목록을 읽는다', smap && Object.keys(smap).length > 850);
check('22개 시군이 다 나온다',
  new Set(Object.values(smap).filter(Boolean)).size === 22);
const look = sggLookup(smap);
check('보통 학교는 시군이 붙는다', look('안동중학교') === 'andong');
check('분교장은 본교와 같은 시군', look('녹전초등학교원천분교장') === 'andong');
check('띄어쓰기가 달라도 붙는다', look(' 영양초등학교 ') === 'yeongyang');
/* 남산초등학교는 영주·경산 두 곳에 있습니다. 먼저 만난 쪽으로 정해 버리면
   스무 곳이 조용히 엉뚱한 시군으로 갑니다. 모르면 모른다고 합니다. */
check('두 시군에 같은 이름이면 찍지 않는다', look('남산초등학교') === null);
check('없는 학교는 null', look('없는초등학교') === null);
check('겹치는 이름이 실제로 있다 (이 검사가 헛돌지 않는지)',
  Object.values(smap).filter(v => v === null).length >= 5);

const agg = aggregate(nzS.records.concat(nzC.records));
check('연도 11개', agg.years.length === 11);
check('연도가 오름차순', agg.years[0] === 2016 && agg.years[10] === 2026);
check('시군 2곳', Object.keys(agg.byYear[2026]).length === 2);
check('학교 수를 개방ID 로 센다 (학년별 6줄을 6개교로 세지 않는다)',
  agg.byYear[2026].andong['초'].sch === 1);
check('초등 학생수는 학년 6개의 합', agg.byYear[2016].gumi['초'].stu === 600);
check('학생과 학급이 같은 칸에 모인다',
  agg.byYear[2016].gumi['초'].stu === 600 && agg.byYear[2016].gumi['초'].cls === 24);
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

/* KOSIS 출생아 표에는 «경상북도 합계»와 «시군 각각»과 «포항 남·북구»가 함께
   들어 있습니다. 다 더하면 2019년이 14,472 대신 31,645 — 두 배가 넘습니다.
   그러면 취학률이 0.98 이 아니라 0.45 로 나오고 초1 전망이 절반으로 꺾입니다. */
const BIRTH_ROWS = [
  { year: '2019', regionCode: '37', region: '경상북도', value: 14472 },
  { year: '2019', regionCode: '37010', region: '포항시', value: 2701 },
  { year: '2019', regionCode: '37011', region: '남구', value: 1221 },
  { year: '2019', regionCode: '37012', region: '북구', value: 1480 },
  { year: '2020', regionCode: '37', region: '경상북도', value: 13000 }
];
check('시도 합계 한 줄만 고른다', pickProvinceBirths(BIRTH_ROWS, '37')[2019] === 14472);
check('시군을 더하지 않는다 (더하면 두 배가 넘는다)',
  pickProvinceBirths(BIRTH_ROWS, '37')[2019] !== 31645);
check('여러 해를 다 고른다', Object.keys(pickProvinceBirths(BIRTH_ROWS, '37')).length === 2);
check('없는 코드면 빈 표', Object.keys(pickProvinceBirths(BIRTH_ROWS, '11')).length === 0);
check('실제 파일에서도 시도 합계가 시군 합보다 작다', (function () {
  const f = path.join(ROOT, 'open api/data/kosis-summary.json');
  if (!fs.existsSync(f)) return true;
  const k = JSON.parse(fs.readFileSync(f, 'utf8'));
  const prov = pickProvinceBirths(k.births, '37');
  const yrs = Object.keys(prov);
  if (!yrs.length) return false;
  const all = {};
  for (const b of k.births || []) all[b.year] = (all[b.year] || 0) + Number(b.value || 0);
  return prov[yrs[0]] < all[yrs[0]];
})());
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
/* 인증키는 헤더가 아니라 «본문»의 userApiAthkCn 입니다. 테스트 예시로 확인했습니다.
   (api_key 헤더도 게이트웨이가 읽기는 하지만, 그것만으로는 404 입니다) */
/* 이 플랫폼은 «두 군데를 다» 봅니다. 하나만 넣으면 각각 401 과 404 가 나는데,
   겉보기로는 서로 다른 문제처럼 보여서 엉뚱한 데를 파게 됩니다. */
check('인증키를 두 군데에 넣는다', Array.isArray(cfg.auth) && cfg.auth.length === 2);
check('게이트웨이용은 api_key 헤더다', cfg.auth.indexOf('header:api_key') >= 0);
check('앱용은 본문의 userApiAthkCn 이다', cfg.auth.indexOf('body:userApiAthkCn') >= 0);
check('두 자리를 한 요청에 다 채운다', (function () {
  const req = buildRequest(KEY, wrapBody(cfg.envelope, 'SA1', {}), findWay(cfg.auth));
  return req.headers.api_key === KEY && JSON.parse(req.body).userApiAthkCn === KEY;
})());
check('하나만 적어도 예전처럼 돈다', (function () {
  const req = buildRequest(KEY, {}, findWay('header:api_key'));
  return req.headers.api_key === KEY && !JSON.parse(req.body).userApiAthkCn;
})());
check('여러 자리 이름이 함께 보인다', findWay(cfg.auth) && wayName(findWay(cfg.auth)).indexOf('+') > 0);
check('본문을 한 겹 싸는 방법을 적어 두었다',
  cfg.envelope && cfg.envelope.id === 'apiId' && cfg.envelope.params === 'srhParam');
/* 예시의 시도명이 대전·대구·경기입니다. 「경상북도」로 보내면 0건이 오는데,
   0건은 오류처럼 보이지 않아서 그대로 배포될 수 있습니다. */
check('시도명은 짧은 이름 「경북」이다', cfg.sidoName === '경북');
check('설정의 시도 인자도 짧은 이름이다',
  cfg.apis.studentStatus.params.ctpvNm === '경북');
check('학교급은 scclNm 이 아니라 scsmTypeNm 이 들고 있다',
  cfg.apis.studentStatus.fields.level === 'scsmTypeNm');

/* ── 7-2. 본문을 문서의 예시와 똑같이 만드는가 ─────────────────────── */
const wb = wrapBody(cfg.envelope, 'SA00202400014', { crtrYr: '2023', ctpvNm: '경북' });
check('본문에 apiId 를 적는다 (주소에 있어도 또 적어야 한다)', wb.apiId === 'SA00202400014');
check('조회조건은 srhParam 안에 한 겹 싸인다', wb.srhParam.crtrYr === '2023');
check('조회조건이 바깥으로 새지 않는다', wb.crtrYr === undefined);
const wreq = buildRequest(KEY, wb, findWay(cfg.auth));
const wsent = JSON.parse(wreq.body);
check('인증키는 본문 맨 바깥에 붙는다', wsent.userApiAthkCn === KEY);
check('인증키가 srhParam 안으로 들어가지 않는다', wsent.srhParam.userApiAthkCn === undefined);
check('키가 주소로 새지 않는다 (로그에 URL 이 실려도 안전하다)',
  !JSON.stringify(wreq).includes('?') || !/[?&][^"]*KEY/.test(JSON.stringify(wreq)));
check('키를 넣는 자리는 설정이 정한 두 곳뿐이다', (function () {
  const req = buildRequest(KEY, wrapBody(cfg.envelope, 'SA1', { crtrYr: '2023' }), findWay(cfg.auth));
  const hdr = Object.keys(req.headers).filter(k => req.headers[k] === KEY);
  const bdy = Object.keys(JSON.parse(req.body)).filter(k => JSON.parse(req.body)[k] === KEY);
  return hdr.length === 1 && bdy.length === 1 && hdr[0] === 'api_key' && bdy[0] === 'userApiAthkCn';
})());
check('보내는 본문의 열쇠가 문서와 같다',
  JSON.stringify(Object.keys(wsent).sort()) === JSON.stringify(['apiId', 'srhParam', 'userApiAthkCn']));
check('설정에 봉투가 없으면 조회조건을 그대로 편다',
  wrapBody({}, 'X', { a: 1 }).a === 1);
check('서비스ID 가 API 마다 주소와 맞는다',
  Object.values(cfg.apis).every(a => !a.serviceId || a.url.endsWith(a.serviceId)));

/* ── 7-3. 이 플랫폼의 응답 봉투 ────────────────────────────────────── */
const pr1 = unwrap({ resultData: [{ crtrYr: '2023' }], msgCd: '200 (성공)', msgCn: '[조회건수 : 1 건]' });
check('resultData 를 줄로 읽는다', pr1.rows.length === 1);
check('msgCn 의 조회건수를 총건수로 읽는다', pr1.total === 1);
check('쉼표 든 건수도 읽는다',
  unwrap({ resultData: [{}], msgCn: '[조회건수 : 12,345 건]' }).total === 12345);
check('msgCd 를 남긴다 (200 이 아니면 사람이 봐야 한다)', pr1.meta.code === '200 (성공)');
check('0건도 오류가 아니라 0건으로 읽는다',
  unwrap({ resultData: [], msgCd: '200 (성공)', msgCn: '[조회건수 : 0 건]' }).rows.length === 0);
check('호출 한도를 정해 둔다 (하루 한도를 넘기면 그날은 못 받는다)',
  Number(cfg.callCap) > 0 && Number(cfg.callCap) <= 10000);
check('게이트웨이가 POST 라는 것을 적어 두었다', JSON.stringify(cfg).includes('POST'));

/* 개발명세서에 적힌 칸 이름을 그대로 못 박습니다. 한 글자만 틀려도 그 학년이
   조용히 0 이 되는데, 합계는 그럴듯해 보입니다. */
const SPEC = {
  studentStatus: { 초: 'elscCrsGrdr#StdntNope', 중: 'mdscCrsGrdr#StdntNope', 고: 'hgscCrsGrdr#StdntNope' },
  classStatus:   { 초: 'elscCrsGrdr#FstnClasCnt', 중: 'mdscCrsGrdr#FstnClasCnt', 고: 'hgscCrsGrdr#FstnClasCnt' }
};
for (const id of Object.keys(SPEC)) {
  const f = cfg.apis[id].fields;
  for (const lv of ['초', '중', '고']) {
    const want = [];
    for (let g = 1; g <= GRADES[lv]; g++) want.push(SPEC[id][lv].replace('#', g));
    check(id + ' ' + lv + ' 학년 칸 이름이 명세서와 같다',
      JSON.stringify(f[lv]) === JSON.stringify(want),
      '있는 값: ' + JSON.stringify(f[lv]));
  }
  check(id + ' 은 조사년도 인자가 crtrYr 이다', cfg.apis[id].yearParam === 'crtrYr');
  check(id + ' 은 시도로 걸러 받는다', cfg.apis[id].params.ctpvNm === cfg.sidoName);
  check(id + ' 은 복식학급도 담는다', !!(f['복식'] && f['복식']['초']));
  /* 학교급마다 쓰는 칸이 다릅니다. 하나로 정하면 나머지가 조용히 비어 버립니다. */
  check(id + ' 은 학교급마다 다른 일반 학년 칸을 안다',
    f.generic && f.generic['초'] && f.generic['초'].length === 6 &&
    f.generic['중'] && f.generic['중'].length === 3);
  check(id + ' 은 초등은 단식학급 칸을 본다', /FstnClas/.test(String(f.generic['초'][0])));
  check(id + ' 은 중·고는 주간 칸을 본다', /Wk/.test(String(f.generic['중'][0])));
  check(id + ' 은 야간 학교도 더한다', /Nght/.test(JSON.stringify(f.generic['고'])));
  check(id + ' 은 복식을 초등에만 붙인다', f.genericDbls && f.genericDbls['초'] && !f.genericDbls['중']);
  /* 더하는 자리가 학생과 학급이 다릅니다. 학생은 중·고가 이미 품고 있고,
     학급은 세 학교급 모두 빠져 있습니다. 한쪽 규칙을 양쪽에 쓰면 한 자리 수씩
     모자라거나 넘치는데, 총계만 보면 그럴듯해 보입니다. */
  check(id + ' 은 초등에 특수·순회를 더한다',
    f.extra && f.extra['초'] && f.extra['초'].length > 0);
  if (id === 'studentStatus')
    check('학생수는 중·고에 특수·순회를 또 더하지 않는다', !f.extra['중']);
  else
    check('학급수는 중·고에도 특수·순회를 더한다', !!(f.extra['중'] && f.extra['고']));
  check(id + ' 은 계와 맞춰 볼 칸을 안다', !!f.total);
  check(id + ' 은 한 줄이 한 학교라고 적어 둔다', cfg.apis[id].shape === 'wide');
}
/* 시도 이름 쓰는 법이 API 마다 다릅니다. 짧은 이름으로 보냈다가 0건을 받았습니다.
   0건은 오류처럼 보이지 않아서 그대로 넘어갈 뻔했습니다. */
check('학급및학생현황은 조회조건을 비워 여러 해를 한꺼번에 받는다',
  cfg.apis.classStudent.yearParam === '' &&
  Object.keys(cfg.apis.classStudent.params).length === 0);
check('긴 시도 이름도 적어 둔다', cfg.sidoLong === '경상북도');
check('짧은 이름과 긴 이름이 다르다는 것을 적어 두었다',
  JSON.stringify(cfg).includes('API 마다 다릅니다'));
check('학급및학생현황은 시군구 칸을 가지고 있다 (개방ID→시군을 여기서 얻는다)',
  cfg.apis.classStudent.fields.sgg === 'sggNm');
check('학생·학급 표에는 시군구 칸이 없다 (있다고 적으면 전부 버려진다)',
  !cfg.apis.studentStatus.fields.sgg && !cfg.apis.classStatus.fields.sgg);
check('위치정보는 위도·경도 칸 이름을 안다 (경도는 lon 이 아니라 lot)',
  cfg.apis.schoolLocation.fields.lat === 'lat' && cfg.apis.schoolLocation.fields.lon === 'lot');
check('쪽 넘기는 인자가 없다고 적어 둔다 (명세서에 없다)',
  !cfg.paging.page && !cfg.paging.size);

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

const rows22S = [], rows22C = [];
const NAMES = Object.keys(SGG_BY_NAME);
/* 실제 시군 이름을 그대로 씁니다 — 이름으로 시군을 잇는 길이 실제로 도는지
   함께 보려는 것입니다. */
const NAME2SGG = {};
NAMES.forEach(nm => { NAME2SGG[nm] = SGG_BY_NAME[nm]; });
const look22 = (nm) => {
  for (const k of NAMES) if (nm.indexOf(k) === 0) return NAME2SGG[k];
  return null;
};
for (let y = 2016; y <= 2026; y++) {
  NAMES.forEach((nm, i) => {
    const drop = 0.02 + (i % 5) * 0.015;          // 시군마다 다른 기울기
    for (const knd of ['초등학교', '중학교', '고등학교']) {
      for (let sch = 0; sch < 3; sch++) {
        const n = Math.max(1, Math.round(40 * Math.pow(1 - drop, y - 2016)));
        const rs = wideRow('stu', y, nm, knd, n, 2), rc = wideRow('cls', y, nm, knd, n, 2);
        rs.opnId = rs.schlNm = rc.opnId = rc.schlNm = nm + knd + sch;
        rows22S.push(rs); rows22C.push(rc);
      }
    }
  });
}
const a22 = aggregate(
  normalizeWide(rows22S, F('stu'), look22, 'stu').records
    .concat(normalizeWide(rows22C, F('cls'), look22, 'cls').records));
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
