// F1 TV sign-in. The user logs in on formula1.com inside an app window; the site then sets a
// "login-session" cookie whose JSON holds the subscription token used for live car positions.
// The token is stored encrypted with the macOS keychain (safeStorage) and never leaves this machine; where
// encryption isn't available it's kept in memory for this run only (src/main/secret.js).
const path = require("node:path");
const { app, BrowserWindow, safeStorage, session } = require("electron");
const { saveSecret, loadSecret, removeSecret } = require("./secret");

const LOGIN_URL = "https://account.formula1.com/#/en/login?redirect=https%3A%2F%2Fwww.formula1.com%2Fen";
const PARTITION = "persist:f1login";
// a plain Chrome user agent (ASCII only: no app name, no Electron)
const PLAIN_UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || "142.0.0.0"} Safari/537.36`;

function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); } catch { return null; }
}

function tokenFromCookie(value) {
  try { return JSON.parse(decodeURIComponent(value))?.data?.subscriptionToken || null; } catch { return null; }
}
// a token that's still valid for at least a minute
function usable(token) {
  const claims = token && decodeJwt(token);
  return !!claims && !(claims.exp && claims.exp * 1000 < Date.now() + 60e3);
}
// the login cookie as F1's own sites set it (not one another site could have set in the same partition)
const f1Cookie = (c) => /(^|\.)formula1\.com$/i.test(String(c.domain || "").replace(/^\./, ""));

class Auth {
  // (safeStorage can be swapped in tests)
  constructor(dir, { storage = safeStorage } = {}) { this.file = path.join(dir, "f1tv-token.bin"); this.ss = storage; this.mem = null; }

  save(token) {
    this.mem = token;
    return saveSecret(this.file, token, this.ss);
  }

  load() { return this.mem || loadSecret(this.file, this.ss); }

  // Valid, unexpired token or null.
  async getToken() {
    const token = this.load();
    return usable(token) ? token : null;
  }

  async status() {
    const token = this.load(), claims = token && decodeJwt(token);
    if (!claims) return { signedIn: false };
    const expired = claims.exp && claims.exp * 1000 < Date.now();
    return { signedIn: !expired, expired: !!expired, expires: claims.exp ? claims.exp * 1000 : null,
             plan: claims.SubscribedProduct || claims.subscribedProduct || null };
  }

  // Opens the official login page; resolves with the status once a valid token's cookie appears or the window closes.
  // (one check at a time; a check still running when the window closes doesn't save afterwards; an expired token
  // left in the cookie from an earlier sign-in doesn't count; a failing check never leaves the promise hanging)
  login(parent) {
    return new Promise((resolve) => {
      const win = new BrowserWindow({ width: 520, height: 760, parent, modal: false, title: "F1 계정 로그인",
        webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
      const ses = session.fromPartition(PARTITION);
      // A record of the window's pages and F1's sign-in requests, for finding where a sign-in fails (signin-log.txt in the
      // app's data folder, the last attempt only): addresses with every value that could carry a code, a token or an
      // address blanked, the response codes, the error page's text – never what is typed, never a cookie or a header
      const logFile = path.join(path.dirname(this.file), "signin-log.txt"), lines = [], t0 = Date.now();
      const clean = (u) => String(u || "").replace(/([?&#](code|state|nonce|code_challenge|id_token|access_token|token|session|email|username|login_hint|sid|flowId|interactionId)=)[^&#]*/gi, "$1…").slice(0, 300);
      const log = (...a) => { lines.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${a.join(" ")}`); try { require("node:fs").writeFileSync(logFile, lines.join("\n") + "\n"); } catch {} };
      log("open", app.getVersion(), "locale", app.getLocale(), "ua", PLAIN_UA);
      const onDone = (d) => { if (d.resourceType === "mainFrame" || /formula1\.com\/(as|davinci)\/|pingone|authorize|subscriber|authenticate|\/v\d\/account/i.test(d.url)) log("req", d.statusCode ?? d.error, d.method, d.resourceType, clean(d.url)); };
      ses.webRequest.onCompleted({ urls: ["*://*/*"] }, onDone);
      ses.webRequest.onErrorOccurred({ urls: ["*://*/*"] }, (d) => { if (d.resourceType === "mainFrame") onDone(d); });
      win.webContents.on("did-navigate", (_e, url, code) => log("page", code, clean(url)));
      win.webContents.on("did-fail-load", (_e, code, desc, url) => log("fail", code, desc, clean(url)));
      win.webContents.on("did-finish-load", async () => { const t = await win.webContents.executeJavaScript("document.body ? document.body.innerText.slice(0, 300) : ''").catch(() => ""); if (/UNEXPECTED_ERROR|error/i.test(t) && t.length < 300) log("errorpage", clean(win.webContents.getURL()), JSON.stringify(t.replace(/\s+/g, " "))); });
      // (the window presents itself as plain Chrome, the version it is built on: Electron puts the app's own name in the
      // user agent – "라이브타이밍KR/0.31.0", not ASCII –, and F1's new sign-in service (id.formula1.com/as/authorize)
      // answered every such request with HTTP 500 {"code":"UNEXPECTED_ERROR"} – seen in signin-log.txt on 2026-10-16)
      win.webContents.setUserAgent(PLAIN_UA); ses.setUserAgent(PLAIN_UA);
      let done = false, busy = false;
      const finish = async () => {
        if (done) return; done = true; clearInterval(timer);
        if (!win.isDestroyed()) win.close();
        let st; try { st = await this.status(); } catch { st = { signedIn: false }; }
        resolve(st);
      };
      const timer = setInterval(async () => {
        if (busy || done) return;
        busy = true;
        try {
          const token = await findLoginToken(ses);
          if (token && !done) { this.save(token); finish(); }
        } catch (e) { console.warn("login check failed:", e.message); }
        finally { busy = false; }
      }, 1000);
      win.on("closed", finish);
      // A clean start: F1 moved its sign-in to a new service (id.formula1.com, 2026-10) that answers a window still
      // holding the old sign-in's cookies with {"code":"UNEXPECTED_ERROR"} at once – while a fresh one shows the form.
      // The window's data is cleared before it opens (the saved token is a file of its own); should that error page come
      // up anyway, it's cleared and the sign-in page loaded again, once.
      let retried = false;
      win.webContents.on("did-finish-load", async () => {
        if (retried || done || win.isDestroyed()) return;
        const text = await win.webContents.executeJavaScript("document.body ? document.body.innerText.slice(0, 400) : ''").catch(() => "");
        if (/UNEXPECTED_ERROR/.test(text)) { retried = true; await ses.clearStorageData().catch(() => {}); if (!win.isDestroyed()) win.loadURL(LOGIN_URL).catch(() => {}); }
      });
      ses.clearStorageData().catch(() => {}).then(() => { if (!win.isDestroyed()) win.loadURL(LOGIN_URL).catch(() => {}); });
    });
  }

  async logout() {
    this.mem = null; removeSecret(this.file);
    await session.fromPartition(PARTITION).clearStorageData();
    return { signedIn: false };
  }
}

// the subscription token from F1's login cookie, if there's a usable one
async function findLoginToken(ses) {
  const cookies = await ses.cookies.get({ name: "login-session" });
  return cookies.filter(f1Cookie).map((c) => tokenFromCookie(c.value)).find(usable) || null;
}

module.exports = { Auth, decodeJwt, tokenFromCookie, findLoginToken, usable };
