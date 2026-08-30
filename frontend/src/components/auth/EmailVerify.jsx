import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { authService } from "../../services";

// Reusable email field with an inline "Verify" button + 6-digit code box —
// the SAME pre-account email verification the Institute signup uses. The parent
// owns the email value and the `verified` flag; this component manages its own
// OTP UI state and calls the generic /auth/send-email-otp + /auth/verify-email-otp
// endpoints. Editing the email clears any prior verification (via onVerifiedChange).
export default function EmailVerify({
  email,
  onEmailChange,
  verified,
  onVerifiedChange,
  label = "Email",
  placeholder = "you@example.com",
}) {
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpInfo, setOtpInfo] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpDevCode, setOtpDevCode] = useState(""); // shown only when email delivery isn't configured

  const handleChange = (e) => {
    onEmailChange(e.target.value);
    onVerifiedChange(false);
    setOtpOpen(false);
    setOtpCode("");
    setOtpInfo("");
    setOtpError("");
    setOtpDevCode("");
  };

  const send = async () => {
    setOtpInfo("");
    setOtpError("");
    setOtpDevCode("");
    const e = (email || "").trim();
    if (!e) {
      setOtpError("Enter your email first.");
      return;
    }
    setOtpSending(true);
    try {
      const r = await authService.sendEmailOtp(e);
      setOtpOpen(true);
      if (r?.devOtp) setOtpDevCode(r.devOtp);
      else setOtpInfo("We sent a 6-digit code to your email. Check spam too.");
    } catch (err) {
      setOtpError(err.message || "Couldn't send the code. Please try again.");
    } finally {
      setOtpSending(false);
    }
  };

  const verify = async () => {
    setOtpError("");
    setOtpBusy(true);
    try {
      await authService.verifyEmailOtp((email || "").trim(), otpCode.trim());
      onVerifiedChange(true);
      setOtpOpen(false);
      setOtpInfo("");
    } catch (err) {
      setOtpError(err.message || "Verification failed.");
    } finally {
      setOtpBusy(false);
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          required
          type="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={handleChange}
          placeholder={placeholder}
          className="input pl-9 pr-24"
          disabled={verified}
        />
        {verified ? (
          <span className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" /> Verified
          </span>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={otpSending || !email}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {otpSending ? "Sending…" : otpOpen ? "Resend" : "Verify"}
          </button>
        )}
      </div>

      {!verified && !otpOpen && email && (
        <p className="mt-1 text-xs text-slate-400">
          Tap <b>Verify</b> — we'll email you a 6-digit code to confirm this address.
        </p>
      )}

      {otpOpen && !verified && (
        <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          {otpDevCode && (
            <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Email delivery isn't set up yet — your code:{" "}
              <span className="font-mono text-sm font-bold tracking-widest">{otpDevCode}</span>
            </p>
          )}
          {otpInfo && <p className="mb-2 text-xs text-emerald-600 dark:text-emerald-400">{otpInfo}</p>}
          {otpError && <p className="mb-2 text-xs text-rose-600">{otpError}</p>}
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Enter the 6-digit code</label>
          <div className="flex gap-2">
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="______"
              className="input flex-1 text-center text-lg font-bold tracking-[0.4em]"
            />
            <button type="button" onClick={verify} disabled={otpBusy || otpCode.length !== 6} className="btn-primary px-4">
              {otpBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
