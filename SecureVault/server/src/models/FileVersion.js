const { Schema, model } = require('mongoose');

const fileVersionSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: true },
    versionNo: { type: Number, required: true },
    gridFsId: { type: Schema.Types.ObjectId, required: true },
    iv: { type: String, required: true }, // base64
    authTag: { type: String, required: true }, // base64
    size: { type: Number, required: true }, // plaintext bytes
    hash: { type: String, required: true }, // SHA-256 of plaintext
    originalName: String,
    mimeType: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, maxlength: 300 },
    restoredFrom: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

fileVersionSchema.index({ fileId: 1, versionNo: 1 }, { unique: true });
module.exports = model('FileVersion', fileVersionSchema);
