import { useState } from "react";
import { Bell, BellRing, BellOff } from "lucide-react";
import { notificationsSupported, notificationPermission, requestNotifyPermission } from "../../lib/webNotify";

// Shown in the AI-generation widget where a real "Pop out" (Picture-in-Picture)
// window isn't possible — mainly iPhone/iPad. Lets the user opt into a browser
// notification that fires when generation finishes, so they can leave this
// screen and be called back.
//
// Renders nothing when notifications aren't available at all (e.g. a plain iOS
// Safari tab — iOS only allows web notifications for a Home-Screen-installed
// app), so we never show a control that can't work; the in-app pill remains the
// fallback there.
export default function NotifyWhenDoneButton({ className = "" }) {
  const [perm, setPerm] = useState(() => notificationPermission());
  if (!notificationsSupported()) return null;

  const base = `btn-outline py-1 text-xs ${className}`;

  if (perm === "granted") {
    return (
      <button type="button" disabled title="You'll be notified when generation finishes" className={`${base} !text-emerald-600 dark:!text-emerald-300`}>
        <BellRing className="h-3.5 w-3.5" /> Notify: on
      </button>
    );
  }
  if (perm === "denied") {
    return (
      <button type="button" disabled title="Notifications are blocked for this site — enable them in your browser/app settings to be alerted when it's done" className={`${base} opacity-70`}>
        <BellOff className="h-3.5 w-3.5" /> Blocked
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => setPerm(await requestNotifyPermission())}
      title="Get a notification when generation finishes so you can leave this screen"
      className={base}
    >
      <Bell className="h-3.5 w-3.5" /> Notify me
    </button>
  );
}
