const { Schema, model } = require('mongoose');

const ROLES = ['admin', 'owner', 'collaborator', 'auditor'];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'owner', index: true },
    isActive: { type: Boolean, default: true },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEnc: { type: String, select: false },
    mfaPendingSecretEnc: { type: String, select: false },
    lastTotpStep: { type: Number, default: 0, select: false },
    recoveryCodes: { type: [{ hash: String, usedAt: Date }], select: false, default: [] },
    failedLogins: { type: Number, default: 0 },
    lockUntil: Date,
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.mfaSecretEnc;
    delete ret.mfaPendingSecretEnc;
    delete ret.lastTotpStep;
    delete ret.recoveryCodes;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    delete ret.__v;
    return ret;
  },
});

module.exports = model('User', userSchema);
module.exports.ROLES = ROLES;
