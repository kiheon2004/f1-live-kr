// The player's (and the AI's) orders to the engine (DESIGN §1, request §1, §10).
// An order is taken with an id; the same id again is ignored (a double click, a key held at 30×, a re-sent message: one
// effect). It is fixed to the next step's sim time (an order given while paused acts on the first step after), validated
// against the race state at that step (e.g. a pit call past the commit point is refused, with the reason), and kept in
// the race's command log – a saved race replays its orders exactly (request §16).
export const TYPES = ["pace", "energy", "pit", "pitCancel", "plan", "teamOrder"];
export const PACE = ["attack", "balanced", "manage"];
export const ENERGY = ["harvest", "balanced", "push", "overtake"];
export const TEAM_ORDER = ["free", "hold", "swap"];

export function newCommandState() { return { seen: {}, queue: [], log: [] }; }

// queue an order (any time, also paused). Returns { ok, why }.
export function submit(cs, t, cmd) {
  if (!cmd || typeof cmd.id !== "string" || !cmd.id) return { ok: false, why: "no id" };
  if (cs.seen[cmd.id]) return { ok: false, why: "duplicate", dup: true };
  if (!TYPES.includes(cmd.type)) return { ok: false, why: `unknown type ${cmd.type}` };
  cs.seen[cmd.id] = true;
  const c = { id: cmd.id, type: cmd.type, car: cmd.car ?? null, team: cmd.team ?? null, args: cmd.args || {}, by: cmd.by || "player", tAt: t };
  cs.queue.push(c);
  return { ok: true };
}

// the orders due at this step, in the order they were given (validation is the engine's: it knows the state)
export function due(cs, t) {
  if (!cs.queue.length) return [];
  const out = cs.queue.filter((c) => c.tAt <= t);
  if (out.length) cs.queue = cs.queue.filter((c) => c.tAt > t);
  return out;
}

// what happened to an order (accepted / refused with a reason) – the log is saved and shown
export function record(cs, c, t, result) { cs.log.push({ ...c, tEff: t, ok: !!result.ok, why: result.why || null }); }
