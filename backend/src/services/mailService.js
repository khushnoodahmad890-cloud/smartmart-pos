import nodemailer from 'nodemailer';

/**
 * Email is optional: configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM env vars to enable.
 * Without SMTP the app still works — callers receive { sent: false, reason }.
 */
let transporter = null;

export function mailEnabled() {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter() {
  if (!transporter && mailEnabled()) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  if (!mailEnabled()) return { sent: false, reason: 'SMTP is not configured on this server' };
  try {
    await getTransporter().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, text });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}
