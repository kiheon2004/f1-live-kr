// Google imagery in memory only (v0.14 review): a key check that finishes after the key changed doesn't write over the
// new key's state; one tile asked for twice at once is one request; the byte count is what the cache holds.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { GoogleTiles } = require("../src/main/google.js");

const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const flush = () => new Promise((r) => setImmediate(r));
const memStorage = () => ({ isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from("enc:" + s), decryptString: (b) => b.toString().slice(4) });
const session = (name) => ({ ok: true, json: async () => ({ session: name, expiry: String(Date.now() / 1000 + 3600) }) });

test("google: a check still running when the key changes doesn't overwrite the new key's session or result", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-g-")), realFetch = global.fetch;
  const gates = [];
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("createSession")) { const g = deferred(); gates.push({ g, key: new URL(u).searchParams.get("key") }); return g.p; }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer };
  };
  try {
    const g = new GoogleTiles(dir, { storage: memStorage() });
    g.mem = "OLD";
    const checking = g.check();                       // asks Google about the old key …
    await flush();
    const setting = g.setKey("NEW");                  // … while the user saves a new one
    await flush();
    gates.find((x) => x.key === "NEW").g.resolve(session("S-NEW"));
    assert.strictEqual((await setting).ok, true);
    assert.strictEqual(g.session.token, "S-NEW");
    // the old check now fails (the old key was revoked): the new key's session and state stay
    gates.find((x) => x.key === "OLD").g.resolve({ ok: false, status: 403, json: async () => ({ error: { message: "API key not valid" } }) });
    const r = await checking;
    assert.strictEqual(g.session?.token, "S-NEW", "the new key's session is kept");
    assert.notStrictEqual(g.checked?.r?.ok, false, "the old key's failure isn't remembered as the new key's");
    assert.ok(r.ok || /바뀌/.test(r.message || ""), "the stale check says it was overtaken, or answers for the new key");
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});

test("google: one tile asked for twice at once is one download; the byte count is what's held", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f1kr-g-")), realFetch = global.fetch;
  let tileFetches = 0; const gate = deferred();
  global.fetch = async (url) => {
    if (String(url).includes("createSession")) return session("S");
    tileFetches++; await gate.p;
    return { ok: true, arrayBuffer: async () => new Uint8Array(1000).buffer };
  };
  try {
    const g = new GoogleTiles(dir, { storage: memStorage() });
    g.mem = "KEY";
    const a = g.tile(15, 1, 2), b = g.tile(15, 1, 2);
    await flush(); await flush(); gate.resolve();
    const [ba, bb] = await Promise.all([a, b]);
    assert.strictEqual(tileFetches, 1, "shared while in flight");
    assert.strictEqual(ba, bb);
    const sum = () => [...g.tiles.values()].reduce((s, x) => s + x.length, 0);
    assert.strictEqual(g.tileBytes, sum());
    // a failed download isn't kept in flight: asked again, it's tried again
    global.fetch = async (url) => (String(url).includes("createSession") ? session("S") : { ok: false, status: 500 });
    await assert.rejects(g.tile(15, 9, 9));
    let again = 0;
    global.fetch = async (url) => { if (String(url).includes("createSession")) return session("S"); again++; return { ok: true, arrayBuffer: async () => new Uint8Array(10).buffer }; };
    await g.tile(15, 9, 9);
    assert.strictEqual(again, 1);
    assert.strictEqual(g.tileBytes, sum());
    // a key change while a tile is in flight: the old answer isn't kept, the new key asks again
    const slow = deferred();
    global.fetch = async (url) => { if (String(url).includes("createSession")) return session("S2"); await slow.p; return { ok: true, arrayBuffer: async () => new Uint8Array(7).buffer }; };
    const old = g.tile(15, 3, 3); await flush();
    g.forget(); g.mem = "KEY2";
    const fresh = g.tile(15, 3, 3); await flush();
    slow.resolve();
    await assert.rejects(old);
    await fresh;
    assert.strictEqual(g.tiles.size, 1); assert.strictEqual(g.tileBytes, sum());
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});
