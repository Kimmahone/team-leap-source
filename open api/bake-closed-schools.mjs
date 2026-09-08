/* 폐교 현황 굽기 — 지방교육재정알리미 폐교목록 → 대시보드에 심기
 *
 * ★ 이 화면은 통째로 비어 있었습니다
 *   예전에 여기 있던 「우수 사례」 넷은 지어낸 것이었고, 지도의 핀은 그 시군의
 *   중심점이었습니다. 걷어낸 뒤로 「자료를 받으면 채웁니다」 라고만 적혀 있었습니다.
 *   이제 실제 자료로 채웁니다.
 *
 * ★ 좌표는 주소에서 만듭니다
 *   이 자료에는 주소만 있고 위경도가 없습니다. 그래서 주소를 좌표로 바꿔 심습니다
 *   (유치원에 쓴 open api/kakao-geocode.mjs 그대로. 캐시가 있어 두 번 묻지 않습니다).
 *   못 찾은 곳은 **비워 둡니다** — 없는 좌표를 시군 중심으로 대신하지 않습니다.
 *   그것이 예전의 잘못이었습니다(지도의 핀이 죄다 시군 중심점이었습니다).
 *
 * 자료: 06. 실행계획(1)/data/master/closed-schools-2026.csv
 *       만드는 법은 같은 폴더의 from-eduinfo-closed.py 머리말
 *
 * 쓰는 법:  node "open api/bake-closed-schools.mjs"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGeocoder, inGyeongbuk } from './kakao-geocode.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIR    = path.join(ROOT, '06. 실행계획(1)/data/master');
const TARGET = path.join(ROOT, '06. 실행계획(1)/prototype/index.html');

const BEGIN = '/* === 폐교 현황 (구운 자료) === */';
const END   = '/* === 폐교 현황 끝 === */';

function findCsv(){
  if(!fs.existsSync(DIR)) return null;
  const hit = fs.readdirSync(DIR)
    .filter(f => /^closed-schools-\d{4}\.csv$/.test(f))
    .sort().reverse()[0];
  return hit ? path.join(DIR, hit) : null;
}

/* 한 줄씩 «따옴표를 지켜» 가릅니다 — 학교 이름에 쉼표가 들어올 수 있습니다 */
function splitCsv(line){
  const out = []; let cur = '', q = false;
  for(const ch of line){
    if(ch === '"'){ q = !q; continue; }
    if(ch === ',' && !q){ out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/* 폐교 주소에만 있는 군더더기를 떼어 냅니다.
   «소로리 534-1외 6필지» 처럼 필지가 여럿이면 카카오가 통째로 못 읽습니다. */
function tidyClosedAddr(a){
  return String(a || '')
    .replace(/\s*외\s*\d+\s*필지.*$/, '')
    .replace(/\s*일원.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function bake(){
  const csv = findCsv();
  let data = null;

  if(csv){
    const text = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '');
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(',').map(c => c.trim());
    const rows = lines.filter(Boolean).map(l => {
      const c = splitCsv(l);
      return Object.fromEntries(cols.map((k, i) => [k, (c[i] ?? '').trim()]));
    });

    if(rows.length){
      const year = Number((csv.match(/(\d{4})\.csv$/) || [])[1]) || null;
      /* 화면이 쓰는 만큼만 압축해 심습니다 — 750줄을 객체로 펼치면 파일이 크게 붑니다.
         형식: '시군|이름|폐교연도|급별|활용' */
      /* 주소 → 좌표. 캐시 덕에 두 번째부터는 거의 묻지 않습니다. */
      const geo = makeGeocoder();
      let 좌표있음 = 0, 경북밖 = 0;
      const coords = [];
      for(const r of rows){
        let hit = null;
        try { hit = await geo.lookup(tidyClosedAddr(r.address)); } catch(e){ hit = null; }
        /* 엉뚱한 도로 이름에 걸려 다른 도로 넘어가는 일을 막습니다 */
        if(hit && typeof inGyeongbuk === 'function' && !inGyeongbuk(hit.lat, hit.lon)){ 경북밖++; hit = null; }
        if(hit) 좌표있음++;
        coords.push(hit);
      }
      geo.save();

      const list = rows.map((r, i) => {
        const c = coords[i];
        /* 소수 5자리면 1m 안팎입니다. 더 적으면 학교가 옆 논으로 갑니다. */
        return [r.sigungu, r.name, r.closed_year, r.level, r.use,
                c ? c.lat.toFixed(5) : '', c ? c.lon.toFixed(5) : ''].join('|');
      });
      const bySig = {}, byUse = {}, byYear = {};
      for(const r of rows){
        if(r.sigungu) bySig[r.sigungu] = (bySig[r.sigungu] || 0) + 1;
        if(r.use)     byUse[r.use]     = (byUse[r.use] || 0) + 1;
        if(r.closed_year) byYear[r.closed_year] = (byYear[r.closed_year] || 0) + 1;
      }
      data = { year, basis: year + '년 기준', total: rows.length,
               src: '지방교육재정알리미 폐교정보',
               geo: { 있음: 좌표있음, 없음: rows.length - 좌표있음 },
               bySig, byUse, byYear, list };
    }
  }

  const block = BEGIN + '\nconst CLOSED = ' + (data ? JSON.stringify(data) : 'null') +
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

  if(data){
    const u = Object.entries(data.byUse).map(([k, v]) => `${k} ${v}`).join(' · ');
    console.log(`✓ 경북 폐교 ${data.total}곳 을 심었습니다. (${u})`);
    console.log(`  좌표 ${data.geo.있음}곳 · 못 찾은 곳 ${data.geo.없음}곳 (비워 두었습니다)`);
  }else console.log('· 폐교 자료가 아직 없습니다.');
  return true;
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await bake();
