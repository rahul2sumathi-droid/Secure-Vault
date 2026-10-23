const { Schema, model } = require('mongoose');

// Append-only, hash-chained audit trail. Each entry's hash covers the previous entry's hash,
// so editing or removing a record in the middle breaks verification.
const auditSchema = new Schema(
  {
    seq: { type: Number, required: true, unique: true },
    timestamp: { type: Date, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, index: true },
    userEmail: String,
    userRole: String,
    action: { type: String, required: true, index: true },
    outcome: { type: String, enum: ['success', 'failure', 'denied'], default: 'success' },
    fileId: { type: Schema.Types.ObjectId, index: true },
    fileName: String,
    targetUserId: Schema.Types.ObjectId,
    targetEmail: String,
    ip: String,
    userAgent: String,
    details: { type: Schema.Types.Mixed, default: {} },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  { minimize: false, versionKey: false }
);

const blocked = function () {
  throw new Error('AuditLog is append-only: updates and deletes are not permitted.');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  auditSchema.pre(op, blocked)
);
auditSchema.pre('deleteOne', { document: false, query: true }, blocked);
auditSchema.pre('deleteOne', { document: true, query: false }, blocked);
auditSchema.pre('save', function () {
  if (!this.isNew) blocked();
});

module.exports = model('AuditLog', auditSchema);
