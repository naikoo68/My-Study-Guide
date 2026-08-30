import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Send, MailCheck, ArrowLeft, Loader2, MailWarning } from "lucide-react";
import AuthShell from "../../components/auth/AuthShell";
import { authService } from "../../services";

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authService.forgotPassword(email);
    } catch {
      /* The API always responds success-style; ignore errors to avoid leaking accounts. */
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle={!sent ? "Enter your email and we'll send you a reset link." : undefined}
    >
      {sent ? (
        <div className="card p-6 text-center">
          <MailCheck className="mx-auto h-14 w-14 text-brand-600" />
          <h3 className="mt-4 text-lg font-bold">Reset link sent</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            If an account exists for{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{email}</span>,
            you'll receive a password reset email shortly.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-800 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-200">
            <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Didn't get it? Check your <b>Spam</b> or <b>Promotions</b> folder — the email can take
              a minute to arrive.
            </span>
          </div>
          <Link to="/login" className="btn-primary mt-6 w-full">
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input pl-9"
                />
              </div>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
          <Link
            to="/login"
            className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>
        </>
      )}
    </AuthShell>
  );
}
