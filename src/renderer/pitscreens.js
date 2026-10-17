// The team's own monitors on its pit wall stand: one panel per driver of that team (by team, from the driver list –
// never by the order of the classification), with the session's public data at the moment shown: number and name, place,
// lap, gap to the car ahead, last lap, tyre and its age, in the pits / out; speed and gear while the car's telemetry is
// fresh. Nothing a team keeps to itself (strategy, energy, temperatures) – the app doesn't have it and doesn't make it up.
// Each stand has one 384 × 128 texture: driver A on the left half, B on the right; a seat's second monitor shows one half.

// (pure) d: { num, tla }, team colour; line: TimingData line; app: TimingAppData line (Stints); car: carAt at t or null
export function driverPanel({ d, colour = "#888", line = null, app = null, car = null }) {
  const st = app?.Stints ? Object.values(app.Stints) : [], s = st[st.length - 1] || null;
  const pos = line && +line.Position > 0 ? +line.Position : null;
  const lap = line?.NumberOfLaps != null ? +line.NumberOfLaps : null;
  const g = String(line?.IntervalToPositionAhead?.Value ?? "").trim(), lapsG = /^\+?(\d+)\s*L(AP)?S?$/i.exec(g);
  const m = {
    num: d.num, tla: d.tla || d.num, colour,
    pos, laps: Number.isFinite(lap) ? lap : null,
    gap: pos === 1 ? "LEADER" : lapsG ? `+${lapsG[1]} LAP` : /^\+?\d+(\.\d+)?$/.test(g) ? (g.startsWith("+") ? g : "+" + g) : null,
    last: line?.LastLapTime?.Value || null,
    tyre: s?.Compound ? { c: s.Compound[0], age: s.TotalLaps != null ? +s.TotalLaps : null, isNew: s.New === "true" || s.New === true } : null,
    state: line?.Retired || line?.Stopped ? "OUT" : line?.InPit ? "IN PIT" : line?.PitOut ? "PIT EXIT" : null,
    speed: car && Number.isFinite(car.speed) ? Math.round(car.speed) : null, gear: car && Number.isFinite(car.gear) ? (car.gear === 0 ? "N" : String(car.gear)) : null,
  };
  m.key = JSON.stringify(m);
  return m;
}

const TYRE = { S: "#ff3b30", M: "#ffd60a", H: "#f2f2f2", I: "#30d158", W: "#0a84ff" };
// paints one half (x0 = 0 or 192) of the stand's texture
export function paintPanel(g, x0, m) {
  const W = 192, H = 128;
  g.fillStyle = "#0b0e13"; g.fillRect(x0, 0, W, H);
  g.fillStyle = m.colour; g.fillRect(x0, 0, W, 22);
  g.fillStyle = "#ffffff"; g.font = "700 15px Arial, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
  g.fillText(`${m.num}  ${m.tla}`, x0 + 8, 11);
  g.textAlign = "right"; g.fillText(m.pos ? `P${m.pos}` : "P –", x0 + W - 8, 11);
  g.textAlign = "left"; g.font = "600 13px Arial, sans-serif"; g.fillStyle = "#cfd6dd";
  g.fillText(m.laps != null ? `LAPS ${m.laps}` : "LAPS –", x0 + 8, 38);
  g.fillText(`GAP ${m.gap || "–"}`, x0 + 8, 58);
  g.fillText(`LAST ${m.last || "–"}`, x0 + 8, 78);
  if (m.tyre) {
    g.fillStyle = TYRE[m.tyre.c] || "#888"; g.beginPath(); g.arc(x0 + 16, 100, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0b0e13"; g.font = "700 11px Arial, sans-serif"; g.textAlign = "center"; g.fillText(m.tyre.c, x0 + 16, 101);
    g.textAlign = "left"; g.fillStyle = "#cfd6dd"; g.font = "600 13px Arial, sans-serif";
    g.fillText(`${m.tyre.age != null ? m.tyre.age + " L" : ""}${m.tyre.isNew ? " NEW" : ""}`, x0 + 30, 100);
  }
  g.textAlign = "right";
  if (m.state) { g.fillStyle = m.state === "OUT" ? "#ff453a" : "#ffd60a"; g.font = "700 13px Arial, sans-serif"; g.fillText(m.state, x0 + W - 8, 100); }
  else if (m.speed != null) { g.fillStyle = "#cfd6dd"; g.font = "600 13px Arial, sans-serif"; g.fillText(`${m.speed} km/h  ${m.gear}`, x0 + W - 8, 100); }
  else { g.fillStyle = "#59616b"; g.font = "600 12px Arial, sans-serif"; g.fillText("NO DATA", x0 + W - 8, 100); }
  g.textAlign = "left";
}
