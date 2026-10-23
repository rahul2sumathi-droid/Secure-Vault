const User = require('../models/User');
const File = require('../models/File');
const Permission = require('../models/Permission');
const AuditLog = require('../models/AuditLog');
const { activePermissionQuery } = require('../services/access');
const { wrap, HttpError } = require('../utils/http');

const dayAgo = () => new Date(Date.now() - 86400000);
const SECURITY_ACTIONS = ['login_failed', 'mfa_failed', 'access_denied', 'token_reuse_detected', 'integrity_failure', 'user_role_changed', 'user_deactivated'];

// Used by the share dialog. Only roles that may share can search; min 3 chars, 8 results, eligible recipients only.
exports.searchUsers = wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 3) return res.json({ users: [] });
  const users = await User.find({
    email: { $regex: `^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
    isActive: true, role: { $in: ['owner', 'collaborator'] }, _id: { $ne: req.user._id },
  }).select('name email').limit(8);
  res.json({ users });
});

exports.dashboard = wrap(async (req, res) => {
  const role = req.user.role;
  if (role === 'owner') {
    const files = await File.find({ ownerId: req.user._id }).select('_id size name updatedAt').sort({ updatedAt: -1 });
    const [sharedByMe, sharedWithMe] = await Promise.all([
      Permission.countDocuments(activePermissionQuery({ fileId: { $in: files.map((f) => f._id) } })),
      Permission.countDocuments(activePermissionQuery({ userId: req.user._id })),
    ]);
    return res.json({ role, stats: { files: files.length, storageBytes: files.reduce((a, f) => a + f.size, 0), sharedByMe, sharedWithMe }, recent: files.slice(0, 5) });
  }
  if (role === 'collaborator') {
    const soon = new Date(Date.now() + 7 * 86400000);
    const [sharedWithMe, expiringSoon] = await Promise.all([
      Permission.countDocuments(activePermissionQuery({ userId: req.user._id })),
      Permission.countDocuments({ userId: req.user._id, revokedAt: null, expiresAt: { $gt: new Date(), $lte: soon } }),
    ]);
    return res.json({ role, stats: { sharedWithMe, expiringSoon }, recent: [] });
  }
  if (role === 'admin' || role === 'auditor') {
    const [events24h, denied24h, failedLogins24h, recent] = await Promise.all([
      AuditLog.countDocuments({ timestamp: { $gte: dayAgo() } }),
      AuditLog.countDocuments({ timestamp: { $gte: dayAgo() }, outcome: 'denied' }),
      AuditLog.countDocuments({ timestamp: { $gte: dayAgo() }, action: 'login_failed' }),
      AuditLog.find({ action: { $in: SECURITY_ACTIONS } }).sort({ seq: -1 }).limit(8).select('timestamp userEmail action outcome ip').lean(),
    ]);
    const stats = { events24h, denied24h, failedLogins24h };
    if (role === 'admin') {
      const [users, active, mfa, locked] = await Promise.all([
        User.countDocuments(), User.countDocuments({ isActive: true }), User.countDocuments({ mfaEnabled: true }), User.countDocuments({ lockUntil: { $gt: new Date() } }),
      ]);
      Object.assign(stats, { users, activeUsers: active, mfaUsers: mfa, lockedUsers: locked });
    }
    return res.json({ role, stats, recent });
  }
  throw new HttpError(400, 'Unknown role');
});
