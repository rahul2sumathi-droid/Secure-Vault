const crypto = require('crypto');
const config = require('../config');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const newDataKey = () => crypto.randomBytes(32);

// Wrap/unwrap small secrets (data keys, TOTP secrets) with the master key. Output: base64(iv|tag|ciphertext)
function wrap(buf) {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv(ALGO, config.masterKey, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function unwrap(b64) {
  const raw = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv(ALGO, config.masterKey, raw.subarray(0, IV_LEN));
  d.setAuthTag(raw.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([d.update(raw.subarray(IV_LEN + TAG_LEN)), d.final()]);
}
const wrapText = (s) => wrap(Buffer.from(s, 'utf8'));
const unwrapText = (b64) => unwrap(b64).toString('utf8');

// File content encryption. `aad` binds ciphertext to its file+version so blobs cannot be swapped.
function encryptBuffer(plain, dataKey, aad) {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv(ALGO, dataKey, iv);
  c.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([c.update(plain), c.final()]);
  return { ciphertext, iv: iv.toString('base64'), authTag: c.getAuthTag().toString('base64') };
}
function decryptBuffer(ciphertext, dataKey, ivB64, tagB64, aad) {
  const d = crypto.createDecipheriv(ALGO, dataKey, Buffer.from(ivB64, 'base64'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([d.update(ciphertext), d.final()]); // throws if tampered
}

module.exports = { sha256, newDataKey, wrap, unwrap, wrapText, unwrapText, encryptBuffer, decryptBuffer };
