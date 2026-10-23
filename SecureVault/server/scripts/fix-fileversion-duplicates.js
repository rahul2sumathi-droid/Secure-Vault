const mongoose = require('mongoose');
const path = require('path');

// Load server config (reads .env from server/)
const config = require('../src/config');
const FileVersion = require('../src/models/FileVersion');

async function run() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('Connected to MongoDB');

  const query = { $or: [{ versionNo: null }, { versionNo: { $exists: false } }] };
  const coll = FileVersion.collection;
  const count = await coll.countDocuments(query);
  console.log(`Found ${count} file version(s) with null/missing versionNo.`);
  if (count === 0) {
    console.log('No action needed.');
    process.exit(0);
  }

  // Use the raw collection API to bypass Mongoose middleware
  const res = await coll.deleteMany(query);
  console.log(`Deleted ${res.deletedCount} document(s).`);

  // Attempt to rebuild indexes to ensure server can start
  await FileVersion.syncIndexes();
  console.log('Indexes synced.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fix script failed:', err);
  process.exit(1);
});
