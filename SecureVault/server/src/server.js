const fs = require('fs');
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');

async function main() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('MongoDB connected');
  await mongoose.syncIndexes();

  const useTls = config.ssl.keyPath && config.ssl.certPath;
  const server = useTls
    ? https.createServer({ key: fs.readFileSync(config.ssl.keyPath), cert: fs.readFileSync(config.ssl.certPath) }, app)
    : http.createServer(app);
  server.listen(config.port, () => console.log(`SecureVault API on ${useTls ? 'https' : 'http'}://localhost:${config.port}`));
  if (!useTls && config.isProd) console.warn('WARNING: running without TLS. Terminate HTTPS at a reverse proxy in production.');
}

main().catch((err) => {
  console.error('Startup failed:', err.message);
  if (/ECONNREFUSED|selection/i.test(err.message)) console.error('Is MongoDB running? Start it or set MONGO_URI to a MongoDB Atlas connection string.');
  process.exit(1);
});
