// The pit-work panel for the race HUD (request §13, §15): the selected car's stop as the viewer can see it – the phase,
// the time stood so far, what the crew has done (from the same clock the crew is drawn by: game/pitcrew.js stopPlan →
// crew.js stopChoreo), a penalty hold (its length is the stewards' published 5 / 10 s, so its count-down is shown), a
// slow wheel once it shows (the other three done, that one not – the engine names the wheel), and the release (held for
// a car in the fast lane, or gone). Never the engine's future: the work's end (workT1) is not shown or used before render
// time reaches it, no "remaining" time of the work.
//
// Interface (agreed with the ui helper – the HUD places it):
//   import { renderPitPanel, pitPanelModel } from "./pitpanel.js";
//   renderPitPanel(el, car, renderT, { tla, colour }) – car: the adapter's frameCars() row for the car (render time –
//     NOT the newest snapshot), renderT: frameCars().t. Fills el (its innerHTML, only when it changed), sets
//     el.hidden when the car isn't in the pit lane; returns the model (below) or null.
//   pitPanelModel(car, renderT) – the same as data: { phase, label, stoodS, hold: { leftS, totalS } | null, steps:
//     [{ key, label, done }], wheels: [bool × 4] (nut done) | null, issue: { kind, wheel, text } | null, release: text | null }
import { stopChoreo } from "../crew.js";
import { stopPlan } from "./pitcrew.js";

const D0 = { FZ: 1.7, RZ: -1.7, FR: 0.353, RR: 0.355, FW: 0.28, RW: 0.375, FX: 0.81, RX: 0.7625, W: 1.9 };   // (timings don't depend on the car's size)
const PHASE_KO = { called: "박스 요청됨", committed: "피트 진입 확정", entry: "피트 진입", lane: "피트레인 주행", approach: "박스 접근", queue: "앞차 정비 대기", penalty: "페널티 정지",
  work: "정비 중", release: "출발 준비", laneOut: "피트레인 출구로", exit: "피트 출구" };
const WHEEL_KO = ["왼쪽 앞", "오른쪽 앞", "왼쪽 뒤", "오른쪽 뒤"];
const CAUSE_KO = { "double stack": "더블 스택", rain: "비" };
const IN = new Set(["called", "committed", "entry", "lane", "approach", "queue", "penalty", "work", "release", "laneOut", "exit"]);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function pitPanelModel(car, T) {
  const p = car?.pit; if (!p || !IN.has(p.phase)) return null;
  const tm = p.times || {}, stood = tm.stop != null && T >= tm.stop, released = tm.release != null && T >= tm.release;
  const m = { phase: p.phase, label: PHASE_KO[p.phase] || p.phase, stoodS: null, hold: null, steps: null, wheels: null, issue: null, release: null, compound: p.compound || null };
  if (stood) m.stoodS = ((released ? tm.release : T) - tm.stop) / 1000;
  if (p.noWork && stood) { m.label = "스톱 앤 고 페널티"; m.hold = p.holdT1 != null ? { leftS: Math.max(0, (p.holdT1 - T) / 1000), totalS: (p.holdT1 - tm.stop) / 1000 } : null; m.steps = [{ key: "nowork", label: "작업 금지 – 정지만", done: false }]; }
  else if (stood && !released) {
    if (p.holdT1 != null && T < p.holdT1) { m.label = "페널티 정지 – 작업 대기"; m.hold = { leftS: (p.holdT1 - T) / 1000, totalS: (p.holdT1 - tm.stop) / 1000 }; }
    const plan = stopPlan(car), s = (T - tm.stop) / 1000;
    // (the crew's picture's own clock – what the viewer sees done; the work's end itself only once reached)
    const workEnded = p.workT1 != null && T >= p.workT1;
    const L = stopChoreo(plan, s, D0, 1);
    const up = L.car.lift.some((x) => x > 0.01), anyOff = L.car.off.some(Boolean) || L.car.fitted.some(Boolean), allOn = L.car.fitted.every(Boolean), nuts = L.car.done;
    m.wheels = nuts;
    m.steps = [{ key: "lift", label: "잭 업", done: up || anyOff }, { key: "off", label: "헌 타이어 탈거", done: anyOff }, { key: "on", label: "새 타이어 장착", done: allOn }, { key: "nuts", label: "휠너트 체결", done: nuts.every(Boolean) }, { key: "drop", label: "잭 다운", done: workEnded }];
    if (workEnded) m.label = p.held ? "출발 대기 – 피트레인 통과 차량" : "정비 완료";
    // a slow wheel once it shows: three nuts done, the named one not, the work still going
    if (p.err && !workEnded && nuts.filter(Boolean).length === 3 && Number.isInteger(p.err.wheel) && !nuts[p.err.wheel])
      m.issue = { kind: "slow wheel", wheel: p.err.wheel, text: `${WHEEL_KO[p.err.wheel]} 바퀴 체결 지연${p.err.causes?.length ? ` (원인: ${p.err.causes.map((c) => CAUSE_KO[c] || c).join("·")})` : ""}` };
    else if (p.err && !workEnded && !Number.isInteger(p.err.wheel) && nuts.every(Boolean)) m.issue = { kind: "slow", wheel: null, text: "정비 지연" };
    if (p.held && workEnded) m.release = "안전 출발 대기: 피트레인에 다가오는 차가 지나갈 때까지";
  } else if (released) { m.label = "출발"; m.release = "출발 – 정차 " + m.stoodS.toFixed(1) + "초"; }
  return m;
}

export function renderPitPanel(el, car, T, { tla = null, colour = null } = {}) {
  const m = pitPanelModel(car, T);
  if (!m) { if (!el.hidden) el.hidden = true; return null; }
  el.hidden = false;
  const steps = m.steps ? `<ol class="pp-steps">${m.steps.map((s) => `<li class="${s.done ? "done" : ""}">${esc(s.label)}</li>`).join("")}</ol>` : "";
  const wheels = m.wheels ? `<div class="pp-wheels" aria-label="휠너트 체결">${m.wheels.map((d, i) => `<i class="${d ? "done" : ""}${m.issue?.wheel === i ? " slow" : ""}" title="${WHEEL_KO[i]}"></i>`).join("")}</div>` : "";
  const html = `<div class="pp-h">${colour ? `<b class="pp-bar" style="background:${esc(colour)}"></b>` : ""}<b>${esc(tla || car.num)}</b> <span>${esc(m.label)}</span></div>
    ${m.stoodS != null ? `<div class="pp-t">정차 <b>${m.stoodS.toFixed(1)}</b>초</div>` : ""}
    ${m.hold ? `<div class="pp-hold">페널티 ${m.hold.totalS.toFixed(0)}초 – 남은 대기 ${m.hold.leftS.toFixed(1)}초</div>` : ""}
    ${wheels}${steps}
    ${m.issue ? `<div class="pp-issue">${esc(m.issue.text)}</div>` : ""}${m.release ? `<div class="pp-rel">${esc(m.release)}</div>` : ""}`;
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  return m;
}
