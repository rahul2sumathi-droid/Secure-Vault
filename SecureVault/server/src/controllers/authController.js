const crypto = require('crypto');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');
const config = require('../config');
const User = require('../models/User');
const Session = require('../models/Session');
const audit = require('../services/audit');
const { sha256, wrapText, unwrapText } = require('../services/crypto');
const { sendMail } = require('../services/mailer');
const { signAccessToken, signMfaToken, verifyToken } = require('../middleware/auth');
const { hashPassword, verifyPassword, DUMMY_HASH } = require('../utils/password');
const bcrypt = require('bcryptjs');
const { HttpError, wrap } = require('../utils/http');

authenticator.options = { window: 1 };

const COOKIE = 'sv_refresh';
const cookieOpts = () => ({
  httpOnly: true,
  secure: config.isProd || Boolean(config.ssl.keyPath),
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: config.refreshTokenDays * 86400 * 1000,
});
const safeEqual = (a, b) => {
  const x = Buffer.from(a || '');
  const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function startSession(user, req, res) {
  const token = crypto.randomBytes(48).toString('base64url');
  const session = await Session.create({
    userId: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + config.refreshTokenDays * 86400 * 1000),
    ip: req.ip,
    userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    lastUsedAt: new Date(),
  });
  res.cookie(COOKIE, `${session._id}.${token}`, cookieOpts());
  user.lastLoginAt = new Date();
  await user.save();
  return { accessToken: signAccessToken(user, session._id), user };
}

const registerFailure = async (user) => {
  user.failedLogins += 1;
  if (user.failedLogins >= config.maxLoginAttempts) {
    user.lockUntil = new Date(Date.now() + config.lockMinutes * 60000);
    user.failedLogins = 0;
  }
  await user.save();
};

exports.register = wrap(async (req, res) => {
  const { name, email, password } = req.body;
  const role = ['owner', 'collaborator'].includes(req.body.role) ? req.body.role : 'owner'; // admin/auditor are assigned by an admin
  if (await User.exists({ email })) {
    throw new HttpError(409, 'An account with this email already exists');
  }
  const user = await User.create({ name, email, role, passwordHash: await hashPassword(password) });
  await audit.record(req, 'register', { user, details: { role } });
  res.status(201).json({ message: 'Account created. You can sign in now.' });
});

exports.login = wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const locked = user && user.lockUntil && user.lockUntil > new Date();
  const ok = await verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !ok || locked) {
    if (user && !locked) await registerFailure(user);
    await audit.record(req, 'login_failed', { email, user: user || undefined, outcome: 'failure', details: { locked: Boolean(locked) } });
    throw new HttpError(401, 'Invalid credentials, or the account is temporarily locked');
  }
  if (!user.isActive) {
    await audit.record(req, 'login_failed', { user, outcome: 'denied', details: { reason: 'deactivated' } });
    throw new HttpError(403, 'This account has been deactivated. Contact an administrator.');
  }
  user.failedLogins = 0;
  user.lockUntil = undefined;

  if (user.mfaEnabled) {
    await user.save();
    return res.json({ mfaRequired: true, mfaToken: signMfaToken(user) });
  }
  const session = await startSession(user, req, res);
  await audit.record(req, 'login_success', { user, details: { mfa: false } });
  res.json(session);
});

exports.verifyMfa = wrap(async (req, res) => {
  let payload;
  try {
    payload = verifyToken(req.body.mfaToken, 'mfa');
  } catch {
    throw new HttpError(401, 'Your sign-in attempt expired. Please enter your password again.');
  }
  const user = await User.findById(payload.sub).select('+mfaSecretEnc +lastTotpStep +recoveryCodes');
  if (!user || !user.isActive || !user.mfaEnabled) throw new HttpError(401, 'Sign-in failed');
  if (user.lockUntil && user.lockUntil > new Date()) throw new HttpError(401, 'Invalid code, or the account is temporarily locked');

  const code = String(req.body.code).trim();
  let method = null;

  if (/^\d{6}$/.test(code)) {
    const delta = authenticator.checkDelta(code, unwrapText(user.mfaSecretEnc));
    if (delta !== null) {
      const step = Math.floor(Date.now() / 30000) + delta;
      if (step > user.lastTotpStep) {
        user.lastTotpStep = step; // a code can only be used once
        method = 'totp';
      }
    }
  } else {
    const normalized = code.toLowerCase().replace(/[\s-]/g, '');
    for (const rc of user.recoveryCodes) {
      if (!rc.usedAt && (await bcrypt.compare(normalized, rc.hash))) {
        rc.usedAt = new Date();
        method = 'recovery';
        break;
      }
    }
  }

  if (!method) {
    await registerFailure(user);
    await audit.record(req, 'mfa_failed', { user, outcome: 'failure' });
    throw new HttpError(401, 'Invalid or already-used code');
  }
  const session = await startSession(user, req, res);
  const remaining = user.recoveryCodes.filter((r) => !r.usedAt).length;
  await audit.record(req, 'login_success', { user, details: { mfa: true, method } });
  res.json({ ...session, recoveryCodesRemaining: method === 'recovery' ? remaining : undefined });
});

// Rotating refresh tokens with reuse detection.
exports.refresh = wrap(async (req, res) => {
  const fail = () => {
    res.clearCookie(COOKIE, { path: '/api/auth' });
    throw new HttpError(401, 'Session expired');
  };
  const raw = req.cookies[COOKIE];
  if (!raw || !raw.includes('.')) return fail();
  const [sid, token] = raw.split('.');
  const session = /^[a-f\d]{24}$/i.test(sid) ? await Session.findById(sid) : null;
  if (!session || session.revokedAt || session.expiresAt < new Date()) return fail();

  const user = await User.findById(session.userId);
  if (!user || !user.isActive) return fail();
  const hash = sha256(token);

  if (safeEqual(hash, session.tokenHash)) {
    const next = crypto.randomBytes(48).toString('base64url');
    session.prevTokenHash = session.tokenHash;
    session.tokenHash = sha256(next);
    session.rotatedAt = new Date();
    session.lastUsedAt = new Date();
    session.expiresAt = new Date(Date.now() + config.refreshTokenDays * 86400 * 1000);
    await session.save();
    res.cookie(COOKIE, `${session._id}.${next}`, cookieOpts());
    return res.json({ accessToken: signAccessToken(user, session._id), user });
  }
  // The previous token arriving within a few seconds is almost certainly a second browser tab racing us.
  if (session.prevTokenHash && safeEqual(hash, session.prevTokenHash) && Date.now() - session.rotatedAt < 10000) {
    return res.json({ accessToken: signAccessToken(user, session._id), user });
  }
  // Otherwise an old token was replayed: assume theft and kill the session.
  session.revokedAt = new Date();
  await session.save();
  await audit.record(req, 'token_reuse_detected', { user, outcome: 'denied' });
  return fail();
});

exports.logout = wrap(async (req, res) => {
  const raw = req.cookies[COOKIE];
  if (raw && raw.includes('.')) {
    const sid = raw.split('.')[0];
    if (/^[a-f\d]{24}$/i.test(sid)) {
      const s = await Session.findOneAndUpdate({ _id: sid, revokedAt: null }, { revokedAt: new Date() });
      if (s) {
        const user = await User.findById(s.userId);
        await audit.record(req, 'logout', { user });
      }
    }
  }
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.status(204).end();
});

exports.logoutAll = wrap(async (req, res) => {
  await Session.updateMany({ userId: req.user._id, revokedAt: null }, { revokedAt: new Date() });
  await audit.record(req, 'logout_all');
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.status(204).end();
});

exports.me = (req, res) => res.json({ user: req.user });

exports.listSessions = wrap(async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 });
  res.json({
    sessions: sessions.map((s) => ({
      id: s._id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      current: String(s._id) === req.sessionId,
    })),
  });
});

exports.revokeSession = wrap(async (req, res) => {
  const s = await Session.findOneAndUpdate({ _id: req.params.id, userId: req.user._id, revokedAt: null }, { revokedAt: new Date() });
  if (!s) throw new HttpError(404, 'Session not found');
  await audit.record(req, 'session_revoked', { details: { sessionId: req.params.id } });
  res.status(204).end();
});

// ---------- MFA enrolment ----------
exports.mfaSetup = wrap(async (req, res) => {
  if (req.user.mfaEnabled) throw new HttpError(409, 'MFA is already enabled');
  const secret = authenticator.generateSecret();
  await User.updateOne({ _id: req.user._id }, { mfaPendingSecretEnc: wrapText(secret) });
  const otpauthUrl = authenticator.keyuri(req.user.email, 'SecureVault', secret);
  res.json({ secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) });
});

exports.mfaEnable = wrap(async (req, res) => {
  const user = await User.findById(req.user._id).select('+mfaPendingSecretEnc');
  if (user.mfaEnabled) throw new HttpError(409, 'MFA is already enabled');
  if (!user.mfaPendingSecretEnc) throw new HttpError(400, 'Start MFA setup first');
  const secret = unwrapText(user.mfaPendingSecretEnc);
  const delta = authenticator.checkDelta(String(req.body.code).trim(), secret);
  if (delta === null) throw new HttpError(401, 'That code is not valid. Check your authenticator app and try again.');

  const plain = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex')); // 10 hex chars, 40 bits each
  user.mfaSecretEnc = wrapText(secret);
  user.mfaPendingSecretEnc = undefined;
  user.lastTotpStep = Math.floor(Date.now() / 30000) + delta;
  user.recoveryCodes = await Promise.all(plain.map(async (c) => ({ hash: await bcrypt.hash(c, 10) })));
  user.mfaEnabled = true;
  await user.save();
  await audit.record(req, 'mfa_enabled');
  // Shown once. Only hashes are stored.
  res.json({ recoveryCodes: plain });
});

exports.mfaDisable = wrap(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash +mfaSecretEnc');
  if (!user.mfaEnabled) throw new HttpError(409, 'MFA is not enabled');
  if (!(await verifyPassword(req.body.password, user.passwordHash))) throw new HttpError(401, 'Incorrect password');
  if (authenticator.checkDelta(String(req.body.code).trim(), unwrapText(user.mfaSecretEnc)) === null) {
    throw new HttpError(401, 'Invalid authenticator code');
  }
  user.mfaEnabled = false;
  user.mfaSecretEnc = undefined;
  user.recoveryCodes = [];
  await user.save();
  await audit.record(req, 'mfa_disabled');
  res.json({ message: 'Multi-factor authentication disabled' });
});

// ---------- Password reset / change ----------
exports.forgotPassword = wrap(async (req, res) => {
  const generic = { message: 'If an account exists for that email, a reset link has been sent.' };
  const user = await User.findOne({ email: req.body.email, isActive: true });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(token);
    user.resetTokenExpires = new Date(Date.now() + config.resetTokenMinutes * 60000);
    await user.save();
    await audit.record(req, 'password_reset_requested', { user });
    await sendMail({
      to: user.email,
      subject: 'Reset your SecureVault password',
      text: `Use this link within ${config.resetTokenMinutes} minutes (single use):\n${config.clientOrigin}/reset-password?token=${token}\n\nIf you did not request this, ignore this email.`,
    }).catch((e) => console.error('[mail] failed:', e.message));
  }
  res.json(generic); // identical response either way: no account enumeration
});

exports.resetPassword = wrap(async (req, res) => {
  const user = await User.findOne({
    resetTokenHash: sha256(req.body.token),
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires');
  if (!user) throw new HttpError(400, 'This reset link is invalid or has expired');
  user.passwordHash = await hashPassword(req.body.password);
  user.resetTokenHash = undefined; // single use
  user.resetTokenExpires = undefined;
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();
  await Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await audit.record(req, 'password_reset', { user });
  res.json({ message: 'Password updated. Please sign in.' });
});

exports.changePassword = wrap(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(req.body.currentPassword, user.passwordHash))) throw new HttpError(401, 'Current password is incorrect');
  user.passwordHash = await hashPassword(req.body.newPassword);
  await user.save();
  await Session.updateMany({ userId: user._id, revokedAt: null, _id: { $ne: req.sessionId } }, { revokedAt: new Date() });
  await audit.record(req, 'password_changed');
  res.json({ message: 'Password changed. Other devices were signed out.' });
});
