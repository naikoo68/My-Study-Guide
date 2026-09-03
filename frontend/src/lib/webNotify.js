// Web Notifications helpers — used to ping the user when a long AI generation
// finishes, so they can leave this screen and be called back.
//
// Platform notes:
//  - Desktop/Android: the Notification API works in a normal tab.
//  - iOS / iPadOS: web notifications ONLY exist when the site is installed to the
//    Home Screen as an app (iOS 16.4+). In a plain Safari tab, window.Notification
//    is undefined, so notificationsSupported() is false and callers fall back to
//    the in-app pill. When installed, notifications MUST be shown via the service
//    worker (ServiceWorkerRegistration.showNotification) — the `new Notification()`
//    constructor is not supported there — which is why notifyDone() prefers the SW.
//  - Client-side only: "done" is detected by the page polling the job, so a
//    notification fires while the app is running/foregrounded (or briefly
//    backgrounded). Guaranteed delivery while the app is fully closed would need
//    server-side Web Push (a larger, separate feature).

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

// "granted" | "denied" | "default" | "unsupported"
export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

// Ask for permission (must be called from a user gesture). Resolves to the
// resulting permission string, or "unsupported" where notifications don't exist.
export async function requestNotifyPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// Show a notification (best-effort). Prefers the service worker registration —
// required on iOS PWAs and more reliable everywhere — and falls back to the
// Notification constructor on platforms without an active SW.
export async function notifyDone(title, body) {
  try {
    if (!notificationsSupported() || Notification.permission !== "granted") return;
    const opts = body ? { body } : undefined;
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, opts);
        return;
      }
    }
    new Notification(title, opts); // eslint-disable-line no-new
  } catch {
    /* notifications are best-effort */
  }
}
