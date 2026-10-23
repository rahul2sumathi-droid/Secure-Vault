process.env.MASTER_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'b'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('../src/services/crypto');
const { computeHash, GENESIS } = require('../src/services/audit');
const { passwordPolicy } = require('../src/utils/password');
const stable = require('../src/utils/stableStringify');

test('AES-256-GCM round trip', () => {
  const key = crypto.newDataKey();
  const plain = Buffer.from('confidential contract');
  const e = crypto.encryptBuffer(plain, key, 'f1:1');
  assert.notDeepStrictEqual(e.ciphertext, plain);
  assert.deepStrictEqual(crypto.decryptBuffer(e.ciphertext, key, e.iv, e.authTag, 'f1:1'), plain);
});

test('tampered ciphertext is rejected', () => {
  const key = crypto.newDataKey();
  const e = crypto.encryptBuffer(Buffer.from('hello world'), key, 'f1:1');
  e.ciphertext[0] ^= 0xff;
  assert.throws(() => crypto.decryptBuffer(e.ciphertext, key, e.iv, e.authTag, 'f1:1'));
});

test('ciphertext cannot be moved to another file/version (AAD binding)', () => {
  const key = crypto.newDataKey();
  const e = crypto.encryptBuffer(Buffer.from('hello'), key, 'f1:1');
  assert.throws(() => crypto.decryptBuffer(e.ciphertext, key, e.iv, e.authTag, 'f1:2'));
});

test('data key wrapping round trip, and wrapped keys differ each time', () => {
  const key = crypto.newDataKey();
  const a = crypto.wrap(key);
  assert.deepStrictEqual(crypto.unwrap(a), key);
  assert.notStrictEqual(a, crypto.wrap(key));
  assert.strictEqual(crypto.unwrapText(crypto.wrapText('JBSWY3DPEHPK3PXP')), 'JBSWY3DPEHPK3PXP');
});

test('audit hash chain detects any edit', () => {
  const base = { seq: 1, prevHash: GENESIS, timestamp: new Date('2026-01-01T00:00:00Z'), action: 'file_download', userEmail: 'a@b.c', details: { versionNo: 2 } };
  const h = computeHash(base);
  assert.strictEqual(computeHash({ ...base }), h);
  assert.notStrictEqual(computeHash({ ...base, userEmail: 'x@y.z' }), h);
  assert.notStrictEqual(computeHash({ ...base, details: { versionNo: 3 } }), h);
  assert.strictEqual(stable({ b: 1, a: { d: 1, c: 2 } }), '{"a":{"c":2,"d":1},"b":1}');
});

test('password policy', () => {
  assert.ok(passwordPolicy('SecureVault#2026'));
  assert.ok(!passwordPolicy('short1A'));
  assert.ok(!passwordPolicy('alllowercase123'));
});
