import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, X, Moon, Sun, LayoutDashboard, LogOut, User, ShieldCheck, ZoomIn, ZoomOut } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useZoom } from "../../context/ZoomContext";
import Brand from "./Brand";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/quiz", label: "Quiz" },
  { to: "/test-series", label: "Test Series" },
  { to: "/study", label: "Study Material" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { zoom, zoomIn, zoomOut } = useZoom();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  // Hide the Quiz link when an admin has disabled quiz access for this student.
  const visibleLinks = user && user.quizAccess === false ? links.filter((l) => l.to !== "/quiz") : links;

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg dark:border-slate-800/70 dark:bg-slate-950/80">
      <nav className="container-page flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" onClick={() => setOpen(false)}>
            <Brand />
          </Link>
          <div className="hidden items-center overflow-hidden rounded-lg border border-slate-200 sm:flex dark:border-slate-700">
            <button onClick={zoomOut} title="Zoom out" aria-label="Zoom out" className="px-2 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ZoomOut className="h-4 w-4" /></button>
            <span className="min-w-[40px] text-center text-xs font-semibold tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} title="Zoom in" aria-label="Zoom in" className="px-2 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ZoomIn className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="hidden items-center gap-1 lg:flex">
          {visibleLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-slate-600 hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-400"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {user ? (
            <div className="hidden items-center gap-2 lg:flex">
              {/* Admin-only mode switch — students never see this */}
              {isAdmin && (
                <Link to="/admin" className="btn-accent py-2">
                  <ShieldCheck className="h-4 w-4" /> Admin Mode
                </Link>
              )}
              <Link to="/dashboard" className="btn-ghost">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {user.avatar}
              </span>
              <button onClick={handleLogout} className="btn-ghost" title="Log out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="hidden btn-primary lg:inline-flex">
              <User className="h-4 w-4" /> Login
            </Link>
          )}

          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg p-2 text-slate-600 lg:hidden dark:text-slate-300"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="animate-fade-in border-t border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-1">
            {visibleLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive
                      ? "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
                      : "text-slate-700 dark:text-slate-200"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              {user ? (
                <>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setOpen(false)} className="btn-accent w-full">
                      <ShieldCheck className="h-4 w-4" /> Admin Mode
                    </Link>
                  )}
                  <Link to="/dashboard" onClick={() => setOpen(false)} className="btn-outline w-full">
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </Link>
                  <button onClick={handleLogout} className="btn-ghost w-full">
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={() => setOpen(false)} className="btn-primary w-full">
                  <User className="h-4 w-4" /> Login
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
