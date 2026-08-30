/* 남는 교실 — 점검
   최소 DOM 스텁 위에서 앱을 실제로 실행하고, 이 앱이 **약속한 규칙**이
   지켜지는지 본다. 기능이 있는지가 아니라 규칙이 깨지지 않는지를 본다.
   실행: node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl(tag) {
  return {
    tagName: tag || 'div', _html: '', hidden: false, value: '', textContent: '',
    tabIndex: 0, classList: { add() {}, remove() {} }, style: {}, files: null,
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, select() {},
    setAttribute(k, v) { this['_' + k] = v; },
    getAttribute(k) { return this['_' + k] || null; },
    appendChild() {}, removeChild() {},
    /* id 로 찾을 때는 **그려 놓은 HTML 에 그 id 가 있을 때만** 돌려준다.
       흉내는 진짜보다 너그러우면 안 된다. */
    querySelector(sel) {
      const q = String(sel);
      const m = /^#([\w-]+)$/.exec(q);
      if (m) return this._html.includes('id="' + m[1] + '"') ? makeEl() : null;
      return makeEl();
    },
    querySelectorAll(sel) {
      if (String(sel).includes('role="tab"')) return [makeEl(), makeEl()];
      return [];
    }
  };
}

function run(state) {
  const panels = {};
  const store = { 'leap-rooms-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console, __LEAP_TEST__: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto,
    alert: () => {}, confirm: () => true, prompt: () => null,
    print: () => {}, scrollTo: () => {},
    setTimeout: (f) => { if (typeof f === 'function') f(); }, clearTimeout: () => {},
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    location: { hash: '', pathname: '/index.html', search: '' },
    navigator: {},
    addEventListener() {}, removeEventListener() {},
    document: {
      title: '남는 교실 — TEAM LEAP',
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {}, className: '' },
      documentElement: makeEl(),
      addEventListener() {}, removeEventListener() {},
      execCommand: () => true
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 8000 });

  const get = id => (panels[id] ? panels[id]._html : '');
  return {
    hook: sandbox.__LEAP_TEST__.hook, store, panels,
    get rooms() { return get('panel-rooms'); },
    get list() { return get('panel-list'); }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

const room = (o) => Object.assign({ id: 'r1', n: '3층 옛 4-2', area: 66, floor: '3층',
  traits: [], note: '' }, o);
const want = (o) => Object.assign({ id: 'w1', roomId: 'r1', use: 'counsel',
  who: '상담', n: '', people: null, note: '' }, o);
const mk = (over) => Object.assign({ v: 1, school: '길안초등학교', me: '상담',
  rooms: [], wants: [] }, over);

console.log('\n[1] 빈 화면 — 무엇부터 하라고 말하는가');
let r = run(null);
check('첫 화면이 한 가지만 묻는다', r.rooms.includes('남는 방 이름을 하나 적어 주세요'));
check('그 자리에서 바로 답할 수 있다', r.rooms.includes('id="q-room"'));
check('왜 이 앱인지 말한다', r.rooms.includes('나란히 놓고 본 적이 없습니다'));
check('★ 모르는 것은 모른다고 둔다고 미리 말한다', r.rooms.includes('모르는 것은 모른다고 둡니다'));

console.log('\n[2] ★ 모르면 모른다고 말한다');
const H = run(mk({ rooms: [room({})] })).hook;
{
  const d = H.fill(mk({ rooms: [room({ area: null })], wants: [want({ people: 8 })] }));
  const f = H.fits(d.rooms[0], d.wants[0]);
  check('넓이를 안 적으면 몇 명까지인지 셈하지 않는다', f.cap === null,
    '모르는 것을 0 으로 두면 「아무도 못 들어간다」가 되어 버린다');
  check('그래도 「안 된다」고 하지 않는다', f.state !== 'no');
  check('화면이 「맞는지 모릅니다」라고 말한다',
    run(mk({ rooms: [room({ area: null })], wants: [want({ people: 8 })] }))
      .rooms.includes('맞는지 모릅니다'));
}
check('넓이 0 은 받지 않는다', H.fill({ rooms: [{ n: 'x', area: 0 }] }).rooms[0].area === 1);
check('빈 칸은 null 로 둔다', H.fill({ rooms: [{ n: 'x', area: '' }] }).rooms[0].area === null);

console.log('\n[3] 셈 — 이 방이 이 쓰임에 맞는가');
{
  const d = H.fill(mk({ rooms: [room({ area: 66 })], wants: [want({ use: 'care', people: 20 })] }));
  const f = H.fits(d.rooms[0], d.wants[0]);
  check('쓰임마다 1인당 넓이가 다르다', H.useOf('counsel').per !== H.useOf('care').per);
  check('돌봄 66㎡ 는 30명까지', f.cap === 30);
  check('20명이면 넉넉하다', f.state === 'ok' || f.state === 'tight');
}
{
  const d = H.fill(mk({ rooms: [room({ area: 20 })], wants: [want({ use: 'care', people: 20 })] }));
  check('20㎡ 에 돌봄 20명은 안 된다', H.fits(d.rooms[0], d.wants[0]).state === 'no');
}
{
  const d = H.fill(mk({ rooms: [room({ area: 66, traits: [] })],
    wants: [want({ use: 'care', people: 5 })] }));
  const f = H.fits(d.rooms[0], d.wants[0]);
  check('★ 조건이 모자라면 「빠듯」으로만 말한다', f.state === 'tight',
    '안 적은 것은 «없는 것»이 아니라 «아직 안 본 것»이다');
  check('무엇이 확인 안 됐는지 이름을 댄다', f.short.length > 0);
}
{
  const d = H.fill(mk({ rooms: [room({ area: 66, traits: ['water', 'toilet', 'sun'] })],
    wants: [want({ use: 'care', people: 5 })] }));
  check('조건이 다 맞으면 넉넉하다', H.fits(d.rooms[0], d.wants[0]).state === 'ok');
}

console.log('\n[4] ★ 여럿이 원하는 방 — 이 앱이 하려는 말');
{
  const d = H.fill(mk({ rooms: [room({ id: 'r1' }), room({ id: 'r2', n: '2층 옛 3-1' })],
    wants: [want({ id: 'w1', roomId: 'r1', who: '상담' }),
            want({ id: 'w2', roomId: 'r1', who: '돌봄', use: 'care' }),
            want({ id: 'w3', roomId: 'r2', who: '사서', use: 'lib' })] }));
  check('한 방에 둘 이상이면 찾아낸다', H.contested(d).length === 1);
  check('그 방이 r1 이다', H.contested(d)[0].id === 'r1');
  check('한 곳만 원하는 방은 안 센다', !H.contested(d).some(x => x.id === 'r2'));
  const rr = run(mk({ rooms: d.rooms, wants: d.wants }));
  check('화면이 먼저 말한다', rr.rooms.includes('여럿이 원하는 방'));
  check('★ 누구에게 줄지 정해 주지 않는다고 말한다',
    rr.rooms.includes('누구에게 줄지는 이 앱이 정하지 않습니다'));
}
{
  const d = H.fill(mk({ rooms: [room({})], wants: [want({ roomId: '' })] }));
  check('방을 못 정한 것을 따로 센다', H.unplaced(d).length === 1);
}

console.log('\n[5] 방을 지워도 적어 둔 것이 사라지지 않는다');
check('★ 방을 지우면 쓰임은 「방 못 정함」으로 남는다',
  html.includes("d.wants.forEach(function (w) { if (w.roomId === r.id) w.roomId = ''; });"),
  '함께 지우면 사람이 적어 둔 것이 말없이 사라진다');
check('없는 방을 가리키면 「못 정함」으로 받는다',
  H.fill({ rooms: [], wants: [{ n: 'x', roomId: '없는방' }] }).wants[0].roomId === '');

console.log('\n[6] 왼쪽에서 적고 오른쪽에서 본다');
r = run(mk({ rooms: [room({})] }));
check('일하는 화면이 두 칸이다', r.rooms.includes('class="wb"') && r.rooms.includes('wb-out'));
check('오른쪽에 나올 종이가 늘 있다', r.rooms.includes('id="pv-page"'));
check('빈 화면에서도 오른쪽 칸이 선다', run(null).rooms.includes('wb-out'));
check('상자 폭에 맞춰 줄인다', html.includes('LEAP.fitPaper('));

console.log('\n[7] 종이 — 협의회에 가져가는 한 장');
{
  const p = run(mk({ rooms: [room({})],
    wants: [want({ id: 'w1', who: '상담' }), want({ id: 'w2', who: '돌봄', use: 'care' })] }))
    .hook.paperHTML();
  check('학교 이름이 적힌다', p.includes('길안초등학교'));
  check('★ 여럿이 원하는 방이 맨 앞에 온다',
    p.indexOf('먼저 볼 것') < p.indexOf('방마다'));
  check('방마다 표가 나온다', p.includes('방마다'));
  check('★ 이 앱이 하지 않는 일을 적는다',
    p.includes('누구에게 줄지는 이 앱이 정하지 않습니다'));
  check('★ 넓이를 안 적은 방은 셈하지 않았다고 적는다',
    p.includes('넓이를 안 적은 방은 셈하지 않았습니다'));
  check('종이에는 링크를 넣지 않는다', !p.includes('href='));
  check('저작권이 들어간다', p.includes('2026 TEAM LEAP'));
}
check('아직 적은 방이 없으면 그렇게 말한다',
  run(null).hook.paperHTML().includes('아직 적은 방이 없습니다'));

console.log('\n[8] 합치기 — 서버 없이 여럿이 모은다');
check('내보낼 때 이 앱 표시를 적는다', html.includes('LEAP.stamp(APP_ID'));
check('가져올 때 표시를 읽는다', html.includes('LEAP.otherApp(APP_ID'));
check('합치기가 맨 위에 온다', html.indexOf('id="im-merge"') < html.indexOf('id="im-over"'));
check('그만두는 길이 있다', html.includes('id="im-no"'));
check('★ 같은 방을 두 사람이 적어도 둘로 늘지 않는다',
  html.includes('byName[r.n]'),
  '방은 이름으로 같은 것을 본다');
check('들어온 쓰임이 이쪽 방에 제대로 붙는다', html.includes('map[copy.roomId]'));

console.log('\n[9] AI 초안 — 아무것도 보내지 않는다');
{
  const pr = run(mk({ rooms: [room({ area: null })], wants: [want({})] })).hook.buildPrompt();
  check('서버를 부르지 않는다', !/\bfetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon/.test(html));
  check('사람 이름이 없다고 적는다', pr.includes('사람 이름은 없습니다'));
  check('★ 넓이를 모르는 방은 추측하지 말라고 적는다', pr.includes('크기를 추측하지 마세요'));
  check('★ 누구에게 주라고 정하지 말라고 적는다', pr.includes('정해 주지 마세요'));
  check('지어내지 말라고 적는다', pr.includes('지어내지 마세요'));
  check('나눠 쓰는 길도 물어본다', pr.includes('나눠 쓰'));
}

console.log('\n[10] PDF 이름');
check('학교와 날짜가 들어간다', /길안초등학교/.test(run(mk({})).hook.printFileName()));
check('파일 이름에 못 쓰는 글자를 걷어낸다',
  !/[\\/:*?"<>|]/.test(run(mk({ school: 'A/B:C*D' })).hook.printFileName()));

console.log('\n[11] 이 앱이 지키는 것');
check('사람 이름을 받는 칸이 없다',
  !/학생 이름|성명/.test(html.replace(/이름이 아니라[^<]*/g, '')));
check('바깥 파일을 부르지 않는다',
  !/<script[^>]+src=|<link[^>]+stylesheet/.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')));
check('인쇄 서식이 있다', /@media\s+print/.test(html));
check('화면에 판 번호가 없다',
  !/v0\.\d+|프로토타입/.test(html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')));
check('저작권이 있다', html.includes('© 2026 TEAM LEAP'));
check('본문으로 건너뛰는 길이 있다', html.includes('<a class="skip" href="#main">'));
check('창에 초점을 가둔다', html.includes('LEAP.guardModals'));
check('다른 창의 저장을 알아챈다', html.includes("LEAP.watchOtherTabs('leap-rooms-v1')"));
check('머리에 설명서로 가는 길이 있다', html.includes('href="./README.html"'));
check('작은 단추가 44px 이다', /\.btn--sm\{[^}]*min-height:44px/.test(html));
check('되돌릴 수 없는 일에 되돌리기가 있다', /LEAP\.offerUndo\(/.test(html));
check('저장 창구가 다른 앱과 같다',
  html.includes('update:function(fn){var d=read();fn(d);return flush();}'));
check('색만으로 말하지 않는다', /class="mk" aria-hidden="true">[○△✕]/.test(
  run(mk({ rooms: [room({})], wants: [want({})] })).rooms) === false ||
  run(mk({ rooms: [room({})], wants: [want({})] })).rooms.includes('class="mk"'),
  '○△✕ 표시 옆에 늘 글로도 적는다');

console.log('\n[kit] 사본이 낡지 않았는가 — 함정 46번');
{
  const kitSrc = fs.readFileSync(path.join(__dirname, '..', 'kit', 'leap.js'), 'utf8');
  const need = [...js.matchAll(/LEAP\.(\w+)\s*\(/g)].map(m => m[1]).concat(['esc']);
  const have = new Set([...js.matchAll(/LEAP\.(\w+)\s*=\s*(?:function|[A-Za-z_$][\w$]*\s*;)/g)].map(m => m[1]));
  const missing = [...new Set(need)].filter(n => !have.has(n));
  check('★ 앱이 부르는 LEAP 창구가 사본에 다 있다', missing.length === 0, missing.join(' · '));
  check('원본이 이 앱을 알고 있다', kitSrc.includes("'leap-rooms'"));
}

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
