const rateLimit = require('express-rate-limit');

const make = (windowMs, limit, message) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { message } });

module.exports = {
  api: make(60 * 1000, 300, 'Too many requests. Please slow down.'),
  auth: make(15 * 60 * 1000, 30, 'Too many authentication attempts. Try again in a few minutes.'),
  refresh: make(15 * 60 * 1000, 300, 'Too many session refreshes.'),
  sensitive: make(60 * 60 * 1000, 10, 'Too many requests for this action. Try again later.'),
};
