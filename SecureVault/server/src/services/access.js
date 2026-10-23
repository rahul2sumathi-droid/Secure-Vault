const Permission = require('../models/Permission');

const notExpired = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] });
const activePermissionQuery = (extra = {}) => ({ revokedAt: null, ...extra, ...notExpired() });

/**
 * The single place that decides what a user may do with a file.
 * - Owners have every permission on their own files.
 * - Everyone else needs an active (not revoked, not expired) Permission row.
 * - Admins and Auditors NEVER receive content access by role.
 * Returns null when the user has no access at all.
 */
async function resolveAccess(user, file) {
  if (!user || ['admin', 'auditor'].includes(user.role)) return null;
  if (file.ownerId.equals(user._id)) {
    return { owner: true, view: true, download: true, edit: true, reshare: true };
  }
  const p = await Permission.findOne(activePermissionQuery({ fileId: file._id, userId: user._id }));
  if (!p) return null;
  return { owner: false, view: p.view, download: p.download, edit: p.edit, reshare: p.reshare, permission: p };
}

// Revoking a user's access also revokes anything they re-shared.
async function cascadeRevoke(fileId, userId) {
  const children = await Permission.find({ fileId, grantedBy: userId, revokedAt: null });
  for (const c of children) {
    c.revokedAt = new Date();
    await c.save();
    await cascadeRevoke(fileId, c.userId);
  }
}

module.exports = { resolveAccess, activePermissionQuery, cascadeRevoke };
