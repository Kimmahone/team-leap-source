/* KOSIS의 경북 6~18세 인구와 시군별 출생아 수를 받아 대시보드에 굽습니다.

   실행:
     node "open api/bake-kosis.mjs"
     node "open api/bake-kosis.mjs" --dry

   인증키는 프로젝트 루트 .dev.vars의 KOSIS_API_KEY를 먼저 읽고,
   없으면 open api/인증키.txt의 `KOSIS:` 표기를 찾습니다.
   브라우저와 배포 파일에는 인증키가 들어가지 않습니다. */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const TARGET=path.join(ROOT,'06. 실행계획(1)/prototype/index.html');
const DATA_FILE=path.join(HERE,'data/kosis-summary.json');
const CONFIG=JSON.parse(fs.readFileSync(path.join(HERE,'kosis-tables.json'),'utf8'));
const DRY=process.argv.includes('--dry');
const ARG=process.argv.slice(2).find(v=>!v.startsWith('--')) || '';

export const AGE_CODES=['0502','0503','0504','0505','0701','0702','0703','0704','0705','1001','1002','1003','1004'];

function loadDotEnv(file){
  if(!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).map(line=>{
    const m=line.match(/^([A-Z0-9_]+)=(.*)$/);
    return m ? [m[1],m[2].trim()] : null;
  }).filter(Boolean));
}

function getKey(){
  if(ARG) return ARG;
  if(process.env.KOSIS_API_KEY) return process.env.KOSIS_API_KEY;
  const local=loadDotEnv(path.join(ROOT,'.dev.vars')).KOSIS_API_KEY;
  if(local) return local;
  const legacy=path.join(HERE,'인증키.txt');
  if(fs.existsSync(legacy)){
    const hit=fs.readFileSync(legacy,'utf8').match(/^KOSIS\s*:\s*(\S+)/mi);
    if(hit) return hit[1];
  }
  throw new Error('KOSIS_API_KEY가 없습니다. 프로젝트 루트 .dev.vars에 등록하세요.');
}

async function query(key,params){
  const url=new URL('https://kosis.kr/openapi/Param/statisticsParameterData.do');
  const all={method:'getList',apiKey:key,format:'json',jsonVD:'Y',charEncoding:'utf-8',...params};
  Object.entries(all).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const res=await fetch(url,{headers:{Accept:'application/json'}});
  if(!res.ok) throw new Error(`KOSIS HTTP ${res.status}`);
  const data=await res.json();
  if(!Array.isArray(data)) throw new Error(`KOSIS 오류 ${data.err||''}: ${data.errMsg||'알 수 없는 응답'}`);
  return data;
}

export function aggregateSchoolAge(rows){
  const result={};
  for(const row of rows){
    const year=String(row.PRD_DE||'').slice(0,4);
    const age=Number(String(row.C3_NM||row.C2_NM||'').replace(/[^0-9]/g,''));
    const value=Number(String(row.DT||'').replace(/,/g,''));
    if(!/^20\d{2}$/.test(year) || !Number.isFinite(age) || !Number.isFinite(value)) continue;
    result[year] ||= {초:0,중:0,고:0};
    if(age>=6 && age<=11) result[year].초+=value;
    else if(age>=12 && age<=14) result[year].중+=value;
    else if(age>=15 && age<=18) result[year].고+=value;
  }
  for(const value of Object.values(result)){
    value.초=Math.round(value.초/1000);
    value.중=Math.round(value.중/1000);
    value.고=Math.round(value.고/1000);
  }
  return result;
}

async function main(){
  if(process.argv.includes('--help') || process.argv.includes('-h')){
    console.log('쓰는 법: node "open api/bake-kosis.mjs" [KOSIS_API_KEY] [--dry]');
    return;
  }
  const key=getKey();
  const orgId=CONFIG.orgId;
  const ages=AGE_CODES.join('+');

  console.log('KOSIS 주민등록 6~18세(2016~2025) 조회…');
  const actual=await query(key,{
    orgId,tblId:CONFIG.tables.residentAge.tblId,objL1:'47',objL2:ages,
    itmId:CONFIG.tables.residentAge.itemId,prdSe:'Y',startPrdDe:'2016',endPrdDe:'2025'
  });
  console.log(`  ${actual.length}행`);

  console.log('KOSIS 경북 장래 6~18세(2026~2036) 조회…');
  const projected=await query(key,{
    orgId,tblId:CONFIG.tables.projectionAge.tblId,objL1:'37',objL2:'0',objL3:ages,
    itmId:CONFIG.tables.projectionAge.itemId,prdSe:'Y',startPrdDe:'2026',endPrdDe:'2036'
  });
  console.log(`  ${projected.length}행`);

  console.log('KOSIS 경북 시군 출생아(2016~2025) 조회…');
  const birthsRaw=await query(key,{
    orgId,tblId:CONFIG.tables.births.tblId,objL1:'ALL',itmId:CONFIG.tables.births.itemId,
    prdSe:'Y',startPrdDe:'2016',endPrdDe:'2025'
  });
  const births=birthsRaw.filter(r=>r.C1==='37' || /^37\d{3}$/.test(r.C1||''));
  console.log(`  경북 관련 ${births.length}행`);

  const population={...aggregateSchoolAge(actual),...aggregateSchoolAge(projected)};
  const years=Object.keys(population).sort();
  if(years[0]!=='2016' || years.at(-1)!=='2036') throw new Error(`학령인구 연도 범위가 이상합니다: ${years[0]}~${years.at(-1)}`);

  const summary={
    generatedAt:new Date().toISOString(),source:CONFIG.source,orgId,
    populationTables:[CONFIG.tables.residentAge,CONFIG.tables.projectionAge],
    birthsTable:CONFIG.tables.births,population,
    births:births.map(r=>({year:r.PRD_DE,regionCode:r.C1,region:r.C1_NM,value:Number(r.DT),updated:r.LST_CHN_DE}))
  };

  if(DRY){
    console.log(JSON.stringify({years:`${years[0]}~${years.at(-1)}`,population2026:population['2026'],birthRows:summary.births.length},null,2));
    return;
  }

  fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});
  fs.writeFileSync(DATA_FILE,JSON.stringify(summary,null,2)+'\n','utf8');

  let html=fs.readFileSync(TARGET,'utf8');
  const block=`const KOSIS_POP = ${JSON.stringify(population)};`;
  if(/const KOSIS_POP = \{[^;]*\};/.test(html)) html=html.replace(/const KOSIS_POP = \{[^;]*\};/,block);
  else html=html.replace('/* 학령인구 시계열',block+'\n\n/* 학령인구 시계열');
  fs.writeFileSync(TARGET,html,'utf8');
  console.log(`✓ ${path.relative(ROOT,DATA_FILE)} 저장`);
  console.log(`✓ ${path.relative(ROOT,TARGET)} 에 2016~2036 공식 시계열 반영`);
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error('✗ '+e.message);process.exit(1);});
}
