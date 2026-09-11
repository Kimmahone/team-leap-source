/* 최신 Flash 별칭을 먼저 쓰고, 별칭이 아직 배포 환경에서 열리지 않았거나
   응답이 불완전하면 현재 고정형과 직전 고정형으로 내려갑니다. */
const MODELS = ['gemini-flash-latest','gemini-3.8-flash','gemini-3.7-flash'];
const MAX_PROMPT = 12000;
const SYSTEM_PROMPT = '당신은 경상북도 학령인구 공개 데이터를 일반 사용자가 이해하도록 돕는 데이터 해설자입니다. 입력은 현재 필터에 맞춘 JSON이며 입력에 없는 숫자를 만들지 마세요. 단순히 학생·학급·학교 합계를 되풀이하지 말고 actualTrend, scenarios, comparison, signals의 차이를 연결해 이번 조건에서만 성립하는 해석을 작성하세요. comparison.type이 school이면 학교 이름을 2곳 이상 언급하되 통폐합·위험 학교로 단정하지 말고 공개 실적의 확인 순서라고 표현하세요. comparison.type이 region이면 서로 다른 시군을 비교하세요. 반드시 다음 5개 제목을 순서대로 쓰세요: 이번 조건의 핵심 신호, 근거가 되는 비교, 산출 기준이 바뀌면, 다음 확인 자료, 분석 한계. 전체 글머리표는 8개 이상, 한국어 750~1,300자로 작성하고 최소 2개 문장 끝에 [근거: 입력의 필드명과 수치]를 붙이세요. 기준연도 실적과 공식 장래추계가 아닌 모의값을 명확히 구분하고 정책·사업 효과를 추정하거나 개인자료를 요구하지 마세요.';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function json(body, status=200){
  return new Response(JSON.stringify(body), {status, headers});
}

function outputText(data){
  return (typeof data?.output_text==='string' ? data.output_text : (data?.steps||[])
    .filter(step=>step.type==='model_output')
    .flatMap(step=>step.content||[])
    .filter(item=>item.type==='text')
    .map(item=>item.text||'')
    .join('')).trim();
}

function outputQuality(text){
  const value=String(text||'').trim();
  const topics=['이번 조건의 핵심 신호','근거가 되는 비교','산출 기준이 바뀌면','다음 확인 자료','분석 한계'];
  const topicHits=topics.filter(topic=>value.includes(topic)).length;
  const bullets=(value.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/g)||[]).length;
  const evidence=(value.match(/\[근거:/g)||[]).length;
  return {ok:value.length>=600&&topicHits>=4&&bullets>=8&&evidence>=2,length:value.length,topicHits,bullets,evidence};
}

async function requestAnalysis(model, apiKey, prompt){
  let upstream;
  try{
    upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
      // 첫 모델이 응답하지 않을 때 화면이 오래 멈춘 것처럼 보이지 않도록 제한한다.
      // 다음 모델로 내려갈 수 있도록 각 요청은 12초 안에 끝냅니다.
      signal:AbortSignal.timeout(12000),
      body:JSON.stringify({
        model,
        system_instruction:SYSTEM_PROMPT,
        input:prompt,
        generation_config:{thinking_level:'low',max_output_tokens:2200}
      })
    });
  }catch(error){
    return {networkError:error};
  }
  let data={};
  try{ data=await upstream.json(); }catch(_e){}
  return {upstream,data};
}

export async function onRequestPost(context){
  const request=context.request;
  const origin=request.headers.get('Origin');
  if(origin && origin !== new URL(request.url).origin) return json({error:'허용되지 않은 요청입니다.'},403);
  if(!context.env.GEMINI_API_KEY) return json({error:'서버에 Gemini 보안 키가 설정되지 않았습니다.'},503);

  let body;
  try{ body=await request.json(); }
  catch(_e){ return json({error:'요청 형식이 올바르지 않습니다.'},400); }
  const prompt=typeof body.prompt==='string' ? body.prompt.trim() : '';
  if(!prompt || prompt.length>MAX_PROMPT) return json({error:`분석 자료는 1~${MAX_PROMPT}자여야 합니다.`},400);

  let last={};
  let bestBrief=null;
  const tried=[];
  for(let index=0;index<MODELS.length;index++){
    const model=MODELS[index];
    tried.push(model);
    const result=await requestAnalysis(model,context.env.GEMINI_API_KEY,prompt);
    if(result.networkError){
      // 시간 초과·일시적 연결 오류에는 다음 안정 모델을 순서대로 시도합니다.
      if(index<MODELS.length-1) continue;
      if(bestBrief){ delete bestBrief.length; return json(bestBrief); }
      return json({error:result.networkError?.name==='TimeoutError'?'분석 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.':'분석 서비스에 연결하지 못했습니다.'},result.networkError?.name==='TimeoutError'?504:502);
    }
    const {upstream,data}=result;
    const text=upstream.ok ? outputText(data) : '';
    if(text){
      const quality=outputQuality(text);
      const resolvedModel=data?.modelVersion || data?.model_version || data?.model || model;
      const answer={text,model:resolvedModel,requestedModel:model,fallback:index>0,quality:quality.ok?'complete':'brief',modelsTried:[...tried]};
      if(quality.ok) return json(answer);
      if(!bestBrief || quality.length>bestBrief.length) bestBrief={...answer,length:quality.length};
      if(index<MODELS.length-1) continue;
      delete bestBrief.length;
      return json(bestBrief);
    }
    const reason=String(data?.error?.status || (upstream.status===429 ? 'RESOURCE_EXHAUSTED' : `G${upstream.status}`));
    last={upstreamStatus:upstream.status,reason};
    /* 별칭 미지원, 일시 장애, 무료 한도에는 다음 고정 모델을 순서대로 시도합니다. */
    if([400,404,429,500,502,503,504].includes(upstream.status) && index<MODELS.length-1) continue;
    if(bestBrief){ delete bestBrief.length; return json(bestBrief); }
    if(upstream.status===429){
      return json({error:'분석 서비스의 무료 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.',upstreamStatus:upstream.status,reason,modelsTried:tried},429);
    }
    return json({error:`분석 서비스가 요청을 처리하지 못했습니다. 운영 코드: G${upstream.status}`,upstreamStatus:upstream.status,reason,modelsTried:tried},502);
  }
  return json({error:'분석 서비스의 응답을 받지 못했습니다.',...last},502);
}

export async function onRequest(context){
  if(context?.request?.method==='POST') return onRequestPost(context);
  return json({error:'POST 요청만 허용합니다.'},405);
}
