// Live timing client for F1's SignalR Core hub.
// Without a token the hub serves timing, race control and track status; car positions need an F1 TV token.
const { EventEmitter } = require("node:events");
const WebSocket = require("ws");
const { inflateZ } = require("./archive");

const HUB = "livetiming.formula1.com/signalrcore";
const RS = "\x1e";   // SignalR record separator
const CONNECT_TIMEOUT = 15000;   // negotiate / handshake must answer within this
const STALE_AFTER = 60000;       // the hub pings every ~15s; this much silence means a dead link (e.g. after sleep)
const TOPICS = [
  "Heartbeat", "SessionInfo", "SessionStatus", "DriverList", "TimingData", "TimingAppData", "RaceControlMessages",
  "TrackStatus", "LapCount", "ExtrapolatedClock", "WeatherData", "TeamRadio", "Position.z",
  "TimingStats", "PitStopSeries", "PitLaneTimeCollection", "ChampionshipPrediction", "CarData.z",
];

// "Position.z" arrives compressed; the app uses the plain name.
function decode(topic, data) {
  if (topic.endsWith(".z")) {
    try { return [topic.slice(0, -2), typeof data === "string" ? inflateZ(data) : data]; }
    catch { return [topic.slice(0, -2), null]; }
  }
  return [topic, data];
}

class LiveClient extends EventEmitter {
  constructor({ getToken }) {
    super();
    this.getToken = getToken;
    this.ws = null; this.stopped = true; this.retry = 0; this.pingTimer = null; this.lastFrame = 0;
  }

  start() { if (!this.stopped) return; this.stopped = false; this.connect(); }

  stop() {
    this.stopped = true;
    clearInterval(this.pingTimer); clearTimeout(this.retryTimer);
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
    clearTimeout(this.retryTimer);
    this.dropSocket();
    this.emit("status", { state: "connecting" });
    try {
      const token = await this.getToken();
      const auth = token ? { Authorization: `Bearer ${token}` } : {};
      const neg = await fetch(`https://${HUB}/negotiate?negotiateVersion=1`, { method: "POST", headers: auth, signal: AbortSignal.timeout(CONNECT_TIMEOUT) });
      if (!neg.ok) throw new Error(`negotiate HTTP ${neg.status}`);
      // Load-balancer stickiness cookie must ride along on the socket.
      const cookie = (neg.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
      const { connectionToken } = await neg.json();
      let url = `wss://${HUB}?id=${encodeURIComponent(connectionToken)}`;
      if (token) url += `&access_token=${encodeURIComponent(token)}`;
      const ws = this.ws = new WebSocket(url, { headers: { ...auth, ...(cookie ? { Cookie: cookie } : {}) }, handshakeTimeout: CONNECT_TIMEOUT });
      this.lastFrame = Date.now();

      ws.on("open", () => {
        ws.send(JSON.stringify({ protocol: "json", version: 1 }) + RS);
        ws.send(JSON.stringify({ type: 1, invocationId: "1", target: "Subscribe", arguments: [TOPICS] }) + RS);
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (Date.now() - this.lastFrame > STALE_AFTER) { this.dropSocket(); this.reconnect(); return; }
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 6 }) + RS);
        }, 15000);
      });
      ws.on("message", (buf) => { this.lastFrame = Date.now(); this.onFrames(String(buf), !!token); });
      ws.on("close", () => { if (this.ws === ws) { this.ws = null; this.reconnect(); } });
      ws.on("error", (e) => this.emit("status", { state: "error", message: e.message }));
    } catch (e) {
      this.emit("status", { state: "error", message: e.message });
      this.reconnect();
    }
  }

  onFrames(text, authed) {
    for (const part of text.split(RS)) {
      if (!part) continue;
      let msg; try { msg = JSON.parse(part); } catch { continue; }
      if (msg.type === 3 && msg.invocationId === "1") {
        // A refused subscription leaves an open but silent socket: drop it and try again.
        if (msg.error) { this.emit("status", { state: "error", message: msg.error }); this.dropSocket(); this.reconnect(); return; }
        const snap = {};
        for (const [topic, data] of Object.entries(msg.result || {})) { const [t, d] = decode(topic, data); if (d) snap[t] = d; }
        this.retry = 0;
        this.emit("snapshot", snap);
        this.emit("status", { state: "live", positions: "Position" in snap, authed });
      } else if (msg.type === 1 && msg.target === "feed") {
        const [topic, data, ts] = msg.arguments || [];
        const [t, d] = decode(topic, data);
        if (d) this.emit("feed", t, d, ts);
      } else if (msg.type === 7) {
        this.dropSocket(); this.reconnect();
      }
    }
  }

  reconnect() {
    clearInterval(this.pingTimer);
    if (this.stopped) return;
    const wait = Math.min(30000, 2000 * 2 ** this.retry++);
    this.emit("status", { state: "reconnecting", inMs: wait });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), wait);
  }
}

module.exports = { LiveClient, decode, TOPICS };
