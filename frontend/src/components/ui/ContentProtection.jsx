import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";

// Deters copying/screenshotting of site content for students (and guests):
//  - restrictCopy   : disables selection, right-click, copy/cut, drag, iOS callout
//  - screenshotGuard: covers the whole screen when the window loses focus or is
//                     hidden (best-effort — catches desktop tools like Win+Shift+S
//                     that blur the page; phone screenshots can't be detected).
// Admins are never restricted.
export default function ContentProtection() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const isAdmin = user?.role === "admin";
  const copyActive = settings?.restrictCopy !== false && !isAdmin;
  const guardActive = settings?.screenshotGuard === true && !isAdmin;
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (!copyActive) return;
    const block = (e) => {
      const t = e.target;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      return false;
    };
    const events = ["copy", "cut", "contextmenu", "selectstart", "dragstart"];
    events.forEach((ev) => document.addEventListener(ev, block));
    document.body.classList.add("no-select");
    return () => {
      events.forEach((ev) => document.removeEventListener(ev, block));
      document.body.classList.remove("no-select");
    };
  }, [copyActive]);

  useEffect(() => {
    if (!guardActive) { setCovered(false); return; }
    let timer;
    const cover = () => setCovered(true);
    const uncover = () => setCovered(false);
    const onVis = () => setCovered(document.hidden);
    // Briefly cover when a screenshot shortcut is detected (PrintScreen / snip combos).
    const flashCover = () => {
      setCovered(true);
      clearTimeout(timer);
      timer = setTimeout(() => { if (document.hasFocus()) setCovered(false); }, 1500);
    };
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      const combo = (e.metaKey || e.ctrlKey) && e.shiftKey && ["s", "3", "4", "5"].includes(k);
      if (k === "printscreen" || combo) flashCover();
    };
    window.addEventListener("blur", cover);
    window.addEventListener("focus", uncover);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("blur", cover);
      window.removeEventListener("focus", uncover);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  }, [guardActive]);

  if (!guardActive || !covered) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-white">
      <ShieldAlert className="h-10 w-10 text-accent-400" />
      <p className="text-lg font-bold">Content hidden</p>
      <p className="max-w-xs text-sm text-slate-300">Return to the page to continue. Screenshots and screen sharing are restricted here.</p>
    </div>
  );
}
