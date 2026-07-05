import nodemailer from "nodemailer";

// Lazily create an SMTP transporter from environment variables.
// If SMTP isn't configured, email sending is skipped gracefully (the app
// keeps working and messages are still saved to the database).
let transporter;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  const t = getTransporter();
  if (!t) {
    console.log("✉  SMTP not configured — skipping email notification.");
    return false;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    await t.sendMail({ from, to, subject, text, html, replyTo });
    return true;
  } catch (err) {
    // Log the real SMTP failure (e.g. bad App Password) so it shows in the
    // Render logs, but never crash the request — the caller falls back to
    // showing the code on screen.
    console.error("✉  SMTP send FAILED:", err.message);
    return false;
  }
}

export function isMailConfigured() {
  return !!getTransporter();
}
