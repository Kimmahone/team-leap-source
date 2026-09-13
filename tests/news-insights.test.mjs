import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SCRIPT=path.join(ROOT,'news-pipeline','build-news-insights.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'team-leap-news-insights-'));
const dest=path.join(tmp,'assets','news');
const historyFile=path.join(tmp,'news-history.json');
fs.mkdirSync(path.join(dest,'issues'),{recursive:true});

const rows=[];
const add=(date,index,title)=>rows.push({
  title,
  link:`https://news.example/${index}`,
  originallink:`https://press.example/${index}`,
  description:`경북 ${title}`,
  pubDate:new Date(`${date}T00:00:00+09:00`).toUTCString()
});
[
  ['2026-09-13','포항 소규모학교 통폐합 대응 논의'],
  ['2026-09-12','포항 소규모학교 통폐합 대응 확대'],
  ['2026-09-11','안동 학령인구 학생 수 감소 대책'],
  ['2026-09-10','구미 농어촌 작은 학교 통학 지원'],
  ['2026-09-09','경주 교육재정 교부금 대응'],
  ['2026-09-08','영주 교원 배치 기준 논의'],
  ['2026-09-07','문경 교육발전특구 미래교육 추진'],
  ['2026-09-06','김천 소규모학교 통폐합 논의'],
  ['2026-09-05','의성 학령인구 학생 수 감소'],
  ['2026-08-25','예천 농어촌 작은 학교 돌봄 확대'],
  ['2026-08-20','봉화 교원 배치 기준 개선'],
  ['2026-08-15','울진 교육재정 교부금 대책']
].forEach((r,i)=>add(r[0],i+1,r[1]));
fs.writeFileSync(historyFile,JSON.stringify(rows,null,2));
fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({source:'BIG Kinds',counts:{analysisReady:1,curated:1}}));
fs.writeFileSync(path.join(dest,'snapshot.json'),JSON.stringify({
  id:'2026-09-07-bigkinds',anchorDate:'2026-09-07',source:'BIG Kinds 뉴스 검색·분석',
  currentPeriod:{from:'2026-08-09',to:'2026-09-07',count:1},priorPeriod:{from:'2026-07-10',to:'2026-08-08',count:0},
  topics:[],weeklyTrend:[],keywordCloud:[],regions:[],regionSignals:[],similarity:{method:'TF-IDF + cosine similarity',clusters:[]},evidence:[],basis:'검사용'
}));
fs.writeFileSync(path.join(dest,'issues','index.json'),'[]');

function run(date,force=false){
  const args=[SCRIPT,'--dest',dest,'--history',historyFile,'--date',date];
  if(force)args.push('--force');
  return spawnSync(process.execPath,args,{encoding:'utf8'});
}
const read=rel=>JSON.parse(fs.readFileSync(path.join(dest,rel),'utf8'));

const first=run('2026-09-13',true);
assert.equal(first.status,0,first.stderr);
assert.match(first.stdout,/3일 이슈 분석/);
assert.equal(read('snapshot.json').id,'2026-09-13-naver-rolling');
assert.deepEqual(read('snapshots/index.json').map(s=>s.id),['2026-09-13-naver-rolling','2026-09-07-bigkinds']);
assert.equal(read('issues/index.json')[0].id,'2026-09-13-three-day');
assert.equal(read('issues/index.json')[0].cadenceDays,3);
assert.ok(read('snapshot.json').similarity.clusters.length>0);

const skipped=run('2026-09-14');
assert.equal(skipped.status,0,skipped.stderr);
assert.match(skipped.stdout,/다음 예정 2026-09-16/);
assert.equal(read('snapshots/index.json').length,2);
assert.equal(read('issues/index.json').length,1);

const next=run('2026-09-16');
assert.equal(next.status,0,next.stderr);
assert.deepEqual(read('snapshots/index.json').slice(0,2).map(s=>s.anchorDate),['2026-09-16','2026-09-13']);
assert.deepEqual(read('issues/index.json').map(p=>p.publishedAt),['2026-09-16','2026-09-13']);

const publicText=fs.readFileSync(path.join(dest,'snapshot.json'),'utf8')+fs.readFileSync(path.join(dest,'issues','index.json'),'utf8');
assert.doesNotMatch(publicText,/"(?:description|body|content|persons)"\s*:/);
console.log('✓ 3일 주기 이슈 분석·이슈페이퍼 생성 검사 통과');
