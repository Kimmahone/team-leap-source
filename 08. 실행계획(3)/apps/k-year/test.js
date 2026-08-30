/* 우리 학교 한 해 — 점검
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
  const store = { 'leap-year-v1': state ? JSON.stringify(state) : null };
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
      title: '우리 학교 한 해 — TEAM LEAP',
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
    get year() { return get('panel-year'); },
    get mine() { return get('panel-mine'); }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

const job = (o) => Object.assign(
  { id: 'j' + Math.random().toString(36).slice(2, 7), who: '3학년 담임',
    n: '학예회', wk: 0, wt: 'mid', fixed: false, note: '' }, o);
const mk = (over) => Object.assign(
  { v: 1, school: '길안초등학교', me: '3학년 담임', jobs: [] }, over);

console.log('\n[1] 빈 화면 — 무엇부터 하라고 말하는가');
let r = run(null);
check('첫 화면이 한 가지만 묻는다', r.year.includes('맡으신 자리를 적어 주세요'),
  '빈 달력을 먼저 보여 주면 무엇을 해야 하는지 알 수 없다');
check('그 자리에서 바로 답할 수 있다', r.year.includes('id="q-me"') && r.year.includes('id="q-go"'));
check('★ 이름이 아니라 «자리»를 받는다고 말한다',
  r.year.includes('이름이 아니라') && r.year.includes('이름을 받지 않습니다'),
  '합쳤을 때 누구 일인지 알아볼 수 있으면 충분하다');
check('왜 이 앱인지 한 줄로 말한다', r.year.includes('일이 언제 겹치는지는 아무도 모릅니다'));

console.log('\n[2] 한 해는 3월에 시작한다');
const H = run(mk({ jobs: [job({})] })).hook;
check('3월부터 이듬해 2월까지다', H.MONTHS[0] === 3 && H.MONTHS[11] === 2,
  '1월부터 늘어놓으면 학년도가 두 동강 나서 몰리는 자리가 흩어진다');
check('한 달을 넷으로 본다', H.WPM === 4, '「11월 둘째 주」로 부르는 말 그대로');
check('마흔여덟 주다', H.WEEKS === 48);
check('첫 칸이 3월 첫째 주다', H.weekName(0) === '3월 첫째 주');
check('마지막 칸이 2월 넷째 주다', H.weekName(47) === '2월 넷째 주');

console.log('\n[3] 셈 — 개수가 아니라 «무게»로');
check('큰 일이 작은 일보다 무겁다', H.weightOf('big').w > H.weightOf('small').w,
  '개수만 세면 학예회와 안내문이 같아진다');
{
  const d = H.fill(mk({ jobs: [job({ wk: 5, wt: 'big' })] }));
  check('큰 일 하나가 무게 3', H.loadAt(d, 5) === 3);
  const d2 = H.fill(mk({ jobs: [job({ wk: 5, wt: 'small' }), job({ wk: 5, wt: 'small' })] }));
  check('작은 일 둘이 무게 2', H.loadAt(d2, 5) === 2);
  check('큰 일 하나 > 작은 일 둘', H.loadAt(d, 5) > H.loadAt(d2, 5));
}
{
  const d = H.fill(mk({ jobs: [
    job({ wk: 8, who: '3학년 담임' }), job({ wk: 8, who: '3학년 담임' }),
    job({ wk: 8, who: '정보부' })] }));
  check('같은 사람이 둘을 맡아도 한 사람으로 센다', H.peopleAt(d, 8) === 2);
  check('그 주의 일 개수는 그대로', H.jobsAt(d, 8).length === 3);
}

console.log('\n[4] ★ 몰린 주 — 이 앱이 하려는 말');
{
  const d = H.fill(mk({ jobs: [
    job({ wk: 20, wt: 'big', n: '학예회', fixed: true }),
    job({ wk: 20, wt: 'big', n: '정보공시', who: '정보부', fixed: true }),
    job({ wk: 30, wt: 'big', n: '수업나눔' }),
    job({ wk: 30, wt: 'mid', n: '협의회', who: '연구부' })] }));
  const hot = H.hotWeeks(d);
  check('몰린 주를 찾아낸다', hot.length === 2);
  check('★ 옮길 수 없는 일이 겹친 주가 «맨 앞»에 온다', hot[0].wk === 20 && hot[0].hard,
    '「일이 많은 주」보다 「못 옮기는 일이 겹친 주」가 먼저 알아야 하는 것이다');
  check('옮길 수 있는 일끼리 겹친 것은 뒤로', hot[1].wk === 30 && !hot[1].hard);
  check('가벼운 주는 몰렸다고 하지 않는다', H.hotWeeks(H.fill(mk({
    jobs: [job({ wk: 3, wt: 'small' })] }))).length === 0);
}

console.log('\n[5] 색만으로 말하지 않는다');
r = run(mk({ jobs: [job({ wk: 20 }), job({ wk: 20 }), job({ wk: 20 })] }));
check('칸 안에 일 개수가 적힌다', /data-wk="20"[^>]*>3</.test(r.year),
  '색의 진하기만으로 알리면 색을 못 가리는 분이 읽을 수 없다');
check('칸마다 읽어 주는 이름이 붙는다', /aria-label="[^"]*주 — 일 \d+개"/.test(r.year));
check('무슨 색이 무엇인지 글로도 적는다', r.year.includes('많이 몰림'));

console.log('\n[6] 왼쪽에서 적고 오른쪽에서 본다');
check('일하는 화면이 두 칸이다', r.year.includes('class="wb"') && r.year.includes('wb-out'));
check('오른쪽에 나올 종이가 늘 있다', r.year.includes('id="pv-page"'));
check('빈 화면에서도 오른쪽 칸이 선다', run(null).year.includes('wb-out'));
check('상자 폭에 맞춰 줄인다', html.includes('LEAP.fitPaper('));

console.log('\n[7] 종이 — 협의회에 가져가는 한 장');
{
  const d = mk({ jobs: [
    job({ wk: 20, wt: 'big', fixed: true }),
    job({ wk: 20, wt: 'big', who: '정보부', n: '정보공시', fixed: true })] });
  const p = run(d).hook.paperHTML();
  check('학교 이름이 적힌다', p.includes('길안초등학교'));
  check('★ 몰린 주가 맨 앞에 온다', p.indexOf('먼저 볼 것') < p.indexOf('한 해 전체'),
    '협의회에서 먼저 볼 것이 그것이다');
  check('한 해 전체도 나온다', p.includes('한 해 전체'));
  check('못 옮기는 일에 표가 붙는다', p.includes('🔒'));
  check('★ 이 앱이 하지 않는 일을 적는다', p.includes('무엇을 옮길지는 사람이 정합니다'),
    '겹친 것을 보여 줄 뿐이고 대신 옮겨 주지 않는다');
  check('종이에는 링크를 넣지 않는다', !p.includes('href='));
  check('저작권이 들어간다', p.includes('2026 TEAM LEAP'));
}
check('아직 얹은 것이 없으면 그렇게 말한다',
  run(null).hook.paperHTML().includes('아직 얹은 일이 없습니다'),
  '셈한 적 없는데 셈한 것처럼 보이면 안 된다');

console.log('\n[8] 합치기 — 서버 없이 여럿이 모은다');
check('내보낼 때 이 앱 표시를 적는다', html.includes('LEAP.stamp(APP_ID'));
check('가져올 때 표시를 읽는다', html.includes('LEAP.otherApp(APP_ID'));
check('합치기가 맨 위에 온다', html.indexOf('id="im-merge"') < html.indexOf('id="im-over"'),
  '잃지 않는 길이 맨 위에 와야 한다');
check('그만두는 길이 있다', html.includes('id="im-no"'));
check('★ 두 번 합쳐도 늘어나지 않는다',
  html.includes("have[j.who + '|' + j.n + '|' + j.wk]"),
  '같은 파일을 두 번 합치면 일이 두 배가 되어서는 안 된다');
check('남의 일은 보기만 한다', html.includes('남의 일을 대신 고치지 않습니다'));

console.log('\n[9] AI 초안 — 아무것도 보내지 않는다');
{
  const pr = run(mk({ jobs: [job({ wk: 20, wt: 'big', fixed: true }),
    job({ wk: 20, wt: 'big', who: '정보부', fixed: true })] })).hook.buildPrompt();
  check('서버를 부르지 않는다', !/\bfetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon/.test(html));
  check('사람 이름이 없다고 적는다', pr.includes('사람 이름은 없습니다'));
  check('몰린 주를 담는다', pr.includes('[일이 몰린 주]'));
  check('★ 「사람을 더 뽑자」는 답을 막는다', pr.includes('사람을 더 뽑자'),
    '학교가 할 수 있는 일이 아닌 답은 도움이 안 된다');
  check('★ 못 옮기는 일을 옮기라고 하지 말라고 적는다', pr.includes('옮기라고 하지 마세요'));
  check('지어내지 말라고 적는다', pr.includes('지어내지 마세요'));
}

console.log('\n[10] PDF 이름');
check('학교와 날짜가 들어간다', /길안초등학교/.test(run(mk({})).hook.printFileName()));
check('파일 이름에 못 쓰는 글자를 걷어낸다',
  !/[\\/:*?"<>|]/.test(run(mk({ school: 'A/B:C*D' })).hook.printFileName()));

console.log('\n[11] 낡은 저장본을 견딘다 — 함정 10번');
check('빈 것을 넣어도 안 죽는다', Array.isArray(H.fill(null).jobs));
check('모르는 주는 범위 안으로 접는다', H.fill({ jobs: [{ n: 'x', wk: 999 }] }).jobs[0].wk === 47);
check('모르는 크기는 보통으로', H.fill({ jobs: [{ n: 'x', wt: '없는것' }] }).jobs[0].wt === 'mid');
check('이름이 없으면 그렇게 적는다', H.fill({ jobs: [{ n: 'x' }] }).jobs[0].who === '이름 적지 않음');

console.log('\n[12] 이 앱이 지키는 것');
check('사람 이름을 받는 칸이 없다',
  !/학생 이름|성명|이름 적기/.test(html.replace(/이름이 아니라[^<]*/g, '')));
check('바깥 파일을 부르지 않는다',
  !/<script[^>]+src=|<link[^>]+stylesheet/.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')));
check('인쇄 서식이 있다', /@media\s+print/.test(html));
check('화면에 판 번호가 없다',
  !/v0\.\d+|프로토타입/.test(html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')));
check('저작권이 있다', html.includes('© 2026 TEAM LEAP'));
check('본문으로 건너뛰는 길이 있다', html.includes('<a class="skip" href="#main">'));
check('창에 초점을 가둔다', html.includes('LEAP.guardModals'));
check('다른 창의 저장을 알아챈다', html.includes("LEAP.watchOtherTabs('leap-year-v1')"));
check('머리에 설명서로 가는 길이 있다', html.includes('href="./README.html"'));
check('작은 단추가 44px 이다', /\.btn--sm\{[^}]*min-height:44px/.test(html));
check('되돌릴 수 없는 일에 되돌리기가 있다', /LEAP\.offerUndo\(/.test(html));
check('저장 창구가 다른 앱과 같다',
  html.includes('update:function(fn){var d=read();fn(d);return flush();}'));

console.log('\n[kit] 사본이 낡지 않았는가 — 함정 46번');
{
  const kitSrc = fs.readFileSync(path.join(__dirname, '..', 'kit', 'leap.js'), 'utf8');
  const need = [...js.matchAll(/LEAP\.(\w+)\s*\(/g)].map(m => m[1]).concat(['esc']);
  const have = new Set([...js.matchAll(/LEAP\.(\w+)\s*=\s*(?:function|[A-Za-z_$][\w$]*\s*;)/g)].map(m => m[1]));
  const missing = [...new Set(need)].filter(n => !have.has(n));
  check('★ 앱이 부르는 LEAP 창구가 사본에 다 있다', missing.length === 0, missing.join(' · '));
  check('원본이 이 앱을 알고 있다', kitSrc.includes("'leap-year'"));
}

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
