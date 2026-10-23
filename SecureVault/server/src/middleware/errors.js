const config = require('../config');

const notFound = (req, res) => res.status(404).json({ message: 'Route not found' });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  if (err.status && err.message) return res.status(err.status).json({ message: err.message, ...(err.extra || {}) });
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: `File is too large (limit ${Math.round(config.maxFileBytes / 1048576)} MB)` });
  }
  if (err.name === 'MulterError') return res.status(400).json({ message: 'Invalid upload' });
  if (err.name === 'ValidationError') return res.status(422).json({ message: 'Validation failed' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier' });
  if (err.code === 11000) return res.status(409).json({ message: 'That value already exists' });
  console.error('[error]', req.method, req.originalUrl, config.isProd ? err.message : err);
  return res.status(500).json({ message: 'Something went wrong on our side' }); // never leak internals
};

module.exports = { notFound, errorHandler };
