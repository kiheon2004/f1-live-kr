// The player's (and the AI's) orders to the engine (DESIGN §1, request §1, §10; v0.49 §3).
// An order is taken with an id; the same id again is ignored (a double click, a key held at 30×, a re-sent message: one
// effect). Taking it (submit) and applying it are two steps:
//   submit  – the order's SHAPE is checked here (type, the car / team it needs, its arguments: known modes, a compound
//             name, finite whole-number laps in order) and the engine checks who may give it to what (engine.js
//             validateOrder: the car / team exists, belongs to the one giving the order, the compound is offered at this
//             event). A refused order is recorded with its reason (stage "submit") and never queued.
//   apply   – at the next step's sim time, against the race state then (a pit call past the commit point, a car that has
//             retired or finished, the race over…): applied or refused, with the reason (stage "apply"). An order that
//             throws is refused ("internal error") – one bad order never stops the race.
// Who gives an order is the CALLER's identity, not a field of the order: engine.command() is the player's door (its `by`
// is always "player", whatever the order says), the team AI submits through commandAs(race, cmd, "ai:<team>").
// status(cs, id) → { state: "queued" | "applied" | "refused" | "unknown", why, stage, tAt, tEff } – what the screens show
// (a queued order is not an applied one).
export const TYPES = ["pace", "energy", "pit", "pitCancel", "plan", "teamOrder"];
export const PACE = ["attack", "balanced", "manage"];
export const ENERGY = ["harvest", "balanced", "push", "overtake"];
export const TEAM_ORDER = ["free", "hold", "swap"];
export const NEEDS_CAR = new Set(["pace", "energy", "pit", "pitCancel", "plan"]);

export function newCommandState() { return { seen: {}, queue: [], log: [] }; }

const isActor = (a) => a === "player" || /^ai:.+$/.test(String(a || ""));   // (team keys have spaces: "ai:Red Bull Racing")
// the order's shape: { ok } or { ok: false, why } (nothing about the race – engine.validateOrder knows the race)
export function shape(cmd) {
  if (!cmd || typeof cmd !== "object") return { ok: false, why: "not an order" };
  if (typeof cmd.id !== "string" || !cmd.id) return { ok: false, why: "no id" };
  if (!TYPES.includes(cmd.type)) return { ok: false, why: `unknown type ${cmd.type}` };
  const a = cmd.args && typeof cmd.args === "object" ? cmd.args : {};
  if (NEEDS_CAR.has(cmd.type) && (cmd.car == null || cmd.car === "")) return { ok: false, why: `${cmd.type}: no car` };
  switch (cmd.type) {
    case "pace": if (!PACE.includes(a.mode)) return { ok: false, why: `unknown pace mode ${a.mode}` }; break;
    case "energy": if (!ENERGY.includes(a.mode)) return { ok: false, why: `unknown energy mode ${a.mode}` }; break;
    case "pit": if (a.compound != null && typeof a.compound !== "string") return { ok: false, why: "compound must be a name" }; break;
    case "teamOrder": if (!TEAM_ORDER.includes(a.policy)) return { ok: false, why: `unknown policy ${a.policy}` }; break;
    case "plan": {
      if (!Array.isArray(a.stints) || !a.stints.length) return { ok: false, why: "plan: no stints" };
      let prev = 0;
      for (const [i, x] of a.stints.entries()) {
        if (!x || typeof x.compound !== "string") return { ok: false, why: `plan: stint ${i + 1} has no compound` };
        if (!Number.isFinite(x.toLap) || !Number.isInteger(x.toLap)) return { ok: false, why: `plan: stint ${i + 1} end lap not a whole number` };
        if (x.toLap <= prev) return { ok: false, why: `plan: stint ${i + 1} ends at lap ${x.toLap}, not after ${prev}` };
        prev = x.toLap;
      }
      break;
    }
  }
  return { ok: true };
}

// queue an order (any time, also paused). actor: the caller's identity ("player" | "ai:<team>"). check(c) → { ok, why }:
// the engine's race checks. Returns { ok, why, id }.
export function submit(cs, t, cmd, actor = "player", check = null) {
  if (!isActor(actor)) { const why = `unknown actor ${actor}`; cs.log.push({ id: cmd?.id ?? null, type: cmd?.type ?? null, car: cmd?.car ?? null, team: null, args: {}, by: String(actor), tAt: t, tEff: null, ok: false, why, stage: "submit" }); return { ok: false, why }; }
  const id = typeof cmd?.id === "string" ? cmd.id : null;
  if (id && cs.seen[id]) return { ok: false, why: "duplicate", dup: true, id };
  const s = shape(cmd);
  const c = { id, type: cmd?.type ?? null, car: cmd?.car != null ? String(cmd.car) : null, team: cmd?.team ?? null, args: cmd?.args && typeof cmd.args === "object" ? cmd.args : {}, by: actor, tAt: t };
  const r = s.ok ? (check ? check(c) : { ok: true }) : s;
  if (id) cs.seen[id] = true;   // (a refused id is spent too: the screen sends a new id for a corrected order)
  if (!r.ok) { cs.log.push({ ...c, tEff: null, ok: false, why: r.why, stage: "submit" }); return { ok: false, why: r.why, id }; }
  cs.queue.push(c);
  return { ok: true, id };
}

// the orders due at this step, in the order they were given (validation is the engine's: it knows the state)
export function due(cs, t) {
  if (!cs.queue.length) return [];
  const out = cs.queue.filter((c) => c.tAt <= t);
  if (out.length) cs.queue = cs.queue.filter((c) => c.tAt > t);
  return out;
}

// what happened to an order (applied / refused with a reason) – the log is saved and shown
export function record(cs, c, t, result) { cs.log.push({ ...c, tEff: t, ok: !!result.ok, why: result.why || null, stage: "apply" }); }

export function status(cs, id) {
  const q = cs.queue.find((c) => c.id === id);
  if (q) return { state: "queued", why: null, stage: null, tAt: q.tAt, tEff: null };
  for (let i = cs.log.length - 1; i >= 0; i--) { const c = cs.log[i]; if (c.id === id) return { state: c.ok ? "applied" : "refused", why: c.why, stage: c.stage || "apply", tAt: c.tAt, tEff: c.tEff }; }
  return { state: "unknown", why: null, stage: null, tAt: null, tEff: null };
}
