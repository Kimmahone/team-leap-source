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
      /* 저장이 됐는지를 돌려줍니다. 자료를 돌려주면 «늘 참»이 되어
         부르는 쪽의 `if (db.update(fn))` 이 저장 실패를 성공으로 읽습니다.
         앱 H 의 되돌리기가 실제로 그렇게 죽어 있었습니다. */
      update: function (fn) { var d = read(); fn(d); return flush(); },
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

  /* --- 다른 창이 같은 자료를 고쳤을 때 -------------------------------------
     `LEAP.store` 는 처음 한 번 읽고 **메모리에 붙들고 있습니다.**
     그래서 같은 앱을 두 창에 열면 —

       ① 창 1 에서 적고 저장한다
       ② 창 2 는 그것을 모른 채 «옛 자료»를 들고 있다
       ③ 창 2 에서 무엇이든 고치면 **창 1 이 적은 것이 통째로 사라진다**

     즐겨찾기를 두 번 눌러 탭이 둘이 되는 일은 교실에서 흔합니다.
     조용히 덮어쓰지 않도록 **알려는 줍니다.** 자동으로 합치지는 않습니다 —
     둘 중 어느 것이 맞는지는 사람이 압니다. 말없이 고르면 그것대로 잃습니다. */
  LEAP.watchOtherTabs = function (key, onChange) {
    if (!global.addEventListener) return;
    global.addEventListener('storage', function (e) {
      /* e.key 가 null 이면 localStorage 전체가 지워진 것입니다 */
      if (e.key && e.key !== key) return;
      if (onChange) onChange();
      else LEAP.announce('다른 창에서 이 앱의 자료를 고쳤습니다. 새로고침해야 그 내용이 보입니다.');
    });
  };

  /* --- 한 걸음 되돌리기 ----------------------------------------------------
     되돌릴 수 없는 일을 물음 하나로 막는 앱이 넷 있었습니다(D·E·F·G).
     「계속할까요?」에 「예」를 누른 뒤에는 길이 없었습니다.

     되돌리기를 앱마다 다시 만들지 않습니다. 앱마다 그리는 자리가 달라서
     **패널에 끼우지 않고 화면 아래에 띄웁니다.** 어느 앱에 넣어도 같게 돕니다.

     한 걸음만 둡니다. 여러 걸음을 쌓으면 「며칠 전에 지운 것」을 가리키는 단추가
     화면에 계속 남습니다 — 앱 A 가 먼저 겪고 내린 결론입니다.
     시간이 지나면 스스로 사라집니다. 되돌릴 수 있다고 말해 놓고 영원히
     들고 있으면, 그것대로 거짓말이 됩니다. */
  LEAP.offerUndo = function (label, restore, seconds) {
    if (!document.body) return;
    var el = document.getElementById('leap-undo');
    if (!el) {
      el = document.createElement('div');
      el.id = 'leap-undo';
      el.className = 'leap-undobar no-print';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    clearTimeout(el._t);
    el.innerHTML = '';

    var p = document.createElement('p');
    p.textContent = label;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--quiet btn--sm';
    btn.textContent = '되돌리기';
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'leap-undox';
    x.setAttribute('aria-label', '되돌리기 닫기');
    x.textContent = '✕';

    function hide() { clearTimeout(el._t); el.classList.remove('is-on'); }
    btn.addEventListener('click', function () { hide(); restore(); });
    x.addEventListener('click', hide);
    el.appendChild(p); el.appendChild(btn); el.appendChild(x);
    el.classList.add('is-on');
    el._t = setTimeout(hide, (seconds || 20) * 1000);
  };

  /* --- 내보낸 파일에 «어느 앱 것인지» 적기 ---------------------------------
     아홉 앱이 모두 `{v: 1, …}` 로 내보냅니다. 그래서 받는 쪽이 `v` 만 보면
     **남의 앱 파일이 그대로 통과합니다.** 앱 B 가 실제로 그랬습니다 —
     앱 A 의 시간표 파일을 「회의 0건」이라고 읽고 갈림길을 열었고,
     「그냥 바꾸기」를 누르면 학급 자료가 통째로 사라졌습니다.

     모양(어떤 칸이 있는가)으로만 가리면 두 앱의 모양이 닮은 순간 다시 뚫립니다.
     **이름을 적어 둡니다.** 그러면 「이것은 「우리 반 데이터 보기」에서 내보낸
     파일입니다」라고 **어느 앱 것인지 대며** 되돌릴 수 있습니다.

     표시가 없는 옛 파일은 막지 않습니다 — 지금까지 내보낸 것이 못 들어오면 안 됩니다.
     그때는 예전처럼 모양으로 판단합니다. */
  LEAP.APP_NAMES = {
    'leap-circuit': '순회교사 통합 시간표',
    'leap-classboard': '학급 회의',
    'leap-storybook': '지역 탐방 디지털 스토리북',
    'leap-multigrade': '복식학급 수업 도우미',
    'leap-together': '이웃 학교 함께하기',
    'leap-lessonplan': '수업 설계안 만들기',
    'leap-classdata': '우리 반 데이터 보기',
    'leap-project': '프로젝트 학습 계획서',
    'leap-required': '법정 의무교육 점검표'
  };

  /* 내보낼 자료에 표시를 얹습니다. 원본은 건드리지 않습니다. */
  LEAP.stamp = function (appId, data) {
    var o = clone(data);
    o.app = appId;
    return o;
  };

  /* 남의 앱 파일이면 그 앱 이름을, 아니면 null 을 돌려줍니다.
     표시가 없으면(옛 파일) null — 받는 쪽이 모양으로 판단합니다. */
  LEAP.otherApp = function (appId, obj) {
    var a = obj && obj.app;
    if (!a || a === appId) return null;
    return LEAP.APP_NAMES[a] || '다른 앱';
  };

  /* --- 창 안에 초점 가두기 -------------------------------------------------
     `role="dialog" aria-modal="true"` 는 **읽어 주는 기계에게 하는 약속**입니다 —
     「이 창 밖은 지금 없는 셈 치라」. 그런데 Tab 을 막지 않으면 초점은 창 뒤로
     그냥 넘어갑니다. 화면으로 보는 사람은 창이 떠 있으니 괜찮지만,
     **화면을 안 보는 사람은 자기가 어디에 있는지 알 수 없게 됩니다.**
     선언만 하고 지키지 않으면 없느니만 못합니다.

     창마다 코드를 넣지 않습니다. 문서에 한 번만 걸어 두고, **그때그때 열려 있는
     창을 찾아** 가둡니다. 나중에 창이 늘어도 저절로 지켜집니다.

     `position:fixed` 인 덮개는 `offsetParent` 가 null 이라 그것으로 보이는지를
     판단하면 안 됩니다. 실제로 자리를 차지하는지(`getClientRects`)를 봅니다. */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
    'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function onScreen(el) {
    return !!(el && el.getClientRects && el.getClientRects().length);
  }

  /* 지금 맨 위에 떠 있는 창. 없으면 null */
  function openDialog() {
    var all = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    for (var i = all.length - 1; i >= 0; i--) if (onScreen(all[i])) return all[i];
    return null;
  }

  function focusablesIn(box) {
    var out = [], all = box.querySelectorAll(FOCUSABLE), i;
    for (i = 0; i < all.length; i++) if (onScreen(all[i])) out.push(all[i]);
    return out;
  }

  LEAP.guardModals = function () {
    /* 검사에서는 흉내 낸 document 가 이만큼을 갖고 있지 않습니다. 조용히 물러납니다. */
    if (!document.addEventListener || !document.querySelectorAll) return;

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var box = openDialog();
      if (!box) return;
      var list = focusablesIn(box);
      if (!list.length) { e.preventDefault(); return; }
      var first = list[0], last = list[list.length - 1], now = document.activeElement;
      var inside = box.contains(now);
      if (e.shiftKey) {
        if (!inside || now === first) { e.preventDefault(); last.focus(); }
      } else {
        if (!inside || now === last) { e.preventDefault(); first.focus(); }
      }
    }, true);

    /* 창 밖으로 새어 나간 초점은 도로 데려옵니다 —
       Tab 말고도 새는 길이 있습니다(주소창에서 돌아올 때 등). */
    document.addEventListener('focusin', function (e) {
      var box = openDialog();
      if (!box || box.contains(e.target)) return;
      var list = focusablesIn(box);
      if (list.length) list[0].focus();
    });
  };

  /* --- 탭 ----------------------------------------------------------------
     role=tablist 를 좌우 화살표로도 움직이게 한다 (키보드만으로 전체 조작). */
  /* 〔2026. 8. 30.〕 **새로고침하면 늘 첫 탭으로 돌아갔습니다.**
     탭이 대여섯인 앱에서 실수로 새로고침 한 번이면 처음부터 다시 찾아 들어가야
     했습니다. 그리고 **뒤로 가기 단추가 앱을 떠나 버렸습니다** — 탭을 옮긴 것은
     기록에 남지 않았기 때문입니다.

     주소 끝에 지금 탭을 적습니다(`…/index.html#panel-week`). 그러면 셋이 함께 옵니다 —
     새로고침해도 그 자리, 뒤로 가기로 앞 탭, 그리고 **특정 탭을 링크로 줄 수 있습니다.**

     아는 탭 이름일 때만 움직입니다. 「본문으로 건너뛰기」가 넣는 `#main` 같은
     다른 표시에는 반응하지 않습니다. */
  LEAP.initTabs = function (listEl, onChange) {
    var tabs = Array.prototype.slice.call(listEl.querySelectorAll('[role="tab"]'));
    var ids = tabs.map(function (t) { return t.getAttribute('aria-controls'); });

    function select(tab, writeHash) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      var id = tab.getAttribute('aria-controls');
      /* 사람이 눌렀을 때만 기록에 남깁니다 — 처음 그릴 때까지 남기면
         뒤로 가기가 「같은 화면」으로 한 번 헛돕니다. */
      if (writeHash && global.location && global.location.hash !== '#' + id) {
        try { global.location.hash = '#' + id; } catch (e) {}
      }
      if (onChange) onChange(id);
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, true); });
      tab.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus();
        select(next, true);
      });
    });

    function fromHash() {
      if (!global.location) return -1;
      return ids.indexOf(String(global.location.hash || '').slice(1));
    }

    var at = fromHash();
    select(tabs[at >= 0 ? at : 0], false);

    /* 뒤로 가기·앞으로 가기 */
    if (global.addEventListener) {
      global.addEventListener('hashchange', function () {
        var i = fromHash();
        if (i >= 0) select(tabs[i], false);
      });
    }

    return { select: function (t) { select(t, true); }, tabs: tabs };
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
