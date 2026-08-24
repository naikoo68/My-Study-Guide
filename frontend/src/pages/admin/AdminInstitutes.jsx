import { useEffect, useState } from "react";
import { School, Plus, UserPlus, X, Search, CheckCircle2, Ban, Users, FileStack, HelpCircle, Store, ShieldCheck, Globe, Copy, Trash2, AlertTriangle, ListChecks, Eye, EyeOff } from "lucide-react";
import { tenantService } from "../../services";
import { INSTITUTE_FEATURES } from "../../lib/instituteFeatures";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import Badge from "../../components/ui/Badge";

const STATUS_VARIANT = { active: "Easy", pending: "accent", suspended: "Hard" };
const blankTenant = { name: "", slug: "", ownerName: "", ownerEmail: "" };
const blankAdmin = { name: "", email: "", password: "" };

// Super-admin console: view every institute (tenant), create new ones, create
// their institute admin, and activate/suspend them. Super-admin only — an
// institute_admin can reach the /admin area but not this page.
export default function AdminInstitutes() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const { settings, save: saveSettings } = useSettings();
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankTenant);
  const [saving, setSaving] = useState(false);
  const [adminFor, setAdminFor] = useState(null); // tenant we're creating an admin for
  const [adminForm, setAdminForm] = useState(blankAdmin);
  const [domainFor, setDomainFor] = useState(null); // tenant whose custom domain we're editing
  const [domainVal, setDomainVal] = useState("");
  const [dnsInfo, setDnsInfo] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null); // tenant we're about to permanently delete
  const [deleteConfirm, setDeleteConfirm] = useState(""); // typed slug — must match to enable delete
  const [deleting, setDeleting] = useState(false);
  const [featuresFor, setFeaturesFor] = useState(null); // tenant whose feature access we're editing
  const [featuresAll, setFeaturesAll] = useState(false); // true = editing access for ALL institutes at once
  const [featuresForm, setFeaturesForm] = useState({}); // { featureKey: boolean }
  const [savingFeatures, setSavingFeatures] = useState(false);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2800); };

  // Build & copy the shareable public portal link for an institute. Until each
  // institute has its own custom domain, students reach it via ?t=<slug> on the
  // main site (the API layer sends that slug so the visitor sees this
  // institute's branding & data). Falls back to a hidden textarea on older /
  // non-secure mobile browsers where navigator.clipboard is unavailable.
  const copyLink = async (t) => {
    const link = `${window.location.origin}/?t=${t.slug}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const ta = document.createElement("textarea");
        ta.value = link;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      flash("Public link copied.");
    } catch {
      flash(link); // clipboard blocked — at least show the link so it can be copied by hand
    }
  };

  const load = () => {
    setLoading(true);
    setError("");
    tenantService.list(search)
      .then((r) => setTenants(r.tenants || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only the platform super-admin may manage institutes.
  if (user && user.role !== "admin") {
    return (
      <div className="card p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-xl font-extrabold">Super-admin only</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Managing institutes is restricted to the platform owner.</p>
      </div>
    );
  }

  const createTenant = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await tenantService.create(form);
      setCreateOpen(false);
      setForm(blankTenant);
      flash("Institute created.");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Public visibility of the whole Institute feature (public sign-up tab,
  // pricing "For Institutes", /institute/register). Existing institutes are
  // unaffected — this only controls what new public visitors can discover.
  const publicInstituteOn = settings?.publicInstituteEnabled !== false;
  const togglePublicInstitute = async () => {
    setTogglingPublic(true);
    try {
      await saveSettings({ publicInstituteEnabled: !publicInstituteOn });
      flash(!publicInstituteOn ? "Institute sign-up is now visible on your public site." : "Institute sign-up is now hidden from the public.");
    } catch (e) {
      flash(e.message || "Could not update.");
    } finally {
      setTogglingPublic(false);
    }
  };

  const toggleStatus = async (t) => {
    const next = t.status === "active" ? "suspended" : "active";
    try {
      await tenantService.setStatus(t.id, next);
      setTenants((list) => list.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
      flash(next === "active" ? "Institute activated — its users can sign in again." : "Institute suspended — its admins & members can no longer sign in.");
    } catch (err) {
      flash(err.message);
    }
  };

  const openDomain = (t) => { setDomainFor(t); setDomainVal(t.customDomain || ""); setDnsInfo(null); setError(""); };

  const saveDomain = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await tenantService.setDomain(domainFor.id, domainVal.trim());
      setTenants((list) => list.map((x) => (x.id === domainFor.id ? { ...x, customDomain: res.customDomain || "" } : x)));
      setDnsInfo(res.dns || null);
      flash(res.customDomain ? "Custom domain saved." : "Custom domain removed.");
      if (!res.customDomain) setDomainFor(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createAdmin = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await tenantService.createAdmin(adminFor.id, adminForm);
      setAdminFor(null);
      setAdminForm(blankAdmin);
      flash("Institute admin created.");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (t) => { setDeleteFor(t); setDeleteConfirm(""); setError(""); };

  // Feature access: open the modal seeded from the institute's saved features
  // (a feature is ON unless explicitly false).
  const openFeatures = (t) => {
    const f = {};
    for (const feat of INSTITUTE_FEATURES) f[feat.key] = (t.features || {})[feat.key] !== false;
    setFeaturesForm(f);
    setFeaturesFor(t);
    setError("");
  };
  // Open the modal in "all institutes" mode. Seed each toggle from the CURRENT
  // institutes so it reflects what's already saved: a feature shows ON only if
  // EVERY institute has it on (so anything you turned off stays off on reopen).
  // With no institutes yet, default to all-on.
  const openFeaturesAll = () => {
    const others = tenants.filter((t) => !t.isDefault);
    const form = {};
    for (const feat of INSTITUTE_FEATURES) {
      form[feat.key] = others.length === 0
        ? true
        : others.every((t) => (t.features || {})[feat.key] !== false);
    }
    setFeaturesForm(form);
    setFeaturesAll(true);
    setError("");
  };
  const closeFeatures = () => { setFeaturesFor(null); setFeaturesAll(false); };
  const toggleFeature = (key) => setFeaturesForm((s) => ({ ...s, [key]: !s[key] }));
  const setAllFeatures = (val) => setFeaturesForm(Object.fromEntries(INSTITUTE_FEATURES.map((f) => [f.key, val])));

  const saveFeatures = async (e) => {
    e.preventDefault();
    setSavingFeatures(true);
    setError("");
    try {
      if (featuresAll) {
        await tenantService.setAllFeatures(featuresForm);
        closeFeatures();
        flash("Access updated for all institutes.");
        load(); // refresh every card's features
      } else {
        const res = await tenantService.setFeatures(featuresFor.id, featuresForm);
        setTenants((list) => list.map((x) => (x.id === featuresFor.id ? { ...x, features: res.features || featuresForm } : x)));
        closeFeatures();
        flash("Access updated. The institute admin sees the change on their next load.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingFeatures(false);
    }
  };

  // Permanently delete an institute and ALL its data. Guarded by requiring the
  // super-admin to type the institute's exact subdomain (slug) first.
  const deleteTenant = async (e) => {
    e.preventDefault();
    if (!deleteFor || deleteConfirm.trim().toLowerCase() !== deleteFor.slug) return;
    setDeleting(true);
    setError("");
    try {
      await tenantService.remove(deleteFor.id);
      setTenants((list) => list.filter((x) => x.id !== deleteFor.id));
      setDeleteFor(null);
      setDeleteConfirm("");
      flash("Institute deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold"><School className="h-6 w-6 text-brand-600" /> Institutes</h1>
          <p className="text-slate-500 dark:text-slate-400">Every institute (tenant) on the platform. Create institutes, give each its own admin, and activate/suspend them.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={togglePublicInstitute} disabled={togglingPublic} title="Show or hide the Institute sign-up option on your public website. Existing institutes are not affected." className={`btn-outline ${publicInstituteOn ? "" : "!border-amber-300 !text-amber-700 dark:!text-amber-300"}`}>
            {publicInstituteOn ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {publicInstituteOn ? "Public sign-up: On" : "Public sign-up: Hidden"}
          </button>
          <button onClick={openFeaturesAll} className="btn-outline">
            <ListChecks className="h-4 w-4" /> Manage access (all)
          </button>
          <button onClick={() => { setForm(blankTenant); setError(""); setCreateOpen(true); }} className="btn-primary">
            <Plus className="h-4 w-4" /> New Institute
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search name / subdomain / owner…"
          className="input pl-9"
        />
      </div>

      {loading ? (
        <Loading label="Loading institutes..." />
      ) : error && !createOpen && !adminFor ? (
        <ErrorState message={error} onRetry={load} />
      ) : tenants.length === 0 ? (
        <EmptyState message="No institutes yet. Click “New Institute” to create one." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tenants.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{t.name}{t.isDefault && <span className="ml-2 text-[10px] font-semibold text-slate-400">DEFAULT</span>}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{t.slug}{t.customDomain ? ` · ${t.customDomain}` : ""}</p>
                </div>
                <Badge variant={STATUS_VARIANT[t.status] || "neutral"}>{t.status}</Badge>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="flex items-center justify-center gap-1 text-sm font-extrabold"><Users className="h-3.5 w-3.5 text-brand-500" />{t.stats?.students ?? 0}</p><p className="text-[10px] text-slate-400">Students</p></div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="flex items-center justify-center gap-1 text-sm font-extrabold"><FileStack className="h-3.5 w-3.5 text-accent-500" />{t.stats?.tests ?? 0}</p><p className="text-[10px] text-slate-400">Tests</p></div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="flex items-center justify-center gap-1 text-sm font-extrabold"><HelpCircle className="h-3.5 w-3.5 text-violet-500" />{t.stats?.questions ?? 0}</p><p className="text-[10px] text-slate-400">Questions</p></div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" /> {t.stats?.clients ?? 0} clients</span>
                <span>{t.stats?.instituteAdmins ?? 0} admin(s)</span>
              </div>

              <div className="mt-2 flex flex-col gap-1.5">
                <button onClick={() => openDomain(t)} className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                  <Globe className="h-3.5 w-3.5 flex-shrink-0" /> {t.customDomain ? t.customDomain : "Add custom domain"}
                </button>
                <button onClick={() => copyLink(t)} className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-slate-500 hover:underline dark:text-slate-400">
                  <Copy className="h-3.5 w-3.5 flex-shrink-0" /> Copy public link
                </button>
                {!t.isDefault && (
                  <button onClick={() => openFeatures(t)} className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                    <ListChecks className="h-3.5 w-3.5 flex-shrink-0" /> Manage access
                  </button>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button onClick={() => { setAdminFor(t); setAdminForm(blankAdmin); setError(""); }} className="btn-outline flex-1 py-2 text-xs"><UserPlus className="h-3.5 w-3.5" /> Add admin</button>
                <button onClick={() => toggleStatus(t)} disabled={t.isDefault} title={t.isDefault ? "The default institute can't be suspended" : t.status === "active" ? "Suspend — block this institute's admins & members from signing in" : "Activate — let this institute's users sign in again"} className={`flex-1 rounded-xl py-2 text-xs font-semibold ${t.status === "active" ? "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"} disabled:opacity-40`}>
                  {t.status === "active" ? <><Ban className="mr-1 inline h-3.5 w-3.5" />Suspend</> : <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Activate</>}
                </button>
                <button onClick={() => openDelete(t)} disabled={t.isDefault} title={t.isDefault ? "The default institute can't be deleted" : "Delete this institute permanently"} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40 dark:bg-rose-900/30 dark:text-rose-300">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create institute modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={createTenant} className="my-8 w-full max-w-md animate-scale-in card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">New Institute</h3>
              <button type="button" onClick={() => setCreateOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {error && <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Institute name</label>
                <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bright Future Academy" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Subdomain</label>
                <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="brightfuture (→ brightfuture.yourdomain)" />
                <p className="mt-1 text-xs text-slate-400">Lowercase letters, numbers and hyphens. Leave blank to auto-generate from the name.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Owner name <span className="font-normal text-slate-400">(optional)</span></label>
                  <input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Owner email <span className="font-normal text-slate-400">(optional)</span></label>
                  <input type="email" className="input" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCreateOpen(false)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating..." : "Create Institute"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Create institute admin modal */}
      {adminFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={createAdmin} className="my-8 w-full max-w-md animate-scale-in card p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add admin</h3>
              <button type="button" onClick={() => setAdminFor(null)}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Institute admin for <b>{adminFor.name}</b></p>
            {error && <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Full name</label>
                <input required className="input" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <input required type="email" autoCapitalize="none" spellCheck={false} className="input" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Password</label>
                <input required minLength={6} className="input" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="At least 6 characters" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setAdminFor(null)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating..." : "Create Admin"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Custom domain modal */}
      {domainFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={saveDomain} className="my-8 w-full max-w-md animate-scale-in card p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><Globe className="h-5 w-5 text-brand-600" /> Custom domain</h3>
              <button type="button" onClick={() => setDomainFor(null)}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">For <b>{domainFor.name}</b></p>
            {error && <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Domain</label>
              <input value={domainVal} onChange={(e) => setDomainVal(e.target.value)} placeholder="exam.brightfuture.com" className="input" />
              <p className="mt-1 text-xs text-slate-400">Leave blank and save to remove the custom domain.</p>
            </div>

            {dnsInfo && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/60">
                <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Next steps — DNS</p>
                <p className="text-slate-500 dark:text-slate-400">
                  Point <b>{dnsInfo.cname?.host}</b> to <b>{dnsInfo.cname?.pointsTo}</b> (CNAME), then add the domain in your frontend host (e.g. Vercel) so it's served with SSL.
                </p>
                <p className="mt-1 text-slate-400">{dnsInfo.note}</p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDomainFor(null)} className="btn-outline">Close</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save domain"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Manage feature access modal (single institute OR all at once) */}
      {(featuresFor || featuresAll) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={saveFeatures} className="my-8 w-full max-w-lg animate-scale-in card p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><ListChecks className="h-5 w-5 text-brand-600" /> {featuresAll ? "Manage access — all institutes" : "Manage access"}</h3>
              <button type="button" onClick={closeFeatures}><X className="h-5 w-5" /></button>
            </div>
            {featuresAll ? (
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Choose which sections <b>every institute</b> can use. This <b>overwrites the access settings of all institutes</b> (the default/platform space is not affected). Turned-off items are hidden from institute admins.</p>
            ) : (
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Choose which sections <b>{featuresFor.name}</b> can use. Turned-off items are hidden from that institute's admin panel. (Dashboard, Customization &amp; User Manual are always available.)</p>
            )}
            {error && <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}
            <div className="mb-3 flex gap-2">
              <button type="button" onClick={() => setAllFeatures(true)} className="btn-outline py-1 text-xs">Enable all</button>
              <button type="button" onClick={() => setAllFeatures(false)} className="btn-outline py-1 text-xs">Disable all</button>
            </div>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
              {INSTITUTE_FEATURES.map((f) => (
                <label key={f.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <span className="text-sm font-medium">{f.label}</span>
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={featuresForm[f.key] !== false} onChange={() => toggleFeature(f.key)} />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeFeatures} className="btn-outline">Cancel</button>
              <button type="submit" disabled={savingFeatures} className="btn-primary">{savingFeatures ? "Saving..." : featuresAll ? "Apply to all institutes" : "Save access"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete institute (permanent) modal */}
      {deleteFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={deleteTenant} className="my-8 w-full max-w-md animate-scale-in card p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-rose-600 dark:text-rose-400"><AlertTriangle className="h-5 w-5" /> Delete institute</h3>
              <button type="button" onClick={() => setDeleteFor(null)}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
              This permanently deletes <b>{deleteFor.name}</b> and <b>everything inside it</b> — its admins, students, clients, questions, tests and settings. Its subdomain <b>{deleteFor.slug}</b> will become available again. <span className="font-semibold text-rose-600 dark:text-rose-400">This cannot be undone.</span>
            </p>
            <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              Contains: {deleteFor.stats?.students ?? 0} students · {deleteFor.stats?.instituteAdmins ?? 0} admin(s) · {deleteFor.stats?.tests ?? 0} tests · {deleteFor.stats?.questions ?? 0} questions
            </div>
            {error && <div className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Type <b>{deleteFor.slug}</b> to confirm</label>
              <input autoFocus autoCapitalize="none" spellCheck={false} className="input" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={deleteFor.slug} />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteFor(null)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={deleting || deleteConfirm.trim().toLowerCase() !== deleteFor.slug} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
                {deleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-slate-700">{toast}</div>
      )}
    </div>
  );
}
