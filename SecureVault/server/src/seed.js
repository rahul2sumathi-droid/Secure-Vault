// Development-only demo accounts. Change these passwords if you ever expose the app.
const mongoose = require('mongoose');
const config = require('./config');
const User = require('./models/User');
const { hashPassword } = require('./utils/password');

const demo = [
  { name: 'Ada Admin', email: 'admin@securevault.local', role: 'admin' },
  { name: 'Olivia Owner', email: 'owner@securevault.local', role: 'owner' },
  { name: 'Colin Collaborator', email: 'collab@securevault.local', role: 'collaborator' },
  { name: 'Audrey Auditor', email: 'auditor@securevault.local', role: 'auditor' },
];

(async () => {
  if (config.isProd) throw new Error('Refusing to seed demo accounts in production.');
  await mongoose.connect(config.mongoUri);
  for (const u of demo) {
    if (await User.exists({ email: u.email })) { console.log(`exists   ${u.email}`); continue; }
    await User.create({ ...u, passwordHash: await hashPassword('SecureVault#2026') });
    console.log(`created  ${u.email}  (${u.role})`);
  }
  console.log('\nDemo password for all: SecureVault#2026');
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
