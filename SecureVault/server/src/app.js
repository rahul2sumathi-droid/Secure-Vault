const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const limits = require('./middleware/rateLimit');
const sanitize = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/errors');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');
if (config.isProd) app.set('trust proxy', 1); // behind a TLS-terminating reverse proxy

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'blob:'], // MFA QR (data:) and in-app previews (blob:)
    },
  },
}));
// Allow all origins when explicitly requested (useful for local dev/test).
if (config.allowAllOrigins) {
  console.warn('CORS: allowing all origins (ALLOW_ALL_ORIGINS=true)');
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
}
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(sanitize);
app.use('/api', limits.api);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use('/api', notFound);

// Optional: serve the built React app (npm run build) from the same origin.
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);
module.exports = app;
