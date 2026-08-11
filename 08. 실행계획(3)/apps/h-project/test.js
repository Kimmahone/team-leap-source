/* 프로젝트 학습 계획서 — 점검
   최소 DOM 스텁 위에서 앱을 실제로 실행하고, 이 앱이 **약속한 규칙**이
   지켜지는지 본다. 기능이 있는지가 아니라 규칙이 깨지지 않는지를 본다.
   실행: node test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const blocks = [...SRC.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function makeEl(tag) {
  const el = {
    tagName: tag || 'div', _html: '', hidden: false, value: '', textContent: '',
    tabIndex: 0, checked: false, files: null, width: 0, height: 0,
    classList: { add() {}, remove() {} }, style: {}, className: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    set outerHTML(v) { this._html = v; },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
    scrollIntoView() {}, getContext() { return { drawImage() {} }; },
    toDataURL() { return 'data:image/jpeg;base64,AA'; },
    setAttribute(k, v) { this['_' + k] = v; },
    getAttribute(k) { return this['_' + k] == null ? null : this['_' + k]; },
    hasAttribute(k) { return this['_' + k] != null; },
    appendChild() {}, removeChild() {},
    /* id 로 찾을 때는 **그려 놓은 HTML 에 그 id 가 있을 때만** 돌려준다.
       늘 무언가를 돌려주면, 화면에 없는 단추를 잡는 코드가 검사에서는 멀쩡히
       지나간다. 흉내는 진짜보다 너그러우면 안 된다. */
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(String(sel));
      if (m) return this._html.includes('id="' + m[1] + '"') ? makeEl() : null;
      return this._html ? makeEl() : null;
    },
    querySelectorAll() { return []; }
  };
  return el;
}

function run(state) {
  const panels = {};
  const store = { 'leap-project-v1': state ? JSON.stringify(state) : null };
  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    matchMedia: () => ({ matches: false }),
    crypto: globalThis.crypto,
    TextEncoder,
    Blob: function (parts, opt) { this.parts = parts; this.type = opt && opt.type; },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Image: function () {}, FileReader: function () {},
    alert: () => {}, confirm: () => true, print: () => {}, scrollTo: () => {},
    setTimeout: () => {}, clearTimeout: () => {}, setInterval: () => {},
    addEventListener() {}, removeEventListener() {},
    document: {
      title: '프로젝트 학습 계획서 — TEAM LEAP',
      getElementById(id) { if (!panels[id]) panels[id] = makeEl(); return panels[id]; },
      createElement: makeEl,
      body: { appendChild() {}, removeChild() {}, className: '' },
      documentElement: makeEl(),
      addEventListener() {}, removeEventListener() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  blocks.forEach(b => vm.runInContext(b, sandbox, { timeout: 10000 }));

  const get = id => (panels[id] ? panels[id]._html : '');
  return {
    H: sandbox.LEAP_H, LEAP: sandbox.LEAP, store,
    get panel() { return get('panel'); },
    get steps() { return get('steps'); },
    get bar() { return get('planbar'); },
    get mini() { return get('mini'); }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  실패 ' + name + (extra ? '\n       ' + extra : '')); }
}

/* --- 검사용 자료 --- */
const F1 = { id: 'f1', sub: '우리가 정한 역사 질문', body: '- 질문 모으기\n- 모둠 정하기',
  out: '질문 목록', links: [{ s: '사회', h: 2 }, { s: '국어', h: 1 }] };
const F2 = { id: 'f2', sub: '자료를 찾고 정리하기', body: '- 도서관\n- 누리집',
  out: '조사 카드', links: [{ s: '사회', h: 3 }, { s: '창의적 체험활동', h: 1 }] };
const mk = (over) => Object.assign({
  v: 1, kind: 'plan',
  info: { year: '2026학년도 2학기', school: '포항양덕초등학교', title: '살아 있는 역사 박물관',
    grade: '5학년', type: '학급 단위형', from: '2026-09-01', to: '2026-11-30', hours: 7 },
  stds: ['6사04-01'], overview: '우리나라 역사를 깊이 탐구하고 우리 반 박물관을 만든다.',
  flow: [F1, F2],
  evals: [{ subj: '사회', code: '6사04-01', what: '유물로 생활을 추론하는가', how: '관찰평가' }],
  budget: [{ item: '색지', basis: '1,200원 × 24명', cost: '28800', note: '' }],
  results: [], reflect: { tip: '', plus: '', interest: '', minus: '', voice: '' }
}, over);

console.log('\n[1] 빈 화면 — 무엇부터 하라고 말하는가');
{
  const r = run(null);
  check('걸음이 다섯 개다 (계획서)', (r.steps.match(/data-step=/g) || []).length === 5,
    '결과 보고서일 때만 여섯 번째 걸음이 선다');
  check('첫 걸음이 켜져 있다', r.steps.includes('data-step="0" aria-pressed="true"'));
  check('기본 정보 화면이 뜬다', r.panel.includes('무엇을 만드시나요'));
  check('이름이 없으면 그렇다고 적는다', r.bar.includes('이름 없는 프로젝트'));
  check('미리보기가 비어 있어도 그려진다', r.mini.includes('Ⅰ. 프로젝트 소개'),
    '빈 종이라도 보여야 「무엇이 나올지」를 알 수 있다');
  check('아직 없는 칸을 그렇다고 적는다', r.mini.includes('(아직 고르지 않았습니다)'));
}

console.log('\n[2] 성취기준 — 611건이 앱 안에 있다');
{
  const r = run(null);
  check('성취기준을 구웠다', r.H.stdCount === 611, '지금 ' + (r.H && r.H.stdCount));
  check('코드로 찾는다', r.H.findStd('', '', '6사04-01').length === 1);
  check('낱말로 찾는다', r.H.findStd('6', '사회', '유물').length > 0);
  check('초성으로도 찾는다', r.H.findStd('6', '', 'ㅇㅁ').length > 0,
    '「ㅇㅁ」로 유물을 — 코드를 외우고 있는 교사는 없다');
  check('학년군으로 좁힌다',
    r.H.findStd('2', '', '').every(s => s.band === '2') && r.H.findStd('2', '', '').length === 100);
  check('교과로 좁힌다', r.H.findStd('', '수학', '').length === 121);
  /* 구운 자료를 그대로 뜯어 봅니다. 「몇 건인가」만 세면 각 줄에 무엇이 들어 있는지는
     보이지 않습니다 — 마스터 함정 12번이 여기서도 같습니다. */
  const baked = JSON.parse(
    SRC.slice(SRC.indexOf('var STD_RAW = ') + 14, SRC.indexOf('/* STD-DATA-END */')).trim().replace(/;$/, ''));
  check('★ 한 줄이 [코드, 문장] 둘뿐이다', baked.every(x => x.length === 2),
    '평가 계획은 성취수준 A·B·C 를 적는 자리가 아니다. 쓰지 않을 105K 를 들고 다니지 않는다');
  check('구운 건수가 앱이 아는 건수와 같다', baked.length === r.H.stdCount);
}

console.log('\n[3] 교과 시수 저울 — 이 앱의 얼굴');
{
  const r = run(mk());
  check('차시를 셈한다', r.H.hours(r.H.read()) === 7, '2+1+3+1');
  const by = r.H.bySubject(r.H.read());
  check('교과별로 나눈다', by.length === 3);
  check('많은 것이 앞에 온다', by[0].s === '사회' && by[0].h === 5);
  check('창의적 체험활동도 셈에 든다', by.some(x => x.s === '창의적 체험활동' && x.h === 1),
    '프로젝트는 교과에서만 시수를 빌려 오지 않는다');
}

console.log('\n[4] 차시 번호는 앱이 셈한다');
{
  const r = run(mk());
  const rg = r.H.ranges(r.H.read());
  check('첫 소주제는 1~3차시', rg[0] === '1~3');
  check('다음은 4~7차시', rg[1] === '4~7');
  check('한 차시짜리는 범위를 쓰지 않는다',
    run(mk({ flow: [{ id: 'x', sub: 'a', body: '', out: '', links: [{ s: '국어', h: 1 }] }] }))
      .H.ranges(run(mk({ flow: [{ id: 'x', sub: 'a', body: '', out: '', links: [{ s: '국어', h: 1 }] }] })).H.read())[0] === '1');
  check('시수가 0이면 「—」', r.H.ranges({ flow: [{ links: [] }] })[0] === '—',
    '0차시를 1차시처럼 그리면 뒤엣것이 전부 밀린다');
}

console.log('\n[5] ★ 계획 차시와 흐름 차시가 어긋나면 말한다 — 함정 12번');
{
  const same = run(mk({ info: Object.assign({}, mk().info, { hours: 7 }) }));
  check('맞으면 맞는다고 한다', same.H.hours(same.H.read()) === same.H.read().info.hours);
  const off = run(mk({ info: Object.assign({}, mk().info, { hours: 10 }) }));
  check('어긋난 것을 앱이 안다', off.H.hours(off.H.read()) !== off.H.read().info.hours);
  check('화면이 그 말을 한다', SRC.includes('차시 많습니다.') && SRC.includes('차시 모자랍니다.'),
    '합계만 보고 있으면 쪼갠 값이 틀린 것은 보이지 않는다');
  check('연계 교과를 글로 적게 두지 않았다',
    SRC.includes('고르고 세는 칸으로 두어 **합계를 낼 수 없는 상태 자체를 없앴습니다**'),
    '「국어/2, 사회/1」처럼 글로 적으면 합계를 낼 수 없고, 그러면 저울이 서지 않는다');
}

console.log('\n[6] 계획서와 결과 보고서는 같은 자료의 두 얼굴');
{
  const p = run(mk());
  const q = run(mk({ kind: 'report' }));
  check('계획서는 걸음이 다섯', (p.steps.match(/data-step=/g) || []).length === 5);
  check('보고서는 걸음이 여섯', (q.steps.match(/data-step=/g) || []).length === 6);
  check('계획서 종이에는 Ⅲ·Ⅳ 장이 없다',
    !p.mini.includes('Ⅲ. 운영 과정과 결과') && !p.mini.includes('Ⅳ. 성찰'));
  check('보고서 종이에는 있다',
    q.mini.includes('Ⅲ. 운영 과정과 결과') && q.mini.includes('Ⅳ. 성찰과 아이들의 반응'));
  check('제목이 달라진다',
    p.mini.includes('운영 계획') && q.mini.includes('운영 결과 보고서'));
  check('적어 둔 것은 그대로 넘어간다', q.mini.includes('살아 있는 역사 박물관'),
    '옮겨 적게 하면 옮겨 적는 동안 숫자가 어긋난다');
}

console.log('\n[7] 종이 — 미리보기와 인쇄가 같은 HTML 이다');
{
  const r = run(mk());
  const paper = r.H.paperHTML(r.H.read());
  check('미리보기가 곧 그 HTML 이다', r.mini === paper,
    '따로 만들면 「여기 보이는 것이 그대로 나옵니다」가 거짓말이 된다');
  check('흐름표에 계가 붙는다', paper.includes('<th class="c">7차시</th>'));
  check('예산에 합계가 붙는다', paper.includes('28,800'));
  check('성취기준이 코드와 문장으로 나온다', paper.includes('[6사04-01]'));
  check('연계 교과를 종이에서도 셈해 적는다', paper.includes('사회/2') && paper.includes('국어/1'));
  /* 판면 규칙이 @media print 블록 «안»에 갇혀 있지 않은지를 실제로 확인합니다.
     안에만 두면 미리보기가 종이와 갈립니다. 규칙 이름을 베껴 적는 것으로는
     그것을 확인할 수 없으므로 중괄호를 세어 블록을 떠냅니다 (마스터 함정 35번). */
  function printBlocks(css) {
    const out = [];
    let i = 0;
    for (;;) {
      const s0 = css.indexOf('@media print', i);
      if (s0 < 0) break;
      let k = css.indexOf('{', s0), depth = 0, j = k;
      for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') { depth--; if (!depth) break; }
      }
      out.push(css.slice(k, j));
      i = j + 1;
    }
    return out;
  }
  const inPrint = printBlocks(SRC);
  check('@media print 블록을 찾았다', inPrint.length >= 1);
  check('판면 규칙이 @media print 밖에 있다',
    SRC.includes('.pv-page h2.P-h') && inPrint.every(b => !b.includes('.pv-page h2.P-h')),
    '@media print 안에만 두면 미리보기가 종이와 갈린다');
  check('긴 표는 머리줄을 다시 그린다', SRC.includes('thead{display:table-header-group}'),
    '마스터 함정 29번');
  check('예산이 비면 그 절이 종이에 없다',
    !run(mk({ budget: [] })).H.paperHTML(run(mk({ budget: [] })).H.read()).includes('예산 사용 계획'));
}

console.log('\n[8] PDF 파일 이름 — 함정 27번');
{
  const r = run(mk());
  const n = r.H.fileBase(r.H.read());
  check('계획서임을 이름에 적는다', n.indexOf('프로젝트계획서_') === 0);
  check('학년과 이름과 날짜가 들어간다', n.includes('5학년') && n.includes('살아 있는 역사 박물관'));
  const q = run(mk({ kind: 'report' }));
  check('보고서는 이름이 다르다', q.H.fileBase(q.H.read()).indexOf('프로젝트결과보고서_') === 0);
  check('인쇄하는 동안만 제목을 바꾼다', /function withFileName\(name, run\)/.test(SRC));
  check('afterprint 로 되돌린다', SRC.includes("window.addEventListener('afterprint', back)"));
  check('안 오는 브라우저를 위한 안전망', SRC.includes('setTimeout(back, 20000)'));
  check('파일 이름에 못 쓰는 글자를 걷어낸다', !/[\\/:*?"<>|]/.test(n));
}

console.log('\n[9] 한글·워드로 내보내기 — 라이브러리 없이');
{
  const r = run(mk({ kind: 'report',
    results: [{ id: 'r1', fid: 'f1', text: '아이들이 질문을 서른 개 냈다.', photos: [{ src: 'data:,', w: 10, h: 10 }] }],
    reflect: { tip: '다음에는 도서관을 먼저 잡아 두세요.', plus: '좋았다', interest: '흥미', minus: '아쉽다', voice: '재미있었어요' } }));
  const files = r.H.docxFiles(r.H.read());
  const names = files.map(f => f.name);
  check('DOCX 에 꼭 있어야 할 세 부품이 있다',
    names.includes('[Content_Types].xml') && names.includes('_rels/.rels') && names.includes('word/document.xml'));
  const doc = files.filter(f => f.name === 'word/document.xml')[0].data;
  check('XML 이 온전하다', doc.indexOf('<?xml') === 0 && doc.trim().endsWith('</w:document>'));
  check('표가 들어간다', doc.includes('<w:tbl>') && doc.includes('<w:tblBorders>'));
  check('A4 쪽 크기를 적는다', doc.includes('<w:pgSz w:w="11906" w:h="16838"/>'));
  check('내용이 실린다', doc.includes('살아 있는 역사 박물관') && doc.includes('우리가 정한 역사 질문'));
  check('줄바꿈이 한 줄로 붙지 않는다', doc.includes('<w:br/>'),
    '학습 내용은 여러 줄이다. 그냥 넣으면 한 줄로 붙는다');
  /* 글자가 들어가는 자리를 모두 뜯어 보고, 감싸지 않은 & 나 < 가 있는지 봅니다.
     하나만 새도 파일이 통째로 열리지 않습니다 — 「대부분 된다」가 없는 자리입니다. */
  const texts = [...doc.matchAll(/<w:t xml:space="preserve">([\s\S]*?)<\/w:t>/g)].map(m => m[1]);
  check('글자가 들어가는 자리가 실제로 있다', texts.length > 10);
  check('★ XML 로 새는 글자가 없다',
    texts.every(t => !/</.test(t) && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(t)),
    '제목에 & 나 < 가 들어가면 파일이 통째로 열리지 않는다');
  const amp = run(mk({ info: Object.assign({}, mk().info, { title: '역사 & <박물관>' }) }));
  const doc2 = amp.H.docxFiles(amp.H.read()).filter(f => f.name === 'word/document.xml')[0].data;
  check('& 와 < 를 감싼다', doc2.includes('역사 &amp; &lt;박물관&gt;'));
  check('보고서면 Ⅲ·Ⅳ 장이 들어간다',
    doc.includes('Ⅲ. 운영 과정과 결과') && doc.includes('Ⅳ. 성찰과 아이들의 반응'));
  check('사진은 담지 않되 그렇다고 적는다', doc.includes('인쇄·PDF 로 나옵니다'),
    '없는 것을 있는 척하지 않는다. 열리지 않는 파일보다 낫다');
  check('HWPX 를 흉내 내지 않았다', !SRC.includes('hwpx') && !SRC.includes('application/hwp+zip'),
    '겉모양만 맞춘 HWPX 는 한글이 열지 못하거나 글이 날것으로 뜬다');
  /* ★ v0.1 에서 kit 사본에 LEAP.saveBlob 이 빠져 있어 내려받기가 던졌다.
     docxFiles() 만 검사하고 «내려받는 데까지» 가 보지 않았기 때문에 통과했다
     (마스터 함정 13번 — 사본이 조용히 낡는다). 이제 부르는 것이 다 있는지 센다. */
  check('★ 앱이 부르는 LEAP 창구가 사본에 다 있다', (() => {
    const used = new Set([...SRC.matchAll(/\bLEAP\.([A-Za-z]\w*)\s*\(/g)].map(m => m[1]));
    const miss = [...used].filter(n => typeof r.LEAP[n] !== 'function');
    if (miss.length) console.log('       빠진 것: ' + miss.join(', '));
    return miss.length === 0;
  })(), '사본이 조용히 낡는다');
}

console.log('\n[10] AI 초안 — 키 없이, 그리고 학생 것은 나가지 않는다');
{
  check('API 키를 쓰지 않는다', !/api[_ ]?key/i.test(SRC),
    '키를 넣는 순간 이 앱은 인터넷이 필요한 앱이 된다 (마스터 원칙 1번)');
  check('밖으로 부르는 곳이 없다', !/fetch\(|XMLHttpRequest|WebSocket|generativelanguage/.test(SRC),
    '앱은 프롬프트를 만들어 줄 뿐 아무것도 보내지 않는다 (원칙 2번)');
  check('고른 성취기준 안에서만 쓰라고 적는다', SRC.includes('[이미 고른 성취기준 — 이 안에서만 쓰세요]'));
  check('작은 학교의 조건을 함께 준다', SRC.includes('전교생이 수십 명인 **소규모학교**입니다'));
  check('아이들의 말은 프롬프트에 넣지 않는다', !/reflect\.voice/.test(SRC.slice(SRC.indexOf('앱 H 의 AI 초안 도우미'))),
    '결과 보고서의 「아이들의 말」은 밖으로 나갈 것이 아니다');
  check('돌아온 것을 바로 넣지 않는다', SRC.includes('이대로 받기'),
    '무엇이 들어오는지 먼저 보여 주고 눌러야 들어간다');
  check('고르지 않은 성취기준은 빈 채로 둔다',
    SRC.includes('// 고르지 않은 성취기준은 빈 채로 둡니다. 지어내서 채우지 않습니다.'));
  check('앞뒤에 설명이 섞여 있어도 읽는다', /function parseLoose\(s\)/.test(SRC),
    '챗봇은 「여기 있습니다!」를 붙이기 마련이다');
}

console.log('\n[11] 갈림길과 되돌리기 — 함정 37·39·44번');
{
  check('★ 앱 어디에도 confirm 이 없다', !/\bconfirm\(/.test(SRC),
    '「계속할까요?」로는 잘못 누르는 것을 못 막는다. 누르던 손이 그대로 「예」를 누른다');
  check('갈림길 창이 있다', /function askWay\(opts\)/.test(SRC));
  check('내보내는 길이 맨 위', SRC.indexOf("name: '파일로 내보내고 새로 짜기'") < SRC.indexOf("name: '그냥 새로 짜기'"));
  check('Esc 는 아무 일도 일으키지 않는다', SRC.includes("if (e.key === 'Escape') shut();"));
  check('잃을 것이 없으면 묻지 않는다', SRC.includes('if (!has(d)) { wipe(); return; }'));
  check('되돌리기는 통으로 붙든다', SRC.includes("snap: JSON.stringify(db.get())"));
  check('한 걸음만 기억한다', SRC.includes('if (undoKeep) undoKeep = false; else undo = null;'));
  check('소주제·평가·예산·사진을 뺄 때 되돌릴 수 있다',
    (SRC.match(/markUndo\(/g) || []).length >= 6);
}

console.log('\n[12] 개인정보 — 학생을 적는 칸이 없다');
{
  check('학생 이름 칸이 없다', !/이름.*학생|학생.*이름칸/.test(SRC.replace(/학생 이름은[^<]*/g, '')),
    '칸이 있으면 언젠가 적힌다');
  check('적지 말라고 두 곳에서 알린다',
    (SRC.match(/학생 이름은[^<]*적지 마세요|학생 이름은 어디에도 넣지 마세요/g) || []).length >= 2);
  check('자료는 이 기기 안에만 있다고 적는다', SRC.includes('이 브라우저 안에만'));
  check('저장 열쇠가 이 앱 것이다', SRC.includes("var KEY = 'leap-project-v1'"));
}

console.log('\n[13] 옛 저장본이 터지지 않는다 — 함정 10번');
{
  const old = { v: 1, info: { title: '옛것' } };   // 칸이 거의 없는 저장본
  let r = null;
  try { r = run(old); } catch (e) { /* 아래에서 잡힌다 */ }
  check('없는 칸을 채워 넣는다', !!r && r.H.read().flow.length === 0 && r.H.read().stds.length === 0);
  check('그래도 화면이 그려진다', !!r && r.panel.includes('무엇을 만드시나요'));
  check('미리보기도 그려진다', !!r && r.mini.includes('Ⅰ. 프로젝트 소개'));
  check('기본값 채우기 함수가 있다', /function fill\(d\)/.test(SRC));
}

console.log('\n[14] 만드는 사람의 말이 일하는 화면에 없다');
{
  const r = run(mk());
  check('점검 개수를 화면에 적지 않는다', !/\d+개 통과|자동 점검/.test(r.panel + r.bar));
  check('「서버 없는 단일 HTML」 같은 말이 화면에 없다',
    !/단일 HTML|서버 없/.test(r.panel + r.bar + r.mini));
  check('판권에는 남긴다', SRC.includes('© 2026 TEAM LEAP. All rights reserved.'));
  check('저작권 표기가 네 곳에 있다',
    (SRC.match(/© 2026 TEAM LEAP/g) || []).length >= 3 && SRC.includes('프로젝트 학습 계획서 v0.1'));
}

console.log('\n[15] 다른 앱과 어긋나지 않는다');
{
  check('메인으로 나가는 길이 있다', SRC.includes('메인으로') && SRC.includes('../../../index.html'));
  check('나가도 잃는 것이 없다고 알린다', SRC.includes('이 앱에 적은 것은 그대로 남습니다'));
  check('테마 단추가 지금 누르면 어떻게 되는지 말한다', SRC.includes('LEAP.initThemeBtn'));
  check('토스트는 종이에 찍히지 않는다 (kit 규칙)', SRC.includes('.leap-toast'));
  check('판 번호가 머리 주석과 판권에서 같다',
    /프로젝트 학습 계획서 v0\.1/.test(SRC) &&
    /<div class="name">프로젝트 학습 계획서 <span>v0\.1<\/span><\/div>/.test(SRC));
  check('굽는 표시가 남아 있다', SRC.includes('/* STD-DATA-BEGIN */') && SRC.includes('/* STD-DATA-END */'),
    '표시가 없으면 bake-standards.mjs 가 이 앱을 건너뛴다');
}

console.log('\n----------------------------------------');
console.log(pass + '개 통과, ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
