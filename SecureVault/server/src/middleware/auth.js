const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Session = require('../models/Session');
const { HttpError, wrap } = require('../utils/http');

const signAccessToken = (user, sessionId) =>
  jwt.sign({ sub: String(user._id), role: user.role, sid: String(sessionId), typ: 'access' }, config.jwtAccessSecret, {
    algorithm: 'HS256',
    expiresIn: config.accessTokenTtl,
  });

const signMfaToken = (user) =>
  jwt.sign({ sub: String(user._id), typ: 'mfa' }, config.jwtAccessSecret, { algorithm: 'HS256', expiresIn: '5m' });

const verifyToken = (token, typ) => {
  const p = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] });
  if (p.typ !== typ) throw new Error('wrong token type');
  return p;
};

// Verifies the bearer token, then re-checks the account and session in the DB on every request,
// so deactivation and "log out everywhere" take effect immediately.
const authenticate = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');
  let payload;
  try {
    payload = verifyToken(header.slice(7), 'access');
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  const [user, session] = await Promise.all([User.findById(payload.sub), Session.findById(payload.sid)]);
  if (!user || !user.isActive) throw new HttpError(401, 'Account unavailable');
  if (!session || session.revokedAt || session.expiresAt < new Date()) throw new HttpError(401, 'Session ended');
  req.user = user;
  req.sessionId = String(session._id);
  next();
});

const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Your role is not permitted to do this'));

module.exports = { authenticate, requireRole, signAccessToken, signMfaToken, verifyToken };
