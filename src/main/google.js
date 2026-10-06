// Google satellite imagery through the official Map Tiles API, with the user's own API key.
// Google's terms: tiles are kept in memory for this run only (no disk cache), and the Google logo and the
// copyright text for the viewed area must be shown – the renderer does both.
// Key storage: encrypted with the OS keychain (safeStorage) like the F1 TV token.
const fs = require("node:fs");
const path = require("node:path");
const { safeStorage } = require("electron");

const API = "https://tile.googleapis.com";

class GoogleTiles {
  constructor(dir) { this.file = path.join(dir, "google-maps-key.bin"); this.session = null; this.tiles = new Map(); }

  getKey() {
    try {
      const buf = fs.readFileSync(this.file);
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
    } catch { return null; }
  }
  // Saves (or with an empty key, removes) the key after checking it works. Returns { ok, message }.
  async setKey(key) {
    key = String(key || "").trim();
    this.session = null; this.tiles.clear();
    if (!key) { try { fs.unlinkSync(this.file); } catch {} return { ok: true, message: "API 키를 지웠어요." }; }
    try { await this.newSession(key); }
    catch (e) { return { ok: false, message: e.message }; }
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, "utf8");
    fs.writeFileSync(this.file, data, { mode: 0o600 });
    return { ok: true, message: "Google 위성 지도를 쓸 수 있어요." };
  }
  hasKey() { return !!this.getKey(); }

  async newSession(key = this.getKey()) {
    if (!key) throw new Error("Google Maps API 키가 없어요");
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
    this.session = { token: j.session, key, expiry: +j.expiry * 1000 || Date.now() + 12 * 3600e3, tileSize: j.tileWidth || 256 };
    return this.session;
  }
  async ready() {
    if (!this.session || this.session.expiry < Date.now() + 60e3) await this.newSession();
    return this.session;
  }

  async tile(z, x, y) {
    const id = `${z}/${x}/${y}`;
    if (this.tiles.has(id)) return this.tiles.get(id);
    const s = await this.ready();
    const res = await fetch(`${API}/v1/2dtiles/${z}/${x}/${y}?session=${encodeURIComponent(s.token)}&key=${encodeURIComponent(s.key)}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Google tile HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (this.tiles.size > 3000) this.tiles.clear();
    this.tiles.set(id, buf);
    return buf;
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
