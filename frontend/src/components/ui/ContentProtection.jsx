import { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";

// Deters copying of site content for students (and guests): disables text
// selection, right-click, copy/cut, drag and the iOS long-press callout.
// Admins are never restricted. Controlled by the "restrictCopy" setting.
export default function ContentProtection() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const isAdmin = user?.role === "admin";
  const active = settings?.restrictCopy !== false && !isAdmin;

  useEffect(() => {
    if (!active) return;
    const block = (e) => {
      // Allow interacting with form fields (login, search, etc.).
      const t = e.target;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
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
  }, [active]);

  return null;
}
