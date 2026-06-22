import { useState } from "react";
import {
  Upload,
  Palette,
  ImagePlus,
  Bell,
  Megaphone,
  Send,
  Trash2,
  CheckCircle2,
} from "lucide-react";

const presetColors = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#f97316", "#e11d48"];

export default function AdminCustomization() {
  const [primary, setPrimary] = useState("#2563eb");
  const [accent, setAccent] = useState("#f97316");
  const [announcements, setAnnouncements] = useState([
    { id: 1, text: "New JEE 2026 series launching this weekend!" },
    { id: 2, text: "Scheduled maintenance on Sunday 2 AM IST." },
  ]);
  const [newAnn, setNewAnn] = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [toast, setToast] = useState("");

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const addAnnouncement = () => {
    if (!newAnn.trim()) return;
    setAnnouncements((a) => [{ id: Date.now(), text: newAnn }, ...a]);
    setNewAnn("");
  };

  const sendNotification = (e) => {
    e.preventDefault();
    flash("Notification broadcast to all users.");
    setNotifTitle("");
    setNotifBody("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Customization</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Brand the platform, manage banners, notifications and announcements.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Logo */}
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-bold">
            <ImagePlus className="h-5 w-5 text-brand-600" /> Website Logo
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
              MP
            </div>
            <label className="btn-outline cursor-pointer">
              <Upload className="h-4 w-4" /> Upload New Logo
              <input type="file" accept="image/*" className="hidden" />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-400">PNG/SVG, max 1MB. Stored via Cloudinary.</p>
        </div>

        {/* Theme colors */}
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-bold">
            <Palette className="h-5 w-5 text-accent-500" /> Theme Colors
          </h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Primary</label>
              <div className="flex flex-wrap gap-2">
                {presetColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPrimary(c)}
                    style={{ background: c }}
                    className={`h-9 w-9 rounded-lg ring-offset-2 transition ${primary === c ? "ring-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : ""}`}
                  />
                ))}
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-9 w-9 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Accent</label>
              <div className="flex flex-wrap gap-2">
                {presetColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setAccent(c)}
                    style={{ background: c }}
                    className={`h-9 w-9 rounded-lg ring-offset-2 transition ${accent === c ? "ring-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : ""}`}
                  />
                ))}
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-9 rounded-lg" />
              </div>
            </div>
            <button onClick={() => flash("Theme colors saved.")} className="btn-primary">
              Save Theme
            </button>
          </div>
        </div>

        {/* Banners */}
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-bold">
            <ImagePlus className="h-5 w-5 text-violet-500" /> Homepage Banners
          </h3>
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            <div>
              <Upload className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2">Upload banner image (1920×480)</p>
              <input type="file" accept="image/*" className="mt-2 text-xs" />
            </div>
          </div>
        </div>

        {/* Send notification */}
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 font-bold">
            <Bell className="h-5 w-5 text-brand-600" /> Send Notification
          </h3>
          <form onSubmit={sendNotification} className="space-y-3">
            <input
              required
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              className="input"
              placeholder="Notification title"
            />
            <textarea
              required
              rows={3}
              value={notifBody}
              onChange={(e) => setNotifBody(e.target.value)}
              className="input resize-none"
              placeholder="Message body..."
            />
            <button type="submit" className="btn-primary">
              <Send className="h-4 w-4" /> Broadcast to All
            </button>
          </form>
        </div>
      </div>

      {/* Announcements */}
      <div className="card p-6">
        <h3 className="mb-4 flex items-center gap-2 font-bold">
          <Megaphone className="h-5 w-5 text-accent-500" /> Announcements
        </h3>
        <div className="flex gap-2">
          <input
            value={newAnn}
            onChange={(e) => setNewAnn(e.target.value)}
            className="input"
            placeholder="Write an announcement..."
          />
          <button onClick={addAnnouncement} className="btn-primary whitespace-nowrap">
            Add
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {announcements.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
              <span className="text-sm">{a.text}</span>
              <button
                onClick={() => setAnnouncements((list) => list.filter((x) => x.id !== a.id))}
                className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}
