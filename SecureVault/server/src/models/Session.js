const { Schema, model } = require('mongoose');

// One document per signed-in device. The refresh token itself is never stored, only its hash.
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true },
    prevTokenHash: String,
    rotatedAt: Date,
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL cleanup
    revokedAt: Date,
    ip: String,
    userAgent: String,
    lastUsedAt: Date,
  },
  { timestamps: true }
);

module.exports = model('Session', sessionSchema);
