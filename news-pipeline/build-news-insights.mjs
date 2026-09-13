#!/usr/bin/env node
/* 매일 수집한 네이버 뉴스에서 3일마다 이슈 분석과 이슈페이퍼를 함께 만듭니다.
   마지막 성공일을 파일에서 읽으므로 월말에도 정확한 간격을 지키고,
   예약 실행이 늦거나 빠져도 다음 일일 실행에서 자동으로 보충합니다. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
function arg(name,fallback){const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?path.resolve(process.argv[i+1]):fallback;}
function valueArg(name,fallback){const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;}
const DEST=arg('--dest',path.join(ROOT,'06. 실행계획(1)','prototype','assets','news'));
const HISTORY=arg('--history',path.join(ROOT,'news-history.json'));
const FORCE=process.argv.includes('--force');
const CADENCE_DAYS=3,SNAPSHOT_MAX=40,ISSUE_MAX=52;

const TOPICS=[
  ['통폐합·적정규모',/폐교|통폐합|통합 ?운영|적정규모|분교|소규모 ?학교|작은 ?학교/],
  ['교육재정',/교부금|교육재정|교육 ?예산|내국세/],
  ['교원·정원',/교원|교사 ?수|배치 ?기준|임용 ?절벽/],
  ['통학·돌봄',/통학|스쿨버스|돌봄|늘봄|기숙/],
  ['지역소멸·인구',/지역소멸|인구감소|저출생|저출산|학령인구|학생 ?수 ?감소/],
  ['교육혁신·특구',/교육발전특구|교육혁신|미래교육|농어촌 ?유학|자유학구제/]
];
const REGIONS=[
  ['포항시',/포항/],['경주시',/경주/],['김천시',/김천/],['안동시',/안동/],['구미시',/구미/],['영주시',/영주/],
  ['영천시',/영천/],['상주시',/상주/],['문경시',/문경/],['경산시',/경산/],['의성군',/의성/],['청송군',/청송/],
  ['영양군',/영양군/],['영덕군',/영덕/],['청도군',/청도군/],['고령군',/고령군/],['성주군',/성주(?!들|신)/],
  ['칠곡군',/칠곡/],['예천군',/예천/],['봉화군',/봉화/],['울진군',/울진/],['울릉군',/울릉/]
];
const GYEONGBUK=/경북|경상북도|포항|경주|김천|안동|구미|영주|영천|문경|경산|의성|청송|영덕|성주(?!들|신)|칠곡|예천|봉화|울진|울릉|고령군|영양군|상주시|청도군/;
const STOP=new Set('경북 경상북도 경북교육청 교육청 학생 학교 교육 관련 대상 사업 추진 지원 계획 운영 개최 지난 이번 통해 위해 대한 등을 가운데 기자 뉴스 지역 감소 인구 기사 교사 대구'.split(' '));

function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function write(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
function clean(v){return String(v||'').replace(/<[^>]+>/g,' ').replace(/&(?:quot|apos|amp|lt|gt|nbsp);/g,' ').replace(/\s+/g,' ').trim();}
function zonedDay(date){const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
function todayKst(){return zonedDay(new Date());}
function dayOf(v){const d=new Date(v);return Number.isFinite(d.getTime())?zonedDay(d):'';}
function dayMs(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(v+'T12:00:00Z').getTime():NaN;}
function shift(v,n){return new Date(dayMs(v)+n*864e5).toISOString().slice(0,10);}
function gap(a,b){return Math.floor((dayMs(b)-dayMs(a))/864e5);}
function inDays(a,from,to){return a.publishedAt>=from&&a.publishedAt<=to;}
function count(values){const map=new Map();for(const v of values)if(v)map.set(v,(map.get(v)||0)+1);return [...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko'));}
function tokens(text){return (clean(text).match(/[가-힣A-Za-z0-9]{2,}/g)||[]).map(v=>v.toLowerCase()).filter(v=>!STOP.has(v)&&!/^\d+$/.test(v)&&v.length<18);}
function pressOf(link){try{return new URL(link).hostname.replace(/^www\./,'');}catch{return '';}}

function normalize(history){
  return history.map((a,i)=>{
    const title=clean(a.title),description=clean(a.description),text=title+' '+description,publishedAt=dayOf(a.pubDate);
    const topics=TOPICS.filter(([,re])=>re.test(title)).map(([name])=>name);
    return {id:String(a.link||i),title,link:String(a.originallink||a.link||''),press:pressOf(a.originallink||a.link),publishedAt,local:GYEONGBUK.test(text),
      topics,regions:REGIONS.filter(([,re])=>re.test(text)).map(([name])=>name),keywords:tokens(title)};
  }).filter(a=>a.publishedAt&&a.title&&a.local&&a.topics.length).map(({local,...a})=>a)
    .sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
}

function weeklyTrend(items,anchor,weeks=12){
  const out=[];
  for(let i=weeks-1;i>=0;i--){const to=shift(anchor,-i*7),from=shift(to,-6),rows=items.filter(a=>inDays(a,from,to));out.push({from,to,total:rows.length,topics:Object.fromEntries(TOPICS.map(([name])=>[name,rows.filter(a=>a.topics.includes(name)).length]))});}
  return out;
}
function normalizeVector(v){let norm=0;for(const x of v.values())norm+=x*x;norm=Math.sqrt(norm)||1;for(const [k,x] of v)v.set(k,x/norm);return v;}
function cosine(a,b){let small=a,big=b;if(a.size>b.size){small=b;big=a;}let sum=0;for(const [k,v] of small)sum+=v*(big.get(k)||0);return sum;}
function similarityClusters(items){
  const docs=items.map((article,index)=>({article,index,tokens:article.keywords})).filter(d=>d.tokens.length);
  if(!docs.length)return {method:'기사 제목 TF-IDF 벡터화 → 코사인 유사도 0.28 이상 묶음',documents:0,clusterCount:0,grouped:0,unclustered:0,threshold:.28,clusters:[]};
  const df=new Map();for(const d of docs)for(const token of new Set(d.tokens))df.set(token,(df.get(token)||0)+1);
  for(const d of docs){const tf=new Map();for(const t of d.tokens)tf.set(t,(tf.get(t)||0)+1);d.vector=normalizeVector(new Map([...tf].map(([t,n])=>[t,(1+Math.log(n))*(1+Math.log((docs.length+1)/((df.get(t)||0)+1)))])));}
  const threshold=.28,groups=[];
  for(const d of docs){let chosen=null,score=-1;for(const group of groups){const s=cosine(d.vector,group.centroid);if(s>score){score=s;chosen=group;}}if(!chosen||score<threshold){groups.push({members:[d],centroid:new Map(d.vector)});continue;}chosen.members.push(d);const next=new Map();for(const member of chosen.members)for(const [t,v] of member.vector)next.set(t,(next.get(t)||0)+v/chosen.members.length);chosen.centroid=normalizeVector(next);}
  const clusters=groups.filter(g=>g.members.length>=2).map((g,i)=>{const keys=[...g.centroid].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k),topic=count(g.members.flatMap(d=>d.article.topics))[0]?.[0]||'기타',ranked=g.members.map(d=>({d,score:cosine(d.vector,g.centroid)})).sort((a,b)=>b.score-a.score),cohesion=ranked.reduce((n,r)=>n+r.score,0)/ranked.length;return {id:`rolling-${i+1}`,label:[topic,...keys.slice(0,2)].join(' · '),keywords:keys,size:g.members.length,share:+(g.members.length/docs.length*100).toFixed(1),cohesion:+cohesion.toFixed(2),samples:ranked.slice(0,3).map(({d,score})=>({id:d.article.id,title:d.article.title,link:d.article.link,publishedAt:d.article.publishedAt,press:d.article.press,similarity:+score.toFixed(2)}))};}).sort((a,b)=>b.size-a.size||b.cohesion-a.cohesion).slice(0,6);
  const grouped=clusters.reduce((n,c)=>n+c.size,0);return {method:`기사 제목 TF-IDF 벡터화 → 코사인 유사도 ${threshold} 이상 묶음`,documents:docs.length,clusterCount:clusters.length,grouped,unclustered:docs.length-grouped,threshold,clusters};
}

function topicRows(current,prior){return TOPICS.map(([topic])=>{const now=current.filter(a=>a.topics.includes(topic)).length,before=prior.filter(a=>a.topics.includes(topic)).length,nowShare=current.length?now/current.length*100:0,beforeShare=prior.length?before/prior.length*100:0;return {topic,current:now,prior:before,currentShare:+nowShare.toFixed(1),priorShare:+beforeShare.toFixed(1),changePp:+(nowShare-beforeShare).toFixed(1)};}).sort((a,b)=>b.currentShare-a.currentShare);}
function makeSnapshot(items,anchor){
  const from=shift(anchor,-29),priorTo=shift(from,-1),priorFrom=shift(priorTo,-29),current=items.filter(a=>inDays(a,from,anchor)),prior=items.filter(a=>inDays(a,priorFrom,priorTo));
  const priorKeys=new Map(count(prior.flatMap(a=>a.keywords))),priorRegions=new Map(count(prior.flatMap(a=>a.regions)));
  const keywordCloud=count(current.flatMap(a=>a.keywords)).slice(0,32).map(([name,value])=>({name,value,prior:priorKeys.get(name)||0,change:value-(priorKeys.get(name)||0)}));
  const regionCounts=count(current.flatMap(a=>a.regions));
  return {id:`${anchor}-naver-rolling`,sourceKind:'naver-rolling',source:'네이버 뉴스 검색 API · 3일 주기 분석',generatedAt:new Date().toISOString(),cadenceDays:CADENCE_DAYS,
    basis:'기사량은 사회적 관심의 신호이며 실제 학생 수·학교 수의 증감을 뜻하지 않습니다.',anchorDate:anchor,totalArticles:items.length,coverage:{from:items.at(-1)?.publishedAt||'',to:items[0]?.publishedAt||''},
    currentPeriod:{from,to:anchor,count:current.length},priorPeriod:{from:priorFrom,to:priorTo,count:prior.length},topics:topicRows(current,prior),weeklyTrend:weeklyTrend(items,anchor),
    keywords:keywordCloud.slice(0,20),keywordCloud,regions:regionCounts.slice(0,22).map(([name,value])=>({name,value})),regionSignals:regionCounts.map(([name,currentValue])=>({name,current:currentValue,prior:priorRegions.get(name)||0,change:currentValue-(priorRegions.get(name)||0)})),
    similarity:similarityClusters(current),evidence:current.filter(a=>a.link).slice(0,8).map(({id,title,link,publishedAt,press,topics})=>({id,title,link,publishedAt,press,topics}))};
}
function makeIssue(items,anchor,snapshot){
  const from=shift(anchor,-6),priorTo=shift(from,-1),priorFrom=shift(priorTo,-6),current=items.filter(a=>inDays(a,from,anchor)),prior=items.filter(a=>inDays(a,priorFrom,priorTo));
  if(!current.length)throw new Error('최근 7일 경북 관련 기사가 없어 이슈페이퍼를 만들지 않습니다.');
  const topics=topicRows(current,prior),priorKeys=new Map(count(prior.flatMap(a=>a.keywords))),keywords=count(current.flatMap(a=>a.keywords)).slice(0,18).map(([name,value])=>({name,value,prior:priorKeys.get(name)||0,change:value-(priorKeys.get(name)||0)})),regions=count(current.flatMap(a=>a.regions)).slice(0,10).map(([name,value])=>({name,value})),top=topics[0],topRegion=regions[0];
  const dailyTrend=[];for(let i=6;i>=0;i--){const date=shift(anchor,-i);dailyTrend.push({date,total:current.filter(a=>a.publishedAt===date).length});}
  return {id:`${anchor}-three-day`,status:'자동 발행',source:'네이버 뉴스 검색 API',sourceKind:'naver-three-day',cadenceDays:CADENCE_DAYS,publishedAt:anchor,period:{from,to:anchor,count:current.length},
    title:`${top?.topic||'학령인구'} 보도가 이끈 최근 7일, 경북 교육의 다음 질문`,lead:`최근 7일 경북 학령인구 대응 관련 기사는 ${current.length}건입니다. 가장 비중이 큰 주제는 ‘${top?.topic||'학령인구'}’이며, ${topRegion?`${topRegion.name}의 언급이 두드러졌습니다.`:'특정 시군보다 도 단위 논의가 중심입니다.'}`,
    highlights:[`최근 7일 ${current.length}건으로 직전 7일 ${prior.length}건보다 ${current.length-prior.length>=0?'+':''}${current.length-prior.length}건 변화했습니다.`,`‘${top?.topic||'학령인구'}’ 주제가 ${top?.currentShare||0}%로 가장 큰 비중을 차지했습니다.`,topRegion?`${topRegion.name} 언급이 ${topRegion.value}건으로 가장 많았습니다.`:'특정 시군에 언급이 모이지 않았습니다.'],
    topics,keywords,regions,dailyTrend,clusters:snapshot.similarity.clusters.slice(0,3),evidence:current.filter(a=>a.link).slice(0,8).map(({title,link,publishedAt,press})=>({title,link,publishedAt,press})),caveat:snapshot.basis,review:'자동 집계된 초안으로, 대외 배포 전 담당자의 사실 확인이 필요합니다.'};
}

const anchor=valueArg('--date',todayKst());if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor))throw new Error('--date는 YYYY-MM-DD 형식이어야 합니다.');
const snapshotFile=path.join(DEST,'snapshot.json'),snapshotIndex=path.join(DEST,'snapshots','index.json'),issueFile=path.join(DEST,'issues','index.json');
let snapshots=read(snapshotIndex,[]);const legacy=read(snapshotFile,null),manifest=read(path.join(DEST,'manifest.json'),{});
if(!snapshots.length&&legacy)snapshots.push({...legacy,id:legacy.id||`${legacy.anchorDate}-bigkinds`,sourceKind:legacy.sourceKind||'bigkinds',source:legacy.source||manifest.source||'BIG Kinds 뉴스 검색·분석',generatedAt:legacy.generatedAt||manifest.generatedAt||'',cadenceDays:null});
const last=snapshots.filter(s=>s.sourceKind==='naver-rolling').sort((a,b)=>String(b.anchorDate).localeCompare(String(a.anchorDate)))[0];
if(!FORCE&&last&&gap(last.anchorDate,anchor)<CADENCE_DAYS){console.log(`· 이슈 분석·이슈페이퍼는 3일 주기입니다. 마지막 생성 ${last.anchorDate}, 다음 예정 ${shift(last.anchorDate,CADENCE_DAYS)}.`);process.exit(0);}
const items=normalize(read(HISTORY,[]));if(!items.length)throw new Error('분석할 경북 뉴스가 없습니다.');
const snapshot=makeSnapshot(items,anchor),issue=makeIssue(items,anchor,snapshot);
snapshots=[snapshot,...snapshots.filter(s=>s&&s.id!==snapshot.id)].sort((a,b)=>String(b.anchorDate||'').localeCompare(String(a.anchorDate||''))).slice(0,SNAPSHOT_MAX);snapshots.forEach((s,i)=>{s.historyNo=snapshots.length-i;});
let issues=read(issueFile,[]);issues=[issue,...issues.filter(p=>p&&p.id!==issue.id)].sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||''))).slice(0,ISSUE_MAX);issues.forEach((p,i)=>{p.issueNo=issues.length-i;});
write(snapshotFile,snapshot);write(snapshotIndex,snapshots);write(issueFile,issues);
console.log(`✓ 3일 이슈 분석 ${snapshot.id} · 최근 30일 ${snapshot.currentPeriod.count}건 · 히스토리 ${snapshots.length}회`);
console.log(`✓ 3일 이슈페이퍼 ${issue.id} · 최근 7일 ${issue.period.count}건 · 히스토리 ${issues.length}호`);
