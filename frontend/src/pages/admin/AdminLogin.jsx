import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, Mail, Lock, LogIn, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function AdminLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ email: "admin@myprepmart.com", password: "" });

  const submit = (e) => {
    e.preventDefault();
    login({ email: form.email, name: "Admin", role: "admin" });
    navigate("/admin");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 p-6">
      <div className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold">Admin Login</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Secure access to the My Prep Mart admin panel.
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Admin Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input pl-9"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                required
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Enter any password (demo)"
                className="input px-9"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">
            <LogIn className="h-4 w-4" /> Access Admin Panel
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/" className="hover:underline">← Back to site</Link>
        </p>
      </div>
    </div>
  );
}
