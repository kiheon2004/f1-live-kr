// Secrets on disk (the F1 TV token, the Google Maps key): only ever encrypted with the OS keychain (Electron's
// safeStorage). Where encryption isn't available nothing is written – the caller keeps the secret in memory for
// this run – and a file is never read back as plain text.
// File format: "F1KR1\n" + safeStorage ciphertext. Files from before the header are ciphertext alone.
const fs = require("node:fs");

const MAGIC = Buffer.from("F1KR1\n");

// true when written; false when encryption isn't available (nothing is written then)
function saveSecret(file, text, ss) {
  if (!ss?.isEncryptionAvailable?.()) return false;
  fs.writeFileSync(file, Buffer.concat([MAGIC, ss.encryptString(text)]), { mode: 0o600 });
  return true;
}

// the secret, or null (no file, encryption not available, or not readable as our ciphertext)
function loadSecret(file, ss) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (!ss?.isEncryptionAvailable?.()) return null;
  const body = buf.subarray(0, MAGIC.length).equals(MAGIC) ? buf.subarray(MAGIC.length) : buf;
  try { return ss.decryptString(body); } catch { return null; }
}

function removeSecret(file) { try { fs.unlinkSync(file); } catch {} }

module.exports = { saveSecret, loadSecret, removeSecret, MAGIC };
