// Admin → Facebook auto-post page — connect a page/account and configure automatic
// social posts for new content.

import { useEffect, useState, useRef } from "react";
import {
  Send, Loader2, CheckCircle2, AlertTriangle, KeyRound, Plus, Trash2, Pencil, X,
  Clock, CalendarClock, ListChecks, Power, Save, Upload, UserCircle, Type, Search, Mail,
  ImagePlus, FileText, Wand2, RefreshCw, Film, Music, Camera, ChevronDown, MessageCircle,
} from "lucide-react";
import { Facebook, Instagram } from "../../components/ui/SocialIcons";
import { settingsService, facebookService, contentService, practiceService, uploadService } from "../../services";
import { useSettings } from "../../context/SettingsContext";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

const WEEKDAYS = [
  { v: 0, l: "Sun" }, { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" },
  { v: 4, l: "Thu" }, { v: 5, l: "Fri" }, { v: 6, l: "Sat" },
];

// Older schedule rows can contain the same full Meta permission response once
// per saved comment, or now the shorter preflight note the backend emits when
// it already knows the token is missing the required comment scope. Both cases
// collapse to one actionable message per platform, and the visible IG "Fatal"
// and 2207076 lines get a friendlier one-liner too.
function compactScheduleResult(value) {
  const parts = String(value || "").split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
  const normalized = parts.map((part) => {
    if (/^FB comment\s*✗/i.test(part) && /permission|\(#?200\)|pages_manage_engagement/i.test(part)) {
      return "FB comment ✗ Meta permission missing: approve pages_manage_engagement, then save a newly authorized Page token.";
    }
    if (/^IG comment\s*✗/i.test(part) && /permission|\(#?10\)|instagram_manage_comments/i.test(part)) {
      return "IG comment ✗ Meta permission missing: approve instagram_manage_comments, then save a newly authorized token.";
    }
    if (/^Instagram\s*✗/i.test(part) && /2207076|Media upload has failed|^Instagram ✗ \(Fatal\)$/i.test(part)) {
      // The same "Fatal" / 2207076 signature comes back for both feed images and
      // Reel videos. Feed images are already width-capped; Reel videos now use
      // an explicit 30 fps / 3.5 Mbps H.264 + 48 kHz AAC render and a 3 s
      // minimum duration (Instagram Reel spec). If the message still repeats,
      // the audio track is likely too short or unusually encoded.
      return "Instagram ✗ Meta rejected the media (retried once). Reel video is now rendered at 30 fps H.264 / 48 kHz AAC and images capped at 1440 px. If it repeats, pick a longer audio track (≥ 3 s) or wait a few minutes.";
    }
    if (/^IG Story\s*✗/i.test(part) && /operation was aborted|aborted/i.test(part)) {
      return "IG Story ✗ Meta took too long to validate the 9:16 image (timeout raised to 45s). Try again — the retry usually succeeds.";
    }
    return part;
  });
  return [...new Set(normalized)].join(" · ");
}

// Cascading source picker: Stream → Subject → Topic → Session → Quiz. The admin
// can stop at any level; the deepest queryable scope (quiz > session > subject)
// is reported up via onChange along with a readable label.
// Supports both the main quiz hierarchy AND "My Quiz" (Practice Quizzes).
function SourcePicker({ onPick }) {
  const [mode, setMode] = useState("quiz"); // "quiz" = main quiz bank, "practice" = My Quiz
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [practiceItems, setPracticeItems] = useState([]); // My Quiz items (TestSeries)
  const [sel, setSel] = useState({}); // { stream, subject, topic, session, quiz } → node objects

  useEffect(() => {
    setSel({}); setStreams([]); setSubjects([]); setTopics([]); setSessions([]); setQuizzes([]); setPracticeItems([]);
    if (mode === "quiz") {
      contentService.streams().then(setStreams).catch(() => setStreams([]));
    } else {
      practiceService.adminStreams("quiz").then(setStreams).catch(() => setStreams([]));
    }
  }, [mode]);

  const emit = (next) => {
    if (mode === "quiz") {
      const label = [next.stream?.name, next.subject?.name, next.topic?.title, next.session?.title, next.quiz?.title].filter(Boolean).join(" › ");
      onPick({
        subject: next.subject?._id || null,
        session: next.session?._id || null,
        quiz: next.quiz?._id || null,
        testSeries: null,
        label,
      });
    } else {
      // Practice (My Quiz) — items are TestSeries documents. Practice topics
      // store their name in `.name` (content topics use `.title`), so read both
      // or the topic level silently drops out of the breadcrumb.
      const label = ["My Quiz", next.stream?.name, next.subject?.name, next.topic?.title || next.topic?.name, next.quiz?.name || next.quiz?.title].filter(Boolean).join(" › ");
      onPick({
        subject: null,
        session: null,
        quiz: null,
        testSeries: next.quiz?._id || null,
        label,
      });
    }
  };

  const pickStream = async (id) => {
    const stream = streams.find((s) => s._id === id) || null;
    const next = { stream }; setSel(next); setSubjects([]); setTopics([]); setSessions([]); setQuizzes([]); setPracticeItems([]); emit(next);
    if (stream) {
      if (mode === "quiz") {
        contentService.subjectsByStream(id).then(setSubjects).catch(() => {});
      } else {
        practiceService.adminSubjects(id).then(setSubjects).catch(() => {});
      }
    }
  };
  const pickSubject = async (id) => {
    const subject = subjects.find((s) => s._id === id) || null;
    const next = { ...sel, subject, topic: null, session: null, quiz: null }; setSel(next); setTopics([]); setSessions([]); setQuizzes([]); setPracticeItems([]); emit(next);
    if (subject) {
      if (mode === "quiz") {
        contentService.topics(id).then(setTopics).catch(() => {});
      } else {
        practiceService.adminTopics(id).then(setTopics).catch(() => {});
      }
    }
  };
  const pickTopic = async (id) => {
    const topic = topics.find((t) => t._id === id) || null;
    const next = { ...sel, topic, session: null, quiz: null }; setSel(next); setSessions([]); setQuizzes([]); setPracticeItems([]); emit(next);
    if (topic) {
      if (mode === "quiz") {
        contentService.sessions(id).then(setSessions).catch(() => {});
      } else {
        // Practice: topics contain items (TestSeries) directly
        practiceService.adminTopicItems(id).then(setPracticeItems).catch(() => {});
      }
    }
  };
  const pickSession = async (id) => {
    const session = sessions.find((s) => s._id === id) || null;
    const next = { ...sel, session, quiz: null }; setSel(next); setQuizzes([]); emit(next);
    if (session) contentService.quizzes(id).then(setQuizzes).catch(() => {});
  };
  const pickQuiz = (id) => {
    const list = mode === "quiz" ? quizzes : practiceItems;
    const quiz = list.find((q) => q._id === id) || null;
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
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("quiz")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === "quiz" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
          Quiz Bank
        </button>
        <button type="button" onClick={() => setMode("practice")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === "practice" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
          My Quiz (Practice)
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Stream" options={streams} value={sel.stream?._id} onChange={pickStream} />
        <Row label="Subject" options={subjects} value={sel.subject?._id} onChange={pickSubject} disabled={!sel.stream} />
        <Row label={mode === "quiz" ? "Topic (optional)" : "Topic"} options={topics} value={sel.topic?._id} onChange={pickTopic} labelKey="title" disabled={!sel.subject} />
        {mode === "quiz" ? (
          <>
            <Row label="Session (optional)" options={sessions} value={sel.session?._id} onChange={pickSession} labelKey="title" disabled={!sel.topic} />
            <Row label="Quiz (optional)" options={quizzes} value={sel.quiz?._id} onChange={pickQuiz} labelKey="title" disabled={!sel.session} />
          </>
        ) : (
          <Row label="My Quiz" options={practiceItems} value={sel.quiz?._id} onChange={pickQuiz} labelKey="name" disabled={!sel.topic} />
        )}
      </div>
    </div>
  );
}

// ---- Post Watermark Section ----
const POSITIONS = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "top-right", label: "Top Right" },
  { value: "top-left", label: "Top Left" },
];
const SHAPES = [
  { value: "circle", label: "Circle (selfie/logo)" },
  { value: "rectangle", label: "Rectangle (banner/stamp)" },
];

// A card whose body is hidden until the admin taps the header (accordion). Keeps
// this long settings page compact — each section (Connection, Hashtags, …) opens
// on tap. `defaultOpen` can force a section open on load.
function CollapsibleCard({ title, icon: Icon, iconClass = "h-5 w-5 text-[#1877F2]", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden p-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-4 text-left font-bold hover:bg-slate-50 dark:hover:bg-slate-800/50">
        {Icon && <Icon className={iconClass} />}
        <span>{title}</span>
        <ChevronDown className={`ml-auto h-5 w-5 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">{children}</div>}
    </div>
  );
}

function SelfieWatermarkSection({ settings, saveSettings }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [enabled, setEnabled] = useState(settings?.fbSelfieWatermarkEnabled !== false);
  const [position, setPosition] = useState(settings?.fbSelfieWatermarkPosition || "bottom-right");
  const [size, setSize] = useState(settings?.fbSelfieWatermarkSize || 120);
  const [opacity, setOpacity] = useState(settings?.fbSelfieWatermarkOpacity || 90);
  const [shape, setShape] = useState(settings?.fbSelfieWatermarkShape || "circle");
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(settings?.fbSelfieWatermarkUrl || "");

  useEffect(() => {
    setEnabled(settings?.fbSelfieWatermarkEnabled !== false);
    setPosition(settings?.fbSelfieWatermarkPosition || "bottom-right");
    setSize(settings?.fbSelfieWatermarkSize || 120);
    setOpacity(settings?.fbSelfieWatermarkOpacity || 90);
    setShape(settings?.fbSelfieWatermarkShape || "circle");
    setPreviewUrl(settings?.fbSelfieWatermarkUrl || "");
  }, [settings?.fbSelfieWatermarkEnabled, settings?.fbSelfieWatermarkPosition, settings?.fbSelfieWatermarkSize, settings?.fbSelfieWatermarkOpacity, settings?.fbSelfieWatermarkShape, settings?.fbSelfieWatermarkUrl]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg({ ok: false, text: "Please select an image file." }); return; }
    if (file.size > 5 * 1024 * 1024) { setMsg({ ok: false, text: "File too large (max 5MB)." }); return; }
    setUploading(true); setMsg(null);
    try {
      const r = await settingsService.uploadSelfieWatermark(file);
      setPreviewUrl(r.url || r.settings?.fbSelfieWatermarkUrl || "");
      setMsg({ ok: true, text: "Watermark uploaded!" });
    } catch (err) { setMsg({ ok: false, text: err.message || "Upload failed." }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleDelete = async () => {
    if (!window.confirm("Remove the watermark? Posts will no longer show it.")) return;
    setDeleting(true); setMsg(null);
    try {
      await settingsService.deleteSelfieWatermark();
      setPreviewUrl("");
      setMsg({ ok: true, text: "Watermark removed." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Delete failed." }); }
    finally { setDeleting(false); }
  };

  const saveOptions = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveSettings({ fbSelfieWatermarkEnabled: enabled, fbSelfieWatermarkPosition: position, fbSelfieWatermarkSize: size, fbSelfieWatermarkOpacity: opacity, fbSelfieWatermarkShape: shape });
      setMsg({ ok: true, text: "Settings saved." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Save failed." }); }
    finally { setSaving(false); }
  };

  const isCircle = shape === "circle";

  return (
    <CollapsibleCard title="Post Watermark" icon={Upload}>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Upload <b>any image</b> (selfie, logo, stamp, banner) to appear as a watermark on every Facebook &amp; Instagram image post. Choose the shape, position, size, and opacity.
      </p>

      <div className="mt-4 flex flex-wrap items-start gap-6">
        {/* Preview */}
        <div className="flex flex-col items-center gap-2">
          {previewUrl ? (
            <div className="relative">
              <img src={previewUrl} alt="Watermark preview"
                className={`h-28 w-28 border-4 border-brand-500 object-cover shadow-lg ${isCircle ? "rounded-full" : "rounded-xl"}`}
                style={{ opacity: opacity / 100 }} />
              <button type="button" onClick={handleDelete} disabled={deleting} title="Remove watermark"
                className="absolute -right-2 -top-2 rounded-full bg-rose-100 p-1.5 text-rose-600 shadow hover:bg-rose-200 dark:bg-rose-900/40 dark:hover:bg-rose-800/60">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className={`flex h-28 w-28 items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600 ${isCircle ? "rounded-full" : "rounded-xl"}`}>
              <UserCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            </div>
          )}
          <label className={`btn-outline cursor-pointer text-sm ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> Upload watermark</>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>

        {/* Options */}
        <div className="flex-1 space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-medium">Enable watermark on all posts</span>
            <button type="button" onClick={() => setEnabled(!enabled)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${enabled ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${enabled ? "left-6" : "left-1"}`} />
            </button>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Shape</label>
              <select className="input" value={shape} onChange={(e) => setShape(e.target.value)}>
                {SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Position</label>
              <select className="input" value={position} onChange={(e) => setPosition(e.target.value)}>
                {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Size (px)</label>
              <input type="number" className="input" min={40} max={300} value={size} onChange={(e) => setSize(+e.target.value || 120)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Opacity (%)</label>
              <input type="number" className="input" min={10} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value || 90)} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={saveOptions} disabled={saving} className="btn-primary">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save watermark settings</>}
        </button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
    </CollapsibleCard>
  );
}

// ---- Center Text Watermark Section ----
// A diagonal, semi-transparent line of text drawn across the MIDDLE of every
// Facebook/Instagram question-card image (on top of the selfie/logo above).
function TextWatermarkSection({ settings, saveSettings }) {
  const [enabled, setEnabled] = useState(settings?.fbTextWatermarkEnabled === true);
  const [text, setText] = useState(settings?.fbTextWatermarkText || "");
  const [size, setSize] = useState(settings?.fbTextWatermarkSize || 64);
  const [opacity, setOpacity] = useState(settings?.fbTextWatermarkOpacity || 12);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setEnabled(settings?.fbTextWatermarkEnabled === true);
    setText(settings?.fbTextWatermarkText || "");
    setSize(settings?.fbTextWatermarkSize || 64);
    setOpacity(settings?.fbTextWatermarkOpacity || 12);
  }, [settings?.fbTextWatermarkEnabled, settings?.fbTextWatermarkText, settings?.fbTextWatermarkSize, settings?.fbTextWatermarkOpacity]);

  // What actually prints when the text field is left blank.
  const fallback = (settings?.watermarkText || "").trim() || settings?.siteName || "My Study Guide";

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveSettings({
        fbTextWatermarkEnabled: enabled,
        fbTextWatermarkText: text,
        fbTextWatermarkSize: size,
        fbTextWatermarkOpacity: opacity,
      });
      setMsg({ ok: true, text: "Settings saved." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Save failed." }); }
    finally { setSaving(false); }
  };

  return (
    <CollapsibleCard title="Center Text Watermark" icon={Type}>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Print a diagonal line of text across the <b>middle</b> of every Facebook &amp; Instagram question-card image. Leave the text blank to use <b>{fallback}</b>.
      </p>

      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <span className="text-sm font-medium">Enable center text watermark</span>
          <button type="button" onClick={() => setEnabled(!enabled)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${enabled ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${enabled ? "left-6" : "left-1"}`} />
          </button>
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Text (optional)</label>
            <input type="text" className="input" maxLength={80} value={text} placeholder={fallback} onChange={(e) => setText(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Size (px)</label>
            <input type="number" className="input" min={12} max={300} value={size} onChange={(e) => setSize(+e.target.value || 64)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Opacity (%)</label>
            <input type="number" className="input" min={2} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value || 12)} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save watermark settings</>}
        </button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
    </CollapsibleCard>
  );
}

// ---- Facebook publication ledger (lifetime count + reconciliation) ----
// Shows the PERMANENT count of posts we published to the Page (from the FbPost
// ledger, independent of schedules) and lets the admin reconcile it against
// Facebook's own tally.
function FbLedgerStats() {
  const [stats, setStats] = useState(null);
  const [rec, setRec] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [err, setErr] = useState("");

  const loadStats = () => facebookService.stats().then(setStats).catch(() => {});
  useEffect(() => { loadStats(); }, []);

  const reconcile = async () => {
    setReconciling(true); setErr(""); setRec(null);
    try {
      const r = await facebookService.reconcile();
      setRec(r);
      if (r?.error) setErr(r.error);
      // "Lifetime posts published" and "Our records" are BOTH the authoritative
      // FbPost ledger count (countFacebookPosts). The lifetime figure is only
      // fetched on mount, so a publication that happens afterwards leaves it
      // stale and lower than the freshly-read reconcile count. Adopt the
      // reconcile value — the same authoritative source — and refresh the recent
      // list so the two figures always agree.
      const appCount = typeof r?.applicationCount === "number" ? r.applicationCount : r?.ours;
      if (typeof appCount === "number") {
        setStats((s) => (s ? { ...s, lifetime: appCount } : s));
        loadStats();
      }
    } catch (e) { setErr(e.message || "Could not reconcile."); }
    finally { setReconciling(false); }
  };

  return (
    <CollapsibleCard title="Facebook publications" icon={Facebook} iconClass="h-4 w-4 text-[#1877F2]">
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        A permanent record of every post successfully published to your Page, keyed by Facebook's own post ID. It survives editing, completing or deleting schedules.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Published by this application</p>
          <p className="text-2xl font-bold">{stats ? stats.lifetime : "…"}</p>
        </div>
        <button onClick={reconcile} disabled={reconciling} className="btn-outline">
          {reconciling ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : <><RefreshCw className="h-4 w-4" /> Reconcile with Facebook</>}
        </button>
        {rec && (() => {
          // Diagnostic only — these two figures are DIFFERENT metrics and are not
          // expected to match (see FACEBOOK_COUNT_ARCHITECTURE.md). The remote
          // number is a Meta summary that also counts posts made outside this app.
          const appCount = typeof rec.applicationCount === "number" ? rec.applicationCount : rec.ours;
          const remote = typeof rec.remoteApiCount === "number" ? rec.remoteApiCount
            : (typeof rec.facebook === "number" ? rec.facebook : null);
          const drift = typeof rec.drift === "number" ? rec.drift
            : (remote != null && typeof appCount === "number" ? remote - appCount : null);
          return (
            <div className="text-sm">
              <span className="font-medium">Published by this application: <b>{appCount}</b></span>
              {remote != null
                ? <span className="ml-3 text-slate-500 dark:text-slate-400">Remote posts found by Meta API: <b>{remote}</b>{drift ? <span className="ml-1 text-amber-600 dark:text-amber-400">(differs by {Math.abs(drift)})</span> : null}</span>
                : <span className="ml-3 text-slate-400">Remote count unavailable</span>}
            </div>
          );
        })()}
      </div>
      {err && <p className="mt-2 text-xs font-medium text-rose-600">{err}</p>}
      {stats?.recent?.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Recent publications</p>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {stats.recent.map((p) => (
              <li key={p.facebookPostId} className="flex flex-wrap items-center gap-x-2">
                <span className="font-mono text-slate-400">{p.facebookPostId}</span>
                <span className="truncate">{p.sourceLabel || p.scheduleTitle || p.kind}</span>
                {p.pageLabel && <span className="rounded bg-slate-100 px-1.5 text-[10px] dark:bg-slate-800">{p.pageLabel}</span>}
                <span className="ml-auto text-slate-400">{new Date(p.postedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CollapsibleCard>
  );
}

// ---- Email Notifications Section ----
// Emails the admin about the auto-poster: failures, completion of a quiz/source,
// and (optionally) every successful post.
function FbNotifySection({ settings, saveSettings }) {
  const [email, setEmail] = useState(settings?.fbNotifyEmail || "");
  const [onPost, setOnPost] = useState(settings?.fbNotifyOnPost === true);
  const [onError, setOnError] = useState(settings?.fbNotifyOnError !== false);
  const [onComplete, setOnComplete] = useState(settings?.fbNotifyOnComplete !== false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setEmail(settings?.fbNotifyEmail || "");
    setOnPost(settings?.fbNotifyOnPost === true);
    setOnError(settings?.fbNotifyOnError !== false);
    setOnComplete(settings?.fbNotifyOnComplete !== false);
  }, [settings?.fbNotifyEmail, settings?.fbNotifyOnPost, settings?.fbNotifyOnError, settings?.fbNotifyOnComplete]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveSettings({ fbNotifyEmail: email, fbNotifyOnPost: onPost, fbNotifyOnError: onError, fbNotifyOnComplete: onComplete });
      setMsg({ ok: true, text: "Settings saved." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Save failed." }); }
    finally { setSaving(false); }
  };

  const rows = [
    ["error", onError, setOnError, "Email me when an auto-post FAILS"],
    ["complete", onComplete, setOnComplete, "Email me when a schedule finishes its whole quiz / source"],
    ["post", onPost, setOnPost, "Email me on EVERY successful post (can be noisy for 100s of posts)"],
  ];

  return (
    <CollapsibleCard title="Email notifications" icon={Mail}>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Get emailed about what the auto-poster is doing. Leave the address blank to use the default admin email.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Notification email (optional)</label>
          <input type="email" className="input" value={email} placeholder="you@example.com — blank = admin email" onChange={(e) => setEmail(e.target.value)} />
        </div>
        {rows.map(([k, val, setter, label]) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-medium">{label}</span>
            <button type="button" onClick={() => setter(!val)}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${val ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${val ? "left-6" : "left-1"}`} />
            </button>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save notification settings</>}
        </button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
    </CollapsibleCard>
  );
}

// Uploads images for a CUSTOM post (reuses the shared /upload → Cloudinary
// endpoint) and shows removable thumbnails. `media` is an array of hosted URLs.
function CustomMediaUploader({ media, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState(0); // 0–100 for the current file
  const [phase, setPhase] = useState(""); // "" | "uploading" | "processing"
  const [batch, setBatch] = useState({ i: 0, n: 0 }); // current file index / total

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true); setErr("");
    try {
      const urls = [];
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        if (!file.type.startsWith("image/")) { setErr("Only image files are allowed."); continue; }
        if (file.size > 10 * 1024 * 1024) { setErr("Each image must be under 10MB."); continue; }
        setBatch({ i: idx + 1, n: files.length });
        setPhase("uploading"); setProgress(0);
        // Direct browser → Cloudinary upload: fast, accurate progress, and it
        // can't hit the server's request timeout ("Cannot reach the server").
        const r = await uploadService.imageDirect(file, (p) => {
          setProgress(p);
          if (p >= 100) setPhase("processing"); // Cloudinary finalising
        });
        if (r?.url) urls.push(r.url);
      }
      if (urls.length) onChange([...(media || []), ...urls].slice(0, 10));
    } catch (e2) { setErr(e2.message || "Upload failed."); }
    finally { setUploading(false); setPhase(""); setProgress(0); setBatch({ i: 0, n: 0 }); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeAt = (i) => onChange((media || []).filter((_, k) => k !== i));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {(media || []).map((url, i) => (
          <div key={i} className="relative">
            <img src={url} alt="" className="h-20 w-20 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
            <button type="button" onClick={() => removeAt(i)} title="Remove"
              className="absolute -right-2 -top-2 rounded-full bg-rose-100 p-1 text-rose-600 shadow hover:bg-rose-200 dark:bg-rose-900/40">
              <X className="h-3.5 w-3.5" />
            </button>
            {i === 0 && <span className="absolute bottom-0 left-0 rounded-tr-lg rounded-bl-lg bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold text-white">1st</span>}
          </div>
        ))}
        <label className={`relative flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed border-slate-300 text-center text-[11px] leading-tight text-slate-500 hover:border-brand-400 dark:border-slate-600 ${uploading ? "pointer-events-none opacity-90" : ""}`}>
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              <span className="font-semibold text-brand-600">
                {phase === "processing" ? "Processing…" : `${progress}%`}
              </span>
              {batch.n > 1 && <span className="text-[9px] text-slate-400">{batch.i} of {batch.n}</span>}
              {/* progress bar along the bottom */}
              <span className="absolute inset-x-0 bottom-0 h-1 bg-slate-200 dark:bg-slate-700">
                <span className="block h-full bg-brand-600 transition-all" style={{ width: `${phase === "processing" ? 100 : progress}%` }} />
              </span>
            </>
          ) : (
            <><ImagePlus className="h-5 w-5" /> Add image</>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} disabled={uploading} />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        The <b>first</b> image is attached to the post. Instagram needs at least one image; Facebook can post text-only.
      </p>
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

// Build a Reel from a still IMAGE + an AUDIO track. Both are uploaded to
// Cloudinary (image + audio), then the server mixes them into a vertical MP4
// (image shown for the full audio length, audio as the soundtrack). On success
// it hands the composed video URL to the parent via onCreated(url), which flows
// into the schedule's customVideo — so it posts as a real Reel to FB/Instagram.
function ImageAudioReelBuilder({ onCreated }) {
  const imgRef = useRef(null);
  const audRef = useRef(null);
  const [image, setImage] = useState("");
  const [audio, setAudio] = useState("");
  const [imgUploading, setImgUploading] = useState(false);
  const [audUploading, setAudUploading] = useState(false);
  const [imgPct, setImgPct] = useState(0);
  const [audPct, setAudPct] = useState(0);
  const [building, setBuilding] = useState(false);
  const [err, setErr] = useState("");

  const pickImage = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setErr("");
    if (!file.type.startsWith("image/")) { setErr("Choose an image file for the Reel picture."); return; }
    if (file.size > 10 * 1024 * 1024) { setErr("The image must be under 10MB."); return; }
    setImgUploading(true); setImgPct(0);
    try {
      const r = await uploadService.imageDirect(file, setImgPct);
      if (r?.url) setImage(r.url);
    } catch (e2) { setErr(e2.message || "Image upload failed."); }
    finally { setImgUploading(false); setImgPct(0); if (imgRef.current) imgRef.current.value = ""; }
  };

  const pickAudio = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setErr("");
    if (!file.type.startsWith("audio/")) { setErr("Choose an audio file (MP3, M4A, WAV…)."); return; }
    if (file.size > 30 * 1024 * 1024) { setErr("The audio must be under 30MB."); return; }
    setAudUploading(true); setAudPct(0);
    try {
      const r = await uploadService.audioDirect(file, setAudPct);
      if (r?.url) setAudio(r.url);
    } catch (e2) { setErr(e2.message || "Audio upload failed."); }
    finally { setAudUploading(false); setAudPct(0); if (audRef.current) audRef.current.value = ""; }
  };

  const build = async () => {
    if (!image || !audio) { setErr("Add both an image and an audio track first."); return; }
    setBuilding(true); setErr("");
    try {
      const r = await facebookService.composeReel({ imageUrl: image, audioUrl: audio });
      if (r?.url) onCreated(r.url);
      else setErr("The Reel was built but no video URL came back. Try again.");
    } catch (e2) {
      setErr(e2.message || "Could not build the Reel. Check the files and try again.");
    } finally { setBuilding(false); }
  };

  const busy = imgUploading || audUploading || building;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <Wand2 className="h-4 w-4 text-brand-500" /> …or build a Reel from an image + audio
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {/* Image picker */}
        <label className={`relative flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed border-slate-300 text-center text-[10px] leading-tight text-slate-500 hover:border-brand-400 dark:border-slate-600 ${busy ? "pointer-events-none opacity-90" : ""}`}>
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : imgUploading ? (
            <><Loader2 className="h-4 w-4 animate-spin text-brand-600" /><span className="font-semibold text-brand-600">{imgPct}%</span></>
          ) : (
            <><ImagePlus className="h-4 w-4" /> Image</>
          )}
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={pickImage} disabled={busy} />
        </label>
        {/* Audio picker */}
        <label className={`relative flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-center text-[10px] leading-tight text-slate-500 hover:border-brand-400 dark:border-slate-600 ${busy ? "pointer-events-none opacity-90" : ""}`}>
          {audio ? (
            <><Music className="h-4 w-4 text-emerald-600" /><span className="font-semibold text-emerald-600">Audio added</span></>
          ) : audUploading ? (
            <><Loader2 className="h-4 w-4 animate-spin text-brand-600" /><span className="font-semibold text-brand-600">{audPct}%</span></>
          ) : (
            <><Music className="h-4 w-4" /> Audio</>
          )}
          <input ref={audRef} type="file" accept="audio/*" className="hidden" onChange={pickAudio} disabled={busy} />
        </label>
        <button type="button" onClick={build} disabled={busy || !image || !audio}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
          {building ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Building…</> : <><Film className="h-3.5 w-3.5" /> Create Reel</>}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">The image fills a 9:16 frame for the length of the audio. Building can take up to a minute.</p>
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

// A rotating LIBRARY of music tracks for question/flashcard Reels. The admin
// adds several tracks (upload a file or paste a public URL) with the + button;
// they persist on the schedule and are shown as a removable list. At post time
// the schedule cycles through them — one track per Reel, wrapping around — so a
// set of songs is reused without re-adding them. `value` is a string[] of URLs.
function ReelAudioLibrary({ value, onChange }) {
  const audRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const list = Array.isArray(value) ? value : [];

  const add = (u) => {
    const clean = String(u || "").trim();
    if (!clean) return;
    if (list.includes(clean)) { setErr("That track is already in the list."); return; }
    onChange([...list, clean].slice(0, 20));
  };
  const removeAt = (i) => onChange(list.filter((_, k) => k !== i));

  const pick = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setErr("");
    if (!file.type.startsWith("audio/")) { setErr("Choose an audio file (MP3, M4A, WAV…)."); return; }
    if (file.size > 30 * 1024 * 1024) { setErr("Each track must be under 30MB."); return; }
    setUploading(true); setPct(0);
    try {
      const r = await uploadService.audioDirect(file, setPct);
      if (r?.url) add(r.url);
    } catch (e2) { setErr(e2.message || "Audio upload failed."); }
    finally { setUploading(false); setPct(0); if (audRef.current) audRef.current.value = ""; }
  };

  const addPasted = () => {
    const clean = url.trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) { setErr("The URL must start with http:// or https://."); return; }
    add(clean); setUrl(""); setErr("");
  };

  return (
    <div>
      {/* Existing tracks */}
      {list.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {list.map((u, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs dark:bg-slate-800">
              <Music className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300" title={u}>{i + 1}. {u.split("/").pop() || u}</span>
              <audio src={u} controls preload="none" className="h-7 w-40 max-w-[45%]" />
              <button type="button" onClick={() => removeAt(i)} title="Remove"
                className="flex-shrink-0 rounded-full p-1 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Add controls: upload (+) OR paste a URL */}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 ${uploading ? "pointer-events-none opacity-70" : ""}`}>
          {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {pct}%</> : <><Plus className="h-3.5 w-3.5" /> Add music</>}
          <input ref={audRef} type="file" accept="audio/*" className="hidden" onChange={pick} disabled={uploading} />
        </label>
        <span className="text-xs text-slate-400">or</span>
        <input className="input h-9 flex-1 min-w-[160px]" type="url" inputMode="url" value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPasted(); } }}
          placeholder="https://…/music.mp3" disabled={uploading} />
        <button type="button" onClick={addPasted} disabled={uploading || !url.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300">
          <Plus className="h-3.5 w-3.5" /> Add link
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

// Reel video for a custom post. An admin can either UPLOAD a video file (direct
// browser → Cloudinary, with progress), paste a public MP4 URL, or build one
// from an image + audio track. All resolve to a single `value` (the public
// URL) stored on the schedule as `customVideo`.
function CustomVideoUploader({ value, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(""); // "" | "uploading" | "processing"
  const [err, setErr] = useState("");

  const MAX_BYTES = 100 * 1024 * 1024; // keep in step with the backend multer limit

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    if (!file.type.startsWith("video/")) { setErr("Please choose a video file (MP4, MOV or WebM)."); return; }
    if (file.size > MAX_BYTES) { setErr("The video must be under 100MB. Trim it or lower the resolution."); return; }
    setUploading(true); setPhase("uploading"); setProgress(0);
    try {
      const r = await uploadService.videoDirect(file, (p) => {
        setProgress(p);
        if (p >= 100) setPhase("processing"); // Cloudinary finalising / transcoding
      });
      if (r?.url) onChange(r.url);
      else setErr("Upload finished but no URL was returned. Try again.");
    } catch (e2) {
      setErr(e2.message || "Upload failed.");
    } finally {
      setUploading(false); setPhase(""); setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {value ? (
        <div className="flex items-start gap-3">
          <video src={value} controls className="h-32 w-auto max-w-[180px] rounded-lg border border-slate-200 bg-black object-contain dark:border-slate-700" />
          <button type="button" onClick={() => onChange("")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-200 dark:bg-rose-900/40">
            <Trash2 className="h-3.5 w-3.5" /> Remove video
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`relative flex h-24 w-40 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed border-slate-300 text-center text-[11px] leading-tight text-slate-500 hover:border-brand-400 dark:border-slate-600 ${uploading ? "pointer-events-none opacity-90" : ""}`}>
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                  <span className="font-semibold text-brand-600">{phase === "processing" ? "Processing…" : `${progress}%`}</span>
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-slate-200 dark:bg-slate-700">
                    <span className="block h-full bg-brand-600 transition-all" style={{ width: `${phase === "processing" ? 100 : progress}%` }} />
                  </span>
                </>
              ) : (
                <><Film className="h-5 w-5" /> Upload video</>
              )}
              <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={pick} disabled={uploading} />
            </label>
            <span className="text-xs text-slate-400">or paste a public URL:</span>
          </div>
          <input className="input mt-2" type="url" inputMode="url" value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…/reel.mp4" disabled={uploading} />
          <ImageAudioReelBuilder onCreated={onChange} />
        </>
      )}
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

// Format a Date/ms into the value a <input type="datetime-local"> expects
// ("YYYY-MM-DDTHH:MM", in the browser's local time).
const pad2 = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}T${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
};

// Upload a custom flashcard TEMPLATE image. Flashcard auto-posts overlay each
// quiz question's content onto it (question, options, answer, explanation, key
// points, quick recall). Empty = the built-in flashcard design is used.
function FlashcardTemplateSection({ settings, saveSettings }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [url, setUrl] = useState(settings?.fbFlashcardTemplateUrl || "");
  const [enabled, setEnabled] = useState(settings?.fbFlashcardTemplateEnabled !== false);

  useEffect(() => {
    setUrl(settings?.fbFlashcardTemplateUrl || "");
    setEnabled(settings?.fbFlashcardTemplateEnabled !== false);
  }, [settings?.fbFlashcardTemplateUrl, settings?.fbFlashcardTemplateEnabled]);

  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg({ ok: false, text: "Please select an image file." }); return; }
    setUploading(true); setMsg(null);
    try {
      // Direct-to-Cloudinary upload: faster + avoids the free-tier relay
      // "Cannot reach the server" cold-start failure, and shows progress.
      const r = await uploadService.imageDirect(file);
      const u = r?.url || "";
      setUrl(u);
      await saveSettings({ fbFlashcardTemplateUrl: u, fbFlashcardTemplateEnabled: true });
      setEnabled(true);
      setMsg({ ok: true, text: "Template uploaded & saved." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Upload failed." }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const remove = async () => {
    if (!window.confirm("Remove the flashcard template? Flashcards will use the built-in design.")) return;
    setUrl(""); try { await saveSettings({ fbFlashcardTemplateUrl: "" }); setMsg({ ok: true, text: "Template removed." }); } catch (err) { setMsg({ ok: false, text: err.message || "Failed." }); }
  };
  const toggle = async () => { const next = !enabled; setEnabled(next); try { await saveSettings({ fbFlashcardTemplateEnabled: next }); } catch { /* ignore */ } };

  return (
    <CollapsibleCard title="Flashcard template image" icon={ImagePlus}>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Upload your <b>flashcard template</b> — the branded frame (header + footer) with an <b>empty middle</b>. Flashcard auto-posts render each
        quiz question's content (question, options, correct answer, explanation, key points &amp; quick recall) into the empty area and
        <b>auto-fit</b> it — so it works for <b>every question type</b>. Leave empty to use the built-in design. Use a <b>1536×1024 two-panel</b> image.
      </p>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <div className="flex flex-col items-center gap-2">
          {url ? (
            <div className="relative">
              <img src={url} alt="template" className="h-28 w-44 rounded-lg border border-slate-200 object-contain" />
              <button type="button" onClick={remove} title="Remove" className="absolute -right-2 -top-2 rounded-full bg-rose-100 p-1.5 text-rose-600 shadow hover:bg-rose-200 dark:bg-rose-900/40"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="flex h-28 w-44 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-300 dark:border-slate-600"><ImagePlus className="h-8 w-8" /></div>
          )}
          <label className={`btn-outline cursor-pointer text-sm ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> Upload template</>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
          </label>
        </div>
        <div className="flex-1 space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-medium">Use my template for flashcard posts</span>
            <button type="button" onClick={toggle} className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${enabled ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${enabled ? "left-6" : "left-1"}`} />
            </button>
          </label>
          <p className="text-xs text-slate-400">Content renders into the two empty middle regions and auto-scales to fit any length or question type. Regions are tuned to a <b>1536×1024</b> template with a header at the top and footer at the bottom — tell me if content sits off and I'll adjust the regions.</p>
        </div>
      </div>
      {msg && <p className={`mt-3 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
    </CollapsibleCard>
  );
}

// SHARED Reel music library — set the tracks ONCE here (upload files or paste
// links). Every question/flashcard schedule set to post as a Reel rotates
// through these, so music is never re-added per schedule. Persists to settings
// immediately on each add/remove.
function ReelMusicLibrarySection({ settings, saveSettings }) {
  const [msg, setMsg] = useState(null);
  // Drive straight off settings — saveSettings updates the settings context, so
  // the list re-renders after each save (no local mirror / syncing effect).
  const tracks = settings?.fbReelAudios || [];

  const onChange = async (next) => {
    setMsg(null);
    try { await saveSettings({ fbReelAudios: next }); setMsg({ ok: true, text: "Saved." }); }
    catch (e) { setMsg({ ok: false, text: e.message || "Failed to save." }); }
  };

  return (
    <CollapsibleCard title="Reel music library" icon={Music}>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Add your music <b>once here</b>. Any question or flashcard schedule set to post as a <b>Reel</b> rotates through
        these tracks — one per Reel, then starts over — so you never upload or paste them again. Upload files or paste public links.
      </p>
      <div className="mt-4"><ReelAudioLibrary value={tracks} onChange={onChange} /></div>
      {msg && <p className={`mt-3 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
    </CollapsibleCard>
  );
}

// Auto first-comment — a GLOBAL list of comments the admin writes once (with a
// ＋ add button). After every published Facebook post & Instagram media, the
// poster adds a saved comment as the FIRST comment (a pinned link / CTA / extra
// hashtags). The list is used per the chosen mode (rotate / all / random) and
// per-network toggles. Saved to site settings.
function AutoCommentSection({ settings, saveSettings }) {
  const [enabled, setEnabled] = useState(settings?.fbAutoCommentEnabled === true);
  // Seed the list from fbAutoComments, falling back to the legacy single comment.
  const seedList = (s) => {
    const list = Array.isArray(s?.fbAutoComments) ? s.fbAutoComments : [];
    if (list.length) return list;
    return String(s?.fbAutoComment || "").trim() ? [String(s.fbAutoComment).trim()] : [];
  };
  const [comments, setComments] = useState(seedList(settings));
  const [mode, setMode] = useState(settings?.fbAutoCommentMode || "rotate");
  const [toFb, setToFb] = useState(settings?.fbAutoCommentToFacebook !== false);
  const [toIg, setToIg] = useState(settings?.fbAutoCommentToInstagram === true);
  // @-mention list appended to every auto-comment. Kept as a plain string in the
  // input (space/comma/newline separated) so the admin can paste multiple at once.
  const seedMentions = (s) => {
    const list = Array.isArray(s?.fbAutoCommentMentions) ? s.fbAutoCommentMentions : [];
    return list.join(" ");
  };
  const [mentions, setMentions] = useState(seedMentions(settings));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setEnabled(settings?.fbAutoCommentEnabled === true);
    setComments(seedList(settings));
    setMode(settings?.fbAutoCommentMode || "rotate");
    setToFb(settings?.fbAutoCommentToFacebook !== false);
    setToIg(settings?.fbAutoCommentToInstagram === true);
    setMentions(seedMentions(settings));
  }, [settings?.fbAutoCommentEnabled, settings?.fbAutoComment, settings?.fbAutoComments, settings?.fbAutoCommentMode, settings?.fbAutoCommentToFacebook, settings?.fbAutoCommentToInstagram, settings?.fbAutoCommentMentions]);

  const setComment = (i, v) => setComments((cs) => cs.map((c, idx) => (idx === i ? v : c)));
  const addComment = () => setComments((cs) => [...cs, ""]);
  const removeComment = (i) => setComments((cs) => cs.filter((_, idx) => idx !== i));

  // Split the mentions textarea on any whitespace/comma. Each token is a single
  // handle. Blank tokens are dropped by the backend sanitizer.
  const mentionList = () => String(mentions || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const fbAutoComments = comments.map((c) => String(c || "").trim()).filter(Boolean);
      await saveSettings({
        fbAutoCommentEnabled: enabled,
        fbAutoComments,
        fbAutoCommentMode: mode,
        fbAutoCommentToFacebook: toFb,
        fbAutoCommentToInstagram: toIg,
        fbAutoCommentMentions: mentionList(),
        // Keep the legacy single field in sync (first comment) for back-compat.
        fbAutoComment: fbAutoComments[0] || "",
      });
      setMsg({ ok: true, text: "Settings saved." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Save failed." }); }
    finally { setSaving(false); }
  };

  const toggle = (val, on) => (
    <button type="button" onClick={on}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${val ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${val ? "left-6" : "left-1"}`} />
    </button>
  );

  return (
    <CollapsibleCard title="Auto first comment" icon={MessageCircle}>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Write comments once here — after every scheduled post &amp; reel publishes, one is added automatically as the <b>first comment</b> (a pinned link / CTA / extra hashtags). <b>Stories don't support comments</b>, so they're skipped.
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <span className="text-sm font-medium">Add a first comment to every post</span>
          {toggle(enabled, () => setEnabled((v) => !v))}
        </label>

        {/* The saved comment list */}
        <div className="space-y-2">
          {comments.length === 0 && <p className="text-sm text-slate-400">No comments yet — add one below.</p>}
          {comments.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea className="input min-h-[42px] flex-1 resize-y" rows={1} maxLength={2000} value={c}
                onChange={(e) => setComment(i, e.target.value)}
                placeholder="e.g. 👉 Follow for daily quizzes! Practice at mystudyguide.in  #JKSSB #GK" />
              <button type="button" onClick={() => removeComment(i)} title="Remove" className="mt-1 rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={addComment} className="btn-outline"><Plus className="h-4 w-4" /> Add comment</button>
        </div>

        {/* How a comment is chosen per post */}
        <div>
          <label className="mb-1 block text-sm font-medium">How to use them per post</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="rotate">Rotate — one comment per post, in order</option>
            <option value="all">All — post every comment on each post</option>
            <option value="random">Random — a random comment each post</option>
          </select>
        </div>

        {/* Which networks get the comment */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="flex items-center gap-2 text-sm font-medium"><Facebook className="h-4 w-4 text-[#1877F2]" /> Comment on Facebook</span>
            {toggle(toFb, () => setToFb((v) => !v))}
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="flex items-center gap-2 text-sm font-medium"><Instagram className="h-4 w-4 text-[#E1306C]" /> Comment on Instagram</span>
            {toggle(toIg, () => setToIg((v) => !v))}
          </label>
        </div>

        {/* Optional @-mentions appended to every auto-comment */}
        <div>
          <label className="mb-1 block text-sm font-medium">Mentions (optional)</label>
          <textarea
            className="input min-h-[46px] resize-y font-mono text-sm"
            rows={2}
            maxLength={2000}
            value={mentions}
            onChange={(e) => setMentions(e.target.value)}
            placeholder="e.g. @mystudyguide_ @jkssb_updates @[123456789]"
          />
          <p className="mt-1 text-xs text-slate-400">
            Space, comma or newline separated. Appended to every auto-comment on a new line.
            Instagram makes <b>@handle</b> clickable automatically. Facebook only links Page tags in
            the <b>@[page-id]</b> form (get the numeric Page ID from the target Page's About tab) —
            plain handles stay as visible text.
          </p>
          {mentionList().length > 0 && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              {mentionList().length} mention{mentionList().length === 1 ? "" : "s"} will be added per comment.
            </p>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Note: <b>@everyone / @followers / @all</b> are posted as plain text — Facebook &amp; Instagram don't let apps tag all
          followers, so use them as a caption, not a notification. Posting and commenting use separate Meta permissions.
          Facebook comments require <b>pages_manage_engagement</b> (plus any read permission Meta requests), and Instagram
          comments require <b>instagram_manage_comments</b>. Approve them in Meta App Review/Advanced Access, then generate
          and save a <b>new token</b>; an existing token does not gain newly approved permissions automatically.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save comment settings</>}
        </button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
    </CollapsibleCard>
  );
}

const emptyForm = {
  kind: "question",
  mode: "recurring", runAt: "", // one-off (mode "once") uses runAt; recurring uses times/days
  title: "", source: { subject: null, session: null, quiz: null, label: "" },
  customText: "", customMedia: [], customVideo: "",
  times: ["09:00"], days: [], timezone: "Asia/Kolkata",
  includeOptions: true, includeAnswer: false, includeLink: false, hashtags: "", order: "random",
  stopWhenExhausted: true,
  toFacebook: true, toInstagram: false, asImage: false,
  asReel: false, customAudios: [], reelDuration: 30, // Reel mode for question/flashcard: rotate through these music tracks, trimmed to reelDuration seconds
  asStory: false, // also share the image as a 24h Story (Facebook + Instagram)
};

export default function AdminFacebook() {
  const { settings, save: saveSettings } = useSettings();

  // ---- Connection config ----
  const [fb, setFb] = useState({ fbEnabled: false, fbPageId: "", fbGraphVersion: "v21.0", igEnabled: false, igUserId: "", fbDefaultHashtags: "", fbAutoHashtags: true });
  const [targets, setTargets] = useState([]); // extra cross-post Pages: [{label, pageId, token, tokenSet}]
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
      fbDefaultHashtags: settings?.fbDefaultHashtags || "", fbAutoHashtags: settings?.fbAutoHashtags !== false,
    });
    setTargets((settings?.fbExtraTargets || []).map((t) => ({ label: t.label || "", pageId: t.pageId || "", token: "", tokenSet: !!t.tokenSet })));
  }, [settings?.fbEnabled, settings?.fbPageId, settings?.fbGraphVersion, settings?.igEnabled, settings?.igUserId, settings?.fbDefaultHashtags, settings?.fbAutoHashtags, settings?.fbExtraTargets]);

  const setTarget = (i, k, v) => setTargets((ts) => ts.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  const addTarget = () => setTargets((ts) => [...ts, { label: "", pageId: "", token: "", tokenSet: false }]);
  const removeTarget = (i) => setTargets((ts) => ts.filter((_, idx) => idx !== i));

  const saveFb = async () => {
    setFbSaving(true); setFbMsg(null);
    try {
      const fbExtraTargets = targets
        .filter((t) => String(t.pageId).trim())
        .map((t) => ({ label: String(t.label).trim(), pageId: String(t.pageId).trim(), token: String(t.token).trim() }));
      await saveSettings({ ...fb, fbExtraTargets, ...(fbToken.trim() ? { fbPageAccessToken: fbToken.trim() } : {}) });
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
  // 10 schedules per page (the list uses the Prev/Next pager below).
  const PAGE_SIZE = 10;
  const [schedules, setSchedules] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // null = closed; else the schedule being created/edited
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null); // per-row action in progress
  const [rowMsg, setRowMsg] = useState({}); // id → text
  const [fixingLabels, setFixingLabels] = useState(false); // one-off breadcrumb backfill in progress
  const [fixMsg, setFixMsg] = useState(""); // result of the backfill
  const [fromTime, setFromTime] = useState(""); // time-of-day filter start (HH:MM)
  const [toTime, setToTime] = useState("");     // time-of-day filter end (HH:MM)
  const [sortBy, setSortBy] = useState("recent"); // "recent" | "time"
  const [postsInRange, setPostsInRange] = useState(null); // # posts firing in the chosen window
  const rangeActive = !!(fromTime && toTime);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = () => {
    setLoading(true); setError("");
    // Only send from/to when BOTH are set (a valid window).
    const range = fromTime && toTime ? { from: fromTime, to: toTime } : {};
    facebookService.schedules({ page, limit: PAGE_SIZE, q: search, sort: sortBy, ...range })
      .then((r) => {
        // Accept either the paginated { items, total } shape or a bare array.
        const items = Array.isArray(r) ? r : (r?.items || []);
        const tot = Array.isArray(r) ? r.length : (r?.total || 0);
        // If a delete emptied the last page, step back a page.
        if (items.length === 0 && page > 1 && tot > 0) { setPage((p) => Math.max(1, p - 1)); return; }
        setSchedules(items); setTotal(tot);
        setPostsInRange(Array.isArray(r) ? null : (typeof r?.postsInRange === "number" ? r.postsInRange : null));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  // Reload on page / search / filter / sort change; debounce while typing a search.
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, fromTime, toTime, sortBy]);

  // One-off maintenance: re-derive the Stream › Subject › Topic breadcrumb for
  // existing "My Quiz" schedules whose stored label was missing the topic.
  const fixLabels = async () => {
    setFixingLabels(true); setFixMsg("");
    try {
      const r = await facebookService.backfillLabels();
      setFixMsg(r?.updated ? `Fixed ${r.updated} breadcrumb${r.updated === 1 ? "" : "s"}.` : "All breadcrumbs are already up to date.");
      load();
    } catch (e) { setFixMsg(e.message || "Could not fix breadcrumbs."); }
    finally { setFixingLabels(false); }
  };

  const openNew = () => setForm({ ...emptyForm, times: ["09:00"] });
  const openEdit = (s) => setForm({
    _id: s._id, kind: ["custom", "flashcard"].includes(s.kind) ? s.kind : "question",
    mode: s.mode === "once" ? "once" : "recurring",
    runAt: s.runAt ? toLocalInput(s.runAt) : "",
    title: s.title || "", source: s.source || emptyForm.source,
    customText: s.customText || "", customMedia: Array.isArray(s.customMedia) ? s.customMedia : [], customVideo: s.customVideo || "",
    times: s.times?.length ? s.times : ["09:00"], days: s.days || [], timezone: s.timezone || "Asia/Kolkata",
    includeOptions: s.includeOptions !== false, includeAnswer: !!s.includeAnswer, includeLink: !!s.includeLink,
    hashtags: s.hashtags || "", order: s.order || "random",
    stopWhenExhausted: s.stopWhenExhausted !== false,
    toFacebook: s.toFacebook !== false, toInstagram: !!s.toInstagram, asImage: !!s.asImage,
    asReel: !!s.asReel,
    reelDuration: s.reelDuration || 30,
    asStory: !!s.asStory,
    // Load the rotating music library (fall back to the legacy single track).
    customAudios: Array.isArray(s.customAudios) && s.customAudios.length
      ? s.customAudios
      : (s.customAudio ? [s.customAudio] : []),
  });

  const setTime = (i, v) => setForm((f) => ({ ...f, times: f.times.map((t, k) => (k === i ? v : t)) }));
  const addTime = () => setForm((f) => ({ ...f, times: [...f.times, "18:00"] }));
  const removeTime = (i) => setForm((f) => ({ ...f, times: f.times.filter((_, k) => k !== i) }));
  const toggleDay = (v) => setForm((f) => ({ ...f, days: f.days.includes(v) ? f.days.filter((d) => d !== v) : [...f.days, v] }));

  const saveForm = async () => {
    const isCustom = form.kind === "custom";
    if (isCustom) {
      const hasVideo = !!String(form.customVideo || "").trim();
      if (!String(form.customText || "").trim() && !(form.customMedia || []).length && !hasVideo) {
        setError("Write some text, add an image, or paste a video URL (Reel) for the custom post."); return;
      }
      if (hasVideo && !/^https?:\/\//i.test(String(form.customVideo).trim())) {
        setError("The video URL must start with http:// or https://."); return;
      }
      // Instagram needs media (an image OR a video for a Reel).
      if (form.toInstagram && !(form.customMedia || []).length && !hasVideo) {
        setError("Instagram needs an image or a video — add one, or turn off Instagram."); return;
      }
    } else if (!form.source.subject && !form.source.session && !form.source.quiz && !form.source.testSeries) {
      setError("Pick a source (subject, session or quiz)."); return;
    }
    // Reel mode (question/flashcard) needs music. It comes from the SHARED Reel
    // music library (added once); older schedules may still carry their own tracks.
    if (!isCustom && form.asReel && !(settings?.fbReelAudios || []).length && !(form.customAudios || []).length) {
      setError("Add tracks to the Reel music library first (you only do this once) — or turn Reel off."); return;
    }
    const isOnce = form.mode === "once";
    if (isOnce) {
      if (!form.runAt) { setError("Pick a date & time for the one-time post."); return; }
    } else if (!form.times.filter(Boolean).length) { setError("Add at least one time."); return; }
    if (!form.toFacebook && !form.toInstagram) { setError("Choose at least one destination (Facebook and/or Instagram)."); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        times: form.times.filter(Boolean),
        mode: isOnce ? "once" : "recurring",
        runAt: isOnce && form.runAt ? new Date(form.runAt).toISOString() : null,
      };
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
        <p className="text-slate-500 dark:text-slate-400">Connect your Facebook Page and schedule quiz questions — or your own custom text &amp; media posts — to publish automatically at set times. Independent of the Notice Board.</p>
      </div>

      {/* Connection */}
      <CollapsibleCard title="Connection" icon={Power} iconClass="h-4 w-4 text-[#1877F2]" defaultOpen>
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
      </CollapsibleCard>

      {/* Hashtags */}
      <CollapsibleCard title="Hashtags" icon={ListChecks} iconClass="h-4 w-4 text-[#1877F2]">
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Added to every question post. Auto tags are also built from each question's subject &amp; topic.</p>
        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="text-sm font-medium">Auto-generate tags from the question's subject / topic</span>
            <button type="button" onClick={() => setFb((f) => ({ ...f, fbAutoHashtags: !f.fbAutoHashtags }))}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${fb.fbAutoHashtags ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${fb.fbAutoHashtags ? "left-6" : "left-1"}`} />
            </button>
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium">Default hashtags (applied to all posts)</label>
            <textarea className="input min-h-[46px] resize-y" rows={2} value={fb.fbDefaultHashtags} onChange={(e) => setFb((f) => ({ ...f, fbDefaultHashtags: e.target.value }))} placeholder="#JKSSB #CurrentAffairs #StudyGuide" />
            <p className="mt-1 text-xs text-slate-400">Space or comma separated. The “#” is optional — it's added automatically.</p>
          </div>
        </div>
        <div className="mt-4">
          <button type="button" onClick={saveFb} disabled={fbSaving} className="btn-primary">{fbSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save hashtags</>}</button>
        </div>
      </CollapsibleCard>

      {/* Cross-post to more Pages */}
      <CollapsibleCard title="Cross-post to more Pages" icon={Send} iconClass="h-4 w-4 text-[#1877F2]">
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Every post also goes to these Pages. Each needs its OWN Page access token (a Page ID + token — a plain link can't authorise posting).
          <b> Facebook Groups can't be posted to via the API</b>, so only Pages you manage work here.
        </p>
        <div className="mt-4 space-y-2">
          {targets.length === 0 && <p className="text-sm text-slate-400">No extra Pages yet.</p>}
          {targets.map((t, i) => (
            <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
              <input className="input" value={t.label} onChange={(e) => setTarget(i, "label", e.target.value)} placeholder="Label (e.g. Backup Page)" />
              <input className="input" value={t.pageId} onChange={(e) => setTarget(i, "pageId", e.target.value)} placeholder="Page ID" />
              <input type="password" className="input" value={t.token} onChange={(e) => setTarget(i, "token", e.target.value)} autoComplete="off" placeholder={t.tokenSet ? "•••••••• (saved — type to replace)" : "Page access token"} />
              <button type="button" onClick={() => removeTarget(i)} title="Remove" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={addTarget} className="btn-outline"><Plus className="h-4 w-4" /> Add Page</button>
          <button type="button" onClick={saveFb} disabled={fbSaving} className="btn-primary">{fbSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save Pages</>}</button>
        </div>
      </CollapsibleCard>

      {/* Instagram */}
      <CollapsibleCard title="Instagram cross-posting" icon={Instagram} iconClass="h-5 w-5 text-[#E1306C]">
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
      </CollapsibleCard>

      {/* Selfie / logo Watermark */}
      <SelfieWatermarkSection settings={settings} saveSettings={saveSettings} />

      {/* Center text Watermark */}
      <TextWatermarkSection settings={settings} saveSettings={saveSettings} />

      {/* Flashcard template image (for the Flashcard post type) */}
      <FlashcardTemplateSection settings={settings} saveSettings={saveSettings} />

      {/* Shared Reel music library (set once, reused by every Reel schedule) */}
      <ReelMusicLibrarySection settings={settings} saveSettings={saveSettings} />

      {/* Auto first comment (applied to every FB + IG post) */}
      <AutoCommentSection settings={settings} saveSettings={saveSettings} />

      {/* Email notifications */}
      <FbNotifySection settings={settings} saveSettings={saveSettings} />

      {/* Permanent Facebook publication ledger + reconciliation */}
      <FbLedgerStats />

      {/* Schedules */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold">
            <Clock className="h-4 w-4 text-brand-600" /> Scheduled posts
            {total > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{total}</span>}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {!form && total > 0 && (
              <button onClick={fixLabels} disabled={fixingLabels} className="btn-outline !py-1.5 !text-xs" title="Re-derive the Stream › Subject › Topic breadcrumb for existing My Quiz schedules that are missing the topic">
                {fixingLabels ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Fixing…</> : <><Wand2 className="h-3.5 w-3.5" /> Fix breadcrumbs</>}
              </button>
            )}
            {!form && <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> New schedule</button>}
          </div>
        </div>
        {fixMsg && <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">{fixMsg}</p>}

        {/* Search (shown once there are schedules or an active search) */}
        {!form && (total > 0 || search) && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search schedules by title or source…" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {search && <button onClick={() => { setSearch(""); setPage(1); }} title="Clear" className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>}
          </div>
        )}

        {/* Time-of-day filter + sort: see how many posts fire in a window
            (e.g. 08:00–09:00), and order the list by time of day. */}
        {!form && (total > 0 || rangeActive) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400"><Clock className="h-4 w-4" /> Time</span>
            <div className="flex items-center gap-1.5">
              <input type="time" value={fromTime} onChange={(e) => { setFromTime(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 outline-none dark:border-slate-700" aria-label="From time" />
              <span className="text-slate-400">to</span>
              <input type="time" value={toTime} onChange={(e) => { setToTime(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 outline-none dark:border-slate-700" aria-label="To time" />
              {rangeActive && (
                <button onClick={() => { setFromTime(""); setToTime(""); setPage(1); }} title="Clear time filter" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
              )}
            </div>
            <label className="ml-auto inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              Sort
              <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 outline-none dark:border-slate-700">
                <option value="recent">Newest first</option>
                <option value="time">Time of day</option>
              </select>
            </label>
          </div>
        )}

        {/* Summary of how many posts fall in the chosen window. */}
        {!form && rangeActive && (
          <p className="mt-2 text-sm font-medium text-brand-700 dark:text-brand-300">
            {postsInRange != null
              ? <><b>{postsInRange}</b> post{postsInRange === 1 ? "" : "s"} across <b>{total}</b> schedule{total === 1 ? "" : "s"} scheduled between <b>{fromTime}</b> and <b>{toTime}</b>.</>
              : <>Showing schedules between <b>{fromTime}</b> and <b>{toTime}</b>.</>}
          </p>
        )}

        {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

        {/* Create / edit form */}
        {form && (
          <div className="mt-4 rounded-xl border border-brand-200 p-4 dark:border-brand-900/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">{form._id ? "Edit schedule" : "New schedule"}</h3>
              <button onClick={() => { setForm(null); setError(""); }}><X className="h-5 w-5" /></button>
            </div>

            {/* Post type: draw a quiz question, or a fixed custom text/media post. */}
            <p className="mb-1 block text-sm font-semibold">Post type</p>
            <div className="mb-3 flex gap-2">
              <button type="button" onClick={() => setForm((f) => ({ ...f, kind: "question", mode: "recurring" }))}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${form.kind === "question" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                <ListChecks className="h-3.5 w-3.5" /> Quiz question
              </button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, kind: "flashcard", mode: "recurring" }))}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${form.kind === "flashcard" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                <ImagePlus className="h-3.5 w-3.5" /> Flashcard
              </button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, kind: "custom", mode: "once", runAt: f.runAt || toLocalInput(Date.now() + 10 * 60000) }))}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${form.kind === "custom" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                <FileText className="h-3.5 w-3.5" /> Custom (text / media)
              </button>
            </div>

            <label className="mb-1 block text-sm font-medium">Title (optional)</label>
            <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={form.kind === "custom" ? "e.g. Weekly announcement" : form.kind === "flashcard" ? "e.g. Daily Biology flashcard" : "e.g. Daily Accountancy question"} />

            {form.kind === "flashcard" && (
              <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                Posts a combined <b>flashcard image</b> — the question on one side, and the correct answer, explanation, key points &amp; quick recall on the other. Pick a source below to draw questions from.
              </p>
            )}

            {form.kind === "custom" ? (
              <>
                <label className="mb-1 mt-4 block text-sm font-semibold">Post text</label>
                <textarea className="input min-h-[110px]" value={form.customText}
                  onChange={(e) => setForm((f) => ({ ...f, customText: e.target.value }))}
                  maxLength={5000} placeholder="Write your post caption here…" />
                <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-semibold"><ImagePlus className="h-4 w-4 text-slate-400" /> Media (images)</p>
                <CustomMediaUploader media={form.customMedia} onChange={(customMedia) => setForm((f) => ({ ...f, customMedia }))} />

                <label className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-semibold"><Film className="h-4 w-4 text-slate-400" /> Reel video <span className="font-normal text-slate-400">(optional)</span></label>
                <CustomVideoUploader value={form.customVideo} onChange={(customVideo) => setForm((f) => ({ ...f, customVideo }))} />
                <p className="mt-1 text-xs text-slate-400">
                  Upload a <b>vertical MP4</b>, paste a public link, or <b>build a Reel from an image + audio</b>. When set,
                  this custom post is published as a <b>Reel</b> to the selected networks instead of a photo. Best as 9:16, up to ~90s.
                </p>

                <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <span className="text-sm font-medium">Post one time only <span className="font-normal text-slate-400">(don't repeat — publishes once at the time you set)</span></span>
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, mode: f.mode === "once" ? "recurring" : "once", runAt: f.mode === "once" ? f.runAt : (f.runAt || toLocalInput(Date.now() + 10 * 60000)) }))}
                    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${form.mode === "once" ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.mode === "once" ? "left-6" : "left-1"}`} />
                  </button>
                </label>
              </>
            ) : (
              <>
                <p className="mb-1 mt-4 text-sm font-semibold">Source — where questions come from</p>
                {form._id && form.source?.label && <p className="mb-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500 dark:bg-slate-800/60">Current: <b>{form.source.label}</b> — re-pick below to change it.</p>}
                <SourcePicker onPick={(source) => setForm((f) => ({ ...f, source }))} />
                {form.source?.label && <p className="mt-2 text-xs text-emerald-600">Selected: {form.source.label}</p>}
              </>
            )}

            {form.mode === "once" ? (
              <>
                <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-slate-400" /> Post date &amp; time</p>
                <input type="datetime-local" className="input" value={form.runAt} onChange={(e) => setForm((f) => ({ ...f, runAt: e.target.value }))} />
                <p className="mt-1 text-xs text-slate-400">Publishes once at this time, then the schedule pauses itself. Uses your device's local time.</p>
              </>
            ) : (
              <>
                <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-slate-400" /> {form.kind === "custom" ? "Times (posts at each)" : "Times (posts one question at each)"}</p>
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
              </>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Timezone</label>
                <input className="input" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="Asia/Kolkata" />
              </div>
              {form.kind !== "custom" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Order</label>
                  <select className="input" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}>
                    <option value="random">Random (no repeats until all used)</option>
                    <option value="sequential">Sequential (oldest first)</option>
                  </select>
                </div>
              )}
            </div>

            {form.kind !== "custom" && (
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={form.stopWhenExhausted !== false} onChange={(e) => setForm((f) => ({ ...f, stopWhenExhausted: e.target.checked }))} />
                <span>Stop when every question has been posted <span className="text-slate-400">(don't repeat — the schedule pauses itself and, if enabled, emails you when the whole quiz/source is done)</span></span>
              </label>
            )}

            <p className="mb-1 mt-4 text-sm font-semibold">Post to</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#1877F2]" checked={form.toFacebook} onChange={(e) => setForm((f) => ({ ...f, toFacebook: e.target.checked }))} /> Facebook
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#E1306C]" checked={form.toInstagram} onChange={(e) => setForm((f) => ({ ...f, toInstagram: e.target.checked }))} /> Instagram <span className="text-slate-400">(image)</span>
              </label>
              {form.kind === "question" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.asImage} onChange={(e) => setForm((f) => ({ ...f, asImage: e.target.checked }))} /> Post as image on Facebook
                </label>
              )}
            </div>
            {form.toInstagram && (
              <p className="mt-1 text-xs text-slate-400">
                {form.kind === "custom"
                  ? "Instagram needs an image — the first uploaded image is used."
                  : form.asReel
                    ? "Instagram posts a Reel — the auto-generated card is mixed with your music into a video."
                    : "Instagram always posts an image, so a question image is generated automatically."}
              </p>
            )}

            {form.kind !== "custom" && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <label className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Film className="h-4 w-4 text-brand-500" /> Post as a Reel (with music)
                    <span className="font-normal text-slate-400">— auto-picks a {form.kind === "flashcard" ? "flashcard" : "question"} and mixes its card with your library music</span>
                  </span>
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, asReel: !f.asReel }))}
                    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${form.asReel ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.asReel ? "left-6" : "left-1"}`} />
                  </button>
                </label>
                {form.asReel && (
                  <div className="mt-3">
                    {(settings?.fbReelAudios || []).length ? (
                      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Music className="h-4 w-4 text-emerald-600" />
                        Uses your shared <b>Reel music library</b> ({settings.fbReelAudios.length} track{settings.fbReelAudios.length > 1 ? "s" : ""}). Each Reel uses the next track, then starts over — manage tracks in the <b>Reel music library</b> section above.
                      </p>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-rose-600">
                        <AlertTriangle className="h-4 w-4" />
                        Your <b>Reel music library</b> is empty — add tracks in the <b>Reel music library</b> section above (you only do this once).
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <label className="text-sm font-medium">Reel length</label>
                      <input type="number" min={1} max={90} step={1}
                        className="input h-9 w-20"
                        value={form.reelDuration}
                        onChange={(e) => setForm((f) => ({ ...f, reelDuration: e.target.value === "" ? "" : Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 0)) }))}
                        onBlur={(e) => { if (!e.target.value) setForm((f) => ({ ...f, reelDuration: 30 })); }} />
                      <span className="text-sm text-slate-500 dark:text-slate-400">seconds</span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Each run renders the {form.kind === "flashcard" ? "flashcard" : "question"} card, mixes it with the next
                      library track trimmed to <b>{form.reelDuration || 30}s</b>, and posts a <b>Reel</b> (9:16 video) instead of a photo. Max 90s.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Also share to Stories (all post types) */}
            <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <label className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Camera className="h-4 w-4 text-brand-500" /> Also post to Stories
                  <span className="font-normal text-slate-400">— shares the image as a 24-hour Story on Facebook &amp; Instagram</span>
                </span>
                <button type="button"
                  onClick={() => setForm((f) => ({ ...f, asStory: !f.asStory }))}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${form.asStory ? "bg-[#1877F2]" : "bg-slate-300 dark:bg-slate-600"}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${form.asStory ? "left-6" : "left-1"}`} />
                </button>
              </label>
              {form.asStory && (
                <p className="mt-1.5 text-xs text-slate-400">
                  In addition to the normal post, the {form.kind === "custom" ? "uploaded image" : "card image"} is shared as a <b>Story</b> to the selected
                  networks. Stories disappear after 24 hours and don't carry a caption/hashtags.
                </p>
              )}
            </div>

            {form.kind === "question" && (
              <>
                <p className="mb-1 mt-4 text-sm font-semibold">Public Quizzes</p>
                <div className="flex flex-wrap gap-4">
                  {[["includeOptions", "Show A/B/C/D options"], ["includeAnswer", "Reveal the answer + explanation"], ["includeLink", "Append site link"]].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} /> {l}
                    </label>
                  ))}
                </div>
              </>
            )}

            <label className="mb-1 mt-4 block text-sm font-medium">Hashtags (optional)</label>
            <textarea className="input min-h-[46px] resize-y" rows={2} value={form.hashtags} onChange={(e) => setForm((f) => ({ ...f, hashtags: e.target.value }))} placeholder="#GK #JKSSB #Quiz" />
            <p className="mt-1 text-xs text-slate-400">Separate tags with spaces. Non-English tags (e.g. Hindi) are kept. Drag the bottom-right corner to enlarge.</p>

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
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {search ? `No schedules match "${search}".` : rangeActive ? `No posts are scheduled between ${fromTime} and ${toTime}.` : "No schedules yet. Create one to auto-post questions or custom text/media at set times."}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {schedules.map((s) => (
                <div key={s._id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className={`inline-block h-2 w-2 rounded-full ${s.completedAt ? "bg-emerald-500" : s.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {s.title || (s.kind === "custom" ? "Custom post" : s.source?.label) || "Untitled schedule"}
                        {s.kind === "custom" && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Custom</span>}
                        {s.kind === "flashcard" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Flashcard</span>}
                        {(s.asReel || (s.kind === "custom" && s.customVideo)) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300">
                            <Film className="h-3 w-3" /> Reel
                          </span>
                        )}
                        {s.asStory && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            <Camera className="h-3 w-3" /> Story
                          </span>
                        )}
                        {s.completedAt && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Completed</span>}
                        {!s.enabled && !s.completedAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">Paused</span>}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {s.kind === "custom" && Array.isArray(s.customMedia) && s.customMedia[0] && (
                          <img src={s.customMedia[0]} alt="" className="h-8 w-8 flex-shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700" />
                        )}
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {s.kind === "custom" ? (s.customText || "(image only)") : (s.source?.label || "—")}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {s.mode === "once" ? (
                          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> One-time{s.runAt ? ` · ${new Date(s.runAt).toLocaleString()}` : ""}</span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {(s.times || []).join(", ") || "—"}</span>
                            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {daysLabel(s.days)}</span>
                          </>
                        )}
                        <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" /> {s.postCount || 0}{s.poolSize ? ` / ${s.poolSize}` : ""} posted</span>
                        {s.mode !== "once" && <span className="text-slate-400">{s.timezone}</span>}
                      </div>
                      {(rowMsg[s._id] || s.lastResult) && <p className="mt-1 text-xs text-slate-400">{compactScheduleResult(rowMsg[s._id] || s.lastResult)}</p>}
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

        {/* Pagination */}
        {!form && !loading && total > PAGE_SIZE && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-outline !py-1 !text-xs disabled:opacity-40">Prev</button>
              <span className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-outline !py-1 !text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
