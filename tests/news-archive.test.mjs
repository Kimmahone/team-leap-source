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
const publicText=['manifest.json','snapshot.json','snapshots/index.json','network.json','issues/index.json'].map(rel=>fs.readFileSync(path.join(DIR,rel),'utf8')).join('\n');
check('공개 자료에 본문·요약·인물 필드가 없다',!/["'](?:description|body|content|persons)["']\s*:/.test(publicText));
check('최근 비교 자료가 있다',fs.existsSync(path.join(DIR,'snapshot.json')));
const snapshot=read('snapshot.json');
const snapshots=read('snapshots/index.json');
check('이슈 분석 히스토리가 있다',Array.isArray(snapshots)&&snapshots.length>0);
check('현재 분석은 히스토리의 최신 항목이다',snapshot.id===snapshots[0].id);
check('분석 이력은 최신순이며 최대 40회다',snapshots.length<=40&&snapshots.every((s,i)=>!i||String(snapshots[i-1].anchorDate)>=String(s.anchorDate)));
check('분석 이력에 기준일·출처가 있다',snapshots.every(s=>s.id&&s.anchorDate&&s.source&&s.currentPeriod?.from&&s.currentPeriod?.to));
check('최근 12주 경향 자료가 있다',Array.isArray(snapshot.weeklyTrend)&&snapshot.weeklyTrend.length===12);
check('워드클라우드용 키워드가 있다',Array.isArray(snapshot.keywordCloud)&&snapshot.keywordCloud.length>=12);
check('키워드에 직전 기간 비교값이 있다',snapshot.keywordCloud.every(k=>Number.isFinite(k.value)&&Number.isFinite(k.prior)&&Number.isFinite(k.change)));
check('시군 뉴스 증감 자료가 있다',Array.isArray(snapshot.regionSignals)&&snapshot.regionSignals.every(r=>Number.isFinite(r.current)&&Number.isFinite(r.prior)));
check('TF-IDF·코사인 유사도 군집 계산 결과가 있다',/TF-IDF/.test(snapshot.similarity?.method||'')&&/코사인/.test(snapshot.similarity?.method||'')&&Array.isArray(snapshot.similarity.clusters));
check('분석 이력 중 유사 보도 군집 근거가 있다',snapshots.some(s=>(s.similarity?.clusters||[]).length>0));
check('유사도 군집은 기사 수와 근거 기사를 가진다',snapshot.similarity.clusters.every(c=>c.size>=2&&c.samples.length>0&&Number.isFinite(c.cohesion)));
const issues=read('issues/index.json');
check('발행 이력이 있는 이슈페이퍼가 있다',issues.length>0);
check('이슈페이퍼는 발행일·출처·기간을 가진다',issues.every(p=>p.publishedAt&&p.source&&p.period?.from&&p.period?.to));
check('이슈페이퍼는 최신순이며 최대 52호다',issues.length<=52&&issues.every((p,i)=>!i||String(issues[i-1].publishedAt)>=String(p.publishedAt)));
check('네이버 자동 이슈페이퍼는 3일 주기라고 기록한다',issues.some(p=>p.sourceKind==='naver-three-day'&&p.cadenceDays===3));
check('3일 주기 이슈페이퍼는 기사형 요약과 시각화 자료를 가진다',issues.some(p=>Array.isArray(p.highlights)&&p.highlights.length>=3&&Array.isArray(p.topics)&&Array.isArray(p.keywords)));
check('관계망은 처음 화면을 막지 않는 별도 파일이다',fs.statSync(path.join(DIR,'network.json')).size<2_000_000);

const html=fs.readFileSync(path.join(ROOT,'06. 실행계획(1)','prototype','index.html'),'utf8');
check('최신 뉴스·이슈 분석·이슈페이퍼를 구분한다',
  /data-news-view="latest"/.test(html)&&/data-news-view="analysis"/.test(html)&&/data-news-view="papers"/.test(html));
check('빅카인즈 자료는 분석 화면을 열 때만 불러온다',
  /function loadArchive\(\)/.test(html)&&/fetch\('assets\/news\/snapshot\.json'\)/.test(html)&&/fetch\('assets\/news\/snapshots\/index\.json'\)/.test(html));
check('최신 자동수집과 빅카인즈 아카이브를 같은 배열로 합치지 않는다',
  /출처와 갱신 주기가 달라\s+같은 배열로 합치지 않습니다/.test(html));
check('기사량을 학생 수 변화로 읽지 않도록 화면에 적는다',/사회적 관심의 신호/.test(JSON.stringify(read('snapshot.json'))));
check('경향·워드클라우드·다빈도 키워드·벡터 군집을 한 화면에 둔다',/최근 12주 보도 경향/.test(html)&&/핵심 키워드 워드클라우드/.test(html)&&/다빈도 키워드/.test(html)&&/벡터 유사도 기반 기사 군집/.test(html));
check('뉴스와 EDSS 학생 수 변화를 쉽게 나란히 보되 예측으로 오해시키지 않는다',/뉴스에서 많이 언급된 지역, 학생 수는 어떻게 변했나/.test(html)&&/뉴스 증가가 학생 감소의 원인이라는 의미도/.test(html)&&/EDSS 코호트 모형/.test(html));
check('이슈페이퍼는 히스토리 선택과 인쇄를 지원한다',/news-paper-select/.test(html)&&/news-paper-print/.test(html)&&/print-news-paper/.test(html));
check('이슈 분석도 날짜별 히스토리를 선택할 수 있다',/news-analysis-select/.test(html)&&/지난 이슈 분석/.test(html));
check('최신 뉴스 쪽 번호는 현재 쪽 주변에 최소 5개를 표시한다',/windowSize = Math\.min\(5, pageCount\)/.test(html));
check('뉴스 필터는 기간과 주제를 따로 표시한다',/news-filter-label[^>]*>기간</.test(html)&&/news-filter-label[^>]*[^>]*for="news-topic"[^>]*>주제</.test(html));
check('12주 경향은 기사 수 단위와 수치 툴팁을 제공한다',/기사 수\(건\)/.test(html)&&/data-news-tip/.test(html)&&/wireTrendTooltips/.test(html));
check('이슈페이퍼 표제에서 TEAM LEAP을 제외한다',/paper-brand">경북 학령인구 뉴스 브리프</.test(html));

console.log(`✓ 뉴스 인계·공개자료 검사 통과 ${pass} · 실패 ${fail}`);
process.exit(fail?1:0);
