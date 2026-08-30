/* 몇 명이면 되나 — 점검
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
  const store = { 'leap-howmany-v1': state ? JSON.stringify(state) : null };
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
      title: '몇 명이면 되나 — TEAM LEAP',
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
    get see() { return get('panel-see'); },
    get school() { return get('panel-school'); }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

const mk = (over) => Object.assign({
  v: 1, info: { school: '길안초등학교', kind: 'e', area: '읍면' },
  bands: 6, fix: {}, now: 24, ahead: [null, null], year: 0, items: null
}, over);

console.log('\n[1] 빈 화면 — 무엇부터 하라고 말하는가');
let r = run(null);
check('첫 화면이 한 가지만 묻는다', r.see.includes('올해 전교생이 몇 명입니까'),
  '밀 것이 없는 슬라이더는 무엇을 하라는 말도 못 하면서 자리만 차지한다');
check('그 자리에서 바로 답할 수 있다', r.see.includes('id="q-now"') && r.see.includes('id="q-go"'),
  '「우리 학교」 탭으로 보내면 한 걸음이 더 는다');
check('이 앱이 무엇인지 한 줄로 말한다', r.see.includes('사람 수가 정하는 것'));
check('빈 화면에서도 셈을 들이밀지 않는다', !r.see.includes('됩니다</span>'),
  '아무 수도 없는데 「됩니다 0」을 보이면 셈한 것처럼 읽힌다');
check('우리 학교 화면은 늘 그려진다', r.school.includes('올해 사람 수'));
check('학생 이름을 받지 않는다고 적는다',
  html.includes('학생 이름은 받지 않습니다') || html.includes('이름도 학년도 받지 않습니다'));

console.log('\n[2] 심장 — 밀면 갈린다');
r = run(mk({ now: 24 }));
const H = r.hook;
check('미는 자리가 화면 맨 위에 있다', r.see.indexOf('id="dial"') < r.see.indexOf('class="tally"'),
  '표를 채우는 도구가 아니라 밀어 보는 도구다');
check('지금 사람 수가 크게 적힌다', r.see.includes('class="n">24<'));
check('밀어 보라고 말한다', r.see.includes('밀어 보세요'));

console.log('\n[3] 세 갈래 — 된다 · 아슬하다 · 안 된다');
const item = (need) => ({ id: 'x', n: 't', cat: 'sport', need: need, src: 'ours', note: '', alt: '', check: false, off: false });
check('기준을 못 넘기면 안 된다', H.stateOf(item(30), 24) === 'no');
check('기준을 넉넉히 넘기면 된다', H.stateOf(item(10), 24) === 'go');
check('★ 기준을 갓 넘기면 «아슬하다»', H.stateOf(item(24), 24) === 'edge',
  '「지금은 되지만 두 명만 줄면 사라진다」가 이 앱의 이유다');
check('아슬한 폭이 2명이다', H.EDGE === 2);
check('사람 수를 모르면 모른다고 한다', H.stateOf(item(10), null) === 'unknown',
  '안 적은 해를 올해와 같다고 보면 지어낸 수가 된다');
check('몇 명 모자란지 셈한다', H.shortBy(item(30), 24) === 6);

console.log('\n[4] 앞으로 — 이 앱을 여는 이유');
r = run(mk({ now: 24, ahead: [12, 8], year: 1 }));
const H2 = r.hook;
const d2 = H2.db.get();
check('안 적은 해는 셈하지 않는다', H2.headOf(H2.fill(mk({ ahead: [null, null] })), 1) === null);
check('★ 그 해에 «새로» 사라지는 것을 셈한다', H2.lost(d2, 1).length > 0,
  '올해는 되는데 그 해에는 안 되는 것');
check('사라지는 것을 이름 대어 말한다', r.see.includes('사라지는 것'));
const goneNames = H2.lost(d2, 1).map(x => x.n);
check('사라지는 것을 이름으로 셀 수 있다', Array.isArray(goneNames));

console.log('\n[4-2] ★ 누가 모이는가 — 이 앱이 거짓말을 하지 않는 자리');
/* 전교생 24명 · 6학년 → 한 학년 4명 · 고학년 8명.
   축구부는 «고학년 8명»에서 모이므로 11명 기준을 못 넘깁니다.
   전교생 24명과 견주면 「됩니다」가 되는데, 그건 거짓말입니다. */
r = run(mk({ now: 24 }));
const H3 = r.hook, d3 = H3.db.get();
check('무리를 셋으로 나눈다', H3.POOLS.length === 3);
check('전교생은 그대로', H3.poolAt(d3, 0, 'all') === 24);
check('한 학년은 학년 수로 나눈다', H3.poolAt(d3, 0, 'one') === 4);
check('고학년은 두 학년으로 본다', H3.poolAt(d3, 0, 'high') === 8);
const soccer = H3.live(d3).find(x => x.n === '축구부');
check('축구부는 고학년에서 모인다', soccer.pool === 'high');
check('★ 전교생 24명이어도 축구부는 안 된다',
  H3.stateOf(soccer, H3.poolAt(d3, 0, soccer.pool)) === 'no',
  '전교생 전부가 축구부에 오지 않는다. 전교생과 견주면 거짓말이 된다');
check('화면이 어느 무리인지 밝힌다', r.see.includes('고학년에서'));
check('미는 자리가 무리별 수를 보여 준다', r.see.includes('dial-pools'));
/* 손으로 고친 값이 셈한 값을 이깁니다 */
r = run(mk({ now: 24, fix: { high: 20 } }));
const H4 = r.hook, d4 = H4.db.get();
check('손으로 고친 값이 셈한 값을 이긴다', H4.poolAt(d4, 0, 'high') === 20);
check('셈한 값이 무엇인지도 알려 준다', H4.autoPool(d4, 'high') === 8);
check('손으로 고쳤다고 화면에 표시한다', r.see.includes('손으로 고침'));
/* 다른 해에는 전교생이 준 만큼 무리도 줄어야 합니다 */
r = run(mk({ now: 24, fix: { high: 20 }, ahead: [12, null], year: 1 }));
const H5 = r.hook, d5 = H5.db.get();
check('★ 내년을 밀면 손질한 무리도 함께 준다', H5.poolAt(d5, 1, 'high') === 10,
  '그러지 않으면 「내년」을 밀어도 무리가 안 줄어 거짓이 된다');

console.log('\n[5] 안 되면 어떻게 — 이 앱이 하려는 말의 절반');
r = run(mk({ now: 6 }));
check('★ 안 되는 것에 대안을 붙인다', r.see.includes('이렇게 하면 됩니다'));
check('축구가 안 되면 풋살을 말한다', r.see.includes('풋살'));
/* 12명이면 되는 것과 안 되는 것이 섞입니다 — 대안은 «안 되는 쪽에만» 붙어야 합니다 */
r = run(mk({ now: 60 }));
{
  const Hx = r.hook, dx = Hx.db.get();
  const alts = (r.see.match(/이렇게 하면 됩니다/g) || []).length;
  const bad = Hx.live(dx).filter(x =>
    Hx.stateOf(x, Hx.poolAt(dx, 0, x.pool)) !== 'go').length;
  check('되는 것에는 참견하지 않는다', alts === bad,
    '잘 되고 있는데 대안을 들이미는 것은 참견이다 — 대안 ' + alts + '개 / 안 되거나 아슬한 것 ' + bad + '개');
}
r = run(mk({ now: 900 }));
check('다 되면 대안이 하나도 안 나온다', !r.see.includes('이렇게 하면 됩니다'));

console.log('\n[6] 기준값 — 어디서 온 수인지 밝힌다');
check('출처를 세 갈래로 나눈다', Object.keys(H.SRC).length === 3);
check('경기 규칙과 학교가 정하는 것을 가른다', !!(H.SRC.rule && H.SRC.ours && H.SRC.gyo));
check('기본 목록이 저마다 출처를 갖는다', H.SEED.every(x => H.SRC[x.src]));
check('축구는 경기 규칙이다', H.SEED.find(x => x.n === '축구부').src === 'rule');
check('방과후 개설 인원은 학교가 정한다', H.SEED.find(x => /방과후/.test(x.n)).src === 'ours');
check('★ 경북 기준은 «확인하라»고 적는다',
  H.SEED.filter(x => x.src === 'gyo').every(x => x.check),
  '해마다 바뀌는 수를 확정처럼 보이면 안 된다');
r = run(mk({ now: 24 }));
check('화면에도 출처가 적힌다', r.see.includes('경기 규칙'));

console.log('\n[7] 안 되는 것을 먼저 보여 준다');
r = run(mk({ now: 8 }));
const iNo = r.see.indexOf('card2--no'), iGo = r.see.indexOf('card2--go');
check('안 되는 카드가 되는 카드보다 위에 온다', iNo >= 0 && (iGo < 0 || iNo < iGo),
  '잘 되는 것은 볼 일이 적다');

console.log('\n[7-2] ★ 왼쪽에서 적고 오른쪽에서 본다');
r = run(mk({ now: 24 }));
check('일하는 화면이 두 칸이다', r.see.includes('class="wb"') && r.see.includes('wb-out'),
  '「종이」가 따로 있는 탭이면 다 적고 나서야 무엇이 나오는지 알게 된다');
check('오른쪽에 나올 종이가 늘 있다', r.see.includes('id="pv-page"'));
check('오른쪽에서 바로 인쇄할 수 있다', r.see.includes('id="btn-print"'));
check('종이 탭이 따로 없다', !html.includes('id="tab-paper"'),
  '오른쪽에 늘 보이는데 탭을 또 두면 같은 것이 두 곳에 있게 된다');
check('빈 화면에서도 오른쪽 칸이 선다', run(null).see.includes('wb-out'),
  '처음 여는 사람이 «무엇이 나오는지»를 먼저 봐야 한다');
check('상자 폭에 맞춰 줄인다', html.includes('LEAP.fitPaper('));
check('창 폭이 바뀌면 다시 맞춘다', html.includes("'resize'"));

console.log('\n[8] 종이');
r = run(mk({ now: 24 }));
const p = r.hook.paperHTML();
check('학교 이름이 적힌다', p.includes('길안초등학교'));
check('어느 해인지 적힌다', p.includes('올해'));
check('셈이 적힌다', p.includes('됩니다'));
check('안 되면 어떻게 하는지도 종이에 나간다', p.includes('안 되면'));
check('기준의 출처가 종이에 나간다', p.includes('이 표의 기준은 어디서 왔나'));
check('종이에는 링크를 넣지 않는다', !p.includes('href='));
check('저작권이 들어간다', p.includes('2026 TEAM LEAP'));
check('종이에는 미는 자리가 없다', !p.includes('type="range"'),
  '슬라이더는 종이에서 뜻이 없다');

console.log('\n[9] PDF 이름 — 함정 27번');
check('학교와 해와 날짜가 들어간다', /길안초등학교/.test(r.hook.printFileName()) &&
  /올해/.test(r.hook.printFileName()));
r = run(mk({ now: 24, ahead: [20, 18], year: 2 }));
check('★ 해가 다르면 파일 이름도 다르다', /내후년/.test(r.hook.printFileName()),
  '올해 것과 내년 것이 같은 이름이면 내려받기 폴더에서 구별이 안 된다');
check('파일 이름에 못 쓰는 글자를 걷어낸다',
  !/[\\/:*?"<>|]/.test(run(mk({ info: { school: 'A/B:C*D' }, now: 10 })).hook.printFileName()));

console.log('\n[10] AI 초안 — 아무것도 보내지 않는다');
r = run(mk({ now: 8 }));
check('서버를 부르지 않는다', !/\bfetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon/.test(html));
const pr = r.hook.buildPrompt();
check('사람 수만 나간다고 적는다', html.includes('사람 수만 나갑니다'));
check('안 되는 것을 프롬프트에 담는다', pr.includes('[안 되는 것]'));
check('아슬한 것도 담는다', pr.includes('[아슬한 것'));
check('★ 「학생을 늘리자」는 답을 막는다', pr.includes('학생을 늘리자'),
  '학교가 할 수 있는 일이 아닌 답은 도움이 안 된다');
check('지어내지 말라고 적는다', pr.includes('지어내지 마세요'));
check('대안을 달라고 적는다', pr.includes('대안'));

console.log('\n[11] 남의 파일 · 저장');
check('내보낼 때 이 앱 표시를 적는다', html.includes("LEAP.stamp(APP_ID"));
check('가져올 때 표시를 읽는다', html.includes('LEAP.otherApp(APP_ID'));
check('모양도 함께 본다', html.includes('Array.isArray(obj.items)'));
check('저장 창구가 아홉 앱과 같다',
  html.includes('update:function(fn){var d=read();fn(d);return flush();}'));
check('저장 실패를 잡는다', html.includes('저장 공간이 가득 찼습니다'));

console.log('\n[12] 되돌리기 — 되돌릴 수 없는 일에는 길을 둔다');
check('치운 것을 되돌릴 수 있다', html.includes("LEAP.offerUndo('「' + nm + '」을 치웠습니다."));
check('지운 것을 되돌릴 수 있다', /offerUndo\([^)]*지웠습니다/.test(html));
check('전체 지우기도 되돌릴 수 있다', html.includes('적으신 것을 모두 지웠습니다.'));
check('가져오기도 되돌릴 수 있다', html.includes('파일에서 가져왔습니다.'));

console.log('\n[13] 낡은 저장본을 견딘다 — 함정 10번');
check('빈 것을 넣어도 안 죽는다', !!H.fill(null).items);
check('모르는 칸이 와도 걸러 받는다', H.fill({ v: 1, items: [{ n: 'x', need: 'abc', src: '없는것' }] }).items[0].need === 1);
check('사람 수는 범위 안으로 접는다', H.fill({ now: 99999 }).now === 3000);
check('음수는 0 으로', H.fill({ now: -5 }).now === 0);
check('모르는 갈래는 스포츠로 돌린다', H.fill({ items: [{ n: 'x', need: 3, cat: '없는것' }] }).items[0].cat === 'sport');

console.log('\n[14] 이 앱이 지키는 것');
/* 이 앱은 «사람 수»만 다룹니다. 학생 하나하나를 적는 칸이 생기면
   카탈로그의 개인정보 안내가 또 거짓이 됩니다(1단계에서 앱 G 로 겪은 자리). */
{
  const fields = html.match(/<(?:input|select|textarea)\b[^>]*>/g) || [];
  const perStudent = fields.filter(t => /data-nm=|data-student|이름을 적/.test(t));
  check('학생 하나하나를 적는 칸이 없다', perStudent.length === 0, perStudent.join(' '));
  check('사람 수만 다룬다고 적는다', html.includes('사람 수'));
}
check('바깥 파일을 부르지 않는다',
  !/<script[^>]+src=|<link[^>]+stylesheet/.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')));
check('인쇄 서식이 있다', /@media\s+print/.test(html));
check('화면에 판 번호가 없다',
  !/v0\.\d+|프로토타입/.test(html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')));
check('저작권이 있다', html.includes('© 2026 TEAM LEAP'));
check('본문으로 건너뛰는 길이 있다', html.includes('<a class="skip" href="#main">'));
check('창에 초점을 가둔다', html.includes('LEAP.guardModals'));
check('다른 창의 저장을 알아챈다', html.includes("LEAP.watchOtherTabs('leap-howmany-v1')"));
check('머리에 설명서로 가는 길이 있다', html.includes('href="./README.html"'));
check('작은 단추가 44px 이다', /\.btn--sm\{[^}]*min-height:44px/.test(html));

console.log('\n[kit] 사본이 낡지 않았는가 — 함정 46번');
{
  const kitSrc = fs.readFileSync(path.join(__dirname, '..', 'kit', 'leap.js'), 'utf8');
  const need = [...js.matchAll(/LEAP\.(\w+)\s*\(/g)].map(m => m[1])
    .concat(['esc']);   /* esc 는 별명(var esc = LEAP.esc)으로 쓴다 */
  /* `LEAP.clone=clone;` 처럼 «함수를 이름으로 넘기는» 창구도 있습니다 */
  const have = new Set([...js.matchAll(/LEAP\.(\w+)\s*=\s*(?:function|[A-Za-z_$][\w$]*\s*;)/g)].map(m => m[1]));
  const missing = [...new Set(need)].filter(n => !have.has(n));
  check('★ 앱이 부르는 LEAP 창구가 사본에 다 있다', missing.length === 0, missing.join(' · '));
  check('원본이 이 앱을 알고 있다', kitSrc.includes("'leap-howmany'"),
    'APP_NAMES 에 없으면 다른 앱이 이 파일을 「다른 앱」으로만 읽는다');
}

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
