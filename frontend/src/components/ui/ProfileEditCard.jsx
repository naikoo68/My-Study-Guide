import { useEffect, useState } from "react";
import { UserCog, Loader2, Check, X, Pencil, MailWarning, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services";

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
const phoneOk = (v) => v === "" || /^[+()\-\s\d]{6,30}$/.test(String(v || "").trim());

// Reusable "profile details" editor: view + edit name, email and phone.
// Works for any signed-in user (student or client) via PUT /auth/profile.
// Changing the email doesn't take effect immediately — we email a 6-digit code
// to the NEW address and only swap it in once the user confirms it here.
export default function ProfileEditCard({ className = "" }) {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState("view"); // "view" | "edit" | "otp"
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const pendingEmail = user?.pendingEmail || "";

  // Keep the form in sync with the current user (e.g. after a refresh).
  useEffect(() => {
    if (step === "view") {
      setForm({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "" });
    }
  }, [user?.name, user?.email, user?.phone, step]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startEdit = () => {
    setForm({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "" });
    setErr(""); setMsg("");
    setStep("edit");
  };

  const backToView = () => {
    setStep("view"); setErr(""); setOtp("");
    setForm({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "" });
  };

  const save = async (e) => {
    e?.preventDefault?.();
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!name) return setErr("Please enter your name.");
    if (!emailOk(email)) return setErr("Please enter a valid email address.");
    if (!phoneOk(phone)) return setErr("Please enter a valid phone number, or leave it blank.");

    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await authService.updateProfile({ name, email, phone });
      await refreshUser();
      if (res?.emailChange?.pending) {
        // Name/phone were saved; the email needs OTP confirmation.
        setOtp("");
        setStep("otp");
        setMsg(
          res.emailChange.emailSent
            ? `We've sent a 6-digit code to ${res.emailChange.pendingEmail}. Enter it below to confirm your new email.`
            : `Enter the 6-digit code to confirm ${res.emailChange.pendingEmail}.`
        );
        if (res.emailChange.devOtp) setMsg((m) => `${m} (dev code: ${res.emailChange.devOtp})`);
      } else {
        setStep("view");
        setMsg("Your details were updated.");
      }
    } catch (ex) {
      setErr(ex?.message || "Couldn't save — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault?.();
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) return setErr("Enter the 6-digit code from your email.");
    setBusy(true); setErr(""); setMsg("");
    try {
      await authService.verifyEmailChange(code);
      await refreshUser();
      setStep("view");
      setOtp("");
      setMsg("Your email address was updated.");
    } catch (ex) {
      setErr(ex?.message || "Couldn't verify the code — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await authService.resendEmailChangeOtp();
      setMsg(res?.emailSent ? "A new code is on its way." : "A new code was generated.");
      if (res?.devOtp) setMsg((m) => `${m} (dev code: ${res.devOtp})`);
    } catch (ex) {
      setErr(ex?.message || "Couldn't resend the code.");
    } finally {
      setBusy(false);
    }
  };

  // Cancel a pending email change (server clears it when we submit the current email).
  const cancelPending = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      await authService.updateProfile({ email: user?.email });
      await refreshUser();
      setStep("view");
      setOtp("");
      setMsg("The pending email change was cancelled.");
    } catch (ex) {
      setErr(ex?.message || "Couldn't cancel the change.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold leading-none">My details</h2>
            <p className="mt-0.5 text-xs text-slate-400">Your name, email and phone number.</p>
          </div>
        </div>
        {step === "view" && (
          <button type="button" onClick={startEdit} className="btn-outline py-1.5 text-sm">
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>

      {/* Pending email-change banner (shown in view mode) */}
      {step === "view" && pendingEmail && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-amber-800 dark:text-amber-200">
                Pending email change to <span className="font-semibold">{pendingEmail}</span>. Confirm the code we sent there to finish.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setOtp(""); setErr(""); setMsg(""); setStep("otp"); }} className="btn-primary py-1 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" /> Enter code
                </button>
                <button type="button" onClick={cancelPending} disabled={busy} className="btn-ghost py-1 text-xs">
                  <X className="h-3.5 w-3.5" /> Cancel change
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "edit" ? (
        <form onSubmit={save} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Name</label>
            <input type="text" value={form.name} onChange={set("name")} className="input w-full" placeholder="Your full name" maxLength={80} autoComplete="name" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Email</label>
            <input type="email" value={form.email} onChange={set("email")} className="input w-full" placeholder="you@example.com" autoComplete="email" />
            <p className="mt-1 text-[11px] text-slate-400">Changing this sends a confirmation code to the new address. Your current email stays active until you confirm.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Phone <span className="font-normal text-slate-400">(optional)</span></label>
            <input type="tel" value={form.phone} onChange={set("phone")} className="input w-full" placeholder="+91 98765 43210" maxLength={30} autoComplete="tel" />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" disabled={busy} className="btn-primary py-1.5 text-sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes
            </button>
            <button type="button" onClick={backToView} disabled={busy} className="btn-ghost py-1.5 text-sm">
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        </form>
      ) : step === "otp" ? (
        <form onSubmit={verify} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
              Verification code {pendingEmail && <span className="font-normal">— sent to {pendingEmail}</span>}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input w-full tracking-[0.4em]"
              placeholder="••••••"
              maxLength={6}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" disabled={busy} className="btn-primary py-1.5 text-sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Confirm email
            </button>
            <button type="button" onClick={resend} disabled={busy} className="btn-outline py-1.5 text-sm">Resend code</button>
            <button type="button" onClick={backToView} disabled={busy} className="btn-ghost py-1.5 text-sm">
              <X className="h-4 w-4" /> Later
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-slate-400">Name</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{user?.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400">Email</dt>
            <dd className="mt-0.5 break-all text-sm font-medium text-slate-700 dark:text-slate-200">{user?.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-400">Phone</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{user?.phone || "—"}</dd>
          </div>
        </dl>
      )}

      {msg && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
      {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
    </div>
  );
}
