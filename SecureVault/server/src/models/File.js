const { Schema, model } = require('mongoose');

// Metadata only. Encrypted bytes live in GridFS (see FileVersion.gridFsId).
const fileSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, maxlength: 200 },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 }, // plaintext size of the current version
    currentVersion: { type: Number, default: 1 },
    encKeyRef: { type: String, required: true, select: false }, // per-file data key, wrapped by MASTER_KEY
  },
  { timestamps: true }
);

fileSchema.index({ ownerId: 1, updatedAt: -1 });
module.exports = model('File', fileSchema);
