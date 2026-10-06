// F1 TV sign-in. The user logs in on formula1.com inside an app window; the site then sets a
// "login-session" cookie whose JSON holds the subscription token used for live car positions.
// The token is stored encrypted with the macOS keychain (safeStorage) and never leaves this machine.
const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, safeStorage, session } = require("electron");

const LOGIN_URL = "https://account.formula1.com/#/en/login?redirect=https%3A%2F%2Fwww.formula1.com%2Fen";
const PARTITION = "persist:f1login";

function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); } catch { return null; }
}

function tokenFromCookie(value) {
  try { return JSON.parse(decodeURIComponent(value))?.data?.subscriptionToken || null; } catch { return null; }
}

class Auth {
  constructor(dir) { this.file = path.join(dir, "f1tv-token.bin"); }

  save(token) {
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, "utf8");
    fs.writeFileSync(this.file, data, { mode: 0o600 });
  }

  load() {
    try {
      const buf = fs.readFileSync(this.file);
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
    } catch { return null; }
  }

  // Valid, unexpired token or null.
  async getToken() {
    const token = this.load();
    const claims = token && decodeJwt(token);
    if (!claims) return null;
    if (claims.exp && claims.exp * 1000 < Date.now() + 60e3) return null;
    return token;
  }

  async status() {
    const token = this.load(), claims = token && decodeJwt(token);
    if (!claims) return { signedIn: false };
    const expired = claims.exp && claims.exp * 1000 < Date.now();
    return { signedIn: !expired, expired: !!expired, expires: claims.exp ? claims.exp * 1000 : null,
             plan: claims.SubscribedProduct || claims.subscribedProduct || null };
  }

  // Opens the official login page; resolves with the status once the cookie appears or the window closes.
  login(parent) {
    return new Promise((resolve) => {
      const win = new BrowserWindow({ width: 520, height: 760, parent, modal: false, title: "F1 계정 로그인",
        webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
      const ses = session.fromPartition(PARTITION);
      let done = false;
      const finish = async () => { if (done) return; done = true; clearInterval(timer); if (!win.isDestroyed()) win.close(); resolve(await this.status()); };
      const timer = setInterval(async () => {
        const cookies = await ses.cookies.get({ name: "login-session" });
        const token = cookies.map((c) => tokenFromCookie(c.value)).find(Boolean);
        if (token) { this.save(token); finish(); }
      }, 1000);
      win.on("closed", finish);
      win.loadURL(LOGIN_URL);
    });
  }

  async logout() {
    try { fs.unlinkSync(this.file); } catch {}
    await session.fromPartition(PARTITION).clearStorageData();
    return { signedIn: false };
  }
}

module.exports = { Auth, decodeJwt, tokenFromCookie };
