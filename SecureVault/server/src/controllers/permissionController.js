const File = require('../models/File');
const Permission = require('../models/Permission');
const User = require('../models/User');
const audit = require('../services/audit');
const config = require('../config');
const { activePermissionQuery, cascadeRevoke } = require('../services/access');
const { safeSend } = require('../services/mailer');
const { HttpError, wrap } = require('../utils/http');

exports.list = wrap(async (req, res) => {
  const filter = activePermissionQuery({ fileId: req.doc._id });
  if (!req.access.owner) filter.grantedBy = req.user._id; // resharers only see grants they made
  const perms = await Permission.find(filter).populate('userId', 'name email').populate('grantedBy', 'name').sort({ createdAt: -1 });
  res.json({ permissions: perms.map((p) => ({
    _id: p._id, user: p.userId && { _id: p.userId._id, name: p.userId.name, email: p.userId.email },
    view: p.view, download: p.download, edit: p.edit, reshare: p.reshare, expiresAt: p.expiresAt,
    grantedByName: p.grantedBy && p.grantedBy.name, createdAt: p.createdAt,
  })) });
});

exports.share = wrap(async (req, res) => {
  const { email, download, edit, reshare } = req.body;
  const target = await User.findOne({ email, isActive: true });
  // Same message for "no such user" and "ineligible role" so the endpoint cannot be used to probe accounts.
  if (!target || ['admin', 'auditor'].includes(target.role)) throw new HttpError(404, 'No eligible user with that email');
  if (target._id.equals(req.doc.ownerId)) throw new HttpError(400, 'The owner already has full access');
  if (target._id.equals(req.user._id)) throw new HttpError(400, 'You cannot share a file with yourself');

  const grant = { view: true, download: !!download, edit: !!edit, reshare: !!reshare };
  if (!req.access.owner) {
    // Re-sharing can never exceed the grantor's own rights.
    if ((grant.download && !req.access.download) || (grant.edit && !req.access.edit)) throw new HttpError(403, 'You cannot grant permissions you do not have');
    if (grant.reshare) throw new HttpError(403, 'Only the owner can allow further resharing');
  }

  let expiresAt = null;
  if (req.body.expiresAt) {
    expiresAt = new Date(req.body.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new HttpError(422, 'Expiry must be a future date');
    if (expiresAt > new Date(Date.now() + 366 * 86400000)) throw new HttpError(422, 'Expiry cannot be more than one year away');
  }
  const own = req.access.permission && req.access.permission.expiresAt;
  if (!req.access.owner && own && (!expiresAt || expiresAt > own)) expiresAt = own; // cannot outlive the grantor's own access

  const existing = await Permission.findOne({ fileId: req.doc._id, userId: target._id });
  const wasActive = existing && !existing.revokedAt;
  if (wasActive && !req.access.owner && !existing.grantedBy.equals(req.user._id)) {
    throw new HttpError(403, 'This user already has access granted by someone else. Ask the owner to change it.');
  }
  const perm = existing || new Permission({ fileId: req.doc._id, userId: target._id });
  Object.assign(perm, grant, { expiresAt, grantedBy: req.user._id, revokedAt: null });
  await perm.save();

  await audit.record(req, wasActive ? 'share_update' : 'share_grant', {
    file: req.doc, target, details: { ...grant, expiresAt: expiresAt ? expiresAt.toISOString() : null },
  });
  safeSend({
    to: target.email,
    subject: `${req.user.name} shared "${req.doc.name}" with you`,
    text: `${req.user.name} gave you access to "${req.doc.name}" on SecureVault${expiresAt ? ` until ${expiresAt.toUTCString()}` : ''}.\nOpen it here: ${config.clientOrigin}/files/${req.doc._id}`,
  });
  res.status(wasActive ? 200 : 201).json({ message: wasActive ? 'Access updated' : 'File shared' });
});

exports.revoke = wrap(async (req, res) => {
  const perm = await Permission.findOne({ _id: req.params.permId, fileId: req.doc._id, revokedAt: null }).populate('userId', 'email');
  if (!perm) throw new HttpError(404, 'Permission not found');
  if (!req.access.owner && !perm.grantedBy.equals(req.user._id)) throw new HttpError(403, 'You can only revoke access you granted');
  perm.revokedAt = new Date();
  await perm.save();
  await cascadeRevoke(req.doc._id, perm.userId._id);
  await audit.record(req, 'share_revoke', { file: req.doc, target: perm.userId });
  res.status(204).end();
});
