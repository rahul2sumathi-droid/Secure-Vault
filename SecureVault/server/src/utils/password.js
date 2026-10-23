const bcrypt = require('bcryptjs');
const COST = 12;
const hashPassword = (pw) => bcrypt.hash(pw, COST);
const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
// Used to keep login timing similar whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

// 10+ chars with upper, lower and a digit.
const passwordPolicy = (pw) =>
  typeof pw === 'string' && pw.length >= 10 && pw.length <= 128 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);
const PASSWORD_MESSAGE = 'Password must be 10-128 characters and include upper-case, lower-case and a number.';

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, passwordPolicy, PASSWORD_MESSAGE };
