#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : fallback;
}

const RAW = arg('--raw', path.join(HERE, 'raw'));
const DEST = arg('--dest', path.join(ROOT, '06. 실행계획(1)', 'prototype', 'assets', 'news'));
const WORK = arg('--work', path.join(HERE, 'work'));

const TOPICS = [
  ['통폐합·적정규모', /폐교|학교[^.]{0,20}통폐합|통폐합[^.]{0,20}학교|통합 ?운영|적정규모|분교|학교 ?통합|소규모 ?학교|나홀로 ?입학|신입생 ?0명|입학생 ?0명/],
  ['교육재정', /교부금|교육재정|교육 ?예산|학교[^.]{0,20}예산|예산[^.]{0,20}학교/],
  ['교원·정원', /교원|정원|교사 ?수|배치 ?기준|공무원 ?정원|임용 ?절벽/],
  ['통학·돌봄', /통학|스쿨버스|돌봄|기숙/],
  ['지역소멸·인구', /지역소멸|인구감소|소멸위험|저출생|저출산|학령인구|학생수 ?감소/],
  ['교육혁신·특구', /교육발전특구|교육혁신|미래교육|늘봄|작은학교 ?살리기|농어촌 ?유학|자유학구제/]
];

const REGIONS = [
  ['포항시', /포항/], ['경주시', /경주/], ['김천시', /김천/], ['안동시', /안동/],
  ['구미시', /구미/], ['영주시', /영주/], ['영천시', /영천/], ['상주시', /상주/],
  ['문경시', /문경/], ['경산시', /경산/], ['의성군', /의성/], ['청송군', /청송/],
  ['영양군', /영양(?!사)/], ['영덕군', /영덕/], ['청도군', /청도/], ['고령군', /고령(?!화)/],
  ['성주군', /성주(?!들|신)/], ['칠곡군', /칠곡/], ['예천군', /예천/], ['봉화군', /봉화/],
  ['울진군', /울진/], ['울릉군', /울릉/]
];

/* 경북 지역 언론의 기사이거나 기사 안에 경북·22개 시군이 있어야 합니다.
   원본 검색 결과에는 전국 교육 기사와 대구 단독 기사가 함께 들어옵니다. */
const GYEONGBUK = /경북|경상북도|포항|경주|김천|안동|구미|영주|영천|문경|경산|의성|청송|영덕|성주(?!들|신)|칠곡|예천|봉화|울진|울릉|고령군|영양군|상주시|청도군/;
const GYEONGBUK_PRESS = /경북|매일신문|영남일보|대구일보|대경일보|경북도민일보|경북매일/;
const DAEGU_ONLY = /대구시교육청|대구광역시교육청|대구 달서|대구 수성|대구 중구|대구 남구|대구 서구|대구 북구|대구 동구/;
const K12_SIGNAL = /학령인구|학생 ?수|초등|중학교|고등학교|유치원|특수학교|소규모 ?학교|폐교|통폐합|분교|교원|교사|통학|돌봄|늘봄|교육발전특구|저출생|저출산|지역소멸|학교 ?신설|학급|교부금|교육재정/;
const HIGHER_ED_ONLY = /대학교|대학(?!교)|수시 ?모집|정시 ?모집|수능|학과|전형|합격자|입학사정/;
const DEMOGRAPHIC_OVERRIDE = /학령인구|학생 ?수[^.]{0,15}(?:감소|증가|변화)|지역소멸|저출생|저출산|초등|중학교|고등학교|유치원|교육청|교원/;

const STOP = new Set([
  '관계자','이날','지난해','올해','내년','최근','이번','그동안','대부분','다양한','통해','위해',
  '대한','관련','사업','행사','개최','사진','기자','대상','가운데','주요','추진','강화','마련',
  '진행','운영','지원','계획','실시','참여','확대','노력','발표','예정','선정','제공','조성',
  '뉴스','보도','결과','내용','경북','경상북도','학생','학교','교육'
]);

const VECTOR_STOP = new Set([
  ...STOP, '학생들','학년도','대구','교육부','교육청','경북도','경북교육청','경상북도교육청',
  '지역','전국','정부','교육감','학교는','학생은','학교가','학생이','학교의','학생의'
]);

function clean(v) {
  return String(v ?? '').replace(/<[^>]+>/g, ' ').replace(/&(?:quot|amp|lt|gt);/g, ' ')
    .replace(/\[[^\]]{1,15}\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function value(row, names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const exact = row[name];
    if (exact !== undefined && exact !== null && String(exact).trim()) return String(exact).trim();
    const key = keys.find(k => k.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
    if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return '';
}

function day(v) {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim().replace(/[./]/g, '-');
  const compact = s.replace(/\D/g, '').slice(0, 8);
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

function list(v) {
  return clean(v).split(/[,;|]/).map(clean).filter(Boolean);
}

function topKeywords(v) {
  const seen = new Set();
  return list(v).filter(w => {
    const key = w.replace(/\s+/g, '');
    if (key.length < 2 || /^\d+$/.test(key) || STOP.has(key) || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 12);
}

function idFor(article) {
  const key = article.link || `${article.publishedAt}|${article.press}|${article.title}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, data) { ensure(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); }

function parseRow(row) {
  const excluded = value(row, ['분석제외 여부','분석제외여부','제외여부']);
  if (/^(예|Y)$/i.test(excluded)) return null;
  const title = clean(value(row, ['제목','기사제목','title']));
  const publishedAt = day(value(row, ['일자','날짜','작성일','보도일자','pubDate']));
  if (!title || !publishedAt) return null;
  /* 빅카인즈 변환 1판과 같은 범위를 봅니다. 본문 전체를 분류에 쓰면 뒤쪽에
     스쳐 나온 단어 하나 때문에 주제가 과하게 붙고, 재생성 결과도 달라집니다. */
  const body = clean(value(row, ['본문','기사본문','내용','특성추출(가중치순 상위 50개)','description'])).slice(0, 240);
  const keywordRaw = value(row, ['특성추출(가중치순 상위 50개)','키워드']);
  const locationRaw = value(row, ['위치','개체명(지역)','지역']);
  const orgRaw = value(row, ['기관','개체명(기관)']);
  const press = clean(value(row, ['언론사','매체사','press','media']));
  const text = `${title} ${body} ${locationRaw} ${keywordRaw}`;
  const mentionsGyeongbuk = GYEONGBUK.test(`${title} ${body} ${locationRaw}`);
  if (DAEGU_ONLY.test(`${title} ${body} ${locationRaw}`) && !mentionsGyeongbuk) return null;
  if (!mentionsGyeongbuk && !GYEONGBUK_PRESS.test(press)) return null;
  let topics = TOPICS.filter(([, re]) => re.test(text)).map(([name]) => name);
  const headlineTopics = TOPICS.filter(([,re])=>re.test(title)).map(([name])=>name);
  /* 기사라기보다 수상·인사 명단인 짧은 알림은 학교명 속 '분교' 같은 낱말로
     통폐합 기사로 오인하지 않습니다. 원자료에는 남기되 6대 주제에서는 뺍니다. */
  if (!clean(value(row, ['URL','url','링크','link','originallink'])) && title.length < 8 && /훈장|포상|인사/.test(title)) topics = [];
  const regions = REGIONS.filter(([, re]) => re.test(`${title} ${body} ${locationRaw}`)).map(([name]) => name);
  const article = {
    title,
    link: clean(value(row, ['URL','url','링크','link','originallink'])),
    publishedAt,
    press,
    topics,headlineTopics,
    regions,
    keywords: topKeywords(keywordRaw),
    analysisRelevant:mentionsGyeongbuk&&K12_SIGNAL.test(title)&&(!HIGHER_ED_ONLY.test(title)||DEMOGRAPHIC_OVERRIDE.test(title))
  };
  article.id = idFor(article);
  return article;
}

function dedupe(rows) {
  const urls = new Set(), titles = new Set(), out = [];
  for (const row of rows) {
    const titleKey = `${row.publishedAt}|${row.title.replace(/[^가-힣0-9a-z]/gi,'').toLowerCase().slice(0,25)}`;
    if ((row.link && urls.has(row.link)) || titles.has(titleKey)) continue;
    if (row.link) urls.add(row.link);
    titles.add(titleKey); out.push(row);
  }
  return out;
}

function count(items, getter) {
  const map = new Map();
  for (const item of items) for (const key of getter(item)) map.set(key, (map.get(key) || 0) + 1);
  return [...map].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

function isoDay(ms) { return new Date(ms).toISOString().slice(0,10); }
function dateMs(v) { return new Date(`${v}T00:00:00Z`).getTime(); }

function weeklyTrend(items, latest, weeks=12) {
  const anchor=dateMs(latest), weekday=(new Date(anchor).getUTCDay()+6)%7;
  const thisMonday=anchor-weekday*864e5;
  const out=[];
  for(let i=weeks-1;i>=0;i--){
    const from=thisMonday-i*7*864e5, to=Math.min(from+7*864e5,anchor+864e5);
    const rows=items.filter(a=>{const t=dateMs(a.publishedAt);return t>=from&&t<to;});
    out.push({
      from:isoDay(from),to:isoDay(to-864e5),total:rows.length,
      topics:Object.fromEntries(TOPICS.map(([topic])=>[topic,rows.filter(a=>a.topics.includes(topic)).length]))
    });
  }
  return out;
}

function vectorTokens(article) {
  const title=(article.title.toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[]);
  const keywords=(article.keywords||[]).flatMap(k=>String(k).toLowerCase().split(/\s+/));
  return [...title,...keywords].map(v=>v.replace(/[^가-힣a-z0-9]/g,''))
    .filter(v=>v.length>=2&&!/^\d+$/.test(v)&&!VECTOR_STOP.has(v));
}

function normalizeVector(v) {
  let norm=0; for(const value of v.values()) norm+=value*value;
  norm=Math.sqrt(norm)||1; for(const [key,value] of v) v.set(key,value/norm);
  return v;
}

function cosine(a,b) {
  let small=a,big=b;if(a.size>b.size){small=b;big=a;}
  let sum=0;for(const [key,value] of small)sum+=value*(big.get(key)||0);return sum;
}

/* 제목과 BIG Kinds 특성추출 키워드를 희소 TF-IDF 벡터로 만든 뒤,
   코사인 유사도를 쓰는 결정론적 k-means로 비슷한 기사를 묶습니다.
   외부 AI 서비스나 기사 본문 공개 없이 같은 원본에서 재현할 수 있습니다. */
function similarityClusters(items) {
  const docs=items.map((article,index)=>({article,index,tokens:vectorTokens(article)})).filter(d=>d.tokens.length);
  if(!docs.length)return {method:'TF-IDF + cosine similarity',documents:0,clusters:[]};
  const df=new Map();
  for(const d of docs)for(const token of new Set(d.tokens))df.set(token,(df.get(token)||0)+1);
  for(const d of docs){
    const tf=new Map();for(const token of d.tokens)tf.set(token,(tf.get(token)||0)+1);
    d.vector=normalizeVector(new Map([...tf].map(([token,n])=>[token,(1+Math.log(n))*(1+Math.log((docs.length+1)/((df.get(token)||0)+1)))])));
  }
  const threshold=.28,groups=[];
  for(const d of docs){
    let chosen=null,score=-1;
    for(const group of groups){const s=cosine(d.vector,group.centroid);if(s>score){score=s;chosen=group;}}
    if(!chosen||score<threshold){groups.push({members:[d],centroid:new Map(d.vector)});continue;}
    chosen.members.push(d);
    const next=new Map();for(const member of chosen.members)for(const [token,value] of member.vector)next.set(token,(next.get(token)||0)+value/chosen.members.length);
    chosen.centroid=normalizeVector(next);
  }
  const clusters=groups.filter(group=>group.members.length>=2).map((group,i)=>{
    const {members,centroid}=group;
    const keywords=[...centroid].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko')).slice(0,4).map(([name])=>name);
    const dominantTopic=count(members,d=>d.article.topics).at(0)?.[0]||'기타';
    const ranked=members.map(d=>({d,score:cosine(d.vector,centroid)})).sort((a,b)=>b.score-a.score||a.d.index-b.d.index);
    const cohesion=ranked.reduce((n,r)=>n+r.score,0)/ranked.length;
    return {
      id:`cluster-${i+1}`,label:[dominantTopic,...keywords.slice(0,2)].join(' · '),keywords,size:members.length,
      share:+(members.length/docs.length*100).toFixed(1),cohesion:+cohesion.toFixed(2),
      samples:ranked.slice(0,3).map(({d,score})=>({
        id:d.article.id,title:d.article.title,link:d.article.link,publishedAt:d.article.publishedAt,
        press:d.article.press,similarity:+score.toFixed(2)
      }))
    };
  }).sort((a,b)=>b.size-a.size||b.cohesion-a.cohesion).slice(0,6);
  const grouped=clusters.reduce((n,c)=>n+c.size,0);
  return {
    method:`제목·BIG Kinds 특성추출 키워드 TF-IDF 벡터화 → 코사인 유사도 ${threshold} 이상 묶음`,
    documents:docs.length,clusterCount:clusters.length,grouped,unclustered:docs.length-grouped,threshold,clusters
  };
}

function makeSnapshot(items) {
  const latest = items[0]?.publishedAt || '';
  const anchor = latest ? new Date(`${latest}T00:00:00Z`) : new Date();
  const end = anchor.getTime() + 864e5;
  const currentStart = end - 30 * 864e5;
  const priorStart = currentStart - 30 * 864e5;
  const inRange = (a, from, to) => {
    const t = new Date(`${a.publishedAt}T00:00:00Z`).getTime();
    return t >= from && t < to;
  };
  const current = items.filter(a => inRange(a, currentStart, end));
  const prior = items.filter(a => inRange(a, priorStart, currentStart));
  const topicRows = TOPICS.map(([topic]) => {
    const now = current.filter(a => a.topics.includes(topic)).length;
    const before = prior.filter(a => a.topics.includes(topic)).length;
    const nowShare = current.length ? now / current.length * 100 : 0;
    const beforeShare = prior.length ? before / prior.length * 100 : 0;
    return { topic, current: now, prior: before, currentShare:+nowShare.toFixed(1), priorShare:+beforeShare.toFixed(1), changePp:+(nowShare-beforeShare).toFixed(1) };
  }).sort((a,b) => b.currentShare - a.currentShare);
  const priorKeywords=new Map(count(prior,a=>a.keywords));
  const keywordCloud=count(current,a=>a.keywords).slice(0,32).map(([name,value])=>({name,value,prior:priorKeywords.get(name)||0,change:value-(priorKeywords.get(name)||0)}));
  const priorRegions=new Map(count(prior,a=>a.regions));
  const regionSignals=count(current,a=>a.regions).map(([name,value])=>({name,current:value,prior:priorRegions.get(name)||0,change:value-(priorRegions.get(name)||0)}));
  return {
    basis: '기사량은 사회적 관심의 신호이며 실제 학생 수·학교 수의 증감을 뜻하지 않습니다.',
    anchorDate: latest,
    currentPeriod: { from:new Date(currentStart).toISOString().slice(0,10), to:latest, count:current.length },
    priorPeriod: { from:new Date(priorStart).toISOString().slice(0,10), to:new Date(currentStart-864e5).toISOString().slice(0,10), count:prior.length },
    topics: topicRows,
    weeklyTrend:weeklyTrend(items,latest,12),
    keywords: keywordCloud.slice(0,20),
    keywordCloud,
    regions: count(current, a => a.regions).slice(0,22).map(([name,value]) => ({name,value})),
    regionSignals,
    similarity:similarityClusters(current),
    evidence: current.filter(a => a.link).slice(0,8).map(({id,title,link,publishedAt,press,topics}) => ({id,title,link,publishedAt,press,topics}))
  };
}

function makeNetwork(items) {
  const nodeCounts = count(items, a => [...a.regions, ...a.keywords]);
  const keep = new Set(nodeCounts.slice(0,50).map(([name]) => name));
  const edge = new Map();
  for (const a of items) {
    const words = [...new Set([...a.regions, ...a.keywords].filter(w => keep.has(w)))].slice(0,10);
    for (let i=0;i<words.length;i++) for (let j=i+1;j<words.length;j++) {
      const key = [words[i],words[j]].sort().join('\u0000'); edge.set(key,(edge.get(key)||0)+1);
    }
  }
  return {
    nodes: nodeCounts.slice(0,50).map(([id,value]) => ({id,value,kind:REGIONS.some(([r]) => r===id)?'시군':'키워드'})),
    links: [...edge].sort((a,b)=>b[1]-a[1]).slice(0,180).map(([key,value]) => { const [source,target]=key.split('\u0000'); return {source,target,value}; })
  };
}

function main() {
  if (!fs.existsSync(RAW)) throw new Error(`원본 폴더가 없습니다: ${RAW}`);
  const files = fs.readdirSync(RAW).filter(f => /\.(xlsx|xls|csv)$/i.test(f)).sort();
  if (!files.length) throw new Error(`원본 파일이 없습니다: ${RAW}`);
  const parsed = [], sources = [];
  for (const name of files) {
    const file = path.join(RAW, name);
    const book = xlsx.readFile(file, {cellDates:true});
    const sheet = book.Sheets[book.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);
    for (const row of rows) { const item = parseRow(row); if (item) parsed.push(item); }
    sources.push({file:name,bytes:fs.statSync(file).size,rows:rows.length,sha256:sha(file)});
  }
  const all = dedupe(parsed).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt));
  const curated = all.filter(a => a.topics.length);
  const analysis = curated.filter(a=>a.analysisRelevant&&a.headlineTopics.length).map(({analysisRelevant,headlineTopics,...article})=>({...article,topics:headlineTopics}));
  fs.rmSync(DEST, {recursive:true,force:true}); ensure(DEST);
  fs.rmSync(WORK, {recursive:true,force:true}); ensure(WORK);

  const years = [...new Set(curated.map(a => a.publishedAt.slice(0,4)))].sort();
  const outputFiles = [];
  for (const year of years) {
    const rows = curated.filter(a => a.publishedAt.startsWith(year));
    /* 전체 기사 목록은 내부 검증·추가 분석용입니다. 공개 사이트에는 최근 집계와
       소수의 근거 기사만 두고, 연도별 목록은 gitignore 된 work에 남깁니다. */
    const file = path.join(WORK, 'archive', `${year}.json`); writeJson(file, rows);
  }
  const snapshot = makeSnapshot(analysis); writeJson(path.join(DEST,'snapshot.json'),snapshot);
  const network = makeNetwork(analysis); writeJson(path.join(DEST,'network.json'),network);
  const issue = {
    id:`${snapshot.anchorDate}-recent-30d`, status:'prototype',
    title:`최근 30일 경북 학령인구 뉴스 이슈 브리프`,
    period:snapshot.currentPeriod,
    lead:`최근 기사에서 ‘${snapshot.topics[0]?.topic || '학령인구'}’ 관련 보도가 가장 큰 비중을 보였습니다. 기사량은 정책 관심의 신호로만 읽고 학생 수 실적과는 구분해야 합니다.`,
    topics:snapshot.topics.slice(0,3), keywords:snapshot.keywords.slice(0,8),
    clusters:snapshot.similarity.clusters.slice(0,3),
    evidence:snapshot.evidence.slice(0,5),
    caveat:snapshot.basis,
    review:'발행 전 담당자의 사실 확인과 문장 검토가 필요합니다.'
  };
  writeJson(path.join(DEST,'issues','index.json'),[issue]);

  for (const rel of ['snapshot.json','network.json','issues/index.json']) {
    const file=path.join(DEST,rel); outputFiles.push({path:rel,bytes:fs.statSync(file).size,sha256:sha(file)});
  }
  const manifest = {
    schemaVersion:1, generatedAt:new Date().toISOString(), source:'BIG Kinds 뉴스 검색·분석',
    coverage:{from:curated.at(-1)?.publishedAt || '',to:curated[0]?.publishedAt || ''},
    counts:{sourceRows:sources.reduce((n,s)=>n+s.rows,0),deduplicated:all.length,curated:curated.length,analysisReady:analysis.length},
    topics:Object.fromEntries(count(analysis,a=>a.topics)), years:Object.fromEntries(count(analysis,a=>[a.publishedAt.slice(0,4)]).sort((a,b)=>a[0].localeCompare(b[0]))),
    analysisMethod:{
      scope:'경북·시군 + 제목의 초중등 학령인구 직접 신호 + 제목의 6대 주제',
      vectorization:'기사 제목·BIG Kinds 특성추출 키워드 TF-IDF',similarity:'cosine',threshold:.28,
      populationComparison:'EDSS 2016~2025 초·중·고 학생 수 변화율; 인과·예측으로 사용하지 않음'
    },
    publicFields:['집계값','근거기사 제목','근거기사 링크','발행일','언론사','주제','시군','키워드'],
    excludedFields:['본문','기사본문','description','persons'], files:outputFiles
  };
  writeJson(path.join(DEST,'manifest.json'),manifest);
  writeJson(path.join(HERE,'source-manifest.json'),{generatedAt:manifest.generatedAt,source:'BIG Kinds',sources});
  console.log(`원본 ${manifest.counts.sourceRows.toLocaleString()}행 → 중복 제거 ${all.length.toLocaleString()}건 → 6대 주제 ${curated.length.toLocaleString()}건 → 분석 적합 ${analysis.length.toLocaleString()}건`);
  console.log(`공개 산출물: ${DEST}`);
  console.log(`내부 연도별 목록: ${path.join(WORK,'archive')} (GitHub·배포 제외)`);
}

main();
