// Live timing client for F1's SignalR Core hub.
// Without a token the hub serves timing, race control and track status; car positions need an F1 TV token.
const { EventEmitter } = require("node:events");
const WebSocket = require("ws");
const { inflateZ } = require("./archive");

const HUB = "livetiming.formula1.com/signalrcore";
const RS = "\x1e";   // SignalR record separator
const CONNECT_TIMEOUT = 15000;   // negotiate / handshake / the subscription must answer within this
const STALE_AFTER = 60000;       // the hub pings every ~15s; this much silence means a dead link (e.g. after sleep)
const TOPICS = [
  "Heartbeat", "SessionInfo", "SessionStatus", "DriverList", "TimingData", "TimingAppData", "RaceControlMessages",
  "TrackStatus", "LapCount", "ExtrapolatedClock", "WeatherData", "TeamRadio", "Position.z",
  "TimingStats", "PitStopSeries", "PitLaneTimeCollection", "ChampionshipPrediction", "CarData.z",
];

// "Position.z" arrives compressed; the app uses the plain name.
function decode(topic, data) {
  if (typeof topic !== "string" || !topic) return [null, null];
  if (topic.endsWith(".z")) {
    try { return [topic.slice(0, -2), typeof data === "string" ? inflateZ(data) : data]; }
    catch { return [topic.slice(0, -2), null]; }
  }
  return [topic, data];
}

class LiveClient extends EventEmitter {
  // (the socket class and fetch can be swapped in tests)
  constructor({ getToken, WebSocketImpl = WebSocket, fetchImpl = (...a) => fetch(...a) }) {
    super();
    this.getToken = getToken; this.WS = WebSocketImpl; this.fetch = fetchImpl;
    this.ws = null; this.stopped = true; this.retry = 0; this.pingTimer = null; this.lastFrame = 0;
    // Each connection attempt has a number; stop() and every new attempt move it on and abort the old attempt's
    // requests, and an attempt that finds the number changed after any await gives up (no socket from a stopped
    // or replaced attempt). Socket events are acted on only for the current socket.
    this.gen = 0; this.abort = null; this.subTimer = null;
  }

  start() { if (!this.stopped) return; this.stopped = false; this.connect(); }

  stop() {
    this.stopped = true;
    this.gen++; this.abort?.abort(); this.abort = null;
    clearInterval(this.pingTimer); clearTimeout(this.retryTimer); clearTimeout(this.subTimer);
    this.dropSocket();
    this.emit("status", { state: "stopped" });
  }

  dropSocket() {
    if (!this.ws) return;
    this.ws.removeAllListeners(); this.ws.on("error", () => {});
    try { this.ws.terminate(); } catch {}
    this.ws = null;
  }

  async connect() {
    if (this.stopped) return;
    const gen = ++this.gen;
    this.abort?.abort();
    const ac = this.abort = new AbortController();
    const current = () => !this.stopped && this.gen === gen;
    clearTimeout(this.retryTimer); clearInterval(this.pingTimer); clearTimeout(this.subTimer);
    this.dropSocket();
    this.subscribed = false;
    this.emit("status", { state: "connecting" });
    try {
      const token = await this.getToken();
      if (!current()) return;
      const auth = token ? { Authorization: `Bearer ${token}` } : {};
      const neg = await this.fetch(`https://${HUB}/negotiate?negotiateVersion=1`, { method: "POST", headers: auth, signal: AbortSignal.any([ac.signal, AbortSignal.timeout(CONNECT_TIMEOUT)]) });
      if (!current()) return;
      if (!neg.ok) throw new Error(`negotiate HTTP ${neg.status}`);
      // Load-balancer stickiness cookie must ride along on the socket.
      const cookie = (neg.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
      const { connectionToken } = await neg.json();
      if (!current()) return;
      if (typeof connectionToken !== "string" || !connectionToken) throw new Error("negotiate: no connection token");
      let url = `wss://${HUB}?id=${encodeURIComponent(connectionToken)}`;
      if (token) url += `&access_token=${encodeURIComponent(token)}`;
      const ws = this.ws = new this.WS(url, { headers: { ...auth, ...(cookie ? { Cookie: cookie } : {}) }, handshakeTimeout: CONNECT_TIMEOUT });
      this.lastFrame = Date.now();
      const mine = () => this.ws === ws && current();
      // the SignalR handshake and the subscription must be answered in time too (an open socket that only
      // pings would otherwise sit at "connecting")
      this.subTimer = setTimeout(() => {
        if (!mine() || this.subscribed) return;
        this.emit("status", { state: "error", message: "구독 응답이 없어요" });
        this.dropSocket(); this.reconnect();
      }, CONNECT_TIMEOUT * 2);

      ws.on("open", () => {
        if (!mine()) return;
        ws.send(JSON.stringify({ protocol: "json", version: 1 }) + RS);
        ws.send(JSON.stringify({ type: 1, invocationId: "1", target: "Subscribe", arguments: [TOPICS] }) + RS);
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (!mine()) return;
          if (Date.now() - this.lastFrame > STALE_AFTER) { this.dropSocket(); this.reconnect(); return; }
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 6 }) + RS);
        }, 15000);
      });
      ws.on("message", (buf) => { if (!mine()) return; this.lastFrame = Date.now(); this.onFrames(String(buf), !!token); });
      ws.on("close", () => { if (this.ws === ws) { this.ws = null; this.reconnect(); } });
      ws.on("error", (e) => { if (this.ws === ws) this.emit("status", { state: "error", message: e.message }); });
    } catch (e) {
      if (!current()) return;   // (aborted by stop() or a newer attempt)
      this.emit("status", { state: "error", message: e.message });
      this.reconnect();
    }
  }

  // (each message on its own: one malformed message is skipped, it never throws out of the socket's handler)
  onFrames(text, authed) {
    for (const part of text.split(RS)) {
      if (!part) continue;
      let msg; try { msg = JSON.parse(part); } catch { continue; }
      if (!msg || typeof msg !== "object") continue;
      try { if (this.onMessage(msg, authed) === "dropped") return; }
      catch (e) { console.warn("live: skipped a message:", e.message); }
    }
  }

  onMessage(msg, authed) {
    if (msg.type === undefined && msg.error) {
      // the SignalR handshake refused
      this.emit("status", { state: "error", message: String(msg.error) }); this.dropSocket(); this.reconnect(); return "dropped";
    } else if (msg.type === 3 && msg.invocationId === "1") {
      // A refused subscription leaves an open but silent socket: drop it and try again.
      if (msg.error) { this.emit("status", { state: "error", message: String(msg.error) }); this.dropSocket(); this.reconnect(); return "dropped"; }
      const snap = {};
      const result = msg.result && typeof msg.result === "object" ? msg.result : {};
      for (const [topic, data] of Object.entries(result)) { const [t, d] = decode(topic, data); if (t && d) snap[t] = d; }
      this.retry = 0; this.subscribed = true; clearTimeout(this.subTimer);
      this.emit("snapshot", snap);
      this.emit("status", { state: "live", positions: "Position" in snap, authed });
    } else if (msg.type === 1 && msg.target === "feed") {
      const [topic, data, ts] = Array.isArray(msg.arguments) ? msg.arguments : [];
      const [t, d] = decode(topic, data);
      if (t && d) this.emit("feed", t, d, ts);
    } else if (msg.type === 7) {
      this.dropSocket(); this.reconnect(); return "dropped";
    }
  }

  reconnect() {
    clearInterval(this.pingTimer); clearTimeout(this.subTimer);
    if (this.stopped) return;
    const wait = Math.min(30000, 2000 * 2 ** this.retry++);
    this.emit("status", { state: "reconnecting", inMs: wait });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), wait);
  }
}

module.exports = { LiveClient, decode, TOPICS };
