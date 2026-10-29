// The strategy game's screens (request §3): globe home → 전략 게임 → season & team → garage → race → pre-race strategy →
// race → results → garage; 라이브 타이밍으로 leaves cleanly (the 3D view detached, the live / replay app as it was).
// Korean, plain. Every number shown comes from a prepared scenario (userData/game/scenarios via api.game – that race's own
// entry list, laps, grid, weather record) or from the engine (snapshots, its forecast, its results); a field the engine
// can't give yet is shown greyed "엔진 연결 전", never filled with a made-up value. Game results are labelled 게임 결과 and
// are kept in userData/game/results – never the session cache, never shown as a real record.
//
// Separation: this module touches the live app only through its public hooks – F1KRApp.homeOn / setHome (the home
// screen stays "on" underneath while the game is up, so the timing screen stays paused and hidden), Map3D.show / hide and
// Map3D.game.attach / detach, and the #map3d element, which is lent to the race screen and put back where it was.
import { createGameAdapter } from "./adapter3d.js";
import { GameRunner, SPEEDS, orderId } from "./runner.js";
import { weatherTruth, forecastAt } from "../../game/engine/weather.js";
import { TYPES as CMD_TYPES, PACE, ENERGY, TEAM_ORDER } from "../../game/engine/commands.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KO = window.KO;
const teamKo = (t) => KO?.TEAMS?.[t] || t || "?";
const PACE_KO = { attack: "공격", balanced: "균형", manage: "관리" };
const ENERGY_KO = { harvest: "회수", balanced: "균형", push: "사용", overtake: "추월 모드" };
const ORDER_KO = { free: "자유 경쟁", hold: "순위 유지", swap: "순위 교환" };
const STATUS_KO = { run: "주행 중", pit: "피트", fin: "완주", dnf: "리타이어", grid: "출발 전" };
const CMP_KO = { SOFT: "소프트", MEDIUM: "미디엄", HARD: "하드", INTERMEDIATE: "인터", WET: "웨트" };
const PENDING = `<span class="g-pending">엔진 연결 전</span>`;
// (what waits on the strategy estimator that comes with the AI work – the engine itself is connected)
const NOEST = `<span class="g-pending">전략 추정 API 전</span>`;
const fmtT = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ":" : ""}${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

const G = { on: false, step: "team", list: null, listErr: null, season: null, teamKey: null, sid: null, sc: null, seed: 1, plan: {}, engine: null, engineErr: null,
  run: null, adapter: null, raf: 0, dev: false, events: [], orders: [], result: null, mapHome: null, autoSlow: false, lastPaint: 0 };

// ---------- the engine (src/game/engine/engine.js: createRace / step / snapshot / command) ----------
// Looked for when the game opens; until it exists the race can't start (the button says so) – the dev stand-in
// (devsnap.js) is reachable only through GameDev.devRace, never from these screens.
async function loadEngine() {
  if (G.engine || G.engineErr === "checking") return;
  G.engineErr = "checking";
  try {
    const m = await import("../../game/engine/engine.js");
    if (["createRace", "step", "snapshot", "command", "events", "results"].every((k) => typeof m[k] === "function")) {
      G.engine = m; G.engineErr = null;
      // the strategy estimator (pre-race screen) – optional: without it the fields stay greyed
      try { G.strat = await import("../../game/engine/strategy.js"); } catch { G.strat = null; }
    }
    else G.engineErr = "engine.js에 createRace / step / snapshot / command / events / results가 아직 없어요";
  } catch { G.engineErr = "엔진 연결 전"; }
  paint();
}

// ---------- open / close ----------
async function open() {
  if (G.on) return;
  if (!window.F1KRApp?.homeOn) window.F1KRApp?.setHome(true);
  G.on = true; document.body.classList.add("game-on"); $("game").hidden = false;
  dispatchEvent(new CustomEvent("f1kr-game", { detail: { on: true } }));
  loadEngine();
  if (!G.list) { try { G.list = await window.api.game.scenarios(); } catch (e) { G.listErr = String(e.message || e); G.list = []; } }
  paint();
}
function close() {
  if (!G.on) return;
  stopRace();
  G.on = false; document.body.classList.remove("game-on"); $("game").hidden = true;
  dispatchEvent(new CustomEvent("f1kr-game", { detail: { on: false } }));
}
// (the app leaving its home screen while the game is up – the top bar's buttons: the game closes first, cleanly)
addEventListener("f1kr-home", (e) => { if (!e.detail.on && G.on) close(); });

// ---------- data from the scenarios ----------
const ok = () => (G.list || []).filter((s) => !s.error);
const seasons = () => [...new Set(ok().map((s) => s.season))].filter(Boolean).sort((a, b) => b - a);
// the season's teams as its prepared races list them (teamKey → name, colour, the drivers seen) – no team list in code
function teamsOf(season) {
  const m = new Map();
  for (const s of ok().filter((x) => x.season === season)) for (const e of s.entries) {
    if (!e.teamKey) continue;
    const t = m.get(e.teamKey) || { key: e.teamKey, name: e.team, colour: e.colour, drivers: new Map(), races: 0 };
    t.drivers.set(e.num, e); m.set(e.teamKey, t);
  }
  for (const t of m.values()) t.races = ok().filter((x) => x.season === season && x.entries.some((e) => e.teamKey === t.key)).length;
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const racesOf = (season, teamKey) => ok().filter((s) => s.season === season && s.entries.some((e) => e.teamKey === teamKey)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
const myCars = (sc) => (sc?.entries || []).filter((e) => e.teamKey === G.teamKey);

// ---------- painting ----------
function go(step) { G.step = step; paint(); }
function paint() {
  if (!G.on) return;
  const crumbs = [["team", "시즌·팀"], ["garage", "차고"], ["races", "경기"], ["prerace", "출발 전 전략"], ["race", "레이스"], ["results", "게임 결과"]];
  $("gameCrumbs").innerHTML = crumbs.map(([k, t]) => `<span class="${k === G.step ? "on" : ""}">${t}</span>`).join("<i>›</i>");
  $("gameEngine").textContent = G.engine ? "엔진 연결됨" : G.engineErr === "checking" ? "엔진 확인 중…" : `엔진: ${G.engineErr || "?"}`;
  $("gameEngine").classList.toggle("bad", !G.engine);
  const body = $("gameBody");
  body.dataset.step = G.step;
  if (G.step !== "race") body.innerHTML = ({ team: paintTeam, garage: paintGarage, races: paintRaces, prerace: paintPrerace, results: paintResults }[G.step] || (() => ""))();
}

function paintTeam() {
  if (!G.list) return `<p class="muted">시나리오 목록을 읽는 중…</p>`;
  if (!ok().length) return `<div class="g-card"><h3>준비된 경기가 없어요</h3><p class="muted">게임 경기는 앱 데이터 폴더의 <code>game/scenarios</code>에 있는 시나리오로만 열려요 (캐시의 실제 세션에서 오프라인으로 만든 것: <code>src/game/tools/build-scenario.mjs</code>). ${G.listErr ? "오류: " + esc(G.listErr) : ""}</p></div>`;
  const ss = seasons(); if (!ss.includes(G.season)) G.season = ss[0];
  const teams = teamsOf(G.season);
  return `<div class="g-row"><label>시즌 <select id="gSeason">${ss.map((y) => `<option ${y === G.season ? "selected" : ""}>${y}</option>`).join("")}</select></label>
    <span class="muted">팀과 드라이버는 그 시즌의 준비된 경기 참가 명단에서 읽어요.</span></div>
    <div class="g-grid">${teams.map((t) => `<button class="g-team ${t.key === G.teamKey ? "on" : ""}" data-team="${esc(t.key)}" style="--tc:${esc(t.colour || "#888")}"><b>${esc(teamKo(t.name))}</b>
      <span>${[...t.drivers.values()].map((d) => `#${esc(d.num)} ${esc(d.tla)}`).join(" · ")}</span><small>준비된 경기 ${t.races}개</small></button>`).join("")}</div>`;
}
// The garage – the game's main menu (request §3). A 2D panel, not the 3D garage: the 3D pit building exists only inside a
// circuit's real surroundings (facilities.js, loaded per venue with the map); a menu that belongs to no race has no
// circuit to stand in, so the team's two cars and drivers are shown plainly here and the 3D garages appear in the race.
function paintGarage() {
  const races = racesOf(G.season, G.teamKey), sc = races.find((r) => r.id === G.sid) || races[0];
  const t = teamsOf(G.season).find((x) => x.key === G.teamKey); if (!t) return paintTeam();
  const cars = sc ? sc.entries.filter((e) => e.teamKey === G.teamKey) : [...t.drivers.values()].slice(0, 2);
  return `<div class="g-garage" style="--tc:${esc(t.colour || "#888")}"><h2>${esc(teamKo(t.name))} <small>${G.season} 시즌 · 차고</small></h2>
    <div class="g-cars">${cars.map((e) => `<div class="g-car"><span class="g-num">${esc(e.num)}</span><b>${esc(e.name || e.tla)}</b><small>${esc(e.tla)}${sc ? ` · ${esc(sc.event)} 참가 명단` : ""}</small></div>`).join("")}</div>
    <div class="g-row"><button class="primary" data-go="races">경기 선택 →</button><button class="ghost" data-go="team">팀 바꾸기</button></div>
    <p class="muted">차량 개발·계약·재정은 이번 범위가 아니에요. 한 경기를 깊게 운영하는 게임이에요.</p></div>`;
}
function paintRaces() {
  const races = racesOf(G.season, G.teamKey);
  return `<div class="g-list">${races.map((r) => `<button class="g-race ${r.id === G.sid ? "on" : ""}" data-sid="${esc(r.id)}"><b>${esc(KO?.raceName?.(r.event) || r.event)}</b><span>${esc(r.date || "")} · ${esc(r.location || "")}</span>
    <small>${r.laps ?? "?"}랩 · 랩 ${r.lapLength ? (r.lapLength / 1000).toFixed(3) + " km" : "?"}${r.rain ? " · 기록상 비" : ""}</small></button>`).join("") || `<p class="muted">이 팀이 참가한 준비된 경기가 없어요.</p>`}</div>`;
}

// pre-race (request §3): what is known before the start – from the scenario and the engine's own forecast; the rest greyed
function paintPrerace() {
  const sc = G.sc; if (!sc) return `<p class="muted">시나리오를 읽는 중…</p>`;
  const m = sc.meta, ents = new Map(sc.entries.map((e) => [String(e.num), e])), mine = myCars(sc);
  const slots = [...(sc.grid?.slots || [])].sort((a, b) => a.pos - b.pos), pl = sc.grid?.pitLane || [];
  const fc = forecast(sc);
  const comps = sc.tyres?.compoundsSeen || [];
  const pit = sc.track?.pit;
  for (const e of mine) G.plan[e.num] = G.plan[e.num] || { start: comps.find((c) => /MEDIUM/.test(c)) || comps[0] || null };
  return `<div class="g-pre">
    <section class="g-card"><h3>${esc(KO?.raceName?.(m.event) || m.event)} <small>${esc(m.date)} · ${esc(m.location)}</small></h3>
      <p>${sc.race.laps}랩 · 랩 ${(sc.track.L / 1000).toFixed(3)} km · 총 ${((sc.race.laps * sc.track.L) / 1000).toFixed(1)} km · 시드 <input id="gSeed" type="number" min="1" max="999999" value="${G.seed}" class="g-seed"></p>
      <p class="muted">아래 예상치는 보장된 결과가 아니에요. 교통·날씨·사고에 따라 달라져요.</p></section>
    <section class="g-card"><h3>출발 순위 <small>시나리오(경기 전 공개된 출발 순서)</small></h3>
      <ol class="g-grid-list">${slots.map((s) => { const e = ents.get(String(s.num)); return `<li class="${e?.teamKey === G.teamKey ? "mine" : ""}"><b>${s.pos}</b> ${esc(e?.tla || s.num)} <span style="color:${esc(e?.colour || "#888")}">■</span></li>`; }).join("")}${pl.map((x) => `<li><b>PL</b> ${esc(ents.get(String(x.num))?.tla || x.num)}</li>`).join("")}</ol></section>
    <section class="g-card"><h3>예상 날씨 <small>엔진의 예보(시드별 오차 포함) – 실제 날씨와 다를 수 있어요</small></h3>${fc}</section>
    <section class="g-card g-wide"><h3>출발 타이어와 계획</h3>
      <table class="g-tbl"><tr><th>드라이버</th><th>출발 타이어</th><th>계획 스틴트·피트 윈도</th><th>예상 피트 손실</th></tr>
      ${mine.map((e) => `<tr><td><b>${esc(e.tla)}</b> #${esc(e.num)}</td><td><select data-start="${esc(e.num)}">${comps.map((c) => `<option value="${c}" ${G.plan[e.num].start === c ? "selected" : ""}>${CMP_KO[c] || c}</option>`).join("")}</select></td><td>${planCell(sc, e.num)}</td><td>${pitLossCell(e.num)}</td></tr>`).join("")}</table>
      <p class="muted">출발 타이어 목록: 이 경기 기록에 나온 컴파운드. ${pit?.stats?.passSecMedian ? `피트레인 통과 시간(이 경기 자료 실측 중앙값, 정차 포함): ${pit.stats.passSecMedian.toFixed(1)}초 – 엔진의 예상 손실이 아니에요.` : ""}</p></section>
    <section class="g-card"><h3>두 드라이버 전략 비교 · 규정·팀 내 피트 충돌 <small>팀의 추정치</small></h3>${compareCard(sc)}</section>
    <div class="g-row"><button class="primary" id="gStart" ${G.engine ? "" : "disabled"}>레이스 시작</button>${G.engine ? "" : `<span class="muted">${esc(G.engineErr || "엔진 연결 전")} – 레이스는 실제 엔진으로만 시작해요.</span>`}<button class="ghost" data-go="races">← 경기 선택</button></div>
  </div>`;
}
// the engine's forecast at the start – engine.forecast(race) on a race created for this seed (the teams' forecast,
// never the truth); before the engine existed: weather.js forecastAt directly (the same function the engine uses)
function forecast(sc) {
  try {
    if (G.engine) {
      const key = `${G.sid}|${G.seed}`;
      if (G.fcFor !== key) { G.fcFor = key; G.fc = G.engine.forecast(G.engine.createRace({ scenario: sc, seed: G.seed, userTeam: G.teamKey })); }
      const W0 = sc.weather?.cols, a0 = W0 ? W0.t.findIndex((t) => t >= 0) : -1;
      return `<p>기온 ${a0 >= 0 ? W0.air[a0] : "?"}°C · 노면 ${a0 >= 0 ? W0.track[a0] : "?"}°C (출발 무렵 기록)</p><div class="g-fc">${G.fc.blocks.map((b) => `<span title="${fmtT(b.from)}–${fmtT(b.to)}" style="--p:${b.pRain}"><i></i>${Math.round(b.pRain * 100)}%</span>`).join("")}</div>
        <p class="muted">엔진의 팀 예보: 15분 단위 비 확률(출발부터 2시간, 시드 ${G.seed}). 먼 시간일수록 오차가 커요.</p>`;
    }
    const W = sc.weather?.cols; if (!W) return PENDING;
    const rec = W.t.map((t, i) => ({ t: t * 1000, rain: W.rain[i], airT: W.air[i], trackT: W.track[i], wind: W.windSpeed[i] }));
    const truth = weatherTruth(rec, { mode: "real", seed: G.seed, minutes: 240 }), f = forecastAt(truth, 0, G.seed, { hours: 2 });
    const a = rec.find((r) => r.t >= 0) || rec[0];
    return `<p>기온 ${a?.airT ?? "?"}°C · 노면 ${a?.trackT ?? "?"}°C (출발 무렵 기록)</p><div class="g-fc">${f.blocks.map((b) => `<span title="${fmtT(b.from)}–${fmtT(b.to)}" style="--p:${b.pRain}"><i></i>${Math.round(b.pRain * 100)}%</span>`).join("")}</div>
      <p class="muted">15분 단위 비 확률(출발부터 2시간). 먼 시간일수록 오차가 커요.</p>`;
  } catch (e) { return `${PENDING} <span class="muted">${esc(e.message)}</span>`; }
}

// The expected pit loss from the ENGINE's own pit model (request §3): the same race twice (this seed, these plans) – once
// with this car called in at the start (it stops at the end of lap 1), once without – stepped until the car has finished
// lap 3; the difference is what the stop cost it there, entry/limiter/box/work/exit and the traffic it met included. One
// sample of one situation, not a guarantee (traffic, SC and weather change it) – said so on screen.
function pitLossCell(num) {
  if (!G.engine) return PENDING;
  const r = G.pitLoss?.[`${G.sid}|${G.seed}|${num}`];
  if (!r) return `<button class="ghost small" data-pitloss="${esc(num)}">엔진으로 계산</button>`;
  if (r.busy) return `<span class="muted">계산 중…</span>`;
  if (r.err) return `<span class="muted">계산 실패: ${esc(r.err)}</span>`;
  return `<b>${r.loss.toFixed(1)}초</b><br><small class="muted">엔진 피트 모델 · 1랩 끝 정차를 3랩까지 비교 · 교통 포함 · ${r.ms} ms</small>`;
}
// the plan the engine will race with for this car (engine.defaultPlan with the start tyre chosen here – plansOf); the
// pit window / strategy estimate comes with the AI work and stays marked until then
function planCell(sc, num) {
  if (!G.engine) return PENDING;
  const p = plansOf(sc)[num]; if (!p) return PENDING;
  const c = preEst(sc)?.cars.find((x) => String(x.num) === String(num)), b = c?.best;
  const plan = `${p.stints.map((x, i) => `${CMP_KO[x.compound] || x.compound}${i < p.stints.length - 1 ? ` ~${x.toLap}랩` : ""}`).join(" → ")}`;
  if (!b) return `${plan}<br><small class="muted">엔진 기본 계획 · 피트 윈도 추정 ${NOEST}</small>`;
  return `${plan}<br><small class="muted">팀 추정 ${b.stops}스톱 · 첫 피트 윈도 ${b.window ? `${b.window[0]}–${b.window[1]}랩` : "–"} · 예상 ${fmtRace(b.mean)} ± ${b.sd.toFixed(0)}초 (10–90%: ${fmtRace(b.p10)}–${fmtRace(b.p90)})</small>
    ${c.alternatives.length ? `<br><small class="muted">대안: ${c.alternatives.map((a) => `${a.stints.map((x) => `${(CMP_KO[x.compound] || x.compound)[0]}${x.laps}`).join("-")} (+${a.vsBest.toFixed(1)}초)`).join(" · ")}</small>` : ""}`;
}
const fmtRace = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// the strategy estimator's pre-race view for this race/seed/team/start tyres (strategy.js preRaceStrategy on a race created
// for this seed – nothing stepped; ≈ 0.1 s)
function preEst(sc) {
  if (!G.engine || !G.strat?.preRaceStrategy) return null;
  const start = Object.fromEntries(myCars(sc).map((e) => [e.num, G.plan[e.num]?.start]).filter((x) => x[1]));
  const key = `${G.sid}|${G.seed}|${G.teamKey}|${JSON.stringify(start)}`;
  if (G.preFor !== key) { G.preFor = key; try { G.pre = G.strat.preRaceStrategy(G.engine.createRace({ scenario: sc, seed: G.seed, userTeam: G.teamKey }), G.teamKey, { start }); G.preErr = null; } catch (e) { G.pre = null; G.preErr = e.message; } }
  return G.pre;
}
function compareCard(sc) {
  if (!G.engine) return `<p>${PENDING}</p>`;
  const P = preEst(sc); if (!P) return `<p>${NOEST} <span class="muted">${esc(G.preErr || "")}</span></p>`;
  const [a, b] = P.cars;
  return `<p class="muted">${esc(P.label)}</p>
    ${a && b && a.best && b.best ? `<p>${esc(a.tla)} ${a.best.stops}스톱 vs ${esc(b.tla)} ${b.best.stops}스톱 · 예상 차이 ${Math.abs(P.compare.diffS).toFixed(1)}초 (${P.compare.same ? "같은 계획" : "다른 계획"})</p>` : ""}
    <p>예상 피트 손실: ${esc(P.pitLoss.text)}</p>
    <p>규정: ${esc(P.rule.text)} · 사용 가능 건조 타이어 ${P.rule.compounds.map((c) => CMP_KO[c] || c).join("/")} <small class="muted">(${esc(P.rule.compoundSource)})</small></p>
    <p>${P.conflicts.length ? P.conflicts.map((c) => `⚠ ${esc(c.text)}`).join("<br>") : "팀 내 동시 피트 예상 없음"}</p>
    <p class="muted">${esc(P.weather.text)} · ${esc(P.weather.uncertainty)}</p>`;
}
async function computePitLoss(num) {
  const E = G.engine, sc = G.sc, key = `${G.sid}|${G.seed}|${num}`; if (!E || !sc) return;
  (G.pitLoss || (G.pitLoss = {}))[key] = { busy: true }; paint();
  try {
    const t0 = performance.now(), plans = plansOf(sc), cmp = plans[num]?.stints[1]?.compound || plans[num]?.stints[0]?.compound || "HARD";
    const mk = () => E.createRace({ scenario: sc, seed: G.seed, userTeam: G.teamKey, plans });
    const A = mk(), B = mk();
    const ok = E.command(A, { id: "pitloss-" + num, type: "pit", car: String(num), team: G.teamKey, args: { compound: cmp }, by: "player" });
    if (!ok.ok) throw new Error(ok.why || "pit refused");
    const done = (R) => { const c = R.state.cars.find((x) => x.num === String(num)); return c.lap >= 3 || c.status === "dnf" || R.state.finished; };
    const tAt = {}, run = (R, k) => new Promise((res) => { const go = () => { for (let i = 0; i < 2000 && !done(R); i++) E.step(R); if (done(R)) { tAt[k] = R.state.t; res(); } else setTimeout(go, 0); }; go(); });
    await run(A, "a"); await run(B, "b");
    const ca = A.state.cars.find((x) => x.num === String(num));
    if (!ca.pit.stops) throw new Error("the car didn't stop in 3 laps");
    G.pitLoss[key] = { loss: (tAt.a - tAt.b) / 1000, ms: Math.round(performance.now() - t0), steps: (tAt.a + tAt.b) / 50 };
  } catch (e) { G.pitLoss[key] = { err: String(e.message || e) }; }
  paint();
}

// ---------- the race ----------
async function startRace({ dev = false, devOpts = {} } = {}) {
  const sc = G.sc; if (!sc) return;
  let race, engine;
  if (dev) {
    const D = await import("./devsnap.js");
    race = D.createDevRace(sc, devOpts); engine = { step: D.devStep, snapshot: D.devSnapshot, command: () => ({ ok: false, why: "개발용 스냅샷: 명령을 받지 않아요" }) };
  } else {
    const E = G.engine; if (!E) return;
    // every team on the team AI (ai.js); the player's two cars start on the plans shown here and the AI keeps their
    // defaults (pace/energy/plan) only until the player orders a car
    G.runOpts = { seed: G.seed, userTeam: G.teamKey, weatherMode: "real", plans: plansOf(sc), ai: true };   // (kept with the result: run.mjs --replay rebuilds the race from them + the command log)
    race = E.createRace({ scenario: sc, ...G.runOpts });
    engine = { step: E.step, snapshot: E.snapshot, command: E.command, events: E.events, results: E.results };
  }
  G.dev = dev; G.events = []; G.orders = []; G.result = null;
  G.run = new GameRunner(race, engine, { autoSlow: G.autoSlow ? autoSlowRule() : null });
  G.run.listeners.add((ev) => { G.events.push(...ev); if (G.events.length > 400) G.events.splice(0, G.events.length - 400); });
  G.adapter = createGameAdapter({ scenario: sc, source: G.run, label: dev ? "개발용" : "게임" });
  G.adapter.ctx.setFocus(myCars(sc)[0]?.num || null);
  go("race");
  buildRaceDom();
  lendMap();
  window.Map3D?.game.attach(G.adapter);
  G.run.setSpeed(1);
  loop();
}
// the engine's events that may slow the clock (screen only; the engine is told nothing) – names as the engine logs them
// (race control's and the weather's – SC/VSC/red/rain/incidents, as the engine will log them –, the chequered flag, a car
// running out of fuel or battery, and the player's own cars committing to / entering the pit lane)
const AUTO_SLOW = new Set(["sc", "vsc", "red", "rainStart", "incident", "chequered", "fuelEmpty", "ersEmpty"]);
const MINE_INC = new Set(["driver error", "contact", "mechanical", "retired"]);   // (my cars' incidents slow the run too)
const MINE_SLOW = new Set(["pitCommitted", "pitEntry"]);
const autoSlowRule = () => ({ to: 1, match: (e) => AUTO_SLOW.has(e.type) || ((MINE_SLOW.has(e.type) || (MINE_INC.has(e.type) && e.effect?.kind !== "moment")) && myCars(G.sc).some((x) => String(x.num) === String(e.car) || (e.cars || []).map(String).includes(String(x.num)))) });
// the player's plans for the engine: its default plan for each of the team's cars with the start tyre chosen here
function plansOf(sc) {
  const out = {}, P = preEst(sc);
  for (const e of myCars(sc)) {
    const b = P?.cars.find((x) => String(x.num) === String(e.num))?.best;
    if (b) { out[e.num] = { stints: b.plan.map((x) => ({ ...x })), by: "player" }; continue; }
    const base = G.engine.defaultPlan ? G.engine.defaultPlan(sc, e.num) : { stints: [{ compound: G.plan[e.num]?.start || "MEDIUM", toLap: sc.race.laps }] };
    const st = base.stints.map((x) => ({ ...x }));
    if (G.plan[e.num]?.start) st[0].compound = G.plan[e.num].start;
    out[e.num] = { stints: st, by: "player" };
  }
  return out;
}
function loop() {
  cancelAnimationFrame(G.raf);
  const tick = () => {
    if (!G.run) return;
    G.run.frame();
    const now = performance.now();
    if (now - G.lastPaint > 200) { G.lastPaint = now; paintRace(); }
    const snap = G.run.latest();
    if (G.run.race.state.finished && !G.result) finishRace();   // (the chequered flag is the leader's: the rest still run)
    G.raf = requestAnimationFrame(tick);
  };
  G.raf = requestAnimationFrame(tick);
}
function stopRace() {
  cancelAnimationFrame(G.raf); G.raf = 0;
  if (G.adapter) { window.Map3D?.game.detach(); returnMap(); }
  G.run = null; G.adapter = null;
}
// #map3d lent to the race screen and put back exactly where it was (its hidden state too)
function lendMap() {
  const m = $("map3d"); if (!m || G.mapHome) return;
  G.mapHome = { parent: m.parentNode, next: m.nextSibling, hidden: m.hidden };
  $("gameView").appendChild(m); m.hidden = false;
  window.Map3D?.show();
}
function returnMap() {
  const m = $("map3d"), h = G.mapHome; if (!m || !h) return;
  h.parent.insertBefore(m, h.next); m.hidden = h.hidden; G.mapHome = null;
  // (the home screen is still up underneath: the view stops drawing; leaving home later shows it as the app decides)
  if (window.F1KRApp?.homeOn) window.Map3D?.hide();
}
function buildRaceDom() {
  $("gameBody").innerHTML = `<div class="g-race-screen">
    <div class="g-view" id="gameView"></div>
    <aside class="g-side"><div class="g-tower" id="gTower"></div><div class="g-ctl" id="gCtl"></div></aside>
    <div class="g-bar"><div class="g-speeds" id="gSpeeds">${SPEEDS.map((x) => `<button data-speed="${x}">${x ? x + "×" : "❚❚"}</button>`).join("")}</div>
      <span class="g-clock" id="gClock"></span><label class="g-auto"><input type="checkbox" id="gAuto" ${G.autoSlow ? "checked" : ""}> 중요 상황 자동 감속</label>
      <button class="ghost small" id="gQuit">경기 중단 → 차고</button></div>
    <div class="g-events" id="gEvents"></div></div>`;
}
function paintRace() {
  const R = G.run; if (!R || G.step !== "race") return;
  const snap = R.latest(), sc = G.sc, ents = new Map(sc.entries.map((e) => [String(e.num), e]));
  const cars = [...snap.cars].sort((a, b) => a.pos - b.pos);
  const tw = cars.map((c) => { const e = ents.get(String(c.num)), mine = e?.teamKey === G.teamKey;
    return `<tr class="${mine ? "mine" : ""} ${c.num === G.adapter?.ctx.focus ? "focus" : ""}" data-num="${esc(c.num)}"><td>${c.pos}</td><td><i style="background:${esc(e?.colour || "#888")}"></i>${esc(e?.tla || c.num)}</td>
      <td>${c.pos === 1 ? "선두" : gapTxt(c, cars[0])}</td><td>${c.status === "pit" ? "피트" : c.status === "dnf" ? "리타이어" : c.status === "fin" ? "완주" : ""}</td>
      <td class="cmp cmp-${esc(c.tyre?.compound || "")}">${esc((c.tyre?.compound || "?")[0])}</td><td>${c.tyre?.age ?? ""}</td></tr>`; }).join("");
  $("gTower").innerHTML = `<div class="g-tower-h">랩 ${snap.leaderLap}/${snap.totalLaps ?? "?"} · ${flagKo(snap.flag)}${snap.dev ? ` · <b class="g-dev">${esc(snap.dev.label)}</b>` : ""}</div>
    <table class="g-tbl g-tw"><tr><th>#</th><th>드라이버</th><th>간격</th><th></th><th colspan="2">타이어</th></tr>${tw}</table>`;
  if (!$("gCtl").dataset.built) buildControls();
  paintControls(snap);
  const ach = R.paused ? 0 : R.achieved;
  $("gClock").innerHTML = `경기 시각 ${fmtT(snap.t)} · 요청 ${R.paused ? "일시정지" : R.speed + "×"} · <b class="${R.behind ? "bad" : ""}">실제 ${ach.toFixed(1)}×</b>${R.behind ? " (계산이 따라가지 못해 실제 배속으로 진행)" : ""}${R.slowNote ? ` · 자동 감속: ${esc(R.slowNote.why)}` : ""}`;
  document.querySelectorAll("#gSpeeds [data-speed]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.speed === (R.paused ? 0 : R.speed))));
  $("gEvents").innerHTML = (G.orders.slice(-4).map((o) => `<p class="${o.ok ? "" : "bad"}">${fmtT(o.t)} 지시 ${esc(o.text)} → ${o.ok ? "접수" : "거부: " + esc(o.why || "")}</p>`).join("") +
    G.events.slice(-8).reverse().map(evLine).join("")) || `<p class="muted">사건 없음${snap.dev ? " (개발용 스냅샷은 사건을 만들지 않아요)" : ""}</p>`;
}
// the gap to the leader as the engine gives it (s, same lap only), else laps down
const gapTxt = (c, lead) => { const g = c.gap && typeof c.gap === "object" ? c.gap.leader : c.gap; if (Number.isFinite(g)) return "+" + g.toFixed(1); return lead && c.lap < lead.lap ? `+${lead.lap - c.lap}랩` : ""; };
const flagKo = (f) => ({ grid: "출발 전", green: "녹색", yellow: "황색", vsc: "VSC", sc: "세이프티카", red: "적색기", chequered: "체커기" }[f] || f || "");
// per-driver orders (pace, energy, box with a compound, cancel) and the team order – each an engine command with its own id
function buildControls() {
  const el = $("gCtl"), comps = G.sc.tyres?.compoundsSeen || [];
  el.dataset.built = "1";
  el.innerHTML = myCars(G.sc).map((e) => `<div class="g-drv" data-car="${esc(e.num)}"><h4>${esc(e.tla)} <small>#${esc(e.num)}</small> <span class="g-st" data-st="${esc(e.num)}"></span></h4>
    <div class="g-btns">페이스 ${PACE.map((p) => `<button data-cmd="pace" data-v="${p}">${PACE_KO[p]}</button>`).join("")}</div>
    <div class="g-btns">에너지 ${ENERGY.map((p) => `<button data-cmd="energy" data-v="${p}">${ENERGY_KO[p]}</button>`).join("")}</div>
    <div class="g-btns">피트 <select data-cmp>${comps.map((c) => `<option value="${c}">${CMP_KO[c] || c}</option>`).join("")}</select><button data-cmd="pit">박스</button><button data-cmd="pitCancel">취소</button></div></div>`).join("") +
    `<div class="g-btns g-team-order">팀 지시 ${TEAM_ORDER.map((p) => `<button data-cmd="teamOrder" data-v="${p}">${ORDER_KO[p]}</button>`).join("")}</div>`;
}
function paintControls(snap) {
  for (const e of myCars(G.sc)) {
    const c = snap.cars.find((x) => x.num === String(e.num)), st = document.querySelector(`[data-st="${CSS.escape(String(e.num))}"]`); if (!st || !c) continue;
    st.textContent = `P${c.pos} · ${CMP_KO[c.tyre?.compound] || c.tyre?.compound || "?"} ${c.tyre?.age ?? 0}랩${c.energy?.soc != null ? ` · 배터리 ${Math.round(c.energy.soc * 100)}%` : ""}${c.pit?.phase && c.pit.phase !== "none" ? ` · 피트 ${c.pit.phase}` : ""}${c.energy?.mode ? ` · ${ENERGY_KO[c.energy.mode] || c.energy.mode}` : ""}`;
  }
}
function sendOrder(type, car, args, text) {
  if (!G.run || !CMD_TYPES.includes(type)) return;
  const cmd = { id: orderId(type), type, car: car ?? null, team: G.teamKey, args, by: "player" };
  const r = G.run.command(cmd) || { ok: false, why: "응답 없음" };
  G.orders.push({ t: G.run.race.state.t, text, ok: !!r.ok, why: r.why || null, id: cmd.id });
  paintRace();
}
function finishRace() {
  const R = G.run, snap = R.latest();
  const res = R.engine.results ? R.engine.results(R.race) : null;
  const classification = res?.rows ? res.rows.map((r) => ({ pos: r.pos, num: r.num, tla: r.tla, team: r.team, laps: r.laps, gap: r.gap, lapsDown: r.lapsDown, status: r.status, stops: r.stops }))
    : [...snap.cars].sort((a, b) => a.pos - b.pos).map((c) => ({ pos: c.pos, num: c.num, tla: c.tla, team: c.team, laps: c.lap, status: c.status }));
  const accounts = res?.rows ? { cars: Object.fromEntries(res.rows.filter((r) => myCars(G.sc).some((e) => String(e.num) === String(r.num)) || (r.pos && r.pos <= 10)).map((r) => [r.tla || r.num, r.acct || {}])), by: res.by || null } : null;
  G.result = { dev: G.dev, scenarioId: G.sid, seed: G.seed, team: G.teamKey, t: snap.t, engine: G.dev ? null : G.engine?.ENGINE_VERSION || null, classification,
    accounts, events: (R.engine.events ? R.engine.events(R.race, -1) : G.events).slice(-300), orders: G.orders, commandLog: R.race.state.commands?.log || null,
    runOpts: G.dev ? null : G.runOpts, stints: res?.rows ? Object.fromEntries(res.rows.map((r) => [r.tla || r.num, r.stints || null])) : null, points: res?.rows ? Object.fromEntries(res.rows.map((r) => [r.tla || r.num, r.points ?? null])) : null };
  if (!G.dev) window.api.game.saveResult(G.sid, { kind: "game-result", label: "게임 결과 (실제 기록 아님)", ...G.result }).then((r) => { G.result.saved = r?.file || null; paint(); }, (e) => { G.result.saveErr = String(e.message || e); paint(); });
  stopRace();
  go("results");
}
// one event line: race control's / the stewards' messages as they are; an incident's structured effect in words
const EV_KO = { "driver error": "실수", contact: "접촉", mechanical: "고장", rc: "레이스 컨트롤", stewards: "스튜어드", retired: "리타이어", sc: "세이프티카", vsc: "VSC", red: "적색기", green: "녹색기", chequered: "체커기" };
const effText = (x) => x == null ? "" : typeof x === "string" ? x : [x.kind, x.outcome && x.outcome !== "none" ? x.outcome : x.outcome === "none" ? "no damage" : "", x.out ? `out (${x.out})` : "", x.stoppedS ? `${x.stoppedS}s stopped` : "", x.damage ? "damage" : "", x.fault ? `fault ${x.fault}` : ""].filter(Boolean).join(" · ");
const evLine = (e) => { const cars = e.car ? [e.car] : e.cars || []; return `<p>${fmtT(e.t ?? 0)}${e.lap ? ` L${e.lap}` : ""} ${esc(EV_KO[e.type] || e.type)}${cars.length ? " " + cars.map((n) => "#" + esc(n)).join(" ") : ""}${e.effect ? ` · ${esc(effText(e.effect))}` : e.cause && typeof e.cause === "string" ? ` · ${esc(e.cause)}` : ""}</p>`; };
function paintResults() {
  const r = G.result; if (!r) return `<p class="muted">결과가 없어요.</p>`;
  return `<div class="g-card"><h3>게임 결과 <small>엔진 계산 결과 · 실제 경기 기록이 아니에요${r.dev ? " · 개발용 스냅샷(엔진 아님)" : ""}</small></h3>
    <table class="g-tbl"><tr><th>순위</th><th>드라이버</th><th>팀</th><th>랩</th><th>차이</th><th>정차</th><th>점수</th><th>상태</th></tr>${r.classification.map((c) => `<tr class="${myCars(G.sc).some((e) => String(e.num) === String(c.num)) ? "mine" : ""}"><td>${c.pos ?? ""}</td><td>${esc(c.tla || c.num)}</td><td>${esc(teamKo(c.team))}</td><td>${c.laps}</td><td>${c.pos === 1 ? "" : Number.isFinite(c.gap) ? "+" + c.gap.toFixed(3) + "s" : c.lapsDown ? `+${c.lapsDown}랩` : ""}</td><td>${c.stops ?? ""}</td><td>${r.points?.[c.tla || c.num] || ""}</td><td>${esc(STATUS_KO[c.status] || c.status)}</td></tr>`).join("")}</table>
    ${r.stints ? `<p class="muted">내 차 스틴트: ${myCars(G.sc).map((e) => { const st = r.stints[e.tla] || []; return `${esc(e.tla)} ${st.map((x) => `${esc(x.compound)} ${x.laps}랩`).join(" → ") || "–"}`; }).join(" · ")}</p>` : ""}</div>
    <div class="g-card"><h3>결과의 원인 <small>엔진이 따로 셀 수 있는 손실만 – 내 차와 10위 안</small></h3>${r.accounts ? accountsHtml(r.accounts) : PENDING}</div>
    <div class="g-card"><h3>사건</h3>${r.events.length ? r.events.slice(-40).map(evLine).join("") : `<p class="muted">기록된 사건 없음</p>`}</div>
    <p class="muted">${r.saved ? `저장됨: ${esc(r.saved)}` : r.saveErr ? `저장 실패: ${esc(r.saveErr)}` : r.dev ? "개발용 결과는 저장하지 않아요." : "저장 중…"}</p>
    <div class="g-row"><button class="primary" data-go="garage">차고로</button></div>`;
}
// the engine's accounts as it gives them (per car: { traffic, pit, tyre, energy, penalty, other, approx: [...] } s)
function accountsHtml(a) {
  const rows = Object.entries(a.cars || a).filter(([, v]) => v && typeof v === "object");
  const all = ["traffic", "pit", "pitQueue", "tyre", "energy", "penalty", "other"], have = new Set(rows.flatMap(([, v]) => Object.keys(v))), keys = all.filter((k) => have.has(k)), ko = { traffic: "교통", pit: "피트 손실", pitQueue: "그중 피트 대기", tyre: "타이어", energy: "에너지·페이스", penalty: "페널티", other: "기타(분리 불가)" };
  return `<table class="g-tbl"><tr><th>차</th>${keys.map((k) => `<th>${ko[k]}</th>`).join("")}</tr>${rows.map(([n, v]) => `<tr><td>${esc(n)}</td>${keys.map((k) => `<td>${Number.isFinite(v[k]) ? v[k].toFixed(1) + "s" + ((v.approx || []).includes(k) ? " ≈" : "") : "–"}</td>`).join("")}</tr>`).join("")}</table><p class="muted">엔진이 지금 계산하는 항목만 보여요(${keys.map((k) => ko[k]).join("·") || "없음"}) · ≈: 엔진이 근사로 표시한 항목 · 초 · 타이어 관리·에너지 운용으로 잃거나 얻은 시간은 교통·피트처럼 깨끗하게 떼어낼 수 없어서 따로 숫자로 보여주지 않아요(스틴트와 사건 기록으로 보세요)</p>`;
}

// ---------- events ----------
$("homeGameBtn")?.addEventListener("click", open);
$("gameExit").addEventListener("click", close);
$("game").addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "gSeason") { G.season = +t.value; G.teamKey = null; paint(); }
  else if (t.id === "gSeed") { G.seed = Math.max(1, Math.min(999999, Math.round(+t.value) || 1)); paint(); }
  else if (t.dataset.start) { G.plan[t.dataset.start] = { ...(G.plan[t.dataset.start] || {}), start: t.value }; }
  else if (t.id === "gAuto") { G.autoSlow = t.checked; if (G.run) G.run.autoSlow = G.autoSlow ? autoSlowRule() : null; }
});
$("game").addEventListener("click", async (e) => {
  const b = e.target.closest("button, tr[data-num]"); if (!b) return;
  if (b.dataset.team) { G.teamKey = b.dataset.team; G.sid = null; G.sc = null; G.plan = {}; go("garage"); return; }
  if (b.dataset.go) { go(b.dataset.go); return; }
  if (b.dataset.sid) { G.sid = b.dataset.sid; G.sc = null; G.plan = {}; go("prerace"); try { G.sc = await window.api.game.scenario(G.sid); } catch (err) { G.sc = null; G.listErr = String(err.message || err); } paint(); return; }
  if (b.id === "gStart") { startRace(); return; }
  if (b.dataset.pitloss) { computePitLoss(b.dataset.pitloss); return; }
  if (b.id === "gQuit") { stopRace(); go("garage"); return; }
  if (b.dataset.speed != null) { G.run?.setSpeed(+b.dataset.speed); if (G.run) G.run.slowNote = null; paintRace(); return; }
  if (b.dataset.num) { G.adapter?.ctx.setFocus(b.dataset.num); paintRace(); return; }
  if (b.dataset.cmd) {
    const car = b.closest("[data-car]")?.dataset.car ?? null, type = b.dataset.cmd;
    if (type === "pit") { const cmp = b.parentNode.querySelector("[data-cmp]")?.value || null; sendOrder("pit", car, { compound: cmp }, `#${car} 박스 (${CMP_KO[cmp] || cmp})`); }
    else if (type === "pitCancel") sendOrder("pitCancel", car, {}, `#${car} 피트 취소`);
    else if (type === "teamOrder") sendOrder("teamOrder", null, { policy: b.dataset.v }, `팀 지시 ${ORDER_KO[b.dataset.v]}`);
    else sendOrder(type, car, { mode: b.dataset.v }, `#${car} ${type === "pace" ? "페이스" : "에너지"} ${(type === "pace" ? PACE_KO : ENERGY_KO)[b.dataset.v]}`);
  }
});

// development hooks (console / screenshot harness): the dev race is reachable only from here – never from the screens
window.GameDev = {
  open, close, state: () => JSON.stringify({ on: G.on, step: G.step, season: G.season, team: G.teamKey, sid: G.sid, engine: !!G.engine, engineErr: G.engineErr, scenarios: (G.list || []).length,
    run: G.run ? { t: G.run.race.state.t, renderT: G.run.renderT, speed: G.run.speed, paused: G.run.paused, achieved: +G.run.achieved.toFixed(2), behind: G.run.behind, costs: G.run.costs() } : null, result: !!G.result }),
  pick: async (season, teamKey, sid) => { await open(); G.season = season; G.teamKey = teamKey; G.sid = sid; G.sc = await window.api.game.scenario(sid); go("prerace"); return "ok"; },
  go, devRace: async (opts = {}) => { if (!G.sc) return "pick a scenario first"; await startRace({ dev: true, devOpts: opts }); return "dev race (개발용 스냅샷)"; },
  speed: (x) => { G.run?.setSpeed(x); return String(x); },
  focus: (n) => { G.adapter?.ctx.setFocus(String(n)); return String(n); },
  finish: () => { if (G.run) finishRace(); return "finished"; },
  get runner() { return G.run; },
  // does a module Worker run from this file:// page and import the engine? its cost vs the same work here; a snapshot's
  // round trip (structured clone both ways) – the numbers behind "renderer thread or Worker" (reports/ui3d.md)
  workerProbe: (n = 200) => new Promise((resolve) => {
    const out = { ok: false }, done = (x) => { try { w?.terminate(); } catch {} resolve(JSON.stringify({ ...out, ...x })); };
    let w = null; const t0 = performance.now();
    try { w = new Worker(new URL("./workerprobe.js", import.meta.url), { type: "module" }); } catch (e) { return done({ error: "new Worker: " + (e.message || e) }); }
    w.onerror = (e) => done({ error: "worker error: " + (e.message || "?") });
    const snap = G.run?.latest() || { t: 0, cars: Array.from({ length: 22 }, (_, i) => ({ num: String(i + 1), teamKey: "T" + (i >> 1), team: "Team", tla: "AAA", color: "#fff", status: "run", pos: i + 1, lap: 10, where: "lap", s: i * 100.5, u: null, d: 0.5, v: 70.1, a: 0, steer: 0.01, wheelDist: 1e5, aero: { open: 0, front: 0 }, drs: false, overtake: false, tyre: { compound: "MEDIUM", wear: 0.2, Ts: 95, Tc: 100, age: 10 }, energy: { soc: 0.5, mode: "balanced", deployKw: 120 }, fuel: 50, pit: { phase: "none", u: null, workT0: null, workT1: null, err: null } })) };
    let k = 0, rt0 = 0; const rtts = [];
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.kind === "hello") { out.ok = true; out.helloMs = +(performance.now() - t0).toFixed(1); w.postMessage({ kind: "bench" }); }
      else if (m.kind === "bench") {
        out.workerBenchMs = +m.ms.toFixed(1);
        const [{ Streams }, Wm] = await Promise.all([import("../../game/engine/rng.js"), import("../../game/engine/weather.js")]);
        const b0 = performance.now(), S = new Streams(7); let acc = 0;
        for (let i = 0; i < 200000; i++) acc += S.get("driver:" + (i % 22)).normal();
        const W = Wm.weatherTruth([{ t: 0, rain: 0, airT: 20, trackT: 30, wind: 2 }, { t: 3.6e6, rain: 1, airT: 18, trackT: 22, wind: 4 }], { seed: 3 });
        for (let j = 0; j < 48; j++) acc += Wm.forecastAt(W, j * 300000, 3).blocks.length;
        out.mainBenchMs = +(performance.now() - b0).toFixed(1); out.sameResult = acc === m.acc;
        out.snapCars = snap.cars.length; out.snapBytes = JSON.stringify(snap).length;
        rt0 = performance.now(); w.postMessage({ kind: "echo", snap });
      } else if (m.kind === "echo") {
        rtts.push(performance.now() - rt0);
        if (++k < n) { rt0 = performance.now(); w.postMessage({ kind: "echo", snap }); return; }
        rtts.sort((a, b) => a - b);
        done({ echoN: n, rttMedianMs: +rtts[n >> 1].toFixed(3), rttP95Ms: +rtts[Math.floor(n * 0.95)].toFixed(3) });
      }
    };
    w.postMessage({ kind: "hello" });
    setTimeout(() => done({ error: out.ok ? "timeout during the probe" : "no answer from the worker in 15 s" }), 15000);
  }),
};
