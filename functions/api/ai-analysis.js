/* 운영 모델은 3.7 Flash를 우선하되, 무료 사용량이 닫히면 3.6 Flash로 한 번만 대체 시도합니다.
   둘 모델이 다 닫히면 더 반복하지 않아 사용자의 한도를 더 쓰지 않습니다. */
const MODELS = ['gemini-3.7-flash','gemini-3.6-flash'];
const MAX_PROMPT = 12000;
const SYSTEM_PROMPT = '당신은 경상북도 교육정책 분석 보조자입니다. 제공된 집계값만 분석하고 숫자를 만들지 마세요. 실적과 모의 예측을 명확히 구분하고, 한계·추가 확인자료·정책 검토 질문을 한국어 제목과 글머리표로 간결하게 제시하세요. 개인자료를 요구하지 마세요.';

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

async function requestAnalysis(model, apiKey, prompt){
  let upstream;
  try{
    upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
      signal:AbortSignal.timeout(30000),
      body:JSON.stringify({
        model,
        system_instruction:SYSTEM_PROMPT,
        input:prompt,
        generation_config:{thinking_level:'low',max_output_tokens:1200}
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
  for(let index=0;index<MODELS.length;index++){
    const model=MODELS[index];
    const result=await requestAnalysis(model,context.env.GEMINI_API_KEY,prompt);
    if(result.networkError){
      return json({error:result.networkError?.name==='TimeoutError'?'분석 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.':'분석 서비스에 연결하지 못했습니다.'},result.networkError?.name==='TimeoutError'?504:502);
    }
    const {upstream,data}=result;
    const text=upstream.ok ? outputText(data) : '';
    if(text) return json({text,model,fallback:index>0});
    const reason=String(data?.error?.status || (upstream.status===429 ? 'RESOURCE_EXHAUSTED' : `G${upstream.status}`));
    last={upstreamStatus:upstream.status,reason};
    /* 3.7의 무료 한도일 때만 3.6으로 대체하고, 나머지 오류는 즉시 보고합니다. */
    if(upstream.status===429 && index<MODELS.length-1) continue;
    if(upstream.status===429){
      return json({error:'분석 서비스의 무료 사용량 한도에 도달했습니다. 잠시 후 다시 시도하세요.',upstreamStatus:upstream.status,reason,modelsTried:MODELS},429);
    }
    return json({error:`분석 서비스가 요청을 처리하지 못했습니다. 운영 코드: G${upstream.status}`,upstreamStatus:upstream.status,reason,modelsTried:MODELS.slice(0,index+1)},502);
  }
  return json({error:'분석 서비스의 응답을 받지 못했습니다.',...last},502);
}

export async function onRequest(context){
  if(context?.request?.method==='POST') return onRequestPost(context);
  return json({error:'POST 요청만 허용합니다.'},405);
}
