// The game result (request §16, §18): the engine's classification of a race the engine ran to its end, the team's two
// cars first, the time-loss accounts the engine can separate, the stints and the race's events. Always labelled as a game
// result – never a real record; kept in userData/game/results.
import { G, go, myCars, toPrerace } from "./gamehome.js";
import { esc, teamKo, raceKo, STATUS_KO, cmpChip, CMP_KO, PENDING } from "./ui.js";
import { evLine, evShown } from "./racehud.js";

export function paint() {
  const r = G.result; if (!r) return `<div class="g-card"><p class="muted">결과가 없어요.</p><button data-act="go:menu">메뉴로</button></div>`;
  const mine = new Set(myCars(G.sc).map((e) => String(e.num))), ents = new Map((G.sc?.entries || []).map((e) => [String(e.num), e]));
  const me = r.classification.filter((c) => mine.has(String(c.num)));
  return `<div class="gx">
    <header class="gx-head"><div><small>게임 결과 · 엔진 계산 결과 – 실제 경기 기록이 아니에요${r.dev ? " · 개발용 스냅샷(엔진 아님)" : ""}</small>
      <h2>${esc(raceKo(G.sc?.meta?.event))} <span class="muted">${esc(G.sc?.meta?.date || "")} · 시드 ${r.seed}</span></h2></div>
      <div class="g-row"><button class="primary" data-act="go:menu">메뉴로</button><button class="ghost" data-act="res:again">같은 경기 다시 (전략부터)</button></div></header>
    <div class="gx-mine">${me.map((c) => { const e = ents.get(String(c.num)); return `<div class="gx-car" style="--tc:${esc(e?.colour || "#888")}"><b class="gx-pos">${c.pos ?? "–"}<small>위</small></b>
      <span><b>${esc(e?.name || c.tla)}</b><small>#${esc(c.num)} · ${esc(STATUS_KO[c.status] || c.status)} · 정차 ${c.stops ?? "?"}회${r.points?.[c.tla || c.num] ? ` · ${r.points[c.tla || c.num]}점` : ""}</small>
      <small>${(r.stints?.[c.tla] || []).map((x) => `${cmpChip(x.compound)}${x.laps}`).join(" ") || ""}</small></span></div>`; }).join("")}</div>
    <div class="gx-cols">
      <div class="g-card"><h3>최종 순위</h3><table class="g-tbl"><tr><th>순위</th><th>드라이버</th><th>팀</th><th>랩</th><th>차이</th><th>정차</th><th>점수</th><th>상태</th></tr>
        ${r.classification.map((c) => `<tr class="${mine.has(String(c.num)) ? "mine" : ""}"><td>${c.pos ?? ""}</td><td>${esc(c.tla || c.num)}</td><td>${esc(teamKo(c.team))}</td><td>${c.laps}</td><td>${c.pos === 1 ? "" : Number.isFinite(c.gap) ? "+" + c.gap.toFixed(3) + "s" : c.lapsDown ? `+${c.lapsDown}랩` : ""}</td><td>${c.stops ?? ""}</td><td>${r.points?.[c.tla || c.num] || ""}</td><td>${esc(STATUS_KO[c.status] || c.status)}</td></tr>`).join("")}</table></div>
      <div>
        <div class="g-card"><h3>결과의 원인 <small>엔진이 따로 셀 수 있는 손실만 – 내 차와 10위 안</small></h3>${r.accounts ? accountsHtml(r.accounts) : PENDING}</div>
        <div class="g-card"><h3>내 지시 <small>${r.orders?.length || 0}개</small></h3>${(r.orders || []).slice(-12).map((o) => `<p class="gr-ord ${o.state}">${esc(o.text || o.type)} → ${esc({ applied: "적용됨", refused: "거절됨", queued: "대기 중", rejected: "접수 거절" }[o.state] || o.state)}</p>`).join("") || `<p class="muted">없음</p>`}</div>
        <div class="g-card"><h3>사건</h3><div class="gx-ev">${r.events.length ? r.events.filter(evShown).slice(-40).map((e) => evLine(e, ents, r.events)).join("") : `<p class="muted">기록된 사건 없음</p>`}</div></div>
      </div>
    </div>
    <p class="muted">${r.saved ? `결과 저장됨${typeof r.saved === "string" && r.saved !== "ok" ? ": " + esc(r.saved) : ""}` : r.saveErr ? `결과 저장 실패: ${esc(r.saveErr)}` : r.dev ? "개발용 결과는 저장하지 않아요." : "결과 저장 중…"}${r.loadedFrom ? ` · 저장 슬롯(${esc(r.loadedFrom)})에서 이어서 완주` : ""}</p>
  </div>`;
}
// the engine's accounts as it gives them (per car: { traffic, pit, tyre, energy, penalty, other, approx: [...] } s)
function accountsHtml(a) {
  const rows = Object.entries(a.cars || a).filter(([, v]) => v && typeof v === "object");
  const all = ["traffic", "pit", "pitQueue", "tyre", "energy", "penalty", "other"], have = new Set(rows.flatMap(([, v]) => Object.keys(v))), keys = all.filter((k) => have.has(k)), ko = { traffic: "교통", pit: "피트 손실", pitQueue: "그중 피트 대기", tyre: "타이어", energy: "에너지·페이스", penalty: "페널티", other: "기타(분리 불가)" };
  return `<table class="g-tbl"><tr><th>차</th>${keys.map((k) => `<th>${ko[k]}</th>`).join("")}</tr>${rows.map(([n, v]) => `<tr><td>${esc(n)}</td>${keys.map((k) => `<td>${Number.isFinite(v[k]) ? v[k].toFixed(1) + "s" + ((v.approx || []).includes(k) ? " ≈" : "") : "–"}</td>`).join("")}</tr>`).join("")}</table><p class="muted">엔진이 지금 계산하는 항목만 보여요(${keys.map((k) => ko[k]).join("·") || "없음"}) · ≈: 엔진이 근사로 표시한 항목 · 타이어 관리·에너지 운용으로 잃거나 얻은 시간은 깨끗하게 떼어낼 수 없어서 따로 숫자로 보여주지 않아요</p>`;
}
export function onClick(act) { if (act === "again") { G.result = null; toPrerace(); } }
export { CMP_KO };
