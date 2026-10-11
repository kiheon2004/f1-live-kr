// Google satellite imagery through the official Map Tiles API, with the user's own API key.
// Google's terms: tiles are kept in memory for this run only (no disk cache), and the Google logo and the
// copyright text for the viewed area must be shown – the renderer does both.
// Key storage: encrypted with the OS keychain (safeStorage) like the F1 TV token; in memory only where encryption
// isn't available (src/main/secret.js).
const path = require("node:path");
const { safeStorage } = require("electron");
const { saveSecret, loadSecret, removeSecret } = require("./secret");

const API = "https://tile.googleapis.com";
const TILE_BUDGET = 256 * 1024 * 1024;   // memory for this run's tiles

class GoogleTiles {
  // (gen goes up whenever the key changes: a session or tile asked for under an older key is dropped when it
  // arrives; concurrent requests share one session request; tiles are kept up to a byte budget, oldest first out)
  // (safeStorage can be swapped in tests)
  constructor(dir, { storage = safeStorage } = {}) {
    this.file = path.join(dir, "google-maps-key.bin"); this.session = null; this.tiles = new Map(); this.tileBytes = 0;
    this.gen = 0; this.pending = null; this.ss = storage; this.mem = null; this.inflight = new Map();
  }
  forget() { this.gen++; this.session = null; this.pending = null; this.tiles.clear(); this.tileBytes = 0; this.checked = null; this.inflight.clear(); }

  getKey() { return this.mem || loadSecret(this.file, this.ss); }
  // Saves (or with an empty key, removes) the key after checking it works. Returns { ok, message }.
  async setKey(key) {
    key = String(key || "").trim();
    this.forget();
    if (!key) { this.mem = null; removeSecret(this.file); return { ok: true, message: "API 키를 지웠어요." }; }
    const gen = this.gen;
    try { await this.newSession(key); }
    catch (e) { return { ok: false, message: e.message }; }
    if (gen !== this.gen) return { ok: false, message: "다른 키로 바뀌었어요." };
    this.mem = key;
    if (!saveSecret(this.file, key, this.ss)) return { ok: true, message: "Google 위성 지도를 쓸 수 있어요. 이 컴퓨터에서는 키를 암호화해 저장할 수 없어 이번 실행 동안만 기억해요." };
    return { ok: true, message: "Google 위성 지도를 쓸 수 있어요." };
  }
  hasKey() { return !!this.getKey(); }
  // Whether Google will serve tiles for the saved key right now: a fresh session, so a key deleted or an API
  // switched off in the Cloud console since it was saved shows up. Kept for a minute. Returns { hasKey, ok, message }.
  // (a check that finishes after the key changed – saved anew or removed meanwhile – answers with the current key's
  // state and writes nothing: its session or its failure was the old key's)
  async check() {
    if (!this.hasKey()) return { hasKey: false, ok: false, message: "저장된 Google Maps API 키가 없어요." };
    if (this.checked && Date.now() - this.checked.at < 60e3) return this.checked.r;
    const gen = this.gen;
    let r, failed = false;
    try { await this.newSession(); r = { hasKey: true, ok: true, message: "" }; }
    catch (e) { failed = true; r = { hasKey: true, ok: false, message: e.message }; }
    if (gen !== this.gen) {
      const ok = !!(this.session && this.session.gen === this.gen);
      return { hasKey: this.hasKey(), ok, message: ok ? "" : "Google Maps API 키가 바뀌었어요. 다시 확인해 주세요." };
    }
    if (failed) this.session = null;
    this.checked = { at: Date.now(), r };
    return r;
  }

  async newSession(key = this.getKey()) {
    if (!key) throw new Error("Google Maps API 키가 없어요");
    const gen = this.gen;
    const res = await fetch(`${API}/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapType: "satellite", language: "ko-KR", region: "KR" }), signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error?.message || msg; } catch {}
      const ko = /API key not valid/i.test(msg) ? "API 키가 올바르지 않아요."
        : /not been used|disabled|not enabled|SERVICE_DISABLED/i.test(msg) ? "이 키에서 Map Tiles API가 켜져 있지 않아요. Google Cloud 콘솔에서 Map Tiles API를 사용 설정해 주세요."
        : /billing/i.test(msg) ? "Google Cloud 프로젝트에 결제 계정이 연결되어 있지 않아요."
        : /referer|restricted|blocked/i.test(msg) ? "이 키에 걸린 사용 제한(웹사이트·앱 제한) 때문에 거부됐어요."
        : msg;
      throw new Error(`Google 지도 연결 실패: ${ko}`);
    }
    const j = await res.json();
    const session = { token: j.session, key, expiry: +j.expiry * 1000 || Date.now() + 12 * 3600e3, tileSize: j.tileWidth || 256, gen };
    if (gen !== this.gen) throw new Error("Google Maps API 키가 바뀌었어요");
    this.session = session;
    return session;
  }
  async ready() {
    if (this.session && this.session.gen === this.gen && this.session.expiry >= Date.now() + 60e3) return this.session;
    if (!this.pending) {
      const p = this.pending = this.newSession().finally(() => { if (this.pending === p) this.pending = null; });
    }
    return this.pending;
  }

  // (one tile asked for again while it's being downloaded shares that download – per key generation, so a download
  // under a key since changed is never handed to the new key; a failed one is tried again next time. tileBytes is the
  // sum of the tiles held: a tile stored again replaces its old bytes)
  tile(z, x, y) {
    const id = `${z}/${x}/${y}`;
    if (this.tiles.has(id)) { const b = this.tiles.get(id); this.tiles.delete(id); this.tiles.set(id, b); return Promise.resolve(b); }   // (most recently used last)
    const gen = this.gen, k = `${gen}:${id}`;
    if (this.inflight.has(k)) return this.inflight.get(k);
    const job = (async () => {
      const s = await this.ready();
      if (s.gen !== gen) throw new Error("Google Maps API 키가 바뀌었어요");
      const res = await fetch(`${API}/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(s.token)}&key=${encodeURIComponent(s.key)}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Google tile HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (gen !== this.gen) throw new Error("Google Maps API 키가 바뀌었어요");   // (not kept under a key since removed)
      const old = this.tiles.get(id);
      if (old) { this.tileBytes -= old.length; this.tiles.delete(id); }
      this.tiles.set(id, buf); this.tileBytes += buf.length;
      for (const [key, b] of this.tiles) { if (this.tileBytes <= TILE_BUDGET || key === id) break; this.tiles.delete(key); this.tileBytes -= b.length; }
      return buf;
    })();
    this.inflight.set(k, job);
    job.then(() => {}, () => {}).finally(() => { if (this.inflight.get(k) === job) this.inflight.delete(k); });
    return job;
  }

  // Copyright text Google requires for the area shown.
  async attribution(zoom, north, south, east, west) {
    const s = await this.ready();
    const q = new URLSearchParams({ session: s.token, key: s.key, zoom, north, south, east, west });
    const res = await fetch(`${API}/tile/v1/viewport?${q}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return "Google";
    return (await res.json()).copyright || "Google";
  }
}

module.exports = { GoogleTiles };
