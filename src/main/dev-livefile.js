// Development helper (not packaged): a stand-in for the live client that plays a cached session's own recorded messages
// in the order and at the pace they arrived, so the app's live path (LiveSource, the delay queue, the 3D view's live
// grid) can be checked when no session is running. It is not a live session: the hub's snapshot on connect is made by
// merging the recording up to the starting moment.
//   F1KR_LIVEFILE=2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-26_Race/  (a session path in the cache)
//   F1KR_LIVEFROM=-90   seconds from the race clock's first run (lights out) to start from (default −90)
//   F1KR_LIVESPEED=1    pace (1 = as recorded)
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { parseStream } = require("./archive");
const { merge } = require("../renderer/replay.js");

const TOPICS = ["Heartbeat", "SessionInfo", "SessionStatus", "DriverList", "TimingData", "TimingAppData", "RaceControlMessages", "TrackStatus", "LapCount", "ExtrapolatedClock", "WeatherData", "TimingStats", "PitLaneTimeCollection", "Position.z", "CarData.z"];

class LiveFile extends EventEmitter {
  constructor(cacheDir, sessionPath) {
    super();
    this.stopped = true; this.timer = null;
    const file = (topic) => path.join(cacheDir, (sessionPath + topic + ".jsonStream").replace(/\//g, "_"));
    const all = [];
    for (const topic of TOPICS) {
      let text = "";
      try { text = fs.readFileSync(file(topic), "utf8"); } catch { continue; }
      for (const [ms, data] of parseStream(text, topic.endsWith(".z"))) all.push({ ms, topic: topic.replace(/\.z$/, ""), data });
    }
    all.sort((a, b) => a.ms - b.ms);
    this.events = all;
    // (the hub stamps each feed message with its own UTC time – the feed's third argument; here from the recording's
    // heartbeats, as Replay.utcAt does)
    this.beats = all.filter((e) => e.topic === "Heartbeat" && e.data?.Utc).map((e) => [e.ms, Date.parse(/Z$/.test(e.data.Utc) ? e.data.Utc : e.data.Utc + "Z")]).filter((b) => Number.isFinite(b[1]));
    const start = all.find((e) => e.topic === "ExtrapolatedClock" && e.data.Extrapolating)?.ms ?? 0;
    this.from = start + (+(process.env.F1KR_LIVEFROM ?? -90)) * 1000;
    this.speed = +(process.env.F1KR_LIVESPEED || 1);
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false; this.bi = 0;   // (a restart plays from the start again: utcOf's cursor too)
    this.emit("status", { state: "connecting" });
    // the snapshot: every topic but the positions and telemetry merged up to the starting moment
    const snap = {};
    let i = 0;
    for (; i < this.events.length && this.events[i].ms < this.from; i++) {
      const e = this.events[i];
      if (e.topic === "Position" || e.topic === "CarData") continue;
      snap[e.topic] = merge(snap[e.topic], e.data);
    }
    setTimeout(() => {
      if (this.stopped) return;
      this.emit("snapshot", snap);
      this.emit("status", { state: "live", positions: true, authed: true, replayed: true });
      const t0 = Date.now(), m0 = this.from;
      const tick = () => {
        if (this.stopped) return;
        const now = m0 + (Date.now() - t0) * this.speed;
        while (i < this.events.length && this.events[i].ms <= now) { const e = this.events[i++]; this.emit("feed", e.topic, e.data, this.utcOf(e.ms)); }
        if (i < this.events.length) this.timer = setTimeout(tick, 20);
      };
      tick();
    }, 300);
  }
  utcOf(ms) {
    // (messages go out in time order: a cursor, not a search per message)
    const B = this.beats; let k = this.bi || 0;
    while (k + 1 < B.length && B[k + 1][0] <= ms) k++;
    this.bi = k; const b = B[k];
    return b ? new Date(b[1] + (ms - b[0])).toISOString() : null;
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.emit("status", { state: "stopped" }); }
  connect() {}
}
module.exports = { LiveFile };
