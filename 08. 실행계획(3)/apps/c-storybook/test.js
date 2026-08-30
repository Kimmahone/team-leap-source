/* 지역 탐방 디지털 스토리북 — 점검
   최소 DOM 스텁 위에서 앱을 실제로 실행하고 화면이 제대로 만들어지는지 본다.
   실행: node test.js   (EPUB 파일 자체 검사는 test-epub.js) */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeEl() {
  return {
    _html: '', hidden: false, value: '', textContent: '', tabIndex: 0, checked: false,
    classList: { add() {}, remove() {} }, style: {}, files: null, type: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    addEventListener() {}, focus() {}, click() {},
    setAttribute(k, v) { this['_' + k] = v; },
    getAttribute(k) { return this['_' + k] || null; },
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
      if (String(sel).includes('role="tab"')) return [makeEl(), makeEl(), makeEl(), makeEl(), makeEl()];
      return [];
    }
  };
}

/* 최소 IndexedDB 흉내.
   진짜와 다른 점은 하나뿐이다 — 손잡이(onsuccess 등)를 붙이는 순간 바로 부른다.
   브라우저는 다음 차례에 부르지만, 여기서는 기다릴 시계가 없다.
   덕분에 「책장」 길을 검사가 실제로 지나간다. 흉내가 없으면 이 앱의 주된
   저장 경로를 한 번도 밟지 않고 통과해 버린다. */
function fakeIDB(seed) {
  const data = { books: {}, shelf: {} };
  if (seed) Object.keys(seed).forEach(k => { data[k] = seed[k]; });

  function once(fire) {
    let done = false;
    return f => { if (done) return; done = true; if (f) f(); };
  }
  function request(run) {
    const o = { result: undefined, error: null };
    o.result = run();
    const ok = once(), no = once();
    Object.defineProperty(o, 'onsuccess', { set(f) { ok(() => f.call(o)); } });
    Object.defineProperty(o, 'onerror', { set() { no(() => {}); } });
    return o;
  }
  function store(name) {
    return {
      put(v) { data[name][v.id] = JSON.parse(JSON.stringify(v)); },
      delete(id) { delete data[name][id]; },
      get(id) { return request(() => data[name][id] || undefined); },
      getAll() { return request(() => Object.keys(data[name]).map(k => data[name][k])); }
    };
  }
  const db = {
    objectStoreNames: { contains: n => n === 'books' || n === 'shelf' },
    createObjectStore() {},
    transaction(name) {
      const t = { objectStore: () => store(name) };
      const fire = once();
      Object.defineProperty(t, 'oncomplete', { set(f) { fire(() => f()); } });
      Object.defineProperty(t, 'onerror', { set() {} });
      Object.defineProperty(t, 'onabort', { set() {} });
      return t;
    }
  };
  return { _data: data, open() {
    const o = { result: db, error: null };
    const up = once(), ok = once();
    Object.defineProperty(o, 'onupgradeneeded', { set(f) { up(() => f()); } });
    Object.defineProperty(o, 'onsuccess', { set(f) { ok(() => f()); } });
    Object.defineProperty(o, 'onerror', { set() {} });
    Object.defineProperty(o, 'onblocked', { set() {} });
    return o;
  } };
}

function run(state, opt) {
  opt = opt || {};
  const panels = {};
  const store = { 'leap-storybook-v1': state ? JSON.stringify(state) : null };
  if (opt.cur) store['leap-storybook-cur'] = opt.cur;
  const sandbox = {
    console, __LEAP_TEST__: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    scrollTo: () => {},
    crypto: globalThis.crypto,
    TextEncoder, Blob, atob: globalThis.atob,
    alert: () => {}, confirm: () => true,
    setTimeout: (f) => { if (typeof f === 'function') f(); }, clearTimeout: () => {},
    Image: function () {
      const self = this;
      Object.defineProperty(this, 'src', {
        set() { if (self.onerror) self.onerror(); }   // 캔버스가 없으니 실패 경로로 흘린다
      });
    }, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    FileReader: function () {},
    document: {
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {} },
      documentElement: makeEl()
    }
  };
  if (opt.idb) sandbox.indexedDB = opt.idb;
  sandbox.navigator = { storage: null };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { timeout: 8000 });

  const get = id => (panels[id] ? panels[id]._html : '');
  return {
    sb: sandbox,
    hook: sandbox.__LEAP_TEST__.hook,
    get cover() { return get('panel-cover'); },
    get page() { return get('panel-page'); },
    get back() { return get('panel-back'); },
    get prev() { return get('panel-prev'); },
    get merge() { return get('panel-merge'); },
    get shelf() { return get('panel-shelf'); },
    get spot() { return get('panel-spot'); },
    get meter() { return get('meter'); },
    store
  };
}

const IMG = 'data:image/jpeg;base64,/9j/TEST';
const mkBook = (over) => ({
  v: 1,
  book: Object.assign({
    title: '우리 마을 이야기', subtitle: '봉정사 탐방 기록',
    team: '3학년 1반 두루미 모둠', date: '2026-10-15',
    coverStyle: 'grad', cover: null, pages: []
  }, over)
});
const page = (over) => Object.assign({
  id: 'p1', layout: 'photo-top', src: IMG, w: 1600, h: 1200,
  bytesIn: 3000000, bytesOut: 240000, alt: '봉정사 극락전 앞에 선 우리 모둠',
  text: '기와가 아주 오래되어 보였다.', ratio: 55, zoom: 100, fx: 50, fy: 50
}, over);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

console.log('\n[1] 빈 책');
let r = run(null);
check('표지 만들기 화면', r.cover.includes('표지 만들기'));
check('표지 미리보기가 함께 뜬다', r.cover.includes('id="cv-live"') && r.cover.includes('sheet cover'));
check('쪽 없음 안내', r.page.includes('아직 쪽이 없습니다'));
check('학급 문집 화면', r.merge.includes('학급 문집 만들기'));
check('선생님이 쓰는 화면이라고 먼저 말한다', r.merge.includes('선생님이 쓰는 화면입니다'),
  '학생 탭과 나란히 있으면 학생이 눌러 보고 헤맨다');
// IndexedDB 가 없는 자리이므로 예전 방식(한 권)으로 물러나 있어야 한다.
check('저장 공간 표시', r.meter.includes('이 책') && /\d/.test(r.meter));
check('한 권만 담긴다고 알린다', r.meter.includes('한 권'),
  '조용히 물러나면 안 된다. 왜 한 권인지 화면에 적어야 한다');

console.log('\n[2] 표지 — 미리보기 (요청 4)');
r = run(mkBook());
check('미리보기에 제목이 보인다', r.cover.includes('우리 마을 이야기'));
check('미리보기에 부제·모둠이 보인다',
  r.cover.includes('봉정사 탐방 기록') && r.cover.includes('두루미 모둠'));
check('고른 바탕이 눌린 상태', /data-th="dawn"[^>]*aria-pressed="true"/.test(r.cover),
  'coverStyle:grad 로 저장된 옛 책은 dawn 바탕으로 읽혀야 한다');

console.log('\n[3] 표지 배경 — 인쇄 문제 (요청 1)');
check('색 표지가 CSS 배경이 아니라 SVG 로 그려진다',
  r.cover.includes('class="cbg"') && r.cover.includes('linearGradient'),
  '브라우저는 CSS 배경을 기본으로 인쇄하지 않는다. 흰 종이에 흰 글자가 나오던 원인');
const pr = r.hook.printHTML(mkBook().book);
check('인쇄본 표지에도 SVG 배경이 들어간다', pr.includes('class="cbg"') && pr.includes('linearGradient'));
check('인쇄본에 표지 제목이 있다', pr.includes('<h3>우리 마을 이야기</h3>'));
const pr2 = r.hook.printHTML(mkBook({ coverStyle: 'solid' }).book);
check('단정한 표지도 SVG 사각형으로', pr2.includes('fill="#14202E"'));
const pr3 = r.hook.printHTML(mkBook({ coverStyle: 'photo', cover: { src: IMG, w: 1600, h: 900 } }).book);
check('사진 표지의 어두운 띠도 SVG', pr3.includes('class="veil"') && pr3.includes('stop-opacity="0.88"'));

console.log('\n[4] 한 장씩 편집 (요청 3)');
r = run(mkBook({ pages: [page(), page({ id: 'p2', text: '단풍이 들었다.' })] }));
check('쪽 이동 단추가 있다', r.page.includes('id="go-prev"') && r.page.includes('id="go-next"'));
check('현재 쪽 표시', r.page.includes('1 / 2쪽'));
check('첫 쪽에서 앞쪽 단추는 잠김', /id="go-prev"[^>]*disabled/.test(r.page));
check('축소판 띠가 있다', r.page.includes('class="strip"'));
check('편집 중인 쪽 미리보기가 함께 뜬다', r.page.includes('id="pg-live"'));
check('글·설명 입력칸', r.page.includes('id="p-text"') && r.page.includes('id="p-alt"'));

console.log('\n[5] 사진 크기 조절 (요청 3)');
check('사진 크기 슬라이더', r.page.includes('id="s-ratio"'));
check('확대 슬라이더', r.page.includes('id="s-zoom"'));
check('좌우·위아래 위치 슬라이더', r.page.includes('id="s-fx"') && r.page.includes('id="s-fy"'));
r = run(mkBook({ pages: [page({ ratio: 75, zoom: 150, fx: 30, fy: 20 })] }));
check('사진 크기가 미리보기에 반영', r.page.includes('flex:0 0 75%'));
check('확대·초점이 미리보기에 반영',
  r.page.includes('transform:scale(1.5)') && r.page.includes('object-position:30% 20%'));
r = run(mkBook({ pages: [page({ src: '', layout: 'text-only' })] }));
check('사진 없는 쪽엔 슬라이더가 없다', !r.page.includes('id="s-zoom"'));

console.log('\n[6] 사진 가득 배치는 크기 슬라이더 없음');
r = run(mkBook({ pages: [page({ layout: 'photo-full' })] }));
check('크기 슬라이더 숨김', !r.page.includes('id="s-ratio"'), '사진이 이미 전면이라 조절할 것이 없다');
check('확대 슬라이더는 남는다', r.page.includes('id="s-zoom"'));

console.log('\n[7] 모아 보기 (요청 3)');
r = run(mkBook({ pages: [page(), page({ id: 'p2' }), page({ id: 'p3' })] }));
r.hook.setMode('all');
check('격자로 모두 보인다', r.page.includes('class="grid"'));
check('쪽마다 편집·이동·지우기', r.page.includes('data-open="1"') &&
  r.page.includes('data-up="1"') && r.page.includes('data-del="2"'));
check('축소판으로 그려진다', r.page.includes('sheet mini'));
r.hook.setMode('one'); r.hook.setCur(2);
check('세 번째 쪽으로 이동', r.page.includes('3 / 3쪽'));
check('끝 쪽에서 뒤쪽 단추 잠김', /id="go-next"[^>]*disabled/.test(r.page));

console.log('\n[8] 미리보기·대체 텍스트');
r = run(mkBook({ pages: [page(), page({ id: 'p2', layout: 'photo-full', text: '단풍이 들었다.' })] }));
check('표지가 먼저 나온다', r.prev.indexOf('sheet cover') < r.prev.indexOf('<div class="sheet">'));
check('쪽 번호가 찍힌다', r.prev.includes('<span class="pn">1</span>'));
check('사진 가득 배치는 글이 캡션으로', r.prev.includes('<div class="cap">단풍이 들었다.</div>'));
check('사진 설명이 alt 로 들어간다', r.prev.includes('alt="봉정사 극락전 앞에 선 우리 모둠"'));
check('개인정보 주의 문구', r.prev.includes('사진에 얼굴이 담깁니다'));
check('EPUB 단추가 있다', r.prev.includes('id="pv-epub"'));

console.log('\n[9] 사진 없는 쪽은 글만으로 그린다');
r = run(mkBook({ pages: [page({ src: '', layout: 'photo-top', text: '사진을 못 찍었다.' })] }));
check('배치가 photo-top 이어도 글만 시트로', r.prev.includes('sheet only'));
check('img 태그가 없다', !r.prev.includes('<img'));

console.log('\n[10] 모으기 (요청 5)');
r = run(mkBook());
r.hook.addParts([
  { title: '봉정사 이야기', team: '두루미 모둠', date: '2026-10-15', size: 900000, thumb: IMG, pages: [page(), page({ id: 'x2' })] },
  { title: '하회마을 이야기', team: '기러기 모둠', date: '2026-10-15', size: 700000, thumb: IMG, pages: [page({ id: 'y1' })] }
]);
check('모인 책이 목록에 뜬다', r.merge.includes('봉정사 이야기') && r.merge.includes('하회마을 이야기'));
check('권수와 쪽수 합계', r.merge.includes('모인 책 2권 · 3쪽'));
check('순서 바꾸기·빼기 단추', r.merge.includes('data-mup="1"') && r.merge.includes('data-mdel="0"'));
check('속표지·재압축 선택칸', r.merge.includes('id="m-div"') && r.merge.includes('id="m-shrink"'));
check('합본은 저장되지 않는다고 알린다', r.merge.includes('합본은 저장되지 않습니다'),
  '사진이 많아 브라우저 저장 공간에 담을 수 없다');

r.hook.build();   // 사진 재압축 켠 상태 (기본값)
check('사진 재압축을 켜도 끝까지 진행된다', !!r.hook.merged(),
  '한 장이라도 실패하면 멈추면 안 된다');

r.hook.setShrink(false);
r.hook.build();
const merged = r.hook.merged();
check('문집이 만들어진다', !!merged);
check('속표지가 모둠마다 들어간다',
  merged.pages.filter(p => p.divider).length === 2);
check('쪽 수가 맞다 (속표지 2 + 본문 3)', merged.pages.length === 5);
check('속표지에 모둠 이름', merged.pages[0].divider && merged.pages[0].text === '두루미 모둠');
check('쪽 아이디가 새로 매겨진다',
  new Set(merged.pages.map(p => p.id)).size === merged.pages.length,
  '학생마다 아이디가 겹치면 뒤에서 덮어써진다');
check('합본이 저장소에 들어가지 않는다',
  !JSON.parse(r.sb.localStorage.getItem('leap-storybook-v1')).book.pages.length,
  '5MB 한도를 넘기지 않기 위한 설계');

console.log('\n[11] 마지막 장 (요청: 마지막 페이지 꾸미기)');
r = run(mkBook({
  pages: [page()],
  back: { style: 'plain', photo: null, headline: '우리가 배운 것',
          text: '오래된 것을 지키는 일이\n왜 힘든지 알았다.',
          people: '두루미 모둠 (네 명)', school: '안동초등학교 3학년 1반', teacher: '김○○ 선생님' }
}));
check('마지막 장 편집 화면이 있다', r.back.includes('마지막 장 꾸미기'));
check('미리보기가 함께 뜬다', r.back.includes('id="bk-live"') && r.back.includes('sheet back'));
check('맺음말 제목·본문 입력칸', r.back.includes('id="b-head"') && r.back.includes('id="b-text"'));
check('만든 사람·학교·지도 입력칸',
  r.back.includes('id="b-people"') && r.back.includes('id="b-school"') && r.back.includes('id="b-teacher"'));
check('모양 4종', ['plain','grad','solid','photo'].every(k => r.back.includes('data-back="' + k + '"')));
check('고른 모양이 눌린 상태', /data-back="plain"[^>]*aria-pressed="true"/.test(r.back));
check('흰 바탕일 땐 사진 칸을 숨긴다', !r.back.includes('id="b-drop"'), '쓰이지 않는 사진을 넣게 두면 용량만 먹는다');

check('맺음말이 미리보기에 들어간다', r.back.includes('우리가 배운 것') && r.back.includes('오래된 것을 지키는'));
check('만든 사람이 들어간다', r.back.includes('만든 사람 · 두루미 모둠'));
check('책 제목과 날짜가 자동으로', r.back.includes('우리 마을 이야기') && r.back.includes('2026. 10. 15.'));
check('마지막 장에 저작권을 찍지 않는다', !r.back.includes('2026 TEAM LEAP'),
  '이 책은 앱이 아니라 학생의 것이다');
check('만든 도구 이름만 남는다', r.back.includes('지역 탐방 디지털 스토리북으로 만들었습니다'));
check('책 미리보기 맨 뒤에 붙는다',
  r.prev.lastIndexOf('sheet back') > r.prev.lastIndexOf('<span class="pn">1</span>'));

const prb = r.hook.printHTML(JSON.parse(r.sb.localStorage.getItem('leap-storybook-v1')).book);
check('인쇄본 마지막 장에 맺음말', prb.includes('sheet back plain') && prb.includes('우리가 배운 것'));
check('인쇄본 마지막 장에도 저작권이 없다', !prb.includes('2026 TEAM LEAP'));

r = run(mkBook({ back: { style: 'grad', headline: '고맙습니다' } }));
check('색 마지막 장은 SVG 배경', r.back.includes('class="cbg"') && r.back.includes('linearGradient'));
const prb2 = r.hook.printHTML(JSON.parse(r.sb.localStorage.getItem('leap-storybook-v1')).book);
check('색 마지막 장 인쇄본에 바탕이 깔린다', prb2.includes('sheet back grad') && prb2.includes('class="cbg"'),
  '흰 글자를 쓰므로 배경이 반드시 있어야 한다');
r = run(mkBook({ back: { style: 'photo' } }));
check('사진 모양일 때만 사진 칸이 뜬다', r.back.includes('id="b-drop"'));

console.log('\n[12] 예전에 저장한 책 (back 이 없던 시절)');
r = run(mkBook());   // back 필드 자체가 없음
check('터지지 않고 기본값으로 그린다', r.back.includes('마지막 장 꾸미기') && r.back.includes('sheet back plain'));
check('미리보기에도 마지막 장이 붙는다', r.prev.includes('sheet back'));

console.log('\n[13] 용량');
r = run(mkBook({ pages: [page()] }));
check('92% 줄였다고 표시', r.page.includes('92%'));
check('원본 → 줄인 용량', r.page.includes('2.9 MB') && r.page.includes('234 KB'));
check('저장 공간 한도 표시', r.meter.includes('/ 4.2 MB'));

console.log('\n[14] 입력값 이스케이프');
r = run(mkBook({ title: '<img src=x onerror=alert(1)>', pages: [page({ text: '<script>bad()<\/script>' })] }));
check('제목의 태그가 그대로 들어가지 않는다', !r.prev.includes('<img src=x'));
check('글의 태그가 그대로 들어가지 않는다', !r.prev.includes('<script>bad()'));
check('이스케이프되어 표시된다', r.prev.includes('&lt;img') && r.prev.includes('&lt;script&gt;'));

/* ==========================================================================
   지역 탐방 — 이 앱이 「사진 넣는 책」과 갈리는 자리
   ========================================================================== */

console.log('\n[탐방 1] 경상북도 22개 시군');
const H = run(null).hook;
check('22개다', H.REGIONS.length === 22, String(H.REGIONS.length));
check('군위가 없다', !H.REGIONS.some(r => r.n.indexOf('군위') >= 0),
  '2023년 7월 1일 대구광역시로 넘어갔다. 경북 자료에 군위를 두면 그것부터 틀린다');
check('시 10곳 · 군 12곳',
  H.REGIONS.filter(r => /시$/.test(r.n)).length === 10 &&
  H.REGIONS.filter(r => /군$/.test(r.n)).length === 12,
  H.REGIONS.filter(r => /시$/.test(r.n)).length + ' / ' + H.REGIONS.filter(r => /군$/.test(r.n)).length);
check('코드가 겹치지 않는다',
  new Set(H.REGIONS.map(r => r.c)).size === 22);
check('모두 위경도가 있다',
  H.REGIONS.every(r => typeof r.lon === 'number' && typeof r.lat === 'number'));
check('경상북도 범위 안에 있다 (울릉 제외)',
  H.REGIONS.filter(r => !r.inset).every(r =>
    r.lon > 128.0 && r.lon < 129.5 && r.lat > 35.5 && r.lat < 37.1));
check('울릉은 멀리 떨어져 있다',
  H.REGIONS.filter(r => r.inset).every(r => r.lon > 130), '경도 130도 너머 — 따로 그린다');
check('모두 탐방지를 가지고 있다', H.REGIONS.every(r => r.p && r.p.length >= 3));
check('탐방지 종류가 목록 안에 있다',
  H.REGIONS.every(r => r.p.every(x => H.KINDS.indexOf(x[1]) >= 0)));

console.log('\n[탐방 2] 위치가 실제와 맞는가 — 지도의 근거');
const R = {}; H.REGIONS.forEach(r => { R[r.c] = r; });
check('울진이 가장 북쪽', H.REGIONS.filter(r => !r.inset)
  .every(r => r.lat <= R.uljin.lat));
check('청도가 가장 남쪽', H.REGIONS.filter(r => !r.inset)
  .every(r => r.lat >= R.cheongdo.lat));
check('김천이 가장 서쪽', H.REGIONS.filter(r => !r.inset)
  .every(r => r.lon >= R.gimcheon.lon));
check('포항·영덕·울진이 동해안', [R.pohang, R.yeongdeok, R.uljin]
  .every(r => r.lon > 129.3));
check('안동이 한가운데쯤', R.andong.lon > 128.5 && R.andong.lon < 129.0 &&
  R.andong.lat > 36.3 && R.andong.lat < 36.8);
// 손으로 검산: 남북 0.712도=79km, 동서 0.495도=44km → 직선 약 91km.
// 도로로는 120km 쯤이지만 이건 「직선거리」다. 화면에도 그렇게 적는다.
const d1 = H.distKm(R.andong, R.gyeongju);
check('안동–경주 직선거리 약 91km', d1 >= 86 && d1 <= 96, d1 + 'km');
check('직선거리이지 도로 거리가 아니다', d1 < 110,
  '도로 거리로 읽히면 견학 계획을 잘못 세운다');
const d2 = H.distKm(R.andong, R.andong);
check('같은 곳은 0km', d2 === 0);

console.log('\n[탐방 3] 초성으로 찾기 — 아이들이 쓰는 법');
check('경주 → ㄱㅈ', H.chosung('경주') === 'ㄱㅈ', H.chosung('경주'));
check('불국사 → ㅂㄱㅅ', H.chosung('불국사') === 'ㅂㄱㅅ', H.chosung('불국사'));
check('초성으로 걸린다', H.hit('불국사', 'ㅂㄱㅅ'));
check('이름 일부로도 걸린다', H.hit('불국사', '국사'));
check('빈 검색어는 모두 통과', H.hit('아무거나', ''));
check('엉뚱한 초성은 안 걸린다', !H.hit('불국사', 'ㅋㅋㅋ'));
check('한글 아닌 글자도 다치지 않는다', H.chosung('AB 가') === 'AB ㄱ', H.chosung('AB 가'));

console.log('\n[탐방 4] 쪽에 붙은 장소가 지도가 된다');
const trip = { pages: [
  { rc: 'gyeongju', spot: '불국사' }, { rc: 'gyeongju', spot: '첨성대' },
  { rc: 'andong', spot: '하회마을' }, { rc: '', spot: '' }, { divider: true }
], spots: [], mapPage: true, home: 'andong' };
const visits = H.visitedMap(trip);
check('시군마다 쪽수를 센다', visits.gyeongju === 2 && visits.andong === 1);
check('장소 없는 쪽은 세지 않는다', Object.keys(visits).length === 2);
const rt = H.routeOf(trip);
check('다닌 순서가 쪽 순서', rt.join(',') === 'gyeongju,andong');
check('같은 시군은 한 번만', rt.length === 2);
check('장소가 있으면 지도 쪽이 생긴다', H.hasMapPage(trip) === true);
check('끄면 안 생긴다', H.hasMapPage({ pages: trip.pages, mapPage: false }) === false);
check('한 곳도 없으면 안 생긴다',
  H.hasMapPage({ pages: [{ rc: '', spot: '' }], mapPage: true }) === false,
  '빈 지도 쪽이 책에 끼면 곤란하다');

console.log('\n[탐방 5] 지도 그리기');
const svg = H.mapSVG({ visited: visits, route: rt, home: 'andong' });
check('SVG 가 나온다', svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0);
check('22개 시군이 모두 찍힌다', (svg.match(/<circle/g) || []).length >= 22);
check('동해가 그려진다', svg.includes('동해'));
check('다닌 길이 선으로 이어진다', svg.includes('<polyline'));
/* 예전에는 해안선도 polyline 이라 「하나 더」를 세야 했습니다.
   이제 뭍은 구운 시군 경계(path)로 그리므로, polyline 은 **다닌 길 하나뿐**입니다. */
check('안 다닌 곳은 선에 없다', (svg.match(/polyline/g) || []).length === 1,
  '다닌 길 하나');
const svgNone = H.mapSVG({ visited: {}, route: [] });
check('한 곳도 안 갔으면 길이 없다', (svgNone.match(/polyline/g) || []).length === 0);

/* 뭍 — 손으로 찍은 해안선 대신 구운 경계입니다 (open api/bake-boundary.mjs).
   빠지면 지도가 바다 한 장이 됩니다. */
check('시군 경계로 뭍이 그려진다', (svg.match(/<path d="M[^"]+Z"/g) || []).length >= 21,
  '경계 path 수: ' + (svg.match(/<path d="M[^"]+Z"/g) || []).length);
check('종이용에도 뭍이 있다', (svgP0 => (svgP0.match(/<path d="M[^"]+Z"/g) || []).length >= 21)
  (H.mapSVG({ visited: visits, route: rt, paper: true })));
const svgP = H.mapSVG({ visited: visits, route: rt, paper: true });
check('종이용은 CSS 변수를 쓰지 않는다', svgP.indexOf('var(--') < 0,
  '인쇄·EPUB 에서는 CSS 변수가 없다');
check('화면용은 CSS 변수를 쓴다 (다크 모드)', svg.indexOf('var(--') >= 0);
check('종이용에도 22개가 다 있다', (svgP.match(/<circle/g) || []).length >= 22);
check('XML 로 읽을 수 있다', !/<(circle|rect|polyline|path)[^>]*[^\/]>/.test(svgP),
  'EPUB 은 XHTML 이라 태그가 다 닫혀야 한다');

console.log('\n[탐방 6] 우리가 더한 곳');
const withMine = { pages: [], spots: [{ id: 'x', rc: 'uiseong', n: '우리 마을 느티나무', t: '자연' }] };
const sp = H.spotsOf(withMine, 'uiseong');
check('기본 탐방지와 함께 나온다', sp.length === R.uiseong.p.length + 1);
check('우리가 더한 것이 표시된다', sp.some(x => x.mine && x.n === '우리 마을 느티나무'));
check('다른 시군에는 안 나온다', !H.spotsOf(withMine, 'andong').some(x => x.mine));

console.log('\n[탐방 7] 지도 쪽 내용');
const ms = H.mapSheet(trip, false);
check('제목이 있다', ms.includes('우리가 다녀온 곳'));
check('다녀온 시군이 적힌다', ms.includes('경주시') && ms.includes('안동시'));
check('탐방지 이름이 적힌다', ms.includes('불국사') && ms.includes('첨성대'));
check('안 간 곳은 목록에 없다', !ms.includes('청도군'));
check('학교에서의 거리가 나온다', /\d+km/.test(ms));
const pmb = H.printHTML(trip);
check('인쇄본이 같은 지도 쪽을 쓴다', pmb.includes('우리가 다녀온 곳') && pmb.includes('하회마을'),
  '인쇄용 지도 쪽을 따로 그리면 언젠가 화면과 갈린다');
check('종이 색을 쓴다', ms.indexOf('var(--') < 0);

/* ==========================================================================
   책장 — 저장 공간 (v0.6)
   ========================================================================== */

console.log('\n[책장 1] 넓은 저장소를 열어 주면 책장이 열린다');
let idb = fakeIDB();
let rs = run(null, { idb });
check('책장 길로 간다', rs.hook.mode() === 'idb',
  'IndexedDB 가 있으면 4.2MB 한 권짜리 localStorage 로 가면 안 된다');
check('책장 화면이 그려진다', rs.shelf.includes('책장'));
check('한 권 제한을 말하지 않는다', !rs.shelf.includes('4.2 MB'));
check('첫 책이 저절로 꽂힌다', Object.keys(idb._data.books).length === 1);
check('목록에도 한 줄 들어간다', Object.keys(idb._data.shelf).length === 1);
check('그래도 파일로 내보내라고 알린다', rs.shelf.includes('파일로'),
  '책장은 이 브라우저 안에만 있다. 그 사실을 숨기면 안 된다');

console.log('\n[책장 2] 새 책이 예전 책을 지우지 않는다');
idb = fakeIDB();
rs = run(null, { idb });
rs.hook.save(d => { d.book.title = '첫 번째 책'; });
rs.hook.newBook();
rs.hook.save(d => { d.book.title = '두 번째 책'; });
const titles = Object.keys(idb._data.books).map(k => idb._data.books[k].rec.book.title);
check('두 권이 남는다', titles.length === 2, titles.join(' / '));
check('첫 책이 그대로 있다', titles.includes('첫 번째 책'),
  '예전에는 「새 책 시작」이 만들던 책을 지웠다. 그것이 4.2MB 벽의 대가였다');
check('둘째 책도 있다', titles.includes('두 번째 책'));
check('지금 여는 책은 둘째', rs.hook.book().title === '두 번째 책');

console.log('\n[책장 3] 다시 열면 보던 책이 그대로');
const keep = idb._data;
const again = run(null, { idb: fakeIDB(keep), cur: Object.keys(idb._data.books).find(
  k => idb._data.books[k].rec.book.title === '첫 번째 책') });
check('마지막에 보던 책을 연다', again.hook.book().title === '첫 번째 책');
check('책장에는 두 권 그대로', again.shelf.split('class="bk').length - 1 === 2);

console.log('\n[책장 4] 못 쓰는 브라우저에서는 한 권으로 물러난다');
const noIdb = run(null);
check('예전 길로 간다', noIdb.hook.mode() === 'ls');
check('왜 한 권인지 적는다', noIdb.shelf.includes('한 권만 담깁니다'),
  '조용히 못 하면 안 된다. 사파리에서 열었을 때 이 문장이 답이 된다');
check('다른 브라우저를 일러 준다', noIdb.shelf.includes('크롬'));

console.log('\n[책장 5] 예전에 만들던 책을 옮겨 온다');
idb = fakeIDB();
const moved = run(mkBook({ title: '옛날에 만들던 책' }), { idb });
check('책장으로 옮겨졌다',
  Object.keys(idb._data.books).some(k => idb._data.books[k].rec.book.title === '옛날에 만들던 책'),
  'v0.5 까지 쓰던 사람이 열었을 때 만들던 책이 사라지면 안 된다');
check('옮긴 책을 열어 준다', moved.hook.book().title === '옛날에 만들던 책');
check('예전 자리는 비운다', moved.store['leap-storybook-v1'] === undefined,
  '두 군데에 남으면 다음에 열 때 어느 쪽이 참인지 알 수 없다');

/* ==========================================================================
   우리 학교 (v0.6)
   ========================================================================== */

console.log('\n[학교 1] 공공데이터가 제대로 실렸다');
const S = r.hook.SCHOOLS;
check('경상북도 학교가 900교 넘게 들어 있다', S.length > 900, S.length + '교');
check('초·중·고가 모두 있다',
  ['e', 'm', 'h'].every(k => S.some(x => x.k === k)));
check('22개 시군이 모두 나온다',
  H.REGIONS.every(reg => S.some(x => x.rc === reg.c)),
  '한 시군이라도 비면 그 지역 선생님은 이 기능을 못 쓴다');
check('이름이 온전하다', S.some(x => x.n === '안동초등학교') && S.some(x => x.n === '울릉중학교'));
check('분교장도 들어 있다', S.some(x => /분교장$/.test(x.n)),
  '작은 학교를 위한 앱이 분교장을 빠뜨리면 앞뒤가 안 맞는다');
check('주소가 붙어 있다', S.every(x => x.ad && x.ad.length > 2));
check('군위는 없다', !S.some(x => x.ad.includes('군위')),
  '2023년 7월 1일 대구로 넘어갔다');
check('아직 안 생긴 학교는 없다', !S.some(x => x.n.indexOf('(가칭)') === 0),
  '2027년 개교 예정 학교는 뺐다. 주소로 적힌 곳이 교육지원청이었다');

console.log('\n[학교 1-2] 좌표 — 학교알리미');
const withXY = S.filter(x => x.lat != null && x.lon != null);
check('거의 모든 학교에 좌표가 있다', withXY.length >= S.length - 3,
  withXY.length + ' / ' + S.length);
check('경상북도 안에 있다',
  withXY.filter(x => x.rc !== 'ulleung')
    .every(x => x.lat > 35.3 && x.lat < 37.2 && x.lon > 127.7 && x.lon < 129.7),
  '한 곳이라도 튀면 지도에 엉뚱한 별이 찍힌다');
check('울릉은 동해 먼바다에 있다',
  withXY.filter(x => x.rc === 'ulleung').every(x => x.lon > 130.7 && x.lon < 131.1),
  '경도 130도 너머 — 지도에서는 딸린 상자로 그린다');
check('같은 시군 학교는 서로 가깝다', (() => {
  const a = withXY.filter(x => x.rc === 'ulleung');
  return a.every(x => Math.abs(x.lat - a[0].lat) < 0.2);
})());
check('좌표를 못 받은 곳은 화면이 그렇게 말한다',
  S.filter(x => x.lat == null).every(x => x.rc),
  '좌표가 없어도 시군은 알아야 시군 자리에 찍을 수 있다');

console.log('\n[학교 2] 찾기');
const F = r.hook.findSchools;
check('이름으로 찾는다', F('안동초', '', 40).some(x => x.n === '안동초등학교'));
check('초성으로 찾는다', F('ㅇㄷㅊ', 'e', 40).some(x => x.n === '안동초등학교'));
check('앞에서 걸린 것이 먼저 온다', F('안동', 'e', 40)[0].n.indexOf('안동') === 0);
check('학교급으로 거른다', F('안동', 'm', 40).every(x => x.k === 'm'));
check('주소로도 찾는다', F('하회', '', 40).length > 0 || F('풍천', '', 40).length > 0);
check('빈 글자에는 아무것도 안 준다', F('', '', 40).length === 0,
  '918교를 한꺼번에 그리면 화면이 멈춘다');
check('없는 이름에는 빈 목록', F('없는학교이름입니다', '', 40).length === 0);

console.log('\n[학교 3] 고르면 지도와 거리가 학교 기준이 된다');
const real = S.find(x => x.n === '길안초등학교');
const sch = { n: real.n, k: real.k, rc: real.rc, ad: real.ad, lat: real.lat, lon: real.lon };
const sb = mkBook({ school: sch, home: 'andong', mapPage: true,
  pages: [page({ rc: 'gyeongju', spot: '불국사' })] }).book;
check('우리 학교 이름을 쓴다', r.hook.homeName(sb) === '길안초등학교');
check('시군도 함께 안다', r.hook.homeCode(sb) === 'andong');
const hp = r.hook.homePoint(sb);
check('학교 자리를 그대로 쓴다', hp && hp.exact === true && hp.lat === real.lat);
// 길안면은 안동 시내가 아니라 청송 쪽으로 붙어 있다. 시군 한가운데를 쓰던
// 예전 방식과 거리가 달라야 맞다.
const byRegion = r.hook.distKm(r.hook.regionOf('andong'), r.hook.regionOf('cheongsong'));
const bySchool = r.hook.distKm(hp, r.hook.regionOf('cheongsong'));
check('시군 한가운데를 쓸 때와 거리가 다르다', bySchool !== byRegion,
  byRegion + 'km → ' + bySchool + 'km · 이것이 「정확히」의 뜻이다');
check('가까워졌다', bySchool < byRegion, byRegion + ' → ' + bySchool);
const smap = r.hook.mapSheet(sb, false);
check('지도 쪽에 학교 이름이 나온다', smap.includes('길안초등학교'));
check('겹쳐도 읽히게 테두리를 두른다', smap.includes('stroke-linejoin="round">길안초등학교'),
  '학교 이름표는 시군 이름 위에 얹힌다. 흰 테두리가 없으면 뭉개진다');
check('별표로 학교를 찍는다', /<path d="M[\d.]+ [\d.]+ L/.test(smap));
check('거리도 학교 기준으로 적힌다', /\d+km/.test(smap));
const sIn = r.hook.printHTML(sb);
check('인쇄본에도 학교 이름', sIn.includes('길안초등학교'));

console.log('\n[학교 3-2] 좌표를 아직 못 받은 학교');
const noxy = S.find(x => x.lat == null);
if (noxy) {
  const nb2 = mkBook({ school: noxy, home: noxy.rc, mapPage: true,
    pages: [page({ rc: 'gyeongju', spot: '불국사' })] }).book;
  const hp2 = r.hook.homePoint(nb2);
  check('시군 자리로 물러난다', hp2 && hp2.exact === false,
    '어림한 자리를 정확한 척하면 안 된다');
  check('그래도 지도와 거리는 나온다', /\d+km/.test(r.hook.mapSheet(nb2, false)));
} else {
  check('좌표 없는 학교가 없다 — 이 검사는 건너뛴다', true);
  check('좌표 없는 학교가 없다 — 이 검사는 건너뛴다 (2)', true);
}

console.log('\n[학교 4] 학교를 안 골라도 예전처럼 된다');
const nb = mkBook({ home: 'andong', mapPage: true,
  pages: [page({ rc: 'gyeongju', spot: '불국사' })] }).book;
check('시군 이름을 쓴다', r.hook.homeName(nb) === '안동시');
check('지도 쪽이 그대로 나온다', r.hook.mapSheet(nb, false).includes('안동시'));

/* ==========================================================================
   표지 (v0.6)
   ========================================================================== */

console.log('\n[표지 1] 고를 것이 늘었다');
check('바탕이 10가지', r.hook.CTHEME.length === 10);
check('무늬가 6가지', r.hook.CPAT.length === 6);
check('글자 자리가 3가지', r.hook.CALIGN.length === 3);
check('바탕 단추가 화면에 다 있다',
  (r.cover.match(/data-th="/g) || []).length === 10);
check('무늬·자리 단추도 있다',
  (r.cover.match(/data-pat="/g) || []).length === 6 &&
  (r.cover.match(/data-al="/g) || []).length === 3);

console.log('\n[표지 2] 예전 책이 그대로 보인다');
check('grad 는 새벽 바탕으로 읽힌다', r.hook.coverOf(mkBook().book).t.k === 'dawn');
check('solid 는 단정하게로 읽힌다',
  r.hook.coverOf(mkBook({ coverStyle: 'solid' }).book).t.k === 'slate');
check('예전 단정한 표지 색이 그대로', r.hook.coverSheet(mkBook({ coverStyle: 'solid' }).book).includes('#14202E'));
check('글자 자리는 아래가 기본', r.hook.coverOf(mkBook().book).al === 'bottom');

console.log('\n[표지 3] 밝은 바탕에서는 글자가 어두워진다');
const light = mkBook({ coverTheme: 'hanji' }).book;
const lsheet = r.hook.coverSheet(light, false);
check('한지 바탕에 어두운 글자', lsheet.includes('color:#3A2E1C'),
  '흰 종이에 흰 글자가 나오면 아무것도 안 보인다');
check('상표도 같이 어두워진다', lsheet.includes('stroke="#3A2E1C"'));
const dark = r.hook.coverSheet(mkBook({ coverTheme: 'night' }).book, false);
check('어두운 바탕에는 흰 글자', dark.includes('color:#fff'));

console.log('\n[표지 4] 무늬는 인쇄에도 간다');
const patted = r.hook.printHTML(mkBook({ coverTheme: 'sea', coverPat: 'wave', coverAlign: 'center' }).book);
check('인쇄본에 무늬가 들어간다', /<path d="M-6 /.test(patted),
  'CSS 배경이 아니라 SVG 라야 인쇄된다');
check('인쇄본도 글자 자리를 따른다', patted.includes('sheet cover al-center'));
check('마지막 장이 표지 바탕을 따라간다',
  r.hook.printHTML(mkBook({ coverTheme: 'sea', back: { style: 'grad' } }).book).includes('#0E5B77'),
  '앞뒤가 따로 노는 책은 만들다 만 것처럼 보인다');

/* ==========================================================================
   v0.7 — 미리보기와 인쇄는 같은 종이다
   ========================================================================== */

console.log('\n[종이 1] 상자가 하나뿐이다');
const src = require('fs').readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
check('종이 상자는 A4 실제 크기다', /\.sheet\{width:186mm;height:271mm/.test(src),
  '미리보기가 종이와 다른 비율이면 글이 줄바꿈되는 자리가 달라진다');
check('화면에서는 줄이기만 한다', src.includes('transform:scale(var(--sc'),
  '줄이기는 배치를 바꾸지 않는다. 그래서 넘치는 자리가 같다');
check('인쇄용 규칙을 따로 두지 않는다', !/\n  \.P\{/.test(src) && !src.includes('.PC{') && !src.includes('.PB{'),
  '규칙이 두 벌이면 한쪽만 고치는 날 갈린다');

console.log('\n[종이 2] 인쇄가 미리보기와 같은 함수를 쓴다');
let rp = run(mkBook({
  mapPage: true, home: 'andong',
  pages: [page({ rc: 'andong', spot: '봉정사' }), page({ id: 'p2', rc: 'gyeongju', spot: '불국사' })]
}));
const same = rp.hook.printHTML(rp.hook.bookOf());
check('인쇄본도 같은 상자에 담긴다', same.includes('class="sbox"') && same.includes('class="sheet'));
// 그라데이션 id 는 부를 때마다 하나씩 올라가는 일련번호다. 그것만 지우고 견준다.
const flat = t => t.replace(/cg\d+/g, 'cg');
check('인쇄본이 미리보기와 글자 하나까지 같다', flat(rp.prev).includes(flat(same)),
  '두 벌로 그리면 언젠가 갈린다. 같은 함수를 부르면 갈릴 수가 없다');

console.log('\n[종이 3] 종이에는 안내 문구가 찍히지 않는다');
const blank = run(mkBook({ pages: [page({ src: '', text: '' })] }));
check('화면에는 「글을 적어 주세요」', blank.prev.includes('글을 적어 주세요'));
check('종이에는 찍히지 않는다', !blank.hook.printHTML(blank.hook.bookOf()).includes('글을 적어 주세요'),
  '빈 쪽에 안내 문구가 인쇄되어 나가면 안 된다');

console.log('\n[점검] 뽑기 전에 알려 준다');
const chk = run(mkBook({ pages: [
  page({ id: 'a', alt: '', rc: 'andong', spot: '봉정사' }),
  page({ id: 'b', src: '', text: '', rc: '', spot: '' }),
  page({ id: 'c', rc: '', spot: '' })
] }));
check('점검 칸이 있다', chk.prev.includes('뽑기 전에 한 번'));
check('사진 설명이 없는 쪽을 짚는다', chk.prev.includes('사진에 설명이 없습니다'));
check('빈 쪽을 짚는다', chk.prev.includes('빈 종이가 나갑니다'));
check('장소를 안 적은 쪽을 짚는다', chk.prev.includes('탐방 지도에 찍히지 않습니다'));
const clean = run(mkBook({ pages: [page({ rc: 'andong', spot: '봉정사' })] }));
check('아쉬운 데가 없으면 그렇게 말한다', clean.prev.includes('그대로 뽑으셔도 됩니다'),
  '늘 잔소리하면 아무도 안 읽는다');
check('잘림 알림 자리를 미리 만들어 둔다', chk.prev.includes('id="cut-all"'));
check('한 장씩 화면에도 잘림 알림 자리', chk.page.includes('id="cut-one"'));

console.log('\n[사진] 여러 장을 한 번에');
check('단추가 있다', chk.page.includes('id="p-photos"'));
check('빈 책에서도 안내한다', run(null).page.includes('사진 여러 장 넣기'));
check('여러 장 고를 수 있게 연다', /i\.multiple = true;\s*\n\s*i\.addEventListener/.test(src),
  '한 장씩만 골라지면 열두 장이면 열두 번이다');
check('한 장씩 줄여 넣는다', src.includes('shrinkFile(f, MAX_EDGE, QUALITY'),
  '열 장을 한꺼번에 캔버스에 올리면 낡은 태블릿이 멈춘다');
check('한 장이 깨져도 나머지가 이어진다', /img\.onerror[\s\S]{0,120}cb\(null\)/.test(src));

console.log('\n[마크] 이 앱의 마크');
check('머리말이 앱 마크를 쓴다', src.includes('펼친 책 위를 가로지르는 점선 길'));
check('책·길·점 세 조각이다', /appMark[\s\S]{0,700}mk-dot/.test(src));
check('판권 표기의 상표는 그대로', src.includes('<path class="mk-arc"  d="M16 46 Q32 -10 48 30"'),
  '저작권 표기는 지우지도 바꾸지도 않는다');

/* ==========================================================================
   v0.8 — 학생이 쓰는 앱답게
   ========================================================================== */

console.log('\n[v0.8-1] 탭 일곱에 차례와 칸막이가 있다');
{
  check('만드는 넷에 번호가 붙는다',
    ['1', '2', '3', '4'].every(n => html.includes('<i class="tno" aria-hidden="true">' + n + '</i>')),
    '처음 여는 학생은 어디부터 눌러야 하는지 알 수 없었다');
  check('성격이 다른 것 앞에 칸막이가 있다',
    (html.match(/<span class="tsep"/g) || []).length === 2,
    '보기 / 보관 / 선생님 은 만드는 차례가 아니다');
  check('선생님이 쓰는 탭은 달라 보인다', html.includes('class="tab--teach"'));
  check('번호는 읽어 주지 않는다', html.includes('<i class="tno" aria-hidden="true">'),
    '스크린리더가 「1 표지」라고 두 번 읽으면 방해가 된다');

  const t = run(mkBook());
  check('걸음마다 다음으로 가는 줄이 있다',
    ['cover', 'spot', 'page', 'back'].every(k => t[k].includes('class="stepfoot')),
    '다음에 무엇을 하는지 안 보이면 탭을 하나씩 눌러 보며 찾는다');
  check('마지막 걸음은 미리보기로 보낸다', t.back.includes('id="s-prev-go"'));
  check('첫 걸음에는 뒤로 가는 단추가 없다', !t.cover.includes('data-goto="0"'));
  check('인쇄할 때 걸음 줄은 감춘다', html.includes('.stepfoot{display:none!important}'));
}

console.log('\n[v0.8-2] 뼈대 책 — 글은 주지 않고 자리만');
{
  const t = run(mkBook({ pages: [] }));
  check('쪽이 없을 때 뼈대를 권한다', t.page.includes('id="p-skel"'));
  check('무슨 물음인지 미리 보여 준다', t.page.includes('가장 기억에 남는 것은'));
  const sk = t.hook.makeSkeleton();
  check('뼈대는 네 쪽', sk.length === 4);
  check('글은 한 줄도 채우지 않는다', sk.every(p => !p.text),
    '콘텐츠는 학생이 채우는 것 — 기획서에서 지역 콘텐츠 DB 를 뺀 이유');
  check('쪽마다 물음이 하나씩', sk.every(p => p.ask && p.ask.length > 5));
  check('물음은 안내로만 보인다', html.includes("esc(p.ask || '무엇을 보았고"),
    '값으로 넣으면 학생이 지우고 써야 한다');
}

console.log('\n[v0.8-3] 학급 문집은 선생님 자리');
{
  const t = run(mkBook());
  check('이름이 「학급 문집 만들기」', t.merge.includes('학급 문집 만들기'));
  check('선생님이 쓰는 화면이라고 먼저 말한다', t.merge.includes('선생님이 쓰는 화면입니다'));
  check('학생이 어디까지 하면 되는지 적는다',
    t.merge.includes('「파일로 내보내기」까지</b>가 학생의 일'));
  check('탭 이름에도 선생님이라 붙는다', html.includes('>선생님</i></button>'));
}

console.log('\n[v0.8-4] 얼마나 담을 수 있는지 그 자리에서');
{
  /* 남은 자리는 **쪽이 있을 때** 적습니다. 빈 책에 대고 「앞으로 몇 장」을 말할 까닭이 없습니다. */
  const t = run(mkBook({ pages: [page()] }));
  check('페이지 화면에 남은 자리를 적는다', t.page.includes('class="room small"'),
    '책장까지 가서 보라고 하면 이미 다 넣은 뒤다');
  check('지금 책이 얼마인지 말한다', t.page.includes('지금 책'));
  check('빈 책에는 적지 않는다', !run(mkBook()).page.includes('class="room small"'),
    '넣은 것이 없는데 「앞으로 몇 장」을 말할 수 없다');
  check('사진을 넣은 뒤에도 알려 준다', html.includes('sayRoom(lastImg)'));
  check('넣어 본 사진이 없으면 몇 장인지 어림하지 않는다',
    html.includes("if (!ps.length) return 0;"),
    '지어낸 수를 보이지 않는다');
}

console.log('\n[v0.8-5] 지운 쪽을 되돌릴 수 있다');
{
  check('되돌리는 자리가 있다', html.includes('id="undo"'));
  check('묻지 않고 지우고 되돌릴 수 있게 한다',
    html.includes('function dropPage(i)') && !html.includes("confirm('이 쪽을 지울까요?')"),
    '확인창은 잘못 누르는 것을 못 막는다 — 누르던 손이 그대로 「예」를 누른다');
  check('한 걸음만 기억한다', html.includes('var UNDO = null;'),
    '여러 걸음을 쌓으면 사진이 메모리에 계속 남는다');
  check('되돌리면 그 자리로 되돌아간다', html.includes('d.book.pages.splice(Math.max(0, Math.min(n, at)), 0, pg)'));
  check('읽어 주는 프로그램에도 알린다', html.includes('id="undo" class="undo no-print" role="status"'));
  check('인쇄에는 안 나온다', html.includes('@media print{.undo{display:none!important}}'));
}

console.log('\n[v0.8-6] 문집으로 묶을 수 있게');
{
  const t = run(mkBook());
  check('뽑는 방식을 고른다', t.prev.includes('data-paper="2up"') && t.prev.includes('data-paper="duo"'));
  check('@page 를 갈아 끼울 수 있게 뺐다', html.includes('<style id="page-size">'));
  check('두 쪽씩은 A4 가로', html.includes("'@page{size:A4 landscape;margin:8mm}'"));
  check('두 쪽씩은 zoom 으로 줄인다', html.includes(':root[data-paper="2up"] .sbox{zoom:.715'),
    '상자 안엣것이 상자 너비에 맞춰 그려지므로 상자만 줄이면 된다');
  check('두 장을 채운 뒤 넘긴다', html.includes(':root[data-paper="2up"] .sbox:nth-child(2n)'));
  check('양면은 앱이 켤 수 없다고 적는다', html.includes('앱이 대신 켜 줄 수는 없습니다'));
  check('쪽 배치와 이름이 겹치지 않는다',
    html.includes("document.documentElement.setAttribute('data-paper', k)"),
    'data-lay 는 쪽 배치가 이미 쓰는 이름이다');
}

console.log('\n[v0.8-7] AI 초안 도우미가 없다 — 학생이 쓰는 앱');
{
  check('머리에 AI 단추가 없다', !html.includes('btn-ai'));
  check('도우미 조각이 통째로 빠졌다', !html.includes('LEAPAI') && !html.includes('leap-aim'));
  check('그래도 아무 데도 보내지 않는다',
    !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(html));
  /* 개수로 세던 자리입니다(둘). 머리에 「설명서」가 늘면서 셋이 되었는데,
     여기서 지키려는 것은 **개수가 아니라 「AI 단추가 없다」**입니다.
     지킬 것을 그대로 적습니다 — 그래야 단추가 하나 늘 때마다 헛되이 깨지지 않습니다. */
  const head = html.slice(html.indexOf('top-actions'), html.indexOf('</header>'));
  check('머리에 AI 초안 단추가 없다', !/AI 초안|btn-ai/.test(head),
    '학생이 쓰는 앱입니다. AI 는 교사용 앱에만 둡니다');
  check('머리에 메인으로 · 설명서 · 화면 전환이 있다',
    head.includes('메인으로') && head.includes('설명서') && head.includes('btn-theme'));
}

console.log('\n[v0.8-★] 새 책 만들기가 저장 방식에 따라 다른 일을 하던 것');
{
  check('책장이 열리면 묻지 않고 한 권 더한다',
    html.includes("if (V.mode === 'idb') {") && html.includes('잃을 것이 없습니다. 묻지 않습니다.'));
  check('한 권 모드에서는 갈림길을 연다', html.includes('function openNewLS()'));
  check('잃지 않는 길이 맨 위', html.indexOf('id="nb-save"') < html.indexOf('id="nb-drop"'));
  check('무엇이 사라지는지 이름을 대며 말한다', html.includes('은(는) ') && html.includes('이 기기에서 사라집니다'));
  check('아무것도 안 적었으면 묻지 않는다', html.includes('if (empty) { db.reset()'));
  check('왜 한 권뿐인지 적는다', html.includes('넓은 저장소가 열리지 않아'),
    '조용히 물러나면 안 된다');
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
