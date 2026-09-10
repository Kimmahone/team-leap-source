import {onRequestPost,onRequest} from '../functions/api/ai-analysis.js';

let pass=0, fail=0;
const check=(name,ok)=>{ if(ok){pass++;}else{fail++;console.error('✗ '+name);} };
const req=(body={},origin='https://example.test')=>new Request('https://example.test/api/ai-analysis',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const completeText=`# 학생수 변화
- 2026년 101,176명에서 2030년 68,755명으로 줄어드는 조건입니다.
- 학생 수 변화와 함께 학급 수·학교 수가 어느 방향으로 움직이는지도 같은 기준에서 확인해야 합니다.
# 해석할 때 주의할 점
- 공식 장래추계가 아닌 모의 비교값입니다.
- 지역 간 이동과 학교별 학년 차이는 반영하지 않았으므로 실제 배치 계획과 동일하게 읽으면 안 됩니다.
# 함께 비교할 질문
- 시군별 출생아 수와 전입·전출 실적을 더하면 변화폭이 큰 지역의 순서가 달라지는가?
- 학급당 학생 수가 줄어드는 동안 통학 거리와 학교급별 최소 학급을 함께 지킬 수 있는가?
# 더 살펴볼 공개자료
- KOSIS의 시군별 출생아 수, 연령별 주민등록인구와 국내 전입·전출 자료를 같은 기간으로 맞춰 확인합니다.
- 학교알리미의 여러 해 학년별 학생 수와 학교별 학급 수를 함께 놓고 변화가 일시적인지 확인합니다.
# 분석 한계
- 공개된 시군·학교급 집계값만 사용했으며 개별 학교의 통폐합 가능성이나 정책 사업 효과를 추정하지 않았습니다.
- 정책 판단 전에는 해당 시군과 학교의 최신 원자료, 통학 여건, 시설 수용 능력을 다시 확인해야 합니다.`;

check('GET 차단', (await onRequest({request:new Request('https://example.test/api/ai-analysis')})).status===405);
check('다른 출처 차단', (await onRequestPost({request:req({prompt:'x'},'https://evil.test'),env:{GEMINI_API_KEY:'test'}})).status===403);
check('서버 키 미설정 안내', (await onRequestPost({request:req({prompt:'x'}),env:{}})).status===503);
check('빈 프롬프트 차단', (await onRequestPost({request:req({prompt:''}),env:{GEMINI_API_KEY:'test'}})).status===400);

const realFetch=globalThis.fetch;
let called='';
globalThis.fetch=async (url,options)=>{
  called=String(url);
  check('키가 공식 x-goog-api-key 헤더로 전달됨', options.headers['x-goog-api-key']==='server-secret');
  const requestBody=JSON.parse(options.body);
  check('모델·낮은 사고 단계·집계값 전달', requestBody.model==='gemini-flash-latest' && requestBody.generation_config.thinking_level==='low' && requestBody.input==='집계값');
  check('시스템 지침 전달', requestBody.system_instruction.includes('숫자를 만들지 마세요'));
  return new Response(JSON.stringify({modelVersion:'gemini-3.8-flash',steps:[{type:'model_output',content:[{type:'text',text:completeText}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
const ok=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const data=await ok.json();
check('Gemini 공식 Interactions API 호출', called.endsWith('/v1beta/interactions'));
check('완성도 기준을 넘은 분석문과 실제 사용 모델 반환', ok.status===200 && data.text===completeText && data.quality==='complete' && data.model==='gemini-3.8-flash');
globalThis.fetch=realFetch;

const attempted=[];
globalThis.fetch=async (_url,options)=>{
  attempted.push(JSON.parse(options.body).model);
  if(attempted.length===1) return new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'Content-Type':'application/json'}});
  return new Response(JSON.stringify({modelVersion:'gemini-3.8-flash',output_text:completeText}),{status:200,headers:{'Content-Type':'application/json'}});
};
const fallback=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const fallbackData=await fallback.json();
// 맨 앞은 gemini-flash-latest 별칭입니다. 별칭이 한도에 걸리면 고정 모델로 내려갑니다.
check('별칭이 무료 한도에 걸리면 고정 모델(3.8)로 한 번 대체 시도',
  attempted.join(',')==='gemini-flash-latest,gemini-3.8-flash' && fallback.status===200 && fallbackData.fallback===true && fallbackData.model==='gemini-3.8-flash');

const briefAttempts=[];
globalThis.fetch=async (_url,options)=>{
  const model=JSON.parse(options.body).model;
  briefAttempts.push(model);
  return new Response(JSON.stringify({modelVersion:model,output_text:'짧은 응답 '+model}),{status:200,headers:{'Content-Type':'application/json'}});
};
const brief=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const briefData=await brief.json();
check('응답이 너무 짧으면 최신 모델부터 세 모델을 순서대로 시도하고 brief로 표시',
  briefAttempts.join(',')==='gemini-flash-latest,gemini-3.8-flash,gemini-3.7-flash' && briefData.quality==='brief');

globalThis.fetch=async ()=>new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'Content-Type':'application/json'}});
const limited=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const limitedData=await limited.json();
check('세 분석 모델의 무료 한도 초과를 이유와 함께 반환',
  limited.status===429 && limitedData.reason==='RESOURCE_EXHAUSTED' && Array.isArray(limitedData.modelsTried) && /무료 사용량/.test(limitedData.error));
globalThis.fetch=realFetch;

console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail?1:0);
