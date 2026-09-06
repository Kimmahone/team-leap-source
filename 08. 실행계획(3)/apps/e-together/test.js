/* 이웃 학교 함께하기 — 점검
   최소 DOM 스텁 위에서 앱을 실제로 올려 렌더 경로를 돌린다.
   기능이 있는지가 아니라 이 앱이 **약속한 규칙**이 깨지지 않는지를 본다.

     ① 좌표를 모르는 학교는 거리 순위에 섞지 않는다
     ② 「함께가 항상 이득」이라고 말하지 않는다
     ③ 거리는 직선이라고 적는다
     ④ 상대 학교 인원을 추측해서 채우지 않는다
     ⑤ 학생 이름을 받지 않는다

   실행: node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl() {
  return {
    _html: '', hidden: false, value: '', textContent: '', tabIndex: 0, checked: false,
    classList: { add() {}, remove() {} }, style: {}, className: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener() {}, focus() {}, click() {}, scrollIntoView() {},
    setAttribute(k, v) { this['_' + k] = v; },
    getAttribute(k) { return this['_' + k] || null; },
    hasAttribute(k) { return this['_' + k] != null; },
    appendChild() {}, removeChild() {},
    /* id 로 찾을 때는 **그려 놓은 HTML 에 그 id 가 있을 때만** 돌려준다.
       늘 무언가를 돌려주면, 화면에 없는 단추를 잡는 코드가 검사에서는 멀쩡히
       지나간다. 흉내는 진짜보다 너그러우면 안 된다. */
    querySelector(sel) {
      const q = String(sel);
      const m = /^#([\w-]+)$/.exec(q);
      if (m) return this._html.includes('id="' + m[1] + '"') ? makeEl() : null;
      return makeEl();
    },
    querySelectorAll(sel) {
      if (String(sel).includes('role="tab"')) return [makeEl(), makeEl(), makeEl(), makeEl()];
      return [];
    }
  };
}

function run(state) {
  const panels = {};
  const store = { 'leap-together-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console,
    __LEAP_TEST__: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto,
    Blob, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    alert: () => {}, confirm: () => true, prompt: () => null,
    print: () => {}, scrollTo: () => {},
    setTimeout: (f) => { if (typeof f === 'function') f(); }, clearTimeout: () => {},
    document: {
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {} },
      documentElement: makeEl()
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 8000 });

  const get = id => (panels[id] ? panels[id]._html : '');
  return {
    hook: sandbox.__LEAP_TEST__.hook, store,
    get me() { return get('panel-me'); },
    get near() { return get('panel-near'); },
    get share() { return get('panel-share'); },
    get doc() { return get('panel-doc'); },
    get meter() { return get('meter'); }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

const app = run();
const H = app.hook;
const S = name => H.SCHOOLS.filter(s => s.n === name)[0];

/* 검사에 쓰는 학교. 길안초등학교를 고른 이유가 있다 —
   안동시 길안면은 안동 시내가 아니라 **청송 쪽**에 붙어 있다.
   이 앱의 주장(시군이 아니라 거리가 이웃을 정한다)이 여기서 판가름 난다. */
const GIRAN = S('길안초등학교');
const ANDONG = S('안동초등학교');

console.log('\n[1] 공공데이터 — 학교 917곳과 시군 22개');
check('학교가 917곳', H.SCHOOLS.length === 917, '지금 ' + H.SCHOOLS.length);
/* 이 셋은 **구운 자료를 직접 센 값**이다. 2026. 8. 3. 이 검사를 쓰면서
   문서 여섯 곳에 적혀 있던 「초 473 · 고 184」가 실제와 하나씩 어긋나 있는 것을
   찾았다. 합계 917 은 맞았기 때문에 그때까지 아무도 몰랐다. 문서를 고쳤고,
   앞으로는 자료를 다시 구울 때 여기서 걸린다. */
check('초 474곳', H.SCHOOLS.filter(s => s.k === 'e').length === 474);
check('중 260곳', H.SCHOOLS.filter(s => s.k === 'm').length === 260);
check('고 183곳', H.SCHOOLS.filter(s => s.k === 'h').length === 183);
check('분교장이 빠지지 않았다', H.SCHOOLS.filter(s => /분교장$/.test(s.n)).length === 18,
  '작은 학교를 위한 앱이 분교장을 빠뜨리면 앞뒤가 맞지 않는다');
/* 〔2026. 9. 6.〕 문턱이 «1» 이었습니다 — 포항해오름중학교(2026. 3. 1. 개교)만
   학교알리미가 좌표를 안 줘서 비어 있었습니다. 주소는 있었으므로
   bake-coords 가 카카오로 찾아 채웁니다. 이제 빠진 곳이 없습니다.
   다시 «1» 로 올려 초록을 만들지 마세요 — 검사를 끄는 것입니다. */
check('좌표 없는 학교가 없다', H.SCHOOLS.filter(s => s.lat == null).length === 0,
  '빠진 곳: ' + H.SCHOOLS.filter(s => s.lat == null).map(s => s.n).join(', '));
check('경북 밖으로 튄 좌표가 없다',
  H.SCHOOLS.every(s => s.lat == null || (s.lat > 35.3 && s.lat < 37.6 && s.lon > 127.8 && s.lon < 131.1)));
check('시군이 22개', H.REGIONS.length === 22);
check('군위군이 없다', !H.REGIONS.some(r => r.n === '군위군'),
  '2023년 7월 1일 대구광역시로 넘어갔다');
check('길안초등학교가 있다', !!GIRAN);
check('초성으로 찾는다 — ㄱㅇㅊ', H.findSchools('ㄱㅇㅊ', 'e', 40).some(s => s.n === '길안초등학교'));
check('시군 이름으로도 찾는다', H.findSchools('청송', '', 40).length > 0);

console.log('\n[2] 거리와 시간 — 앱 A와 같은 어림법을 쓴다');
const AD = H.REGIONS.filter(r => r.c === 'andong')[0];
const GJ = H.REGIONS.filter(r => r.c === 'gyeongju')[0];
check('안동–경주 직선 약 91km', near(H.distKm(AD, GJ), 91, 3),
  '도로 거리(약 120km)와 헷갈리기 쉽다. 그래서 화면에도 「직선」이라 적는다');
check('같은 곳끼리는 0km', H.distKm(GIRAN, GIRAN) === 0);
check('좌표가 없으면 거리도 없다(null)', H.distKm(GIRAN, { lat: null, lon: null }) === null);
check('아무리 가까워도 15분', H.estMin(GIRAN, GIRAN) === 15,
  '주차하고 교실 찾아가는 시간이 있다');
check('경유용 legMin 에는 준비 시간이 없다', H.legMin(GIRAN, GIRAN) === 0);
check('멀수록 오래 걸린다',
  H.estMin(GIRAN, GJ) > H.estMin(GIRAN, ANDONG));
check('시간은 대칭이다', H.estMin(GIRAN, ANDONG) === H.estMin(ANDONG, GIRAN));

console.log('\n[3] 이웃 — 시군이 아니라 거리가 정한다');
app.hook.reset();
H.setMe(GIRAN, 12);
H.data().kind = 'same';
H.data().radius = 90;
H.save();
const nb = H.neighbors();
check('이웃이 하나 이상 나온다', nb.list.length > 0);
check('우리 학교는 이웃 목록에 없다', !nb.list.some(x => x.s.n === '길안초등학교'),
  '자기 자신이 가장 가까운 학교로 뜨면 안 된다');
check('가까운 순으로 늘어선다',
  nb.list.every((x, i) => i === 0 || nb.list[i - 1].km <= x.km));
check('같은 급만 걸렀다', nb.list.every(x => x.s.k === 'e'));
const top5 = nb.list.slice(0, 5);
check('가장 가까운 다섯 곳에 다른 시군 학교가 있다',
  top5.some(x => x.s.rc !== 'andong'),
  '길안면은 안동 시내보다 청송에 가깝다 — 이 앱의 존재 이유');
const andongCity = nb.list.filter(x => x.s.n === '안동초등학교')[0];
const otherGun = nb.list.filter(x => x.s.rc !== 'andong')[0];
check('같은 시군(안동초)보다 가까운 다른 시군 학교가 있다',
  !!andongCity && !!otherGun && otherGun.km < andongCity.km,
  otherGun ? otherGun.s.n + ' ' + otherGun.km + 'km vs 안동초등학교 ' + (andongCity && andongCity.km) + 'km' : '');

console.log('\n[4] 좌표를 모르는 학교는 순위에 섞지 않는다 — 규칙 ①');
/* ★ 〔2026. 9. 6.〕 예전에는 «실제로 좌표가 빠진 학교»(포항해오름중학교)를
   집어다 썼습니다. 그 학교의 좌표를 채우자 이 자리가 undefined 가 되어
   검사가 통째로 터졌습니다. 규칙은 그대로 지켜야 하는데, 규칙을 지키는지
   보는 일이 «자료에 구멍이 남아 있는지»에 매여 있었던 것입니다.
   그래서 구멍을 여기서 «직접 만들어» 봅니다. 자료가 온전해도 규칙은 계속 지킵니다. */
const ME_NAME = (S('포항제철초등학교') || S('포항초등학교')).n;
/* 같은 시군의 이웃 하나를 골라 좌표를 지웁니다 — 멀리 있는 학교를 고르면
   범위 밖이라 「거리 모름」 자리에도 안 들어와 무엇을 보는지 흐려집니다. */
const HAEORUM = H.SCHOOLS.filter(s => s.rc === 'pohang' && s.n !== ME_NAME && s.lat != null)[0];
const savedLat = HAEORUM.lat, savedLon = HAEORUM.lon;
HAEORUM.lat = null; HAEORUM.lon = null;
H.setMe(S('포항제철초등학교') || S('포항초등학교'), 20);
H.data().kind = ''; H.data().radius = 90; H.save();
const nb2 = H.neighbors();
check('좌표 없는 학교가 거리 목록에 없다',
  !nb2.list.some(x => x.s.n === HAEORUM.n));
check('대신 「거리 모름」 자리에 있다',
  nb2.unknown.some(s => s.n === HAEORUM.n),
  '0km 로 두면 목록 맨 위에 올라와 가장 가까운 학교처럼 보인다');
check('거리 목록의 거리는 모두 숫자다', nb2.list.every(x => typeof x.km === 'number' && isFinite(x.km)));
HAEORUM.lat = savedLat; HAEORUM.lon = savedLon;   // 되돌려 놓습니다

console.log('\n[5] 범위와 학교급 거르기');
H.setMe(GIRAN, 12);
H.data().kind = 'same'; H.data().radius = 20; H.save();
const nb20 = H.neighbors();
check('20분 안쪽만 남는다', nb20.list.every(x => x.min <= 20));
H.data().radius = 60; H.save();
check('60분으로 넓히면 늘어난다', H.neighbors().list.length >= nb20.list.length);
H.data().kind = 'm'; H.save();
check('중학교만 고를 수 있다', H.neighbors().list.every(x => x.s.k === 'm'));
H.data().kind = ''; H.save();
check('모두 고르면 급이 섞인다',
  new Set(H.neighbors().list.map(x => x.s.k)).size > 1);
H.data().kind = 'same'; H.data().radius = null; H.save();
check('범위를 비우면 목적별 권장값을 쓴다', H.radiusMin() === H.goal().mins);

console.log('\n[6] 함께 할 일 — 목적마다 견딜 수 있는 거리가 다르다');
check('열한 가지가 있다', H.GOALS.length === 11, '지금 ' + H.GOALS.length + '개');
check('권장 시간이 모두 있다', H.GOALS.every(g => g.mins > 0));
check('교구 나눠 쓰기가 가장 가까워야 한다',
  H.GOALS.filter(g => g.id === 'gear')[0].mins === Math.min(...H.GOALS.map(g => g.mins)));
check('공동 교육과정은 같은 학교급을 권한다',
  H.GOALS.filter(g => g.id === 'class')[0].sameKind === true);
check('왜 필요한지가 모든 목적에 적혀 있다', H.GOALS.every(g => g.why && g.why.length > 20));

console.log('\n[7] 버스 — 셈이 맞나');
H.data().bus = { seats: 45, fare: 500000 };
H.setMe(GIRAN, 12);
H.data().picks = []; H.save();
H.pick(ANDONG, 9);
const b1 = H.busPlan();
check('인원을 더한다 (12+9=21)', b1.total === 21);
check('혼자 가면 두 대', b1.busesAlone === 2);
check('함께 가면 한 대', b1.busesTogether === 1);
check('50만 원이 덜 든다', b1.saved === 500000);
check('남는 자리 24', b1.empty === 24);
check('함께일 때 1인당은 모든 학교가 같다',
  b1.rows.every(r => r.perTogether === b1.perTogether));
check('두 학교 모두 부담이 줄어든다', b1.rows.every(r => r.diff < 0));

console.log('\n[8] 「함께가 항상 이득」이라고 말하지 않는다 — 규칙 ②');
H.setMe(GIRAN, 40);
H.data().picks = []; H.save();
H.pick(ANDONG, 10);
const b2 = H.busPlan();
check('40+10 이면 대수가 줄지 않는다', b2.busesAlone === 2 && b2.busesTogether === 2);
check('그래서 아끼는 돈이 없다', b2.saved === 0);
check('40명 학교는 혼자면 1인당 12,500원', b2.rows[0].per === 12500);
check('함께 가면 20,000원 — 올라간다', b2.rows[0].perTogether === 20000);
check('앱이 「늘어난다」를 알아챈다', b2.rows[0].diff > 0);
check('10명 학교는 반대로 내려간다', b2.rows[1].diff < 0);
check('화면이 그 사실을 적는다', (() => {
  H.render();
  return app.share.includes('함께가 항상 이득은 아닙니다') && app.share.includes('늘어납니다');
})(), '이득만 보여 주면 큰 학교가 한 번 손해 보고 다시는 안 한다');

console.log('\n[9] 전체 대수는 절대 늘지 않는다 — 200번 무작위로');
(() => {
  let bad = 0;
  for (let t = 0; t < 200; t++) {
    const seats = 20 + Math.floor(Math.random() * 40);
    const a = Math.floor(Math.random() * 120), c = Math.floor(Math.random() * 120);
    H.data().bus = { seats: seats, fare: 400000 };
    H.setMe(GIRAN, a);
    H.data().picks = []; H.save();
    H.pick(ANDONG, c);
    const b = H.busPlan();
    if (b.busesTogether > b.busesAlone || b.saved < 0) bad++;
  }
  check('함께 타면 대수가 늘거나 전체 비용이 커지는 일은 없다', bad === 0,
    'ceil(a/s) + ceil(b/s) >= ceil((a+b)/s)');
})();
H.data().bus = { seats: 45, fare: 500000 }; H.save();

console.log('\n[10] 인원을 추측해서 채우지 않는다 — 규칙 ④');
H.setMe(GIRAN, 12);
H.data().picks = []; H.save();
H.pick(ANDONG, null);
const b3 = H.busPlan();
check('비어 있는 인원은 0으로 셈한다', b3.total === 12);
check('비어 있다는 것을 센다', b3.missing === 1);
H.render();
check('화면이 「전화로 물어 적으세요」라고 말한다', app.share.includes('전화로 물어 적으세요'));
check('공시 인원과 참여 인원이 다르다고 밝힌다',
  app.share.includes('실제로 몇 명이 오는지는 그 학교가 정합니다'),
  '이제 앱은 전교생 수를 안다. 그것을 참여 인원인 척하면 상대 학교에 실례가 된다');

console.log('\n[11] 인원이 0일 때 0으로 나누지 않는다');
H.setMe(GIRAN, 0);
H.data().picks = []; H.save();
H.pick(ANDONG, 0);
const b0 = H.busPlan();
check('1인당이 무한대가 되지 않는다', b0.rows.every(r => r.per === null || isFinite(r.per)));
check('함께 1인당도 비어 있다', b0.perTogether === null);
check('계산할 준비가 안 됐다고 본다', b0.ready === false);
H.render();
check('화면이 인원을 먼저 적으라고 한다', app.share.includes('인원을 먼저 적어'));

console.log('\n[12] 모이는 자리 — 평균이 아니라 가장 먼 사람');
H.setMe(GIRAN, 12);
H.data().picks = []; H.save();
H.pick(ANDONG, 9);
H.pick(S('임동초등학교') || S('안동초등학교'), 7);
const mp = H.meetPlaces();
check('후보가 학교 수만큼 나온다', mp.length === 3 || mp.length === 2);
check('가장 먼 사람이 적은 순으로 늘어선다',
  mp.every((x, i) => i === 0 || mp[i - 1].worst <= x.worst));
check('맨 위가 가장 공평한 자리다', mp[0].worst === Math.min(...mp.map(x => x.worst)));
H.data().picks = []; H.save();
check('학교가 하나뿐이면 낼 것이 없다', H.meetPlaces().length === 0);

console.log('\n[13] 경유 — 목적지를 알아야 잴 수 있다');
H.pick(ANDONG, 9);
H.data().dest = { rc: '', spot: '' }; H.save();
check('목적지가 없으면 말하지 않는다(null)', H.detourMin(H.data().picks[0]) === null);
H.data().dest = { rc: 'gyeongju', spot: '불국사' }; H.save();
const dm = H.detourMin(H.data().picks[0]);
check('들르는 시간이 나온다', typeof dm === 'number' && dm > 0);
check('정차 시간이 들어 있다', dm >= 10, '아이들을 태우는 데 드는 10분');
check('돌아가는 길이 아니면 크게 늘지 않는다', dm < 200);

console.log('\n[14] 화면이 무엇을 말하나');
H.hookReset ? 0 : 0;
app.hook.reset();
H.render();
check('처음에는 우리 학교부터 고르라고 한다', app.near.includes('먼저'));
check('제안서도 학교를 담으라고 한다', app.doc.includes('담으면'));
H.setMe(GIRAN, 12); H.render();
check('시군 경계를 넘는다고 적는다', app.near.includes('시군 경계를 넘어서'));
check('거리가 「직선」임을 적는다 — 규칙 ③', app.near.includes('직선'));
/* 〔v0.5〕 「917곳이 앱 안에 들어 있습니다 · 인터넷은 쓰지 않습니다」를 **일하는 화면에서
   뺐습니다.** 만든 사람에게는 자랑이지만, 우리 학교를 찾으러 온 사람에게는 할 일과
   상관없는 문장입니다. 약속 자체는 그대로 지키므로 **판권에 남깁니다** — 그 자리가
   출처와 조건을 적는 자리입니다. */
check('자료 출처를 판권에 적는다', html.includes('학교 목록 출처: 교육부'));
check('인터넷 없이 된다는 것을 판권에 적는다', html.includes('인터넷 없이 찾을 수 있습니다'));
check('일하는 화면에서는 되풀이하지 않는다',
  !app.me.includes('인터넷은 쓰지 않습니다'),
  '학교를 찾으러 온 사람에게 할 일과 상관없는 문장');
check('학생 이름 대신 수만 쓴다고 적는다', app.me.includes('수만'));
check('다른 시군이면 교육지원청이 다르다고 알린다', app.near.includes('교육지원청 다름'),
  '공문 경로가 둘이 된다 — 실제로 일이 되게 하려면 필요한 정보');
check('바닥 요약에 담은 학교 수가 있다', app.meter.includes('담은 학교'));

console.log('\n[15] 지도 — 인터넷도 지도 API도 쓰지 않는다');
H.data().picks = []; H.data().radius = 90; H.save();
H.pick(ANDONG, 9);
H.render();
const svg = H.mapSVG(H.neighbors().list);
check('SVG 가 나온다', /^<svg/.test(svg));
check('여는 태그와 닫는 태그 수가 같다',
  (svg.match(/<svg/g) || []).length === (svg.match(/<\/svg>/g) || []).length);
check('스크린리더가 읽을 설명이 있다', /role="img"/.test(svg) && /aria-label="/.test(svg));
check('학교급을 모양으로 나눈다 — 색만으로 알리지 않는다',
  /<circle class="mp-pt/.test(svg) || /<polygon class="mp-pt/.test(svg) || /<rect class="mp-pt/.test(svg));
check('북쪽을 표시한다', svg.includes('>북<'));
check('담은 학교에는 이름을 붙인다', svg.includes('안동초'));
check('거리 원에 km 를 적는다', /km<\/text>/.test(svg));

console.log('\n[16] 제안서 — 종이 한 장');
H.setMe(GIRAN, 12);
H.data().picks = []; H.save();
H.pick(ANDONG, 9);
H.data().plan = { when: '10월 15일(수)', memo: '버스 계약은 저희가 맡겠습니다.' };
H.data().dest = { rc: 'gyeongju', spot: '불국사' };
H.data().goal = 'trip'; H.save();
const doc = H.docHTML();
check('제목에 무엇을 함께 하는지 적힌다', doc.includes('공동 현장체험학습 함께 하기 제안'));
check('우리 학교가 있다', doc.includes('길안초등학교'));
check('상대 학교가 있다', doc.includes('안동초등학교'));
check('왜 함께 하는지가 있다', doc.includes('왜 함께 하려고 합니다'));
check('거리와 어림 시간이 있다', doc.includes('직선') && doc.includes('어림'));
check('버스 표가 들어간다', doc.includes('버스와 비용'));
check('덜 드는 돈을 적는다', doc.includes('500,000원'));
check('날짜 후보가 들어간다', doc.includes('10월 15일'));
check('덧붙인 말이 들어간다', doc.includes('버스 계약은 저희가'));
check('전화로 물어볼 것이 있다', doc.includes('전화로 물어볼 것'));
check('시군이 다르면 교육지원청도 다르다고 적는다', doc.includes('교육지원청도 다릅니다'));
check('거리가 직선임을 각주로 밝힌다', doc.includes('직선거리'));
check('어림값이라고 밝힌다', doc.includes('어림값'));
check('공공데이터 출처가 들어간다', doc.includes('공공누리'));
check('저작권이 들어간다', doc.includes('2026 TEAM LEAP'));
check('지도가 종이에도 들어간다', doc.includes('<svg'));
check('미리보기와 종이가 같은 함수를 쓴다', app.doc.includes('그대로'));

console.log('\n[17] 인원을 모를 때 종이는 「확인 필요」라고 적는다');
H.data().picks[0].cnt = null; H.save();
check('빈칸을 0명으로 적지 않는다', H.docHTML().includes('확인 필요'));
H.data().picks[0].cnt = 9; H.save();

console.log('\n[18] 목적을 바꾸면 종이도 바뀐다');
H.data().goal = 'pln'; H.save();
const docP = H.docHTML();
check('제목이 바뀐다', docP.includes('교사 학습공동체 함께 하기 제안'));
check('버스 표가 빠진다', !docP.includes('버스와 비용'), '모임에는 버스 계산이 필요 없다');
check('대신 모이는 자리가 들어간다', docP.includes('모이는 자리'));
check('물어볼 것도 목적에 맞게 바뀐다',
  H.askList(H.GOALS.filter(g => g.id === 'pln')[0]).some(t => t.includes('연수 시간')));
check('체험학습에는 인솔 교사를 묻는다',
  H.askList(H.GOALS.filter(g => g.id === 'trip')[0]).some(t => t.includes('인솔')));
H.data().goal = 'trip'; H.save();

console.log('\n[19] 남의 파일을 받을 때');
const dirty = {
  me: { n: '<script>x</script>초등학교', k: 'z', rc: 'nowhere', ad: 'x', lat: '36.5', lon: '128.5' },
  meCount: '99999', goal: 'nonsense', radius: 9999, kind: 'hack',
  picks: new Array(80).fill(0).map((_, i) => ({ n: '학교' + i, cnt: -5 })).concat([{ n: '' }]),
  bus: { seats: 0, fare: -100 }, dest: { rc: 'atlantis', spot: 'x'.repeat(999) },
  plan: { when: 'y'.repeat(999), memo: 'z'.repeat(9999) }
};
const clean = H.sanitize(dirty);
check('인원 상한을 넘지 않는다', clean.meCount <= 9999);
check('없는 목적은 기본값으로 돌린다', clean.goal === 'trip');
check('없는 학교급 거르기는 기본값으로', clean.kind === 'same');
check('담는 학교 수에 상한이 있다', clean.picks.length <= 40);
check('이름 없는 것은 버린다', clean.picks.every(p => p.n));
check('음수 인원은 0 이상이 된다', clean.picks.every(p => p.cnt == null || p.cnt >= 0));
check('버스 정원은 1 이상', clean.bus.seats >= 1);
check('임차료는 0 이상', clean.bus.fare >= 0);
check('없는 시군은 비운다', clean.dest.rc === '');
check('긴 글은 자른다', clean.plan.memo.length <= 1000);
check('학교 이름에 든 태그는 화면에서 escape 된다', (() => {
  H.data().me = clean.me; H.data().picks = [{ n: '<img src=x onerror=1>', k: 'e', rc: 'andong',
    ad: '', lat: 36.5, lon: 128.5, cnt: 3, memo: '' }];
  H.save(); H.render();
  return !app.share.includes('<img src=x') && app.share.includes('&lt;img');
})(), '학교 이름은 파일에서 올 수 있다');

console.log('\n[20] 앱이 지키기로 한 공통 원칙');
check('서버를 부르지 않는다', !/fetch\s*\(|XMLHttpRequest|new WebSocket|navigator\.sendBeacon/.test(html),
  '「어떤 자료도 외부로 전송하지 않습니다」가 사실이어야 한다');
/* 문서가 무엇을 담고 있는지는 「마크업」을 봐야 한다.
   style 안의 [role="tab"] 같은 선택자까지 세면 탭이 여덟 개로 잡힌다. */
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '<script></script>')
                   .replace(/<style[\s\S]*?<\/style>/g, '<style></style>');
check('파일 하나로 끝난다', !/<script[^>]+src=|<link[^>]+stylesheet/.test(markup));
check('인쇄 서식이 있다', /@media\s+print/.test(html));
check('다크 모드를 받는다', html.includes('prefers-color-scheme'));
check('움직임 줄이기를 존중한다', html.includes('prefers-reduced-motion'));
check('화면 전환 키를 다른 앱과 함께 쓴다', html.includes("'leap-theme'"));
check('저작권이 있다', html.includes('2026 TEAM LEAP'));
check('공공데이터 출처를 밝힌다', html.includes('공공누리 제1유형'));
check('제목이 하나뿐(h1)', (markup.match(/<h1[ >]/g) || []).length === 1);
check('탭이 넷이다', (markup.match(/role="tab"/g) || []).length === 4);
/* 이름 칸이 없다는 것은 「안 만들었다」로 지켜지는 것이지 문구로 지켜지지 않는다.
   그래서 화면에 만들어지는 입력칸을 전부 세어 본다. */
const inputs = (html.match(/<(input|textarea)[^>]*>/g) || []);
check('입력칸이 이름을 묻지 않는다', !inputs.some(t => /이름|성명|name="(student|pupil|kid)/.test(t)),
  inputs.filter(t => /이름/.test(t)).join(' '));
check('그 약속을 화면에도 적었다', html.includes('학생 이름을 받는 칸이 없습니다'));
check('저장은 이 기기 안에서만 한다', html.includes("LEAP.store('leap-together-v1'"));
check('인증키가 들어 있지 않다', !/apiKey|[0-9a-f]{32}/.test(js),
  '공공데이터는 굽는 것이지 불러오는 것이 아니다. 키는 open api/인증키.txt 에만 있다');

/* ==========================================================================
   v0.2 — 「몇 명인가」를 알게 된 뒤에도 지켜야 하는 것
   ========================================================================== */

console.log('\n[규모] 학교 크기가 들어왔다');
{
  check('공시년도를 안다', H.STU_YEAR >= 2020, String(H.STU_YEAR));
  const sized = H.SCHOOLS.filter(s => H.hasSize(s));
  check('거의 모든 학교에 규모가 붙었다', sized.length >= H.SCHOOLS.length - 5,
    sized.length + ' / ' + H.SCHOOLS.length + '곳');
  const g = H.SCHOOLS.find(s => s.n === '길안초등학교');
  check('학년 수가 학교급과 맞는다', g.grades.length === 6, '초등학교는 6학년까지');
  check('학년별 합이 전교생과 맞는다',
    g.grades.reduce((a, v) => a + v, 0) <= g.stu && g.stu > 0,
    '특수학급 학생이 더해지므로 학년별 합보다 크거나 같아야 한다');
  check('학급 수가 1 이상이다', g.cls >= 1);
  const big = H.SCHOOLS.find(s => H.hasSize(s) && s.stu > 800);
  check('큰 학교도 제대로 들어 있다', !!big, big ? big.n + ' ' + big.stu + '명' : '없음');
}

console.log('\n[규모] 대시보드와 같은 자료를 쓴다');
{
  const fs2 = require('fs'), path2 = require('path');
  const dash = fs2.readFileSync(
    path2.join(__dirname, '..', '..', '..', '06. 실행계획(1)', 'prototype', 'index.html'), 'utf8');
  const app2 = fs2.readFileSync(path2.join(__dirname, 'index.html'), 'utf8');
  const pick = t => (t.match(/ {2}var STUDENT_RAW = \{\n([\s\S]*?)\n {2}\};/) || [])[1];
  check('학생 자료가 대시보드와 글자 하나까지 같다', pick(dash) === pick(app2),
    '같은 학교를 두고 두 화면이 다른 숫자를 말하면 둘 다 못 믿게 된다');
  check('공시년도도 같다',
    (dash.match(/var STUDENT_YEAR = (\d+)/) || [])[1] === (app2.match(/var STUDENT_YEAR = (\d+)/) || [])[1]);
}

console.log('\n[규모] 모르는 것을 아는 척하지 않는다');
{
  check('규모를 모르면 없는 대로 둔다', H.hasSize({ n: '없는학교' }) === false);
  check('모르는 학교는 「모름」으로 적는다', H.sizeLine({ n: '없는학교' }) === '');
  H.setMe(GIRAN, null);
  H.setSize('small');
  const nb = H.neighbors();
  check('6학급 이하로 거르면 큰 학교가 빠진다',
    nb.list.every(x => !H.hasSize(x.s) || x.s.cls <= 6),
    '「6학급 이하」는 소규모학교의 통상 기준이다');
  /* 지금은 917곳 모두에 규모가 붙어 있어 「모르는 학교」로 실제 확인할 수가 없다.
     그래서 ① 지금 몇 곳이 비었는지를 숫자로 못박아 두고 (다음에 구웠을 때 새 학교가
     생기면 여기서 드러난다) ② 거르는 코드가 모르는 학교를 남기는지 글로 확인한다. */
  const noSize = H.SCHOOLS.filter(s => !H.hasSize(s));
  check('규모를 모르는 학교가 지금은 없다', noSize.length === 0,
    noSize.length + '곳: ' + noSize.slice(0, 5).map(s => s.n).join(' · '));
  const srcE = require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
  check('거를 때 규모를 모르는 학교는 남긴다',
    srcE.includes("d.size === 'small' && hasSize(s) && s.cls > 6"),
    '모른다고 「아니다」로 다루면 새로 생긴 학교가 조용히 사라진다');
  H.setSize('');
}

console.log('\n[규모] 우리와 비슷한 규모');
{
  H.setMe(GIRAN, null);
  H.setSize('like');
  const like = H.neighbors().list;
  const mine = H.schoolAt(H.data().me);
  check('세 배가 넘게 차이 나는 학교는 빠진다',
    like.every(x => { const g2 = H.sizeGap(mine, x.s); return g2 == null || g2 <= 3; }),
    '12명과 24명은 두 배지만 같이 할 만하고, 120명과 900명은 그렇지 않다');
  H.setSize('');
  const all = H.neighbors().list;
  check('거르개를 끄면 다시 늘어난다', all.length >= like.length);
}

console.log('\n[인원] 학년을 눌러야 들어간다');
{
  const s2 = H.SCHOOLS.find(x => x.n === '파천초등학교') || H.SCHOOLS.find(x => H.hasSize(x) && x.stu > 10);
  check('고른 학년만 더해진다',
    H.fillSum(s2, [0, 1]) === (s2.grades[0] + s2.grades[1]));
  check('아무 학년도 안 고르면 0', H.fillSum(s2, []) === 0);
  check('전교생을 고르면 전교생', H.fillSum(s2, 'all') === s2.stu);
  check('규모를 모르는 학교는 0', H.fillSum({ n: 'x' }, 'all') === 0);
  const row = H.fillRow(s2, 0);
  check('학년 단추가 학년 수만큼 있다',
    (row.match(/data-g="\d"/g) || []).length === s2.grades.length);
  check('공시년도를 적어 둔다', row.includes(H.STU_YEAR + '년 공시'));
  check('전화로 확인하라고 붙여 둔다', row.includes('전화로 확인하세요'),
    '공시 인원은 전교생이고 이 앱이 묻는 것은 함께 가는 인원이다. 둘은 같지 않다');
  check('규모를 모르면 줄 자체가 안 나온다', H.fillRow({ n: 'x' }, 0) === '');
}

console.log('\n[제안서] 두 숫자를 헷갈리지 않게 적는다');
{
  H.reset();
  H.setMe(GIRAN, 30);
  H.pick(H.SCHOOLS.find(x => x.n === '옥전초등학교'), 7);
  const doc = H.docHTML();
  check('학교 규모 칸이 있다', doc.includes('학교 규모'));
  check('참여 인원 칸이 있다', doc.includes('참여 인원'));
  check('규모가 실제로 찍힌다', /\d+학급 · \d+명/.test(doc));
  check('두 수가 다르다고 종이에 적는다', doc.includes('두 수는 다릅니다'),
    '「학교 규모」를 참여 인원으로 읽으면 상대 학교에 실례가 된다');
  check('출처와 해를 밝힌다', doc.includes('학교알리미') && doc.includes(String(H.STU_YEAR)));
}

console.log('\n[마크] 이 앱의 마크');
{
  const src2 = require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
  check('한 반경 안에 든 두 학교', src2.includes('한 반경 안에 든 두 학교'));
  check('점선 원이 있다', /circle[^>]*stroke-dasharray="0\.5 7"/.test(src2),
    '이 앱이 하는 일은 그 원을 그려서 안에 누가 있는지 보여 주는 것이다');
}

/* ==========================================================================
   [v0.3] 지도가 「시군을 넘는다」를 말한다 · 학년 맞춰 보기 · 창구
   ========================================================================== */
console.log('\n[v0.3-1] 지도가 이 앱이 무엇인지 말한다');
{
  const H = run().hook;
  const all = H.SCHOOLS;
  const find = n => all.find(s => s.n === n);
  H.reset();
  H.setMe(find('길안초등학교'), 30);
  const nb = H.neighbors();
  H.pick(nb.list[1].s, 7);                       /* 옥전초 — 의성군 */
  const svg = H.mapSVG(nb.list);

  check('시군 이름이 지도에 적힌다', /class="mp-rg/.test(svg),
    '경계만 그리고 이름을 안 적으면 「어느 군인지」를 지도에서 알 수 없다 — 이 지도가 들어가는 이유가 그것이다');
  check('우리 시군을 따로 칠한다', /class="mine"/.test(svg),
    '경계를 넘었다는 것이 색으로 보여야 한다');
  check('우리 시군 이름이 나온다', svg.includes('>안동<'));
  check('이웃 시군 이름도 나온다', svg.includes('>의성<') || svg.includes('>청송<'));
  check('시군을 넘은 학교에 표가 붙는다', /mp-pt[^"]*far/.test(svg));
  check('담은 학교 이름 옆에 시군을 적는다', /class="mp-far"/.test(svg) && svg.includes('의성군'),
    '목록에만 있고 지도에는 없으면 반쪽이다');
  check('시군 이름이 우리 학교 이름과 겹치지 않는다', (function () {
    const m = /class="mp-rg mine" x="([\d.]+)" y="([\d.]+)"/.exec(svg);
    if (!m) return false;
    const dx = +m[1] - 310, dy = +m[2] - 210;      /* 620x420 의 가운데 */
    return Math.sqrt(dx * dx + dy * dy) >= 50;
  })(), '우리 시군의 무게중심은 대개 가운데에 떨어진다 — 「우리 학교」 글자 위에 찍혔다');
  check('종이에도 범례가 나간다', H.mapSVG(null, true).includes('mplegend'));
  check('종이 지도가 96mm 보다 넓다', /\.dc-map\{[^}]*max-width:1[0-9]{2}mm/.test(html),
    '96mm 는 학교 점과 이름표가 뭉개져 「어느 시군인지」가 안 읽혔다');
}

console.log('\n[v0.3-2] 학년 맞춰 보기 — v0.2 가 「다음 걸음」이라 적어 둔 것');
{
  const H = run().hook;
  const all = H.SCHOOLS;
  const find = n => all.find(s => s.n === n);
  H.reset();
  H.setMe(find('길안초등학교'), 30);
  const nb = H.neighbors();
  H.pick(nb.list[1].s, 7); H.pick(nb.list[2].s, 38);
  const g = H.gradeMerge();

  check('학년별 합이 나온다', !!(g && g.rows && g.rows.length), JSON.stringify(g && g.mixed));
  check('초등은 여섯 학년이다', g.rows.length === 6);
  check('합계가 실제로 더한 값이다',
    g.rows.every(r => r.sum === r.mine + r.vals.reduce((a, b) => a + b, 0)));
  check('학년 합이 전교생 합과 맞는다', (function () {
    const total = g.rows.reduce((a, r) => a + r.sum, 0);
    const mine = H.schoolAt(H.data().me).stu;
    const ps = H.data().picks.reduce((a, p) => a + H.schoolAt(p).stu, 0);
    return total === mine + ps;
  })(), '쪼갠 것을 더하면 원래 수가 나와야 한다 (함정 12번)');

  const card = H.gradeCard();
  check('표가 화면에 나온다', card.includes('학년 맞춰 보기') && card.includes('gtab'));
  check('「이 학년으로」 단추가 학년마다 있다',
    (card.match(/data-gset=/g) || []).length === 6);
  check('공시 자료임을 밝힌다', card.includes('공시'));
  check('실제 인원은 학교가 정한다고 적는다', card.includes('그 학교가 정합니다'));
  check('우리 학교에 없는 학년을 흐리게 둔다', card.includes('nomine'),
    '우리가 가지 않으면 「함께」가 아니다');

  /* 학교급이 섞이면 표를 그리지 않고 왜 못 그리는지 적는다 */
  H.reset();
  H.setMe(find('길안초등학교'), 30);
  const mid = all.find(s => s.k === 'm' && s.lat != null);
  H.pick(mid, 10);
  const c2 = H.gradeCard();
  check('학교급이 섞이면 빈 표를 두지 않는다',
    c2 === '' || c2.includes('학교급이 서로 다릅니다'),
    '초 6학년 · 중 3학년이라 학년이 맞지 않는다');
}

console.log('\n[v0.3-3] AI 초안이 앱이 셈해 둔 것을 쓴다');
{
  check('본체가 AI 조각에 창구를 낸다', html.includes('window.LEAP_E = {'),
    '검사 손잡이(__LEAP_TEST__)를 쓰면 실제 앱에서는 조용히 아무것도 안 한다');
  check('창구가 셈한 결과만 내준다',
    /window\.LEAP_E = \{[\s\S]{0,320}?gradeMerge[\s\S]{0,320}?meetPlaces/.test(html) &&
    !/window\.LEAP_E = \{[\s\S]{0,320}?save/.test(html),
    '고치는 길은 열지 않는다');
  check('프롬프트가 창구를 쓴다', html.includes('function api()') && html.includes('H.gradeMerge'));
  check('프롬프트에 학년별 인원 자리가 있다', html.includes('[학년별 인원'));
  check('프롬프트에 모이는 자리가 들어간다', html.includes('[한 학교로 모인다면]'));
  check('평균이 아니라 가장 멀리서 오는 사람 기준임을 적는다',
    html.includes('가장 멀리서 오는 사람'));
  check('없는 수를 지어내지 말라고 적는다', html.includes('지어내지 마세요'));
  check('구체적인 수로 말하라고 시킨다', html.includes('아홉이 됩니다'));
}

/* ==========================================================================
   v0.4 — 「무엇을 함께 하느냐」가 화면과 종이를 바꾼다
   ========================================================================== */

console.log('\n[v0.4-1] 지도에 선이 있다 — 점만으로는 「우리에게서 얼마」가 안 보인다');
{
  H.reset();
  H.setMe(GIRAN, 12);
  H.data().radius = 60; H.save();
  const nb4 = H.neighbors();
  H.pick(nb4.list[0].s, 7); H.pick(nb4.list[1].s, 9);
  H.render();
  const map = H.mapSVG(nb4.list);
  check('우리 학교에서 선을 긋는다', map.includes('class="mp-sp'));
  check('담은 학교로 가는 선은 진하다', map.includes('mp-sp on'));
  check('선마다 거리와 시간을 적는다', /class="mp-km"[^>]*>[\d.]+km · \d+분/.test(map));
  /* 백 곳에 선을 다 그으면 지도가 아니라 터진 별이 된다 */
  H.data().radius = 90; H.save();
  const wide = H.neighbors();
  const many = H.mapSVG(wide.list);
  const lines = (many.match(/class="mp-sp/g) || []).length;
  check('학교가 백 곳이어도 선은 열몇 개까지만', wide.list.length > 60 && lines <= 14,
    '이웃 ' + wide.list.length + '곳 · 선 ' + lines + '개');
  check('선은 직선이라고 범례에 적는다', many.includes('선 = 우리 학교에서 잰 <b>직선</b>거리'));
  H.data().radius = 60; H.save();
  /* 거리 글자가 「우리 학교」 위에 찍히면 안 된다 — 가까운 학교일수록 그렇다 */
  check('거리 글자를 학교 이름 밑에 단다',
    !/mp-km[^>]*text-anchor="middle"/.test(H.mapSVG(H.neighbors().list)),
    '선 가운데에 두면 가까운 학교일수록 지도 한가운데라 「우리 학교」와 겹친다');
}

console.log('\n[v0.4-2] 목록을 쪽으로 나눈다 — 찾은 것을 감추지 않는다');
{
  H.data().radius = 90; H.save(); H.render();
  const total = H.neighbors().list.length;
  const pg1 = H.pageOf(total);
  check('한 쪽에 열다섯 곳', H.PER_PAGE === 15);
  check('쪽 수가 맞다', pg1.last === Math.ceil(total / 15), total + '곳 · ' + pg1.last + '쪽');
  const near1 = app.near;
  check('첫 쪽에 열다섯 줄', (near1.match(/data-add="/g) || []).length === 15);
  check('모두 몇 곳인지 적는다', near1.includes('모두 <b>' + total + '곳</b>'));
  H.setPage(3);
  const near3 = app.near;
  check('3쪽으로 넘어간다', near3.includes('3 / ' + pg1.last + '쪽'));
  check('3쪽은 31번째부터', near3.includes('<b>31–45번째</b>'));
  /* v0.3 은 60곳에서 잘라 내고 「범위를 좁히세요」라고만 적었다 */
  check('찾은 것을 잘라 내지 않는다', !near3.includes('가까운 60곳만 보입니다'));
  check('마지막 쪽을 넘어가지 않는다', H.pageOf(10).page === 1 && H.pageOf(10).last === 1,
    '쪽을 보다가 범위를 좁히면 그 쪽에는 아무것도 없다');
  H.setPage(1);
}

console.log('\n[v0.4-3] 무엇을 함께 하느냐에 따라 셈하는 것이 달라진다');
{
  check('목적마다 무엇을 셈할지 적혀 있다', H.GOALS.every(g => Array.isArray(g.mods) && g.mods.length));
  check('교구 나눠 쓰기는 버스를 셈하지 않는다',
    H.GOALS.filter(g => g.id === 'gear')[0].mods.indexOf('bus') < 0,
    'v0.3 은 무엇을 골라도 45인승 임차료를 물었다');
  check('연합 체육대회는 팀이 서는지를 셈한다',
    H.GOALS.filter(g => g.id === 'sports')[0].mods.indexOf('team') >= 0);
  check('공동 수업은 오가는 부담을 셈한다',
    H.GOALS.filter(g => g.id === 'class')[0].mods.indexOf('visit') >= 0);

  H.data().radius = 60; H.save();
  const seen = {};
  ['trip', 'sports', 'class', 'pln', 'gear'].forEach(id => {
    H.data().goal = id; H.data().team.min = 8; H.data().trip2.per = 2;
    H.data().gear.cost = 3000000; H.save(); H.render();
    seen[id] = app.share;
  });
  check('체험학습에는 버스가 나온다', seen.trip.includes('버스 나눠 타기'));
  check('교구 나눠 쓰기에는 버스가 안 나온다', !seen.gear.includes('버스 나눠 타기'),
    '교구를 돌려 쓰겠다는 사람에게 45인승 임차료를 묻지 않는다');
  check('교구 나눠 쓰기에는 도는 차례가 나온다', seen.gear.includes('돌리는 차례'));
  check('체육대회에는 팀 짜기가 나온다', seen.sports.includes('팀이 서는가'));
  check('공동 수업에는 오가는 부담이 나온다', seen.class.includes('오가는 부담'));
  check('학습공동체에는 학년 표가 안 나온다', !seen.pln.includes('학년 맞춰 보기'),
    '교사끼리 모이는 일에 학생 학년별 인원은 상관이 없다');
  check('지금 무엇을 셈하는지 화면에 적는다', seen.trip.includes('를 셈하고 있습니다'));

  /* 팀 짜기 — 혼자서는 안 서고 함께면 서는 학년을 짚는다 */
  H.data().goal = 'sports'; H.save();
  const tp = H.teamPlan();
  check('팀 셈이 나온다', !!tp && tp.rows.length === 6);
  check('한 팀 인원으로 나눈다', tp.rows.every(r => r.sumTeams === Math.floor(r.sum / tp.min)));
  check('함께해도 안 되는 학년은 안 된다고 둔다',
    tp.rows.every(r => r.sumTeams >= 1 || r.sum < tp.min));

  /* 오가는 부담 — 합이 아니라 가장 먼 곳 */
  H.data().goal = 'class'; H.data().trip2 = { per: 2, turn: 'both' }; H.save();
  const vp = H.visitPlan();
  check('번갈아 가면 절반으로 센다',
    vp.rows.every(r => r.round == null || r.month === Math.round(r.round / 2 * vp.per)));
  check('한 해는 열 달로 본다', vp.months === 10, '방학 두 달을 뺀 어림');
  check('합이 아니라 가장 먼 곳을 쓴다',
    vp.worst && vp.rows.every(r => r.year == null || r.year <= vp.worst.year),
    '한 번에 한 곳으로 모이는 것이 보통이라 더하면 부풀려진다');
  H.data().trip2.turn = 'them'; H.save();
  check('그쪽이 오면 우리 이동은 0', H.visitPlan().rows.every(r => r.month === 0 || r.month == null));

  /* 나눠 쓰기 — 값과 도는 길 */
  H.data().goal = 'gear'; H.data().gear = { cost: 3000000, what: '3D 프린터' }; H.save();
  const gp = H.gearPlan();
  check('학교 수로 나눈다', gp.n === 1 + H.data().picks.length && gp.each === Math.ceil(3000000 / gp.n));
  check('도는 길이 우리 학교로 돌아온다', gp.stops[gp.stops.length - 1].back === true);
  check('가까운 곳부터 이어 간다', gp.stops[0].km <= gp.stops[1].km || gp.stops[1].back);
}

console.log('\n[v0.4-4] 직접 적기 — 앱이 다 안다고 굴지 않는다');
{
  H.data().goal = 'custom';
  H.data().custom = { n: '연합 독서토론', why: '6학년이 네 명이라 토론이 서지 않습니다.',
    mins: 25, bus: false, meet: true, visit: true, gear: false };
  H.save(); H.render();
  const g = H.goal();
  check('직접 적은 이름이 목적이 된다', g.n === '연합 독서토론');
  check('직접 적은 권장 시간을 쓴다', H.radiusMin() === 25 || g.mins === 25);
  check('켠 것만 셈한다', g.mods.indexOf('meet') >= 0 && g.mods.indexOf('bus') < 0);
  check('학년 맞춰 보기는 늘 나온다', g.mods.indexOf('grade') >= 0,
    '작은 학교에서 한 학년이 몇 명인가는 어떤 일을 하든 첫 물음이다');
  check('직접 적은 이유가 제안서에 들어간다', H.docHTML().includes('토론이 서지 않습니다'));
  check('이름을 비워도 앱이 멎지 않는다', (() => {
    H.data().custom.n = ''; H.save();
    return H.goal().n.length > 0 && H.docHTML().length > 100;
  })());
  H.data().goal = 'trip'; H.save();
}

console.log('\n[v0.4-5] 가는 곳을 직접 적을 수 있다');
{
  H.data().dest = { rc: 'gyeongju', spot: '불국사', free: '', km: null }; H.save();
  check('시군과 장소를 함께 적는다', H.destName() === '경주시 불국사');
  H.data().dest = { rc: 'gyeongju', spot: '○○농장', free: '', km: null }; H.save();
  check('목록에 없는 장소도 적힌다', H.destName() === '경주시 ○○농장');
  H.data().dest = { rc: 'free', spot: '', free: '국립대구과학관', km: 62 }; H.save();
  check('경북 밖도 적을 수 있다', H.destName() === '국립대구과학관');
  check('직접 적은 거리를 쓴다', H.destKm() === 62);
  check('직접 적은 거리로 시간을 어림한다', H.destMin() === Math.max(15, Math.round(62 * 1.35 / 50 * 60) + 10));
  check('좌표가 없으면 경유 시간을 내지 않는다',
    H.detourMin(H.data().picks[0]) == null,
    '모르는 것을 아는 척하지 않는다');
  H.data().dest = { rc: '', spot: '', free: '', km: null }; H.save();
}

console.log('\n[v0.4-6] 제안서 — 모든 글을 고칠 수 있고, 되돌릴 수 있다');
{
  H.data().goal = 'trip'; H.data().doc = {}; H.save();
  const before = H.docHTML();
  check('앱이 먼저 다 써 둔다', before.includes('왜 함께 하려고 합니다') && before.includes('어느 학교와'));
  check('제목을 앱이 쓴다', before.includes(H.autoTitle()));

  H.data().doc = { title: '함께 가 보려 합니다', 't.why': '이렇게 하려 합니다',
    'b.why': '우리 손으로 쓴 문장입니다.' };
  H.save();
  const after = H.docHTML();
  check('제목을 고칠 수 있다', after.includes('함께 가 보려 합니다') && !after.includes(H.autoTitle()));
  check('소제목을 고칠 수 있다', after.includes('이렇게 하려 합니다'));
  check('본문을 고칠 수 있다', after.includes('우리 손으로 쓴 문장입니다.'));
  check('고치지 않은 곳은 앱이 그대로 쓴다', after.includes('어느 학교와'));

  /* 손댄 자리만 담는다 — 통째로 담으면 인원을 고쳐도 옛 문장이 남는다 */
  check('고친 자리만 담는다', Object.keys(H.data().doc).length === 3);
  H.data().doc = {}; H.save();
  check('되돌리면 앱이 쓴 문장이 돌아온다', H.docHTML().includes(H.autoTitle()));

  H.data().doc = { 'off.map': true }; H.save();
  check('절을 뺄 수 있다', !H.docHTML().includes('dc-map'));
  H.data().doc = {}; H.save();

  check('머리말을 고칠 수 있다', (() => {
    H.data().doc = { head: '길안초 교무실 · 054-000-0000' }; H.save();
    const d2 = H.docHTML(); H.data().doc = {}; H.save();
    return d2.includes('054-000-0000');
  })());
  check('꼬리말을 고칠 수 있다', (() => {
    H.data().doc = { foot: '문의: 김교사' }; H.save();
    const d2 = H.docHTML(); H.data().doc = {}; H.save();
    return d2.includes('문의: 김교사') && !d2.includes('공공누리');
  })());
  /* 원칙 9번 — 지우지는 않되, 크게 굴지도 않는다 */
  check('꼬리말을 비워도 만든 곳 한 줄은 남는다', (() => {
    H.data().doc = { foot: '' }; H.save();
    const d2 = H.docHTML(); H.data().doc = {}; H.save();
    return d2.includes('TEAM LEAP') && d2.includes('dc-by');
  })());
  check('만든 곳 한 줄은 작게 둔다', html.includes('.dc-by{font-size:7pt'),
    '꼬리말이 자기 자랑처럼 보이면 남에게 보내기가 꺼려진다');

  /* 제안서의 절도 목적에 따라 달라진다 */
  H.data().goal = 'gear'; H.data().gear = { cost: 3000000, what: '3D 프린터' }; H.save();
  check('교구를 고르면 제안서에 나눠 쓰기가 들어간다', H.docHTML().includes('나눠 쓰기'));
  check('교구를 고르면 제안서에 버스가 안 들어간다', !H.docHTML().includes('버스와 비용'));
  check('교구를 고르면 「왜」도 값 이야기로 바뀐다', H.docHTML().includes('나눠 쓰면 한 곳이'));
  H.data().goal = 'trip'; H.save();
  check('물어볼 것이 목적마다 다르다',
    H.askList(H.GMAP ? H.GMAP.gear : { id: 'gear' }).join() !== H.askList({ id: 'trip' }).join() ||
    H.askList({ id: 'gear' }).some(t => t.includes('고장')));
}

console.log('\n[v0.4-7] 미리보기와 종이가 같은 폭이다');
{
  check('미리보기 종이가 A4 폭이다', html.includes('.sheet{background:#fff;color:#14202E;max-width:210mm'),
    '190mm 로 두면 표가 미리보기에서만 넘쳐 잘려 보인다');
  check('좌우 여백이 @page 와 같다', html.includes('padding:12mm 11mm') && html.includes('margin:12mm 11mm'));
  check('왼쪽은 적는 곳, 오른쪽은 나오는 것', html.includes('.docgrid{display:grid'));
  check('좁은 화면에서는 위아래로 쌓인다', html.includes('.docgrid{grid-template-columns:1fr}'));
}

console.log('\n[v0.4-8] 인쇄 — 알림 말풍선이 종이에 찍히지 않는다');
{
  /* 선택자를 «글자 그대로» 찾던 자리입니다. 숨길 것이 하나 늘자(main) 깨졌습니다.
     지키려는 것은 「인쇄에서 토스트가 안 보인다」이므로, 인쇄 블록 안에서
     .leap-toast 가 display:none 규칙에 들어 있는지만 봅니다. */
  const printBlocks = [...html.matchAll(/@media\s+print\s*\{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
  const hidesToast = [...printBlocks.matchAll(/([^{}]+)\{[^}]*display\s*:\s*none[^}]*\}/g)]
    .some(m => m[1].includes('.leap-toast'));
  check('토스트를 인쇄에서 감춘다', hidesToast,
    '인쇄를 누르기 직전에 뜬 알림이 종이 한가운데에 검은 말풍선으로 찍혔다');
  check('일하는 화면 자체도 인쇄에서 감춘다',
    [...printBlocks.matchAll(/([^{}]+)\{[^}]*display\s*:\s*none[^}]*\}/g)]
      .some(m => /\bmain\b/.test(m[1])),
    '패널 이름을 하나하나 적어 숨기면 탭이 늘 때 조용히 새어 나온다');
}

console.log('\n[v0.4-9] AI 초안 — 목적 이름을 베껴 적지 않는다');
{
  check('낡은 목적 표를 지웠다', !html.includes("event: '연합 행사'"),
    '본체는 sports 인데 조각은 event 를 들고 있어 프롬프트에 영어 낱말이 그대로 나갔다');
  check('목적 이름을 창구에 물어본다', html.includes('goalName: function ()') && html.includes('H.goalName()'));
  check('셈한 것도 목적에 맞는 것만 넣는다',
    html.includes("H.useMod('bus')") && html.includes("H.useMod('team')"));
  check('버스가 아닌 일에는 임차료를 넣지 않는다', html.includes("x.bus && H && H.useMod && H.useMod('bus')"));
  /* 〔v0.5〕 창구가 **쓸 수도 있게** 되었습니다 — AI 초안을 담아야 하기 때문입니다.
     그래서 규칙을 바꿔 적습니다: 쓰는 문은 `setDoc` **하나뿐**이고,
     그 문으로 들어간 것은 전부 **되돌릴 수 있는 자리**(doc·plan·call)에만 닿습니다.
     담은 학교·인원·우리 학교는 이 문으로 바뀌지 않습니다 — 그것은 사람이 고른 것입니다. */
  check('쓰는 문은 setDoc 하나뿐이다', (() => {
    const m = html.match(/window\.LEAP_E = \{([\s\S]*?)\n  \};/);
    if (!m) return false;
    const names = [...m[1].matchAll(/^\s{4}(\w+):/gm)].map(x => x[1]);
    const writers = names.filter(n => /^set|^add|^remove|^clear/.test(n));
    return writers.length === 1 && writers[0] === 'setDoc';
  })(), '창구에 쓰는 함수가 늘면 어디서 자료가 바뀌는지 알 수 없게 된다');
  check('담은 학교와 인원은 창구로 바뀌지 않는다', (() => {
    const m = html.match(/setDoc: function \(put, plan, call\) \{([\s\S]*?)\n    \},/);
    return !!m && !/d\.picks|d\.me\b|meCount/.test(m[1]);
  })(), 'AI 가 학교를 담거나 인원을 채우면 안 된다 — 그것은 사람이 정한다');
}

/* ==========================================================================
   v0.5 — 옮겨 적는 품을 없앤다
   ========================================================================== */

console.log('\n[v0.5-1] 이웃 학교를 이름으로도 찾는다');
{
  H.reset(); H.setMe(GIRAN, 12);
  H.data().goal = 'trip'; H.data().radius = 90; H.data().doc = {}; H.save();
  H.render();
  const all = H.neighbors().all.length;
  check('찾기 전에는 범위 안이 다 나온다', H.neighbors().list.length === all);
  check('이름으로 좁힌다', (() => {
    H.setFind('임하');
    const n = H.neighbors();
    return n.list.length > 0 && n.list.length < all &&
      n.list.every(x => x.s.n.indexOf('임하') >= 0);
  })());
  check('초성으로도 좁힌다', (() => {
    H.setFind('ㅇㅎㅊ');
    return H.neighbors().list.some(x => x.s.n === '임하초등학교');
  })());
  check('좁혀도 거리 순서는 그대로', (() => {
    H.setFind('초');
    const l = H.neighbors().list;
    return l.every((x, i) => i === 0 || l[i - 1].km <= x.km);
  })(), '찾았다고 순서가 흐트러지면 「몇 번째로 가까운가」를 잃는다');
  check('범위 밖은 찾아도 안 나온다', (() => {
    H.setFind('포항');
    return H.neighbors().list.every(x => x.min <= H.radiusMin());
  })(), '이름으로 찾는 것이 범위를 뚫으면 안 된다');
  check('맞는 것이 없으면 그렇게 적는다', (() => {
    H.setFind('없는학교이름');
    H.render();
    return H.neighbors().list.length === 0 && app.near.includes('와 맞는 학교가 이 범위 안에 없습니다');
  })());
  H.setFind(''); H.render();
}

console.log('\n[v0.5-2] 제안서 양식이 목적마다 다르다');
{
  const secs = id => { H.data().goal = id; H.save(); return H.docSecs().map(s => s.n); };
  const trip = secs('trip'), gear = secs('gear'), pln = secs('pln');
  check('체험학습에는 「어떻게 다녀옵니다」', trip.includes('어떻게 다녀옵니다'));
  check('교구에는 「어떻게 나눠 씁니다」', gear.includes('어떻게 나눠 씁니다'));
  check('체험학습에는 「안전과 인솔」', trip.includes('안전과 인솔'));
  check('교구에는 「쓰는 규칙」', gear.includes('쓰는 규칙'),
    '체험학습 제안서에 「빌리는 기간과 고장」이 있으면 이상하다');
  check('학습공동체에는 「모임을 여는 조건」', pln.includes('모임을 여는 조건'));
  check('역할 표는 어느 목적에나 있다',
    [trip, gear, pln].every(s => s.includes('누가 무엇을 맡습니다')),
    '「좋다」까지 가 놓고 누가 버스를 계약할지에서 멈추는 일이 흔하다');

  check('목적을 바꾸면 종이의 절 이름도 바뀐다', (() => {
    H.data().goal = 'trip'; H.data().doc = {}; H.save();
    const a = H.docHTML();
    H.data().goal = 'gear'; H.save();
    const b = H.docHTML();
    return a.includes('안전과 인솔') && !a.includes('쓰는 규칙') &&
           b.includes('쓰는 규칙') && !b.includes('안전과 인솔');
  })());
  check('역할 표가 세 칸으로 나온다', (() => {
    H.data().goal = 'trip'; H.save();
    return /<th>무엇을<\/th><th>어느 학교가<\/th><th>언제까지<\/th>/.test(H.docHTML());
  })());
  check('맡을 학교를 안 적으면 「정하기」로 남는다', (() => {
    H.data().doc = { 'b.roles': '버스 계약||9월 20일까지' }; H.save();
    const d = H.docHTML(); H.data().doc = {}; H.save();
    return d.includes('정하기');
  })(), '빈칸으로 두면 아무도 못 알아본다');
  /* 왼쪽에서 고치는 차례와 오른쪽 종이의 차례가 같아야 한다 */
  check('고치는 차례와 종이의 차례가 같다', (() => {
    H.data().goal = 'trip'; H.data().doc = {}; H.save();
    const paper = H.docHTML();
    const order = H.docSecs()
      .map(s => s.n)
      .filter(n => paper.indexOf('>' + n + '<') >= 0)
      .map(n => paper.indexOf('>' + n + '<'));
    return order.every((v, i) => i === 0 || order[i - 1] < v);
  })(), '한쪽만 고치면 「내가 방금 쓴 절이 종이에서 어디 갔지」가 된다');
}

console.log('\n[v0.5-3] AI 가 준 답을 그대로 붙여 넣는다');
{
  check('모달에 받는 걸음이 있다', html.includes("id=\"aim-in\"") && html.includes("id=\"aim-take\""));
  check('받는 걸음은 take 를 준 앱에서만 나온다', html.includes('if (CFG.take) {'),
    '아이에 대한 글은 초안을 자동으로 집어넣을 성질이 아니다');
  check('프롬프트가 JSON 모양을 알려 준다',
    html.includes('[이 모양의 JSON 하나만 보내 주세요]') && html.includes('"roles": ['));
  check('설명이 섞여도 { } 사이만 골라낸다',
    html.includes("s.indexOf('{')") && html.includes("s.lastIndexOf('}')"));
  check('읽지 못하면 무엇을 하라고 말해 준다',
    html.includes('JSON 만 다시 보내 줘'));
  check('무엇이 담겼는지 그 자리에서 말해 준다', html.includes("res.className = 'aim-res '"));
  check('AI 가 쓴 글이라고 알린다', html.includes('상대 학교에 보내기 전에 꼭 읽어 보세요'));
  check('없는 수를 적어 오면 짚어 준다', html.includes('종이에 나가기 전에 확인하세요'));

  /* 전화 문안은 **종이에 나가지 않는다** */
  check('전화할 때 쓸 말은 화면에만 둔다', (() => {
    /* 제안서 화면은 담은 학교가 있어야 그려진다 */
    if (!H.data().picks.length) {
      const l = H.neighbors().list;
      H.pick(l[0].s, 7); H.pick(l[1].s, 9);
    }
    H.data().goal = 'trip'; H.data().doc = {};
    H.data().call = { phone: '안녕하세요 길안초 김OO입니다', message: '', official: '', budget: '' };
    H.save();
    const paper = H.docHTML();
    H.render();
    return !paper.includes('안녕하세요 길안초') && app.doc.includes('안녕하세요 길안초');
  })(), '거는 사람이 보는 쪽지이지 받는 학교에 보내는 글이 아니다');
  check('전화 문안이 없으면 카드도 없다', (() => {
    H.data().call = null; H.save(); H.render();
    return !app.doc.includes('전화할 때 쓸 말');
  })());
  /* 파일에서 열 때도 모양을 맞춰 받는다 */
  check('남의 파일에서 온 전화 문안도 걸러 받는다', (() => {
    const s = H.sanitize({ picks: [], call: { phone: 'x'.repeat(5000), 몰래: '나쁜것' } });
    return s.call && s.call.phone.length === 1500 && s.call.몰래 === undefined;
  })());
}


console.log('\n[kit] 사본이 낡지 않았는가 — 함정 46번');
{
  /* 앱은 kit 원본의 «사본»을 문서 안에 품고 있습니다 (원칙 10번).
     앱 H·I 는 그 사본에 LEAP.saveBlob 이 빠진 채 배포되어 «내려받기»가 던졌습니다.
     검사는 만드는 함수가 낸 «글자»만 보고 통과시켰습니다 — 만드는 데까지만 가 보고
     내보내는 데까지 가 보지 않았기 때문입니다.
     그래서 여기서는 기능이 아니라 «창구가 다 있는가»를 셉니다. */
  const _kSrc = require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
  const _kDef = new Set([..._kSrc.matchAll(/LEAP\.([A-Za-z]\w*)\s*=(?!=)/g)].map(m => m[1]));
  const _kUse = new Set();
  for (const m of _kSrc.matchAll(/\bLEAP\.([A-Za-z]\w*)\s*\(/g)) _kUse.add(m[1]);
  for (const m of _kSrc.matchAll(/[=,(]\s*LEAP\.([A-Za-z]\w*)\s*[;,)\n]/g)) _kUse.add(m[1]);
  const _kMiss = [..._kUse].filter(n => !_kDef.has(n));
  if (_kMiss.length) console.log('       빠진 것: ' + _kMiss.join(', '));
  check('★ 앱이 부르는 LEAP 창구가 사본에 다 있다', _kMiss.length === 0,
    '사본은 조용히 낡는다 — 원본을 고쳤으면 사본도 고칠 것');
}

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
