const User = require('../models/User');
const File = require('../models/File');
const Session = require('../models/Session');
const Permission = require('../models/Permission');
const audit = require('../services/audit');
const { activePermissionQuery, cascadeRevoke } = require('../services/access');
const { HttpError, wrap } = require('../utils/http');

exports.listUsers = wrap(async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(500);
  res.json({ users });
});

exports.updateUser = wrap(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw new HttpError(404, 'User not found');
  const { role, isActive } = req.body;

  if (String(target._id) === String(req.user._id)) throw new HttpError(400, 'Admins cannot change their own role or status');

  if (role && role !== target.role) {
    if (['admin', 'auditor'].includes(role) && (await File.exists({ ownerId: target._id }))) {
      throw new HttpError(409, 'This user owns documents. Admin and Auditor accounts cannot hold documents (separation of duties).');
    }
    if (target.role === 'admin' && (await User.countDocuments({ role: 'admin', isActive: true })) <= 1) {
      throw new HttpError(409, 'There must be at least one active administrator');
    }
    const from = target.role;
    target.role = role;
    if (['admin', 'auditor'].includes(role)) {
      // Staff roles never hold document access.
      const grants = await Permission.find({ userId: target._id, revokedAt: null });
      for (const g of grants) { g.revokedAt = new Date(); await g.save(); }
    }
    await audit.record(req, 'user_role_changed', { target, details: { from, to: role } });
  }
  if (typeof isActive === 'boolean' && isActive !== target.isActive) {
    target.isActive = isActive;
    if (!isActive) await Session.updateMany({ userId: target._id, revokedAt: null }, { revokedAt: new Date() });
    await audit.record(req, isActive ? 'user_activated' : 'user_deactivated', { target });
  }
  await target.save();
  res.json({ user: target });
});

// Admins can review and revoke grants (metadata only - never document contents).
exports.listGrants = wrap(async (_req, res) => {
  const perms = await Permission.find(activePermissionQuery()).sort({ createdAt: -1 }).limit(500)
    .populate('userId', 'name email').populate('grantedBy', 'name').populate({ path: 'fileId', select: 'name ownerId', populate: { path: 'ownerId', select: 'name email' } });
  res.json({ grants: perms.filter((p) => p.fileId && p.userId).map((p) => ({
    _id: p._id, fileName: p.fileId.name, ownerEmail: p.fileId.ownerId && p.fileId.ownerId.email, userEmail: p.userId.email,
    view: p.view, download: p.download, edit: p.edit, reshare: p.reshare, expiresAt: p.expiresAt, grantedByName: p.grantedBy && p.grantedBy.name, createdAt: p.createdAt,
  })) });
});

exports.revokeGrant = wrap(async (req, res) => {
  const perm = await Permission.findOne({ _id: req.params.permId, revokedAt: null }).populate('fileId', 'name').populate('userId', 'email');
  if (!perm) throw new HttpError(404, 'Grant not found');
  perm.revokedAt = new Date();
  await perm.save();
  await cascadeRevoke(perm.fileId._id, perm.userId._id);
  await audit.record(req, 'share_revoke', { file: perm.fileId, target: perm.userId, details: { byAdmin: true } });
  res.status(204).end();
});
