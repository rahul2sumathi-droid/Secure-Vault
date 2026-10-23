const AuditLog = require('../models/AuditLog');
const { sha256 } = require('./crypto');
const stableStringify = require('../utils/stableStringify');

const GENESIS = '0'.repeat(64);
const s = (v) => (v === undefined || v === null ? '' : String(v));

function computeHash(d) {
  return sha256(
    stableStringify({
      seq: d.seq,
      prevHash: d.prevHash,
      timestamp: new Date(d.timestamp).toISOString(),
      userId: s(d.userId),
      userEmail: s(d.userEmail),
      userRole: s(d.userRole),
      action: d.action,
      outcome: s(d.outcome),
      fileId: s(d.fileId),
      fileName: s(d.fileName),
      targetUserId: s(d.targetUserId),
      targetEmail: s(d.targetEmail),
      ip: s(d.ip),
      userAgent: s(d.userAgent),
      details: d.details || {},
    })
  );
}

async function writeEntry(entry) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await AuditLog.findOne().sort({ seq: -1 }).select('seq hash').lean();
    const doc = { ...entry, seq: last ? last.seq + 1 : 1, prevHash: last ? last.hash : GENESIS, timestamp: new Date() };
    doc.hash = computeHash(doc);
    try {
      await AuditLog.create(doc);
      return;
    } catch (err) {
      if (err.code !== 11000) throw err; // duplicate seq (concurrent writer) -> retry
    }
  }
  throw new Error('Could not append audit entry');
}

// Serialize writes inside this process so the hash chain stays linear.
let queue = Promise.resolve();

/**
 * record(req, 'file_upload', { file, target, outcome, details, user, email })
 * Awaiting it guarantees the entry is stored before the response is sent.
 */
function record(req, action, opts = {}) {
  const u = opts.user || (req && req.user);
  const entry = {
    action,
    outcome: opts.outcome || 'success',
    userId: u && u._id,
    userEmail: (u && u.email) || opts.email,
    userRole: u && u.role,
    fileId: opts.file && opts.file._id,
    fileName: opts.file && opts.file.name,
    targetUserId: opts.target && opts.target._id,
    targetEmail: opts.target && opts.target.email,
    ip: req && req.ip,
    userAgent: ((req && req.headers && req.headers['user-agent']) || '').slice(0, 200),
    details: opts.details || {},
  };
  queue = queue.then(() => writeEntry(entry)).catch((err) => console.error('[audit] write failed:', err.message));
  return queue;
}

async function verifyChain() {
  let prev = GENESIS;
  let expectedSeq = 1;
  let checked = 0;
  for await (const d of AuditLog.find().sort({ seq: 1 }).lean().cursor()) {
    if (d.seq !== expectedSeq || d.prevHash !== prev || computeHash(d) !== d.hash) {
      return { valid: false, checked, brokenAtSeq: d.seq, headHash: prev };
    }
    prev = d.hash;
    expectedSeq += 1;
    checked += 1;
  }
  return { valid: true, checked, brokenAtSeq: null, headHash: prev };
}

module.exports = { record, verifyChain, computeHash, GENESIS };
