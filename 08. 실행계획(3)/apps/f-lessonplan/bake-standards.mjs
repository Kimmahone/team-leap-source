#!/usr/bin/env node
/* ==========================================================================
   성취기준·성취수준을 앱 F 안에 굽습니다.

   왜 굽나 — 원칙 1(단일 HTML·외부 파일 0) 때문입니다. 참고 앱은
   `standards-data.js` 를 옆에 두지만, 우리 앱은 파일 하나로 나갑니다.

   왜 A/B/C 까지 굽나 — 성취수준 A/B/C 가 그대로 **심화·기본·기초 피드백**이
   됩니다. 교사가 가장 오래 붙들고 있는 칸이 그 셋입니다. 코드와 내용만
   구우면 34K 로 가볍지만, 정작 시간을 아껴 주는 자리를 비워 두게 됩니다.

   원본: 2022 개정 교육과정에 따른 성취수준(1~2·3~4·5~6학년군), 한국교육과정평가원
   경유: 「인공지능 활용 선도교사」 연수 실습 앱의 standards-data.js

   쓰는 법
     node bake-standards.mjs                 # 기본 경로에서 찾아 굽습니다
     node bake-standards.mjs --src=<경로>     # 원본 위치를 직접 줄 때
     node bake-standards.mjs --dry           # 세어만 보고 파일은 안 고칩니다
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* 모르는 깃발은 먼저 걸러냅니다 — 마스터 7장 함정 14번.
   인자 없이도 도는 스크립트에 `--help` 를 치면 그냥 실행되는 일이 있었습니다. */
const OK_FLAGS = ['--src', '--dry', '--help', '-h'];
for (const a of process.argv.slice(2)) {
  const name = a.split('=')[0];
  if (!OK_FLAGS.includes(name)) {
    console.error(`✗ 모르는 깃발입니다: ${a}\n  쓸 수 있는 것: ${OK_FLAGS.join(' · ')}`);
    process.exit(1);
  }
}
if (process.argv.some(a => a === '--help' || a === '-h')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('========================================================================== */')[0]);
  process.exit(0);
}
const DRY = process.argv.includes('--dry');
const srcArg = (process.argv.find(a => a.startsWith('--src=')) || '').slice(6);

const CANDIDATES = [
  srcArg,
  path.join(HERE, '../../../../2. 깃허브 미탑재 (참고자료)/인공지능활용선도교사/02. 수업설계안 실습 앱/standards-data.js'),
  path.join(HERE, 'standards-data.js')
].filter(Boolean);

const src = CANDIDATES.find(p => fs.existsSync(p));
if (!src) {
  console.error('✗ standards-data.js 를 찾지 못했습니다. --src=<경로> 로 알려 주세요.\n  찾아본 곳:');
  CANDIDATES.forEach(p => console.error('   ' + p));
  process.exit(1);
}

/* 원본은 `window.STANDARDS = [...]` 한 줄입니다. eval 하지 않고 JSON 만 떼어 냅니다. */
const raw = fs.readFileSync(src, 'utf8');
const s = raw.indexOf('['), e = raw.lastIndexOf(']');
if (s < 0 || e <= s) { console.error('✗ 원본에서 배열을 찾지 못했습니다.'); process.exit(1); }
const list = JSON.parse(raw.slice(s, e + 1));

/* 교과 코드 — 성취기준 코드의 가운데 글자입니다. [4국01-01] → 국 */
const SUBJ = { 국: '국어', 수: '수학', 사: '사회', 과: '과학', 영: '영어', 도: '도덕',
  체: '체육', 음: '음악', 미: '미술', 실: '실과', 바: '바른 생활', 슬: '슬기로운 생활', 즐: '즐거운 생활' };

const rows = [];
const seen = new Set();
let dropped = 0;
for (const x of list) {
  const code = String(x.c || '').trim();
  const m = /^(\d{1,2})([가-힣]{1,3})\d{2}-\d{2}$/.exec(code);
  if (!m) { dropped++; continue; }
  if (seen.has(code)) { dropped++; continue; }
  seen.add(code);
  /* [코드, 내용, A, B, C] — 배열이 객체보다 짧습니다. 키 이름이 611번 반복되지 않습니다. */
  rows.push([code, String(x.t || '').trim(),
    String(x.A || '').trim(), String(x.B || '').trim(), String(x.C || '').trim()]);
}
rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/* 세어 봅니다 — 합계만 맞으면 틀린 것이 안 보입니다(마스터 7장 함정 12번) */
const byBand = {}, bySubj = {}, noLevel = [];
for (const r of rows) {
  const m = /^(\d{1,2})([가-힣]{1,3})/.exec(r[0]);
  byBand[m[1]] = (byBand[m[1]] || 0) + 1;
  const nm = SUBJ[m[2]] || m[2];
  bySubj[nm] = (bySubj[nm] || 0) + 1;
  if (!r[2] || !r[3] || !r[4]) noLevel.push(r[0]);
}

const json = JSON.stringify(rows);
console.log(`원본        ${path.basename(src)}`);
console.log(`성취기준    ${rows.length}건 (버린 것 ${dropped}건)`);
console.log(`학년군별    ${Object.entries(byBand).map(([k, v]) => `${k}학년군 ${v}`).join(' · ')}`);
console.log(`교과별      ${Object.entries(bySubj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`성취수준    A·B·C 모두 있는 것 ${rows.length - noLevel.length}건` +
  (noLevel.length ? ` · 빈 것 ${noLevel.length}건 (${noLevel.slice(0, 5).join(',')}…)` : ''));
console.log(`구울 크기   ${(json.length / 1024).toFixed(0)}K`);

if (DRY) { console.log('\n--dry 이므로 파일은 고치지 않았습니다.'); process.exit(0); }

/* 굽는 곳은 **두 곳**입니다 — 앱 F 와 앱 H 〔2026. 8. 7.〕.
   같은 자료를 앱마다 사본으로 들고 있으면 한 곳만 고쳤을 때 나머지가 조용히
   낡습니다(마스터 함정 13번). `bake-coords.mjs` 가 A·C·E·대시보드 넷을 한꺼번에
   고치는 것과 같은 이유로, 이 스크립트가 두 앱을 한꺼번에 고칩니다.

   담는 것은 서로 다릅니다 —
     앱 F  [코드, 내용, A, B, C]  성취수준 셋이 그대로 심화·기본·기초 피드백이 됩니다
     앱 H  [코드, 내용]          프로젝트 계획서의 평가 계획은 A·B·C 를 적는 자리가
                                 아닙니다. 쓰지 않을 105K 를 들고 다닐 이유가 없습니다.

   표시가 없으면 그 앱은 건너뜁니다 — 조용히 엉뚱한 자리에 붙이는 것보다 낫습니다. */
const leanJson = JSON.stringify(rows.map(r => [r[0], r[1]]));
const BEGIN = '/* STD-DATA-BEGIN */', END = '/* STD-DATA-END */';

const TARGETS = [
  { name: '앱 F 수업 설계안', file: path.join(HERE, 'index.html'), json },
  { name: '앱 H 프로젝트 학습', file: path.join(HERE, '../h-project/index.html'), json: leanJson }
];

console.log('');
let wrote = 0;
for (const t of TARGETS) {
  if (!fs.existsSync(t.file)) { console.log(`—  ${t.name} — 파일이 없어 건너뜁니다`); continue; }
  let html = fs.readFileSync(t.file, 'utf8');
  const i = html.indexOf(BEGIN), j = html.indexOf(END);
  if (i < 0 || j < 0 || j < i) {
    console.error(`✗  ${t.name} — ${BEGIN} … ${END} 표시를 찾지 못했습니다`);
    continue;
  }
  html = html.slice(0, i) + BEGIN + '\n  var STD_RAW = ' + t.json + ';\n  ' + html.slice(j);
  fs.writeFileSync(t.file, html);
  wrote++;
  console.log(`✓  ${t.name} — ${(t.json.length / 1024).toFixed(0)}K 를 구웠습니다 ` +
    `(파일 ${(fs.statSync(t.file).size / 1024).toFixed(0)}K)`);
}
if (!wrote) process.exit(1);
