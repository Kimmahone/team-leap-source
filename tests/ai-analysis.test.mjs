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
  check('키가 인증 헤더로 전달됨', options.headers.Authorization==='Bearer server-secret');
  const requestBody=JSON.parse(options.body);
  check('모델과 집계값 전달', requestBody.model==='gemini-3.7-flash' && requestBody.messages.some(message=>message.content==='집계값'));
  check('시스템 지침 전달', requestBody.messages.some(message=>message.role==='system' && message.content.includes('숫자를 만들지 마세요')));
  return new Response(JSON.stringify({choices:[{message:{content:'근거 기반 분석'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
const ok=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const data=await ok.json();
check('Gemini OpenAI 호환 API 호출', called.endsWith('/v1beta/openai/chat/completions'));
check('분석문 반환', ok.status===200 && data.text==='근거 기반 분석');
globalThis.fetch=realFetch;

console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail?1:0);
