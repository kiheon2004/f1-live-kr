// What the spectator HUD's widgets say (v0.50 §8) – pure text from the session's state at the moment shown, so node
// --test checks it. Korean, short; units always written; "–" (no data) is never shown as a zero.

export const FLAGS = {
  "1": { cls: "green", ko: "그린" }, "2": { cls: "yellow", ko: "황색기" }, "4": { cls: "sc", ko: "SC" },
  "5": { cls: "red", ko: "적색기" }, "6": { cls: "vsc", ko: "VSC" }, "7": { cls: "vsc", ko: "VSC 종료" },
};
// the session's flag: the track status, or the chequered flag once the session is over
export function flagOf(trackStatus, sessionStatus) {
  if (/Finished|Finalised|Ends/.test(sessionStatus || "")) return { cls: "chequered", ko: "체커" };
  return FLAGS[String(trackStatus ?? "")] || null;
}

// F1's gap strings → the HUD's: "+1.234" stays, "1 L" / "+2 LAPS" → "+1랩", "LAP 23" (the leader's) → "선두"
export function gapText(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^LAP \d+$/.test(s)) return "선두";
  const lap = /^\+?(\d+) ?(L|LAPS?)$/.exec(s); if (lap) return `+${lap[1]}랩`;
  return s;
}
// seconds of a gap ("+1.234" → 1.234); null for laps or nothing
export function gapSec(v) { const m = /^\+?(\d+(?:\.\d+)?)$/.exec(String(v ?? "").trim()); return m ? +m[1] : null; }

export const hms = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
export const parseClock = (s) => { const m = /^(\d+):(\d\d):(\d\d)/.exec(s || ""); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 : null; };

// the playback line: replay (playing at rate / paused) or live (delay, paused, waiting, not connected)
export function playText({ mode, rate, delayMs = 0, conn = null }) {
  if (mode === "live") {
    if (conn && !/연결됨|수신|받는 중|live|connected/i.test(conn) && /안 됨|끊|오류|연결 중|stopped|error/i.test(conn)) return { cls: "warn", ko: conn };
    if (!rate) return { cls: "warn", ko: "실시간 · 일시정지" };
    return { cls: "live", ko: delayMs >= 1000 ? `실시간 · 지연 ${Math.round(delayMs / 1000)}초` : "실시간" };
  }
  return rate ? { cls: "", ko: `다시보기 · ${rate}배` } : { cls: "", ko: "다시보기 · 일시정지" };
}

const TYRE_LETTER = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };
export const tyreLetter = (compound) => TYRE_LETTER[String(compound || "").toUpperCase()] || null;

// The pit panel for one car, from what the data says at the moment shown (map3d's pit inference – pitstate.js – and the
// crew's shown stage, crew.js), never from what comes after it: no work-end time, no countdown, no "leaves in". Stages:
//   in the lane (entry, fast lane, to box), queued, waiting behind a teammate (double stack), in the box (stationary
//   time counting up; a time penalty being served first; the shown work stage; a stop longer than usual – observed,
//   no wheel named: the feed has nothing of it), stop-and-go (no work allowed), drive-through, leaving the box /
//   released (the stop's stationary time – known once it is over), pit-lane start.
// p: { state (pitState's state string), stillFor (s), penalty, timePen (s), lastStop: { dur (s), ago (s) } | null,
//      work: { kind: "tyres" | "work" | "hold", from: "record" | "observed" | "typical" | null, off, fitted, done (0–4),
//      lifted (bool) } | null }
// → { title, rows: [{ k, v, cls }], cls } or null (nothing to show)
export const PIT_SLOW = 4.5;   // s standing in the box without a penalty: "longer than usual" (a typical stop is 2–3 s)
export function pitText(p) {
  if (!p) return null;
  const st = p.state, rows = [], still = Math.max(0, p.stillFor || 0), pen = p.timePen || 0;
  const sec = (s) => `${s.toFixed(1)}초`;
  if (st === "in box" || st === "stop-go") {
    rows.push({ k: "정차", v: sec(still), cls: "num" });
    if (st === "stop-go") { rows.push({ k: "페널티", v: "스톱 앤 고 · 작업 금지", cls: "warn" }); return { title: "피트 정차", rows, cls: "warn" }; }
    if (pen > 0) {
      if (still < pen) { rows.push({ k: "페널티", v: `${pen}초 대기 중 · ${sec(still)} 경과`, cls: "warn" }); return { title: "피트 정차", rows, cls: "warn" }; }
      rows.push({ k: "페널티", v: `${pen}초 소화`, cls: "" });
    }
    const w = p.work;
    if (w?.kind === "tyres") {
      const stage = w.off === 0 && w.fitted === 0 ? "차 올리는 중" : w.off > 0 ? `바퀴 교체 중 · ${w.fitted}/4 장착` : w.done < 4 ? `체결 중 · ${w.done}/4` : w.lifted ? "작업 끝 · 출발 대기" : "출발 대기";
      rows.push({ k: "작업", v: stage, cls: "" });
      if (w.from === "record") rows.push({ k: "", v: "경기 기록으로 재현한 동작", cls: "faint" });
      else if (w.from === "typical") rows.push({ k: "", v: "전형적인 동작(추정)", cls: "faint" });
    } else rows.push({ k: "작업", v: "작업 내용 자료 없음 (출발 뒤 공개)", cls: "faint" });
    if (still - pen > PIT_SLOW) rows.push({ k: "지연", v: "평소보다 긴 정차 · 바퀴별 자료 없음", cls: "warn" });
    return { title: "피트 정차", rows, cls: "" };
  }
  if (st === "waiting (double stack)") return { title: "피트 대기", rows: [{ k: "대기", v: "팀 동료 정비 중 (더블 스택)", cls: "warn" }], cls: "warn" };
  if (st === "queued" || st === "standing (no box known)") return { title: "피트 레인", rows: [{ k: "정지", v: `${sec(still)} · 앞이 막힘`, cls: "warn" }], cls: "warn" };
  if (st === "drive-through") return { title: "피트 레인", rows: [{ k: "페널티", v: "드라이브 스루", cls: "warn" }], cls: "warn" };
  if (st === "pit start: waiting" || st === "pit start: going") return { title: "피트 레인 출발", rows: [{ k: "", v: st === "pit start: waiting" ? "출구 신호 대기" : "출발", cls: "" }], cls: "" };
  if (st === "retired") return { title: "피트 레인", rows: [{ k: "", v: "리타이어", cls: "bad" }], cls: "bad" };
  if (st === "garage") return { title: "차고", rows: [{ k: "", v: "차고 안", cls: "" }], cls: "" };
  if (p.lastStop && p.lastStop.ago < 15 && (st === "leaving box" || st === "fast lane" || st === "exit" || st === "track")) {
    return { title: "출발 완료", rows: [{ k: "정차", v: sec(p.lastStop.dur), cls: "num" }], cls: "ok" };
  }
  if (st === "entry" || st === "fast lane" || st === "to box") {
    return { title: "피트 레인", rows: [{ k: "", v: st === "to box" ? "박스로 들어가는 중" : st === "entry" ? "피트 진입" : "피트 레인 주행", cls: "" }, ...(pen > 0 ? [{ k: "페널티", v: `${pen}초 (이번 정차에서 소화)`, cls: "warn" }] : [])], cls: "" };
  }
  if (st === "exit") return { title: "피트 레인", rows: [{ k: "", v: "피트 출구", cls: "" }], cls: "" };
  return null;
}
