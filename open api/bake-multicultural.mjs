/* 다문화 학생 수 굽기 — 사람이 정리한 CSV → 대시보드에 심기
 *
 * ★ 왜 API 가 아닌가 〔2026. 9. 3. 확인〕
 *   다문화 학생 수를 «경북 단위»로 주는 공개 API 가 없습니다.
 *     · 학교알리미  — 공시 항목에 없음
 *     · KOSIS       — 경북 도 단위 통계 없음(경산시·상주시 두 곳만 자체 등록)
 *     · EDSS        — 승인된 서비스에 없음
 *   그래서 교육통계서비스(KESS) 엑셀이나 도교육청 자료를 사람이 CSV 로 정리합니다.
 *   자세한 것은 06. 실행계획(1)/data/master/multicultural.schema.md
 *
 * ★ 자료가 없으면 «아무 일도 하지 않습니다»
 *   화면은 지금처럼 「자료가 없습니다」를 유지합니다.
 *   빈 값을 0 으로 심어 「다문화 학생이 없다」로 보이게 하지 않습니다.
 *
 * 쓰는 법:  node "open api/bake-multicultural.mjs"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIR    = path.join(ROOT, '06. 실행계획(1)/data/master');
const TARGET = path.join(ROOT, '06. 실행계획(1)/prototype/index.html');

const BEGIN = '/* === 다문화 학생 (구운 자료) === */';
const END   = '/* === 다문화 학생 끝 === */';

/* 채운 파일을 찾습니다 — template 은 «빈 양식»이라 건너뜁니다. */
function findCsv(){
  if(!fs.existsSync(DIR)) return null;
  const hit = fs.readdirSync(DIR)
    .filter(f => /^multicultural-\d{4}\.csv$/.test(f))
    .sort().reverse()[0];
  return hit ? path.join(DIR, hit) : null;
}

export function bake(){
  const csv = findCsv();
  const block0 = BEGIN + '\nconst MULTI_STU = null;   // 자료 미확보\n' + END;

  let data = null;
  if(csv){
    const text = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '');
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(',').map(c => c.trim());
    const rows = lines.filter(Boolean).map(l => {
      const c = l.split(',');
      return Object.fromEntries(cols.map((k, i) => [k, (c[i] ?? '').trim()]));
    /* 빈칸은 «모른다»는 뜻입니다. 0 으로 바꾸지 않고 버립니다. */
    }).filter(r => r.students !== '');

    if(rows.length){
      const year = Number(rows[0].year) || null;
      const byRegion = {};
      for(const r of rows){
        const reg = byRegion[r.region] || (byRegion[r.region] = {});
        const lv  = reg[r.level] || (reg[r.level] = {});
        lv[r.type] = (lv[r.type] || 0) + (Number(r.students) || 0);
      }
      data = { year, basis: year + '. 4. 1.', src: '교육통계 · 도교육청 정리',
               region: byRegion, file: path.basename(csv) };
    }
  }

  const block = data
    ? BEGIN + '\nconst MULTI_STU = ' + JSON.stringify(data) + ';\n' + END
    : block0;

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

  if(data){
    const n = Object.values(data.region).flatMap(r => Object.values(r))
      .flatMap(l => Object.values(l)).reduce((a, v) => a + v, 0);
    console.log(`✓ 다문화 학생 ${n}명 (${data.year}년 · ${data.file}) 을 심었습니다.`);
  }else{
    console.log('· 다문화 자료가 아직 없습니다. 화면은 「자료가 없습니다」를 유지합니다.');
    console.log('  채우는 법: 06. 실행계획(1)/data/master/multicultural.schema.md');
  }
  return true;
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) bake();
