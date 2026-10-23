// Creates server/.env from .env.example with freshly generated secrets.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
if (fs.existsSync(target)) {
  console.log('server/.env already exists - leaving it untouched.');
  process.exit(0);
}
let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
text = text
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${crypto.randomBytes(48).toString('hex')}`)
  .replace(/^MASTER_KEY=.*$/m, `MASTER_KEY=${crypto.randomBytes(32).toString('hex')}`);
fs.writeFileSync(target, text, { mode: 0o600 });
console.log('Created server/.env with new JWT_ACCESS_SECRET and MASTER_KEY.');
console.log('Back up MASTER_KEY: without it, previously encrypted files cannot be decrypted.');
