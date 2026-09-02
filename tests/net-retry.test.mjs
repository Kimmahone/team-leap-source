/* 「한 번 튕겨도 다시 물어보는가」를 봅니다.

   ★ 〔2026. 9. 2.〕 KOSIS 가 한 번 `fetch failed` 를 냈다고 정기 갱신 전체가
     죽고 「Run failed」 메일이 왔습니다. 다시 물어보기만 했으면 됐을 일입니다.
     그래서 여기서는 진짜 서버를 하나 띄워 놓고, 일부러 몇 번 넘어뜨립니다. */

import http from 'node:http';
import { fetchRetry, isUnreachable, exitFor, sawAnyResponse, EX_UNREACHABLE } from '../open api/net.mjs';

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else { fail++; console.error('✗ ' + name); } };
const quiet = () => {};                       // 검사 중에는 ⟳ 를 찍지 않습니다

/* 부를 때마다 handler 를 갈아 끼울 수 있는 작은 서버입니다. */
function serve(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise(r => server.close(r))
    }));
  });
}

/* ① 두 번 끊기고 세 번째에 성공 — 사람이 손대지 않고 넘어가야 합니다. */
{
  let hits = 0;
  const s = await serve((req, res) => {
    hits++;
    if (hits < 3) { req.socket.destroy(); return; }   // 연결을 그냥 끊습니다
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  const res = await fetchRetry(s.url, {}, { baseDelay: 10, say: quiet });
  const body = await res.json();
  check('두 번 끊겨도 세 번째에 받아 온다', res.ok && body.ok === true);
  check('필요한 만큼만 물어본다 (3번)', hits === 3);
  await s.close();
}

/* ② 503 도 「잠깐 지친 것」으로 보고 다시 물어봅니다. */
{
  let hits = 0;
  const s = await serve((req, res) => {
    hits++;
    if (hits < 2) { res.writeHead(503); res.end('busy'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  const res = await fetchRetry(s.url, {}, { baseDelay: 10, say: quiet });
  check('503 뒤에 200 을 받아 온다', res.status === 200 && hits === 2);
  await s.close();
}

/* ③ 인증키가 틀렸으면(401) 다시 물어도 소용없습니다. 곧바로 돌려줘야 합니다.
      여기서 매달리면 사람이 「키를 고쳐야 한다」는 걸 늦게 압니다. */
{
  let hits = 0;
  const s = await serve((req, res) => { hits++; res.writeHead(401); res.end('no'); });
  const res = await fetchRetry(s.url, {}, { baseDelay: 10, say: quiet });
  check('401 은 다시 묻지 않고 그대로 돌려준다', res.status === 401 && hits === 1);
  await s.close();
}

/* ④ 404 도 마찬가지입니다. 주소가 없는 건 기다린다고 생기지 않습니다. */
{
  let hits = 0;
  const s = await serve((req, res) => { hits++; res.writeHead(404); res.end('gone'); });
  const res = await fetchRetry(s.url, {}, { baseDelay: 10, say: quiet });
  check('404 는 다시 묻지 않는다', res.status === 404 && hits === 1);
  await s.close();
}

/* ⑤ 서버가 끝내 대답하지 않으면 매달리지 않고 시간 제한에 걸려 끝냅니다.
      예전에는 여기서 그냥 서 있었습니다. */
{
  const s = await serve(() => { /* 일부러 아무 대답도 하지 않습니다 */ });
  const started = Date.now();
  let err = null;
  try { await fetchRetry(s.url, {}, { tries: 2, timeoutMs: 150, baseDelay: 10, say: quiet }); }
  catch (e) { err = e; }
  const spent = Date.now() - started;
  check('대답이 없으면 시간 제한에 걸린다', err !== null);
  check('매달리지 않는다 (2초 안)', spent < 2000);
  check('몇 번 물어봤는지 알려 준다', err !== null && /2번 물어봤지만/.test(err.message));
  await s.close();
}

/* ⑥ 끝내 안 되면 조용히 넘어가지 않고 확실히 알립니다.
      잘못된 자료를 «성공»으로 굽는 것보다 실패가 낫습니다. */
{
  const s = await serve((req, res) => { res.writeHead(500); res.end('boom'); });
  const res = await fetchRetry(s.url, {}, { tries: 2, baseDelay: 10, say: quiet });
  check('끝까지 500 이면 500 을 그대로 돌려준다', res.status === 500);
  await s.close();
}

/* ⑦ 「길이 막힌 것」과 「진짜 탈」을 갈라야 워크플로가 판단할 수 있습니다.
      막힌 것이면 75 로 끝내고 새 러너에서 다시 합니다. 이것을 1 로 끝내면
      고칠 수도 없는 일로 매달 실패 메일이 옵니다. */
{
  const blocked = new Error('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
  const dns = new Error('fetch failed', { cause: { code: 'ENOTFOUND' } });
  const real = new Error('KOSIS 오류 30: 인증키가 유효하지 않습니다');

  check('연결 제한시간은 「막힘」으로 본다', isUnreachable(blocked));
  check('주소를 못 찾는 것도 「막힘」', isUnreachable(dns));
  check('내용이 틀린 것은 「막힘」이 아니다', !isUnreachable(real));
  check('막힘은 75 로 끝낸다', exitFor(blocked) === EX_UNREACHABLE && EX_UNREACHABLE === 75);

  /* 앞의 검사들에서 서버가 여러 번 대답했으므로 길은 뚫려 있습니다.
     그러니 내용 오류는 그냥 실패(1) 여야 합니다. */
  check('한 번이라도 대답을 받았다', sawAnyResponse());
  check('길이 뚫려 있으면 내용 오류는 실패(1)', exitFor(real) === 1);
}

console.log(`✓  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
