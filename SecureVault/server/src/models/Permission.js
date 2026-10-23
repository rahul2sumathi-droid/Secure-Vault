const { Schema, model } = require('mongoose');

// Per-file ACL entry. One row per (file, user).
const permissionSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    view: { type: Boolean, default: true },
    download: { type: Boolean, default: false },
    edit: { type: Boolean, default: false }, // upload new versions
    reshare: { type: Boolean, default: false },
    expiresAt: Date,
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: Date,
  },
  { timestamps: true }
);

permissionSchema.index({ fileId: 1, userId: 1 }, { unique: true });
module.exports = model('Permission', permissionSchema);
