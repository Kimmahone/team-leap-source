/* 학령인구 감소 대응 주간 브리프 만들기 〔로컬 실험 · 2026. 9. 26.〕
   ────────────────────────────────────────────────────────────────────────
   쓰는 법 (news-pipeline 폴더에서)
     node build-weekly-brief.mjs                     지난주(월~일) 한 호
     node build-weekly-brief.mjs --week 2026-09-14   그 주(월요일 날짜)
     node build-weekly-brief.mjs --backfill 4        지난 4주 가운데 없는 호만
     node build-weekly-brief.mjs --draft brief-drafts/2026-09-14.json
                                                     사람이 쓴 초안을 «같은 검증»에 통과시켜 싣기
     node build-weekly-brief.mjs --rule              AI 열쇠가 있어도 규칙 초안으로
     node build-weekly-brief.mjs --dry               파일을 쓰지 않고 결과만 봅니다
     node build-weekly-brief.mjs --dry --out a.json  〃 결과 한 호를 a.json 에만 적습니다(시험용)
     node build-weekly-brief.mjs --force             검토를 마친 호도 덮어씁니다

   무엇을 하나
     ① news-history.json 에서 그 주(한국시간 월 00:00 ~ 일 24:00) 기사를 꺼냅니다
     ② 지역(경북·다른 시·도·전국)과 주제로 나눕니다
     ③ 대시보드 자료를 «그 코드 그대로» 돌려 수를 꺼냅니다(dashboard-facts.mjs)
     ④ 초안 — GEMINI_API_KEY 가 있으면 AI 초안, 없으면 규칙 초안
     ⑤ 검증 — 근거 기사 없는 문장·근거 없는 숫자는 뺍니다(brief-lib.mjs)
     ⑥ 06. 실행계획(1)/prototype/assets/brief/<월요일>.json 과 index.json 을 씁니다

   ★ 매주 월요일 새벽에 도는 자리는 .github/workflows/v2-deploy.yml(job=weekly) 이고,
     예약은 main 에 둔 같은 파일이 걸어 줍니다(GitHub 예약은 기본 가지에서만 돕니다).
     그 전에 뉴스를 한 번 더 모아 일요일 기사까지 담습니다.
   ★ 열쇠는 코드에 적지 않습니다 — 환경변수나 이 저장소 뿌리의 .dev.vars 에서 읽습니다. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDashboardFacts } from './dashboard-facts.mjs';
import {
  lastCompleteWeek, addDays, mondayOf, weekLabel, weekArticles, weekStats, factsDigest, chartMetrics,
  validateDraft, pruneDraft, ruleDraft, assembleIssue, inScope
} from './brief-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HISTORY = path.join(ROOT, 'news-history.json');
const OUT = path.join(ROOT, '06. 실행계획(1)', 'prototype', 'assets', 'brief');

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null; };
const DRY = !!opt('--dry'), FORCE = !!opt('--force'), RULE = !!opt('--rule');

function readKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const f = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(f)) return '';
  const m = fs.readFileSync(f, 'utf8').match(/^GEMINI_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : '';
}

/* ── AI 초안 ──────────────────────────────────────────────────────────── */
const MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [])
  .concat(['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash']);

const SYSTEM = `당신은 경상북도교육청 정책 담당자에게 매주 월요일 올리는 「학령인구 감소 대응 주간 브리프」의 편집자입니다.
기사를 나열하지 말고, 한 주의 기사를 읽고 «무엇이 일어났고, 왜 중요하며, 경북 자료로 보면 어떻고, 경북이 무엇을 물어야 하는지»를 정리합니다.

반드시 지킬 것
1. 입력에 있는 기사(id)와 경북 자료(key)만 근거로 씁니다. 모든 항목의 articles 에 근거 기사 id 를 1개 이상 넣습니다.
2. 숫자는 기사 제목·요약이나 경북 자료 목록에 «적혀 있는 값»만 씁니다. 새로 나누거나 빼서 만든 숫자는 쓰지 않습니다.
3. 경북 자료를 보여 줄 때는 facts 에 key 를 넣습니다. 값은 프로그램이 채웁니다.
4. numbers[].metric 은 주어진 그림 목록에서만 고릅니다. 그림의 값은 프로그램이 셉니다.
5. regions 는 경북이 아닌 시·도의 «정책·사업»을 3~6개 고릅니다. region 은 시·도 이름(서울·부산·…·제주) 하나입니다.
   compare 에는 그 정책을 경북 상황과 견준 한 문장을 쓰고, 근거가 된 경북 자료 key 를 facts 에 넣습니다.
6. factchecks 는 기사에 경북 관련 숫자가 있고 그에 맞는 경북 자료 key 가 있을 때만 씁니다. articleValue 는 기사에 적힌 숫자 그대로입니다.
7. 추측은 «~로 보입니다»로 표시합니다. 과장·단정·홍보 문구를 쓰지 않습니다. 기사 문장을 길게 그대로 옮기지 않습니다.
8. 대학·사관학교 기사는 초·중·고 학령인구와 직접 관련이 있을 때만 씁니다.
9. 출력은 아래 모양의 JSON 하나뿐입니다.
{"title":"한 줄 제목","lead":"3~4문장 요약","leadArticles":["id"],"takeaways":["핵심 셋"],
 "numbers":[{"metric":"그림 이름","topic":"주제","headline":"숫자 하나로 된 제목","sub":"한 줄 보충","body":"2~3문장 해설","articles":["id"]}],
 "issues":[{"kicker":"주제","title":"이슈 제목","what":"무슨 일이","why":"왜 중요한가","ask":["경북이 물을 것"],"facts":["자료 key"],"articles":["id"]}],
 "regions":[{"region":"시·도","what":"정책 한 줄","detail":"내용 1~2문장","compare":"경북과 견주면","facts":["자료 key"],"articles":["id"]}],
 "factchecks":[{"claim":"기사가 말한 것","article":"id","articleValue":0,"fact":"자료 key","exclude":[],"note":"설명"}],
 "watch":[{"text":"다음 주에 볼 것","articles":["id"]}]}
numbers 는 3개, issues 는 2~3개, watch 는 2~4개입니다.`;

function promptFor({ arts, digest, F, from, to, stats }) {
  const scope = arts.filter(inScope);
  const artLines = scope.map((a) => `${a.id} | ${a.date} | ${a.outlet} | ${a.region} | ${a.topic} | ${a.title} | ${a.description}`).join('\n');
  const factLines = Object.values(digest).map((f) => `${f.key} = ${f.value}${f.unit} (${f.label})`).join('\n');
  return `기간: ${weekLabel(from, to)} (${from}~${to})
이번 주 기사 ${stats.articles}건 · 경북 ${stats.gyeongbuk} · 다른 시·도 ${stats.otherSido} · 전국 ${stats.national}
주제별: ${stats.topics.map((t) => `${t.topic} ${t.n}(지난주 ${t.prev})`).join(', ')}

[그림 목록] ${chartMetrics(F).join(', ')}

[경북 자료]
${factLines}

[기사] id | 날짜 | 매체 | 지역 | 주제 | 제목 | 요약
${artLines}`;
}

/* 모델이 «잠깐 바쁨»(429·500·503)이면 조금 쉬었다 다시 부릅니다 — 9. 27. 시험에서 503 으로 규칙 초안이 됐습니다.
   모델마다 무슨 일이 있었는지 모두 남깁니다(마지막 모델 오류만 남기면 앞 모델이 왜 안 됐는지 모릅니다). */
const RETRY_WAIT = (process.env.GEMINI_RETRY_WAIT || '8,20').split(',').map((x) => Number(x) * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiDraft(key, ctx) {
  const prompt = promptFor(ctx);
  const errs = [];
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= RETRY_WAIT.length; attempt++) {
      if (attempt) await sleep(RETRY_WAIT[attempt - 1]);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(120000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 8192 }
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = `${model}: ${res.status} ${((data.error && data.error.message) || '').slice(0, 120)}`;
          if ([429, 500, 503].includes(res.status) && attempt < RETRY_WAIT.length) { console.log(`  · ${msg} — 잠시 뒤 다시`); continue; }
          errs.push(msg); break;
        }
        const text = ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || '').join('');
        const json = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
        return { draft: json, model };
      } catch (e) {
        if (e.name === 'TimeoutError' && attempt < RETRY_WAIT.length) { console.log(`  · ${model}: 시간 초과 — 다시`); continue; }
        errs.push(`${model}: ${e.message}`); break;
      }
    }
  }
  throw new Error('AI 초안을 받지 못했습니다 — ' + errs.join(' | '));
}

/* ── 한 호 만들기 ─────────────────────────────────────────────────────── */
function readIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')); } catch { return { issues: [] }; }
}
function readIssue(id) {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, id + '.json'), 'utf8')); } catch { return null; }
}

async function buildWeek(from, { history, F, digest, key, draftFile }) {
  const to = addDays(from, 6);
  const arts = weekArticles(history, from, to);
  const prevArts = weekArticles(history, addDays(from, -7), addDays(from, -1));
  const stats = weekStats(arts, prevArts);
  const ctx = { arts, digest, F, from, to, stats };
  const old = readIssue(from);
  /* 검토를 마친 호와 사람이 쓴 호는 지킵니다. 다만 «미리보기»(한 주가 끝나기 전에 만든 호)는
     월요일 새벽 확정본으로 바뀌어야 하므로 지키지 않습니다. */
  const keep = old && (old.status === '검토 완료' ||
    (old.generator && old.generator.kind === 'draft' && !/미리보기/.test(old.status || '')));
  if (keep && !FORCE && !draftFile) {
    console.log(`  · ${from} 호는 ${old.status} — 덮지 않습니다(--force 로 덮기)`);
    return old;
  }
  if (!arts.length) { console.log(`  · ${from} 주에는 기사가 없습니다 — 건너뜁니다`); return null; }

  let draft, generator, dropped = [];
  if (draftFile) {
    draft = JSON.parse(fs.readFileSync(path.resolve(HERE, draftFile), 'utf8'));
    const v = validateDraft(draft, ctx);
    if (!v.ok) {
      console.error(`✗ 초안이 검증을 통과하지 못했습니다 (${draftFile})`);
      v.errors.forEach((e) => console.error('   · ' + e));
      process.exit(1);
    }
    generator = { kind: 'draft', label: draft._generator || '사람이 쓴 초안', model: draft._model || '' };
  } else if (key && !RULE) {
    try {
      const got = await geminiDraft(key, ctx);
      const v = validateDraft(got.draft, ctx);
      if (v.ok) draft = got.draft;
      else {
        const p = pruneDraft(got.draft, ctx);
        dropped = p.dropped;
        const again = validateDraft({ ...p.draft, numbers: [], issues: [], regions: [], factchecks: [], watch: [] }, ctx);
        draft = again.ok ? p.draft : null;
        if (!draft) dropped.push('제목·요약이 검증을 통과하지 못해 규칙 초안으로 바꿨습니다: ' + again.errors.join(' / '));
      }
      if (draft) generator = { kind: 'ai', label: 'AI 초안', model: got.model };
    } catch (e) { console.log('  ⚠ ' + e.message + ' — 규칙 초안으로 만듭니다'); dropped.push(e.message); }
  }
  if (!draft) {
    draft = ruleDraft(ctx);
    generator = { kind: 'rule', label: key && !RULE ? '규칙 초안(AI 실패)' : '규칙 초안(AI 열쇠 없음)' };
    const v = validateDraft(draft, ctx);
    if (!v.ok) { const p = pruneDraft(draft, ctx); draft = p.draft; dropped = dropped.concat(p.dropped); }
  }
  const status = generator.kind === 'draft' ? (draft._status || '시범호 · 검토 전') : '자동 생성 · 검토 전';
  const issue = assembleIssue({ draft, arts, stats, digest, F, from, to, generator, no: 0, status, dropped });
  if (draft._method) issue.method = draft._method;
  console.log(`  ✓ ${from} — ${issue.title}  [${generator.label}] 기사 ${arts.length}건 · 인용 ${issue.checks.citedArticles}건` +
    (dropped.length ? ` · 뺀 항목 ${dropped.length}` : ''));
  return issue;
}

function writeAll(issues) {
  fs.mkdirSync(OUT, { recursive: true });
  const index = readIndex();
  const byId = new Map((index.issues || []).map((x) => [x.id, x]));
  issues.filter(Boolean).forEach((iss) => {
    byId.set(iss.id, {
      id: iss.id, from: iss.from, to: iss.to, period: iss.period, title: iss.title, lead: iss.lead,
      status: iss.status, generator: iss.generator, articles: iss.stats.articles,
      numbers: (iss.numbers || []).map((n) => n.headline)
    });
  });
  /* 호수는 «날짜 차례»로 매깁니다 — 지난 주를 나중에 채워도 차례가 뒤섞이지 않습니다 */
  const list = [...byId.values()].sort((a, b) => (a.from < b.from ? -1 : 1)).map((x, i) => ({ ...x, no: i + 1 }));
  const noOf = new Map(list.map((x) => [x.id, x.no]));
  issues.filter(Boolean).forEach((iss) => {
    iss.no = noOf.get(iss.id);
    fs.writeFileSync(path.join(OUT, iss.id + '.json'), JSON.stringify(iss, null, 1) + '\n');
  });
  /* 이미 있던 호도 번호가 바뀌었으면 고쳐 적습니다 */
  list.forEach((x) => {
    if (issues.some((i) => i && i.id === x.id)) return;
    const old = readIssue(x.id); if (old && old.no !== x.no) { old.no = x.no; fs.writeFileSync(path.join(OUT, x.id + '.json'), JSON.stringify(old, null, 1) + '\n'); }
  });
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updatedAt: new Date().toISOString(), issues: list.reverse() }, null, 1) + '\n');
  console.log(`  ✓ ${path.relative(ROOT, OUT)}/index.json — ${list.length}호`);
}

async function main() {
  const history = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  console.log('📊 대시보드 자료 셈하는 중…');
  const F = loadDashboardFacts();
  const digest = factsDigest(F);
  const key = readKey();
  console.log(`📝 주간 브리프 — ${key && !RULE ? 'AI 초안(Gemini)' : '규칙 초안'}${opt('--draft') ? ' · 사람이 쓴 초안 검증' : ''}`);

  let weeks = [];
  if (opt('--week')) weeks = [mondayOf(String(opt('--week')))];
  else if (opt('--backfill')) {
    const n = Number(opt('--backfill')) || 4; const last = lastCompleteWeek().from;
    for (let i = n - 1; i >= 0; i--) weeks.push(addDays(last, -7 * i));
    if (!FORCE) weeks = weeks.filter((w) => !readIssue(w));
  } else weeks = [lastCompleteWeek().from];

  const out = [];
  for (const w of weeks) out.push(await buildWeek(w, { history, F, digest, key, draftFile: opt('--draft') && weeks.length === 1 ? String(opt('--draft')) : null }));
  if (DRY) {
    const iss = out.filter(Boolean)[0] || null;
    if (iss) {
      const n = (a) => (a || []).length;
      console.log('\n── 미리 보기(사이트 자료는 쓰지 않음) ──');
      console.log(`만든 방법: ${iss.generator.label}${iss.generator.model ? ' · ' + iss.generator.model : ''}`);
      console.log(`제목: ${iss.title}`);
      console.log(`요약: ${iss.lead}`);
      console.log(`항목: 숫자 ${n(iss.numbers)} · 깊이 읽기 ${n(iss.issues)} · 다른 시·도 ${n(iss.regions)} · 수치 맞춰 보기 ${n(iss.factchecks)} · 다음 주 ${n(iss.watch)} · 인용 기사 ${iss.checks.citedArticles}`);
      iss.checks.dropped.forEach((d) => console.log('  뺀 항목: ' + d));
    }
    if (opt('--out')) { fs.writeFileSync(path.resolve(String(opt('--out'))), JSON.stringify(iss, null, 1) + '\n'); console.log(`  → ${opt('--out')}`); }
    else process.stdout.write(JSON.stringify(iss, null, 1).slice(0, 4000) + '\n');
    return;
  }
  writeAll(out);
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
