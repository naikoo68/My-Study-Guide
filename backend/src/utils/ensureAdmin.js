import User from "../models/User.js";
import { isStrongPassword, generateStrongPassword } from "./passwordPolicy.js";

// Guarantees an admin account exists based on environment variables — a safe,
// data-preserving way to bootstrap or recover admin access on hosts without
// shell access (e.g. Render free tier).
//
//   ADMIN_EMAIL     – the admin's email
//   ADMIN_PASSWORD  – the admin's password
//   ADMIN_RESET     – set to "true" to also reset the password of an existing
//                     account with that email (otherwise existing accounts are
//                     left untouched so admin-panel edits are preserved)
export async function ensureAdminFromEnv() {
  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  // Never bootstrap/reset an admin with a weak/known password. If ADMIN_PASSWORD
  // isn't strong, use a random one-time password and force a change on first
  // login instead — so no deployment can end up with a guessable admin password.
  const strong = isStrongPassword(password);
  const effectivePw = strong ? password : generateStrongPassword();
  const forceChange = !strong;
  const announce = (verb) => {
    if (strong) console.log(`✔ Admin account ${verb} from env: ${email}`);
    else console.log(`🔑 ADMIN_PASSWORD was weak/empty — ${verb} ${email} with a one-time password: ${effectivePw}  (change it on first login)`);
  };

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    await User.create({
      name: process.env.ADMIN_NAME || "Admin",
      email,
      password: effectivePw,
      role: "admin",
      isEmailVerified: true,
      mustChangePassword: forceChange,
    });
    announce("created");
    return;
  }

  if (process.env.ADMIN_RESET === "true") {
    user.role = "admin";
    user.status = "active";
    user.password = effectivePw;
    user.mustChangePassword = forceChange;
    await user.save();
    announce("reset");
  } else if (user.role !== "admin") {
    user.role = "admin";
    await user.save();
    console.log(`✔ Promoted existing user to admin: ${email}`);
  }
}
