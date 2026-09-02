/* 공공데이터 서버에 「한 번 물어보고 안 되면 포기」하지 않기 위한 공통 도구입니다.

   ★ 〔2026. 9. 2.〕 정기 갱신이 이것 때문에 죽었습니다.

       KOSIS 주민등록 6~18세(2016~2025) 조회…
       ✗ fetch failed

     `fetch failed` 는 HTTP 오류가 아닙니다. 연결 자체를 못 맺었다는 뜻입니다
     (DNS·TLS·연결 끊김). 깃허브 러너는 미국에서 도는데, 국내 공공데이터
     서버는 해외 IP 를 이따금 늦게 받거나 그냥 끊습니다. 사람이 손으로 돌리면
     되는데 새벽 자동 실행만 실패하는 것이 이 때문입니다.

     자료가 잘못된 것이 아니라 그냥 한 번 튕긴 것이므로, 몇 초 쉬었다가 다시
     물어보면 대개 됩니다. 그런데도 매번 「Run failed」 메일이 날아왔습니다.

   두 가지를 합니다.
     1) 모든 요청에 시간 제한을 겁니다. 예전에는 서버가 대답을 안 하면 그냥
        매달려 있었습니다.
     2) 잠깐 탈이 난 것으로 보이면 쉬었다가 다시 물어봅니다. 2초 → 4초 → 8초.

   다시 묻지 않는 경우도 분명히 정해 둡니다. 인증키가 틀렸거나(401·403)
   주소가 없으면(404) 백 번 물어도 같은 대답이 옵니다. 그건 사람이 고쳐야
   하는 일이라 곧바로 알립니다 — 조용히 시간만 끌면 오히려 못 알아챕니다. */

/* ★ 〔2026. 9. 2.〕 재시도를 넣고도 또 죽었습니다. 까닭을 보니 이렇습니다.

     05:35 실행 — 네 번 모두 «정확히 10.5초» 만에 실패
     05:37 실행 — 같은 코드, 같은 키로 1.7초 만에 130행 정상 수신

   10.5초는 연결을 기다리는 기본 제한시간입니다. 거절당한 것이 아니라
   부르는 소리 자체가 무시된 것입니다 — 방화벽이 그 러너의 IP 를 통째로
   버렸습니다. 그러니 «같은 러너 안에서는» 백 번을 물어도 소용이 없습니다.
   IP 가 그대로이기 때문입니다.

   그래서 이것과 「잠깐 탈이 난 것」을 갈라 놓아야 합니다.
     · 잠깐 탈  → 여기서 다시 물어보면 됩니다.
     · IP 차단 → 여기서는 답이 없습니다. 새 러너에서 다시 해야 합니다.
   뒤쪽은 자료가 틀린 것도, 우리가 잘못한 것도 아닙니다. 그래서 「실패」로
   끝내 메일을 보내는 대신, 종료코드 75 로 「닿지 않았다」고만 알립니다.
   워크플로가 그 신호를 보고 새 러너에서 한 번 더 돌립니다. */
export const EX_UNREACHABLE = 75;

/* 이 프로세스에서 서버가 «한 번이라도» 대답했는지. 한 번도 없었다면
   자료가 없는 게 아니라 길이 막힌 것입니다. */
let responded = false;
export const sawAnyResponse = () => responded;

/* 「길이 막혔다」로 볼 코드들. 모두 주고받기 전에 끊긴 경우입니다. */
const UNREACHABLE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND',
  'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE',
  'TimeoutError', 'ConnectTimeoutError'
]);

export function isUnreachable(e) {
  for (let c = e; c; c = c.cause) {
    if (UNREACHABLE_CODES.has(c.code) || UNREACHABLE_CODES.has(c.name)) return true;
  }
  return false;
}

/* 스크립트 끝에서 부릅니다. 길이 막힌 것이면 75, 진짜 탈이면 1 입니다. */
export function exitFor(e) {
  return (isUnreachable(e) || !responded) ? EX_UNREACHABLE : 1;
}

/* 한 번 요청에 허용하는 시간. 학교알리미·KOSIS 는 느릴 때 20초를 넘깁니다. */
export const TIMEOUT_MS = 45000;

/* 다시 물어볼 만한 HTTP 상태. 서버가 잠깐 지쳤거나(5xx) 너무 자주
   불렀거나(429) 시간이 다 된(408) 경우입니다. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* `fetch failed` 다섯 글자만 남으면 무엇이 문제인지 알 수가 없습니다.
   진짜 까닭은 e.cause 안에 코드로 들어 있습니다.
     ECONNREFUSED     — 문은 찾았는데 안 열어 줍니다
     ENOTFOUND        — 주소를 못 찾습니다 (DNS)
     UND_ERR_CONNECT_TIMEOUT — 부르는데 대답조차 없습니다. 10초.
       ★ 이게 나오면 방화벽이 우리 IP 를 통째로 무시하고 있다는 뜻입니다.
         깃허브 러너(미국)에서 국내 공공데이터를 부를 때 이따금 이렇습니다.
         재시도해도 같은 러너·같은 IP 라 소용이 없습니다. */
function why(e) {
  const parts = [];
  for (let c = e; c; c = c.cause) {
    const tag = c.code || c.name || c.message;
    if (tag && !parts.includes(tag)) parts.push(tag);
  }
  return parts.join(' ← ') || String(e);
}

/* 시간 제한만 걸린 fetch 입니다. 이미 제 나름의 재시도를 가진 곳
   (bake-coords · bake-students · bake-special · bake-demographics) 은
   재시도가 겹치지 않도록 이것만 씁니다. */
export async function fetchWithTimeout(url, init = {}, timeoutMs = TIMEOUT_MS) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  responded = true;                 // 대답이 왔습니다 — 길은 뚫려 있습니다
  return res;
}

/* 시간 제한 + 재시도. 재시도가 없던 곳은 이것으로 바꿉니다.
   opts.tries 는 「모두 몇 번 물어보나」입니다 (처음 한 번을 포함). */
export async function fetchRetry(url, init = {}, opts = {}) {
  const tries = opts.tries ?? 4;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const baseDelay = opts.baseDelay ?? 2000;
  const say = opts.say || (msg => console.warn('  ⟳ ' + msg));

  let lastErr;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(baseDelay * 2 ** (i - 1));      // 2초 → 4초 → 8초
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!RETRYABLE_STATUS.has(res.status) || i === tries - 1) return res;
      /* 다시 물어볼 것이므로 받다 만 응답을 버립니다.
         안 버리면 연결이 열린 채로 남습니다. */
      try { await res.body?.cancel(); } catch (e) { /* 이미 닫혔으면 그만 */ }
      say(`HTTP ${res.status} — ${i + 1}번째, 쉬었다가 다시 물어봅니다`);
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
      if (i === tries - 1) break;
      /* AbortSignal.timeout 은 TimeoutError 라는 이름으로 옵니다. */
      const said = e.name === 'TimeoutError' ? `${timeoutMs / 1000}초 안에 대답이 없습니다` : why(e);
      say(`${said} — ${i + 1}번째, 쉬었다가 다시 물어봅니다`);
    }
  }
  /* 몇 번을 물어도 안 됐다면 그때는 진짜 탈입니다. 그대로 알립니다. */
  throw new Error(`${tries}번 물어봤지만 닿지 않았습니다: ${lastErr ? why(lastErr) : '까닭을 모릅니다'}`, { cause: lastErr });
}

/* 받아서 JSON 으로 풀기까지 한 번에. 대부분의 부르는 자리가 이 모양입니다. */
export async function fetchJson(url, init = {}, opts = {}) {
  const res = await fetchRetry(url, init, opts);
  return res.json();
}
