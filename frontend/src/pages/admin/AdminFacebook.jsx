import { useEffect, useState } from "react";
import {
  Send, Loader2, CheckCircle2, AlertTriangle, KeyRound, Plus, Trash2, Pencil, X,
  Clock, CalendarClock, ListChecks, Power, Save,
} from "lucide-react";
import { Facebook, Instagram } from "../../components/ui/SocialIcons";
import { settingsService, facebookService, contentService } from "../../services";
import { useSettings } from "../../context/SettingsContext";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

const WEEKDAYS = [
  { v: 0, l: "Sun" }, { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" },
  { v: 4, l: "Thu" }, { v: 5, l: "Fri" }, { v: 6, l: "Sat" },
];

// Cascading source picker: Stream → Subject → Topic → Session → Quiz. The admin
// can stop at any level; the deepest queryable scope (quiz > session > subject)
// is reported up via onChange along with a readable label.
function SourcePicker({ onPick }) {
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [sel, setSel] = useState({}); // { stream, subject, topic, session, quiz } → node objects

  useEffect(() => { contentService.streams().then(setStreams).catch(() => setStreams([])); }, []);

  const emit = (next) => {
    const label = [next.stream?.name, next.subject?.name, next.topic?.title, next.session?.title, next.quiz?.title].filter(Boolean).join(" › ");
    onPick({
      subject: next.subject?._id || null,
      session: next.session?._id || null,
      quiz: next.quiz?._id || null,
      label,
    });
  };

  const pickStream = async (id) => {
    const stream = streams.find((s) => s._id === id) || null;
    const next = { stream }; setSel(next); setSubjects([]); setTopics([]); setSessions([]); setQuizzes([]); emit(next);
    if (stream) contentService.subjectsByStream(id).then(setSubjects).catch(() => {});
  };
  const pickSubject = async (id) => {
    const subject = subjects.find((s) => s._id === id) || null;
    const next = { ...sel, subject, topic: null, session: null, quiz: null }; setSel(next); setTopics([]); setSessions([]); setQuizzes([]); emit(next);
    if (subject) contentService.topics(id).then(setTopics).catch(() => {});
  };
  const pickTopic = async (id) => {
    const topic = topics.find((t) => t._id === id) || null;
    const next = { ...sel, topic, session: null, quiz: null }; setSel(next); setSessions([]); setQuizzes([]); emit(next);
    if (topic) contentService.sessions(id).then(setSessions).catch(() => {});
  };
  const pickSession = async (id) => {
    const session = sessions.find((s) => s._id === id) || null;
    const next = { ...sel, session, quiz: null }; setSel(next); setQuizzes([]); emit(next);
    if (session) contentService.quizzes(id).then(setQuizzes).catch(() => {});
  };
  const pickQuiz = (id) => {
    const quiz = quizzes.find((q) => q._id === id) || null;
    const next = { ...sel, quiz }; setSel(next); emit(next);
  };

  const Row = ({ label, options, value, onChange, labelKey = "name", disabled }) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">— {disabled ? "pick the level above first" : "any / choose"} —</option>
        {options.map((o) => <option key={o._id} value={o._id}>{o[labelKey] || o.name || o.title}</option>)}
      </select>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Row label="Stream" options={streams} value={sel.stream?._id} onChange={pickStream} />
      <Row label="Subject" options={subjects} value={sel.subject?._id} onChange={pickSubject} disabled={!sel.stream} />
      <Row label="Topic (optional)" options={topics} value={sel.topic?._id} onChange={pickTopic} labelKey="title" disabled={!sel.subject} />
      <Row label="Session (optional)" options={sessions} value={sel.session?._id} onChange={pickSession} labelKey="title" disabled={!sel.topic} />
      <Row label="Quiz (optional)" options={quizzes} value={sel.quiz?._id} onChange={pickQuiz} labelKey="title" disabled={!sel.session} />
    </div>
  );
}

const emptyForm = {
  title: "", source: { subject: null, session: null, quiz: null, label: "" },
  times: ["09:00"], days: [], timezone: "Asia/Kolkata",
  includeOptions: true, includeAnswer: false, includeLink: false, hashtags: "", order: "random",
  toFacebook: true, toInstagram: false, asImage: false,
};

export default function AdminFacebook() {
  const { settings, save: saveSettings } = useSettings();

  // ---- Connection config ----
  const [fb, setFb] = useState({ fbEnabled: false, fbPageId: "", fbGraphVersion: "v21.0", igEnabled: false, igUserId: "" });
  const [fbToken, setFbToken] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  const [fbTesting, setFbTesting] = useState(false);
  const [igTesting, setIgTesting] = useState(false);
  const [fbMsg, setFbMsg] = useState(null);
  const [igMsg, setIgMsg] = useState(null);

  useEffect(() => {
    setFb({
      fbEnabled: settings?.fbEnabled === true, fbPageId: settings?.fbPageId || "", fbGraphVersion: settings?.fbGraphVersion || "v21.0",
      igEnabled: settings?.igEnabled === true, igUserId: settings?.igUserId || "",
    });
  }, [settings?.fbEnabled, settings?.fbPageId, settings?.fbGraphVersion, settings?.igEnabled, settings?.igUserId]);

  const saveFb = async () => {
    setFbSaving(true); setFbMsg(null);
    try {
      await saveSettings({ ...fb, ...(fbToken.trim() ? { fbPageAccessToken: fbToken.trim() } : {}) });
      setFbToken(""); setFbMsg({ ok: true, text: "Saved." });
    } catch (e) { setFbMsg({ ok: false, text: e.message }); } finally { setFbSaving(false); }
  };
  const testFb = async () => {
    setFbTesting(true); setFbMsg(null);
    try { const r = await settingsService.testFacebook({}); setFbMsg({ ok: true, text: `Posted to Facebook${r?.id ? ` (id ${r.id})` : ""}. Check your Page.` }); }
    catch (e) { setFbMsg({ ok: false, text: e.message || "Could not post." }); } finally { setFbTesting(false); }
  };
  const testIg = async () => {
    setIgTesting(true); setIgMsg(null);
    try { const r = await settingsService.testInstagram({}); setIgMsg({ ok: true, text: `Posted to Instagram${r?.id ? ` (id ${r.id})` : ""}. Check your profile.` }); }
    catch (e) { setIgMsg({ ok: false, text: e.message || "Could not post to Instagram." }); } finally { setIgTesting(false); }
  };

  // ---- Schedules ----
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // null = closed; else the schedule being created/edited
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null); // per-row action in progress
  const [rowMsg, setRowMsg] = useState({}); // id → text

  const load = () => {
    setLoading(true); setError("");
    facebookService.schedules().then(setSchedules).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => setForm({ ...emptyForm, times: ["09:00"] });
  const openEdit = (s) => setForm({
    _id: s._id, title: s.title || "", source: s.source || emptyForm.source,
    times: s.times?.length ? s.times : ["09:00"], days: s.days || [], timezone: s.timezone || "Asia/Kolkata",
    includeOptions: s.includeOptions !== false, includeAnswer: !!s.includeAnswer, includeLink: !!s.includeLink,
    hashtags: s.hashtags || "", order: s.order || "random",
    toFacebook: s.toFacebook !== false, toInstagram: !!s.toInstagram, asImage: !!s.asImage,
  });

  const setTime = (i, v) => setForm((f) => ({ ...f, times: f.times.map((t, k) => (k === i ? v : t)) }));
  const addTime = () => setForm((f) => ({ ...f, times: [...f.times, "18:00"] }));
  const removeTime = (i) => setForm((f) => ({ ...f, times: f.times.filter((_, k) => k !== i) }));
  const toggleDay = (v) => setForm((f) => ({ ...f, days: f.days.includes(v) ? f.days.filter((d) => d !== v) : [...f.days, v] }));

  const saveForm = async () => {
    if (!form.source.subject && !form.source.session && !form.source.quiz) { setError("Pick a source (subject, session or quiz)."); return; }
    if (!form.times.filter(Boolean).length) { setError("Add at least one time."); return; }
    if (!form.toFacebook && !form.toInstagram) { setError("Choose at least one destination (Facebook and/or Instagram)."); return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form, times: form.times.filter(Boolean) };
      if (form._id) await facebookService.update(form._id, payload);
      else await facebookService.create(payload);
      setForm(null); load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const toggleEnabled = async (s) => {
    setBusyId(s._id);
    try { await facebookService.update(s._id, { ...s, enabled: !s.enabled }); load(); }
    catch (e) { setError(e.message); } finally { setBusyId(null); }
  };
  const del = async (s) => {
    if (!window.confirm("Delete this schedule?")) return;
    setBusyId(s._id);
    try { await facebookService.remove(s._id); load(); } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };
  const postNow = async (s) => {
    setBusyId(s._id); setRowMsg((m) => ({ ...m, [s._id]: "" }));
    try { const r = await facebookService.postNow(s._id); setRowMsg((m) => ({ ...m, [s._id]: r?.id ? `Posted (id ${r.id})` : "Posted." })); load(); }
    catch (e) { setRowMsg((m) => ({ ...m, [s._id]: e.message || "Failed." })); } finally { setBusyId(null); }
  };

  const daysLabel = (days) => (!days?.length ? "Every day" : WEEKDAYS.filter((w) => days.includes(w.v)).map((w) => w.l).join(", "));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Facebook className="h-6 w-6 text-[#1877F2]" /> Facebook Auto-Post</h1>
        <p className="text-slate-500 dark:text-slate-400">Connect your Facebook Page and schedule questions from any topic/quiz to post automatically at set times. Independent of the Notice Board.</p>
      </div>

      {/* Connection */}
      <div className="card p-5">
        <h2 className="flex items-center gap-2 font-bold"><Power className="h-4 w-4 text-[#1877F2]" /> Connection</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your access token is stored on the server and never shown in the browser.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-medium">Enable Facebook posting</span>
            <button type="button" onClick={() => setFb((f) => ({ ...f, fbEnabled: !f.fbEnabled }))}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${fb.fbEnabled ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${fb.fbEnabled ? "left-6" : "left-1"}`} />
            </button>
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium">Graph API version</label>
            <input className="input" value={fb.fbGraphVersion} onChange={(e) => setFb((f) => ({ ...f, fbGraphVersion: e.target.value }))} placeholder="v21.0" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Facebook Page ID</label>
            <input className="input" value={fb.fbPageId} onChange={(e) => setFb((f) => ({ ...f, fbPageId: e.target.value }))} placeholder="e.g. 100091234567890" />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium"><KeyRound className="h-4 w-4 text-slate-400" /> Page Access Token</label>
            <input type="password" className="input" value={fbToken} onChange={(e) => setFbToken(e.target.value)} autoComplete="off"
              placeholder={settings?.fbTokenSet ? "•••••••• (saved — type to replace)" : "Paste long-lived Page token"} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveFb} disabled={fbSaving} className="btn-primary">{fbSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save connection</>}</button>
          <button type="button" onClick={testFb} disabled={fbTesting || !settings?.fbTokenSet} className="btn-outline">{fbTesting ? <><Loader2 className="h-4 w-4 animate-spin" /> Posting…</> : <><Send className="h-4 w-4" /> Send test post</>}</button>
          {fbMsg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${fbMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>{fbMsg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {fbMsg.text}</span>}
        </div>
      </div>

      {/* Instagram */}
      <div className="card p-5">
        <h2 className="flex items-center gap-2 font-bold"><Instagram className="h-5 w-5 text-[#E1306C]" /> Instagram cross-posting</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Also post to Instagram. Requires an <b>Instagram Business/Creator account linked to your Facebook Page</b>. Instagram posts are always images, so those schedules auto-generate a question image.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-medium">Enable Instagram posting</span>
            <button type="button" onClick={() => setFb((f) => ({ ...f, igEnabled: !f.igEnabled }))}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${fb.igEnabled ? "bg-[#E1306C]" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${fb.igEnabled ? "left-6" : "left-1"}`} />
            </button>
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium">Instagram account ID <span className="font-normal text-slate-400">(optional — auto-detected)</span></label>
            <input className="input" value={fb.igUserId} onChange={(e) => setFb((f) => ({ ...f, igUserId: e.target.value }))} placeholder="Leave blank to auto-detect from the Page" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveFb} disabled={fbSaving} className="btn-primary">{fbSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save</>}</button>
          <button type="button" onClick={testIg} disabled={igTesting || !settings?.fbTokenSet} className="btn-outline">{igTesting ? <><Loader2 className="h-4 w-4 animate-spin" /> Posting…</> : <><Send className="h-4 w-4" /> Send test to Instagram</>}</button>
          {igMsg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${igMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>{igMsg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {igMsg.text}</span>}
        </div>
      </div>

      {/* Schedules */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold"><Clock className="h-4 w-4 text-brand-600" /> Scheduled posts</h2>
          {!form && <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> New schedule</button>}
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

        {/* Create / edit form */}
        {form && (
          <div className="mt-4 rounded-xl border border-brand-200 p-4 dark:border-brand-900/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">{form._id ? "Edit schedule" : "New schedule"}</h3>
              <button onClick={() => { setForm(null); setError(""); }}><X className="h-5 w-5" /></button>
            </div>

            <label className="mb-1 block text-sm font-medium">Title (optional)</label>
            <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Daily Accountancy question" />

            <p className="mb-1 mt-4 text-sm font-semibold">Source — where questions come from</p>
            {form._id && form.source?.label && <p className="mb-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:bg-slate-800/60">Current: <b>{form.source.label}</b> — re-pick below to change it.</p>}
            <SourcePicker onPick={(source) => setForm((f) => ({ ...f, source }))} />
            {form.source?.label && <p className="mt-2 text-xs text-emerald-600">Selected: {form.source.label}</p>}

            <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-slate-400" /> Times (posts one question at each)</p>
            <div className="flex flex-wrap items-center gap-2">
              {form.times.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
                  <input type="time" value={t} onChange={(e) => setTime(i, e.target.value)} className="bg-transparent text-sm outline-none" />
                  {form.times.length > 1 && <button onClick={() => removeTime(i)} className="text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>}
                </span>
              ))}
              <button onClick={addTime} className="btn-outline !py-1 !text-xs"><Plus className="h-3.5 w-3.5" /> Add time</button>
            </div>

            <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-slate-400" /> Days <span className="font-normal text-slate-400">(none = every day)</span></p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => (
                <button key={w.v} onClick={() => toggleDay(w.v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${form.days.includes(w.v) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{w.l}</button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Timezone</label>
                <input className="input" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="Asia/Kolkata" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Order</label>
                <select className="input" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}>
                  <option value="random">Random (no repeats until all used)</option>
                  <option value="sequential">Sequential (oldest first)</option>
                </select>
              </div>
            </div>

            <p className="mb-1 mt-4 text-sm font-semibold">Post to</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#1877F2]" checked={form.toFacebook} onChange={(e) => setForm((f) => ({ ...f, toFacebook: e.target.checked }))} /> Facebook
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#E1306C]" checked={form.toInstagram} onChange={(e) => setForm((f) => ({ ...f, toInstagram: e.target.checked }))} /> Instagram <span className="text-slate-400">(image)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.asImage} onChange={(e) => setForm((f) => ({ ...f, asImage: e.target.checked }))} /> Post as image on Facebook
              </label>
            </div>
            {form.toInstagram && <p className="mt-1 text-xs text-slate-400">Instagram always posts an image, so a question image is generated automatically.</p>}

            <p className="mb-1 mt-4 text-sm font-semibold">Content</p>
            <div className="flex flex-wrap gap-4">
              {[["includeOptions", "Show A/B/C/D options"], ["includeAnswer", "Reveal the answer + explanation"], ["includeLink", "Append site link"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} /> {l}
                </label>
              ))}
            </div>

            <label className="mb-1 mt-4 block text-sm font-medium">Hashtags (optional)</label>
            <input className="input" value={form.hashtags} onChange={(e) => setForm((f) => ({ ...f, hashtags: e.target.value }))} placeholder="#GK #JKSSB #Quiz" />

            <div className="mt-4 flex gap-2">
              <button onClick={saveForm} disabled={saving} className="btn-primary">{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> {form._id ? "Save changes" : "Create schedule"}</>}</button>
              <button onClick={() => { setForm(null); setError(""); }} className="btn-outline">Cancel</button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? <div className="mt-6"><Loading label="Loading schedules..." /></div>
          : error && !form ? <div className="mt-6"><ErrorState message={error} onRetry={load} /></div>
          : schedules.length === 0 && !form ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
              <p className="text-sm text-slate-500 dark:text-slate-400">No schedules yet. Create one to auto-post questions at set times.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {schedules.map((s) => (
                <div key={s._id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        <span className={`inline-block h-2 w-2 rounded-full ${s.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {s.title || s.source?.label || "Untitled schedule"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.source?.label || "—"}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {(s.times || []).join(", ") || "—"}</span>
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {daysLabel(s.days)}</span>
                        <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" /> {s.postCount || 0} posted</span>
                        <span className="text-slate-400">{s.timezone}</span>
                      </div>
                      {(rowMsg[s._id] || s.lastResult) && <p className="mt-1 text-xs text-slate-400">{rowMsg[s._id] || s.lastResult}</p>}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button onClick={() => postNow(s)} disabled={busyId === s._id} title="Post one now" className="rounded-lg p-2 text-[#1877F2] hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-900/30">{busyId === s._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
                      <button onClick={() => toggleEnabled(s)} disabled={busyId === s._id} title={s.enabled ? "Pause" : "Enable"} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"><Power className="h-4 w-4" /></button>
                      <button onClick={() => openEdit(s)} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => del(s)} disabled={busyId === s._id} title="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-900/20"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
