const AuditLog = require('../models/AuditLog');
const audit = require('../services/audit');
const { wrap } = require('../utils/http');

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter(q) {
  const f = {};
  if (q.action) f.action = String(q.action);
  if (q.outcome && ['success', 'failure', 'denied'].includes(q.outcome)) f.outcome = q.outcome;
  if (q.email) f.userEmail = { $regex: `^${esc(String(q.email).slice(0, 100))}`, $options: 'i' };
  if (q.fileId && /^[a-f\d]{24}$/i.test(q.fileId)) f.fileId = q.fileId;
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if ((from && !Number.isNaN(from)) || (to && !Number.isNaN(to))) {
    f.timestamp = {};
    if (from && !Number.isNaN(from)) f.timestamp.$gte = from;
    if (to && !Number.isNaN(to)) { to.setHours(23, 59, 59, 999); f.timestamp.$lte = to; }
  }
  return f;
}

exports.list = wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const filter = buildFilter(req.query);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ seq: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// Spreadsheet apps execute cells starting with = + - @ as formulas; neutralise them.
const csvCell = (v) => {
  let s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

exports.exportCsv = wrap(async (req, res) => {
  const rows = await AuditLog.find(buildFilter(req.query)).sort({ seq: -1 }).limit(50000).lean();
  const head = ['seq', 'timestamp', 'user', 'role', 'action', 'outcome', 'file', 'target', 'ip', 'details', 'hash'];
  const lines = [head.join(',')].concat(rows.map((r) =>
    [r.seq, r.timestamp.toISOString(), r.userEmail, r.userRole, r.action, r.outcome, r.fileName, r.targetEmail, r.ip, r.details, r.hash].map(csvCell).join(',')));
  await audit.record(req, 'audit_export', { details: { rows: rows.length } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audit-report.csv"', 'Cache-Control': 'no-store' });
  res.send(`\uFEFF${lines.join('\r\n')}`);
});

exports.verify = wrap(async (req, res) => {
  const result = await audit.verifyChain();
  await audit.record(req, 'audit_verify', { outcome: result.valid ? 'success' : 'failure', details: { checked: result.checked } });
  res.json(result);
});

exports.actions = wrap(async (_req, res) => res.json({ actions: (await AuditLog.distinct('action')).sort() }));
