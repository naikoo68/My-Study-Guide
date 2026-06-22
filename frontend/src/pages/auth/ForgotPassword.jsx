import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Send, MailCheck, ArrowLeft } from "lucide-react";
import AuthShell from "../../components/auth/AuthShell";

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  const submit = (e) => {
    e.preventDefault();
    setSent(true);
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
            <button type="submit" className="btn-primary w-full">
              <Send className="h-4 w-4" /> Send Reset Link
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
