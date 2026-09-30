// "Continue with Google" — real Sign in with Google (Google Identity Services).
// Google gives the browser a signed ID token ("credential"); the server checks
// it with Google (POST /api/auth/google) and signs the user in, creating the
// account on first use — so the same button does sign-up AND login.
//
// Google blocks sign-in inside app browsers (Facebook, Instagram, WhatsApp,
// LinkedIn, Snapchat… — error "disallowed_useragent"), so there we show how to
// open the page in Chrome / Safari instead of a button that can't work.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, ExternalLink, Copy, Check } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { loadGis } from "../../lib/googleDrive";

// eslint-disable-next-line react-refresh/only-export-components
export function isInAppBrowser(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Line\/|LinkedInApp|Snapchat|Twitter|musical_ly|Bytedance|TikTok|Pinterest|Telegram|MicroMessenger|GSA\/|; wv\)/i.test(String(ua));
}

export default function GoogleSignIn({ label = "Continue with Google", redirectTo }) {
  const { loginWithGoogle } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const box = useRef(null);
  const [state, setState] = useState("loading"); // loading | ready | busy | error
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const clientId = String(settings?.googleClientId || "").trim();
  const inApp = isInAppBrowser();

  const home = (role) => (role === "admin" || role === "institute_admin") ? "/admin"
    : role === "client" ? "/creator" : (redirectTo || location.state?.from || "/dashboard");

  useEffect(() => {
    if (inApp || !clientId) return undefined;
    let alive = true;
    loadGis().then(() => {
      if (!alive || !box.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: async ({ credential }) => {
          if (!credential) return;
          setState("busy"); setError("");
          try {
            const u = await loginWithGoogle({ credential });
            navigate(home(u?.role), { replace: true });
          } catch (e) {
            setState("ready");
            setError(e?.message || "Google sign-in failed. Please try again.");
          }
        },
      });
      const w = Math.max(200, Math.min(400, Math.round(box.current.offsetWidth || 320)));
      window.google.accounts.id.renderButton(box.current, {
        type: "standard", theme: "outline", size: "large", shape: "rectangular",
        text: /sign up/i.test(label) ? "signup_with" : "continue_with", logo_alignment: "center", width: w,
      });
      setState("ready");
    }).catch((e) => { if (alive) { setState("error"); setError(e?.message || "Couldn't load Google sign-in."); } });
    return () => { alive = false; };
  }, [clientId, inApp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (inApp) {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
        <p className="flex items-center gap-1.5 font-semibold"><AlertCircle className="h-4 w-4" /> Google sign-in doesn't work inside this app</p>
        <p className="mt-1 text-xs">Google blocks sign-in in the Facebook / Instagram / WhatsApp browser. Tap <b>⋮</b> or <b>…</b> at the top and choose <b>Open in Chrome</b> / <b>Open in Safari</b> (or <b>Open in browser</b>) — or copy the link and paste it there. Email &amp; password login works here.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="btn-outline !px-2.5 !py-1 text-xs">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}</button>
          {/android/i.test(navigator.userAgent) && (
            <a className="btn-outline !px-2.5 !py-1 text-xs" href={`intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`}>
              <ExternalLink className="h-3.5 w-3.5" /> Open in Chrome
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!clientId) return <p className="text-center text-xs text-slate-400">Google sign-in isn't set up yet (no Google Client ID).</p>;

  return (
    <div>
      <div className="relative flex min-h-[44px] w-full items-center justify-center">
        <div ref={box} className={`flex w-full justify-center ${state === "busy" ? "pointer-events-none opacity-50" : ""}`} aria-label={label} />
        {(state === "loading" || state === "busy") && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {state === "busy" ? "Signing in with Google…" : ""}
          </span>
        )}
      </div>
      {error && <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-rose-600"><AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {error}</p>}
    </div>
  );
}
