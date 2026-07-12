import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, LogOut, Moon, Sun, ZoomIn, ZoomOut, LayoutDashboard, Wrench } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import { useZoom } from "../../context/ZoomContext";
import AdminPractice from "../admin/AdminPractice";
import ClientDashboard from "./ClientDashboard";

// The self-service CLIENT workspace. A client only ever sees the My Practice
// section (their own private content) — no other part of the site. It reuses
// the practice manager in `clientMode`, which the backend scopes to this
// client's own content.
export default function ClientWorkspace() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { settings } = useSettings();
  const { zoom, zoomIn, zoomOut } = useZoom();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard"); // "dashboard" (practice) | "build"

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const tabs = [
    { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { key: "build", label: "Build", Icon: Wrench },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link to="/client" className="flex items-center gap-2">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt={settings.siteName} className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
            )}
            <div>
              <p className="text-sm font-extrabold leading-none">{settings.siteName}</p>
              <p className="text-xs text-slate-400">My Practice</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <button onClick={zoomOut} title="Zoom out" className="px-2 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ZoomOut className="h-4 w-4" /></button>
              <span className="min-w-[40px] text-center text-xs font-semibold tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
              <button onClick={zoomIn} title="Zoom in" className="px-2 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ZoomIn className="h-4 w-4" /></button>
            </div>
            <button onClick={toggleTheme} className="rounded-lg p-2 text-slate-600 dark:text-slate-300" title="Toggle theme">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <span className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" title={user?.name}>
              {user?.avatar || "ME"}
            </span>
            <button onClick={handleLogout} className="btn-ghost" title="Log out">
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
        {/* Tabs: Dashboard (practice + validity) vs Build (create content) */}
        <div className="mx-auto mt-3 flex max-w-6xl gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                tab === t.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <t.Icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        {tab === "dashboard" ? <ClientDashboard onBuild={() => setTab("build")} /> : <AdminPractice clientMode />}
      </main>
    </div>
  );
}
