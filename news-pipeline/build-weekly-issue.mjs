#!/usr/bin/env node
/*
 * 매일 모은 news-history.json에서 최근 7일을 읽어 주간 이슈페이퍼 1호를 만듭니다.
 * 같은 기준일에 다시 돌려도 id가 같아 중복되지 않습니다.
 * 기사 전문·요약문은 공개 자산에 저장하지 않고 집계와 근거 기사 메타데이터만 남깁니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const HISTORY=path.join(ROOT,'news-history.json');
const ISSUE_FILE=path.join(ROOT,'06. 실행계획(1)','prototype','assets','news','issues','index.json');
const FORCE=process.argv.includes('--force');
const kstDay=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'}).format(new Date());
if(!FORCE&&kstDay!=='Sun'){
  console.log(`· 오늘은 주간 발행일이 아닙니다 (${kstDay} KST). 뉴스 수집만 유지합니다.`);
  process.exit(0);
}

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
const STOP=new Set('경북 경상북도 경북교육청 교육청 학생 학교 교육 관련 대상 사업 추진 지원 계획 운영 개최 지난 이번 통해 위해 대한 등을 가운데 기자 뉴스 지역 감소 인구 기사'.split(' '));
const GYEONGBUK=/경북|경상북도|포항|경주|김천|안동|구미|영주|영천|상주시|문경|경산|의성|청송|영양군|영덕|청도군|고령군|성주(?!들|신)|칠곡|예천|봉화|울진|울릉/;

function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function write(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
function iso(d){return new Date(d).toISOString().slice(0,10);}
function dateMs(v){const n=new Date(v).getTime();return Number.isFinite(n)?n:NaN;}
function clean(v){return String(v||'').replace(/<[^>]+>/g,' ').replace(/&\w+;/g,' ').replace(/\s+/g,' ').trim();}
function count(values){const m=new Map();for(const v of values)if(v)m.set(v,(m.get(v)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko'));}
function tokens(text){return (clean(text).match(/[\uAC00-\uD7A3A-Za-z0-9]{2,}/g)||[]).map(v=>v.toLowerCase()).map(v=>/^(?:지방)?교육(?:재정)?교부금$|^교부금$/.test(v)?'교육교부금':(v==='개편안'?'개편':v)).filter(v=>!STOP.has(v)&&!/^\d+$/.test(v)&&v.length<18);}
function titleTokens(text){return new Set(tokens(text));}
function similarity(a,b){const A=titleTokens(a),B=titleTokens(b);if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.sqrt(A.size*B.size);}

const history=read(HISTORY,[]).map(a=>({...a,_time:dateMs(a.pubDate)})).filter(a=>Number.isFinite(a._time)).sort((a,b)=>b._time-a._time);
if(!history.length)throw new Error('news-history.json에 날짜를 읽을 수 있는 기사가 없습니다.');
const end=new Date(history[0]._time);end.setHours(23,59,59,999);
const endMs=end.getTime(),startMs=endMs-7*864e5,priorStart=startMs-7*864e5;
/* 수집 파일에는 전국 소규모학교 기사도 들어 있습니다. 주간 경북 이슈페이퍼는
   제목·검색요약에 경북 또는 22개 시군이 명시된 기사만 사용합니다. */
const local=history.filter(a=>GYEONGBUK.test(clean(a.title+' '+a.description)));
const current=local.filter(a=>a._time>startMs&&a._time<=endMs);
const prior=local.filter(a=>a._time>priorStart&&a._time<=startMs);
if(!current.length)throw new Error('최근 7일 기사가 없어 이슈페이퍼를 만들지 않습니다.');

/* 검색요약에는 질의어가 문맥상 한 번 스쳐도 들어옵니다. 주제 비중은 제목에서
   직접 확인되는 신호만 사용해 ‘지역소멸 100%’ 같은 과대 분류를 막습니다. */
function topicsOf(a){const t=clean(a.title);return TOPICS.filter(([,re])=>re.test(t)).map(([n])=>n);}
function regionsOf(a){const t=clean(a.title+' '+a.description);return REGIONS.filter(([,re])=>re.test(t)).map(([n])=>n);}
const priorTopic=new Map(count(prior.flatMap(topicsOf)));
const topicRows=TOPICS.map(([topic])=>{const n=current.filter(a=>topicsOf(a).includes(topic)).length,p=priorTopic.get(topic)||0;return {topic,current:n,prior:p,currentShare:+(n/current.length*100).toFixed(1),priorShare:prior.length?+(p/prior.length*100).toFixed(1):0,changePp:+((n/current.length*100)-(prior.length?p/prior.length*100:0)).toFixed(1)};}).sort((a,b)=>b.current-a.current);
/* 자동 주간호의 키워드는 검색요약문보다 품질이 일정한 기사 제목만 씁니다.
   BIG Kinds 원본이 들어오는 정밀 분석은 별도의 특성추출 키워드를 사용합니다. */
const priorKeys=new Map(count(prior.flatMap(a=>tokens(a.title))));
const keywords=count(current.flatMap(a=>tokens(a.title))).slice(0,18).map(([name,value])=>({name,value,prior:priorKeys.get(name)||0,change:value-(priorKeys.get(name)||0)}));
const regions=count(current.flatMap(regionsOf)).slice(0,10).map(([name,value])=>({name,value}));
const dailyTrend=[];for(let i=6;i>=0;i--){const d=new Date(endMs-i*864e5),key=iso(d),rows=current.filter(a=>iso(a._time)===key);dailyTrend.push({date:key,total:rows.length});}

const groups=[];
for(const article of current){let best=null,score=0;for(const g of groups){const s=similarity(article.title,g[0].title);if(s>score){score=s;best=g;}}if(best&&score>=.34)best.push(article);else groups.push([article]);}
const clusters=groups.filter(g=>g.length>=2).sort((a,b)=>b.length-a.length).slice(0,3).map((g,i)=>({id:`weekly-${i+1}`,label:tokens(g.map(a=>a.title).join(' ')).filter((v,j,arr)=>arr.indexOf(v)===j).slice(0,3).join(' · '),size:g.length,cohesion:+(g.reduce((n,a)=>n+similarity(a.title,g[0].title),0)/g.length).toFixed(2),samples:g.slice(0,3).map(a=>({title:a.title,link:a.link,publishedAt:iso(a._time),press:''}))}));
const top=topicRows[0],topRegion=regions[0];
const period={from:iso(startMs+1),to:iso(endMs),count:current.length};
const issue={
  id:`${period.to}-weekly`,status:'자동 발행',source:'네이버 뉴스 검색 API',publishedAt:period.to,period,
  title:`${top?.topic||'학령인구'} 보도가 이끈 이번 주, 경북 교육의 다음 질문`,
  lead:`이번 주 경북 학령인구 대응 관련 기사는 ${current.length}건입니다. 가장 비중이 큰 주제는 ‘${top?.topic||'학령인구'}’이며, ${topRegion?`${topRegion.name}의 언급이 두드러졌습니다.`:'지역별 관심 변화를 함께 살펴야 합니다.'}`,
  highlights:[
    `최근 7일 ${current.length}건으로 직전 7일 ${prior.length}건보다 ${current.length-prior.length>=0?'+':''}${current.length-prior.length}건 변화했습니다.`,
    `‘${top?.topic||'학령인구'}’ 주제가 ${top?.currentShare||0}%로 가장 큰 비중을 차지했습니다.`,
    topRegion?`${topRegion.name} 언급이 ${topRegion.value}건으로 가장 많았습니다.`:'특정 시군에 언급이 모이지 않았습니다.'
  ],
  topics:topicRows.slice(0,4),keywords,regions,dailyTrend,clusters,
  evidence:current.slice(0,8).map(a=>({title:a.title,link:a.link,publishedAt:iso(a._time),press:''})),
  caveat:'기사량은 사회·정책적 관심의 신호이며 실제 학생 수·학교 수의 증감을 뜻하지 않습니다.',
  review:'자동 집계된 초안으로, 대외 배포 전 담당자의 사실 확인이 필요합니다.'
};
const previous=read(ISSUE_FILE,[]).filter(p=>p&&p.id!==issue.id);
const issues=[issue,...previous].sort((a,b)=>String(b.publishedAt||b.period?.to||'').localeCompare(String(a.publishedAt||a.period?.to||''))).slice(0,52);
issues.forEach((p,i)=>{p.issueNo=issues.length-i;});
write(ISSUE_FILE,issues);
console.log(`✓ 주간 이슈페이퍼 ${issue.id} · ${current.length}건 · 히스토리 ${issues.length}호`);
