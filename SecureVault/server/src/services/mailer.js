const nodemailer = require('nodemailer');
const config = require('../config');

const configured = Boolean(config.smtp.host);
const transporter = configured
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

/**
 * Sends email when SMTP_* is configured. Otherwise nothing is sent:
 * in development the message is printed to the server console so flows can still be tested.
 */
async function sendMail({ to, subject, text }) {
  if (!transporter) {
    if (!config.isProd) {
      console.log(`\n[mail:not-sent - SMTP not configured]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    } else {
      console.warn(`[mail] SMTP not configured; email to ${to} was NOT sent.`);
    }
    return { delivered: false };
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text });
  return { delivered: true };
}

const safeSend = (msg) => sendMail(msg).catch((err) => console.error('[mail] failed:', err.message));

module.exports = { sendMail, safeSend, configured };
