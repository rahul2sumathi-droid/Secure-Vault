const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const config = require('../config');
const File = require('../models/File');
const FileVersion = require('../models/FileVersion');
const Permission = require('../models/Permission');
const audit = require('../services/audit');
const storage = require('../services/storage');
const { activePermissionQuery } = require('../services/access');
const { sha256, newDataKey, wrap: wrapKey, unwrap, encryptBuffer, decryptBuffer } = require('../services/crypto');
const { HttpError, wrap } = require('../utils/http');

// Memory storage: AES-GCM must authenticate the whole ciphertext, so each upload is buffered (capped by MAX_FILE_MB)
// and encrypted before anything touches the database.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxFileBytes, files: 1 } }).single('file');

const BLOCKED_EXT = ['.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.dll', '.ps1', '.vbs', '.jar'];
const INLINE_SAFE = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain' };

function cleanName(raw) {
  const decoded = Buffer.from(String(raw || 'file'), 'latin1').toString('utf8'); // multer decodes names as latin1
  const base = path.basename(decoded.replace(/\\/g, '/'));
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().slice(0, 180) || 'file';
}
const aadFor = (fileId, versionNo) => `${fileId}:${versionNo}`;

function readUpload(req) {
  if (!req.file) throw new HttpError(400, 'No file was uploaded');
  const name = cleanName(req.file.originalname);
  const ext = path.extname(name).toLowerCase();
  if (BLOCKED_EXT.includes(ext)) throw new HttpError(415, `Files of type ${ext} are not allowed`);
  if (req.file.size === 0) throw new HttpError(400, 'The file is empty');
  return { name, ext, buffer: req.file.buffer, mimeType: (req.file.mimetype || 'application/octet-stream').slice(0, 100) };
}

async function storeVersion({ file, dataKey, versionNo, buffer, name, mimeType, userId, comment, restoredFrom }) {
  const enc = encryptBuffer(buffer, dataKey, aadFor(file._id, versionNo));
  const gridFsId = await storage.putBlob(enc.ciphertext);
  try {
    return await FileVersion.create({
      fileId: file._id, versionNo, gridFsId, iv: enc.iv, authTag: enc.authTag, size: buffer.length,
      hash: sha256(buffer), originalName: name, mimeType, uploadedBy: userId, comment, restoredFrom,
    });
  } catch (err) {
    await storage.deleteBlob(gridFsId);
    throw err;
  }
}

const present = (f, access, extra = {}) => ({
  _id: f._id, name: f.name, mimeType: f.mimeType, size: f.size, currentVersion: f.currentVersion,
  ownerId: f.ownerId, createdAt: f.createdAt, updatedAt: f.updatedAt, ...extra,
  ...(access ? { access: { owner: access.owner, view: access.view, download: access.download, edit: access.edit, reshare: access.reshare } } : {}),
});

exports.upload = upload;

exports.create = wrap(async (req, res) => {
  const { name, buffer, mimeType } = readUpload(req);
  const _id = new mongoose.Types.ObjectId();
  const dataKey = newDataKey();
  const file = new File({ _id, ownerId: req.user._id, name, mimeType, size: buffer.length, currentVersion: 1, encKeyRef: wrapKey(dataKey) });
  const version = await storeVersion({ file, dataKey, versionNo: 1, buffer, name, mimeType, userId: req.user._id, comment: 'Initial upload' });
  try {
    await file.save();
  } catch (err) {
    await storage.deleteBlob(version.gridFsId);
    await FileVersion.deleteOne({ _id: version._id });
    throw err;
  }
  await audit.record(req, 'file_upload', { file, details: { size: buffer.length, sha256: version.hash } });
  res.status(201).json({ file: present(file, { owner: true, view: true, download: true, edit: true, reshare: true }) });
});

exports.list = wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const nameFilter = q ? { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
  const scope = req.query.scope === 'shared' ? 'shared' : 'mine';

  if (scope === 'mine') {
    const files = await File.find({ ownerId: req.user._id, ...nameFilter }).sort({ updatedAt: -1 }).limit(200);
    const counts = await Permission.aggregate([
      { $match: activePermissionQuery({ fileId: { $in: files.map((f) => f._id) } }) },
      { $group: { _id: '$fileId', n: { $sum: 1 } } },
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c.n]));
    return res.json({ files: files.map((f) => present(f, { owner: true, view: true, download: true, edit: true, reshare: true }, { sharedWith: map.get(String(f._id)) || 0 })) });
  }

  if (['admin', 'auditor'].includes(req.user.role)) return res.json({ files: [] });
  const perms = await Permission.find(activePermissionQuery({ userId: req.user._id })).populate('grantedBy', 'name');
  const files = await File.find({ _id: { $in: perms.map((p) => p.fileId) }, ...nameFilter }).populate('ownerId', 'name email').sort({ updatedAt: -1 });
  const byFile = new Map(perms.map((p) => [String(p.fileId), p]));
  res.json({
    files: files.map((f) => {
      const p = byFile.get(String(f._id));
      return present(f, { owner: false, view: p.view, download: p.download, edit: p.edit, reshare: p.reshare }, {
        ownerId: f.ownerId._id, ownerName: f.ownerId.name, ownerEmail: f.ownerId.email, expiresAt: p.expiresAt, sharedAt: p.updatedAt,
      });
    }),
  });
});

exports.get = wrap(async (req, res) => {
  const owner = await mongoose.model('User').findById(req.doc.ownerId).select('name email');
  res.json({ file: present(req.doc, req.access, { ownerName: owner && owner.name, ownerEmail: owner && owner.email, expiresAt: req.access.permission && req.access.permission.expiresAt }) });
});

exports.download = wrap(async (req, res) => {
  const inline = req.query.inline === '1';
  const versionNo = req.query.version ? parseInt(req.query.version, 10) : req.doc.currentVersion;
  const ver = Number.isInteger(versionNo) ? await FileVersion.findOne({ fileId: req.doc._id, versionNo }) : null;
  if (!ver) throw new HttpError(404, 'Version not found');

  const ext = path.extname(ver.originalName || req.doc.name).toLowerCase();
  const inlineType = INLINE_SAFE[ext];
  if (inline && !inlineType) throw new HttpError(415, 'Preview is not available for this file type. Use download instead.');

  let plain;
  try {
    const encrypted = await storage.getBlob(ver.gridFsId);
    plain = decryptBuffer(encrypted, unwrap(req.doc.encKeyRef), ver.iv, ver.authTag, aadFor(req.doc._id, ver.versionNo));
    if (sha256(plain) !== ver.hash) throw new Error('hash mismatch');
  } catch (err) {
    await audit.record(req, 'integrity_failure', { file: req.doc, outcome: 'failure', details: { versionNo } });
    throw new HttpError(500, 'This file failed its integrity check and was not released');
  }

  await audit.record(req, inline ? 'file_view' : 'file_download', { file: req.doc, details: { versionNo } });
  const filename = encodeURIComponent(ver.originalName || req.doc.name);
  res.set({
    'Content-Type': inline ? inlineType : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Length': plain.length,
  });
  res.send(plain);
});

exports.uploadVersion = wrap(async (req, res) => {
  const { name, buffer, mimeType } = readUpload(req);
  const comment = String(req.body.comment || '').slice(0, 300);
  const updated = await File.findByIdAndUpdate(req.doc._id, { $inc: { currentVersion: 1 } }, { new: true }); // atomic version numbers
  const version = await storeVersion({
    file: updated, dataKey: unwrap(req.doc.encKeyRef), versionNo: updated.currentVersion, buffer, name, mimeType, userId: req.user._id, comment,
  });
  await File.updateOne({ _id: updated._id }, { size: buffer.length, mimeType });
  await audit.record(req, 'file_version_upload', { file: req.doc, details: { versionNo: version.versionNo, size: buffer.length } });
  res.status(201).json({ version });
});

exports.listVersions = wrap(async (req, res) => {
  const versions = await FileVersion.find({ fileId: req.doc._id }).sort({ versionNo: -1 }).populate('uploadedBy', 'name email');
  res.json({ versions: versions.map((v) => ({
    versionNo: v.versionNo, size: v.size, hash: v.hash, originalName: v.originalName, comment: v.comment, restoredFrom: v.restoredFrom,
    createdAt: v.createdAt, uploadedBy: v.uploadedBy && { name: v.uploadedBy.name, email: v.uploadedBy.email }, current: v.versionNo === req.doc.currentVersion,
  })) });
});

// Restoring never rewrites history: the old content becomes a NEW version.
exports.restoreVersion = wrap(async (req, res) => {
  const no = parseInt(req.params.no, 10);
  const old = Number.isInteger(no) ? await FileVersion.findOne({ fileId: req.doc._id, versionNo: no }) : null;
  if (!old) throw new HttpError(404, 'Version not found');
  const dataKey = unwrap(req.doc.encKeyRef);
  let plain;
  try {
    plain = decryptBuffer(await storage.getBlob(old.gridFsId), dataKey, old.iv, old.authTag, aadFor(req.doc._id, no));
  } catch {
    throw new HttpError(500, 'That version failed its integrity check');
  }
  const updated = await File.findByIdAndUpdate(req.doc._id, { $inc: { currentVersion: 1 } }, { new: true });
  const version = await storeVersion({
    file: updated, dataKey, versionNo: updated.currentVersion, buffer: plain, name: old.originalName, mimeType: old.mimeType,
    userId: req.user._id, comment: `Restored from version ${no}`, restoredFrom: no,
  });
  await File.updateOne({ _id: updated._id }, { size: plain.length, mimeType: old.mimeType });
  await audit.record(req, 'file_version_restore', { file: req.doc, details: { restoredFrom: no, newVersion: version.versionNo } });
  res.status(201).json({ version });
});

exports.remove = wrap(async (req, res) => {
  const versions = await FileVersion.find({ fileId: req.doc._id }).select('gridFsId');
  await Promise.all(versions.map((v) => storage.deleteBlob(v.gridFsId)));
  await Promise.all([FileVersion.deleteMany({ fileId: req.doc._id }), Permission.deleteMany({ fileId: req.doc._id }), File.deleteOne({ _id: req.doc._id })]);
  await audit.record(req, 'file_delete', { file: req.doc, details: { versions: versions.length } }); // audit history is kept
  res.status(204).end();
});

exports.activity = wrap(async (req, res) => {
  const AuditLog = require('../models/AuditLog');
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const [items, total] = await Promise.all([
    AuditLog.find({ fileId: req.doc._id }).sort({ seq: -1 }).skip((page - 1) * 25).limit(25).select('-hash -prevHash -userAgent').lean(),
    AuditLog.countDocuments({ fileId: req.doc._id }),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / 25) });
});
