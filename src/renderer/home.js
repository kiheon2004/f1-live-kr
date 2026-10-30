// Season globe home screen: pick a season, a race (from the list or the globe), one of its real sessions – and it
// opens in the timing screen through the app's own load path (F1KRApp.loadReplay, the same as the 불러오기 button).
// Data: the season's calendar (Jolpica, via the main process' cache: getScheduleMeta) and F1's archive list of the
// season's sessions (listSessionsMeta – path is the archive's own id and is what gets loaded). They're matched by days
// (HomeData.matchRaces), never by names. What each race's schedule and data are in comes from what was really checked
// (HomeData.scheduleStatus / dataStatus): a failed request is "요청 실패", no record is "아직 기록 없음" (never
// "cancelled"), a listed session isn't "downloadable" until F1 answered for it (probeSession).
// Late answers: every season / event request carries a ticket; an answer for an earlier one is ignored (not cancelled:
// the request runs on in the main process and only fills the main process' cache). A load is superseded only by
// another load (its progress is told apart by its job number).
import { Globe } from "./globe.js";

const $ = (id) => document.getElementById(id);
const D = window.HomeData, KO = window.KO, A = () => window.F1KRApp;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KST = (o) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...o });
const kstFull = KST({ month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const kstDay = KST({ month: "long", day: "numeric", weekday: "short" }), kstShort = KST({ month: "numeric", day: "numeric" });
const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s % 3600) / 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, "0")).join(":"); };
const store = {
  get(k, d) { try { const v = localStorage.getItem("f1kr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("f1kr:" + k, JSON.stringify(v)); } catch {} },
};
// archive StartDate is the track's local time; GmtOffset makes it UTC
const toOffset = (off) => { const m = /^(-?)(\d\d):(\d\d)/.exec(off || "00:00"); return m ? `${m[1] ? "-" : "+"}${m[2]}:${m[3]}` : "+00:00"; };
const archiveAt = (s) => Date.parse(s.start + toOffset(s.gmtOffset));
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 6e4); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };
const cleanErr = (e) => String(e?.message || e || "").replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
const errInfo = (msg) => ({ status: +(/HTTP (\d{3})/.exec(msg)?.[1] || 0) || null, offline: /인터넷 연결|연결하지 못했어요|ENOTFOUND|fetch failed/.test(msg), message: msg });
// [2021, 2021, 2024] → "2021×2, 2024" (two races at one venue in a season)
const seasonsText = (ys) => [...new Set(ys)].map((y) => { const n = ys.filter((x) => x === y).length; return n > 1 ? `${y}×${n}` : String(y); }).join(", ");
const calWhen = (s) => (s.utc ? kstFull.format(Date.parse(s.utc)) : s.date ? `${kstDay.format(Date.parse(s.date + "T12:00:00Z"))} · 시간 미정` : "시간 미정");

const thisYear = new Date().getFullYear(), FIRST_SEASON = 2014;
// v0.50: a sprint weekend (its calendar or its F1 record list has a session named Sprint) is marked in the list and on
// the race card; the circuit's own name stands next to the Grand Prix's (a country with two or three circuits – Italy,
// the USA – reads apart before anything is picked)
const hasSprint = (sessions) => !!sessions?.some((s) => /^Sprint$/.test(s?.name || ""));
const metrics = { tScript: Math.round(performance.now()), tListReady: null, tScheduleReady: null, tGlobeFirstFrame: null, ignored: { season: 0, cached: 0, probe: 0, all: 0, load: 0 }, seasonLoads: 0 };
const S = {
  year: store.get("homeYear", thisYear), races: [], sched: { state: "loading" }, listing: { state: "loading" }, sessions: [], match: null,
  cached: {}, probes: {}, items: [], sel: store.get("homeSel", null), query: "", kbd: -1, all: false, allItems: [], allNote: "", load: null,
  seasonData: new Map(),
};
const seasonG = D.guard(), probeG = D.guard(), allG = D.guard();
let globe = null, globeDisposeTimer = null, globeFailed = null, liveTimer = null;

// ---------- globe ----------
function makeGlobe(forceFail = false) {
  const g = new Globe($("homeGlobe"), $("homeMarkers"), {
    forceFail,
    onPick: (ids, x, y) => (ids.length === 1 ? select(ids[0], { fly: false }) : pickMenu(ids, x, y)),
    onError: (msg) => { globeFailed = msg; $("homeGlobeNote").textContent = msg; $("homeGlobeNote").hidden = false; },
    onFirstFrame: () => { if (metrics.tGlobeFirstFrame == null) metrics.tGlobeFirstFrame = Math.round(performance.now()); },
    labelOf: (id) => { const it = itemById(id); return it ? `${it.round ? `R${it.round} ` : ""}${it.koName}` : ""; },
  });
  if (!g.init()) return g;
  $("homeGlobeNote").hidden = true; globeFailed = null;
  return g;
}
function globeShow() {
  clearTimeout(globeDisposeTimer);
  if (!globe) { globe = makeGlobe(); placeMarkers(); const it = itemById(S.sel); if (it?.lat != null) globe.flyTo(it.lat, it.lon); }
  globe.start();
}
// Hidden: the loop stops at once; the GPU side (renderer, ~85 MB of texture with its mipmaps) is let go after a minute
// in the timing screen – coming back within that is instant, later it's rebuilt (the texture is a local file).
function globeHide() {
  globe?.stop();
  clearTimeout(globeDisposeTimer);
  globeDisposeTimer = setTimeout(() => { if (!A().homeOn && globe) { globe.dispose(); globe = null; } }, 60e3);
}
function placeMarkers() {
  if (!globe) return;
  const list = S.all ? S.allItems : S.items;
  const places = D.placeGroups(list).map((p) => ({ key: p.key, lat: p.lat, lon: p.lon, ids: p.races.map((r) => (S.all ? r.id : fullId(r))), title: p.races.map((r) => `${r.round ? `R${r.round} ` : ""}${r.koName}`).join("\n") }));
  globe.setMarkers(places, S.sel);
}
function pickMenu(ids, x, y) {
  closePick();
  const m = document.createElement("div"); m.className = "gm-pick"; m.id = "gmPick";
  m.style.left = `${Math.min(x, $("homeGlobe").clientWidth - 240)}px`; m.style.top = `${Math.min(y, $("homeGlobe").clientHeight - 30 * ids.length - 20)}px`;
  m.innerHTML = ids.map((id) => { const it = itemById(id); return it ? `<button data-id="${esc(id)}">${it.round ? `R${it.round} · ` : ""}${esc(it.koName)} <span class="muted">${esc(it.dateText || "")}</span></button>` : ""; }).join("");
  m.addEventListener("click", (e) => { const id = e.target.closest("[data-id]")?.dataset.id; if (id) { closePick(); select(id, { fly: false }); } });
  $("homeMarkers").appendChild(m);
  m.querySelector("button")?.focus();
}
const closePick = () => $("gmPick")?.remove();
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#gmPick, .gm")) closePick(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePick(); });

// ---------- season data ----------
async function loadSeason(year) {
  const tok = seasonG.next();
  metrics.seasonLoads++;
  S.year = year; S.races = []; S.sessions = []; S.match = null; S.cached = {}; S.items = []; S.kbd = -1;
  S.sched = { state: "loading" }; S.listing = year < D.ARCHIVE_FROM ? { state: "skip" } : { state: "loading" };
  $("homeSeason").value = String(year);
  render();
  const sched = window.api.getScheduleMeta(year).then((m) => {
    if (!seasonG.current(tok)) { metrics.ignored.season++; return; }
    S.sched = { state: "ok", source: m.source, stale: m.stale, offline: m.offline, fetchedAt: m.fetchedAt, error: m.error, stats: m.stats };
    S.races = m.races;
    if (metrics.tScheduleReady == null) { metrics.tScheduleReady = Math.round(performance.now()); metrics.scheduleSource = m.source; }
    rebuild();
  }, (e) => {
    if (!seasonG.current(tok)) { metrics.ignored.season++; return; }
    S.sched = { state: "error", ...errInfo(cleanErr(e)) }; rebuild();
  });
  const list = year < D.ARCHIVE_FROM ? null : window.api.listSessionsMeta(year).then(async (m) => {
    if (!seasonG.current(tok)) { metrics.ignored.season++; return; }
    S.listing = { state: "ok", source: m.source, stale: m.source === "stale-cache", offline: m.offline, status: m.status, fetchedAt: m.fetchedAt };
    S.sessions = m.sessions; S.seasonData.set(year, { sessions: m.sessions });
    rebuild();
    const c = await window.api.cachedSessions(m.sessions.map((s) => s.path)).catch(() => ({}));
    if (!seasonG.current(tok)) { metrics.ignored.cached++; return; }
    S.cached = c; rebuild();
  }, (e) => {
    if (!seasonG.current(tok)) { metrics.ignored.season++; return; }
    S.listing = { state: "error", ...errInfo(cleanErr(e)) }; rebuild();
  });
  await Promise.allSettled([sched, list]);
}

// races (and archive meetings no race matched) → list items with their states
function rebuild() {
  const now = Date.now();
  S.match = S.listing.state === "ok" ? D.matchRaces(S.races, S.sessions) : null;
  const listing = S.listing.state === "skip" ? { state: "ok" } : S.listing;
  const items = [];
  for (const r of S.races) {
    const match = S.match?.races.get(r.round) || (S.listing.state === "skip" ? { state: "none" } : null);
    const meeting = match?.state === "matched" ? match.meeting : null;
    const raceS = meeting?.sessions.find((s) => s.name === "Race");
    items.push({
      id: `r${r.round}`, kind: "race", round: r.round, race: r, meeting, match,
      name: r.name, koName: KO.gpName(r.name), circuitName: r.circuitName, circuitId: r.circuitId, locality: r.locality, country: r.country,
      sprint: hasSprint(r.sessions) || hasSprint(meeting?.sessions),
      lat: r.lat, lon: r.lon, dateText: r.date ? (r.precision === "time" ? kstShort.format(Date.parse(r.utc)) : kstShort.format(Date.parse(r.date + "T12:00:00Z"))) : "",
      sched: D.scheduleStatus(r, { now, raceListed: !!raceS, raceStart: raceS ? archiveAt(raceS) : null }),
      data: D.dataStatus({ year: S.year, listing, match, cached: S.cached, probes: S.probes, now, race: r }),
    });
  }
  // meetings in F1's list that no calendar race matched (pre-season testing; or all of them when the calendar failed)
  const extra = S.match ? (S.races.length ? S.match.extra : S.match.meetings) : [];
  for (const g of extra.sort((a, b) => (a.first ?? 0) - (b.first ?? 0))) {
    const first = g.sessions[0];
    items.push({
      id: `m${g.key}`, kind: "meeting", round: null, race: null, meeting: g, match: { state: "matched", meeting: g },
      name: g.name, koName: KO.gpName(g.name), circuitName: g.circuit, locality: g.location, country: g.country, lat: null, lon: null,
      dateText: first ? kstShort.format(archiveAt(first)) : "", extra: true, sprint: hasSprint(g.sessions),
      sched: { key: "unknown", ...D.SCHEDULE.unknown, why: S.races.length ? "일정(Jolpica)에 없는 F1 기록" : "일정을 받지 못함" },
      data: D.dataStatus({ year: S.year, listing, match: { state: "matched", meeting: g }, cached: S.cached, probes: S.probes, now }),
    });
  }
  S.items = items;
  if (items.length && metrics.tListReady == null) metrics.tListReady = Math.round(performance.now());
  // (a selection made by the app itself is made again as more arrives – the calendar after the archive list –; the user's stays)
  // (v0.44: a session loaded elsewhere – the timing screen's picker – is the race the home screen shows next, once its
  // season's list has it)
  const follow = S.follow && S.items.find((x) => itemHasPath(x, S.follow));
  if (follow) { S.follow = null; select(fullId(follow), { scroll: true, probe: false }); }
  else if (S.selAuto || !itemById(S.sel) || !String(S.sel).startsWith(S.year + ":")) chooseDefault();
  render();
}
// (an item's id is kept with its season: "2026:r6")
function itemById(id) {
  if (id == null) return null;
  const [y, k] = String(id).includes(":") ? String(id).split(":") : [null, String(id)];
  if (S.all) { const v = S.allItems.find((x) => x.id === id); if (v) return v; }
  if (y != null && +y !== S.year) return null;
  return S.items.find((x) => x.id === k) || null;
}
const fullId = (it) => (it.kind === "venue" ? it.id : `${S.year}:${it.id}`);
// the race under way by the calendar, else the latest one with a record, else the next one, else the first
function chooseDefault() {
  if (!S.items.length) return;
  const races = S.items.filter((x) => x.kind === "race");
  // (no calendar: F1's own list alone – its latest meeting)
  const pick = races.find((x) => x.sched.key === "ongoing") || [...races].reverse().find((x) => x.meeting) || races.find((x) => x.sched.key === "scheduled") || (races.length ? null : S.items[S.items.length - 1]) || S.items[0];
  if (S.sel === fullId(pick) && S.selAuto) return;
  select(fullId(pick), { scroll: true, probe: false });
  S.selAuto = true;
}

// ---------- selection ----------
function select(id, { fly = true, scroll = true, probe = true } = {}) {
  const it = itemById(id);
  if (!it) return;
  closePick();
  S.sel = id; S.selAuto = false; if (!S.all) store.set("homeSel", id);
  globe?.select(id);
  if (fly && it.lat != null) globe?.flyTo(it.lat, it.lon);
  renderList(scroll); renderEvent();
  if (probe) probeSelected();
}
// Whether F1 would give the selected race's sessions now – asked only for the sessions not on this computer, at most
// five, answers kept 10 minutes. An answer arriving after another race was picked only fills the table.
async function probeSelected() {
  const it = itemById(S.sel), tok = probeG.next();
  if (!it?.meeting || A().mode !== "replay") return;
  const todo = it.meeting.sessions.filter((s) => !S.cached[s.path]?.core && !(S.probes[s.path]?.at > Date.now() - 600e3)).slice(0, 5);
  if (!todo.length) return;
  for (const s of todo) S.probes[s.path] = { state: "checking", at: 0 };
  rebuild();
  await Promise.all(todo.map((s) => window.api.probeSession(s.path).then((r) => { S.probes[s.path] = { ...r, at: Date.now() }; }, () => { S.probes[s.path] = { state: "failed", at: Date.now() }; })));
  if (!probeG.current(tok)) metrics.ignored.probe++;   // (kept in the table; the screen is redrawn for what's shown now)
  rebuild();
}

// ---------- loading a session ----------
async function startLoad(path, info, at = null, origin = "event") {
  if (A().mode !== "replay") A().setMode("replay");
  const p = A().loadReplay(path, info, { at });
  S.load = { job: A().loadJob, path, info, at, origin, state: "loading", pct: 0, text: "연결 중 ·" };
  render();
  const res = await p;
  if (!S.load || S.load.job !== res.job) { metrics.ignored.load++; return; }   // a newer load took over
  if (res.ok) {
    S.load = null;
    S.cached[path] = { core: true, topics: 0 };
    // (switched to live meanwhile: the replay waits in the app; the home screen stays)
    if (A().mode === "replay") A().setHome(false);
  } else if (!res.superseded) Object.assign(S.load, { state: "error", error: res.error || "알 수 없는 오류" });
  rebuild();
}
addEventListener("f1kr-load", (e) => {
  if (!S.load || S.load.state !== "loading" || e.detail.job !== S.load.job) return;
  S.load.pct = e.detail.pct; S.load.text = e.detail.text;
  const bar = $("homeProg");
  if (bar) { bar.querySelector("i").style.width = e.detail.pct + "%"; bar.nextElementSibling.textContent = `${e.detail.text} ${e.detail.pct}%`; }
});
function progressHtml(origin) {
  const L = S.load;
  if (!L || L.origin !== origin) return "";
  if (L.state === "loading") return `<div class="home-progress"><span id="homeProg" class="loadbar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i style="width:${L.pct}%"></i></span><span>${esc(L.text)} ${L.pct}%</span></div>`;
  const auth = /HTTP 40[13]|접근을 막았어요|로그인/.test(L.error);
  return `<div class="home-progress home-err"><span>불러오지 못했어요: ${esc(L.error)}</span></div>
    <div class="home-progress"><button class="primary small" data-retry>다시 시도</button>${auth ? `<button class="small" data-login>F1 TV 로그인</button>` : ""}<button class="ghost small" data-dismiss>닫기</button></div>`;
}

// ---------- rendering ----------
function render() { renderMeta(); renderList(false); renderEvent(); renderRecent(); renderLive(); placeMarkers(); }

function renderMeta() {
  const parts = [];
  const sc = S.sched;
  if (S.all) parts.push(esc(S.allNote));
  else {
    if (sc.state === "loading") parts.push("일정 확인 중…");
    else if (sc.state === "error") parts.push(`<span class="bad">일정 요청 실패${sc.offline ? " (오프라인)" : ""}</span>`);
    else parts.push(`일정: Jolpica · ${esc(ago(Date.parse(sc.fetchedAt)))} 확인${sc.stale ? ` · <span class="warn">${sc.offline ? "오프라인 – 저장된 일정" : "갱신 실패 – 저장된 일정"}</span>` : ""}`);
    const L = S.listing;
    if (L.state === "skip") parts.push(`F1 기록: ${D.ARCHIVE_FROM}년부터 (이 시즌은 지원 범위 밖)`);
    else if (L.state === "loading") parts.push("F1 기록 목록 확인 중…");
    else if (L.state === "error") parts.push(`<span class="${L.status === 401 || L.status === 403 ? "warn" : "bad"}">F1 기록 목록: ${L.status === 401 || L.status === 403 ? `인증 필요 (HTTP ${L.status})` : L.offline ? "요청 실패 (오프라인)" : "요청 실패"}</span>`);
    else parts.push(`F1 기록 목록: ${L.stale ? `<span class="warn">${L.offline ? "오프라인" : `HTTP ${L.status}`} – 저장된 목록 (${esc(ago(L.fetchedAt))})</span>` : `${esc(ago(L.fetchedAt))} 확인`}`);
  }
  if (S.load?.state === "loading" && !itemHasPath(itemById(S.sel), S.load.path) && S.load.origin === "event") parts.push(`다른 세션 불러오는 중 ${S.load.pct}%`);
  $("homeMeta").innerHTML = parts.join(" · ");
}
const itemHasPath = (it, path) => !!it?.meeting?.sessions.some((s) => s.path === path);

function visibleItems() {
  const list = S.all ? S.allItems : S.items;
  return D.filterRaces(list, S.query, KO.gpName);
}
function renderList(scroll) {
  const list = visibleItems(), sel = S.sel;
  const ol = $("homeList");
  let html = "", group = null;
  for (const [i, it] of list.entries()) {
    const g = it.extra ? "일정에 없는 F1 기록" : null;
    if (g && g !== group) { html += `<li class="group" role="presentation">${esc(g)}</li>`; group = g; }
    const id = S.all ? it.id : fullId(it);
    const badges = S.all ? `<span class="badge">개최 ${it.hosted.length}</span>${it.replay.length ? `<span class="badge ok">다시보기 목록 ${it.replay.length}</span>` : ""}`
      : `<span class="badge ${it.sched.cls}" title="개최 일정: ${esc(it.sched.why)}">${esc(it.sched.ko)}</span><span class="badge ${it.data.cls}" title="데이터: ${esc(it.data.why)}">${esc(it.data.ko)}</span>${it.sprint ? `<span class="badge sprint" title="스프린트가 있는 주말">스프린트</span>` : ""}`;
    const sub = S.all ? `${esc([it.locality, it.country].filter(Boolean).join(", "))} · ${esc(seasonsText(it.hosted.map((h) => h.season)))}` : `${esc(it.dateText)} · ${esc([it.locality, it.country].filter(Boolean).join(", "))}${it.lat == null && !it.extra ? " · 좌표 없음" : ""}`;
    html += `<li role="option" id="hl-${esc(id.replace(/[^A-Za-z0-9_-]/g, "_"))}" data-id="${esc(id)}" aria-selected="${id === sel}" class="${i === S.kbd ? "kbd" : ""}"><span class="rd">${it.round ? `R${it.round}` : S.all ? "" : "·"}</span><span class="nm"><em>${esc(it.koName)}</em>${!S.all && it.circuitName ? `<small>${esc(it.circuitName)}</small>` : ""}</span><span class="sub">${sub} ${badges}</span></li>`;
  }
  if (ol.__html !== html) { ol.innerHTML = html; ol.__html = html; }
  const loading = !S.all && (S.sched.state === "loading" || S.listing.state === "loading") && !S.items.length;
  $("homeEmpty").hidden = !!list.length || loading;
  $("homeEmpty").textContent = S.query ? "검색 결과가 없어요." : S.all ? "아직 확인한 시즌이 없어요." : "이 시즌의 경기를 불러오지 못했어요.";
  if (loading) { ol.innerHTML = `<li class="group">목록 불러오는 중…</li>`; ol.__html = ""; }
  const selEl = ol.querySelector('[aria-selected="true"]');
  ol.setAttribute("aria-activedescendant", selEl?.id || "");
  if (scroll && selEl) selEl.scrollIntoView({ block: "nearest" });
  $("homeAllNote").hidden = !S.all; $("homeAllNote").textContent = S.allNote;
}

function renderEvent() {
  const box = $("homeEvent");
  const it = itemById(S.sel);
  if (S.all && it?.kind === "venue") return renderVenue(box, it);
  if (!it) { box.innerHTML = `<h3>경기를 고르세요</h3>${progressHtml("event")}<p class="muted">오른쪽 목록이나 지구본의 빨간 표시를 누르세요. 화살표 키로도 고를 수 있어요.</p>`; return; }
  const r = it.race;
  const head = `<h3>${it.round ? `R${it.round} · ` : ""}${esc(it.koName)} <small>${esc([it.circuitName, it.locality, it.country].filter(Boolean).join(" · "))}</small></h3>`;
  const badges = `<p><span class="badge ${it.sched.cls}">${esc(it.sched.ko)}</span> <span class="muted">개최 · ${esc(it.sched.why)}</span><br><span class="badge ${it.data.cls}">${esc(it.data.ko)}</span> <span class="muted">데이터 · ${esc(it.data.why)}</span>${it.sprint ? `<br><span class="badge sprint">스프린트</span> <span class="muted">스프린트가 있는 주말이에요</span>` : ""}</p>`;
  // other seasons at this circuit: only from what the app has checked (전체 개최지) – asked for, not fetched here
  const history = it.circuitId || it.lat != null ? `<p class="home-history"><button class="ghost small" data-history="${esc(it.circuitId || "")}">이 서킷의 다른 시즌 개최 이력</button> <span class="muted">앱이 확인한 시즌 기준</span></p>` : "";
  const coord = r ? (r.lat == null ? `<p class="muted">좌표 정보가 없어 지구본에 표시하지 않았어요 (목록에서는 고를 수 있어요).</p>` : "") : "";
  let body = "";
  if (it.meeting) {
    const loaded = A().loaded()?.info?.path;
    const rows = [...it.meeting.sessions].sort((a, b) => archiveAt(a) - archiveAt(b)).map((s) => {
      const st = D.sessionStatus({ cached: S.cached[s.path], probe: S.probes[s.path] });
      const busy = S.load?.state === "loading" && S.load.path === s.path;
      const btn = loaded === s.path ? `<button class="primary small" data-resume>이어보기</button>` : `<button class="small${s.name === "Race" ? " primary" : ""}" data-load="${esc(s.path)}" ${busy ? "disabled" : ""}>${busy ? "불러오는 중" : "불러오기"}</button>`;
      return `<li class="${s.name === "Race" ? "main" : s.name === "Sprint" ? "sprint" : ""}"><span>${esc(KO.sessionName(s.name))}</span><span class="when">${esc(kstFull.format(archiveAt(s)))}</span><span class="act"><span class="badge ${st.cls}" title="${esc(st.why)}">${esc(st.ko)}</span>${btn}</span></li>`;
    }).join("");
    body = `<h4>세션 (F1 기록 목록 · 한국 시간)</h4><ul class="home-sessions">${rows}</ul>`;
  } else if (r) {
    const rows = r.sessions.map((s) => `<li class="${s.name === "Race" ? "main" : s.name === "Sprint" ? "sprint" : ""}"><span>${esc(KO.sessionName(s.name))}</span><span class="when">${esc(calWhen(s))}</span><span class="act"></span></li>`).join("");
    body = `<h4>일정 (Jolpica · 한국 시간)</h4><ul class="home-sessions">${rows}</ul><p class="muted">${S.listing.state === "error" ? `F1 기록 목록을 받지 못해 (${esc(it.data.ko)}) 이 경기의 세션을 확인할 수 없어요. 기록이 없다는 뜻은 아니에요.` : S.listing.state === "skip" ? `F1 기록 보관소는 ${D.ARCHIVE_FROM}년부터라 이 시즌은 다시볼 수 없어요.` : S.listing.state === "loading" ? "F1 기록 목록을 확인하는 중이에요…" : it.match?.state === "ambiguous" ? "F1 기록에서 이 경기로 보이는 후보가 여러 개라 자동으로 고르지 않았어요." : "F1 기록 목록에 이 경기의 세션이 아직 없어 불러올 수 없어요 (취소됐다는 뜻은 아니에요)."}</p>`;
  }
  // (the load's progress or error right under the title, where it's seen without scrolling)
  box.innerHTML = head + progressHtml("event") + badges + coord + body + history;
}
function renderVenue(box, v) {
  box.innerHTML = `<h3>${esc(v.koName)} <small>${esc([v.locality, v.country].filter(Boolean).join(" · "))}</small></h3>
    <p class="muted">앱이 확인한 시즌만 셌어요. 개최 이력은 받은 일정(Jolpica) 기준, 다시보기는 그 시즌의 F1 기록 목록 기준이에요.</p>
    <h4>개최 (확인한 시즌)</h4><p>${v.hosted.map((h) => `<button class="small" data-goto="${h.season}:r${h.round}">${h.season} R${h.round}</button>`).join(" ")}</p>
    <h4>다시보기 기록 목록이 있는 시즌</h4><p>${v.replay.length ? v.replay.map((y) => `<span class="badge ok">${y}</span>`).join(" ") : `<span class="muted">확인한 시즌 중엔 없거나 목록을 확인하지 못했어요.</span>`}</p>`;
}

function renderRecent() {
  const box = $("homeRecent");
  const cur = A().loaded(), rec = A().recent().filter((x) => x.path !== cur?.info?.path).slice(0, 5);
  const line = (x) => `${esc(KO.gpName(x.meeting))} · ${esc(KO.sessionName(x.name))}`;
  const pos = (p, s, e) => (Number.isFinite(p) && Number.isFinite(s) ? `${p < s ? "출발 전" : hms(p - s)}${Number.isFinite(e) ? ` / ${hms(e - s)}` : ""}` : "");
  let html = `<h3>최근 본 세션</h3><ul>`;
  if (cur) html += `<li><span class="t"><b>지금 불러온 세션</b> ${line(cur.info)}<small>${esc(pos(cur.t, cur.tStart, cur.t1))}</small></span><button class="primary small" data-resume>이어보기</button></li>`;
  for (const x of rec) html += `<li><span class="t">${line(x)}<small>${x.year} · ${esc(pos(x.pos, x.tStart, x.t1))}</small></span><button class="small" data-recent="${esc(x.path)}">이어보기</button><button class="ghost small" data-forget="${esc(x.path)}" title="목록에서 지우기" aria-label="목록에서 지우기">✕</button></li>`;
  html += `</ul>`;
  if (!cur && !rec.length) html += `<p class="muted">아직 본 세션이 없어요. 경기를 고르고 세션을 불러오면 여기에 남아요.</p>`;
  box.innerHTML = html.replace("</h3>", "</h3>" + progressHtml("recent"));
}

// Live: from the live connection's real state only (the one LiveClient the timing screen uses) – the calendar says
// when the next session is, never that one is live.
function renderLive() {
  const live = A().mode === "live";
  $("homeLive").hidden = !live; $("homeEvent").hidden = live;
  $("homeSeasonWrap").hidden = live; $("homeAll").hidden = live;
  clearInterval(liveTimer); liveTimer = null;
  if (!live) return;
  if (A().homeOn) liveTimer = setInterval(renderLive, 30e3);
  const L = A().live();
  const over = /Finalised|Ends/.test(L.status || "");
  let main, btn = "";
  if (L.conn === "stopped") { main = "실시간 연결 전이에요"; btn = `<button class="primary small" data-live-start>연결</button>`; }
  else if (L.conn === "connecting" || L.conn === "reconnecting") main = "확인 중… 실시간 서버에 연결하고 있어요";
  else if (L.conn === "error") { main = `연결 실패: ${esc(L.message)}`; btn = `<button class="primary small" data-live-retry>다시 연결</button>`; }
  else if (L.session && L.drivers && !over) { main = `진행 중인 세션: ${esc(KO.gpName(L.session.meeting))} · ${esc(KO.sessionName(L.session.name))}`; btn = `<button class="primary small" data-live-open>실시간 타이밍 보기</button>`; }
  else if (L.session && over) main = `세션이 끝났어요: ${esc(KO.gpName(L.session.meeting))} · ${esc(KO.sessionName(L.session.name))}`;
  else main = "지금 진행 중인 세션이 없어요 (서버에 연결됐지만 세션 정보가 오지 않았어요)";
  if (L.conn !== "stopped" && !btn) btn = `<button class="small" data-live-open>타이밍 화면</button>`;
  const next = A().nextSession();
  if (!next) A().loadSchedule().then(() => { if (A().mode === "live") renderLive(); }).catch(() => {});
  const nextHtml = next ? `<p class="muted">다음 세션 (일정 기준 · 실시간 확인 아님): <b>${esc(KO.gpName(next.r.name))} ${esc(KO.sessionName(next.s.name))}</b>, ${esc(kstFull.format(next.at))}</p>` : "";
  $("homeLive").innerHTML = `<h3>실시간</h3><p class="big">${main}</p><p class="muted">연결 상태: ${esc(L.conn)}${L.positions ? " · 차량 위치 포함" : ""}${L.waitingMs > 0 ? ` · 중계 지연에 맞춰 ${Math.ceil(L.waitingMs / 1000)}초 뒤 표시` : ""}</p><div class="home-progress">${btn}${L.conn !== "stopped" ? `<button class="ghost small" data-live-stop>연결 끊기</button>` : ""}</div>${nextHtml}`;
}

// ---------- all venues (only what the app has already checked) ----------
async function loadAll() {
  const tok = allG.next();
  S.allNote = "확인한 시즌을 모으는 중…"; render();
  const checked = await window.api.checkedSchedules().catch(() => []);
  const venues = new Map(), replaySeasons = new Set();
  for (const c of checked) {
    let sessions = S.seasonData.get(c.season)?.sessions || null;
    // (a season's archive list only from this computer's copy – nothing is fetched here)
    if (!sessions && c.season >= D.ARCHIVE_FROM) sessions = await window.api.listSessionsMeta(c.season, true).then((m) => m.sessions, () => null);
    const match = sessions ? D.matchRaces(c.races, sessions) : null;
    if (sessions) replaySeasons.add(c.season);
    for (const r of c.races) {
      const key = r.circuitId || (r.lat != null ? `${r.lat.toFixed(2)},${r.lon.toFixed(2)}` : `${c.season}-${r.round}`);
      if (!venues.has(key)) venues.set(key, { id: `v:${key}`, kind: "venue", circuitId: r.circuitId, name: r.circuitName || r.name, koName: r.circuitName || KO.gpName(r.name), circuitName: r.circuitName, locality: r.locality, country: r.country, lat: r.lat, lon: r.lon, hosted: [], replay: [] });
      const v = venues.get(key);
      v.hosted.push({ season: c.season, round: r.round, name: r.name });
      if (match?.races.get(r.round)?.state === "matched" && !v.replay.includes(c.season)) v.replay.push(c.season);
    }
  }
  if (!allG.current(tok) || !S.all) { metrics.ignored.all++; return; }
  S.allItems = [...venues.values()].sort((a, b) => String(a.country).localeCompare(String(b.country)) || String(a.name).localeCompare(String(b.name)));
  const ys = checked.map((c) => c.season);
  S.allNote = ys.length ? `앱이 확인한 시즌만: ${ys.join(", ")} (일정 ${ys.length}개 시즌, 다시보기 목록 ${replaySeasons.size}개 시즌). 다른 시즌은 시즌을 골라 확인하세요 – 시작할 때 모든 시즌을 받지 않아요.` : "아직 확인한 시즌이 없어요.";
  if (!S.allItems.some((v) => v.id === S.sel)) S.sel = S.allItems[0]?.id ?? null;
  render();
}
// "이 서킷의 다른 시즌 개최 이력": the all-venues view, on this circuit's venue once it has been put together
async function showHistory(circuitId, it) {
  if (!it) return;
  S.all = true; $("homeAll").setAttribute("aria-pressed", "true");
  await loadAll();
  const key = circuitId || (it.lat != null ? `${it.lat.toFixed(2)},${it.lon.toFixed(2)}` : null);
  const v = S.allItems.find((x) => x.id === `v:${key}`);
  if (v) select(v.id);
}
function setAll(on) {
  S.all = on; $("homeAll").setAttribute("aria-pressed", String(on));
  if (on) loadAll();
  else { allG.next(); S.sel = store.get("homeSel", null); if (!itemById(S.sel)) chooseDefault(); render(); }
}

// ---------- events ----------
$("homeSeason").addEventListener("change", () => { const y = +$("homeSeason").value; store.set("homeYear", y); if (S.all) setAll(false); loadSeason(y); });
$("homeAll").addEventListener("click", () => setAll(!S.all));
$("homeSearch").addEventListener("input", () => { S.query = $("homeSearch").value; S.kbd = -1; renderList(false); });
$("homeSearch").addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); $("homeList").focus(); moveKbd(1); } else if (e.key === "Enter") { const first = visibleItems()[0]; if (first) select(S.all ? first.id : fullId(first)); } });
$("homeList").addEventListener("click", (e) => { const id = e.target.closest("[data-id]")?.dataset.id; if (id) select(id); });
function moveKbd(d) {
  const list = visibleItems(); if (!list.length) return;
  const cur = list.findIndex((it) => (S.all ? it.id : fullId(it)) === S.sel);
  const i = Math.max(0, Math.min(list.length - 1, (cur < 0 ? (d > 0 ? -1 : list.length) : cur) + d));
  select(S.all ? list[i].id : fullId(list[i]));
}
$("homeList").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moveKbd(e.key === "ArrowDown" ? 1 : -1); }
  else if (e.key === "Home" || e.key === "End") { e.preventDefault(); const list = visibleItems(); if (list.length) select(S.all ? list[e.key === "Home" ? 0 : list.length - 1].id : fullId(list[e.key === "Home" ? 0 : list.length - 1])); }
  else if (e.key === "Enter") { e.preventDefault(); $("homeEvent").querySelector("button[data-load], button[data-resume], button[data-goto]")?.focus(); }
});
$("home").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.load) { const s = itemById(S.sel)?.meeting?.sessions.find((x) => x.path === b.dataset.load); if (s) startLoad(s.path, s, null, "event"); }
  else if (b.hasAttribute("data-resume")) A().resumeLoaded();
  else if (b.dataset.recent) { const x = A().recent().find((r) => r.path === b.dataset.recent); if (x) startLoad(x.path, x, x.pos, "recent"); }
  else if (b.dataset.forget) { A().forgetRecent(b.dataset.forget); renderRecent(); }
  else if (b.hasAttribute("data-retry") && S.load) startLoad(S.load.path, S.load.info, S.load.at, S.load.origin);
  else if (b.hasAttribute("data-login")) A().signIn().then(() => { if (S.load) startLoad(S.load.path, S.load.info, S.load.at, S.load.origin); }).catch(() => {});
  else if (b.hasAttribute("data-dismiss")) { S.load = null; render(); }
  else if (b.hasAttribute("data-history")) showHistory(b.dataset.history, itemById(S.sel));
  else if (b.dataset.goto) { const [y, r] = b.dataset.goto.split(":"); setAll(false); store.set("homeYear", +y); store.set("homeSel", `${y}:${r}`); S.sel = `${y}:${r}`; loadSeason(+y); }
  else if (b.hasAttribute("data-live-start")) A().startLive();
  else if (b.hasAttribute("data-live-retry")) A().stopLive().then(() => A().startLive());
  else if (b.hasAttribute("data-live-stop")) A().stopLive();
  else if (b.hasAttribute("data-live-open")) A().setHome(false);
});
// (the strategy game's screens cover the home screen: the globe stops while they are up, and comes back after – game/gamehome.js)
addEventListener("f1kr-game", (e) => { if (!A().homeOn) return; if (e.detail.on) { globeHide(); closePick(); } else globeShow(); });
addEventListener("f1kr-home", (e) => {
  if (e.detail.on) { globeShow(); render(); probeSelected(); }
  else { globeHide(); closePick(); clearInterval(liveTimer); liveTimer = null; }
});
// a session loaded (any way): the home screen's season and race follow it – the race picked here stays as it is when it
// already is the loaded session's (a load started here)
addEventListener("f1kr-loaded", (e) => {
  const path = e.detail?.path, y = +String(path || "").slice(0, 4);
  if (!y || S.all) return;
  const cur = itemById(S.sel); if (cur && itemHasPath(cur, path)) return;
  S.follow = path; store.set("homeYear", y);
  if (y !== S.year) loadSeason(y); else rebuild();
});
addEventListener("f1kr-mode", () => { if (A().mode === "live" && S.year !== thisYear && !S.all) loadSeason(thisYear); else render(); });
addEventListener("f1kr-live", () => { if (A().homeOn && A().mode === "live") renderLive(); });

// development: state and measurements for the screenshot harness (window.HomeDev)
window.HomeDev = {
  metrics: () => JSON.stringify({ ...metrics, globe: globe?.info() || null, globeFailed }),
  state: () => JSON.stringify({ year: S.year, sched: S.sched.state, schedSource: S.sched.source, stale: S.sched.stale, listing: S.listing, items: S.items.length, sel: S.sel, matched: S.items.filter((x) => x.match?.state === "matched").length, data: S.items.map((x) => `${x.round ?? "-"}:${x.sched.key}/${x.data.key}`).join(" "), load: S.load && { ...S.load, info: undefined } }),
  season: (y) => { store.set("homeYear", y); loadSeason(y); return "ok"; },
  select: (id) => { select(id); return String(!!itemById(id)); },
  selectPath: (path) => { const it = S.items.find((x) => itemHasPath(x, path)); if (it) select(fullId(it)); return it ? fullId(it) : "none"; },
  search: (q) => { $("homeSearch").value = q; S.query = q; renderList(false); return visibleItems().length; },
  all: (on) => { setAll(!!on); return "ok"; },
  load: (path) => { const s = S.sessions.find((x) => x.path === path); if (!s) return "no session"; startLoad(s.path, s, null, "event"); return "loading"; },
  globe: () => JSON.stringify(globe?.info() || null),
  failGlobe: () => { globe?.dispose(); globe = makeGlobe(true); placeMarkers(); return globeFailed; },
  disposeGlobe: () => { globe?.dispose(); globe = null; return "ok"; },
  spin: () => { if (globe) { globe.autoRotate = true; globe.dirty = true; } return String(!!globe); },
};

// ---------- start ----------
for (let y = thisYear; y >= FIRST_SEASON; y--) $("homeSeason").add(new Option(`${y}년`, y));
if (!(S.year >= FIRST_SEASON && S.year <= thisYear)) S.year = thisYear;
if (A().homeOn) globeShow();
loadSeason(A().mode === "live" ? thisYear : S.year);
