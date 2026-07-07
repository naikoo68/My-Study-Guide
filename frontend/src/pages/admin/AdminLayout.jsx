import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookCopy,
  FileStack,
  BookMarked,
  Users,
  Trophy,
  Mail,
  MessageSquare,
  Megaphone,
  Palette,
  GraduationCap,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  Home,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { messageService } from "../../services";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/content", label: "Content", icon: BookCopy },
  { to: "/admin/tests", label: "Test Series", icon: FileStack },
  { to: "/admin/study", label: "Study Material", icon: BookMarked },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/performance", label: "Performance", icon: Trophy },
  { to: "/admin/feedback", label: "Feedback", icon: MessageSquare },
  { to: "/admin/messages", label: "Messages", icon: Mail },
  { to: "/admin/notices", label: "Notice Board", icon: Megaphone },
  { to: "/admin/customization", label: "Customization", icon: Palette },
];

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  // Keep the unread-messages badge fresh
  useEffect(() => {
    let active = true;
    messageService
      .unreadCount()
      .then((r) => active && setUnread(r.unread || 0))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <Link to="/admin" className="flex items-center gap-2 px-6 py-5">
        {settings.logoUrl ? (
          <img src={settings.logoUrl} alt={settings.siteName} className="h-9 w-9 rounded-xl object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
            <GraduationCap className="h-5 w-5" />
          </span>
        )}
        <div>
          <p className="text-sm font-extrabold leading-none">{settings.siteName}</p>
          <p className="text-xs text-slate-400">Admin Panel</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-brand-600 text-white shadow-soft"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`
            }
          >
            <n.icon className="h-5 w-5" />
            <span className="flex-1">{n.label}</span>
            {n.to === "/admin/messages" && unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1.5 text-xs font-bold text-white">
                {unread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-slate-200 p-3 dark:border-slate-800">
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <Home className="h-5 w-5" /> Switch to Student Mode
        </Link>
        <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20">
          <LogOut className="h-5 w-5" /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-slate-900">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 lg:hidden">
            <Menu className="h-6 w-6" />
          </button>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Welcome, <span className="text-slate-900 dark:text-white">{user?.name || "Admin"}</span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="rounded-lg p-2 text-slate-600 dark:text-slate-300">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {user?.avatar || "AD"}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
