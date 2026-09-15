import {onRequestPost,onRequest,sanitizeAnalysisText} from '../functions/api/ai-analysis.js';

let pass=0, fail=0;
const check=(name,ok)=>{ if(ok){pass++;}else{fail++;console.error('✗ '+name);} };
const req=(body={},origin='https://example.test')=>new Request('https://example.test/api/ai-analysis',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const completeText=`# 이번 조건의 핵심 신호
- 포항시 초등학생은 2026년 22,431명에서 2040년 모의 14,216명으로 8,215명 줄어드는 조건이며, 공개 실적과 모의값은 구분해서 읽어야 합니다. [근거: totals.studentChange -8215명]
- 학생 수는 감소하지만 현재 산출 기준에서는 학교 수가 69교에서 119교로 늘어납니다. 이는 미래 학교 수 예측이 아니라 학년당 학급 상한을 적용한 산술 결과입니다. [근거: totals.simulatedSchools 119교]
# 근거가 되는 비교
- 포항초등학교와 두호초등학교는 학교별 공개 실적에서 감소 인원이 먼저 확인되는 학교이며, 지원 또는 통폐합 후보라는 뜻은 아닙니다.
- 2016~2025년 EDSS 실적 추이와 학교알리미 2026 공시를 연결해 감소가 한 해의 변동인지 장기 흐름인지 따로 확인해야 합니다.
# 산출 기준이 바뀌면
- 학교·학급 유지 기준은 기존 규모 안에서 학급당 평균 학생 수가 얼마나 줄어드는지를 보여줍니다.
- 학급당 학생 수 기준과 학년당 학급 수 기준은 같은 학생 수에도 필요한 학급·학교 수를 다르게 계산하므로 세 결과의 범위를 함께 봐야 합니다.
# 다음 확인 자료
- 포항시 읍면동별 출생아 수와 전입·전출을 추가하면 학생 감소가 어느 통학권에 집중되는지 확인할 수 있습니다.
- 학교알리미의 학년별 학생 수와 통학 거리, 시설 수용 여건을 함께 확인한 뒤 실제 배치 검토로 넘어가야 합니다.
# 분석 한계
- 2040년 값은 공식 장래 학생 수 추계가 아니며 지역 간 이동과 학교별 미래 배치를 반영하지 않았습니다.
- 학교 이름은 공개 실적 변화의 확인 순서만 제시하며 정책 사업 효과나 통폐합 가능성을 추정하지 않습니다.`;

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
  check('시스템 지침이 실적·시나리오·학교 비교를 근거 중심으로 요구',
    requestBody.system_instruction.includes('actualTrend') &&
    requestBody.system_instruction.includes('comparison.type이 school') &&
    requestBody.system_instruction.includes('절대로 출력하지 마세요') &&
    requestBody.system_instruction.includes('통폐합·위험 학교로 단정하지 말고'));
  return new Response(JSON.stringify({modelVersion:'gemini-3.8-flash',steps:[{type:'model_output',content:[{type:'text',text:completeText}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
const ok=await onRequestPost({request:req({prompt:'집계값'}),env:{GEMINI_API_KEY:'server-secret'}});
const data=await ok.json();
check('Gemini 공식 Interactions API 호출', called.endsWith('/v1beta/interactions'));
check('완성도 기준을 넘은 자연어 분석문과 실제 사용 모델 반환', ok.status===200 && data.text===sanitizeAnalysisText(completeText) && data.quality==='complete' && data.model==='gemini-3.8-flash');
check('필드 경로와 근거 꼬리표는 응답에 노출되지 않는다', !/\[근거:|totals\./.test(data.text) && /포항시 초등학생/.test(data.text));
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
