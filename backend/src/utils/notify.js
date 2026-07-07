import Settings from "../models/Settings.js";
import Notice from "../models/Notice.js";
import User from "../models/User.js";
import { sendMail } from "../config/mailer.js";

// When a new quiz/test is added, and the admin has enabled it in the Notice
// Board settings, announce it on the notice board AND email every student.
// Fire-and-forget: callers should NOT await this so the HTTP response is fast.
export async function notifyNewContent(kind, title) {
  try {
    const settings = await Settings.findOne({ key: "site" }).lean();
    if (!settings?.notifyOnNewContent) return;

    const siteName = settings.siteName || "My Study Guide";
    const label = kind === "test" ? "Test Series" : "Quiz";
    const cleanTitle = String(title || "").trim() || label;

    // 1) Notice board entry
    await Notice.create({ text: `New ${label}: ${cleanTitle} is now available!`, active: true, order: 0 });

    // 2) Email all students
    const users = await User.find({ role: "student" }).select("email").lean();
    const subject = `New ${label} added on ${siteName}`;
    const html =
      `<p>Hello,</p>` +
      `<p>A new ${label.toLowerCase()} — <b>${cleanTitle}</b> — has just been added on ${siteName}.</p>` +
      `<p>Log in to start practising. Good luck!</p>` +
      `<p style="color:#64748b;font-size:12px">— ${siteName}</p>`;
    const text = `New ${label}: ${cleanTitle} is now available on ${siteName}. Log in to start practising.`;

    for (const u of users) {
      if (u.email) sendMail({ to: u.email, subject, text, html }).catch(() => {});
    }
  } catch (err) {
    console.error("notifyNewContent error:", err.message);
  }
}
