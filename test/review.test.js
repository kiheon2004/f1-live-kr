// Tests for the problems found in the v0.9.5 code review (F1_LiveTimingKR_review.md): each one reproduces the
// reported failure and checks it no longer happens.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { merge, LiveSource } = require("../src/renderer/replay.js");

// ---------- H1: merge must not reach Object.prototype ----------
test("H1: a __proto__ key in feed data does not change Object.prototype", () => {
  try {
    merge({}, JSON.parse('{"__proto__":{"reviewPolluted":true}}'));
    merge({ Lines: {} }, JSON.parse('{"Lines":{"__proto__":{"reviewPolluted":true}}}'));
    merge({}, JSON.parse('{"constructor":{"prototype":{"reviewPolluted":true}}}'));
    merge([{}], JSON.parse('{"0":{"__proto__":{"reviewPolluted":true}}}'));
    assert.strictEqual({}.reviewPolluted, undefined);
    assert.strictEqual(Object.prototype.reviewPolluted, undefined);
  } finally { delete Object.prototype.reviewPolluted; }
});

test("H1: _deleted of the wrong shape is ignored; a proper one still deletes", () => {
  const s = { a: 1, b: 2, c: 3 };
  merge(s, { _deleted: "a" });                 // a string, not a list
  merge(s, { _deleted: [{ toString: () => "b" }] });
  merge(s, { _deleted: { 0: "b" } });
  assert.deepStrictEqual(s, { a: 1, b: 2, c: 3 });
  merge(s, { _deleted: ["a", "__proto__"] });
  assert.deepStrictEqual(s, { b: 2, c: 3 });
  assert.strictEqual(Object.getPrototypeOf(s), Object.prototype);
});

test("H1: inherited properties are not used as merge targets", () => {
  const s = merge({}, { toString: { x: 1 } });
  assert.deepStrictEqual(s.toString, { x: 1 });
  assert.strictEqual(typeof Object.prototype.toString, "function");
});

// ---------- H2: tile and cache paths ----------
const V = require("../src/main/validate.js");
const geo = require("../src/main/geo.js");

test("H2: tile coordinates must be whole numbers inside the zoom's grid", () => {
  assert.deepStrictEqual(V.tileArgs(15, 100, 200), [15, 100, 200]);
  for (const bad of [["../../..", "secret", ""], [-1, 0, 0], [23, 0, 0], [NaN, 0, 0], [2.5, 0, 0], [3, 8, 0], [3, 0, -1], ["15", 1, 1], [15, "1/../x", 1]])
    assert.throws(() => V.tileArgs(...bad), undefined, JSON.stringify(bad));
});

test("H2: getTile refuses to read a file outside the tile cache", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-tile-"));
  const cache = path.join(root, "a", "b", "cache");
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(root, "secret_"), "SECRET");
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error("no network in tests"); };
  try {
    await assert.rejects(geo.getTile(cache, "eox", "../../..", "secret", ""), /bad tile/);
    await assert.rejects(geo.getTile(cache, "__proto__", 1, 0, 0), /unknown tile source/);
    await assert.rejects(geo.getTile(cache, "constructor", 1, 0, 0), /unknown tile source/);
    // a proper tile still comes from the cache
    const dir = path.join(cache, "tiles", "eox", "3"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "1_2"), "TILE");
    assert.strictEqual(String(await geo.getTile(cache, "eox", 3, 1, 2)), "TILE");
  } finally { global.fetch = realFetch; fs.rmSync(root, { recursive: true, force: true }); }
});

test("H2: cache paths stay inside the cache; circuit keys and years are checked", async () => {
  assert.throws(() => V.inside("/tmp/cache", "../x"));
  assert.throws(() => V.inside("/tmp/cache", "/etc/passwd"));
  assert.strictEqual(V.inside("/tmp/cache", "tiles/eox/3/1_2"), path.resolve("/tmp/cache/tiles/eox/3/1_2"));
  assert.strictEqual(V.circuitKey(39), 39);
  assert.strictEqual(V.circuitKey("39"), 39);
  assert.throws(() => V.circuitKey("../../evil"));
  assert.throws(() => V.year("2025/../.."));
  const { getCircuit } = require("../src/main/circuit.js");
  await assert.rejects(getCircuit(os.tmpdir(), "../../evil", 2025), /bad circuit key/);
  assert.strictEqual(V.sessionPath("2025/2025-03-16_Australian_Grand_Prix/2025-03-16_Race/"), "2025/2025-03-16_Australian_Grand_Prix/2025-03-16_Race/");
  assert.throws(() => V.sessionPath("2025/../../etc/"));
  assert.throws(() => V.sessionPath("https://evil.example/x/y/"));
});

test("H2: IPC answers only the app's own page; only web links open externally", () => {
  const PAGE = "file:///app/src/renderer/index.html";
  const mainFrame = { url: PAGE }, win = { isDestroyed: () => false, webContents: { mainFrame } };
  assert.strictEqual(V.trustedSender(mainFrame, win, PAGE), true);
  assert.strictEqual(V.trustedSender({ url: PAGE }, win, PAGE), false);                         // a sub-frame
  assert.strictEqual(V.trustedSender({ url: "https://evil.example/" }, { ...win, webContents: { mainFrame: { url: "https://evil.example/" } } }, PAGE), false);
  assert.strictEqual(V.trustedSender(null, win, PAGE), false);
  assert.strictEqual(V.externalUrl("https://www.formula1.com/"), true);
  for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "smb://host/share", "x-apple.systempreferences:", "not a url"]) assert.strictEqual(V.externalUrl(bad), false, bad);
});

// ---------- H3 / M6 / M7: live connection lifecycle ----------
const { LiveClient, decode } = require("../src/main/live.js");
const RS = "\x1e";
class FakeWS extends EventEmitter {
  constructor(url) { super(); this.url = url; this.readyState = 0; this.sent = []; FakeWS.made.push(this); }
  send(x) { this.sent.push(x); }
  terminate() { this.readyState = 3; this.terminated = true; }
}
const deferred = () => { let resolve; const p = new Promise((r) => (resolve = r)); return { p, resolve }; };
const negotiateOk = () => ({ ok: true, headers: { getSetCookie: () => [] }, json: async () => ({ connectionToken: "tok" }) });
const flush = () => new Promise((r) => setImmediate(r));

test("H3: stopping while negotiate is pending makes no socket when the answer comes", async () => {
  FakeWS.made = [];
  const neg = deferred();
  const c = new LiveClient({ getToken: async () => null, WebSocketImpl: FakeWS, fetchImpl: () => neg.p });
  c.start(); await flush();
  c.stop();
  neg.resolve(negotiateOk()); await flush(); await flush();
  assert.strictEqual(c.stopped, true);
  assert.strictEqual(FakeWS.made.length, 0);
  assert.strictEqual(c.ws, null);
});

test("H3: stop → start while the old attempt is pending leaves exactly one socket, the new one", async () => {
  FakeWS.made = [];
  const answers = [deferred(), deferred()]; let n = 0;
  const c = new LiveClient({ getToken: async () => null, WebSocketImpl: FakeWS, fetchImpl: () => answers[n++].p });
  c.start(); await flush();
  c.stop(); c.start(); await flush();
  answers[1].resolve(negotiateOk()); await flush(); await flush();
  answers[0].resolve(negotiateOk()); await flush(); await flush();   // the old attempt answers last
  assert.strictEqual(FakeWS.made.length, 1);
  assert.strictEqual(c.ws, FakeWS.made[0]);
  c.stop();
});

test("H3: events from a replaced socket are ignored", async () => {
  FakeWS.made = [];
  const c = new LiveClient({ getToken: async () => null, WebSocketImpl: FakeWS, fetchImpl: async () => negotiateOk() });
  const feeds = []; c.on("feed", (t) => feeds.push(t));
  c.start(); await flush(); await flush();
  const old = FakeWS.made[0];
  c.retry = 0; c.connect(); await flush(); await flush();
  assert.strictEqual(FakeWS.made.length, 2);
  old.emit("message", Buffer.from(JSON.stringify({ type: 1, target: "feed", arguments: ["TrackStatus", { Status: "4" }] }) + RS));
  assert.deepStrictEqual(feeds, []);
  FakeWS.made[1].emit("message", Buffer.from(JSON.stringify({ type: 1, target: "feed", arguments: ["TrackStatus", { Status: "1" }] }) + RS));
  assert.deepStrictEqual(feeds, ["TrackStatus"]);
  c.stop();
});

test("M6: an open socket that never answers the subscription is dropped and retried", async (t) => {
  FakeWS.made = [];
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const c = new LiveClient({ getToken: async () => null, WebSocketImpl: FakeWS, fetchImpl: async () => negotiateOk() });
  const states = []; c.on("status", (s) => states.push(s.state));
  c.start(); await flush(); await flush();
  const ws = FakeWS.made[0]; ws.readyState = 1; ws.emit("open");
  ws.emit("message", Buffer.from(JSON.stringify({ type: 6 }) + RS));   // pings only
  t.mock.timers.tick(30001);
  assert.ok(ws.terminated, "socket dropped");
  assert.ok(states.includes("reconnecting"));
  c.stop();
});

test("M6: a refused SignalR handshake is handled like a refused subscription", async () => {
  FakeWS.made = [];
  const c = new LiveClient({ getToken: async () => null, WebSocketImpl: FakeWS, fetchImpl: async () => negotiateOk() });
  const states = []; c.on("status", (s) => states.push(s.state));
  c.start(); await flush(); await flush();
  FakeWS.made[0].emit("message", Buffer.from(JSON.stringify({ error: "Handshake was canceled." }) + RS));
  assert.ok(states.includes("error") && states.includes("reconnecting"));
  assert.ok(FakeWS.made[0].terminated);
  c.stop();
});

test("M7: malformed feed messages are skipped without throwing", async () => {
  const c = new LiveClient({ getToken: async () => null, WebSocketImpl: FakeWS, fetchImpl: async () => negotiateOk() });
  const feeds = []; c.on("feed", (t, d) => feeds.push([t, d]));
  const frames = [
    { type: 1, target: "feed", arguments: [] },
    { type: 1, target: "feed", arguments: [123, {}] },
    { type: 1, target: "feed", arguments: "nope" },
    { type: 1, target: "feed", arguments: ["Position.z", "not base64 deflate"] },
    { type: 3, invocationId: "1", result: "x" },
    null, 5,
    { type: 1, target: "feed", arguments: ["TrackStatus", { Status: "2" }] },
  ];
  assert.doesNotThrow(() => c.onFrames(frames.map((f) => JSON.stringify(f)).join(RS) + RS, false));
  assert.deepStrictEqual(feeds, [["TrackStatus", { Status: "2" }]]);
  assert.deepStrictEqual(decode(5, {}), [null, null]);
});

test("M7: a compressed message that unpacks to more than 32 MB is refused", () => {
  const zlib = require("node:zlib");
  const { inflateZ } = require("../src/main/archive.js");
  const bomb = zlib.deflateRawSync(Buffer.alloc(40 * 1024 * 1024, 0x20)).toString("base64");
  assert.throws(() => inflateZ(bomb), RangeError);
  assert.deepStrictEqual(inflateZ(zlib.deflateRawSync(Buffer.from('{"a":1}')).toString("base64")), { a: 1 });
});

// ---------- H4 / M5: live delay and queue ----------
test("H4: raising the delay never shows a clock earlier than the state on screen", () => {
  const ls = new LiveSource();
  ls.queue.push({ at: 1000, topic: "TrackStatus", data: { Status: "4", Message: "SCDeployed" } });
  ls.tick(1100);
  assert.strictEqual(ls.state.TrackStatus.Status, "4");
  ls.delayMs = 1000;                 // the viewer raises the delay by a second
  ls.tick(1200);
  assert.ok(ls.now() >= 1000, `clock ${ls.now()} is before the SC already shown (1000)`);
  ls.tick(2500);                     // once the delayed time passes it, the clock runs on
  assert.strictEqual(ls.now(), 1500);
  // an update newer than the delayed time waits
  ls.queue.push({ at: 2400, topic: "TrackStatus", data: { Status: "1", Message: "AllClear" } });
  ls.tick(3000);
  assert.strictEqual(ls.state.TrackStatus.Status, "4");
  ls.tick(3400);
  assert.strictEqual(ls.state.TrackStatus.Status, "1");
});

test("M5: a long pause keeps at most the longest supported delay queued", () => {
  const ls = new LiveSource();
  ls.maxDelayMs = 10000;
  ls.pause(0);
  for (let at = 0; at <= 30000; at += 100) ls.queue.push({ at, topic: "LapCount", data: { CurrentLap: 1 + Math.floor(at / 1000) } });
  ls.tick(30000);
  assert.ok(ls.queue.every((x) => x.at > 20000), "older than the max delay got applied");
  assert.strictEqual(ls.state.LapCount.CurrentLap, 21);
  // a short pause still holds the screen completely
  const s2 = new LiveSource(); s2.maxDelayMs = 600000; s2.pause(0);
  s2.queue.push({ at: 10, topic: "LapCount", data: { CurrentLap: 5 } });
  s2.tick(5000);
  assert.strictEqual(s2.state.LapCount, undefined);
});

// ---------- M1: no future knowledge when a replay seeks back ----------
const { StatusLog, PitLog, LapTracker, CarTracks } = require("../src/renderer/replay.js");

test("M1: a safety car period seen at 2 s ends on the lap reached by 2 s, not where it ended later", () => {
  const log = new StatusLog();
  log.feed(500, "LapCount", { CurrentLap: 1 });
  log.feed(1000, "TrackStatus", { Status: "4" });                    // SC on lap 1
  for (let lap = 2; lap <= 5; lap++) log.feed(lap * 2000 + 1000, "LapCount", { CurrentLap: lap });
  log.feed(10000, "TrackStatus", { Status: "1" });
  assert.deepStrictEqual(log.periods(2000).map((p) => [p.from, p.to]), [[1, 1]]);
  assert.deepStrictEqual(log.periods(7500).map((p) => [p.from, p.to]), [[1, 3]]);
  assert.deepStrictEqual(log.periods().map((p) => [p.from, p.to]), [[1, 5]]);
});

test("M1: a pit time corrected later shows its first value before the correction", () => {
  const log = new PitLog();
  log.feed(1000, "PitStopSeries", { PitTimes: { 44: [{ PitStop: { Lap: "10", PitStopTime: "2.4" } }] } });
  log.feed(1500, "PitLaneTimeCollection", { PitTimes: { 44: { Lap: "10", Duration: "22.1" } } });
  log.feed(9000, "PitLaneTimeCollection", { PitTimes: { 44: { Lap: "10", Duration: "25.0" } } });
  assert.deepStrictEqual(log.list("44", 1200).map((p) => [p.stop, p.lane]), [[2.4, undefined]]);
  assert.deepStrictEqual(log.list("44", 2000).map((p) => [p.stop, p.lane]), [[2.4, 22.1]]);
  assert.deepStrictEqual(log.list("44").map((p) => [p.stop, p.lane]), [[2.4, 25]]);
});

// ---------- M2 / M3: which lap a time belongs to ----------
test("M2: the same lap's time corrected is that lap again, not one more (and shows corrected only from then)", () => {
  const tr = new LapTracker();
  tr.feed(1000, { 1: { NumberOfLaps: 10, LastLapTime: { Value: "1:30.000" } } });
  tr.feed(2000, { 1: { NumberOfLaps: 10, LastLapTime: { Value: "1:29.000" } } });
  assert.deepStrictEqual(tr.laps("1").map((l) => [l.lap, l.time]), [[10, "1:29.000"]]);
  assert.deepStrictEqual(tr.laps("1", 1500).map((l) => [l.lap, l.time]), [[10, "1:30.000"]]);
  // a reconnect snapshot repeating the last lap changes nothing; an older counter neither
  tr.feed(3000, { 1: { NumberOfLaps: 10, LastLapTime: { Value: "1:29.000" } } });
  tr.feed(3500, { 1: { NumberOfLaps: 9, LastLapTime: { Value: "1:31.000" } } });
  assert.strictEqual(tr.laps("1").length, 1);
});

test("M3: the counter and an identical time arriving in separate messages still make a new lap", () => {
  const tr = new LapTracker();
  tr.feed(1000, { 1: { NumberOfLaps: 5, LastLapTime: { Value: "1:30.000" } } });
  tr.feed(2000, { 1: { NumberOfLaps: 6 } });
  tr.feed(2100, { 1: { LastLapTime: { Value: "1:30.000" } } });
  assert.deepStrictEqual(tr.laps("1").map((l) => [l.lap, l.time]), [[5, "1:30.000"], [6, "1:30.000"]]);
  // without counters a new time is the next lap, as before
  const t2 = new LapTracker();
  t2.feed(1, { 7: { LastLapTime: { Value: "1:40.000" } } }); t2.feed(2, { 7: { LastLapTime: { Value: "1:39.000" } } });
  assert.deepStrictEqual(t2.laps("7").map((l) => l.lap), [1, 2]);
});

// ---------- M4: long gaps in position data ----------
test("M4: inside a long gap the car is shown for 4 s after its last sample, then not at all", () => {
  const tr = new CarTracks();
  tr.push("1", 0, [10, 20, 0]); tr.push("1", 60000, [500, 600, 0]);
  const o = [0, 0, 0];
  assert.strictEqual(tr.at("1", 3000, o), true); assert.deepStrictEqual(o, [10, 20, 0]);
  assert.strictEqual(tr.at("1", 30000, o), false);
  assert.strictEqual(tr.at("1", 60000, o), true);
  // short gaps still interpolate
  tr.push("2", 0, [0, 0, 0]); tr.push("2", 250, [10, 0, 0]); tr.push("2", 500, [20, 0, 0]);
  assert.strictEqual(tr.at("2", 375, o), true); assert.ok(Math.abs(o[0] - 15) < 0.5);
});

// ---------- M10: Google sessions and key changes ----------
const { GoogleTiles } = require("../src/main/google.js");
const memStorage = () => ({ isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from("enc:" + s), decryptString: (b) => { const s = b.toString(); if (!s.startsWith("enc:")) throw new Error("bad"); return s.slice(4); } });

test("M10: parallel first tiles share one session; a key removed mid-request leaves no session or tile behind", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-g-"));
  const realFetch = global.fetch; let sessions = 0; const gate = deferred();
  global.fetch = async (url) => {
    if (String(url).includes("createSession")) { sessions++; await gate.p; return { ok: true, json: async () => ({ session: "S" + sessions, expiry: String(Date.now() / 1000 + 3600) }) }; }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  try {
    const g = new GoogleTiles(dir, { storage: memStorage() });
    g.mem = "KEY";
    const a = g.tile(1, 0, 0), b = g.tile(1, 1, 0);
    await flush(); gate.resolve();
    await Promise.all([a, b]);
    assert.strictEqual(sessions, 1);
    assert.strictEqual(g.tiles.size, 2);
    // key removed while a session request is out
    const gate2 = deferred(); sessions = 0;
    global.fetch = async (url) => { if (String(url).includes("createSession")) { sessions++; await gate2.p; return { ok: true, json: async () => ({ session: "OLD", expiry: String(Date.now() / 1000 + 3600) }) }; } return { ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer }; };
    g.forget(); g.mem = "KEY";
    const c = g.tile(2, 0, 0); await flush();
    await g.setKey("");                                   // removed
    gate2.resolve();
    await assert.rejects(c);
    assert.strictEqual(g.session, null);
    assert.strictEqual(g.tiles.size, 0);
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- M11: secrets are never written or read as plain text ----------
const { saveSecret, loadSecret, MAGIC } = require("../src/main/secret.js");
const { Auth, findLoginToken } = require("../src/main/auth.js");

test("M11: without OS encryption nothing is written; a plain-text file is never read back as the secret", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-s-")), file = path.join(dir, "k.bin");
  const off = { isEncryptionAvailable: () => false };
  try {
    assert.strictEqual(saveSecret(file, "SECRET", off), false);
    assert.strictEqual(fs.existsSync(file), false);
    fs.writeFileSync(file, "PLAINTEXT-KEY");                       // an old plain file
    assert.strictEqual(loadSecret(file, off), null);
    assert.strictEqual(loadSecret(file, memStorage()), null);      // not our ciphertext either
    assert.strictEqual(saveSecret(file, "SECRET", memStorage()), true);
    assert.ok(fs.readFileSync(file).subarray(0, MAGIC.length).equals(MAGIC));
    assert.strictEqual(loadSecret(file, memStorage()), "SECRET");
    fs.writeFileSync(file, Buffer.from("enc:LEGACY"));             // encrypted before the header existed
    assert.strictEqual(loadSecret(file, memStorage()), "LEGACY");
    // the token and the key are kept in memory for this run instead
    const a = new Auth(dir, { storage: off }); assert.strictEqual(a.save("T"), false); assert.strictEqual(a.load(), "T");
    const g = new GoogleTiles(dir, { storage: off }); g.mem = "K"; assert.strictEqual(g.getKey(), "K");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- M12: login cookies ----------
test("M12: an expired token or another site's cookie doesn't count as signed in", async () => {
  const jwt = (exp) => `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
  const cookie = (domain, token) => ({ domain, value: encodeURIComponent(JSON.stringify({ data: { subscriptionToken: token } })) });
  const ses = (list) => ({ cookies: { get: async () => list } });
  const now = Date.now() / 1000;
  assert.strictEqual(await findLoginToken(ses([cookie(".formula1.com", jwt(now - 3600))])), null);
  assert.strictEqual(await findLoginToken(ses([cookie("evil.example", jwt(now + 3600))])), null);
  assert.strictEqual(await findLoginToken(ses([cookie("formula1.com.evil.example", jwt(now + 3600))])), null);
  const good = jwt(now + 3600);
  assert.strictEqual(await findLoginToken(ses([cookie(".formula1.com", jwt(now - 10)), cookie("account.formula1.com", good)])), good);
});

// ---------- M14 / M15: Overture archive reads ----------
const { Pbf, range } = require("../src/main/overture.js");

test("M15: skipping an unknown length-delimited field skips its length prefix too", () => {
  // field 9 (wire type 2, 1 byte "X") then field 1 varint 150
  const buf = Buffer.from([0x4a, 0x01, 0x58, 0x08, 0x96, 0x01]);
  const seen = [];
  new Pbf(buf).fields((f, t, p) => { if (f === 1) seen.push(p.varint()); });
  assert.deepStrictEqual(seen, [150]);
  assert.throws(() => new Pbf(Buffer.from([0x80])).varint(), /truncated/);
  assert.throws(() => new Pbf(Buffer.from([0x0a, 0x05, 0x01])).fields(() => {}), /past the end/);
  assert.throws(() => new Pbf(Buffer.from([0x0b])).fields(() => {}), /wire type/);
});

test("M14: only a 206 answer for exactly the asked bytes is taken", async () => {
  const answer = (status, cr, body) => async () => ({ status, headers: { get: (h) => (h === "content-range" ? cr : null) }, arrayBuffer: async () => Buffer.from(body), body: { cancel: async () => {} } });
  assert.deepStrictEqual([...await range("u", 100, 4, answer(206, "bytes 100-103/999", [1, 2, 3, 4]))], [1, 2, 3, 4]);
  await assert.rejects(range("u", 100, 4, answer(200, null, [9, 9, 9, 9, 9, 9])), /ignored the byte range/);
  await assert.rejects(range("u", 100, 4, answer(206, "bytes 0-3/999", [1, 2, 3, 4])), /other bytes/);
  await assert.rejects(range("u", 100, 4, answer(206, "bytes 100-103/999", [1, 2])), /cut short/);
});

// ---------- #4: gap chart from per-lap gaps ----------
test("gap to the leader is recorded with each lap (F1's own value; lapped cars have none)", () => {
  const tr = new LapTracker();
  tr.feed(1000, { 1: { NumberOfLaps: 2, LastLapTime: { Value: "1:30.000" }, GapToLeader: "LAP 2" }, 44: { GapToLeader: "+3.250" } });
  tr.feed(4250, { 44: { NumberOfLaps: 2, LastLapTime: { Value: "1:31.000" } } });
  tr.feed(9000, { 20: { NumberOfLaps: 1, LastLapTime: { Value: "1:50.000" }, GapToLeader: "1L" } });
  assert.strictEqual(tr.laps("1")[0].gap, 0);
  assert.strictEqual(tr.laps("44")[0].gap, 3.25);
  assert.strictEqual(tr.laps("20")[0].gap, null);
});

// ---------- #5: cache pruning ----------
test("old session recordings are pruned past the limit, least recently used first", () => {
  const { Archive } = require("../src/main/archive.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-c-"));
  try {
    const a = new Archive(dir);
    const mk = (name, kb, ageH) => { const p = path.join(dir, name); fs.writeFileSync(p, Buffer.alloc(kb * 1024)); const t = new Date(Date.now() - ageH * 3600e3); fs.utimesSync(p, t, t); };
    mk("old_TimingData.jsonStream", 100, 50); mk("mid_TimingData.jsonStream", 100, 20); mk("new_TimingData.jsonStream", 100, 1); mk("2025_Index.json", 100, 99);
    assert.strictEqual(a.prune(1024 * 1024, 900 * 1024), 0);       // under the limit: nothing
    const freed = a.prune(250 * 1024, 150 * 1024);
    assert.strictEqual(freed, 200 * 1024);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["2025_Index.json", "new_TimingData.jsonStream"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("H2: the page check matches the app's page however its address is encoded (packaged app.asar path)", () => {
  const PAGE = "file:///Applications/LiveTimingKR.app/Contents/Resources/app.asar/src/renderer/index.html";
  const mk = (url) => { const mainFrame = { url }; return [mainFrame, { isDestroyed: () => false, webContents: { mainFrame } }]; };
  assert.strictEqual(V.trustedSender(...mk(PAGE + "#x"), PAGE), true);
  assert.strictEqual(V.trustedSender(...mk("file:///Users/a%20b/%EB%9D%BC/index.html"), "file:///Users/a b/라/index.html"), true);
  assert.strictEqual(V.trustedSender(...mk("file:///Applications/Other.app/index.html"), PAGE), false);
  assert.strictEqual(V.trustedSender(...mk("https://example.com/src/renderer/index.html"), PAGE), false);
});
