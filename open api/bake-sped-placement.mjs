/* 특수교육 «배치유형» 굽기 — 국립특수교육원 특수교육통계 → 대시보드에 심기
 *
 * ★ 왜 필요한가
 *   특수교육 배치는 넷입니다 — 특수학교 · 특수학급 · 일반학급(완전통합) · 특수교육지원센터.
 *   학교알리미는 앞의 둘만 줍니다. 그것만 세면 «완전통합 학생»이 통째로 빠져,
 *   실제보다 적은 수를 「특수교육대상자」라고 부르게 됩니다.
 *   2026년 경북에서 그 차이는 1,363명이었습니다(6,902 → 5,539 로 셈하던 셈).
 *
 * ★ 무엇을 대신하고 무엇을 대신하지 않나
 *   대신하는 것  — «경북 전체» 배치유형별 학생 수 (이 자료가 더 옳습니다)
 *   대신 못하는 것 — 시군별·학교급별. 이 자료는 시도까지만 있습니다.
 *                    그 둘은 그대로 학교알리미로 셉니다.
 *
 *   그래서 화면은 두 자료를 «나란히» 씁니다. 기준이 다르므로 어느 쪽 수인지 적습니다.
 *
 * 자료: 06. 실행계획(1)/data/master/sped-placement-2026.csv
 *       만드는 법은 같은 폴더의 from-nise-placement.py 머리말
 *
 * 쓰는 법:  node "open api/bake-sped-placement.mjs"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIR    = path.join(ROOT, '06. 실행계획(1)/data/master');
const TARGET = path.join(ROOT, '06. 실행계획(1)/prototype/index.html');

const BEGIN = '/* === 특수교육 배치유형 (구운 자료) === */';
const END   = '/* === 특수교육 배치유형 끝 === */';

function findCsv(){
  if(!fs.existsSync(DIR)) return null;
  const hit = fs.readdirSync(DIR)
    .filter(f => /^sped-placement-\d{4}\.csv$/.test(f))
    .sort().reverse()[0];
  return hit ? path.join(DIR, hit) : null;
}

export function bake(){
  const csv = findCsv();
  let data = null;

  if(csv){
    const text = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '');
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(',').map(c => c.trim());
    const rows = lines.filter(Boolean).map(l => {
      const c = l.split(',');
      return Object.fromEntries(cols.map((k, i) => [k, (c[i] ?? '').trim()]));
    });
    if(rows.length){
      const n = v => (v === '' || v === undefined) ? null : (Number(v) || 0);
      const year = Number(rows[0].year) || null;
      const by = {};
      for(const r of rows){
        by[r.placement] = { sch:n(r.schools), cls:n(r.classes), stu:n(r.students), teach:n(r.teachers) };
      }
      /* 장애영아는 «배치»가 아니라 별도 집계라 계에 넣지 않습니다 */
      const PLACES = ['특수학교','특수학급','일반학급','특수교육지원센터'];
      const total = PLACES.reduce((a, k) => a + ((by[k] && by[k].stu) || 0), 0);
      data = { year, basis: year + '. 4. 1.', region: rows[0].region,
               src: '국립특수교육원 「' + year + ' 특수교육통계」',
               by, total, places: PLACES,
               infant: (by['장애영아'] && by['장애영아'].stu) || 0 };
    }
  }

  const block = BEGIN + '\nconst SPED_PLACE = ' + (data ? JSON.stringify(data) : 'null') +
                (data ? ';' : ';   // 자료 미확보') + '\n' + END;

  let html = fs.readFileSync(TARGET, 'utf8');
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc(BEGIN) + '[\\s\\S]*?' + esc(END));
  if(re.test(html)) html = html.replace(re, block);
  else {
    const anchor = '/* === 특수학급 학급 수 (구운 자료) === */';
    if(!html.includes(anchor)){ console.error('✗ 심을 자리를 찾지 못했습니다.'); return false; }
    html = html.replace(anchor, block + '\n\n' + anchor);
  }
  fs.writeFileSync(TARGET, html, 'utf8');

  if(data) console.log(`✓ ${data.region} 특수교육대상자 ${data.total.toLocaleString()}명 (${data.basis} 기준) 을 심었습니다.`);
  else console.log('· 배치유형 자료가 아직 없습니다.');
  return true;
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) bake();
