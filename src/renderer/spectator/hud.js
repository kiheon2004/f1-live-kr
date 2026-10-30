// The 3D view's spectator HUD (v0.50 §8) – live and replay only. In the strategy game's mode (Map3D.game attached) the
// game draws its own race HUD (game/racehud.js) and this one is hidden; the camera buttons it shares with the game's
// legacy bar keep working there (map3d.js binds every [data-cam]).
//
// Widgets (layout.js WIDGETS), built ONCE and then only their text / a few style values changed, each at its own rate:
//   tower   – the race order: position, team bar, TLA, interval (분석: gap, interval, tyre, stops); the selected driver
//             (light bar), the comparison driver (blue tint) and the filmed car (camera mark) told apart; 2 Hz
//   strip   – flag (word + colour), lap, time left, replay rate / live delay, rain; 2 Hz
//   driver  – the selected driver: position, name, team, gaps, last lap, tyre and age, the filmed car when it is another
//             one (with "이 차 보기"), the comparison driver's gap; 2 Hz – speed / gear / pedals 10 Hz
//   cam     – heli / chase / onboard / 1st person, the filmed car ◀ ▶, 따라가기 (follow) and the HUD editor
//   pit     – the selected (else the filmed) car in the pit lane: pitText (hudtext.js) – nothing of the future; 5 Hz
//   notes   – map3d's small provenance lines (garages, crew work, start lights, support cars, camera notes)
// A ready / loading state covers the view while the circuit or the filmed car isn't there yet (4 Hz).
//
// Editing (HUD 편집): presets 관전 / 분석 / 최소 HUD, show / hide, drag, scale (− / +, keys), reset – saved as a UI
// preference only (layout.js loadPrefs / savePrefs). Layout runs on a resize, a preference change, a camera change, a
// widget's own size change and – in the cockpit cameras – every half second against the keep-clear zones map3d measures.
import { WIDGETS, WIDGET_IDS, PRESETS, PRESET_IDS, nextCols, loadPrefs, savePrefs, applyPreset, resetWidgets, setWidget, stepScale, placeRect, anchorFor, avoidZones, clampRect } from "./layout.js";
import { flagOf, gapText, gapSec, hms, parseClock, playText, tyreLetter, pitText } from "./hudtext.js";

const RATE = { tower: 500, strip: 500, driver: 500, tel: 100, pit: 200, ready: 250, zones: 500 };
const ORDER = ["cam", "strip", "driver", "tower", "pit", "notes"];   // layout priority (who keeps its place)
const ROW_H = 20;
const CAM_SVG = '<svg class="cam-ico" viewBox="0 0 16 12" aria-hidden="true"><rect x="1" y="2.5" width="10" height="8" rx="1.5"/><path d="M11 5.5l4-2.5v7l-4-2.5z"/></svg>';
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const hex = (c) => (/^[0-9a-f]{6}$/i.test(c || "") ? "#" + c : "#888888");
function setText(el, v) {
  v = v == null ? "" : String(v); if (el.__t === v) return; el.__t = v;
  // (one text node changed in place – a characterData change, no node made and thrown away 10 times a second)
  const t = el.firstChild; if (t && t.nodeType === 3 && !t.nextSibling && v) t.nodeValue = v; else el.textContent = v;
}
function setBg(el, c) { if (el.__bg !== c) { el.__bg = c; el.style.background = c; } }
function setCls(el, k, on) { on = !!on; if ((el.__c || (el.__c = {}))[k] !== on) { el.__c[k] = on; el.classList.toggle(k, on); } }
function setHid(el, v) { v = !!v; if (el.hidden !== v) el.hidden = v; }   // (a write of the same value is still a DOM mutation)
function setAttr(el, k, v) { if (el.getAttribute(k) !== v) el.setAttribute(k, v); }
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// (the zones on a 16 px grid, grown outwards: the wheel turning a few degrees doesn't move the widgets every half second)
const snapZones = (zs) => zs.map((r) => { const x = Math.floor(r.x / 16) * 16, y = Math.floor(r.y / 16) * 16; return { x, y, w: Math.ceil((r.x + r.w) / 16) * 16 - x, h: Math.ceil((r.y + r.h) / 16) * 16 - y, what: r.what }; });
// host: #map3d; api: what map3d lends (see map3d.js specApi)
export function createSpecHud(host, api) {
  let prefs = loadPrefs(window.localStorage), editing = false, small = false, cockpit = false, gameOn = false;
  const last = { tower: 0, strip: 0, driver: 0, tel: 0, pit: 0, ready: 0, zones: 0 };
  const cost = { ms: 0, frames: 0, worst: 0, layouts: 0, built: 0 };
  let zones = [], layoutDue = true, placed = {}, baseScale = 1;

  const root = h("div", "spec-hud"); root.id = "specHud"; root.setAttribute("aria-label", "3D 관전 HUD");
  const W = {};
  for (const id of WIDGET_IDS) {
    const outer = h("section", `spec-w spec-${id}`); outer.dataset.w = id; outer.setAttribute("aria-label", WIDGETS[id].name);
    const inner = h("div", "spec-in"); outer.appendChild(inner);
    // (editing: a grip over the widget takes the pointer and the keys; the tag above it names it and holds − + 숨김)
    const grip = h("div", "spec-grip"); grip.tabIndex = -1; grip.setAttribute("role", "button");
    grip.setAttribute("aria-label", `${WIDGETS[id].name} 옮기기 · 방향키로 이동, +/− 크기`);
    const tag = h("div", "spec-tag", `<span>${esc(WIDGETS[id].name)}</span><button class="ui-btn sm icon ghost" data-ed="-" aria-label="작게" title="작게">−</button><button class="ui-btn sm icon ghost" data-ed="+" aria-label="크게" title="크게">+</button>${WIDGETS[id].hide ? '<button class="ui-btn sm ghost" data-ed="hide" title="숨기기">숨김</button>' : ""}`);
    outer.append(grip, tag);
    W[id] = { outer, inner, grip, tag };
  }
  // notes: map3d's provenance lines live in #notes3d (also used in game mode, where the HUD is hidden – kept outside it)
  const notes = document.getElementById("notes3d") || h("div", "notes3d");
  notes.id = "notes3d"; W.notes.inner.appendChild(h("span", "spec-notes-ph"));
  const ready = h("div", "spec-ready", '<div class="ui-state"><span class="ui-spin"></span><b></b><span class="sub"></span></div>');
  const editor = h("div", "spec-editor ui-panel"); editor.hidden = true; editor.setAttribute("role", "dialog"); editor.setAttribute("aria-label", "HUD 편집");
  for (const id of WIDGET_IDS) if (id !== "notes") root.appendChild(W[id].outer);
  root.appendChild(W.notes.outer); root.append(ready, editor);
  host.appendChild(root); host.appendChild(notes);

  // ---------- the widgets' static parts ----------
  W.strip.inner.innerHTML = '<span class="ui-flag" data-k="flag"></span><span class="st-lap num" data-k="lap"></span><span class="st-clock num" data-k="clock"></span><span class="ui-badge" data-k="play"></span><span class="ui-badge info" data-k="wx" hidden></span>';
  W.tower.inner.innerHTML = '<header class="tw-h"><span>순위</span><button class="tw-hcol" data-act="cols" data-k="hgap" title="값 바꾸기: 앞 차 간격 → 선두와 차이 → 둘 다(타이어·피트 포함)"></button></header><ol class="tw-rows"></ol><p class="tw-empty faint" hidden>순위 자료 없음</p>';
  W.driver.inner.innerHTML = `<div class="dc-main"><i class="dc-bar"></i><b class="dc-pos num"></b><span class="dc-name"><b></b><small></small></span>
    <span class="dc-kv"><small>선두와</small><b class="num" data-k="gap"></b></span><span class="dc-kv"><small>앞 차</small><b class="num" data-k="int"></b></span>
    <span class="dc-kv"><small>최근 랩</small><b class="num" data-k="lastlap"></b></span><span class="dc-kv dc-more"><small>최고 랩</small><b class="num" data-k="best"></b></span>
    <span class="dc-kv"><small>타이어</small><b data-k="tyre"></b></span><span class="dc-kv dc-more"><small>피트</small><b class="num" data-k="pits"></b></span>
    <span class="dc-tel"><b class="num" data-k="spd"></b><small>km/h</small><b class="num gear" data-k="gear"></b><i class="thr" data-k="thr"></i><i class="brk" data-k="brk"></i></span></div>
    <div class="dc-row dc-cam" hidden>${CAM_SVG}<span data-k="camtxt"></span><button class="ui-btn sm" data-act="film">이 차 보기</button></div>
    <div class="dc-row dc-cmp" hidden><span class="dc-cmpdot"></span><span data-k="cmptxt"></span></div>
    <p class="dc-empty faint" hidden>드라이버를 고르면 여기에 정보가 나와요</p>`;
  W.cam.inner.innerHTML = `<div class="ui-seg" role="group" aria-label="카메라">
      <button data-cam="heli" title="헬리콥터 시점 · 끌어서 돌리기 · 스크롤로 확대">헬기</button><button data-cam="chase" title="중계 카메라처럼 차 뒤에서 따라가요">추적</button><button data-cam="onboard" title="온보드 카메라(T-cam)">온보드</button><button data-cam="eye" title="1인칭: 드라이버의 눈">1인칭</button>
    </div>
    <span class="cam-car"><button class="ui-btn sm icon ghost" data-act="prev" title="카메라: 앞 순위 차" aria-label="카메라: 앞 순위 차">◀</button><span class="cam-who" title="카메라가 보는 차">${CAM_SVG}<b data-k="camwho">–</b></span><button class="ui-btn sm icon ghost" data-act="next" title="카메라: 뒤 순위 차" aria-label="카메라: 뒤 순위 차">▶</button></span>
    <button class="ui-btn sm" data-act="follow" aria-pressed="true" title="켜면 드라이버를 고를 때 카메라도 그 차로 가요 · 끄면 카메라는 ◀ ▶로 따로 움직여요">따라가기: 켬</button>
    <button class="ui-btn sm ghost" data-act="edit" aria-pressed="false" title="HUD 편집: 프리셋, 표시/숨김, 위치·크기 (스페이스바 재생 · ←/→ 이동 · Esc 닫기)">HUD</button>`;
  W.pit.inner.innerHTML = '<header class="pt-h"><b data-k="ptitle"></b><span class="ui-drv"><i data-k="pbar"></i><b data-k="pwho"></b></span></header><dl class="pt-rows"></dl>';
  editor.innerHTML = `<header class="ui-ph"><span>HUD 편집</span><span class="grow"></span><button class="ui-btn sm ghost" data-ed="cancel" aria-label="취소하고 닫기">닫기</button></header>
    <div class="ed-body"><div class="ui-seg" role="group" aria-label="프리셋">${PRESET_IDS.map((p) => `<button data-preset="${p}">${esc(PRESETS[p].name)}</button>`).join("")}</div>
    <div class="ed-list">${WIDGET_IDS.filter((id) => WIDGETS[id].hide).map((id) => `<label class="ui-check"><input type="checkbox" data-show="${id}"> ${esc(WIDGETS[id].name)}</label>`).join("")}</div>
    <p class="faint ed-hint">위젯을 끌어서 옮기고 − / + 로 크기를 바꿔요. 키보드: 위젯 선택 후 방향키(Shift: 크게) · + / − · H 숨김. 설정은 이 컴퓨터의 화면 설정에만 저장돼요.</p></div>
    <footer><button class="ui-btn sm ghost" data-ed="reset" title="지금 프리셋의 기본 배치로">초기화</button><span class="grow"></span><button class="ui-btn sm" data-ed="cancel" title="편집 전으로 되돌리기 (Esc)">취소</button><button class="ui-btn sm primary" data-ed="done">저장</button></footer>`;
  const q = (id, k) => W[id].inner.querySelector(`[data-k="${k}"]`);

  // ---------- tower rows: built per driver set, then only text / order changed ----------
  let towerKey = "", rows = new Map();
  function buildTower(drivers, nums) {
    const ol = W.tower.inner.querySelector(".tw-rows"); ol.textContent = ""; rows = new Map();
    for (const n of nums) {
      const d = drivers[n] || {}, li = h("li", "tw-row");
      li.dataset.num = n; li.tabIndex = -1;
      li.innerHTML = `<span class="tw-pos num"></span><i class="tw-bar" style="background:${hex(d.TeamColour)}"></i><b class="tw-tla">${esc(d.Tla || n)}</b><span class="tw-mk"></span><span class="tw-gap num"></span><span class="tw-int num"></span><span class="tw-tyre"></span><span class="tw-pits num"></span>`;
      const [pos, , , mk, gap, int, tyre, pits] = li.children;
      rows.set(n, { li, pos, mk, gap, int, tyre, pits, y: -1, ty: "", mkv: "" });
      ol.appendChild(li);
    }
    cost.built++;
  }
  function paintTower(A) {
    const src = A.src, lines = src?.state.TimingData?.Lines || {}, drivers = src?.state.DriverList || {};
    const nums = Object.keys(lines).filter((n) => drivers[n]);
    const empty = W.tower.inner.querySelector(".tw-empty"); setHid(empty, nums.length > 0);
    const key = nums.slice().sort().join(",") + "|" + nums.map((n) => drivers[n]?.TeamColour).join("");
    if (key !== towerKey) { towerKey = key; buildTower(drivers, nums); layoutDue = true; }
    const order = nums.slice().sort((a, b) => (+lines[a].Position || 99) - (+lines[b].Position || 99));
    const cols = cockpit ? "int" : prefs.widgets.tower.cols || "int", full = cols === "full";
    setCls(W.tower.outer, "full", full); setText(q("tower", "hgap"), cockpit ? "앞뒤 차 · 간격" : full ? "선두 · 간격 ▾" : cols === "gap" ? "선두와 ▾" : "간격 ▾");
    q("tower", "hgap").disabled = cockpit;
    const sel = A.focus, cmp = A.compare || null, cam = api.camNum();
    // (a short view: the rows around the selected driver, the leader's first. The cockpit cameras: the two cars ahead of
    // and behind the filmed one only – a small relative box that fits beside the wheel and under the mirrors)
    const room = cockpit ? 5 : Math.max(5, Math.floor((host.clientHeight - 54 - 90) / (ROW_H * prefs.widgets.tower.scale)) - 1);
    let start = 0;
    if (order.length > room) { const i = Math.max(0, order.indexOf(cockpit ? cam : sel)); start = Math.max(0, Math.min(order.length - room, i - Math.floor(room / 2))); }
    const ol = W.tower.inner.querySelector(".tw-rows"), shown = Math.min(order.length, room);
    if (ol.__h !== shown) { ol.__h = shown; ol.style.height = shown * ROW_H + "px"; }
    order.forEach((n, i) => {
      const r = rows.get(n); if (!r) return;
      const l = lines[n], k = i - start, vis = k >= 0 && k < room;
      if (r.y !== k) { r.y = k; r.li.style.transform = `translateY(${k * ROW_H}px)`; }
      setCls(r.li, "off", !vis);
      if (!vis) return;
      const out = l.Retired || l.Stopped, pit = l.InPit || l.PitOut;
      setText(r.pos, l.Position || "");
      setCls(r.li, "sel", n === sel); setCls(r.li, "cmp", n === cmp && n !== sel); setCls(r.li, "out", !!out);
      const mk = (n === cam ? "cam" : "") + (pit ? " pit" : "") + (out ? " out" : "");
      if (r.mkv !== mk) { r.mkv = mk; r.mk.innerHTML = (n === cam ? CAM_SVG : "") + (out ? '<span class="ui-badge">OUT</span>' : pit ? '<span class="ui-badge info">PIT</span>' : ""); }
      const leader = l.Position === "1";
      const gl = leader ? (src.state.LapCount?.CurrentLap ? `랩 ${src.state.LapCount.CurrentLap}` : "선두") : gapText(l.GapToLeader || l.TimeDiffToFastest);
      const iv = leader ? "" : gapText(l.IntervalToPositionAhead?.Value || l.TimeDiffToPositionAhead);
      const one = cols === "gap" ? gl : leader ? gl : iv || gl;
      if (full) { setText(r.gap, gl || "–"); setText(r.int, iv || (leader ? "" : "–")); }
      else { setText(r.gap, one || "–"); setText(r.int, ""); }
      setCls(r.gap, "t-none", !(full ? gl : one)); setCls(r.int, "t-none", full && !leader && !iv);
      if (full) {
        const st = src.stints?.(n) || [], s = st[st.length - 1], L = tyreLetter(s?.Compound);
        const ty = L ? `<span class="ui-tyre sm ${L}${s.New === "false" || s.New === false ? " used" : ""}">${L}</span>` : '<span class="t-none">–</span>';
        if (r.ty !== ty) { r.ty = ty; r.tyre.innerHTML = ty; }
        setText(r.pits, l.NumberOfPitStops != null ? `${l.NumberOfPitStops}회` : "");
      } else if (r.ty) { r.ty = ""; r.tyre.innerHTML = ""; setText(r.pits, ""); }
    });
  }

  // ---------- session strip ----------
  function paintStrip(A) {
    const s = A.src?.state || {}, f = flagOf(s.TrackStatus?.Status, s.SessionStatus?.Status), flag = q("strip", "flag");
    setHid(flag, !f); if (f) { setText(flag, f.ko); setAttr(flag, "class", "ui-flag " + f.cls); }
    const lc = s.LapCount; setText(q("strip", "lap"), lc?.CurrentLap ? `랩 ${lc.CurrentLap}/${lc.TotalLaps || "?"}` : "");
    const clk = s.ExtrapolatedClock; let rem = parseClock(clk?.Remaining);
    if (rem != null && clk.Extrapolating) { const now = A.utcNow?.(); const u = window.ReplayKit?.parseUtc?.(clk.Utc); if (now && u) rem -= now - u; }
    setText(q("strip", "clock"), rem != null ? `남은 ${hms(Math.max(0, rem))}` : "");
    const p = playText({ mode: A.mode, rate: A.rate, delayMs: A.src?.delayMs || 0, conn: A.mode === "live" ? document.getElementById("liveState")?.textContent : null });
    const pb = q("strip", "play"); setText(pb, p.ko); setAttr(pb, "class", "ui-badge " + p.cls);
    const w = s.WeatherData, wx = q("strip", "wx"), rain = w?.Rainfall === "1";
    setHid(wx, !w); if (w) { setText(wx, `${rain ? "비 · " : ""}노면 ${w.TrackTemp}°`); setCls(wx, "warn", rain); setCls(wx, "info", !rain); }
  }

  // ---------- selected driver ----------
  function paintDriver(A) {
    const src = A.src, num = A.focus || api.leader(), d = src?.state.DriverList?.[num], l = src?.state.TimingData?.Lines?.[num];
    const main = W.driver.inner.querySelector(".dc-main"), empty = W.driver.inner.querySelector(".dc-empty");
    setHid(main, !(d && l)); setHid(empty, !!(d && l));
    if (!d || !l) return;
    const KO = window.KO;
    setBg(W.driver.inner.querySelector(".dc-bar"), hex(d.TeamColour));
    setText(W.driver.inner.querySelector(".dc-pos"), l.Position ? `P${l.Position}` : "P–");
    setText(W.driver.inner.querySelector(".dc-name b"), KO ? KO.surname(d.Tla, d.LastName) : d.LastName || d.Tla);
    setText(W.driver.inner.querySelector(".dc-name small"), `${d.Tla || num} · ${(KO?.TEAMS?.[d.TeamName]) || d.TeamName || ""}`);
    const leader = l.Position === "1", gap = gapText(l.GapToLeader || l.TimeDiffToFastest), int = gapText(l.IntervalToPositionAhead?.Value || l.TimeDiffToPositionAhead);
    const g = q("driver", "gap"), iv = q("driver", "int");
    setText(g, leader ? "선두" : gap || "–"); setCls(g, "t-none", !leader && !gap);
    setText(iv, leader ? "–" : int || "–"); setCls(iv, "t-none", leader || !int);
    const ll = q("driver", "lastlap"); setText(ll, l.LastLapTime?.Value || "–"); setCls(ll, "t-none", !l.LastLapTime?.Value);
    setCls(ll, "t-best", !!l.LastLapTime?.OverallFastest); setCls(ll, "t-pb", !l.LastLapTime?.OverallFastest && !!l.LastLapTime?.PersonalFastest);
    const bl = q("driver", "best"); setText(bl, l.BestLapTime?.Value || "–"); setCls(bl, "t-none", !l.BestLapTime?.Value);
    const st = src.stints?.(num) || [], s = st[st.length - 1], L = tyreLetter(s?.Compound), age = s ? Math.max(0, (s.TotalLaps || 0)) : null;
    const ty = L ? `<span class="ui-tyre sm ${L}${s.New === "false" || s.New === false ? " used" : ""}">${L}</span> <span class="num">${age}랩</span>` : '<span class="t-none">–</span>';
    const tyEl = q("driver", "tyre"); if (tyEl.__h !== ty) { tyEl.__h = ty; tyEl.innerHTML = ty; }
    setText(q("driver", "pits"), l.NumberOfPitStops != null ? `${l.NumberOfPitStops}회` : "–");
    setCls(W.driver.outer, "detail", !!prefs.widgets.driver.detail);
    // the filmed car, when it is another one
    const cam = api.camNum(), camRow = W.driver.inner.querySelector(".dc-cam");
    const diff = !!cam && cam !== num && api.camMode() !== "heli";
    setHid(camRow, !diff);
    if (diff) { const cd = src.state.DriverList?.[cam]; setText(q("driver", "camtxt"), `카메라는 ${cd?.Tla || cam} 보는 중`); }
    // the comparison driver
    const cmp = A.compare, cl = cmp && src.state.TimingData?.Lines?.[cmp], cmpRow = W.driver.inner.querySelector(".dc-cmp");
    setHid(cmpRow, !(cl && cmp !== num));
    if (cl && cmp !== num) {
      const cd = src.state.DriverList?.[cmp], a = leader ? 0 : gapSec(l.GapToLeader), b = cl.Position === "1" ? 0 : gapSec(cl.GapToLeader);
      const dt = a != null && b != null ? b - a : null;
      setBg(W.driver.inner.querySelector(".dc-cmpdot"), hex(cd?.TeamColour));
      setText(q("driver", "cmptxt"), `비교 ${cd?.Tla || cmp} P${cl.Position || "–"} · ${dt == null ? "시간 차 자료 없음" : dt >= 0 ? `${dt.toFixed(1)}초 뒤` : `${(-dt).toFixed(1)}초 앞`}`);
    }
  }
  function paintTel(A) {
    const num = A.focus || api.leader(), c = A.src?.carAt?.(num, A.t), tel = W.driver.inner.querySelector(".dc-tel");
    setHid(tel, !c);
    if (!c) return;
    setText(q("driver", "spd"), Math.round(c.speed || 0)); setText(q("driver", "gear"), c.gear == null ? "–" : c.gear || "N");
    const thr = Math.max(0, Math.min(100, +c.thr || 0)), brk = c.brk ? 100 : 0, ti = q("driver", "thr"), bi = q("driver", "brk");
    if (ti.__v !== thr) { ti.__v = thr; ti.style.setProperty("--v", thr + "%"); }
    if (bi.__v !== brk) { bi.__v = brk; bi.style.setProperty("--v", brk + "%"); }
  }

  // ---------- camera tools ----------
  function paintCam(A) {
    const cam = api.camNum(), d = A.src?.state.DriverList?.[cam], who = q("cam", "camwho");
    setText(who, d?.Tla || cam || "–");
    const diff = !!cam && !!A.focus && cam !== A.focus;
    setCls(W.cam.inner.querySelector(".cam-who"), "diff", diff);
    const cw = W.cam.inner.querySelector(".cam-who"), tt = diff ? `카메라: ${d?.Tla || cam} · 선택: ${A.src?.state.DriverList?.[A.focus]?.Tla || A.focus} (다른 차)` : "카메라가 보는 차";
    if (cw.title !== tt) cw.title = tt;
    const fb = W.cam.inner.querySelector('[data-act="follow"]'); setAttr(fb, "aria-pressed", String(api.follow())); setText(fb, api.follow() ? "따라가기: 켬" : "따라가기: 끔");
  }

  // ---------- pit panel ----------
  const stops = new Map();   // num → { dur, at (session ms it ended) } – the last stop seen ended (past data only)
  function paintPit(A) {
    const t = A.t, cand = [A.focus || api.leader(), api.camNum()].filter((x, i, a) => x && a.indexOf(x) === i);
    let show = null, who = null;
    for (const n of cand) {
      const p = api.pitInfo(n);
      if (p?.lastBox && p.lastBox.t1 != null && p.lastBox.t0 != null) stops.set(n, { dur: (p.lastBox.t1 - p.lastBox.t0) / 1000 + 0.25, end: p.lastBox.t1 });
      const ls = stops.get(n), lastStop = ls && t >= ls.end ? { dur: ls.dur, ago: (t - ls.end) / 1000 } : null;
      const txt = pitText(p ? { ...p, lastStop } : lastStop ? { state: "track", lastStop } : null);
      if (txt) { show = txt; who = n; break; }
    }
    const body = W.pit.inner.querySelector(".pt-rows"), wasHidden = W.pit.outer.classList.contains("idle");
    setCls(W.pit.outer, "idle", !show && !editing);
    if (!show) { if (editing) { setText(q("pit", "ptitle"), "피트 정보"); setText(q("pit", "pwho"), ""); if (body.__h !== "ed") { body.__h = "ed"; body.innerHTML = '<dt></dt><dd class="faint">차가 피트 레인에 들어오면 나와요</dd>'; } } if (!wasHidden && !editing) layoutDue = true; return; }
    if (wasHidden) layoutDue = true;
    const d = A.src?.state.DriverList?.[who];
    setText(q("pit", "ptitle"), show.title); setText(q("pit", "pwho"), d?.Tla || who); setBg(q("pit", "pbar"), hex(d?.TeamColour));
    setAttr(W.pit.outer, "data-tone", show.cls || "");
    const html = show.rows.map((r) => `<dt>${esc(r.k)}</dt><dd class="${esc(r.cls)}">${esc(r.v)}</dd>`).join("");
    if (body.__h !== html) { body.__h = html; body.innerHTML = html; }
  }

  // ---------- ready / loading ----------
  function paintReady() {
    const r = api.ready();
    setHid(ready, !r.busy);
    if (r.busy) { setText(ready.querySelector("b"), r.text); setText(ready.querySelector(".sub"), r.sub || ""); }
  }

  // ---------- layout ----------
  function applyPrefsToDom() {
    for (const id of WIDGET_IDS) {
      const p = prefs.widgets[id], o = W[id].outer;
      setCls(o, "hidden", !p.on);
      const z = String(+(p.scale * baseScale).toFixed(3)); if (W[id].inner.style.zoom !== z) W[id].inner.style.zoom = z;
    }
    if (!gameOn) { setHid(notes, !prefs.widgets.notes.on); }
    editor.querySelectorAll("[data-preset]").forEach((b) => setAttr(b, "aria-pressed", String(b.dataset.preset === prefs.preset && !prefs.edited)));
    editor.querySelectorAll("[data-show]").forEach((c) => { c.checked = prefs.widgets[c.dataset.show].on; });
    layoutDue = true;
  }
  function layout() {
    layoutDue = false; cost.layouts++;
    const vw = host.clientWidth, vh = host.clientHeight; if (!vw || !vh) return;
    small = vw < 720; setCls(root, "small", small);
    // (a big window: everything a little larger – 12 px type over a 1920 px wide picture reads small; the viewer's scale on top)
    const base = vw >= 1600 ? 1.15 : 1;
    if (base !== baseScale) { baseScale = base; applyPrefsToDom(); layoutDue = false; }
    const rects = [];
    for (const id of ORDER) {
      const o = W[id].outer, p = prefs.widgets[id];
      if (!p.on || o.classList.contains("idle") || (small && (id === "tower" || id === "notes"))) { placed[id] = null; continue; }
      const b = id === "notes" ? notes.getBoundingClientRect() : o.getBoundingClientRect();
      const w = Math.ceil(b.width), hh = Math.ceil(b.height);
      if (id === "notes" && (!w || !hh)) { placed[id] = null; continue; }
      const spec = small ? smallSpec(id) : p;
      rects.push({ id, ...placeRect(spec, w, hh, vw, vh) });
    }
    // (the timing layout's own buttons over the view – 2D / 3D, expand, map settings – are kept clear in every camera)
    const hr = host.getBoundingClientRect();
    const fixed = [...(host.parentElement?.querySelectorAll(":scope > .view-switch, :scope > #expandMap") || []), host.querySelector("#geo3dBtn")]
      .filter((e) => e && e.offsetParent).map((e) => { const b = e.getBoundingClientRect(); return { x: b.left - hr.left, y: b.top - hr.top, w: b.width, h: b.height }; })
      .filter((r) => r.w > 0 && r.h > 0 && r.x < vw && r.y < vh && r.x + r.w > 0 && r.y + r.h > 0);
    const out = avoidZones(rects, fixed.concat(cockpit && !editing ? zones : []), vw, vh);
    // (the camera tools are never hidden – they are the way out of a cockpit view: with nowhere free they keep their place)
    for (const r of out) if (r.id === "cam" && r.squeezed) Object.assign(r, rects.find((x) => x.id === "cam"), { squeezed: false, moved: false });
    for (const r of out) {
      placed[r.id] = r;
      const el = r.id === "notes" ? notes : W[r.id].outer;
      el.style.left = r.x + "px"; el.style.top = r.y + "px"; if (r.id === "notes") el.style.bottom = "auto";
      setCls(el, "squeezed", r.squeezed); setCls(el, "moved", r.moved);
      if (r.id === "notes") W.notes.outer.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    }
  }
  // the small (not expanded) map: fixed places, nothing to edit
  function smallSpec(id) { return { cam: { ax: "l", ay: "t", dx: 8, dy: 8 }, driver: { ax: "c", ay: "b", dx: 0, dy: 8 }, strip: { ax: "l", ay: "b", dx: 8, dy: 52 }, pit: { ax: "r", ay: "b", dx: 8, dy: 52 } }[id] || { ax: "l", ay: "t", dx: 8, dy: 8 }; }

  // ---------- editing ----------
  let editReturn = null, editBefore = null;
  function setEditing(on, keep = true) {
    if (on && small) { api.toast?.("HUD 편집은 크게 보기에서 할 수 있어요."); return; }
    if (on && !editing) editBefore = JSON.parse(JSON.stringify(prefs));
    if (!on && editing && !keep && editBefore) { prefs = editBefore; savePrefs(window.localStorage, prefs); }   // (취소: back to before the edit)
    if (!on) editBefore = null;
    editing = !!on; setCls(root, "editing", editing); editor.hidden = !editing;
    setAttr(W.cam.inner.querySelector('[data-act="edit"]'), "aria-pressed", String(editing));
    for (const id of WIDGET_IDS) W[id].grip.tabIndex = editing ? 0 : -1;
    if (editing) { editReturn = document.activeElement; applyPrefsToDom(); editor.querySelector("[data-preset]")?.focus(); }
    else { applyPrefsToDom(); api.setFollow(prefs.follow); (editReturn && document.contains(editReturn) ? editReturn : W.cam.inner.querySelector('[data-act="edit"]')).focus?.(); editReturn = null; }
    last.pit = 0; layoutDue = true;
  }
  const commit = (p) => { prefs = p; savePrefs(window.localStorage, prefs); applyPrefsToDom(); };
  editor.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.preset) commit(applyPreset(prefs, b.dataset.preset));
    else if (b.dataset.ed === "reset") commit(resetWidgets(prefs));
    else if (b.dataset.ed === "done") setEditing(false, true);
    else if (b.dataset.ed === "cancel") setEditing(false, false);
  });
  editor.addEventListener("change", (e) => { const id = e.target.dataset?.show; if (id) commit(setWidget(prefs, id, { on: e.target.checked })); });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ed]"); if (!b || !editing || editor.contains(b)) return;
    const id = b.closest(".spec-w")?.dataset.w; if (!id) return;
    if (b.dataset.ed === "hide") commit(setWidget(prefs, id, { on: false }));
    else commit(setWidget(prefs, id, { scale: stepScale(prefs.widgets[id].scale, b.dataset.ed === "+" ? 1 : -1) }));
  });
  // drag: the grip moves the widget (clamped into the view); dropped, its place is stored against its nearest edges
  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    const g = e.target.closest(".spec-grip"); if (!g || !editing) return;
    const id = g.parentElement.dataset.w, r = placed[id]; if (!r) return;
    drag = { id, sx: e.clientX, sy: e.clientY, x: r.x, y: r.y, w: r.w, h: r.h, el: id === "notes" ? [notes, W.notes.outer] : [W[id].outer] };
    try { g.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
  root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const c = clampRect({ x: drag.x + e.clientX - drag.sx, y: drag.y + e.clientY - drag.sy, w: drag.w, h: drag.h }, host.clientWidth, host.clientHeight);
    drag.nx = c.x; drag.ny = c.y; for (const el of drag.el) { el.style.left = c.x + "px"; el.style.top = c.y + "px"; }
  });
  const endDrag = () => {
    if (!drag) return; const d = drag; drag = null;
    if (d.nx == null) return;
    commit(setWidget(prefs, d.id, anchorFor(d.nx, d.ny, d.w, d.h, host.clientWidth, host.clientHeight)));
  };
  root.addEventListener("pointerup", endDrag); root.addEventListener("pointercancel", endDrag);
  root.addEventListener("keydown", (e) => {
    if (!editing) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false, false); return; }
    const g = e.target.closest?.(".spec-grip"); if (!g) return;
    const id = g.parentElement.dataset.w, r = placed[id]; if (!r) return;
    const k = e.shiftKey ? 32 : 8, mv = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] }[e.key];
    if (mv) { e.preventDefault(); e.stopPropagation(); const c = clampRect({ x: r.x + mv[0], y: r.y + mv[1], w: r.w, h: r.h }, host.clientWidth, host.clientHeight); commit(setWidget(prefs, id, anchorFor(c.x, c.y, r.w, r.h, host.clientWidth, host.clientHeight))); return; }
    if (e.key === "+" || e.key === "=" || e.key === "-") { e.preventDefault(); e.stopPropagation(); commit(setWidget(prefs, id, { scale: stepScale(prefs.widgets[id].scale, e.key === "-" ? -1 : 1) })); return; }
    if ((e.key === "h" || e.key === "H" || e.key === "Delete") && WIDGETS[id].hide) { e.preventDefault(); e.stopPropagation(); commit(setWidget(prefs, id, { on: false })); }
  });
  // (Escape while editing closes the editor first – not the full-window map)
  window.addEventListener("keydown", (e) => { if (editing && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); setEditing(false, false); } }, true);

  // ---------- the HUD's own buttons ----------
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "prev" || act === "next") api.cycleCam(act === "prev" ? -1 : 1);
    else if (act === "follow") { const on = !api.follow(); api.setFollow(on); prefs.follow = on; savePrefs(window.localStorage, prefs); paintCam(api.app()); }
    else if (act === "edit") setEditing(!editing, true);
    else if (act === "cols") commit(setWidget(prefs, "tower", { cols: nextCols(prefs.widgets.tower.cols || "int") }));
    else if (act === "film") api.filmSelected();
    last.driver = last.tower = 0;
  });
  W.tower.inner.addEventListener("click", (e) => {
    const li = e.target.closest("[data-num]"); if (!li || editing) return;
    const A = api.app(); if (e.shiftKey && A.setCompare) A.setCompare(li.dataset.num === A.compare ? null : li.dataset.num); else A.setFocus(li.dataset.num);
    last.driver = last.tower = 0;
  });
  W.tower.outer.title = "클릭: 드라이버 선택 · Shift+클릭: 비교 드라이버";
  new ResizeObserver(() => { layoutDue = true; }).observe(host);
  const ro = new ResizeObserver(() => { layoutDue = true; });
  for (const id of WIDGET_IDS) ro.observe(W[id].inner);
  ro.observe(notes);
  api.setFollow(prefs.follow);
  applyPrefsToDom();

  // ---------- per frame (map3d's loop): each part at its own rate ----------
  function frame(now) {
    if (gameOn) return;
    const t0 = performance.now(), A = api.app();
    const mode = api.camMode(), ck = mode === "onboard" || mode === "eye";
    if (root.dataset.cam !== mode) { root.dataset.cam = mode; layoutDue = true; }
    if (ck !== cockpit) { cockpit = ck; setCls(root, "cockpit", ck); layoutDue = true; last.tower = 0; if (!ck) zones = []; }
    if (now - last.ready >= RATE.ready) { last.ready = now; paintReady(); }
    if (A?.src) {
      if (now - last.strip >= RATE.strip) { last.strip = now; paintStrip(A); paintCam(A); }
      if (now - last.tower >= RATE.tower && prefs.widgets.tower.on && !small) { last.tower = now; paintTower(A); }
      if (now - last.driver >= RATE.driver) { last.driver = now; paintDriver(A); }
      if (now - last.tel >= RATE.tel && prefs.widgets.driver.on) { last.tel = now; paintTel(A); }
      if (now - last.pit >= RATE.pit) { last.pit = now; paintPit(A); }
    }
    setCls(root, "nosrc", !A?.src);
    if (cockpit && now - last.zones >= RATE.zones) { last.zones = now; const z = snapZones(api.keepClear()); if (JSON.stringify(z) !== JSON.stringify(zones)) { zones = z; layoutDue = true; } }
    if (layoutDue && !drag) layout();
    const ms = performance.now() - t0; cost.ms += ms; cost.frames++; if (ms > cost.worst) cost.worst = ms;
  }
  function setGame(on) {
    gameOn = !!on; root.hidden = gameOn;
    if (gameOn) { if (editing) setEditing(false); notes.style.left = notes.style.top = notes.style.bottom = ""; notes.hidden = false; notes.classList.add("game"); }
    else { notes.classList.remove("game"); applyPrefsToDom(); }
  }
  return {
    frame, setGame,
    // development (Map3D.spec): the HUD's state, its layout, its cost; the editor and presets from scripts
    dev: {
      state: () => ({ prefs, editing, small, cockpit, gameOn, zones, placed: Object.fromEntries(Object.entries(placed).filter(([, r]) => r).map(([k, r]) => [k, [r.x, r.y, r.w, r.h, r.moved ? "moved" : "", r.squeezed ? "squeezed" : ""]])),
        nodes: root.querySelectorAll("*").length + notes.querySelectorAll("*").length, ready: !ready.hidden ? ready.textContent : null }),
      cost: () => ({ msPerFrame: +(cost.ms / Math.max(1, cost.frames)).toFixed(4), worstMs: +cost.worst.toFixed(2), frames: cost.frames, layouts: cost.layouts, towerBuilds: cost.built }),
      resetCost: () => { cost.ms = cost.frames = cost.worst = cost.layouts = cost.built = 0; },
      edit: (on, keep = true) => setEditing(on, keep), preset: (p) => commit(applyPreset(prefs, p)), set: (id, patch) => commit(setWidget(prefs, id, patch)), reset: () => commit(resetWidgets(prefs)),
      layout: () => { layout(); return placed; },
    },
  };
}
