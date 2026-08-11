/* ==========================================================================
   LEAP Kit — 공통 스크립트
   TEAM LEAP / 경북교육 AI Lab · AI 활용 분과
   v0.1 · 2026.08.02

   원칙
   - 외부 라이브러리를 쓰지 않는다
   - 자료는 이 기기 안에만 둔다 (localStorage). 서버로 보내지 않는다
   - 앱은 단일 HTML 이어야 하므로, 배포할 때는 이 파일을 <script> 안에 붙여 넣는다
     (이 파일은 원본이고, 앱 안의 것은 사본이다)
   ========================================================================== */

(function (global) {
  'use strict';

  var LEAP = {};

  function clone(v) {
    if (typeof structuredClone === 'function') return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
  }
  LEAP.clone = clone;

  /* --- 저장 --------------------------------------------------------------
     localStorage 한 칸에 JSON 으로 넣는다.
     읽기가 실패해도 앱이 죽지 않고 초기값으로 시작한다. */
  LEAP.store = function (key, initial) {
    var cache = null;

    function flush() {
      try {
        localStorage.setItem(key, JSON.stringify(cache));
        return true;
      } catch (e) {
        LEAP.announce('저장하지 못했습니다. 파일로 내보낸 뒤 정리해 주세요.');
        return false;
      }
    }

    function read() {
      if (cache) return cache;
      try {
        var raw = localStorage.getItem(key);
        cache = raw ? JSON.parse(raw) : clone(initial);
      } catch (e) {
        cache = clone(initial);
      }
      return cache;
    }

    return {
      get: read,
      set: function (next) { cache = next; return flush(); },
      update: function (fn) { var d = read(); fn(d); flush(); return d; },
      reset: function () { cache = clone(initial); flush(); return cache; }
    };
  };

  /* --- 아이디 ------------------------------------------------------------- */
  LEAP.uid = function () {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
  };

  /* --- 섞기 --------------------------------------------------------------
     Fisher-Yates. 무기명 자료를 공개하기 직전에 순서를 지우기 위해 쓴다.
     제출 순서가 곧 누가 썼는지의 단서가 되기 때문이다. */
  LEAP.shuffle = function (arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = randInt(i + 1);
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  function randInt(n) {
    if (global.crypto && crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /* --- 파일 내보내기 / 가져오기 --------------------------------------------
     download 는 «자료를 JSON 으로» 내보냅니다.
     saveBlob 은 «이미 만들어 둔 덩어리를» 내보냅니다 — CSV·txt·docx·epub 처럼
     JSON 이 아닌 것을 내보내는 앱(C·G·H·I)이 이것을 씁니다.
     둘로 나눠 둔 것은 앱마다 같은 여섯 줄을 다시 적지 않게 하려는 것입니다. */
  LEAP.saveBlob = function (filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
  LEAP.download = function (filename, obj) {
    LEAP.saveBlob(filename, new Blob([JSON.stringify(obj, null, 2)],
      { type: 'application/json;charset=utf-8' }));
  };

  LEAP.pickFile = function (onLoad, onError) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { onLoad(JSON.parse(reader.result), f.name); }
        catch (e) { (onError || alert)('파일을 읽지 못했습니다. 이 앱에서 내보낸 파일이 맞는지 확인해 주세요.'); }
      };
      reader.readAsText(f, 'utf-8');
    });
    input.click();
  };

  /* --- 알림 --------------------------------------------------------------
     화면에 잠깐 띄우고, 동시에 스크린리더로도 읽히게 한다.
     (색·움직임만으로 알리면 접근성 심사에서 걸린다) */
  LEAP.announce = function (msg) {
    var el = document.getElementById('leap-live');
    if (!el) {
      el = document.createElement('div');
      el.id = 'leap-live';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.className = 'leap-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  };

  /* --- 날짜 --------------------------------------------------------------- */
  LEAP.todayISO = function () {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  LEAP.fmtDate = function (iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[0] + '. ' + Number(p[1]) + '. ' + Number(p[2]) + '.';
  };

  /* --- 테마 전환 ----------------------------------------------------------- */
  LEAP.toggleTheme = function () {
    var r = document.documentElement;
    var cur = r.getAttribute('data-theme');
    if (!cur) cur = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', next);
    try { localStorage.setItem('leap-theme', next); } catch (e) {}
    return next;
  };

  /* 「화면 전환」은 무엇이 바뀌는지 말해 주지 않습니다. 지금 누르면 어떻게 되는지를
     단추 자체가 말하게 둡니다 — 「어둡게 보기」를 누르면 어두워집니다. */
  LEAP.themeLabel = function () {
    var r = document.documentElement, cur = r.getAttribute('data-theme');
    if (!cur) cur = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return cur === 'dark' ? '밝게 보기' : '어둡게 보기';
  };
  LEAP.initThemeBtn = function (btn) {
    if (!btn) return;
    function paint() {
      var t = LEAP.themeLabel();
      btn.textContent = t;
      btn.setAttribute('title', '화면을 ' + t.replace(' 보기', '') + ' 바꿉니다');
      btn.setAttribute('aria-label', '화면을 ' + t.replace(' 보기', '') + ' 바꿉니다');
    }
    paint();
    btn.addEventListener('click', function () { LEAP.toggleTheme(); paint(); });
  };

  LEAP.restoreTheme = function () {
    try {
      var t = localStorage.getItem('leap-theme');
      if (t) document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
  };

  /* --- 탭 ----------------------------------------------------------------
     role=tablist 를 좌우 화살표로도 움직이게 한다 (키보드만으로 전체 조작). */
  LEAP.initTabs = function (listEl, onChange) {
    var tabs = Array.prototype.slice.call(listEl.querySelectorAll('[role="tab"]'));

    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (onChange) onChange(tab.getAttribute('aria-controls'));
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus();
        select(next);
      });
    });

    select(tabs[0]);
    return { select: select, tabs: tabs };
  };

  /* --- HTML 이스케이프 -----------------------------------------------------
     학생이 입력한 글이 그대로 화면에 들어가므로 반드시 거른다. */
  LEAP.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  global.LEAP = LEAP;
})(window);
