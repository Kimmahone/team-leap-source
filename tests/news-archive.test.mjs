import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '06. 실행계획(1)', 'prototype', 'assets', 'news');
const WORK = path.join(ROOT, 'news-pipeline', 'work', 'archive');
let pass=0, fail=0;
const check=(name,ok,why='')=>{ if(ok) pass++; else { fail++; console.error(`  FAIL ${name}${why?' — '+why:''}`); } };
const read=rel=>JSON.parse(fs.readFileSync(path.join(DIR,rel),'utf8'));

check('뉴스 공개 manifest가 있다',fs.existsSync(path.join(DIR,'manifest.json')));
const manifest=read('manifest.json');
check('공개 필드 목록이 있다',Array.isArray(manifest.publicFields)&&manifest.publicFields.length>0);
check('기사 본문 계열 필드를 제외한다고 적었다',manifest.excludedFields.includes('본문')&&manifest.excludedFields.includes('description'));

const years=Object.keys(manifest.years||{}), rows=[];
check('공개 자산에 전체 연도별 기사 목록이 없다',!fs.existsSync(path.join(DIR,'archive')));
if(fs.existsSync(WORK)){
  for(const year of years){
    const file=path.join(WORK,`${year}.json`);
    check(`${year} 내부 연도 파일이 있다`,fs.existsSync(file));
    rows.push(...JSON.parse(fs.readFileSync(file,'utf8')));
  }
  check('내부 연도 파일 합계가 manifest와 같다',rows.length===manifest.counts.curated,`${rows.length}/${manifest.counts.curated}`);
  check('내부 기사 ID가 중복되지 않는다',new Set(rows.map(r=>r.id)).size===rows.length);
  check('내부 기사는 제목·날짜·주제가 있다',rows.every(r=>r.title&&/^\d{4}-\d{2}-\d{2}$/.test(r.publishedAt)&&Array.isArray(r.topics)&&r.topics.length));
}
const publicText=['manifest.json','snapshot.json','network.json','issues/index.json'].map(rel=>fs.readFileSync(path.join(DIR,rel),'utf8')).join('\n');
check('공개 자료에 본문·요약·인물 필드가 없다',!/["'](?:description|body|content|persons)["']\s*:/.test(publicText));
check('최근 비교 자료가 있다',fs.existsSync(path.join(DIR,'snapshot.json')));
const snapshot=read('snapshot.json');
check('최근 12주 경향 자료가 있다',Array.isArray(snapshot.weeklyTrend)&&snapshot.weeklyTrend.length===12);
check('워드클라우드용 키워드가 있다',Array.isArray(snapshot.keywordCloud)&&snapshot.keywordCloud.length>=12);
check('키워드에 직전 기간 비교값이 있다',snapshot.keywordCloud.every(k=>Number.isFinite(k.value)&&Number.isFinite(k.prior)&&Number.isFinite(k.change)));
check('시군 뉴스 증감 자료가 있다',Array.isArray(snapshot.regionSignals)&&snapshot.regionSignals.every(r=>Number.isFinite(r.current)&&Number.isFinite(r.prior)));
check('TF-IDF·코사인 유사도 군집이 있다',/TF-IDF/.test(snapshot.similarity?.method||'')&&/코사인/.test(snapshot.similarity?.method||'')&&snapshot.similarity.clusters.length>0);
check('유사도 군집은 기사 수와 근거 기사를 가진다',snapshot.similarity.clusters.every(c=>c.size>=2&&c.samples.length>0&&Number.isFinite(c.cohesion)));
check('이슈페이퍼 프로토타입이 있다',read('issues/index.json').length>0);
check('관계망은 처음 화면을 막지 않는 별도 파일이다',fs.statSync(path.join(DIR,'network.json')).size<2_000_000);

const html=fs.readFileSync(path.join(ROOT,'06. 실행계획(1)','prototype','index.html'),'utf8');
check('최신 뉴스·이슈 분석·이슈페이퍼를 구분한다',
  /data-news-view="latest"/.test(html)&&/data-news-view="analysis"/.test(html)&&/data-news-view="papers"/.test(html));
check('빅카인즈 자료는 분석 화면을 열 때만 불러온다',
  /function loadArchive\(\)/.test(html)&&/fetch\('assets\/news\/snapshot\.json'\)/.test(html));
check('최신 자동수집과 빅카인즈 아카이브를 같은 배열로 합치지 않는다',
  /출처와 갱신 주기가 달라 같은 배열로 합치지 않습니다/.test(html));
check('기사량을 학생 수 변화로 읽지 않도록 화면에 적는다',/사회적 관심의 신호/.test(JSON.stringify(read('snapshot.json'))));
check('경향·워드클라우드·다빈도 키워드·벡터 군집을 한 화면에 둔다',/최근 12주 보도 경향/.test(html)&&/핵심 키워드 워드클라우드/.test(html)&&/다빈도 키워드/.test(html)&&/벡터 유사도 기반 기사 군집/.test(html));
check('뉴스와 EDSS 학생 수 변화를 함께 보되 예측으로 오해시키지 않는다',/시군 뉴스 신호 × 실제 학생 수 변화/.test(html)&&/인과관계나 예측 결과는 아닙니다/.test(html)&&/EDSS 코호트 모형/.test(html));

console.log(`✓ 뉴스 인계·공개자료 검사 통과 ${pass} · 실패 ${fail}`);
process.exit(fail?1:0);
