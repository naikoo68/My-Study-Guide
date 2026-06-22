import { Link } from "react-router-dom";
import { GraduationCap, CheckCircle2 } from "lucide-react";

const perks = [
  "8,500+ quizzes across 12 subjects",
  "Full-length & previous-year test series",
  "Real-time analytics and leaderboard",
  "Detailed solutions for every question",
];

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <GraduationCap className="h-6 w-6" />
          </span>
          <span className="text-xl font-extrabold">My Prep Mart</span>
        </Link>
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">
            Prepare Smart,<br />Achieve More.
          </h2>
          <ul className="mt-8 space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/90">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/70">© {new Date().getFullYear()} My Prep Mart</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold">My Prep Mart</span>
            </Link>
          </div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-600 dark:text-slate-300">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function GoogleButton({ label = "Continue with Google" }) {
  return (
    <button type="button" className="btn-outline w-full">
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      {label}
    </button>
  );
}
