import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { School, ImagePlus, Upload, X, FileText, Check, CheckCircle2, Loader2, ArrowRight, Mail, Phone, Info, Sparkles, Share2, BookCopy, FileStack, BookMarked, MonitorCheck } from "lucide-react";
import { useSettings } from "../../context/SettingsContext";
import { useAuth } from "../../context/AuthContext";
import { fileToResizedDataUrl } from "../../lib/imageResize";

// Starter policy templates so a new institute can accept sensible defaults (and
// edit) instead of writing from scratch. Blank lines separate paragraphs — the
// public Privacy/Terms/Refund pages render this text verbatim.
const defaultPrivacy = (n) =>
`At ${n}, we respect your privacy. This policy explains what information we collect and how we use it when you use our website and services.

We collect the details you provide when you register (such as your name and email) and the activity needed to run the service — the quizzes and tests you attempt, your scores and your progress.

We use your information only to provide and improve the service, process any payments, and send you important account and service messages. We do not sell your personal information.

You may request access to, correction of, or deletion of your data at any time by contacting us using the details on our Contact page.`;

const defaultTerms = (n) =>
`Welcome to ${n}. By using our website and services you agree to these Terms of Service.

You may browse free content and, where offered, create an account or purchase a plan to unlock additional features. You agree to use the platform lawfully and not to misuse or disrupt it.

All content on ${n} is provided for exam-preparation purposes. We may update, add or remove features from time to time.

If you have any questions about these terms, contact us using the details on our Contact page.`;

const defaultRefund = (n) =>
`This policy explains how refunds and cancellations work for paid subscriptions on ${n}.

Because access to our quizzes, test series and study material is granted immediately after payment, subscriptions are generally non-refundable once activated.

If you were charged in error or believe there is a genuine problem with your purchase, please contact us within 7 days and we will review your request fairly.

To request help with a payment, reach us using the details on our Contact page.`;

// A one-time, first-run setup wizard shown to a new institute admin. Five steps:
//   1. Logo & name   2. Company (About + Contact)   3. Resources (policies)
//   4. Social links (optional)   5. Product (build quizzes/tests — optional).
// Steps 1–3 are mandatory; 4 and 5 can be skipped. Each step saves its own
// fields; finishing marks onboardingCompleted so the wizard never auto-opens
// again. The Product step can also jump straight to a build page.
export default function OnboardingWizard({ onDone }) {
  const { save } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Start every field BLANK so the institute enters its OWN details from
  // scratch — we never prefill leftover/platform values (e.g. the platform's
  // demo About text or the owner's personal contact info). The only exception
  // is the institute name, which we seed from the logged-in admin's own tenant
  // (their real institute name) since that's genuinely theirs. Placeholders show
  // hypothetical examples to guide them.
  const [f, setF] = useState(() => ({
    logoUrl: "",
    siteName: user?.tenant?.name || "",
    tagline: "",
    aboutHeading: "",
    aboutIntro: "",
    email: "",
    phone: "",
    address: "",
    privacyPolicy: "",
    termsOfService: "",
    refundPolicy: "",
    facebook: "",
    instagram: "",
    whatsapp: "",
    youtube: "",
  }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    try { set("logoUrl", await fileToResizedDataUrl(file, 400, 0.9)); setError(""); }
    catch { setError("Could not read that image. Try another file."); }
  };

  const buildContacts = () => {
    const c = [];
    if (f.email.trim()) c.push({ type: "email", value: f.email.trim() });
    if (f.phone.trim()) c.push({ type: "phone", value: f.phone.trim() });
    if (f.address.trim()) c.push({ type: "address", value: f.address.trim() });
    return c;
  };

  // Save the given fields, then move to nextStep. Keeps per-step progress.
  const commit = async (fields, nextStep) => {
    setSaving(true); setError("");
    try {
      await save(fields);
      setStep(nextStep);
    } catch (e) {
      setError(e.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const next1 = () => {
    if (!f.siteName.trim()) return setError("Please enter your institute name.");
    if (!f.logoUrl) return setError("Please upload your institute logo.");
    commit({ siteName: f.siteName.trim(), tagline: f.tagline.trim(), logoUrl: f.logoUrl }, 2);
  };

  const next2 = () => {
    if (!f.aboutIntro.trim()) return setError("Please add a short 'About us' description.");
    if (!f.email.trim()) return setError("Please add a contact email.");
    // Prefill policy templates for the next step if they're still empty.
    const nm = f.siteName.trim() || "our institute";
    setF((s) => ({
      ...s,
      privacyPolicy: s.privacyPolicy || defaultPrivacy(nm),
      termsOfService: s.termsOfService || defaultTerms(nm),
      refundPolicy: s.refundPolicy || defaultRefund(nm),
    }));
    commit({ aboutHeading: f.aboutHeading.trim(), aboutIntro: f.aboutIntro.trim(), contacts: buildContacts() }, 3);
  };

  const next3 = () => {
    if (!f.privacyPolicy.trim() || !f.termsOfService.trim() || !f.refundPolicy.trim())
      return setError("Please fill in all three policies (you can edit the suggested text).");
    commit(
      { privacyPolicy: f.privacyPolicy.trim(), termsOfService: f.termsOfService.trim(), refundPolicy: f.refundPolicy.trim() },
      4
    );
  };

  // Step 4 (Social links, optional): save any provided links, then go to step 5.
  const next4 = () => {
    const socialLinks = [
      ["facebook", f.facebook], ["instagram", f.instagram], ["whatsapp", f.whatsapp], ["youtube", f.youtube],
    ].filter(([, url]) => url && url.trim()).map(([platform, url]) => ({ platform, url: url.trim() }));
    if (socialLinks.length) commit({ socialLinks }, 5);
    else { setError(""); setStep(5); }
  };

  // Mark the wizard finished (called on step 5). Optionally jump to a build page.
  const finish = async (goTo) => {
    setSaving(true); setError("");
    try {
      await save({ onboardingCompleted: true });
      onDone?.();
      if (goTo) navigate(goTo);
    } catch (e) {
      setError(e.message || "Could not finish. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const STEPS = [
    { n: 1, label: "Logo & Name", Icon: ImagePlus },
    { n: 2, label: "Company", Icon: Info },
    { n: 3, label: "Resources", Icon: FileText },
    { n: 4, label: "Social Links", Icon: Share2 },
    { n: 5, label: "Product", Icon: Sparkles },
  ];

  // Quick-launch tiles for the final "Product" step — jump straight to building.
  const BUILD_LINKS = [
    { to: "/admin/content", label: "Quizzes & Questions", Icon: BookCopy },
    { to: "/admin/tests", label: "Test Series", Icon: FileStack },
    { to: "/admin/study", label: "Study Material", Icon: BookMarked },
    { to: "/admin/cbt", label: "Online Exams", Icon: MonitorCheck },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-6">
      <div className="my-4 w-full max-w-2xl animate-scale-in card p-5 sm:p-7">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
            <School className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold leading-none">Set up your website</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A few quick steps to brand your institute. Steps 1–3 are required.</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="mt-5 grid grid-cols-5 gap-1.5">
          {STEPS.map((s) => {
            const state = step === s.n ? "active" : step > s.n ? "done" : "todo";
            return (
              <div key={s.n} className="flex flex-col items-center gap-1 text-center">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  state === "active" ? "bg-brand-600 text-white"
                  : state === "done" ? "bg-emerald-500 text-white"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                }`}>
                  {state === "done" ? <Check className="h-4 w-4" /> : s.n}
                </span>
                <span className={`text-[10px] font-semibold sm:text-xs ${step === s.n ? "text-brand-600 dark:text-brand-400" : "text-slate-400"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>
        )}

        {/* Step body */}
        <div className="mt-5 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Institute logo <span className="text-rose-500">*</span></label>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-xl font-bold text-white">
                    {f.logoUrl ? <img src={f.logoUrl} alt="logo" className="h-full w-full object-cover" /> : (f.siteName || "I")[0]}
                  </div>
                  <label className="btn-outline cursor-pointer">
                    <Upload className="h-4 w-4" /> Upload logo
                    <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                  </label>
                  {f.logoUrl && (
                    <button type="button" onClick={() => set("logoUrl", "")} className="btn-ghost text-rose-600"><X className="h-4 w-4" /> Remove</button>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">PNG/JPG/SVG. It'll appear in your header and footer.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Institute name <span className="text-rose-500">*</span></label>
                <input className="input" value={f.siteName} onChange={(e) => set("siteName", e.target.value)} placeholder="e.g. Bright Future Academy" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Tagline <span className="font-normal text-slate-400">(optional)</span></label>
                <input className="input" value={f.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="e.g. Prepare Smart, Achieve More." />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">This fills your <b>About Us</b> page and the <b>Company</b> section in your footer.</p>
              <div>
                <label className="mb-1.5 block text-sm font-medium">About heading <span className="font-normal text-slate-400">(optional)</span></label>
                <input className="input" value={f.aboutHeading} onChange={(e) => set("aboutHeading", e.target.value)} placeholder="e.g. Built by educators, loved by toppers" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">About your institute <span className="text-rose-500">*</span></label>
                <textarea className="input min-h-[100px]" value={f.aboutIntro} onChange={(e) => set("aboutIntro", e.target.value)} placeholder="A short description of your institute — who you are and what exams you help students prepare for." />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Contact email <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="email" autoCapitalize="none" spellCheck={false} className="input pl-9" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@yourinstitute.com" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Phone <span className="font-normal text-slate-400">(optional)</span></label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className="input pl-9" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Address <span className="font-normal text-slate-400">(optional)</span></label>
                  <input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="City, State" />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">These appear on your <b>Privacy</b>, <b>Terms</b> and <b>Refund</b> pages (the footer <b>Resources</b> section). We've added standard text — review and edit it for your institute.</p>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Privacy Policy <span className="text-rose-500">*</span></label>
                <textarea className="input min-h-[120px]" value={f.privacyPolicy} onChange={(e) => set("privacyPolicy", e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Terms of Service <span className="text-rose-500">*</span></label>
                <textarea className="input min-h-[120px]" value={f.termsOfService} onChange={(e) => set("termsOfService", e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Refund Policy <span className="text-rose-500">*</span></label>
                <textarea className="input min-h-[120px]" value={f.refundPolicy} onChange={(e) => set("refundPolicy", e.target.value)} />
              </div>
              <p className="text-xs text-slate-400">Tip: leave a blank line between paragraphs.</p>
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">Add your social links — they appear in your website footer. This step is optional; you can skip it and add them later.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="mb-1 block text-xs font-medium text-slate-500">Facebook</label><input className="input" value={f.facebook} onChange={(e) => set("facebook", e.target.value)} placeholder="https://facebook.com/…" /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-500">Instagram</label><input className="input" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="https://instagram.com/…" /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-500">WhatsApp</label><input className="input" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="https://wa.me/…" /></div>
                <div><label className="mb-1 block text-xs font-medium text-slate-500">YouTube</label><input className="input" value={f.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder="https://youtube.com/@…" /></div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                Your website is set up! Now add your product — build quizzes, tests and more. Jump in below, or tap Finish and do it later from the admin menu.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {BUILD_LINKS.map((b) => (
                  <button
                    key={b.to}
                    type="button"
                    onClick={() => finish(b.to)}
                    disabled={saving}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-brand-900/20"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                      <b.Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{b.label}</span>
                      <span className="block text-xs text-slate-400">Open &amp; start building</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button type="button" onClick={() => { setError(""); setStep(step - 1); }} disabled={saving} className="btn-outline">Back</button>
          ) : <span />}

          <div className="flex items-center gap-2">
            {step === 4 && (
              <button type="button" onClick={() => { setError(""); setStep(5); }} disabled={saving} className="btn-ghost text-slate-500">Skip this step</button>
            )}
            {step < 4 ? (
              <button type="button" onClick={step === 1 ? next1 : step === 2 ? next2 : next3} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            ) : step === 4 ? (
              <button type="button" onClick={next4} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            ) : (
              <button type="button" onClick={() => finish()} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Finish</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
