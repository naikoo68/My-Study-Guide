import { Link } from "react-router-dom";
import { GraduationCap, CheckCircle2 } from "lucide-react";
import { useSettings } from "../../context/SettingsContext";
import GoogleSignIn from "./GoogleSignIn";

const perks = [
  "Subject-wise quizzes across many subjects",
  "Full-length & previous-year test series",
  "Real-time analytics and leaderboard",
  "Detailed solutions for every question",
];

export default function AuthShell({ title, subtitle, children }) {
  const { settings } = useSettings();
  const Logo = ({ size = "h-10 w-10", icon = "h-6 w-6", light }) =>
    settings.logoUrl ? (
      <img src={settings.logoUrl} alt={settings.siteName} className={`${size} rounded-xl object-cover`} />
    ) : (
      <span className={`flex ${size} items-center justify-center rounded-xl ${light ? "bg-white/15" : "bg-gradient-to-br from-brand-600 to-accent-500"} text-white`}>
        <GraduationCap className={icon} />
      </span>
    );

  return (
    <div className="grid min-h-screen-nav lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <Link to="/" className="flex items-center gap-2">
          <Logo light />
          <span className="text-xl font-extrabold">{settings.siteName}</span>
        </Link>
        <div>
          <h2 className="text-4xl font-extrabold leading-tight">{settings.tagline}</h2>
          <ul className="mt-8 space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/90">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/70">© {new Date().getFullYear()} {settings.siteName}</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <Logo size="h-9 w-9" icon="h-5 w-5" />
              <span className="text-lg font-extrabold">{settings.siteName}</span>
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

// The real Google sign-in / sign-up button (see GoogleSignIn.jsx).
export function GoogleButton(props) {
  return <GoogleSignIn {...props} />;
}
