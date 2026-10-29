// The player's orders as the screen tracks them (request §3, §13): an order handed to the engine is first only QUEUED
// (commands.js submit: it acts on the next step); the engine then APPLIES it or REFUSES it with a reason, in its command
// log. The screen shows exactly that – never "applied" for an order that is still in the queue. Pure (no DOM): tested.
//
// Where the state comes from: engine.commandStatus(race, id) when the engine has it (the lead's v0.49 command-status
// API); else the race's own command state (state.commands: queue = not yet applied, log = applied / refused + why).
export const ST_KO = { sending: "보내는 중", queued: "대기 중", applied: "적용됨", refused: "거절됨", rejected: "접수 거절", unknown: "확인 불가" };

// the engine's reasons (English, from engine.js / pit.js / commands.js) in Korean; an unknown one is shown as it is
const WHY = [
  [/^duplicate/, "같은 지시가 이미 접수됨"], [/^no id/, "지시 ID 없음"], [/^unknown type/, "알 수 없는 지시"],
  [/^no such car/, "그런 차량이 없음"], [/^not your car/, "내 팀 차량이 아님"], [/^not your team/, "내 팀이 아님"],
  [/^car fin/, "이미 완주한 차량"], [/^car dnf/, "리타이어한 차량"], [/^not running/, "주행 중이 아님"],
  [/^unknown pace mode/, "알 수 없는 페이스 모드"], [/^unknown energy mode/, "알 수 없는 에너지 모드"], [/^unknown policy/, "알 수 없는 팀 지시"],
  [/^no stints/, "스틴트 없음"], [/^no call to cancel/, "취소할 피트 요청이 없음"],
  [/^past the commit point/, "피트 진입 확정 지점을 지나 취소할 수 없음"], [/^already committed/, "이미 피트 진입이 확정됨"],
  [/^already in the pit lane/, "이미 피트레인 안"], [/^tyres changed/, "요청 타이어 변경"],
  [/^for this lap/, "이번 랩에 진입"], [/^too late for this lap/, "이번 랩은 늦음 – 다음 랩에 진입"],
  [/^not suspended/, "적색기 중단 상태가 아님"], [/^not stopped in the pit lane/, "피트레인에 정지해 있지 않음"],
  [/^after the 5-minute signal/, "5분 신호 이후 (타이어 교체 불가)"], [/^finished/, "경기 종료"],
  [/^compound .* not offered/, "이 경기에서 쓸 수 없는 타이어"], [/^compound must be a name/, "타이어 이름이 아님"], [/: no car$/, "차량 지정 없음"], [/^no car /, "그런 차량이 없음"],
  [/^no team /, "그런 팀이 없음"], [/^race finished/, "경기 종료"], [/^not an order/, "올바른 지시가 아님"], [/^internal error/, "엔진 내부 오류"],
  [/^plan ends at lap (\d+), before the finish \((\d+)\)/, "계획이 경기 끝 전에 끝남"], [/^plan: stint (\d+) ends at lap/, "스틴트 종료 랩 순서 오류"],
  [/^plan: stint \d+ has no compound/, "타이어 없는 스틴트"], [/^plan: stint \d+ end lap not a whole number/, "종료 랩이 정수가 아님"], [/^plan: no stints/, "스틴트 없음"],
];
export function whyKo(why) {
  if (why == null || why === "") return "";
  const s = String(why);
  for (const [re, ko] of WHY) if (re.test(s)) return ko;
  return s;
}

// one order's present state: { state, why, tEff }
export function orderState(race, id, engine = null) {
  if (engine?.commandStatus) {
    try {
      const r = engine.commandStatus(race, id);
      if (r && r.state) return { state: r.state === "accepted" ? "queued" : r.state, why: r.why ?? null, tEff: r.tEff ?? r.t ?? null, stage: r.stage ?? null };
    } catch { /* fall back to the state */ }
  }
  const cs = race?.state?.commands; if (!cs) return { state: "unknown", why: null, tEff: null };
  if (cs.queue.some((c) => c.id === id)) return { state: "queued", why: null, tEff: null };
  for (let i = cs.log.length - 1; i >= 0; i--) { const l = cs.log[i]; if (l.id === id) return { state: l.ok ? "applied" : "refused", why: l.why ?? null, tEff: l.tEff ?? null }; }
  return { state: "unknown", why: null, tEff: null };
}

// The screen's list of the player's orders. add() records what submit said; update() moves every unsettled order to its
// engine state (queued → applied / refused) – the settled ones are not looked at again.
export class OrderBook {
  constructor() { this.list = []; }
  add({ id, type, car = null, args = {}, text = "", t = 0 }, submitResult) {
    const r = submitResult || { ok: false, why: "응답 없음" };
    const o = { id, type, car: car == null ? null : String(car), args, text, t, state: r.ok ? "queued" : "rejected", why: r.ok ? null : r.why ?? null, tEff: null };
    this.list.push(o); if (this.list.length > 300) this.list.splice(0, this.list.length - 300);
    return o;
  }
  update(race, engine = null) {
    let changed = false;
    for (const o of this.list) {
      if (o.state !== "queued" && o.state !== "unknown") continue;
      const s = orderState(race, o.id, engine);
      if (s.state !== o.state && s.state !== "unknown") { Object.assign(o, s); changed = true; }
    }
    return changed;
  }
  // the latest order of a car (optionally of some types) – the card's "last order" line
  last(car, types = null) { for (let i = this.list.length - 1; i >= 0; i--) { const o = this.list[i]; if (o.car === String(car) && (!types || types.includes(o.type))) return o; } return null; }
  // an order still waiting for the engine (the button shows it as pending, not as the mode in force)
  pending(car, type) { return this.list.find((o) => o.car === String(car) && o.type === type && o.state === "queued") || null; }
  recent(n = 6) { return this.list.slice(-n); }
}
