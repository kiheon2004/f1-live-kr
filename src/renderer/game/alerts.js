// Alerts at high speed (v0.50 request §5-6): the moments the player chose to be told about, each with an importance, a
// cooldown, and what to do with the clock – only show a notice, slow to 1×, or pause. Screen only: the engine is told
// nothing; the clock (runner.js) only ever goes DOWN on an alert, and a speed the player sets by hand wins (the same alert
// doesn't fire again within its cooldown, so the player's 30× after a notice isn't undone a second later). Pure (tested:
// test/game/alerts50.test.js). It replaces v0.49's two separate rules (auto-slow on events, the pit camera's slow-down).
//
// Rules (id → what triggers it, from what the player may know: the engine's events as they happen, the player's own cars
// in the render-time snapshot, the game's public forecast):
//   myPit     a car of mine is a lap from its planned stop (plan stint end − 1), or its stop is committed / entering
//   rain      the next hour's rain chance in the game's forecast moved by ≥ 25 points, or rain started
//   flag      SC / VSC / red flag deployed
//   damage    a car of mine: an incident (contact, mechanical, error with consequence), retired
//   fuel      a car of mine: fuel left below what its own burn so far needs to the finish (+ 1 lap margin)
//   tyre      a car of mine: tyre life under 15 %, or a tyre that doesn't suit the track's water (slick on ≥ 0.5 mm,
//             intermediate / wet on ≤ 0.03 mm – a player's plan is never changed by the AI, v0.52: the player is told)
//   battery   a car of mine: battery store empty
//   finish    the chequered flag
export const ACTIONS = ["off", "note", "slow", "pause"];
export const RULES = {
  myPit: { level: 2, cooldownMs: 60000, def: "slow" },
  rain: { level: 2, cooldownMs: 180000, def: "slow" },
  flag: { level: 3, cooldownMs: 30000, def: "slow" },
  damage: { level: 3, cooldownMs: 30000, def: "pause" },
  fuel: { level: 2, cooldownMs: 300000, def: "note" },
  tyre: { level: 2, cooldownMs: 180000, def: "slow" },
  battery: { level: 1, cooldownMs: 120000, def: "note" },
  finish: { level: 1, cooldownMs: 1e9, def: "slow" },
};
export const defaultAlertSettings = () => Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, r.def]));
const MINE_INC = new Set(["driver error", "contact", "mechanical", "retired"]);

// state kept between checks (per race): last fire time per rule+car, the last forecast value, the last lap seen per car
export const newAlertState = () => ({ last: {}, fc: null, lap: {}, burn: {} });

// one check: events since the last one (the engine's), the render-time snapshot, the forecast (or null), my car numbers,
// settings { rule: action }. Returns the alerts to raise now: [{ id, rule, level, action, car, text, t }]
export function checkAlerts(st, { events = [], snap = null, forecast = null, mine = [], settings = defaultAlertSettings(), t = 0 }) {
  const out = [], mineSet = new Set(mine.map(String));
  const fire = (rule, car, text, key = rule + ":" + (car ?? "")) => {
    const act = settings[rule] || "off"; if (act === "off") return;
    const R = RULES[rule], lt = st.last[key];
    if (lt != null && t - lt < R.cooldownMs) return;
    st.last[key] = t; out.push({ id: key + "@" + t, rule, level: R.level, action: act, car: car ?? null, text, t });
  };
  for (const e of events) {
    const cars = e.car ? [String(e.car)] : (e.cars || []).map(String), my = cars.find((n) => mineSet.has(n));
    if (e.type === "sc" || e.type === "vsc" || e.type === "red") fire("flag", null, e.type === "sc" ? "세이프티카" : e.type === "vsc" ? "VSC" : "적색기");
    else if (e.type === "rainStart") fire("rain", null, "비가 내리기 시작했어요");
    else if (e.type === "chequered") fire("finish", null, "체커기");
    else if (my && MINE_INC.has(e.type) && e.effect?.kind !== "moment") fire("damage", my, e.type === "retired" ? "리타이어" : e.type === "contact" ? "접촉" : e.type === "mechanical" ? "고장" : "실수");
    else if (my && (e.type === "pitCommitted" || e.type === "pitEntry")) fire("myPit", my, e.type === "pitEntry" ? "피트 진입" : "피트 진입 확정");
    else if (my && e.type === "ersEmpty") fire("battery", my, "배터리 소진");
    else if (my && e.type === "fuelEmpty") fire("fuel", my, "연료 소진");
  }
  if (snap) for (const c of snap.cars || []) {
    const n = String(c.num); if (!mineSet.has(n) || c.status !== "run") continue;
    // a lap from the planned stop
    const ns = (c.plan?.stints || []).find((x, k, a) => x.toLap > (c.lap || 0) && k < a.length - 1);
    if (ns && ns.toLap - c.lap === 1 && c.pit?.phase === "none" && st.lap[n] !== c.lap) fire("myPit", n, `계획한 피트까지 1랩 (${ns.toLap}랩)`, "myPit:win:" + n + ":" + ns.toLap);
    // tyre: nearly worn out, or wrong for the water now (the render-time picture's track water)
    const ty = c.tyre, w = snap.weather?.water;
    if (ty && Number.isFinite(ty.life) && ty.life < 0.15) fire("tyre", n, `타이어 수명 ${Math.round(ty.life * 100)}% 남음`, "tyre:life:" + n);
    else if (ty && Number.isFinite(w)) {
      const wetT = ty.compound === "INTERMEDIATE" || ty.compound === "WET";
      if (!wetT && w >= 0.5) fire("tyre", n, `젖은 노면(물 ${w.toFixed(1)} mm)에 슬릭`, "tyre:fit:" + n);
      else if (wetT && w <= 0.03 && (ty.age ?? 0) >= 2) fire("tyre", n, "마른 노면에 우천 타이어", "tyre:fit:" + n);
    }
    // fuel: this car's own burn per lap so far
    const b = st.burn[n] || (st.burn[n] = []);
    if (st.lap[n] !== c.lap && Number.isFinite(c.fuel)) { b.push({ lap: c.lap, fuel: c.fuel }); if (b.length > 6) b.shift(); }
    if (b.length >= 3 && Number.isFinite(snap.totalLaps)) {
      const per = (b[0].fuel - b[b.length - 1].fuel) / Math.max(1, b[b.length - 1].lap - b[0].lap), need = per * (snap.totalLaps - c.lap + 1);
      if (per > 0 && c.fuel < need) fire("fuel", n, `연료가 완주에 부족할 수 있어요 (추정: 남은 ${c.fuel.toFixed(1)} kg, 필요 약 ${need.toFixed(1)} kg)`);
    }
    st.lap[n] = c.lap;
  }
  if (forecast?.blocks?.length) {
    const p = Math.max(0, ...forecast.blocks.slice(0, 4).map((x) => x.pRain || 0));
    if (st.fc != null && Math.abs(p - st.fc) >= 0.25) fire("rain", null, `게임 예보: 1시간 내 비 확률 ${Math.round(st.fc * 100)}% → ${Math.round(p * 100)}%`);
    st.fc = p;
  }
  return out.sort((x, y) => y.level - x.level);
}
// the clock's answer to a set of alerts: the strongest action wins (pause > slow > note); { pause, slowTo } – never up
export function clockAction(alerts, speed) {
  let pause = false, slow = false;
  for (const a of alerts) { if (a.action === "pause") pause = true; else if (a.action === "slow") slow = true; }
  return { pause, slowTo: !pause && slow && speed > 1 ? 1 : null };
}
