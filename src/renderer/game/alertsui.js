// The alert settings and words (v0.50 request §5-6) on top of the lead's policy (alerts.js: which moments, importance,
// cooldown, what the clock does). The player picks, per moment, what happens: 끔 / 알림만 / 1배속 / 일시정지 – and a master
// switch for whether alerts may touch the clock at all (G.settings.autoSlow; off: every chosen moment is only a notice).
// The pit camera's own "slow the pit scene, then back to the speed before" (pitcam.js, G.settings.pitSlow) is folded into
// the same row as the myPit choice "피트 장면 동안 1배속": one control, so the two can't fight (a myPit slow-down to 1× and
// a scene slow-down that restores 30× afterwards were two rules acting on the same moment in v0.49).
// Shown in the menu's settings sheet and in the race's 알림 panel (racedock.js); both write the same settings.
import { RULES, ACTIONS, defaultAlertSettings } from "./alerts.js";
import { G, saveSettings, applyRacePrefs } from "./gamehome.js";
import { esc } from "./ui.js";
import * as HM from "./hudmodel.js";
import { setAlertsSettings } from "./menu.js";

export const RULE_KO = { myPit: "내 차 피트", rain: "비 예보 변화", flag: "SC·VSC·적색기", damage: "내 차 손상·사고", fuel: "연료 완주 위험", tyre: "내 차 타이어 위험", battery: "배터리 소진", finish: "체커기" };
export const RULE_HELP = {
  myPit: "계획한 피트 1랩 전, 피트 진입 확정·진입 때",
  rain: "게임 예보의 1시간 내 비 확률이 25%p 이상 바뀌거나 비가 시작될 때",
  flag: "세이프티카·VSC·적색기가 나올 때",
  damage: "내 차의 접촉·고장·큰 실수·리타이어",
  fuel: "이 차가 지금까지 쓴 연료로 추정한 완주 여유가 모자랄 때 (게임 추정)",
  tyre: "내 차 타이어가 거의 닳았거나(남은 수명 15% 미만) 노면에 맞지 않을 때 (젖은 노면에 슬릭, 마른 노면에 인터, 물이 적은 노면에 웨트)",
  battery: "내 차의 배터리가 바닥났을 때",
  finish: "선두가 체커기를 받을 때",
};
export const ACTION_KO = { off: "끔", note: "알림만", slow: "1배속으로", pause: "일시정지", scene: "피트 장면 동안 1배속" };
const LEVEL_KO = { 3: "중요", 2: "보통", 1: "참고" };
const cool = (ms) => (ms >= 1e8 ? "한 번만" : ms >= 60000 ? `${Math.round(ms / 60000)}분에 한 번` : `${Math.round(ms / 1000)}초에 한 번`);

// (pure halves in hudmodel.js – tested)
export const actionOf = (rule, S = G.settings) => HM.actionOf(rule, S);
export const applyAction = HM.applyAction;

export function settingsHtml({ compact = false } = {}) {
  const S = G.settings;
  const rows = Object.entries(RULES).map(([k, r]) => {
    const cur = actionOf(k), opts = k === "myPit" ? ["off", "note", "scene", "slow", "pause"] : ACTIONS;
    return `<label class="ga-rule"><span><span class="ga-name"><b>${RULE_KO[k] || k}</b><span class="ui-badge ${r.level >= 3 ? "bad" : r.level >= 2 ? "warn" : ""}">${LEVEL_KO[r.level] || ""}</span></span>${compact ? "" : `<small>${esc(RULE_HELP[k] || "")} · ${cool(r.cooldownMs)}</small>`}</span>
      <select class="ui-select" data-chg="alerts:rule" data-k="${k}" aria-label="${esc(RULE_KO[k] || k)}">${opts.map((a) => `<option value="${a}" ${a === cur ? "selected" : ""}>${ACTION_KO[a]}</option>`).join("")}</select></label>`;
  }).join("");
  return `<div class="ga-set">
    <label class="gm-set"><input type="checkbox" data-chg="alerts:master" ${S.autoSlow ? "checked" : ""}><span><b>중요한 순간에 배속 조절</b><small>${S.autoSlow ? "켜짐 – 아래에서 고른 대로 1배속 또는 일시정지" : "꺼짐 – 고른 순간은 알림만 보여요"} · 화면만 바뀌고 경기 계산은 같아요 · 직접 바꾼 배속이 우선</small></span></label>
    <div class="ga-rules ${S.autoSlow ? "" : "off"}">${rows}</div>${S.autoSlow ? "" : `<p class="muted gd-small">배속 조절이 꺼져 있어 '1배속으로'·'일시정지'도 지금은 알림만 보여요.</p>`}</div>`;
}
export function onChange(act, t) {
  if (act === "master") { G.settings.autoSlow = !!t.checked; saveSettings(); repaint(); return; }
  if (act === "rule") { applyAction(G.settings, t.dataset.k, t.value); saveSettings(); applyRacePrefs(); repaint(); return; }
}
export function onClick() {}
function repaint() { import("./gamehome.js").then((m) => m.paint()); }
setAlertsSettings(() => settingsHtml());
