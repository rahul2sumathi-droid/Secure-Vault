const mongoose = require('mongoose');
const path = require('path');

// Load server config (reads .env from server/)
const config = require('../src/config');
const AuditLog = require('../src/models/AuditLog');

async function run() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('Connected to MongoDB');

  const query = { $or: [{ seq: null }, { seq: { $exists: false } }] };
  const coll = AuditLog.collection;
  const count = await coll.countDocuments(query);
  console.log(`Found ${count} audit log(s) with null/missing seq.`);
  if (count === 0) {
    console.log('No action needed.');
    process.exit(0);
  }

  // Use the raw collection API to bypass Mongoose middleware (audit is append-only in the model)
  const res = await coll.deleteMany(query);
  console.log(`Deleted ${res.deletedCount} document(s).`);

  // Attempt to rebuild indexes to ensure server can start
  await AuditLog.syncIndexes();
  console.log('Indexes synced.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fix script failed:', err);
  process.exit(1);
});
