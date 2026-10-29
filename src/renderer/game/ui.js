// Small things every game screen shares: DOM helpers, Korean labels, number formats, the tyre list. No state.
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const KO = () => window.KO;
export const teamKo = (t) => window.KO?.TEAMS?.[t] || t || "?";
// a Grand Prix's Korean name (shared/ko.js gpName – the home screen's own), else as the data names it
export const raceKo = (ev) => (ev && (window.KO?.gpName?.(ev) || window.KO?.raceName?.(ev))) || ev || "?";

export const PACE_KO = { attack: "공격", balanced: "균형", manage: "관리" };
export const ENERGY_KO = { harvest: "회수", balanced: "균형", push: "사용", overtake: "추월 모드" };
export const ORDER_KO = { free: "자유 경쟁", hold: "순위 유지", swap: "순위 교환" };
export const STATUS_KO = { run: "주행 중", pit: "피트", fin: "완주", dnf: "리타이어", grid: "출발 전" };
export const CMP_KO = { SOFT: "소프트", MEDIUM: "미디엄", HARD: "하드", INTERMEDIATE: "인터", WET: "웨트" };
export const CMP_1 = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };
export const FLAG_KO = { grid: "출발 전", green: "녹색기", yellow: "황색기", vsc: "VSC", sc: "세이프티카", red: "적색기", chequered: "체커기" };
// the pit phases as the engine names them (pit.js) – what the player sees
export const PIT_KO = { none: "", called: "박스 요청됨", committed: "피트 진입 확정", entry: "피트 진입", lane: "피트레인 주행", approach: "박스 접근",
  penalty: "페널티 정지", queue: "앞차 정비 대기", work: "정비 중", release: "출발 대기", laneOut: "피트레인 출구로", exit: "피트 출구" };
export const PENDING = `<span class="g-pending">엔진 연결 전</span>`;

// race clock "1:02:03" / "02:03"
export const fmtT = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ":" : ""}${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
// a race time in s as h:mm:ss (an estimate: whole seconds at most)
export const fmtRace = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// an estimated difference in s rounded to what the spread allows (never tenths when the spread is tens of seconds)
export function fmtEst(x, sd = 0) {
  if (!Number.isFinite(x)) return "–";
  const step = sd >= 20 ? 5 : sd >= 5 ? 1 : 0.5, v = Math.round(x / step) * step;
  return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(step < 1 ? 1 : 0);
}
export const pct = (x) => (Number.isFinite(x) ? Math.round(x * 100) + "%" : "–");

// ---------- the tyres a team may fit (request §5) ----------
// The engine's shared answer (src/game/engine/compounds.js availableCompounds – the same list the engine and the team AI
// use: the event's nomination + both wet tyres, est when assumed). Until that module exists in this build: S/M/H + I/W,
// marked as an assumption – never the compounds the real race happened to use (scenario.tyres.compoundsSeen).
const DRY = ["SOFT", "MEDIUM", "HARD"], WETS = ["INTERMEDIATE", "WET"];
let CMOD = null, cmodTried = false;
export async function loadCompounds() {
  if (cmodTried) return !!CMOD; cmodTried = true;
  try { const m = await import("../../game/engine/compounds.js"); if (typeof m.availableCompounds === "function") CMOD = m; } catch { CMOD = null; }
  return !!CMOD;
}
export function compoundsFor(sc) {
  if (CMOD && sc) {
    try {
      const A = CMOD.availableCompounds(sc);
      return { list: A.list.map((c) => c.name), codes: Object.fromEntries(A.list.map((c) => [c.name, c.code])), dry: A.dry, wet: A.wet, est: !!A.est, source: A.source, inventory: !!A.inventory, shared: true };
    } catch { /* below */ }
  }
  return { list: [...DRY, ...WETS], codes: {}, dry: DRY.slice(), wet: WETS.slice(), est: true, source: "공용 타이어 목록 API 연결 전 – S/M/H와 인터·웨트로 가정", inventory: false, shared: false };
}
// the limit said wherever a tyre list is shown (no set inventory in v0.49)
export const NO_INVENTORY = "세트 재고 없음 · 매번 새 세트 (이번 버전의 한계)";
export const cmpChip = (c, extra = "") => `<i class="g-cmp cmp-${esc(c || "")}" title="${esc(CMP_KO[c] || c || "?")}">${esc(CMP_1[c] || "?")}</i>${extra}`;

// the snapshot for the HUD at the render time. The cars come from the 3D adapter's frameCars() when there is one: their
// discrete state (pit phase, tyre fitted, lap / pit, status) applied at the sim time the engine recorded for each change
// (snapshot trans) – the HUD and the 3D view change together, never early. Without it: the newest snapshot at or before
// the render time (runner.pair().a), never a newer one. Race-wide fields (flag, weather, lap) are that snapshot's.
export function hudSnap(run, adapter = null) {
  const p = run?.pair?.(); if (!p) return null;
  const base = p.a && p.a.t <= p.renderT ? p.a : p.b;
  const fr = adapter?.frameCars?.();
  return fr?.cars ? { ...base, t: fr.t, cars: fr.cars } : base;
}
