import {onRequestPost,onRequest} from '../functions/api/ai-analysis.js';

let pass=0, fail=0;
const check=(name,ok)=>{ if(ok){pass++;}else{fail++;console.error('✗ '+name);} };
const req=(body={},origin='https://example.test')=>new Request('https://example.test/api/ai-analysis',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});

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
  check('모델·낮은 사고 단계·집계값 전달', requestBody.model==='gemini-3.8-flash' && requestBody.generation_config.thinking_level==='low' && requestBody.input==='집계값');
  check('시스템 지침 전달', requestBody.system_instruction.includes('숫자를 만들지 마세요'));
  return new Response(JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:'근거 기반 분석'}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
const ok=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const data=await ok.json();
check('Gemini 공식 Interactions API 호출', called.endsWith('/v1beta/interactions'));
check('분석문 반환', ok.status===200 && data.text==='근거 기반 분석');
globalThis.fetch=realFetch;

const attempted=[];
globalThis.fetch=async (_url,options)=>{
  attempted.push(JSON.parse(options.body).model);
  if(attempted.length===1) return new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'Content-Type':'application/json'}});
  return new Response(JSON.stringify({output_text:'대체 모드 분석'}),{status:200,headers:{'Content-Type':'application/json'}});
};
const fallback=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const fallbackData=await fallback.json();
check('3.8 무료 한도에서는 3.7을 한 번 대체 시도',
  attempted.join(',')==='gemini-3.8-flash,gemini-3.7-flash' && fallback.status===200 && fallbackData.fallback===true);

globalThis.fetch=async ()=>new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'Content-Type':'application/json'}});
const limited=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const limitedData=await limited.json();
check('두 분석 모드의 무료 한도 초과를 이유와 함께 반환',
  limited.status===429 && limitedData.reason==='RESOURCE_EXHAUSTED' && Array.isArray(limitedData.modelsTried) && /무료 사용량/.test(limitedData.error));
globalThis.fetch=realFetch;

console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail?1:0);
