/* EPUB 파일 자체 점검
   앱의 doEpub 을 그대로 돌려 .epub 을 만들고, 진짜 열리는 파일인지 본다.
   ZIP 작성기를 직접 짰기 때문에 여기가 가장 위험한 곳이다.

   실행: node test-epub.js   (결과 파일 경로를 마지막에 찍는다) */

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 1×1 짜리 진짜 JPEG. 내용이 유효해야 뷰어가 그림을 연다.
const JPEG1x1 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL' +
  'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAA' +
  'AAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function makeEl() {
  return {
    _html: '', hidden: false, value: '', textContent: '', tabIndex: 0, checked: false,
    classList: { add() {}, remove() {} }, style: {}, files: null, type: '',
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    addEventListener() {}, focus() {}, click() {},
    setAttribute(k, v) { this['_' + k] = v; }, getAttribute(k) { return this['_' + k] || null; },
    appendChild() {}, removeChild() {},
    querySelector() { return makeEl(); },
    querySelectorAll(s) { return String(s).includes('role="tab"') ? [makeEl(), makeEl(), makeEl(), makeEl(), makeEl()] : []; }
  };
}

const store = {};
const sandbox = {
  console, __LEAP_TEST__: {},
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  matchMedia: () => ({ matches: false }),
  crypto: globalThis.crypto, TextEncoder, Blob, atob: globalThis.atob,
  alert: () => {}, confirm: () => true,
  setTimeout: f => { if (typeof f === 'function') f(); }, clearTimeout: () => {},
  Image: function () { const s = this; Object.defineProperty(this, 'src', { set() { if (s.onerror) s.onerror(); } }); },
  URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  FileReader: function () {},
  document: {
    getElementById(id) { return (store['_' + id] = store['_' + id] || makeEl()); },
    createElement: makeEl, body: { appendChild() {}, removeChild() {} }, documentElement: makeEl()
  }
};
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(js, sandbox, { timeout: 8000 });

// 내보내기를 가로채 파일로 받는다
let captured = null, capturedName = '';
sandbox.LEAP.saveBlob = function (name, blob) { capturedName = name; captured = blob; };

const BOOK = {
  title: '우리 마을 이야기', subtitle: '봉정사 탐방 기록',
  team: '3학년 1반 두루미 모둠', date: '2026-10-15',
  coverStyle: 'photo', cover: { src: JPEG1x1, w: 1600, h: 900, bytesIn: 4000000, bytesOut: 300000 },
  // 탐방 지도 쪽이 들어간 책으로 확인한다. 지도는 SVG 를 XHTML 안에 그대로
  // 넣으므로, 태그 하나만 안 닫혀도 EPUB 전체가 안 열린다.
  coverTheme: 'sea', coverPat: 'wave', coverAlign: 'center',
  mapPage: true, home: 'andong',
  // 학교를 고른 책으로 확인한다. 지도 위 별표도 SVG 라 XML 로 읽혀야 한다.
  school: { n: '안동초등학교', k: 'e', rc: 'andong', ad: '경동로 643', lat: 36.5643, lon: 128.7281 },
  spots: [{ id: 's1', rc: 'uiseong', n: '우리 마을 <느티나무> & "쉼터"', t: '자연' }],
  pages: [
    { id: 'a', layout: 'photo-top', src: JPEG1x1, w: 1600, h: 1200, alt: '봉정사 극락전 앞에 선 우리 모둠',
      text: '기와가 아주 오래되어 보였다.\n두 줄로도 써 본다.', ratio: 55, zoom: 100, fx: 50, fy: 50,
      rc: 'andong', spot: '하회마을' },
    { id: 'b', divider: true, text: '기러기 모둠', sub: '하회마을 이야기' },
    { id: 'c', layout: 'text-only', src: '', text: '<위험한 태그> & "따옴표" 도 넣어 본다.',
      rc: 'uiseong', spot: '우리 마을 <느티나무> & "쉼터"' },
    { id: 'd', layout: 'text-only', src: '', text: '울릉도까지 갔다.', rc: 'ulleung', spot: '도동항' }
  ],
  back: {
    style: 'plain', photo: null,
    headline: '우리가 배운 것',
    text: '오래된 것을 지키는 일이\n왜 힘든지 알았다.',
    people: '두루미 모둠 (네 명)', school: '안동초등학교 3학년 1반', teacher: '김○○ 선생님'
  }
};

sandbox.__LEAP_TEST__.hook.epub(BOOK);

if (!captured) { console.log('실패 — EPUB 이 만들어지지 않았습니다.'); process.exit(1); }

const { execSync } = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leap-epub-'));
const out = path.join(dir, 'test.epub');

captured.arrayBuffer().then(buf => {
  fs.writeFileSync(out, Buffer.from(buf));
  console.log('만든 파일 : ' + capturedName + '  (' + (buf.byteLength / 1024).toFixed(1) + ' KB)\n');

  try {
    console.log('=== ZIP 무결성 ===');
    console.log(execSync(`unzip -t "${out}"`, { encoding: 'utf8' })
      .split('\n').filter(l => l.includes('testing:') || l.includes('No errors')).join('\n'));

    // EPUB 규격 : mimetype 이 첫 항목이면서 무압축이어야 한다
    const listing = execSync(`unzip -v "${out}"`, { encoding: 'utf8' }).split('\n');
    const first = listing.find(l => /\smimetype\s*$/.test(l)) || '';
    const firstIdx = listing.findIndex(l => /\smimetype\s*$/.test(l));
    const dataStart = listing.findIndex(l => l.startsWith('--------')) + 1;
    console.log('\n=== EPUB 규격 ===');
    console.log((firstIdx === dataStart ? '  OK   ' : '  실패 ') + 'mimetype 이 첫 항목이다');
    console.log((/Stored/.test(first) ? '  OK   ' : '  실패 ') + 'mimetype 이 무압축(Stored)이다');

    execSync(`unzip -q "${out}" -d "${dir}/x"`);
    console.log('');
    console.log(execSync(`python3 "${__dirname}/verify-epub.py" "${dir}/x"`, { encoding: 'utf8' }));
  } catch (e) {
    console.log((e.stdout || '') + (e.stderr || ''));
    process.exitCode = 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
