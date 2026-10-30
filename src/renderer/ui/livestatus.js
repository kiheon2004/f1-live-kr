// Live timing status rules (v0.50), kept free of the page so the tests can load them (test/livestatus50.test.js):
//   stale()        – is the timing table showing values that stopped being refreshed (live only)? Never a zero: the
//                    table greys its values and a line says why.
//   rcKind()       – a race control message's kind for colour and rank (red flag > SC/VSC > penalty > yellow).
//   rcUnread()     – the race control tab's unread badge: messages since the last time the tab was looked at.
//   answerApplies()– may a late async answer still be used? Only when it was asked for the session / place / mode that
//                    is on screen now (a slow answer for the previous session never overwrites the new one).
// A classic script (window.LiveStatus) and a CommonJS module.
(function (root) {
  const STALE_MS = 30e3;
  // conn: the live client's state ("live" | "connecting" | "reconnecting" | "error" | "stopped"); lastReceived: when
  // the newest message arrived (ms, this computer's clock). → null | { level: "warn" | "bad", age?, text }
  function stale({ mode, liveOnScreen, hasDrivers, conn, message = "", now = Date.now(), lastReceived = -Infinity, threshold = STALE_MS } = {}) {
    if (mode !== "live" || !liveOnScreen || !hasDrivers) return null;
    if (conn === "reconnecting" || conn === "connecting") return { level: "bad", text: "연결이 끊겨 다시 연결하는 중이에요 · 표에 보이는 값은 마지막으로 받은 값이에요." };
    if (conn === "error") return { level: "bad", text: `실시간 연결 오류${message ? ` (${message})` : ""} · 표에 보이는 값은 마지막으로 받은 값이에요 (0이 아니에요).` };
    if (conn === "stopped") return { level: "warn", text: "실시간 연결을 끊었어요 · 표에 보이는 값은 끊기 전 마지막 값이에요." };
    const age = now - lastReceived;
    if (Number.isFinite(age) && age > threshold) return { level: "warn", age, text: `${Math.round(age / 1000)}초째 새 데이터가 오지 않아요 · 값이 갱신되지 않은 상태일 수 있어요 (실제로 0이라는 뜻이 아니에요).` };
    return null;
  }

  function rcKind(m) {
    const msg = String(m?.Message || ""), flag = String(m?.Flag || "");
    // (not "CHEQUERED FLAG" – its letters contain "RED FLAG" – nor "… RED FLAG INFRINGEMENT")
    if (flag === "RED" || /^RED FLAG\b(?! INFRINGEMENT)/.test(msg)) return "red";
    if (m?.Category === "SafetyCar" || /SAFETY CAR|\bVSC\b/.test(msg)) return "sc";
    if (/PENALTY/.test(msg) && !/NO FURTHER|SERVED|REVIEWED/.test(msg)) return "penalty";
    if (/YELLOW/.test(flag)) return "yellow";
    if (/CHEQUERED/.test(flag) || /CHEQUERED/.test(msg)) return "chequered";
    if (/GREEN|CLEAR/.test(flag)) return "green";
    return "";
  }
  const RANK = { red: 4, sc: 3, penalty: 2, yellow: 1 };
  // seen: how many messages had been seen (-1: count everything now as seen – after a load, seek, mode or session
  // change); open: the tab is the one shown. → { seen, count, top }
  function rcUnread(msgs, seen, open) {
    const n = Array.isArray(msgs) ? msgs.length : 0;
    if (seen < 0 || seen > n || open) seen = n;
    const fresh = n ? msgs.slice(seen) : [];
    let top = "";
    for (const m of fresh) { const k = rcKind(m); if ((RANK[k] || 0) > (RANK[top] || 0)) top = k; }
    return { seen, count: fresh.length, top };
  }

  // asked: what the request was made for ({ tag, mode, key }); now: the same, for what is on screen now.
  // Every field given in asked must still match.
  function answerApplies(asked, now) {
    if (!asked || !now) return false;
    for (const k of Object.keys(asked)) if (asked[k] !== now[k]) return false;
    return true;
  }
  const sessionTag = (mode, replayPath, liveKey) => (mode === "replay" ? `replay:${replayPath || ""}` : `live:${liveKey ?? ""}`);

  const API = { stale, rcKind, rcUnread, answerApplies, sessionTag, STALE_MS };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.LiveStatus = API;
})(typeof window !== "undefined" ? window : globalThis);
