/* 특수학급 학급 수 굽기 — 「각급학교 일람표」 → 대시보드에 심기
 *
 * ★ 왜 API 가 아니라 CSV 를 읽나
 *   특수학급의 «학급 수»를 주는 공개 API 가 없습니다. 학교알리미는 특수학급
 *   «학생 수»(sped)만 주고, 학급 수는 주지 않습니다. 그래서 경상북도교육청이
 *   해마다 내는 「각급학교 일람표」 엑셀에서 뽑아 CSV 로 정리해 두고, 이 스크립트가
 *   그 CSV 를 읽습니다. 엑셀을 직접 읽지 않는 이유는 CI 에 엑셀 해석기를 들이지
 *   않기 위해서입니다 — 한 해에 한 번 사람이 CSV 를 새로 만드는 편이 낫습니다.
 *
 *   CSV:      06. 실행계획(1)/data/master/sped-classes-2025.csv
 *   만드는 법: 같은 폴더의 sped-classes.schema.md
 *
 * ★ 기준일이 다릅니다
 *   이 자료는 «4월 1일» 기준이고, 화면의 다른 특수교육 수치는 학교알리미
 *   «공시 시점» 기준입니다. 두 수를 나란히 놓을 때는 화면에서 그 사실을 적습니다.
 *   합치거나 빼서 증감을 단정하지 않습니다.
 *
 * 쓰는 법:  node "open api/bake-sped-classes.mjs"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CSV    = path.join(ROOT, '06. 실행계획(1)/data/master/sped-classes-2025.csv');
const TARGET = path.join(ROOT, '06. 실행계획(1)/prototype/index.html');

const BEGIN = '/* === 특수학급 학급 수 (구운 자료) === */';
const END   = '/* === 특수학급 학급 수 끝 === */';

function readCsv(file){
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.filter(Boolean).map(line => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
}

export function bake(){
  if(!fs.existsSync(CSV)){
    console.log('건너뜀: CSV 가 없습니다 —', path.relative(ROOT, CSV));
    return false;
  }
  const rows = readCsv(CSV);
  const n = v => Number(v) || 0;

  const lv = {};
  const sig = {};
  let year = 2025;

  for(const r of rows){
    year = n(r.year) || year;
    const L = r.level, S = r.sigungu;
    const rec = { cls:n(r.sped_classes), stu:n(r.sped_students),
                  sch:n(r.schools), with:n(r.schools_with_sped_class) };
    const acc = lv[L] || (lv[L] = { cls:0, stu:0, sch:0, with:0 });
    acc.cls += rec.cls; acc.stu += rec.stu; acc.sch += rec.sch; acc.with += rec.with;
    (sig[S] || (sig[S] = {}))[L] = rec;
  }

  /* 시군 줄은 «압축»해서 심습니다 — 22개 시군 × 3개 학교급을 객체로 펼치면
     한 파일 안에서 수백 줄이 됩니다. 읽는 쪽에서 풀어 씁니다.
     형식: 시군: '초학급,초학생|중학급,중학생|고학급,고학생' */
  const packed = {};
  for(const [s, byLv] of Object.entries(sig)){
    packed[s] = ['초','중','고']
      .map(L => { const r = byLv[L] || {cls:0,stu:0}; return `${r.cls},${r.stu}`; })
      .join('|');
  }

  const block =
    BEGIN + '\n' +
    'const SPED_CLASS = {\n' +
    `  year: ${year}, basis: '${year}. 4. 1.',\n` +
    "  src: '경상북도교육청 「" + year + "년 각급학교 일람표」',\n" +
    '  lv: ' + JSON.stringify(lv) + ',\n' +
    '  sig: ' + JSON.stringify(packed) + '\n' +
    '};\n' +
    END;

  let html = fs.readFileSync(TARGET, 'utf8');
  const re = new RegExp(
    BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' +
    END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if(re.test(html)){
    html = html.replace(re, block);
  }else{
    // 처음 심을 때는 시군 경계 블록 바로 앞에 둡니다.
    const anchor = '/* === 시군 경계 (구운 자료) === */';
    if(!html.includes(anchor)){ console.error('✗ 심을 자리를 찾지 못했습니다.'); return false; }
    html = html.replace(anchor, block + '\n\n' + anchor);
  }
  fs.writeFileSync(TARGET, html, 'utf8');

  const t = Object.values(lv).reduce((a, v) => ({ cls:a.cls+v.cls, stu:a.stu+v.stu }), {cls:0,stu:0});
  console.log(`✓ 특수학급 ${t.cls}학급 · ${t.stu}명 (${year}. 4. 1. 기준) 을 심었습니다.`);
  return true;
}

if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) bake();
