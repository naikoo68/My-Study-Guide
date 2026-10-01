// Admin → Facebook auto-post page — connect a page/account and configure automatic
// social posts for new content.

import LiveTextBox from "../../components/admin/LiveTextBox.jsx";
import CardBoxEditor from "../../components/admin/CardBoxEditor.jsx";
import useElementWidth from "../../components/admin/useElementWidth.js";
import { useEffect, useState, useRef } from "react";
import {
  Send, Loader2, CheckCircle2, AlertTriangle, KeyRound, Plus, Trash2, Pencil, X,
  Clock, CalendarClock, ListChecks, Power, Save, Upload, UserCircle, Type, Search, Mail,
  ImagePlus, FileText, Wand2, RefreshCw, Film, Music, Camera, ChevronDown, MessageCircle,
  Sparkles, Volume2, PlayCircle, Link2, Unplug, Clapperboard, Move, RotateCw, Share2,
} from "lucide-react";
import { Facebook, Instagram, Youtube, SOCIAL_PLATFORMS } from "../../components/ui/SocialIcons";
import { settingsService, facebookService, youtubeService, uploadVideoFileToYoutube, contentService, practiceService, uploadService } from "../../services";
import { useSettings } from "../../context/SettingsContext";
import { getActiveSocialProfile } from "../../lib/api";
import { Loading, ErrorState } from "../../components/ui/AsyncState";
import { estimateSlideshowEta, smoothRemaining, learnSlideshowProfile, loadSlideshowProfile, saveSlideshowProfile, fmtDuration } from "../../lib/slideshowEta";

// Paid narration engines: where each one's API key is saved (never shown back —
// the server only says `<keyField>Set`), its extra settings, and a short hint.
const PAID_ENGINES = {
  openai: {
    label: "OpenAI", keyField: "ttsApiKey", keyUrl: "https://platform.openai.com/api-keys",
    fields: [{ name: "ttsModel", placeholder: "Model (default gpt-4o-mini-tts)" }],
    hint: "Natural voices, male & female. Uses your OpenAI credits.",
  },
  elevenlabs: {
    label: "ElevenLabs", keyField: "ttsElevenLabsKey", keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    fields: [{ name: "ttsElevenLabsModel", placeholder: "Model (default eleven_multilingual_v2)" }],
    hint: "Very natural voices. Pick a premade voice or type any voice ID from your ElevenLabs Voice Library.",
  },
  googlecloud: {
    label: "Google Cloud TTS", keyField: "ttsGoogleCloudKey", keyUrl: "https://console.cloud.google.com/apis/credentials",
    fields: [],
    hint: "Enable “Cloud Text-to-Speech API” in your Google Cloud project, then create an API key. Any voice name works (e.g. en-IN-Wavenet-A).",
  },
  azure: {
    label: "Microsoft Azure Speech", keyField: "ttsAzureKey", keyUrl: "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices",
    fields: [{ name: "ttsAzureRegion", placeholder: "Region, e.g. centralindia" }],
    hint: "Needs the key AND the region of your Speech resource. Same neural voices as Edge, without the IP blocks.",
  },
  custom: {
    label: "Other (OpenAI-compatible API)", keyField: "ttsCustomKey", keyOptional: true,
    fields: [
      { name: "ttsCustomUrl", placeholder: "API URL, e.g. https://api.example.com/v1", wide: true },
      { name: "ttsCustomModel", placeholder: "Model, e.g. tts-1" },
    ],
    hint: "Any paid or self-hosted service with an OpenAI-style /audio/speech endpoint. Type the voice name it uses.",
  },
};
const ENGINE_FIELDS = Object.values(PAID_ENGINES).flatMap((e) => e.fields.map((f) => f.name));
const FREE_FORM_VOICE = new Set(["elevenlabs", "googlecloud", "azure", "custom"]);
const engineFieldsFrom = (s) => Object.fromEntries(ENGINE_FIELDS.map((n) => [n, s?.[n] || ""]));

// AI Slideshow "what to read aloud" toggles ↔ the saved site settings.
const READ_TOGGLES = [
  { key: "question", setting: "slideshowReadQuestion", slide: 1, label: "Question", hint: "incl. assertion / statements / columns" },
  { key: "options", setting: "slideshowReadOptions", slide: 1, label: "Options", hint: "every option, A–D" },
  { key: "explanation", setting: "slideshowReadExplanation", slide: 2, label: "Explanation", hint: "the full explanation" },
  { key: "keyPoints", setting: "slideshowReadKeyPoints", slide: 2, label: "Key points", hint: "every key point" },
  { key: "quickRecall", setting: "slideshowReadQuickRecall", slide: 2, label: "Quick recall", hint: "the memory hook" },
];
const readOptsFrom = (s) => Object.fromEntries(READ_TOGGLES.map((t) => [t.key, s?.[t.setting] !== false]));
const readOptsToSettings = (r) => Object.fromEntries(READ_TOGGLES.map((t) => [t.setting, r[t.key] !== false]));

// Approximate browser fonts for the thumbnail box preview (the exact server
// fonts render only in "Exact preview").
const PREVIEW_FONT = {
  serif: "Georgia,serif", mono: "monospace",
  anton: "\"Arial Narrow\",Impact,sans-serif", bebas: "\"Arial Narrow\",Impact,sans-serif",
  oswald: "\"Arial Narrow\",sans-serif", poppins: "\"Trebuchet MS\",sans-serif", montserrat: "\"Trebuchet MS\",sans-serif",
};
// "#rrggbb" + alpha (0–1) → "rgba(...)" for the thumbnail shade preview.
function hexToRgba(hex, a = 1) {
  const h = /^#[0-9a-f]{6}$/i.test(String(hex || "")) ? hex : "#000000";
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
}

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
      // The same "Fatal" / 2207076 signature comes back for both feed images
      // and Reel videos. Feed images are already width-capped; Reel videos now
      // use a 5 Mbps H.264 baseline / 48 kHz AAC / 2 s keyframe / faststart
      // render with a 5 s minimum duration. Preserve the RAW Meta message here
      // (in parentheses on the source note) so operators can see whether Meta
      // returned a specific subcode next time this fails.
      return `${part.replace(/\s*·\s*$/, "")} — Reel video already uses 30 fps H.264 baseline + faststart; if this keeps happening pick a longer/less-processed audio track or wait a few minutes.`;
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
        topic: next.topic?._id || null, // a whole topic (for "quiz by quiz")
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
        practiceTopic: next.quiz ? null : next.topic?._id || null, // a whole My Quiz topic
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

// Upload / remove ONE slide template image (question or answer). Saved to
// site settings immediately, like the flashcard template.
function SlideTemplateUploader({ label, hint, settingKey, settings, saveSettings, landscape = false }) {
  // Preview box shape: tall for 9:16 Reel templates, wide for 16:9 long-video ones.
  const box = landscape ? "h-[72px] w-32" : "h-32 w-[72px]";
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const url = settings?.[settingKey] || "";

  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg({ ok: false, text: "Please pick an image file." }); return; }
    setUploading(true); setMsg(null);
    try {
      const r = await uploadService.imageDirect(file);
      if (!r?.url) throw new Error("Upload failed.");
      await saveSettings({ [settingKey]: r.url });
      setMsg({ ok: true, text: "Saved." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Upload failed." }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const remove = async () => {
    try { await saveSettings({ [settingKey]: "" }); setMsg({ ok: true, text: "Removed — using the built-in design." }); }
    catch (err) { setMsg({ ok: false, text: err.message || "Failed." }); }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      {url ? (
        <div className="relative flex-shrink-0">
          <img src={url} alt={label} className={`${box} rounded-md border border-slate-200 bg-slate-100 object-contain dark:border-slate-700 dark:bg-slate-800`} />
          <button type="button" onClick={remove} title="Remove" className="absolute -right-2 -top-2 rounded-full bg-rose-100 p-1 text-rose-600 shadow hover:bg-rose-200 dark:bg-rose-900/40"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className={`flex ${box} flex-shrink-0 items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-slate-300 dark:border-slate-600`}><ImagePlus className="h-6 w-6" /></div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
        <label className={`btn-outline mt-2 cursor-pointer !py-1 text-xs ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><Upload className="h-3.5 w-3.5" /> {url ? "Replace" : "Upload"} template</>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
        </label>
        {msg && <p className={`mt-1 text-xs font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

// AI Slideshow — site-wide settings for the "AI Slideshow" post type (one
// question → 2 narrated slides → 9:16 Reel). Set once here, applied to every
// AI Slideshow schedule, like the Reel music library and watermarks. Includes
// the narration engine (free or keyed), voice, how long each slide stays on
// screen, captions, and a test render that never publishes.
function AiSlideshowSection({ settings, saveSettings, onCreated }) {
  const [voicesByProvider, setVoicesByProvider] = useState({
    gtranslate: [{ id: "en-IN", label: "English (India)" }, { id: "en", label: "English (US)" }, { id: "en-GB", label: "English (UK)" }, { id: "en-AU", label: "English (Australia)" }],
    edge: [{ id: "en-IN-NeerjaNeural", label: "Neerja (India, female)" }],
    openai: [{ id: "coral", label: "Coral" }],
  });
  const [providers, setProviders] = useState(["gtranslate", "edge", "openai", "elevenlabs", "googlecloud", "azure", "custom"]);
  const [provider, setProvider] = useState(settings?.ttsProvider || "gtranslate");
  // Paid engines' non-secret settings (model, region, URL) and any NEW keys
  // typed on screen ({ ttsApiKey: "sk-…" }) — keys are never shown back.
  const [engineFields, setEngineFields] = useState(() => engineFieldsFrom(settings));
  const [newKeys, setNewKeys] = useState({});
  const [voice, setVoice] = useState(settings?.slideshowVoice || "");
  const [questionSec, setQuestionSec] = useState(settings?.slideshowQuestionSec || 10);
  const [answerSec, setAnswerSec] = useState(settings?.slideshowAnswerSec || 8);
  const [captions, setCaptions] = useState(settings?.slideshowAutoCaptions !== false);
  // What the narrator reads aloud (each part in full). All ON by default.
  const [readOpts, setReadOpts] = useState(() => readOptsFrom(settings));
  // "both" = question + answer slide per question; "question" = question only.
  const [slidesMode, setSlidesMode] = useState(settings?.slideshowSlides === "question" ? "question" : "both");
  const withAnswer = slidesMode === "both";
  // Question-only answer reveal: thinking pause, how long the green answer shows, say it.
  const revealFrom = (s) => ({
    pauseSec: s?.slideshowRevealPauseSec ?? 3,
    showSec: s?.slideshowRevealSec ?? 3,
    say: s?.slideshowRevealSay !== false,
  });
  const [reveal, setReveal] = useState(() => revealFrom(settings));
  const clampNum = (v, def, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const revealClean = () => ({ pauseSec: clampNum(reveal.pauseSec, 3, 0, 15), showSec: clampNum(reveal.showSec, 3, 1, 15), say: reveal.say !== false });
  const revealSettings = () => {
    const r = revealClean();
    return { slideshowRevealPauseSec: r.pauseSec, slideshowRevealSec: r.showSec, slideshowRevealSay: r.say };
  };
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState(null);
  const [testError, setTestError] = useState("");
  // Stopwatch for the test build: when it started, the live elapsed seconds,
  // and the final time it took (kept after it finishes so it stays visible).
  const [testStartedAt, setTestStartedAt] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [tookSec, setTookSec] = useState(null);
  // Progress % + time left: the server's per-step counter ({ done, total }),
  // the current estimate, and the live values the 1s ticker reads.
  const [progress, setProgress] = useState(null);
  const [eta, setEta] = useState(null); // { percent, remainingSec }
  const liveRef = useRef({ stage: "PENDING", since: 0, progress: null, slides: 2, profile: {} });
  // What to post and when — creates an AI Slideshow schedule.
  const [pickerKey, setPickerKey] = useState(0); // remounts the picker after creating
  const [title, setTitle] = useState("");
  const [source, setSource] = useState({ subject: null, session: null, quiz: null, testSeries: null, label: "" });
  const [times, setTimes] = useState(["09:00"]);
  const [days, setDays] = useState([]);
  const [order, setOrder] = useState("random");
  const [stopWhenExhausted, setStopWhenExhausted] = useState(true);
  const [toFacebook, setToFacebook] = useState(true);
  const [toInstagram, setToInstagram] = useState(false);
  const [toTelegram, setToTelegram] = useState(false);
  const [toYoutube, setToYoutube] = useState(false);
  const [ytTitle, setYtTitle] = useState("");
  const [ytFullVideo, setYtFullVideo] = useState(false);
  const [ytPlaylist, setYtPlaylist] = useState({ id: "", title: "" });
  const [hashtags, setHashtags] = useState("");
  const [questionCount, setQuestionCount] = useState(1); // questions per video (1–10)
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);
  const hasSource = !!(source.subject || source.session || source.quiz || source.testSeries);

  // Server's engines + voices (hard-coded defaults above if this fails).
  useEffect(() => {
    facebookService.ttsVoices().then((r) => {
      if (r?.voicesByProvider && typeof r.voicesByProvider === "object") setVoicesByProvider(r.voicesByProvider);
      if (Array.isArray(r?.providers) && r.providers.length) setProviders(r.providers);
    }).catch(() => {});
  }, []);

  // Re-sync when the saved settings arrive/change.
  useEffect(() => {
    setProvider(settings?.ttsProvider || "gtranslate");
    setEngineFields(engineFieldsFrom(settings));
    setVoice(settings?.slideshowVoice || "");
    setQuestionSec(settings?.slideshowQuestionSec || 10);
    setAnswerSec(settings?.slideshowAnswerSec || 8);
    setCaptions(settings?.slideshowAutoCaptions !== false);
    setReadOpts(readOptsFrom(settings));
    setSlidesMode(settings?.slideshowSlides === "question" ? "question" : "both");
    setReveal(revealFrom(settings));
  }, [settings?.slideshowSlides, settings?.slideshowRevealPauseSec, settings?.slideshowRevealSec, settings?.slideshowRevealSay, settings?.ttsProvider, settings?.ttsModel, settings?.ttsElevenLabsModel, settings?.ttsAzureRegion, settings?.ttsCustomUrl, settings?.ttsCustomModel, settings?.slideshowVoice, settings?.slideshowQuestionSec, settings?.slideshowAnswerSec, settings?.slideshowAutoCaptions,
    settings?.slideshowReadQuestion, settings?.slideshowReadOptions, settings?.slideshowReadExplanation, settings?.slideshowReadKeyPoints, settings?.slideshowReadQuickRecall]); // eslint-disable-line react-hooks/exhaustive-deps

  const voices = voicesByProvider[provider] || [];
  // Engines that accept any voice ID keep a typed-in voice; others must match the list.
  const voiceValue = voices.some((v) => v.id === voice) || (FREE_FORM_VOICE.has(provider) && voice.trim())
    ? voice.trim() : (voices[0]?.id || "");
  const secs = (v, def) => { const n = parseInt(v, 10); return n >= 3 ? Math.min(40, n) : def; };
  const qCount = Math.max(1, Math.min(10, parseInt(questionCount, 10) || 1));
  const engine = PAID_ENGINES[provider] || null;

  // The engine settings to save / test with: provider, every engine's model /
  // region / URL, and only the keys NEWLY typed (blank keeps the saved key).
  const engineSettings = () => ({
    ttsProvider: provider,
    ...Object.fromEntries(ENGINE_FIELDS.map((n) => [n, String(engineFields[n] || "").trim()])),
    ...Object.fromEntries(Object.entries(newKeys).map(([k, v]) => [k, String(v || "").trim()]).filter(([, v]) => v)),
  });

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveSettings({
        ...engineSettings(),
        slideshowVoice: voiceValue,
        slideshowQuestionSec: secs(questionSec, 10),
        slideshowAnswerSec: secs(answerSec, 8),
        slideshowAutoCaptions: captions,
        ...readOptsToSettings(readOpts),
        slideshowSlides: slidesMode,
        ...revealSettings(),
      });
      setNewKeys({}); setMsg({ ok: true, text: "Saved." });
    } catch (e) { setMsg({ ok: false, text: e.message || "Failed to save." }); } finally { setSaving(false); }
  };

  const removeKey = async (keyField) => {
    setMsg(null);
    try {
      await saveSettings({ [keyField]: "__CLEAR__" });
      setNewKeys((k) => ({ ...k, [keyField]: "" }));
      setMsg({ ok: true, text: "Key removed." });
    } catch (e) { setMsg({ ok: false, text: e.message || "Failed to remove the key." }); }
  };

  // Build a preview video with a random published question — never publishes.
  // Uses the values currently on screen (so you can try before saving). Runs as
  // a background job on the server; poll until it's done.
  const test = async () => {
    const startedAt = Date.now();
    setTesting(true); setTestError(""); setResult(null); setStage(""); setProgress(null);
    setTestStartedAt(startedAt); setElapsedSec(0); setTookSec(null);
    const slides = qCount * 2; // question + answer, or question + green reveal
    liveRef.current = { stage: "PENDING", since: startedAt, progress: null, slides, profile: loadSlideshowProfile() };
    const marks = [{ stage: "PENDING", at: startedAt }];
    setEta(estimateSlideshowEta({ stage: "PENDING", slides, profile: liveRef.current.profile }));
    try {
      const start = await facebookService.testSlideshow({
        ttsVoice: voiceValue,
        // The engine on screen (+ any newly typed key) — used for this test only, not saved.
        engine: engineSettings(),
        autoCaptions: captions,
        read: readOpts, // the toggles on screen (so a test reflects unsaved edits)
        slidesMode,
        reveal: revealClean(),
        questionSec: secs(questionSec, 10),
        answerSec: secs(answerSec, 8),
        slideshowQuestions: qCount,
        // Preview questions from the picked content (else random ones).
        ...(hasSource ? { source, order } : {}),
      });
      if (!start?.jobId) throw new Error(start?.message || "Could not start the test slideshow.");
      // No fixed time limit — a 10-question video on a small server can take a
      // while. Give up only when the server has made NO progress (same step and
      // slide count) for STALL_MS, or after an absolute cap. A brief network
      // error while polling is retried instead of ending the test.
      const STALL_MS = 5 * 60 * 1000;
      const hardDeadline = Date.now() + 45 * 60 * 1000;
      let lastKey = "", lastChange = Date.now(), pollErrors = 0;
      for (;;) {
        // Poll every 2s so step changes (and the time-left estimate) stay fresh.
        await new Promise((r) => setTimeout(r, 2000));
        let st;
        try {
          st = await facebookService.testSlideshowStatus(start.jobId);
          pollErrors = 0;
        } catch (e) {
          // A 4xx (e.g. 404 = the job is gone after a server restart) is final;
          // network blips / 5xx are retried a few times.
          if ((e?.status >= 400 && e?.status < 500) || ++pollErrors >= 8) throw e;
          continue;
        }
        const key = `${st?.stage || ""}|${st?.progress?.done ?? ""}`;
        if (key !== lastKey) { lastKey = key; lastChange = Date.now(); }
        if (st?.status === "done" && st?.videoUrl) {
          // Teach the estimator how long each step really took on this server.
          const live = liveRef.current;
          saveSlideshowProfile(learnSlideshowProfile(live.profile, marks, Date.now(), (st.slides || live.slides)));
          setEta({ percent: 100, remainingSec: 0 });
          setResult(st); break;
        }
        if (st?.status === "failed") { setTestError(st?.message || "Could not build the test slideshow."); break; }
        if (st?.stage) {
          const live = liveRef.current;
          if (st.stage !== live.stage) { live.stage = st.stage; live.since = Date.now(); live.doneAt = 0; marks.push({ stage: st.stage, at: live.since }); }
          const nextProgress = st.progress?.total > 0 ? st.progress : null;
          // Remember when the slide count last went up (for the per-slide speed).
          if (nextProgress && nextProgress.done !== live.progress?.done) live.doneAt = Date.now();
          live.progress = nextProgress;
          setStage(st.stage); setProgress(live.progress);
        }
        if (Date.now() - lastChange > STALL_MS) { setTestError("The server stopped making progress on the test slideshow — please try again."); break; }
        if (Date.now() > hardDeadline) { setTestError("The test slideshow is taking too long — try fewer questions per video."); break; }
      }
    } catch (e) {
      setTestError(e?.message || "Could not build the test slideshow.");
    } finally {
      setTookSec(Math.round((Date.now() - startedAt) / 1000));
      setTesting(false); setStage(""); setProgress(null);
    }
  };

  // Once a second while the test build runs: tick the stopwatch and refresh the
  // % / time-left estimate. The % is work-based and never goes backwards; the
  // time left counts down smoothly instead of jumping on each server update.
  useEffect(() => {
    if (!testing || !testStartedAt) return undefined;
    const id = setInterval(() => {
      const now = Date.now();
      const live = liveRef.current;
      const e = estimateSlideshowEta({
        stage: live.stage,
        stageElapsedSec: (now - live.since) / 1000,
        doneAtSec: live.doneAt ? (live.doneAt - live.since) / 1000 : 0,
        progress: live.progress,
        slides: live.slides,
        profile: live.profile,
      });
      setElapsedSec(Math.floor((now - testStartedAt) / 1000));
      setEta((prev) => ({
        percent: Math.max(prev?.percent || 0, e.percent),
        remainingSec: smoothRemaining(prev?.remainingSec, e.remainingSec),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [testing, testStartedAt]);

  // Create an AI Slideshow schedule for the picked content. Saves the slide /
  // voice settings first so the new schedule uses exactly what's on screen.
  const createSchedule = async () => {
    setCreateMsg(null);
    const cleanTimes = times.filter(Boolean);
    if (!hasSource) { setCreateMsg({ ok: false, text: "Pick the content first (at least a subject, or a My Quiz)." }); return; }
    if (!cleanTimes.length) { setCreateMsg({ ok: false, text: "Add at least one posting time." }); return; }
    if (!toFacebook && !toInstagram && !toYoutube && !toTelegram) { setCreateMsg({ ok: false, text: "Choose Facebook, Instagram, YouTube and/or Telegram." }); return; }
    setCreating(true);
    try {
      await saveSettings({
        ...engineSettings(),
        slideshowVoice: voiceValue,
        slideshowQuestionSec: secs(questionSec, 10),
        slideshowAnswerSec: secs(answerSec, 8),
        slideshowAutoCaptions: captions,
        ...readOptsToSettings(readOpts),
        slideshowSlides: slidesMode,
        ...revealSettings(),
      });
      setNewKeys({});
      await facebookService.create({
        kind: "slideshow",
        asSlideshow: true,
        asReel: false,
        enabled: true,
        mode: "recurring",
        title: title.trim(),
        source,
        times: cleanTimes,
        days,
        timezone: "Asia/Kolkata",
        order,
        stopWhenExhausted,
        toFacebook,
        toInstagram,
        toYoutube,
        toTelegram,
        ytTitle: ytTitle.trim(),
        ytFullVideo: toYoutube && ytFullVideo,
        ytPlaylistId: toYoutube ? ytPlaylist.id : "",
        ytPlaylistTitle: toYoutube ? ytPlaylist.title : "",
        hashtags: hashtags.trim(),
        slideshowQuestions: qCount,
        includeOptions: true,
        includeAnswer: false,
      });
      setCreateMsg({ ok: true, text: `Slideshow schedule created for ${source.label || "the picked content"} — it's in Scheduled posts below.` });
      setTitle(""); setSource({ subject: null, session: null, quiz: null, testSeries: null, label: "" }); setPickerKey((k) => k + 1);
      setTimes(["09:00"]); setDays([]); setHashtags(""); setQuestionCount(1); setYtTitle("");
      onCreated?.();
    } catch (e) {
      setCreateMsg({ ok: false, text: e.message || "Could not create the schedule." });
    } finally { setCreating(false); }
  };

  const providerLabel = (p) => (p === "gtranslate" ? "Free — Google (no key, recommended)"
    : p === "edge" ? "Free — Microsoft Edge (no key)"
    : PAID_ENGINES[p] ? `Paid — ${PAID_ENGINES[p].label}${settings?.[`${PAID_ENGINES[p].keyField}Set`] ? " ✓ key saved" : ""}`
    : p);

  return (
    <CollapsibleCard title="AI Slideshow" icon={Sparkles}>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Post questions as a narrated Reel: <b>slide 1</b> shows the question with its options,
        <b> slide 2</b> reveals the answer and explanation (or choose <b>question slide only</b> in step 4).
        Pick the content and when to post, set the slide times and voice, then create the schedule.
      </p>

      {/* 1) Content — where the questions come from */}
      <p className="mb-1 mt-4 text-sm font-semibold">1. Content — where questions come from</p>
      <SourcePicker key={pickerKey} onPick={setSource} />
      {source.label && <p className="mt-2 text-xs text-emerald-600">Selected: {source.label}</p>}
      <div className="mt-3">
        <label className="mb-1 flex items-center gap-1.5 text-sm font-medium"><ListChecks className="h-4 w-4 text-slate-400" /> Questions per slideshow</label>
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={10} step={1} className="input h-9 w-24" value={questionCount}
            onChange={(e) => setQuestionCount(e.target.value === "" ? "" : Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
            onBlur={() => setQuestionCount(qCount)} />
          <span className="text-sm text-slate-500 dark:text-slate-400">question{qCount > 1 ? "s" : ""} in each video (1–10)</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {withAnswer ? "Each question gets its own question slide and answer slide: Q1 → A1 → Q2 → A2 …" : "Each question: question → pause → correct option turns green → next question."}
          All {qCount} question{qCount > 1 ? "s are" : " is"} marked as posted, so none repeat.
        </p>
      </div>

      {/* 2) When to post */}
      <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-4 w-4 text-slate-400" /> 2. Times (posts one question at each)</p>
      <div className="flex flex-wrap items-center gap-2">
        {times.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
            <input type="time" value={t} onChange={(e) => setTimes((ts) => ts.map((x, k) => (k === i ? e.target.value : x)))} className="bg-transparent text-sm outline-none" />
            {times.length > 1 && <button type="button" onClick={() => setTimes((ts) => ts.filter((_, k) => k !== i))} className="text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>}
          </span>
        ))}
        <button type="button" onClick={() => setTimes((ts) => [...ts, "18:00"])} className="btn-outline !py-1 !text-xs"><Plus className="h-3.5 w-3.5" /> Add time</button>
      </div>
      <p className="mb-1 mt-3 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-slate-400" /> Days <span className="font-normal text-slate-400">(none = every day)</span></p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((w) => (
          <button type="button" key={w.v} onClick={() => setDays((d) => (d.includes(w.v) ? d.filter((x) => x !== w.v) : [...d, w.v]))}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${days.includes(w.v) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{w.l}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Order</label>
          <select className="input" value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="random">Random (no repeats until all used)</option>
            <option value="sequential">Sequential (oldest first)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Title (optional)</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Daily Biology slideshow" />
        </div>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={stopWhenExhausted} onChange={(e) => setStopWhenExhausted(e.target.checked)} />
        <span>Stop when every question has been posted <span className="text-slate-400">(don't repeat)</span></span>
      </label>

      {/* 3) Where to post */}
      <p className="mb-1 mt-4 text-sm font-semibold">3. Post to</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#1877F2]" checked={toFacebook} onChange={(e) => setToFacebook(e.target.checked)} /> Facebook <span className="text-slate-400">(Reel)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#E1306C]" checked={toInstagram} onChange={(e) => setToInstagram(e.target.checked)} /> Instagram <span className="text-slate-400">(Reel)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={toYoutube} onChange={(e) => setToYoutube(e.target.checked)} /> YouTube <span className="text-slate-400">(Short)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#229ED9]" checked={toTelegram} onChange={(e) => setToTelegram(e.target.checked)} /> <Send className="h-4 w-4 text-[#229ED9]" /> Telegram <span className="text-slate-400">(video)</span>
        </label>
      </div>
      {toYoutube && (
        <div className="mt-2">
          <label className="mb-1 block text-sm font-medium">YouTube title</label>
          <input className="input" maxLength={90} value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="Automatic: Subject | Topic | Quiz 1" />
          <p className="mt-1 text-xs text-slate-400">Leave blank for <b>Subject | Topic | Quiz 1</b>, Quiz 2… — each video is the next {qCount > 1 ? `${qCount} questions` : "question"} (e.g. 25 questions at 5 per video → Quiz 1 to Quiz 5). Pick <b>Sequential</b> order so Quiz 1 is the first questions. Connect your channel in the <b>YouTube Shorts</b> card first.</p>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#FF0000]" checked={ytFullVideo} onChange={(e) => setYtFullVideo(e.target.checked)} />
            <span>Also make <b>one full video</b> of the whole topic after the last Short <span className="text-slate-400">(landscape, all questions + answers).</span></span>
          </label>
          <label className="mb-1 mt-2 block text-sm font-medium">Playlist (folder)</label>
          <YtPlaylistPicker value={ytPlaylist.id} emptyLabel="Default Shorts playlist (YouTube settings)" onChange={(id, t) => setYtPlaylist({ id, title: t })} />
        </div>
      )}
      <label className="mb-1 mt-3 block text-sm font-medium">Hashtags (optional)</label>
      <textarea className="input min-h-[46px] resize-y" rows={2} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#GK #JKSSB #Quiz" />

      {/* 4) Slide times */}
      <p className="mb-1 mt-5 text-sm font-semibold">4. Slides, times, voice &amp; captions <span className="font-normal text-slate-400">(used by every AI Slideshow schedule)</span></p>

      {/* Which slides each question gets */}
      <p className="mb-1.5 mt-3 flex items-center gap-1.5 text-sm font-medium"><Film className="h-4 w-4 text-slate-400" /> Slides per question</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["both", "Question + answer slide", "Slide 1 asks the question; slide 2 reveals the answer, explanation, key points & quick recall."],
          ["question", "Question slide only", "After the question is read, a short pause, then the correct option turns green on the same slide. No explanation slide."],
        ].map(([value, label, hint]) => (
          <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${slidesMode === value ? "border-brand-500 bg-brand-50/60 dark:bg-brand-900/20" : "border-slate-200 dark:border-slate-700"}`}>
            <input type="radio" name="slidesMode" className="mt-0.5 h-4 w-4 accent-brand-600" checked={slidesMode === value} onChange={() => setSlidesMode(value)} />
            <span><span className="font-medium">{label}</span><span className="mt-0.5 block text-xs text-slate-400">{hint}</span></span>
          </label>
        ))}
      </div>

      {!withAnswer && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Answer reveal</p>
          <div className="flex flex-wrap items-end gap-4">
            {[
              ["pauseSec", "Thinking pause", "silence after the question is read", 0, 15],
              ["showSec", "Show green answer for", "the correct option in green", 1, 15],
            ].map(([key, label, hint, lo, hi]) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium">{label}</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={lo} max={hi} step={1} className="input h-9 w-20" value={reveal[key]}
                    onChange={(e) => setReveal((r) => ({ ...r, [key]: e.target.value }))}
                    onBlur={(e) => setReveal((r) => ({ ...r, [key]: clampNum(e.target.value, 3, lo, hi) }))} />
                  <span className="text-xs text-slate-500">sec</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
              </div>
            ))}
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={reveal.say} onChange={(e) => setReveal((r) => ({ ...r, say: e.target.checked }))} />
              Say the answer (“The correct answer is option B: 1, 2 and 3”)
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["Question time", "Slide 1 — question + options", questionSec, setQuestionSec, 10],
          ...(withAnswer ? [["Answer reveal time", "Slide 2 — answer + explanation", answerSec, setAnswerSec, 8]] : []),
        ].map(([label, hint, value, setValue, def]) => (
          <div key={label}>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium"><Clock className="h-4 w-4 text-slate-400" /> {label}</label>
            <div className="flex items-center gap-2">
              <input type="number" min={3} max={40} step={1} className="input h-9 w-24" value={value}
                onChange={(e) => setValue(e.target.value === "" ? "" : Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 0)))}
                onBlur={(e) => setValue(secs(e.target.value, def))} />
              <span className="text-sm text-slate-500 dark:text-slate-400">seconds</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>
      {(() => {
        const r = revealClean();
        const second = withAnswer ? secs(answerSec, 8) : r.pauseSec + r.showSec;
        const perQ = secs(questionSec, 10) + second;
        return (
          <p className="mt-2 text-xs text-slate-400">
            Video length ≈ {perQ * qCount}s ({qCount} × {secs(questionSec, 10)}s + {second}s{withAnswer ? "" : " pause & reveal"}). If the voice needs
            longer than the time you set, that slide stays up until the narration finishes.
            {perQ * qCount > 90 && " Over 90s: Instagram still posts it as a Reel; Facebook posts it as a normal video."}
          </p>
        );
      })()}

      {/* Slide templates */}
      <p className="mb-1 mt-5 text-sm font-semibold">Slide templates <span className="font-normal text-slate-400">(optional)</span></p>
      <p className="mb-2 text-xs text-slate-400">
        Upload your own background for each slide type — best at <b>1080×1920</b> (9:16). Keep the top and bottom for your branding;
        the question / answer is placed on a white card in the middle. Leave empty to use the built-in design.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SlideTemplateUploader label="Question slide template" hint="Background for slide 1 (question + options)"
          settingKey="slideshowQuestionTemplateUrl" settings={settings} saveSettings={saveSettings} />
        {withAnswer && (
          <SlideTemplateUploader label="Answer slide template" hint="Background for slide 2 (answer + explanation)"
            settingKey="slideshowAnswerTemplateUrl" settings={settings} saveSettings={saveSettings} />
        )}
      </div>
      <CardBoxEditor key={`cb-p-${settings?.slideshowQuestionTemplateUrl || settings?.slideshowAnswerTemplateUrl || ""}`}
        templateUrl={settings?.slideshowQuestionTemplateUrl || settings?.slideshowAnswerTemplateUrl || ""}
        boxKey="slideshowCardBox" settings={settings} saveSettings={saveSettings} />

      {/* Narration engine */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium">Narration engine</label>
        <select className="input h-9 w-64" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {providers.map((p) => <option key={p} value={p}>{providerLabel(p)}</option>)}
        </select>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        {provider === "gtranslate" && "Free — no API key or account. Works from most servers. One voice per accent (India / US / UK / Australia)."}
        {provider === "edge" && "Free neural voices (male & female), no key. If Microsoft blocks your server, Google is used with the same accent — the test result says so."}
        {engine && `${engine.hint} The key is stored on the server and never shown again.`}
      </p>
      {engine && (() => {
        const keySaved = !!settings?.[`${engine.keyField}Set`];
        return (
          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-400" />
              <input type="password" autoComplete="off" className="input h-9 w-72"
                placeholder={keySaved ? "•••••••• (saved — leave blank to keep)" : `Paste ${engine.label} API key${engine.keyOptional ? " (if it needs one)" : ""}`}
                value={newKeys[engine.keyField] || ""} onChange={(e) => setNewKeys((k) => ({ ...k, [engine.keyField]: e.target.value }))} />
              {keySaved && (
                <button type="button" onClick={() => removeKey(engine.keyField)} className="text-xs text-rose-600 hover:underline">Remove saved key</button>
              )}
              {engine.keyUrl && (
                <a href={engine.keyUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">Get a key ↗</a>
              )}
            </div>
            {engine.fields.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {engine.fields.map((f) => (
                  <input key={f.name} type="text" className={`input h-9 ${f.wide ? "w-80" : "w-60"}`} placeholder={f.placeholder}
                    value={engineFields[f.name] || ""} onChange={(e) => setEngineFields((v) => ({ ...v, [f.name]: e.target.value }))} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Voice + captions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium"><Volume2 className="h-4 w-4 text-slate-400" /> Voice</span>
        <select className="input h-9 w-64" value={voices.some((v) => v.id === voiceValue) ? voiceValue : ""} onChange={(e) => setVoice(e.target.value)}>
          {FREE_FORM_VOICE.has(provider) && !voices.some((v) => v.id === voiceValue) && <option value="">Custom voice (typed →)</option>}
          {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {FREE_FORM_VOICE.has(provider) && (
          <input type="text" className="input h-9 w-60" placeholder={provider === "elevenlabs" ? "…or paste a voice ID" : "…or type a voice name"}
            value={voices.some((v) => v.id === voiceValue) ? "" : voiceValue} onChange={(e) => setVoice(e.target.value)} />
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
        Auto captions <span className="text-slate-400">(show the spoken words at the bottom of each slide)</span>
      </label>

      {/* What the narrator reads aloud */}
      <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-medium"><Volume2 className="h-4 w-4 text-slate-400" /> Read aloud</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(withAnswer ? [1, 2] : [1]).map((slide) => (
          <div key={slide} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {slide === 1 ? "Slide 1 — question" : "Slide 2 — answer"}
            </p>
            {slide === 2 && (
              <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-400">
                <input type="checkbox" className="h-4 w-4" checked disabled /> Correct answer <span className="text-xs">(always read)</span>
              </label>
            )}
            {READ_TOGGLES.filter((t) => t.slide === slide).map((t) => (
              <label key={t.key} className="mb-1.5 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={readOpts[t.key]}
                  onChange={(e) => setReadOpts((r) => ({ ...r, [t.key]: e.target.checked }))} />
                {t.label} <span className="text-xs text-slate-400">({t.hint})</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        Each ticked part is read in full. A slide stays on screen until its narration finishes, so reading
        more makes the video longer than the slide times above.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={createSchedule} disabled={creating} className="btn-primary">
          {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><Plus className="h-4 w-4" /> Create slideshow schedule</>}
        </button>
        <button type="button" onClick={save} disabled={saving} className="btn-outline">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save settings only</>}
        </button>
        <button type="button" onClick={test} disabled={testing} className="btn-outline">
          {testing ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating… <span className="tabular-nums">{eta?.percent ?? 0}%</span></> : <><PlayCircle className="h-4 w-4" /> Generate test slideshow</>}
        </button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
      {createMsg && <p className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${createMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>{createMsg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {createMsg.text}</p>}
      <p className="mt-1.5 text-xs text-slate-400">The test uses a question from the picked content (or a random one) and only builds a preview — it never publishes.</p>
      {testing && (
        <div className="mt-2 max-w-md">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold tabular-nums text-brand-600">{eta?.percent ?? 0}% done</span>
            <span className="font-medium tabular-nums text-slate-600 dark:text-slate-300">
              {eta && eta.remainingSec > 0 ? `about ${fmtDuration(eta.remainingSec)} left` : "Almost done…"}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={eta?.percent ?? 0}>
            <div className="h-full rounded-full bg-brand-600 transition-all duration-700 ease-linear" style={{ width: `${eta?.percent ?? 0}%` }} />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 tabular-nums"><Clock className="h-3 w-3" /> {fmtDuration(elapsedSec)} elapsed</span>
            <span>·</span>
            <span>
              {{ GENERATING_SLIDES: "Step 1/3 — creating the slides", GENERATING_AUDIO: "Step 2/3 — generating the narration", RENDERING_VIDEO: "Step 3/3 — rendering the 9:16 video" }[stage] || "Starting"}
              {progress?.total > 0 ? ` (${progress.done}/${progress.total})…` : "…"}
            </span>
          </p>
        </div>
      )}
      {testError && <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600"><AlertTriangle className="h-4 w-4" /> {testError}{tookSec != null && ` (after ${fmtDuration(tookSec)})`}</p>}
      {result?.videoUrl && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <video src={result.videoUrl} controls playsInline className="mx-auto max-h-[420px] rounded-lg bg-black" />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1"><Film className="h-3 w-3" /> {result.questions > 1 ? `${result.questions} questions · ` : ""}{result.slides} slides</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {result.duration}s</span>
            <span className="inline-flex items-center gap-1"><Volume2 className="h-3 w-3" /> {result.voice}</span>
            {tookSec != null && <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Generated in {fmtDuration(tookSec)}</span>}
            <a href={result.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline"><PlayCircle className="h-3 w-3" /> Open video</a>
          </div>
          {result.ttsNote && (
            <p className="mt-2 flex items-start gap-1 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> <span><b>Voice:</b> {result.ttsNote}</span>
            </p>
          )}
          {Array.isArray(result.fallbackSlides) && result.fallbackSlides.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />
                {result.fallbackSlides.length} slide{result.fallbackSlides.length > 1 ? "s" : ""} used the basic design instead of the student view:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.fallbackSlides.map((f) => (
                  <li key={f.slide}><b>Slide {f.slide}</b> ({f.tag || f.role}) — {f.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
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
  // Instagram-only comments (links aren't tappable there) + the "link in bio" CTA.
  const seedIgList = (s) => (Array.isArray(s?.igAutoComments) ? s.igAutoComments : []);
  const [igComments, setIgComments] = useState(seedIgList(settings));
  const [linkInBio, setLinkInBio] = useState(typeof settings?.linkInBioText === "string" ? settings.linkInBioText : "🔗 Link in bio");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setEnabled(settings?.fbAutoCommentEnabled === true);
    setComments(seedList(settings));
    setMode(settings?.fbAutoCommentMode || "rotate");
    setToFb(settings?.fbAutoCommentToFacebook !== false);
    setToIg(settings?.fbAutoCommentToInstagram === true);
    setMentions(seedMentions(settings));
    setIgComments(seedIgList(settings));
    setLinkInBio(typeof settings?.linkInBioText === "string" ? settings.linkInBioText : "🔗 Link in bio");
  }, [settings?.fbAutoCommentEnabled, settings?.fbAutoComment, settings?.fbAutoComments, settings?.fbAutoCommentMode, settings?.fbAutoCommentToFacebook, settings?.fbAutoCommentToInstagram, settings?.fbAutoCommentMentions, settings?.igAutoComments, settings?.linkInBioText]);

  const setComment = (i, v) => setComments((cs) => cs.map((c, idx) => (idx === i ? v : c)));
  const addComment = () => setComments((cs) => [...cs, ""]);
  const removeComment = (i) => setComments((cs) => cs.filter((_, idx) => idx !== i));
  const setIgComment = (i, v) => setIgComments((cs) => cs.map((c, idx) => (idx === i ? v : c)));
  const addIgComment = () => setIgComments((cs) => [...cs, ""]);
  const removeIgComment = (i) => setIgComments((cs) => cs.filter((_, idx) => idx !== i));

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
        igAutoComments: igComments.map((c) => String(c || "").trim()).filter(Boolean),
        linkInBioText: String(linkInBio || "").trim(),
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

        {/* Instagram-only wording: links are never tappable on Instagram */}
        <div className="rounded-lg border border-pink-200 bg-pink-50/50 p-3 dark:border-pink-900/50 dark:bg-pink-950/20">
          <label className="mb-1 flex items-center gap-2 text-sm font-medium"><Instagram className="h-4 w-4 text-[#E1306C]" /> Instagram comments (optional)</label>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Instagram <b>never makes links tappable</b> in captions, Reels or comments (and YouTube Shorts comments don't either).
            Write Instagram-specific comments here — e.g. <i>"👉 Practice free quizzes — 🔗 link in bio"</i>. Leave empty to reuse the list
            above: its links are shortened to a plain domain (<i>mystudyguide.in</i>) and the text below is added.
            Comments that are only <b>@everyone / @followers</b> are skipped on Instagram.
          </p>
          <div className="space-y-2">
            {igComments.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <textarea className="input min-h-[42px] flex-1 resize-y" rows={1} maxLength={2000} value={c}
                  onChange={(e) => setIgComment(i, e.target.value)}
                  placeholder="e.g. 👉 Daily quizzes & mock tests — 🔗 link in bio" />
                <button type="button" onClick={() => removeIgComment(i)} title="Remove" className="mt-1 rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={addIgComment} className="btn-outline"><Plus className="h-4 w-4" /> Add Instagram comment</button>
          </div>
          <label className="mb-1 mt-3 block text-sm font-medium">"Link in bio" text</label>
          <input className="input" maxLength={100} value={linkInBio} onChange={(e) => setLinkInBio(e.target.value)} placeholder="🔗 Link in bio" />
          <p className="mt-1 text-xs text-slate-400">Added to Instagram captions/comments whose link was shortened, and to the full-video comment on Instagram Reels. Leave blank to add nothing. Make sure your Instagram bio has your website link.</p>
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

// Where a long-video schedule posts — read from its saved options so the list
// shows every destination (the row used to show only "YouTube").
function longVideoTargets(s) {
  const o = s?.longVideo?.options || {};
  const out = [];
  if (o.toYoutube !== false) out.push({ key: "yt", label: "YouTube long", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", Icon: Youtube });
  if (o.toYoutube !== false && o.asShort) out.push({ key: "short", label: "YouTube Short", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", Icon: Youtube });
  if (o.toFacebook) out.push({ key: "fb", label: "Facebook video", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", Icon: Facebook });
  if (o.asShort && o.shortToFacebook) out.push({ key: "fbreel", label: "Facebook Reel", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", Icon: Facebook });
  if (o.asShort && o.shortToInstagram) out.push({ key: "igreel", label: "Instagram Reel", cls: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300", Icon: Instagram });
  if (o.toTelegram) out.push({ key: "tg", label: "Telegram", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300", Icon: Send });
  return out;
}

// Edit a long-video schedule: name, times, days, destinations, video title,
// privacy and hashtags. Everything else (questions, voice, slides, progress —
// which part / question comes next) is kept exactly as saved.
function LongVideoScheduleEditModal({ schedule, onClose, onSaved }) {
  const lv = schedule?.longVideo || {};
  const o0 = lv.options || {};
  const [title, setTitle] = useState(schedule?.title || "");
  const [times, setTimes] = useState(Array.isArray(schedule?.times) && schedule.times.length ? schedule.times : ["09:00"]);
  const [days, setDays] = useState(Array.isArray(schedule?.days) ? schedule.days : []);
  const [videoTitle, setVideoTitle] = useState(lv.title || "");
  const [privacy, setPrivacy] = useState(lv.privacy || "public");
  const [hashtags, setHashtags] = useState(schedule?.hashtags || "");
  // Saved playlist: "" = the default long-video playlist, "__none__" = none,
  // or { id, title }. Only the long video goes in it — the Short gets no playlist.
  const [playlist, setPlaylist] = useState(
    lv.playlist === "__none__" ? { id: "__none__", title: "" }
      : lv.playlist && typeof lv.playlist === "object" && lv.playlist.id ? { id: lv.playlist.id, title: lv.playlist.title || "" }
        : { id: "", title: "" });
  const [opt, setOpt] = useState({
    toYoutube: o0.toYoutube !== false, asShort: !!o0.asShort, toFacebook: !!o0.toFacebook,
    shortToFacebook: !!o0.shortToFacebook, shortToInstagram: !!o0.shortToInstagram,
    toTelegram: !!o0.toTelegram, linkComment: o0.linkComment !== false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const flip = (k) => setOpt((o) => ({ ...o, [k]: !o[k] }));

  const save = async () => {
    const cleanTimes = times.map((t) => String(t || "").trim()).filter(Boolean);
    if (!cleanTimes.length) { setErr("Add at least one time."); return; }
    if (!opt.toYoutube && !opt.toFacebook) { setErr("Choose YouTube and/or Facebook for the long video."); return; }
    setBusy(true); setErr("");
    try {
      await facebookService.update(schedule._id, {
        ...schedule,
        title: title.trim(), times: cleanTimes, days, hashtags: hashtags.trim(),
        longVideo: {
          ...lv, title: videoTitle.trim(), privacy,
          playlist: playlist.id === "__none__" ? "__none__" : playlist.id ? { id: playlist.id, title: playlist.title } : "",
          options: {
            ...o0, ...opt,
            // A Reel is made from the Short, so it needs the Short (and YouTube) on.
            asShort: opt.toYoutube && opt.asShort,
            shortToFacebook: opt.toYoutube && opt.asShort && opt.shortToFacebook,
            shortToInstagram: opt.toYoutube && opt.asShort && opt.shortToInstagram,
          },
        },
      });
      onSaved?.();
    } catch (e) { setErr(e.message || "Could not save."); } finally { setBusy(false); }
  };

  const box = (k, label, disabled = false) => (
    <label className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!opt[k] && !disabled} disabled={disabled || busy} onChange={() => flip(k)} />
      {label}
    </label>
  );
  const shortOff = !opt.toYoutube || !opt.asShort;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Pencil className="h-5 w-5 text-brand-600" /> Edit long-video schedule</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{schedule?.source?.label || ""} — the questions, voice, slides and progress (which video comes next) stay as they are.</p>

        <label className="mb-1 block text-sm font-medium">Schedule name</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={schedule?.source?.label || "Long video schedule"} />

        <label className="mb-1 mt-3 block text-sm font-medium">Times (Asia/Kolkata)</label>
        <div className="space-y-2">
          {times.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="time" className="input" value={t} onChange={(e) => setTimes((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))} />
              {times.length > 1 && <button type="button" onClick={() => setTimes((ts) => ts.filter((_, j) => j !== i))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30" title="Remove"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => setTimes((ts) => [...ts, "09:00"])} className="btn-outline !py-1 !text-xs"><Plus className="h-3.5 w-3.5" /> Add time</button>
        </div>

        <label className="mb-1 mt-3 block text-sm font-medium">Days <span className="font-normal text-slate-400">(none ticked = every day)</span></label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((w) => (
            <button key={w.v} type="button" onClick={() => setDays((d) => (d.includes(w.v) ? d.filter((x) => x !== w.v) : [...d, w.v]))}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${days.includes(w.v) ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{w.l}</button>
          ))}
        </div>

        <p className="mb-1 mt-3 text-sm font-medium">Post to</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {box("toYoutube", "YouTube (long video)")}
          {box("asShort", "YouTube Short", !opt.toYoutube)}
          {box("toFacebook", "Facebook (long video)")}
          {box("shortToFacebook", "Facebook Reel (from the Short)", shortOff)}
          {box("shortToInstagram", "Instagram Reel (from the Short)", shortOff)}
          {box("toTelegram", "Telegram (link)")}
        </div>
        <div className="mt-2">{box("linkComment", "Comment the full video under the Short & Reels")}</div>
        {shortOff && <p className="mt-1 text-xs text-slate-400">Reels are made from the Short — turn on YouTube Short to post Reels.</p>}

        <label className="mb-1 mt-3 block text-sm font-medium">Video title <span className="font-normal text-slate-400">(blank = the default)</span></label>
        <input className="input" value={videoTitle} maxLength={100} onChange={(e) => setVideoTitle(e.target.value)} />

        {opt.toYoutube && (
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium">YouTube playlist <span className="font-normal text-slate-400">(long video only — the Short is not added)</span></label>
            <YtPlaylistPicker value={playlist.id} disabled={busy} noneOption
              emptyLabel="Default long-video playlist (YouTube settings)"
              onChange={(id, t) => setPlaylist({ id, title: t })} />
            <p className="mt-1 text-xs text-slate-400">Pick a playlist, or choose <b>+ New playlist…</b> to create one on your channel.</p>
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">YouTube privacy</label>
            <select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Hashtags</label>
            <input className="input" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#JKSSB #Quiz" />
          </div>
        </div>

        {err && <p className="mt-3 flex items-center gap-1 text-sm text-rose-600"><AlertTriangle className="h-4 w-4" /> {err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline" disabled={busy}>Cancel</button>
          <button type="button" onClick={save} className="btn-primary" disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Does this schedule produce a VIDEO each run? (YouTube only accepts videos.)
function scheduleHasVideo(f) {
  if (f.kind === "slideshow" || f.asSlideshow) return true;
  if (f.kind === "custom") return !!String(f.customVideo || "").trim();
  return !!f.asReel;
}

// The channel's playlists, loaded once and shared by every picker on the page.
let ytPlaylistCache = null; // Promise<{ playlists, canCreate }>
let ytPlaylistCacheFor = ""; // the account (main / cross-posting user) the cache belongs to
const loadYtPlaylists = (force = false) => {
  if (ytPlaylistCacheFor !== getActiveSocialProfile()) { ytPlaylistCache = null; ytPlaylistCacheFor = getActiveSocialProfile(); }
  if (force || !ytPlaylistCache) {
    ytPlaylistCache = youtubeService.playlists().catch((e) => { ytPlaylistCache = null; throw e; });
  }
  return ytPlaylistCache;
};

// Pick a YouTube playlist ("folder"), or create a new one inline.
//   value     — the chosen playlist id; "" and "__none__" are special choices
//   onChange  — (id, title) => void
//   emptyLabel — what "" means here (e.g. "No playlist" or "Default (GK Shorts)")
//   noneOption — also offer "__none__" = "No playlist" (when "" means the default)
function YtPlaylistPicker({ value = "", onChange, emptyLabel = "No playlist", noneOption = false, disabled = false }) {
  const [list, setList] = useState(null);
  const [canCreate, setCanCreate] = useState(true);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (force) => loadYtPlaylists(force)
    .then((r) => { setList(r?.playlists || []); setCanCreate(r?.canCreate !== false); setErr(""); })
    .catch((e) => { setList([]); setErr(e.message || "Could not load playlists."); });
  useEffect(() => { load(false); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try {
      const { playlist } = await youtubeService.createPlaylist({ title: name.trim() });
      await load(true);
      onChange(playlist.id, playlist.title);
      setAdding(false); setName("");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  // A saved playlist that isn't in the list (deleted on YouTube, or not loaded yet) stays selectable.
  const known = !value || value === "__none__" || (list || []).some((p) => p.id === value);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <select className="input min-w-0 flex-1" value={value} disabled={disabled || list === null}
          onChange={(e) => {
            if (e.target.value === "__new__") { setAdding(true); return; }
            const p = (list || []).find((x) => x.id === e.target.value);
            onChange(e.target.value, p?.title || "");
          }}>
          <option value="">{list === null ? "Loading playlists…" : emptyLabel}</option>
          {noneOption && <option value="__none__">No playlist</option>}
          {!known && <option value={value}>Saved playlist (not found on the channel)</option>}
          {(list || []).map((p) => <option key={p.id} value={p.id}>{p.title} ({p.count} video{p.count === 1 ? "" : "s"}{p.privacy && p.privacy !== "public" ? ` · ${p.privacy}` : ""})</option>)}
          <option value="__new__">+ New playlist…</option>
        </select>
        <button type="button" onClick={() => load(true)} disabled={disabled} title="Reload playlists" className="btn-outline !px-2.5"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {adding && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1" maxLength={150} value={name} autoFocus onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }} placeholder="New playlist name, e.g. Indian Polity Quiz" />
          <button type="button" onClick={create} disabled={busy || !name.trim()} className="btn-primary !bg-[#FF0000] hover:!bg-[#d90000]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
          </button>
          <button type="button" onClick={() => { setAdding(false); setName(""); }} className="btn-outline"><X className="h-4 w-4" /></button>
        </div>
      )}
      {!canCreate && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">To add videos to playlists, click <b>Reconnect YouTube</b> in the YouTube Shorts card once and allow the new permission.</p>}
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

// Thumbnail TEMPLATE for long videos: upload a 1280×720 background; the
// subject / topic / "25 Questions" are written on it and it becomes each long
// video's thumbnail. Preview renders the real thing on the server.
function YtThumbnailTemplateEditor({ st, onSaved }) {
  const t = st?.thumb || {};
  const DEF_BOX = { x: 0.05, y: 0.12, w: 0.56, h: 0.76 };
  const fileRef = useRef(null);
  const frameRef = useRef(null);
  const [draft, setDraft] = useState(() => ({
    thumbTemplateUrl: t.templateUrl || "", thumbEnabled: t.enabled !== false, thumbShowText: t.showText !== false,
    thumbBox: t.box || DEF_BOX, thumbAlign: t.align || "left", thumbVAlign: t.vAlign || "center",
    thumbFont: t.font || "sans", thumbUppercase: !!t.uppercase,
    thumbTextColor: t.textColor || "#ffffff", thumbKickerColor: t.kickerColor || "",
    thumbAccentColor: t.accentColor || "#facc15", thumbBadgeTextColor: t.badgeTextColor || "#111111",
    thumbStrokeColor: t.strokeColor || "#000000", thumbStrokeWidth: t.strokeWidth ?? 3, thumbShadow: t.shadow !== false,
    thumbPanelColor: t.panelColor || "", thumbPanelOpacity: t.panelOpacity ?? 0, thumbPanelRadius: t.panelRadius ?? 24,
    thumbHeadlineSize: t.headlineSize ?? 104, thumbKickerSize: t.kickerSize ?? 44, thumbBadgeSize: t.badgeSize ?? 46, thumbLineHeight: t.lineHeight ?? 1.05,
    thumbRotate: Number(t.rotate) || 0, // was missing → the Rotate row showed "NaN°"
  }));
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState("");
  const [msg, setMsg] = useState(null);
  const [showStyle, setShowStyle] = useState(false);
  const timer = useRef(null);

  const persist = async (patch, okText = "Saved.") => {
    try { onSaved(await youtubeService.save(patch)); setMsg({ ok: true, text: okText }); }
    catch (e) { setMsg({ ok: false, text: e.message || "Could not save." }); }
  };
  // Change a field; save right away (or debounced for colours / the drag box).
  const set = (k, v, { later = false } = {}) => {
    setDraft((d) => ({ ...d, [k]: v })); setPreview("");
    clearTimeout(timer.current);
    if (later) timer.current = setTimeout(() => persist({ [k]: v }), 600);
    else persist({ [k]: v });
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // LIVE preview: after any change, render the REAL thumbnail on the server
  // (debounced) so the box shows your actual fonts, colours, sizes, shade and
  // rotation — not a rough approximation. Skipped while dragging the box.
  const autoTimer = useRef(null);
  const previewReq = useRef(0);
  const [autoBusy, setAutoBusy] = useState(false);
  const refreshPreview = async () => {
    if (!draft.thumbTemplateUrl || !draft.thumbShowText) return;
    const id = ++previewReq.current;
    setAutoBusy(true);
    try { const r = await youtubeService.thumbnailPreview(draft); if (id === previewReq.current) setPreview(r?.image || ""); }
    catch { /* keep the editing view on error */ }
    finally { if (id === previewReq.current) setAutoBusy(false); }
  };
  useEffect(() => {
    if (!draft.thumbTemplateUrl || !draft.thumbShowText) return undefined;
    clearTimeout(autoTimer.current);
    // Debounced: while dragging, each move resets this timer, so it only fires
    // once the box settles. A drag release also triggers a refresh explicitly.
    autoTimer.current = setTimeout(refreshPreview, 800);
    return () => clearTimeout(autoTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(draft)]);
  // Only show the rendered preview while text is on and a template is set.
  const showExact = !!preview && draft.thumbShowText && !!draft.thumbTemplateUrl;

  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setMsg({ ok: false, text: "Choose a JPG, PNG or WebP image." }); return; }
    setUploading(true); setMsg(null);
    try {
      const r = await uploadService.imageDirect(file);
      if (!r?.url) throw new Error("Upload failed.");
      setDraft((d) => ({ ...d, thumbTemplateUrl: r.url, thumbEnabled: true })); setPreview("");
      await persist({ thumbTemplateUrl: r.url, thumbEnabled: true }, "Template saved — every long video will use it.");
    } catch (err) { setMsg({ ok: false, text: err.message || "Upload failed." }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const remove = () => {
    if (!window.confirm("Remove the thumbnail template? Long videos will get an automatic frame instead.")) return;
    set("thumbTemplateUrl", "");
  };

  // Drag to move / resize the text box over the template. Pointer coords →
  // fractions of the frame; saved (debounced) when the drag settles.
  const box = draft.thumbBox || DEF_BOX;
  const dragRef = useRef(null);
  const onPointerDown = (mode) => (e) => {
    e.preventDefault();
    const frame = frameRef.current; if (!frame) return; // eslint-disable-line react-hooks/refs
    const rect = frame.getBoundingClientRect();
    dragRef.current = { mode, rect, startX: e.clientX, startY: e.clientY, box: { ...box } }; // eslint-disable-line react-hooks/refs
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current; if (!d) return;
    if (d.mode === "rotate") {
      // Angle from the box centre to the pointer (0° = handle straight up).
      const cx = d.rect.left + (d.box.x + d.box.w / 2) * d.rect.width;
      const cy = d.rect.top + (d.box.y + d.box.h / 2) * d.rect.height;
      let deg = Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90);
      if (deg > 180) deg -= 360; if (deg < -180) deg += 360;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15; // hold Shift to snap to 15°
      setDraft((dd) => ({ ...dd, thumbRotate: deg })); setPreview("");
      return;
    }
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    let { x, y, w, h } = d.box;
    if (d.mode === "move") { x = Math.max(0, Math.min(1 - w, x + dx)); y = Math.max(0, Math.min(1 - h, y + dy)); }
    else { w = Math.max(0.12, Math.min(1 - x, w + dx)); h = Math.max(0.12, Math.min(1 - y, h + dy)); }
    setDraft((dd) => ({ ...dd, thumbBox: { x, y, w, h } })); setPreview("");
  };
  const onPointerUp = () => {
    const d = dragRef.current; if (!d) return;
    dragRef.current = null;
    clearTimeout(timer.current);
    const patch = d.mode === "rotate" ? { thumbRotate: draft.thumbRotate || 0 } : { thumbBox: draft.thumbBox || DEF_BOX };
    timer.current = setTimeout(() => persist(patch), 200);
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(refreshPreview, 300);
  };
  const rot = draft.thumbRotate || 0;

  const colorInput = (label, key, fallback) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        {key === "thumbKickerColor" || key === "thumbPanelColor" ? (
          <button type="button" onClick={() => set(key, "")} title="Clear" className="text-xs text-slate-400 hover:text-rose-600">clear</button>
        ) : null}
        <input type="color" value={draft[key] || fallback} onChange={(e) => set(key, e.target.value, { later: true })}
          className="h-8 w-10 cursor-pointer rounded border border-slate-200 dark:border-slate-700" />
      </span>
    </label>
  );

  // A labelled slider with − / + buttons for fine control. `fmt` formats the
  // shown value; `round` keeps decimals (e.g. line spacing) tidy.
  const stepRow = (label, key, lo, hi, step = 1, { fmt, round = 0, icon = null, extra = null } = {}) => {
    const cur = Number(draft[key]);
    const clampV = (v) => Math.max(lo, Math.min(hi, round ? Number(v.toFixed(round)) : Math.round(v)));
    const nudge = (d) => set(key, clampV(cur + d * step), { later: true });
    return (
      <label className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={() => nudge(-1)} className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">−</button>
          <input type="range" min={lo} max={hi} step={step} value={cur} onChange={(e) => set(key, Number(e.target.value), { later: true })} className="w-24 accent-[#FF0000]" />
          <button type="button" onClick={() => nudge(1)} className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">+</button>
          <span className="w-9 text-right text-xs text-slate-400">{fmt ? fmt(cur) : cur}</span>
          {extra}
        </span>
      </label>
    );
  };

  // Sample text drawn in the box, styled to APPROXIMATE the server output, so
  // dragging/styling gives instant feedback (the Preview button is exact).
  const sampleStyle = {
    color: draft.thumbTextColor,
    WebkitTextStroke: draft.thumbStrokeWidth > 0 ? `${Math.max(1, draft.thumbStrokeWidth / 3)}px ${draft.thumbStrokeColor}` : undefined,
    textShadow: draft.thumbShadow ? "0 2px 6px rgba(0,0,0,.8)" : undefined,
    textTransform: draft.thumbUppercase ? "uppercase" : undefined,
    fontFamily: PREVIEW_FONT[draft.thumbFont] || "inherit",
    textAlign: draft.thumbAlign,
    alignItems: draft.thumbAlign === "center" ? "center" : draft.thumbAlign === "right" ? "flex-end" : "flex-start",
    justifyContent: draft.thumbVAlign === "top" ? "flex-start" : draft.thumbVAlign === "bottom" ? "flex-end" : "center",
  };
  const panelBg = draft.thumbPanelColor && draft.thumbPanelOpacity > 0
    ? { background: hexToRgba(draft.thumbPanelColor, draft.thumbPanelOpacity / 100), borderRadius: draft.thumbPanelRadius / 3, padding: "4px 8px" }
    : {};

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Thumbnail template</p>
        {draft.thumbTemplateUrl && (
          <label className="flex items-center gap-2 text-sm font-medium">
            Use for long videos
            <button type="button" onClick={() => set("thumbEnabled", !draft.thumbEnabled)} aria-label="Use for long videos"
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${draft.thumbEnabled ? "bg-[#FF0000]" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${draft.thumbEnabled ? "left-6" : "left-1"}`} />
            </button>
          </label>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        <b>Upload once</b> — your branded <b>1280×720</b> background with an <b>empty area</b> for text. Then <b>drag the box</b> onto that area: every long video fills it with its own <b>subject</b>, <b>topic</b> and <b>quiz</b>. Needs a verified YouTube channel (youtube.com/verify).
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        {/* Template with the draggable text box */}
        <div className="flex flex-col items-center gap-2">
          {draft.thumbTemplateUrl ? (
            <div ref={frameRef} className="relative aspect-video w-80 select-none overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
              onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
              <img src={showExact ? preview : draft.thumbTemplateUrl} alt="Thumbnail template" className="pointer-events-none absolute inset-0 h-full w-full object-cover" draggable={false} />
              {draft.thumbShowText && (
                <div
                  className="absolute rounded border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
                  style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, transform: `rotate(${rot}deg)`, transformOrigin: "center center" }}>
                  {/* Full-box move layer (drag anywhere in the box) */}
                  <div onPointerDown={onPointerDown("move")} className="absolute inset-0 touch-none cursor-move" />
                  {/* Rough sample text — only until the exact preview renders */}
                  {!showExact && (
                    <div className="pointer-events-none flex h-full w-full flex-col gap-0.5 overflow-hidden p-1 text-[7px] font-black leading-tight" style={sampleStyle}>
                      <div style={panelBg}>
                        <div style={{ color: draft.thumbKickerColor || draft.thumbTextColor, fontSize: `${(draft.thumbKickerSize / 44) * 6}px` }}>Subject Name</div>
                        <div style={{ fontSize: `${(draft.thumbHeadlineSize / 104) * 13}px`, lineHeight: draft.thumbLineHeight }}>Topic Name</div>
                        <div style={{ display: "inline-block", background: draft.thumbAccentColor, color: draft.thumbBadgeTextColor, borderRadius: 3, padding: "0 4px", fontSize: `${(draft.thumbBadgeSize / 46) * 8}px`, marginTop: 2 }}>Quiz 1</div>
                      </div>
                    </div>
                  )}
                  {/* Move handle (centre) */}
                  <span onPointerDown={onPointerDown("move")} title="Drag to move" className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none cursor-move items-center justify-center rounded-full border-2 border-white bg-black/45 text-white"><Move className="h-3.5 w-3.5" /></span>
                  {/* Resize handle (bottom-right) */}
                  <span onPointerDown={onPointerDown("resize")} title="Drag to resize" className="absolute -bottom-1.5 -right-1.5 h-4 w-4 touch-none cursor-se-resize rounded-full border-2 border-white bg-[#FF0000]" />
                  {/* Rotate handle (top-centre) */}
                  <span onPointerDown={onPointerDown("rotate")} title="Drag to rotate (hold Shift to snap)" className="absolute -top-6 left-1/2 flex h-5 w-5 -translate-x-1/2 touch-none cursor-grab items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white"><RotateCw className="h-3 w-3" /></span>
                  <span className="absolute -top-1.5 left-1/2 h-4 w-0.5 -translate-x-1/2 bg-white/80" />
                </div>
              )}
              {autoBusy && <span className="absolute right-1 top-1 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">updating…</span>}
              <button type="button" onClick={remove} title="Remove" className="absolute -right-2 -top-2 z-10 rounded-full bg-rose-100 p-1.5 text-rose-600 shadow hover:bg-rose-200 dark:bg-rose-900/40"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="flex aspect-video w-80 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-300 dark:border-slate-600"><ImagePlus className="h-8 w-8" /></div>
          )}
          <div className="flex items-center gap-2">
            <label className={`btn-outline cursor-pointer text-sm ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> {draft.thumbTemplateUrl ? "Replace" : "Upload template"}</>}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload} disabled={uploading} />
            </label>
            {draft.thumbTemplateUrl && (
              <button type="button" onClick={refreshPreview} disabled={autoBusy} className="btn-outline text-sm">
                {autoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh preview
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400"><b>Live preview</b> — updates with your real fonts, colours, sizes &amp; rotation a moment after each change. Drag the box to move, the red corner to resize, the blue knob to rotate.</p>
        </div>

        {/* Controls */}
        {draft.thumbTemplateUrl && (
          <div className="min-w-[240px] flex-1 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={draft.thumbShowText} onChange={(e) => set("thumbShowText", e.target.checked)} />
              Write the subject, topic &amp; quiz on it
            </label>
            {draft.thumbShowText && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Align</label>
                    <div className="flex gap-1">
                      {[["left", "L"], ["center", "C"], ["right", "R"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => set("thumbAlign", v)}
                          className={`h-8 flex-1 rounded border text-xs font-bold ${draft.thumbAlign === v ? "border-[#FF0000] bg-red-50 text-[#FF0000] dark:bg-red-900/20" : "border-slate-200 dark:border-slate-700"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Font</label>
                    <select className="input h-8 py-0 text-sm" value={draft.thumbFont} onChange={(e) => set("thumbFont", e.target.value)}>
                      <option value="sans">Sans (bold)</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Mono</option>
                      <option value="anton">Anton (heavy)</option>
                      <option value="bebas">Bebas Neue (condensed)</option>
                      <option value="oswald">Oswald (condensed)</option>
                      <option value="poppins">Poppins (rounded)</option>
                      <option value="montserrat">Montserrat (modern)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {colorInput("Text colour", "thumbTextColor", "#ffffff")}
                  {colorInput("Subject colour", "thumbKickerColor", "#ffffff")}
                  {colorInput("Quiz badge", "thumbAccentColor", "#facc15")}
                  {colorInput("Badge text", "thumbBadgeTextColor", "#111111")}
                </div>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500">Text size &amp; spacing</p>
                  {stepRow("Topic size", "thumbHeadlineSize", 24, 200, 2)}
                  {stepRow("Subject size", "thumbKickerSize", 12, 120, 2)}
                  {stepRow("Quiz badge size", "thumbBadgeSize", 12, 120, 2)}
                  {stepRow("Line spacing", "thumbLineHeight", 0.8, 2, 0.05, { round: 2, fmt: (v) => v.toFixed(2) })}
                  {stepRow("Rotate", "thumbRotate", -180, 180, 1, {
                    icon: <RotateCw className="h-3.5 w-3.5 text-slate-400" />, fmt: (v) => `${v}°`,
                    extra: rot !== 0 ? <button type="button" onClick={() => set("thumbRotate", 0)} className="text-xs text-brand-600 hover:underline">reset</button> : null,
                  })}
                  <p className="text-[11px] text-slate-400">Use − / + or drag the sliders. Drag the box to move, the red corner to resize (zoom), the blue knob on top to rotate. The topic shrinks automatically only if it doesn't fit the box.</p>
                </div>
                <button type="button" onClick={() => setShowStyle((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                  <ChevronDown className={`h-4 w-4 transition ${showStyle ? "rotate-180" : ""}`} /> Outline, shadow &amp; shade
                </button>
                {showStyle && (
                  <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {colorInput("Outline colour", "thumbStrokeColor", "#000000")}
                      {stepRow("Outline", "thumbStrokeWidth", 0, 12, 1)}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={draft.thumbShadow} onChange={(e) => set("thumbShadow", e.target.checked)} /> Drop shadow
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={draft.thumbUppercase} onChange={(e) => set("thumbUppercase", e.target.checked)} /> UPPERCASE
                    </label>
                    <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                      <p className="mb-1 text-xs font-semibold text-slate-500">Shade behind text <span className="font-normal text-slate-400">(for busy backgrounds)</span></p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {colorInput("Shade colour", "thumbPanelColor", "#000000")}
                        {stepRow("Opacity", "thumbPanelOpacity", 0, 100, 5)}
                        {stepRow("Corners", "thumbPanelRadius", 0, 60, 2)}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <span className="block text-xs text-slate-400">Changes save automatically.</span>
            {msg && <p className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// Intro / end / Short-end SLIDE template with the same draggable text box +
// styling as the thumbnail. The video's text (subject/topic/"Let's begin", or
// the closing lines) fills the box. Config is saved as one object under
// `settingKey`; the background image under `templateKey`. Sample text is shown
// in the preview; each real video fills in its own.
function SlideTextEditor({ role, title, note, settingKey, templateKey, initial, onSaved, ttsEngine = "", ttsVoice = "" }) {
  // The Short's intro / end slides are VERTICAL (9:16, 1080×1920); the full video's are 16:9.
  const vertical = role === "shortintro" || role === "shortoutro";
  const isIntroRole = role === "intro" || role === "shortintro";
  const DEF_BOX = { x: 0.08, y: 0.3, w: 0.84, h: 0.4 };
  const t = initial || {};
  const fileRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const timer = useRef(null);
  const autoTimer = useRef(null);
  const previewReq = useRef(0);
  const [templateUrl, setTemplateUrl] = useState(t.templateUrl || "");
  const [draft, setDraft] = useState(() => ({
    useBox: t.useBox !== undefined ? !!t.useBox : isIntroRole,
    showText: t.showText !== false,
    showSubject: t.showSubject !== false, // intro slides: show (and say) the subject…
    showTopic: t.showTopic !== false,     // …and/or the topic
    box: t.box || DEF_BOX, align: t.align || "center", vAlign: t.vAlign || "center",
    font: t.font || "sans", uppercase: !!t.uppercase,
    headlineSize: t.headlineSize ?? 84, kickerSize: t.kickerSize ?? 44, badgeSize: t.badgeSize ?? 46,
    lineHeight: t.lineHeight ?? 1.1, rotate: t.rotate ?? 0,
    textColor: t.textColor || "#0f172a", kickerColor: t.kickerColor || "",
    accentColor: t.accentColor || "#2563eb", badgeTextColor: t.badgeTextColor || "#ffffff",
    strokeColor: t.strokeColor || "#000000", strokeWidth: t.strokeWidth ?? 0, shadow: t.shadow !== false,
    panelColor: t.panelColor || "", panelOpacity: t.panelOpacity ?? 0, panelRadius: t.panelRadius ?? 24,
    narration: t.narration || "", seconds: t.seconds ?? 0,
  }));
  // Intro sample text + default narration follow the Subject / Topic switches.
  const introHead = [draft.showSubject !== false && "Subject", draft.showTopic !== false && "Topic"].filter(Boolean).join(" — ") || "Quiz Time";
  const defaultNarration = {
    intro: `“${introHead === "Quiz Time" ? "" : `<${introHead}>. `}Let's begin the quiz.”`,
    shortintro: `“${introHead === "Quiz Time" ? "" : `<${introHead}>. `}Let's begin the quiz.”`,
    outro: "Thanks for watching! Subscribe, like and share for more.",
    shortoutro: "Thanks for watching! Subscribe, like and share for more. Watch the full quiz, visit the channel.",
  }[role];
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showStyle, setShowStyle] = useState(false);
  // "Preview voice": hear the line (with its pauses) in the form's engine + voice.
  const [say, setSay] = useState({ busy: false, url: "", info: "", error: "" });
  const previewVoice = async () => {
    setSay({ busy: true, url: "", info: "", error: "" });
    try {
      const r = await youtubeService.narrationPreview({ role, text: draft.narration || "", engine: ttsEngine, voice: ttsVoice });
      if (!r?.audio) throw new Error("No audio came back.");
      setSay({ busy: false, url: r.audio, info: [r.provider, r.voice, r.note].filter(Boolean).join(" · "), error: "" });
    } catch (e) { setSay({ busy: false, url: "", info: "", error: e?.message || "Could not make the voice preview." }); }
  };
  // "Narrator says": insert a pause mark at the cursor.
  const narrRef = useRef(null);
  const insertPause = (mark) => {
    const el = narrRef.current;
    const cur = String(draft.narration || "");
    const at = el && Number.isInteger(el.selectionStart) ? el.selectionStart : cur.length;
    const before = cur.slice(0, at).replace(/\s+$/, "");
    const after = cur.slice(at).replace(/^\s+/, "");
    const next = `${before}${before ? " " : ""}${mark}${after ? " " : ""}${after}`.slice(0, 400);
    set("narration", next, { later: true });
    requestAnimationFrame(() => { if (el) { const pos = Math.min(next.length, (before ? before.length + 1 : 0) + mark.length + 1); el.focus(); el.setSelectionRange(pos, pos); } });
  };

  const saveCfg = (patch) => { const next = { ...draft, ...patch }; return youtubeService.save({ [settingKey]: next }); };
  const persist = async (patch) => {
    try { onSaved?.(await saveCfg(patch)); setMsg({ ok: true, text: "Saved." }); }
    catch (e) { setMsg({ ok: false, text: e.message || "Could not save." }); }
  };
  const set = (k, v, { later = false } = {}) => {
    setDraft((d) => ({ ...d, [k]: v })); setPreview("");
    clearTimeout(timer.current);
    if (later) timer.current = setTimeout(() => persist({ [k]: v }), 600); else persist({ [k]: v });
  };
  // Hide / centred card / movable box — two saved fields, saved together.
  const setMode = (m) => {
    const patch = m === "hide" ? { showText: false } : { showText: true, useBox: m === "box" };
    setDraft((d) => ({ ...d, ...patch })); setPreview("");
    clearTimeout(timer.current);
    persist(patch);
  };
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(autoTimer.current); }, []);

  const refreshPreview = async () => {
    if (!templateUrl || !draft.showText || !draft.useBox) return;
    const id = ++previewReq.current; setAutoBusy(true);
    try { const r = await youtubeService.slideTextPreview({ role, config: draft, templateUrl }); if (id === previewReq.current) setPreview(r?.image || ""); }
    catch { /* keep editing view */ } finally { if (id === previewReq.current) setAutoBusy(false); }
  };
  // The text is drawn INSTANTLY in the browser (LiveTextBox) on every change —
  // size, colour, font, outline, shade, alignment, spacing, rotation. "Check
  // final render" asks the server for the exact image (shown until the next change).
  const showExact = !!preview && draft.showText && draft.useBox && !!templateUrl;
  const SLIDE_W = vertical ? 1080 : 1920, SLIDE_H = vertical ? 1920 : 1080;
  const frameW = useElementWidth(frameRef);
  const sampleLines = {
    intro: { headline: introHead, badge: "Let's begin!" },
    shortintro: { headline: introHead, badge: "Let's begin!" },
    outro: { headline: "Thanks for watching!", badge: "Subscribe · Like · Share for more" },
    shortoutro: { headline: "Thanks for watching!", badge: "Watch the full quiz — visit the channel" },
  }[role];

  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setMsg({ ok: false, text: "Choose a JPG, PNG or WebP image." }); return; }
    setUploading(true); setMsg(null);
    try {
      const r = await uploadService.imageDirect(file);
      if (!r?.url) throw new Error("Upload failed.");
      const first = !templateUrl && !isIntroRole; // end slides only — the intro keeps its text
      setTemplateUrl(r.url); setPreview("");
      if (first) {
        // A new template usually carries its own design — show it as is (text
        // hidden, narration kept). Pick a text option below to add text.
        setDraft((d) => ({ ...d, showText: false }));
        onSaved?.(await youtubeService.save({ [templateKey]: r.url, [settingKey]: { ...draft, showText: false } }));
        setMsg({ ok: true, text: "Template saved — text hidden, only your template is shown (the narrator still reads)." });
      } else {
        onSaved?.(await youtubeService.save({ [templateKey]: r.url }));
        setMsg({ ok: true, text: "Template saved." });
      }
    } catch (err) { setMsg({ ok: false, text: err.message || "Upload failed." }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeTpl = async () => {
    if (!window.confirm("Remove this slide template? The built-in design is used instead.")) return;
    setTemplateUrl(""); setPreview("");
    try { onSaved?.(await youtubeService.save({ [templateKey]: "" })); } catch { /* ignore */ }
  };

  const box = draft.box || DEF_BOX;
  const rot = draft.rotate || 0;
  const onPointerDown = (mode) => (e) => {
    e.preventDefault();
    const frame = frameRef.current; if (!frame) return; // eslint-disable-line react-hooks/refs
    const rect = frame.getBoundingClientRect();
    dragRef.current = { mode, rect, startX: e.clientX, startY: e.clientY, box: { ...box } }; // eslint-disable-line react-hooks/refs
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current; if (!d) return;
    if (d.mode === "rotate") {
      const cx = d.rect.left + (d.box.x + d.box.w / 2) * d.rect.width;
      const cy = d.rect.top + (d.box.y + d.box.h / 2) * d.rect.height;
      let deg = Math.round((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90);
      if (deg > 180) deg -= 360; if (deg < -180) deg += 360;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      setDraft((dd) => ({ ...dd, rotate: deg })); setPreview("");
      return;
    }
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    let { x, y, w, h } = d.box;
    if (d.mode === "move") { x = Math.max(0, Math.min(1 - w, x + dx)); y = Math.max(0, Math.min(1 - h, y + dy)); }
    else { w = Math.max(0.12, Math.min(1 - x, w + dx)); h = Math.max(0.12, Math.min(1 - y, h + dy)); }
    setDraft((dd) => ({ ...dd, box: { x, y, w, h } })); setPreview("");
  };
  const onPointerUp = () => {
    const d = dragRef.current; if (!d) return;
    dragRef.current = null;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(d.mode === "rotate" ? { rotate: draft.rotate } : { box: draft.box }), 200);
  };

  const stepRow = (label, key, lo, hi, step = 1, { fmt, round = 0, icon = null } = {}) => {
    const cur = Number(draft[key]);
    const clampV = (v) => Math.max(lo, Math.min(hi, round ? Number(v.toFixed(round)) : Math.round(v)));
    return (
      <label className="flex items-center justify-between gap-2 text-sm">
        <span className="flex flex-shrink-0 items-center gap-1">{icon}{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <button type="button" onClick={() => set(key, clampV(cur - step), { later: true })} className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">−</button>
          <input type="range" min={lo} max={hi} step={step} value={cur} onChange={(e) => set(key, Number(e.target.value), { later: true })} className="min-w-0 flex-1 accent-[#FF0000]" style={{ maxWidth: "7rem" }} />
          <button type="button" onClick={() => set(key, clampV(cur + step), { later: true })} className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">+</button>
          <span className="w-9 flex-shrink-0 text-right text-xs text-slate-400">{fmt ? fmt(cur) : cur}</span>
        </span>
      </label>
    );
  };
  const colorInput = (label, key, fallback, clearable) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        {clearable && <button type="button" onClick={() => set(key, "")} className="text-xs text-slate-400 hover:text-rose-600">clear</button>}
        <input type="color" value={draft[key] || fallback} onChange={(e) => set(key, e.target.value, { later: true })} className="h-8 w-10 cursor-pointer rounded border border-slate-200 dark:border-slate-700" />
      </span>
    </label>
  );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note} Upload a <b>{vertical ? "1080×1920 (vertical 9:16)" : "1920×1080 (16:9)"}</b> background, then drag the box onto its empty area — the slide's text fills it with the styling below.</p>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div className="flex w-full flex-col items-center gap-2 sm:w-auto">
          {templateUrl ? (
            <div ref={frameRef} className={`relative ${vertical ? "aspect-[9/16] w-44 sm:w-48" : "aspect-video w-full max-w-[20rem]"} select-none overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700`}
              onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
              <img src={showExact ? preview : templateUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" draggable={false} />
              {draft.showText && draft.useBox && !showExact && (
                <LiveTextBox cfg={draft} lines={sampleLines} W={SLIDE_W} H={SLIDE_H} frameW={frameW}
                  defaults={{ textColor: "#0f172a", accentColor: "#2563eb", badgeTextColor: "#ffffff", strokeWidth: 0, headlineSize: 84, lineHeight: 1.1 }} />
              )}
              {draft.showText && draft.useBox && (
                <div className="absolute rounded border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
                  style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, transform: `rotate(${rot}deg)`, transformOrigin: "center center" }}>
                  <div onPointerDown={onPointerDown("move")} className="absolute inset-0 touch-none cursor-move" />
                  <span onPointerDown={onPointerDown("move")} title="Move" className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none cursor-move items-center justify-center rounded-full border-2 border-white bg-black/45 text-white"><Move className="h-3.5 w-3.5" /></span>
                  <span onPointerDown={onPointerDown("resize")} title="Resize" className="absolute -bottom-1.5 -right-1.5 h-4 w-4 touch-none cursor-se-resize rounded-full border-2 border-white bg-[#FF0000]" />
                  <span onPointerDown={onPointerDown("rotate")} title="Rotate" className="absolute -top-6 left-1/2 flex h-5 w-5 -translate-x-1/2 touch-none cursor-grab items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white"><RotateCw className="h-3 w-3" /></span>
                  <span className="absolute -top-1.5 left-1/2 h-4 w-0.5 -translate-x-1/2 bg-white/80" />
                </div>
              )}
              {showExact && <span className="absolute left-1 top-1 z-10 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">final render</span>}
              <button type="button" onClick={removeTpl} title="Remove" className="absolute -right-2 -top-2 z-10 rounded-full bg-rose-100 p-1.5 text-rose-600 shadow hover:bg-rose-200 dark:bg-rose-900/40"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className={`flex ${vertical ? "aspect-[9/16] w-44 sm:w-48" : "aspect-video w-80"} items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-300 dark:border-slate-600`}><ImagePlus className="h-8 w-8" /></div>
          )}
          <label className={`btn-outline cursor-pointer text-sm ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> {templateUrl ? "Replace" : "Upload template"}</>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload} disabled={uploading} />
          </label>
          {templateUrl && draft.showText && draft.useBox && (
            <button type="button" onClick={refreshPreview} disabled={autoBusy} className="btn-outline !px-2.5 !py-1 text-xs">
              {autoBusy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering…</> : "Check final render"}
            </button>
          )}
          {templateUrl && <p className="max-w-[20rem] text-center text-[11px] text-slate-400">Live preview with sample text — updates instantly as you change size, colour, font… · drag the box, red corner resizes, blue knob rotates.</p>}
        </div>
        {templateUrl && (
          <div className="w-full min-w-0 space-y-3 sm:flex-1">
            <div>
              <p className="mb-1.5 text-sm font-medium">Text on this slide</p>
              <div className="space-y-1.5">
                {[
                  ["hide", "Hide text — show only my template", "Viewers see just your template. The narrator still reads the line below."],
                  ["centred", "White card in the middle", "The built-in text card is drawn centred on your template."],
                  ["box", "Movable text box", "Drag / resize / rotate the text and style it below."],
                ].filter(([m]) => m !== "hide" || !isIntroRole || !draft.showText).map(([m, label, hint]) => {
                  const cur = !draft.showText ? "hide" : draft.useBox ? "box" : "centred";
                  return (
                    <label key={m} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${cur === m ? "border-[#FF0000] bg-red-50/50 dark:bg-red-900/10" : "border-slate-200 dark:border-slate-700"}`}>
                      <input type="radio" name={`slideTextMode-${role}`} className="mt-0.5 h-4 w-4 accent-[#FF0000]" checked={cur === m} onChange={() => setMode(m)} />
                      <span><b>{label}</b> <span className="block text-xs text-slate-400">{hint}</span></span>
                    </label>
                  );
                })}
              </div>
            </div>
            {draft.showText && draft.useBox && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Align</label>
                    <div className="flex gap-1">
                      {[["left", "L"], ["center", "C"], ["right", "R"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => set("align", v)} className={`h-8 flex-1 rounded border text-xs font-bold ${draft.align === v ? "border-[#FF0000] bg-red-50 text-[#FF0000] dark:bg-red-900/20" : "border-slate-200 dark:border-slate-700"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-xs font-medium">Font</label>
                    <select className="input h-8 w-full py-0 text-sm" value={draft.font} onChange={(e) => set("font", e.target.value)}>
                      <option value="sans">Sans (bold)</option><option value="serif">Serif</option><option value="mono">Mono</option>
                      <option value="anton">Anton</option><option value="bebas">Bebas Neue</option><option value="oswald">Oswald</option><option value="poppins">Poppins</option><option value="montserrat">Montserrat</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {colorInput("Text colour", "textColor", "#0f172a")}
                  {colorInput("Badge colour", "accentColor", "#2563eb")}
                  {colorInput("Badge text", "badgeTextColor", "#ffffff")}
                </div>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  {stepRow("Main text size", "headlineSize", 24, 200, 2)}
                  {stepRow("Badge size", "badgeSize", 12, 120, 2)}
                  {stepRow("Line spacing", "lineHeight", 0.8, 2, 0.05, { round: 2, fmt: (v) => v.toFixed(2) })}
                  {stepRow("Rotate", "rotate", -180, 180, 1, { icon: <RotateCw className="h-3.5 w-3.5 text-slate-400" />, fmt: (v) => `${v}°` })}
                </div>
                <button type="button" onClick={() => setShowStyle((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                  <ChevronDown className={`h-4 w-4 transition ${showStyle ? "rotate-180" : ""}`} /> Outline, shadow &amp; shade
                </button>
                {showStyle && (
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    {colorInput("Outline colour", "strokeColor", "#000000")}
                    {stepRow("Outline", "strokeWidth", 0, 12, 1)}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={draft.shadow} onChange={(e) => set("shadow", e.target.checked)} /> Drop shadow</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={draft.uppercase} onChange={(e) => set("uppercase", e.target.checked)} /> UPPERCASE</label>
                    <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                      {colorInput("Shade colour", "panelColor", "#000000", true)}
                      {stepRow("Opacity", "panelOpacity", 0, 100, 5)}
                      {stepRow("Corners", "panelRadius", 0, 60, 2)}
                    </div>
                  </div>
                )}
              </>
            )}
            {draft.showText && !draft.useBox && <p className="text-xs text-slate-400">The subject / topic / closing text is centred on your template automatically.</p>}
            {!draft.showText && <p className="text-xs text-emerald-700 dark:text-emerald-400">Text hidden — only your template is shown. The narrator still says the line below. (Needs “Use my slide templates” ticked for the video.)</p>}
          </div>
        )}
      </div>
        {isIntroRole && (
          <div className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
            <p className="mb-1.5 text-sm font-medium">Show on the intro</p>
            <div className="flex flex-wrap gap-2">
              {[["showSubject", "Subject", "e.g. Economics"], ["showTopic", "Topic", "e.g. Characteristics and Problems of Developing Economy"]].map(([k, label, eg]) => {
                const on = draft[k] !== false;
                return (
                  <button key={k} type="button" role="switch" aria-checked={on} title={eg} onClick={() => set(k, !on)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${on ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"}`}>
                    <span className={`relative inline-block h-4 w-7 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? "left-3.5" : "left-0.5"}`} />
                    </span>
                    {label} {on ? "on" : "off"}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {draft.showSubject !== false && draft.showTopic !== false ? "Shows “Subject — Topic”." : draft.showSubject !== false ? "Shows only the subject." : draft.showTopic !== false ? "Shows only the topic." : "Shows “Quiz Time” (no names)."} The narrator says the same (unless you typed your own line below).
            </p>
          </div>
        )}
      <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Narrator says</span>
          <textarea ref={narrRef} rows={2} maxLength={400} className="input w-full text-sm" placeholder={defaultNarration}
            value={draft.narration} onChange={(e) => set("narration", e.target.value, { later: true })} />
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={previewVoice} disabled={say.busy} className="btn-outline !px-2.5 !py-1 text-xs">
              {say.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />} {say.busy ? "Making…" : "Preview voice"}
            </button>
            {say.url && <audio key={say.url} src={say.url} controls autoPlay className="h-8 max-w-full" />}
          </span>
          {say.info && <span className="block text-[11px] text-slate-400">{say.info}</span>}
          {say.error && <span className="block text-[11px] font-medium text-rose-600">{say.error}</span>}
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            Add a pause:
            {[["[pause]", "1 s"], ["[pause 2]", "2 s"], ["[pause 0.5]", "½ s"]].map(([mark, l]) => (
              <button key={mark} type="button" onClick={() => insertPause(mark)}
                className="rounded border border-slate-200 px-1.5 py-0.5 font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300">+ {l}</button>
            ))}
          </span>
          <span className="block text-[11px] text-slate-400">
            Type <b>[pause]</b> (1 second) or <b>[pause 2]</b> (2 seconds, up to 10) where the narrator should stop, e.g. “Thanks for watching! [pause] Subscribe, like and share. [pause 2] See you next time.” Viewers never see the marks. Commas and full stops also give short natural pauses. Empty = the default line shown above.
          </span>
        </label>
        {stepRow("Show for", "seconds", 0, 60, 1, { fmt: (v) => (v ? `${v}s` : "auto") })}
        <p className="text-[11px] text-slate-400">auto = the slide ends as soon as the narrator finishes. A set time keeps the slide up at least that long (the voice is never cut off).</p>
        <span className="block text-xs text-slate-400">Changes save automatically.</span>
        {msg && <p className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

// Default playlists ("folders") for Shorts and long videos — saved immediately.
function YtDefaultPlaylists({ st, onSaved }) {
  const [msg, setMsg] = useState(null);
  const save = async (key, id, title) => {
    setMsg(null);
    try {
      onSaved(await youtubeService.save({ [key]: id && id !== "__none__" ? { id, title } : null }));
      setMsg({ ok: true, text: "Saved." });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-sm font-semibold">Playlists (folders)</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Every upload is added to the playlist chosen here. A schedule or a single long video can pick a different one.</p>
      {!st.canPlaylists && (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          Playlists need one more permission: click <b>Reconnect YouTube</b> below and allow access again (one time).
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Shorts go to</label>
          <YtPlaylistPicker value={st.shortsPlaylist?.id || ""} onChange={(id, title) => save("shortsPlaylist", id, title)} emptyLabel="No playlist" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Long videos go to</label>
          <YtPlaylistPicker value={st.longPlaylist?.id || ""} onChange={(id, title) => save("longPlaylist", id, title)} emptyLabel="No playlist" />
        </div>
      </div>
      {msg && <p className={`mt-2 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
    </div>
  );
}

// YouTube (Shorts) connection card: Google OAuth app credentials, the
// Connect/Disconnect flow, default privacy and a connection test. Uploading
// itself happens from each schedule's "YouTube" checkbox.
// Social links (the same list as the site footer — Customization) added
// automatically to every YouTube description and as a comment on Facebook /
// Instagram posts.
function SocialLinksSection({ settings, saveSettings }) {
  const init = () => (Array.isArray(settings?.socialLinks) && settings.socialLinks.length ? settings.socialLinks : [{ platform: "youtube", url: "" }, { platform: "facebook", url: "" }, { platform: "instagram", url: "" }, { platform: "telegram", url: "" }, { platform: "whatsapp", url: "" }]).map((l) => ({ platform: l.platform || "website", url: l.url || "" }));
  const [links, setLinks] = useState(init);
  const [onYt, setOnYt] = useState(settings?.socialLinksOnYoutube !== false);
  const [comment, setComment] = useState(settings?.socialLinksComment !== false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const setLink = (i, k, v) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await saveSettings({ socialLinks: links.filter((l) => l.url.trim()), socialLinksOnYoutube: onYt, socialLinksComment: comment });
      setMsg({ ok: true, text: "Saved — they're also shown in your site footer." });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const filled = links.filter((l) => /^https?:\/\/|\./.test(l.url.trim()));
  const sample = ["📌 Follow us & practise more:", ...filled.map((l) => `${l.platform}: ${l.url.trim()}`)].join("\n");
  const toggle = (on, set, label, hint) => (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <span className="text-sm"><span className="font-medium">{label}</span><span className="block text-xs text-slate-400">{hint}</span></span>
      <button type="button" onClick={() => set(!on)} className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition ${on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
    </label>
  );
  return (
    <CollapsibleCard title="Social links" icon={Link2} iconClass="h-4 w-4 text-brand-600">
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Add your links once — they're added <b>automatically</b> to every YouTube video &amp; Short description, and as a comment on Facebook / Instagram posts and Reels. (Same list as your site footer.)</p>
      <div className="mt-4 space-y-2">
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select value={l.platform} onChange={(e) => setLink(i, "platform", e.target.value)} className="input w-32 flex-shrink-0 capitalize">
              {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className="input" value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} placeholder={l.platform === "youtube" ? "https://youtube.com/@yourchannel" : l.platform === "telegram" ? "https://t.me/yourchannel" : l.platform === "whatsapp" ? "https://whatsapp.com/channel/…" : `https://${l.platform}.com/…`} />
            <button type="button" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} title="Remove" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setLinks((ls) => [...ls, { platform: "website", url: "" }])} className="btn-outline !py-1.5 !text-xs"><Plus className="h-3.5 w-3.5" /> Add link</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {toggle(onYt, setOnYt, "Add to YouTube descriptions", "Long videos, their Shorts and schedule Shorts (the YouTube link itself is left out).")}
        {toggle(comment, setComment, "Comment on Facebook & Instagram", "Posts, Reels and long videos. The APIs can't pin — tap ⋮ → Pin once on the comment.")}
      </div>
      {filled.length > 0 && <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{sample}</pre>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="btn-primary">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save links</>}</button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
    </CollapsibleCard>
  );
}

// Video branding: the logo + name at the top and the website at the bottom of
// every AI Slideshow / Reel / Short / long-video slide. Saved per account, so a
// cross-posting user's videos carry THEIR channel's name, not ours.
function VideoBrandingSection({ settings, saveSettings }) {
  const isProfile = !!getActiveSocialProfile();
  const [name, setName] = useState(settings?.videoBrandName || "");
  const [logo, setLogo] = useState(settings?.videoBrandLogoUrl || "");
  const [website, setWebsite] = useState(settings?.videoBrandWebsite || "");
  const [color, setColor] = useState(settings?.videoBrandColor || "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  // What is used when a box is left blank (mirrors backend utils/videoBrand.js).
  const autoName = isProfile ? (settings?.ytChannelTitle || settings?.profileName || "") : "";
  const shownName = name.trim() || autoName;
  const shownSite = website.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "") || (isProfile ? "" : "www.mystudyguide.in");
  const shownColor = /^#[0-9a-f]{6}$/i.test(color) ? color : (/^#[0-9a-f]{6}$/i.test(settings?.primaryColor || "") ? settings.primaryColor : "#2563eb");

  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg({ ok: false, text: "Please select an image file." }); return; }
    setBusy("upload"); setMsg(null);
    try {
      const r = await uploadService.imageDirect(file);
      const u = r?.url || "";
      if (!/^https:\/\//i.test(u)) throw new Error("Upload did not return an https image URL.");
      setLogo(u);
      await saveSettings({ videoBrandLogoUrl: u });
      setMsg({ ok: true, text: "Logo uploaded & saved." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Upload failed." }); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  };
  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      await saveSettings({ videoBrandName: name.trim(), videoBrandLogoUrl: logo, videoBrandWebsite: website.trim(), videoBrandColor: /^#[0-9a-f]{6}$/i.test(color) ? color : "" });
      setMsg({ ok: true, text: "Saved — new videos will use this branding." });
    } catch (err) { setMsg({ ok: false, text: err.message || "Could not save." }); } finally { setBusy(""); }
  };

  return (
    <CollapsibleCard title="Video branding (logo & name)" icon={Clapperboard} iconClass="h-4 w-4 text-brand-600">
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        The logo and name at the <b>top</b> and the website at the <b>bottom</b> of every AI Slideshow, Reel, YouTube Short and long-video slide.
        {isProfile
          ? <> Saved only for <b>this user</b>. Left blank, their own YouTube channel name is used and no website is shown.</>
          : <> Left blank, the built-in “MyStudyGuide” logo and your site address are used.</>}
      </p>

      {/* Live preview of the header + footer */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" style={{ background: "linear-gradient(180deg,#eef2ff 0%,#ffffff 60%,#ecfdf5 100%)" }}>
        <div className="flex items-center justify-center gap-2 px-3 py-3">
          {shownName || logo ? (
            <>
              {logo
                ? <img src={logo} alt="" className="h-9 w-9 rounded-xl object-contain" />
                : <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black text-white" style={{ backgroundColor: shownColor }}>{shownName.charAt(0).toUpperCase() || "?"}</span>}
              {shownName && <span className="truncate text-xl font-extrabold text-slate-900">{shownName}</span>}
            </>
          ) : (
            <span className="text-xl font-extrabold"><span className="text-slate-900">My</span><span className="text-brand-600">Study</span><span className="text-slate-900">Guide</span></span>
          )}
        </div>
        <div className="mx-6 h-16 rounded-lg bg-white shadow-sm" />
        <p className="py-2 text-center text-xs font-semibold text-slate-500">{shownSite || <span className="italic text-slate-400">(no website)</span>}</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Name on videos</label>
          <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
            placeholder={autoName ? `Automatic: ${autoName}` : (isProfile ? "e.g. their channel name" : "Blank = MyStudyGuide")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Website at the bottom <span className="font-normal text-slate-400">(optional)</span></label>
          <input className="input" maxLength={80} value={website} onChange={(e) => setWebsite(e.target.value)}
            placeholder={isProfile ? "Blank = no website" : "Blank = www.mystudyguide.in"} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Logo <span className="font-normal text-slate-400">(square PNG/JPG works best)</span></label>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="btn-outline !py-1.5 !text-xs">
              {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {logo ? "Change logo" : "Upload logo"}
            </button>
            {logo && <button type="button" onClick={() => setLogo("")} disabled={!!busy} className="btn-outline !py-1.5 !text-xs text-rose-600"><Trash2 className="h-4 w-4" /> Remove</button>}
          </div>
          {!logo && <p className="mt-1 text-xs text-slate-400">No logo → a coloured badge with the first letter of the name.</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Badge colour</label>
          <div className="flex items-center gap-2">
            <input type="color" value={shownColor} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-slate-200 dark:border-slate-700" />
            {color && <button type="button" onClick={() => setColor("")} className="text-xs text-slate-500 underline">Use default</button>}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!!busy} className="btn-primary">{busy === "save" ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save branding</>}</button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
      <p className="mt-2 text-xs text-slate-400">Applies to videos made from now on — already-posted videos don't change. Remove the logo and tap Save branding to apply the removal. Custom slide templates have their own header, so this isn't drawn on them.</p>
    </CollapsibleCard>
  );
}

// Telegram connection: the site's bot (token from @BotFather) posts to a
// channel / group where it's an admin.
function TelegramConnection({ settings, saveSettings }) {
  const [enabled, setEnabled] = useState(!!settings?.tgEnabled);
  const [chat, setChat] = useState(settings?.tgChatId || "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [steps, setSteps] = useState(!settings?.tgBotTokenSet);
  const [found, setFound] = useState(null); // channels the bot is in: [{ id, title, type }]
  const isInvite = /t(?:elegram)?\.me\/(\+|joinchat\/)/i.test(chat);
  const findChats = async () => {
    setBusy("find"); setMsg(null); setFound(null);
    try {
      const r = await settingsService.findTelegramChats(token.trim() ? { tgBotToken: token.trim() } : {});
      setFound(r?.chats || []);
      if (r?.chats?.length === 1) { setChat(r.chats[0].id); setMsg({ ok: true, text: `Found “${r.chats[0].title}” — tap Save connection.` }); }
      else if (!r?.chats?.length) setMsg({ ok: false, text: "No channel found yet. Make the bot an admin of the channel, post any message there, then tap Find my channel again." });
    } catch (e) { setMsg({ ok: false, text: e.message || "Could not look up the channels." }); } finally { setBusy(""); }
  };
  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      await saveSettings({ tgEnabled: enabled, tgChatId: chat.trim(), ...(token.trim() ? { tgBotToken: token.trim() } : {}) });
      setToken(""); setMsg({ ok: true, text: "Saved." });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(""); }
  };
  const test = async (verifyOnly) => {
    setBusy(verifyOnly ? "check" : "test"); setMsg(null);
    try {
      const r = await settingsService.testTelegram({ verifyOnly, tgChatId: chat.trim(), ...(token.trim() ? { tgBotToken: token.trim() } : {}) });
      setMsg({ ok: true, text: verifyOnly ? `Working — ${r.bot} can post in “${r.chat}”.` : `Sent to “${r.chat}”${r.url ? ` (${r.url})` : ""}. Check your channel.` });
    } catch (e) { setMsg({ ok: false, text: e.message || "Telegram test failed." }); } finally { setBusy(""); }
  };
  const ready = (token.trim() || settings?.tgBotTokenSet) && chat.trim() && !isInvite;
  return (
    <div>
      <p className="flex items-center gap-1.5 font-semibold"><Send className="h-4 w-4 text-[#229ED9]" /> Telegram connection</p>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Post to your Telegram <b>channel</b> or <b>group</b> through your own bot. The bot token is stored on the server and never shown in the browser.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <span className="text-sm font-medium">Enable Telegram posting</span>
          <button type="button" onClick={() => setEnabled((v) => !v)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${enabled ? "bg-[#229ED9]" : "bg-slate-300 dark:bg-slate-600"}`}>
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${enabled ? "left-6" : "left-1"}`} />
          </button>
        </label>
        <div>
          <label className="mb-1 block text-sm font-medium">Channel / group</label>
          <div className="flex gap-2">
            <input className="input" value={chat} onChange={(e) => setChat(e.target.value)} placeholder="@mystudyguide  or  -1001234567890" />
            <button type="button" onClick={findChats} disabled={!!busy || !(token.trim() || settings?.tgBotTokenSet)} className="btn-outline flex-shrink-0 !px-2.5 text-xs" title="Find the channels your bot is an admin of">
              {busy === "find" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Find my channel
            </button>
          </div>
          {isInvite && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">This is a private <b>invite link</b> — a bot can't post with it. Add the bot to the channel as an admin, then tap <b>Find my channel</b> to fill in its id (-100…).</p>}
          {found?.length > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {found.map((c) => (
                <button key={c.id} type="button" onClick={() => { setChat(c.id); setFound(null); setMsg({ ok: true, text: `Picked “${c.title}” — tap Save connection.` }); }}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">{c.title} <span className="text-slate-400">({c.type})</span></button>
              ))}
            </div>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium"><KeyRound className="h-4 w-4 text-slate-400" /> Bot token</label>
          <input type="password" className="input" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off"
            placeholder={settings?.tgBotTokenSet ? "•••••••• (saved — type to replace)" : "123456789:AAE… (from @BotFather)"} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!!busy} className="btn-primary">{busy === "save" ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save connection</>}</button>
        <button type="button" onClick={() => test(true)} disabled={!!busy || !ready} className="btn-outline">{busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check connection</button>
        <button type="button" onClick={() => test(false)} disabled={!!busy || !ready} className="btn-outline">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test message</button>
        {msg && <span className={`inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</span>}
      </div>
      <button type="button" onClick={() => setSteps((v) => !v)} className="mt-4 flex items-center gap-1 text-sm font-semibold text-brand-600">
        <ChevronDown className={`h-4 w-4 transition ${steps ? "rotate-180" : ""}`} /> How to connect (2 minutes)
      </button>
      {steps && (
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>In Telegram, open <b>@BotFather</b>, send <code>/newbot</code>, choose a name → copy the <b>bot token</b> into the box above.</li>
          <li>Open your channel → <b>Administrators → Add admin</b> → search your bot → allow <b>Post messages</b>.</li>
          <li>Public channel: type its <b>@username</b> (e.g. <code>@mystudyguide</code>). <b>Private</b> channel / group: don't use the invite link (<code>t.me/+…</code>) — post any message in the channel, then tap <b>Find my channel</b> and it fills in the id (<code>-100…</code>).</li>
          <li>Tap <b>Save connection</b>, then <b>Send test message</b>.</li>
        </ol>
      )}
    </div>
  );
}

// The YouTube CONNECTION (OAuth app, connect / reconnect, upload switch,
// privacy, default playlists) — shown in the Connections card's YouTube tab.
function YoutubeSection() {
  const [st, setSt] = useState(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(""); // "" | "save" | "connect" | "disconnect" | "test"
  // Result of the Google redirect (…/admin/facebook?youtube=connected|error&reason=…).
  const [msg, setMsg] = useState(() => {
    const qs = new URLSearchParams(window.location.search);
    const r = qs.get("youtube");
    if (!r) return null;
    return r === "connected" ? { ok: true, text: "YouTube connected." } : { ok: false, text: qs.get("reason") || "Could not connect YouTube." };
  });
  const [showSteps, setShowSteps] = useState(false);
  // How to connect: "here" = sign in to Google in THIS browser; "link" = send a
  // link to the channel owner (e.g. a cross-posting user) to approve on their
  // own phone. Remembered on this device.
  const [connectMode, setConnectModeRaw] = useState(() => {
    try { return localStorage.getItem("yt.connectMode") === "link" ? "link" : "here"; } catch { return "here"; }
  });
  const setConnectMode = (m) => {
    setConnectModeRaw(m); setShareLink(null);
    try { localStorage.setItem("yt.connectMode", m); } catch { /* private mode */ }
  };
  // The link waiting for the owner: { url, expiresAt (ms), since (connectedAt before) }.
  const [shareLink, setShareLink] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  // Open the card when we've just come back from Google's login screen.
  const [openOnReturn] = useState(() => new URLSearchParams(window.location.search).has("youtube"));

  const apply = (s) => { setSt(s); setClientId(s?.clientId || ""); setClientSecret(""); };
  const load = () => youtubeService.status().then(apply).catch((e) => setMsg({ ok: false, text: e.message }));

  useEffect(() => {
    // Strip the ?youtube=… result from the address bar (shown via `msg` above).
    const qs = new URLSearchParams(window.location.search);
    if (qs.has("youtube")) {
      qs.delete("youtube"); qs.delete("reason");
      const rest = qs.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While a "Send link" is waiting: tick the countdown and check every 5 s
  // whether the owner has approved (a new connectedAt = a fresh connection).
  useEffect(() => {
    if (!shareLink) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      if (Date.now() > shareLink.expiresAt) { clearInterval(poll); return; }
      try {
        const s = await youtubeService.status();
        if (s?.connected && s.connectedAt && s.connectedAt !== shareLink.since) {
          apply(s); setShareLink(null);
          setMsg({ ok: true, text: `YouTube connected — “${s.channelTitle || "channel"}”.` });
        }
      } catch { /* keep waiting */ }
    }, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [shareLink]);

  const run = async (kind, fn) => {
    setBusy(kind); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message || "Something went wrong." }); } finally { setBusy(""); }
  };
  const saveCreds = () => run("save", async () => {
    apply(await youtubeService.save({ clientId: clientId.trim(), ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}) }));
    setMsg({ ok: true, text: "Saved." });
  });
  const connect = () => run("connect", async () => {
    // Save any just-typed credentials first so the connection uses them.
    if (clientId.trim() !== (st?.clientId || "") || clientSecret.trim()) {
      apply(await youtubeService.save({ clientId: clientId.trim(), ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}) }));
    }
    if (connectMode === "link") {
      // Owner approves on THEIR device — show the link instead of navigating.
      const r = await youtubeService.connect({ remote: true });
      if (r?.url) {
        setShareLink({ url: r.url, expiresAt: new Date(r.expiresAt || Date.now() + 15 * 60000).getTime(), since: st?.connectedAt || null });
      }
      return;
    }
    const r = await youtubeService.connect();
    if (r?.url) window.location.assign(r.url);
  });
  const shareText = (url) => `Please open this link, sign in with the Google account that owns your YouTube channel and tap Allow, so I can cross-post videos to your channel (the link works for 15 minutes):\n${url}`;
  const shareNative = async () => {
    if (!shareLink) return;
    try { await navigator.share({ title: "Connect your YouTube channel", text: shareText(shareLink.url) }); }
    catch { /* cancelled */ }
  };
  const disconnect = () => {
    if (!window.confirm("Disconnect YouTube? Schedules will stop uploading to YouTube until you connect again.")) return;
    run("disconnect", async () => { apply(await youtubeService.disconnect()); setMsg({ ok: true, text: "Disconnected." }); });
  };
  const test = () => run("test", async () => {
    const r = await youtubeService.test();
    setMsg({ ok: true, text: `Working — connected to “${r.channelTitle}”.` });
    load();
  });
  const setEnabled = (v) => run("save", async () => apply(await youtubeService.save({ enabled: v })));
  const setPrivacy = (v) => run("save", async () => apply(await youtubeService.save({ privacy: v })));
  const copy = (t) => { try { navigator.clipboard?.writeText(t); setMsg({ ok: true, text: "Copied." }); } catch { /* ignore */ } };

  void openOnReturn; // the parent opens the YouTube tab when coming back from Google
  return (
    <div>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Connect your YouTube channel once. Used for <b>Shorts</b> (tick <b>YouTube</b> on an AI Slideshow, Reel or custom-video schedule) and the <b>long videos</b> below.
      </p>
      {!st ? <div className="mt-3"><Loading label="Loading…" /></div> : (
        <>
          {/* Status */}
          <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${st.connected ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-900/10" : "border-slate-200 dark:border-slate-700"}`}>
            <span className="text-sm">
              {st.connected
                ? <>✅ Connected to <b>{st.channelTitle || "your channel"}</b></>
                : <>Not connected</>}
            </span>
            {st.connected && (
              <label className="flex items-center gap-2 text-sm font-medium">
                Upload enabled
                <button type="button" onClick={() => setEnabled(!st.enabled)} disabled={!!busy}
                  className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${st.enabled ? "bg-[#FF0000]" : "bg-slate-300 dark:bg-slate-600"}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${st.enabled ? "left-6" : "left-1"}`} />
                </button>
              </label>
            )}
          </div>

          {/* Google OAuth app */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Google OAuth Client ID</label>
              <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}
                placeholder={st.usingEnvCredentials ? "Using the server's YOUTUBE_CLIENT_ID" : "xxxx.apps.googleusercontent.com"} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Client secret</label>
              <input className="input" type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                placeholder={st.clientSecretSet ? "•••••• saved — type to replace" : (st.usingEnvCredentials ? "Using the server's secret" : "GOCSPX-…")} />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium">Authorised redirect URI <span className="font-normal text-slate-400">(paste this into Google Cloud)</span></label>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={st.redirectUri} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => copy(st.redirectUri)} className="btn-outline flex-shrink-0 !py-1.5 !text-xs">Copy</button>
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium">New videos are</label>
            <select className="input max-w-xs" value={st.privacy} onChange={(e) => setPrivacy(e.target.value)} disabled={!!busy}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Until Google approves your API project (a free “YouTube API compliance audit”), YouTube keeps API uploads <b>private</b> — you can make them public in YouTube Studio. After approval, “Public” applies automatically.
            </p>
          </div>

          {st.connected && <YtDefaultPlaylists st={st} onSaved={apply} />}

          {/* How to connect: here (this browser) or send a link to the channel owner */}
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium">How to connect</label>
            <div role="radiogroup" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
              {[
                ["here", "Sign in on this device"],
                ["link", "Send link to channel owner"],
              ].map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={connectMode === k} onClick={() => setConnectMode(k)} disabled={!!busy}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${connectMode === k ? "bg-[#FF0000] text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {connectMode === "here"
                ? <>You sign in to Google here with the account that owns the channel (Google will let you pick the account / Brand channel).</>
                : <>Get a link to send the channel owner (WhatsApp, Telegram…). They open it on their own phone, sign in and tap <b>Allow</b> — no password sharing. The link works for 15 minutes; this page updates by itself when they finish.</>}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={saveCreds} disabled={!!busy} className="btn-outline">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
            <button type="button" onClick={connect} disabled={!!busy || (!st.credentialsReady && !(clientId.trim() && (clientSecret.trim() || st.clientSecretSet)))} className="btn-primary !bg-[#FF0000] hover:!bg-[#d90000]">
              {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : connectMode === "link" ? <Share2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}{" "}
              {connectMode === "link"
                ? (shareLink ? "Make a new link" : "Create link for owner")
                : (st.connected ? "Reconnect YouTube" : "Connect YouTube")}
            </button>
            {st.connected && (
              <>
                <button type="button" onClick={test} disabled={!!busy} className="btn-outline">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Test connection</button>
                <button type="button" onClick={disconnect} disabled={!!busy} className="btn-outline text-rose-600">{busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Disconnect</button>
              </>
            )}
          </div>
          {msg && <p className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}</p>}

          {/* "Send link" — waiting for the channel owner */}
          {connectMode === "link" && shareLink && (() => {
            const left = Math.max(0, Math.round((shareLink.expiresAt - now) / 1000));
            const expired = left === 0;
            return (
              <div className={`mt-3 rounded-lg border p-3 ${expired ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-900/10" : "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-900/10"}`}>
                <p className="text-sm font-medium">
                  {expired
                    ? <>This link has expired — click <b>Make a new link</b>.</>
                    : <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Waiting for the channel owner… link works for <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b></>}
                </p>
                {!expired && (
                  <>
                    <div className="mt-2 flex gap-2">
                      <input className="input font-mono text-xs" readOnly value={shareLink.url} onFocus={(e) => e.target.select()} />
                      <button type="button" onClick={() => copy(shareLink.url)} className="btn-outline flex-shrink-0 !py-1.5 !text-xs">Copy</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a className="btn-outline !py-1.5 !text-xs" target="_blank" rel="noopener noreferrer"
                        href={`https://wa.me/?text=${encodeURIComponent(shareText(shareLink.url))}`}>
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                      <a className="btn-outline !py-1.5 !text-xs" target="_blank" rel="noopener noreferrer"
                        href={`https://t.me/share/url?url=${encodeURIComponent(shareLink.url)}&text=${encodeURIComponent("Please open this link, sign in with the Google account that owns your YouTube channel and tap Allow (works for 15 minutes).")}`}>
                        <Send className="h-4 w-4" /> Telegram
                      </a>
                      {typeof navigator !== "undefined" && navigator.share && (
                        <button type="button" onClick={shareNative} className="btn-outline !py-1.5 !text-xs"><Share2 className="h-4 w-4" /> Share…</button>
                      )}
                      <button type="button" onClick={() => setShareLink(null)} className="btn-outline !py-1.5 !text-xs"><X className="h-4 w-4" /> Cancel</button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Don't open this link yourself — whoever signs in with it connects <b>their</b> channel here. If your app is still in Google “Testing” mode, add the owner's Gmail under <b>Test users</b> first.
                    </p>
                  </>
                )}
              </div>
            );
          })()}

          {/* One-time setup guide */}
          <button type="button" onClick={() => setShowSteps((v) => !v)} className="mt-4 flex items-center gap-1 text-sm font-semibold text-brand-600">
            <ChevronDown className={`h-4 w-4 transition ${showSteps ? "rotate-180" : ""}`} /> One-time setup steps (about 10 minutes)
          </button>
          {showSteps && (
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>Open <b>console.cloud.google.com</b> and create a project (e.g. “My Study Guide YouTube”).</li>
              <li>Go to <b>APIs &amp; Services → Library</b>, search <b>YouTube Data API v3</b> and click <b>Enable</b>.</li>
              <li><b>OAuth consent screen</b>: choose <b>External</b>, fill in the app name + your email, add the scopes <code>youtube.upload</code>, <code>youtube.readonly</code> and <code>youtube.force-ssl</code> (for playlists), add your own Google account under <b>Test users</b>, then <b>Publish app</b> (so the login doesn't expire every 7 days).</li>
              <li><b>Credentials → Create credentials → OAuth client ID</b> → type <b>Web application</b>. Under <b>Authorised redirect URIs</b> paste the redirect URI shown above.</li>
              <li>Copy the <b>Client ID</b> and <b>Client secret</b> into the boxes above and click <b>Connect YouTube</b>. Sign in with the Google account that owns your channel and allow access.</li>
              <li>Optional (to make uploads public automatically): apply for the free <b>YouTube API Services audit</b> from the YouTube Data API page in Google Cloud.</li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}

// datetime-local value → ISO (or "" when blank).
const localToIso = (v) => (v ? new Date(v).toISOString() : "");
// A scheduled time must be at least this far ahead (YouTube needs a future time,
// and a full quiz video takes a while to make).
const MIN_SCHEDULE_MIN = 15;
// Problem with a chosen publish time, or "" when it's fine / not scheduled.
const publishAtError = (v) => {
  if (!v) return "";
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return "Pick a valid date and time.";
  if (t < Date.now() + MIN_SCHEDULE_MIN * 60000) return `Pick a time at least ${MIN_SCHEDULE_MIN} minutes from now.`;
  return "";
};

// "When should it go live?" — Publish now, or Schedule for a date & time.
// value = datetime-local string ("" = publish now).
function YtPublishTimeField({ value, onChange, disabled = false, note = "" }) {
  const [mode, setMode] = useState(value ? "schedule" : "now");
  // "Now", refreshed each minute, so the presets and the earliest allowed time stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const at = (days, h, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return toLocalInput(d); };
  const inHours = (h) => { const d = new Date(now + h * 3600000); d.setSeconds(0, 0); return toLocalInput(d); };
  const presets = [["In 1 hour", inHours(1)], ["Today 6 PM", at(0, 18)], ["Tomorrow 9 AM", at(1, 9)], ["Tomorrow 6 PM", at(1, 18)]]
    .filter(([, v]) => !publishAtError(v));
  const err = mode === "schedule" ? (value ? publishAtError(value) : "Choose the date and time.") : "";
  const pick = (m) => {
    setMode(m);
    if (m === "now") onChange("");
    else if (!value) onChange(at(1, 9)); // a sensible starting point: tomorrow 9 AM
  };
  return (
    <div>
      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
        {[["now", "Publish now"], ["schedule", "Schedule for later"]].map(([k, l]) => (
          <button key={k} type="button" disabled={disabled} onClick={() => pick(k)}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${mode === k ? "bg-[#FF0000] text-white" : "text-slate-600 dark:text-slate-300"}`}>
            {k === "schedule" && <CalendarClock className="h-4 w-4" />}{l}
          </button>
        ))}
      </div>
      {mode === "schedule" && (
        <div className="mt-2 space-y-2">
          <input type="datetime-local" className="input" value={value} disabled={disabled}
            min={toLocalInput(now + MIN_SCHEDULE_MIN * 60000)} onChange={(e) => onChange(e.target.value)} />
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map(([l, v]) => (
                <button key={l} type="button" disabled={disabled} onClick={() => onChange(v)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${value === v ? "border-[#FF0000] bg-red-50 text-[#FF0000] dark:bg-red-900/20" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>{l}</button>
              ))}
            </div>
          )}
          {err
            ? <p className="text-xs font-medium text-rose-600">{err}</p>
            : <p className="text-xs text-emerald-700 dark:text-emerald-400">Goes live on <b>{new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</b> (your time). It stays <b>private</b> until then.{note ? ` ${note}` : ""}</p>}
        </div>
      )}
    </div>
  );
}

// YouTube LONG videos (normal 16:9 videos, not Shorts):
//   • "Full quiz video" — the server builds ONE narrated landscape video of a
//     whole topic (every question + answer, with chapters) and uploads it.
//   • "Upload your own" — a lesson/lecture file goes from this browser
//     straight to YouTube (any size), now or scheduled.
function YoutubeLongVideoSection() {
  const [tab, setTab] = useState("quiz");
  const [st, setSt] = useState(null); // YouTube status: thumbnail template + default playlist
  useEffect(() => { youtubeService.status().then(setSt).catch(() => {}); }, []);
  return (
    <CollapsibleCard title="YouTube long videos" icon={Clapperboard} iconClass="h-5 w-5 text-[#FF0000]">
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Normal (landscape 16:9) YouTube videos — not Shorts. Uses the channel connected in the <b>YouTube Shorts</b> card.
      </p>
      <div className="mt-3 inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
        {[["quiz", "Full quiz video (automatic)"], ["own", "Upload your own video"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-[#FF0000] text-white" : "text-slate-600 dark:text-slate-300"}`}>{l}</button>
        ))}
      </div>
      {tab === "quiz" ? <FullQuizVideoForm key={st ? "ready" : "loading"} st={st} onStatus={setSt} /> : <OwnVideoUploadForm st={st} onStatus={setSt} />}
    </CollapsibleCard>
  );
}

// "" = the default long-video playlist, "__none__" = none, else a playlist id.
const playlistChoice = (id, title) => (id === "__none__" ? { id: "" } : id ? { id, title } : undefined);
const thumbReady = (st) => !!(st?.thumb?.templateUrl && st?.thumb?.enabled !== false);
const defaultPlaylistLabel = (st) => (st?.longPlaylist?.id ? `Default: ${st.longPlaylist.title || "saved playlist"}` : "No playlist (default)");

function FullQuizVideoForm({ st, onStatus }) {
  const { settings, save: saveSettings } = useSettings();
  const [useTemplates, setUseTemplates] = useState(st?.longVideoDefaults?.useTemplates !== false);
  const [pickerKey, setPickerKey] = useState(0);
  // "Hide text on end slides": saves both end slides (full + Short) at once,
  // then remounts the editors. The intro slide is left as it is.
  const [slideEdRev, setSlideEdRev] = useState(0);
  const [hidingText, setHidingText] = useState(false);
  const [hideMsg, setHideMsg] = useState(null);
  const SLIDE_ROLES = [["outro", "longVideoOutroText", "outroText"], ["shortoutro", "longVideoShortOutroText", "shortOutroText"]];
  const allSlideTextHidden = SLIDE_ROLES.every(([, , k]) => st?.[k]?.showText === false);
  const hideAllSlideText = async () => {
    setHidingText(true); setHideMsg(null);
    try {
      const body = Object.fromEntries(SLIDE_ROLES.map(([, key, k]) => [key, { ...(st?.[k] || {}), showText: false }]));
      onStatus?.(await youtubeService.save(body));
      setSlideEdRev((n) => n + 1);
      setHideMsg({ ok: true, text: "Done — both end slides (full video and Short) now show only your templates. The narrator still reads them. The intro slide is unchanged." });
    } catch (e) { setHideMsg({ ok: false, text: e.message || "Could not save." }); } finally { setHidingText(false); }
  };
  const [playlist, setPlaylist] = useState({ id: "", title: "" });
  const [useThumb, setUseThumb] = useState(true);
  const [source, setSource] = useState({ subject: null, session: null, quiz: null, testSeries: null, label: "" });
  const [title, setTitle] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [publishAt, setPublishAt] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [maxQ, setMaxQ] = useState(50);
  const [ready, setReady] = useState({ youtube: true, facebook: true });
  const hasSource = !!(source.subject || source.session || source.quiz || source.testSeries || source.topic || source.practiceTopic);
  // A whole topic / session is picked (not one quiz) → "Quiz by quiz" is possible.
  const isTopicSource = !!((source.topic || source.session || source.practiceTopic) && !source.quiz && !source.testSeries);

  // Saved long-video settings ("Save settings only"), else the AI Slideshow ones.
  const d = st?.longVideoDefaults || {};
  const has = (k) => d[k] !== undefined && d[k] !== null;
  // 2) Questions
  const [total, setTotal] = useState(null); // complete questions in the picked content
  const [qMode, setQMode] = useState(has("count") && d.count > 0 ? "custom" : "all"); // "all" | "custom"
  const [count, setCount] = useState(has("count") && d.count > 0 ? d.count : 25);
  const [startAt, setStartAt] = useState(1);
  const [order, setOrder] = useState(d.order === "random" ? "random" : "sequential");
  // When: one video (now / at a time), or REPEAT — a new part at set times.
  const [when, setWhen] = useState("once"); // "once" | "repeat"
  // Repeat "quiz by quiz": one quiz (or one part of a big quiz) per time slot,
  // from the chosen start quiz to the last quiz of the topic.
  const [byQuiz, setByQuiz] = useState(true);
  const [topicQuizzes, setTopicQuizzes] = useState(null); // [{ id, name, questions, videos }]
  const [quizStartId, setQuizStartId] = useState("");
  const [firstRunAt, setFirstRunAt] = useState(""); // local "YYYY-MM-DDTHH:MM" — first run not before this
  const [times, setTimes] = useState(["09:00"]);
  const [days, setDays] = useState([]);
  const [stopWhenExhausted, setStopWhenExhausted] = useState(true);
  const [schTitle, setSchTitle] = useState("");
  // 3) Narration & slides
  const [voicesByProvider, setVoicesByProvider] = useState({});
  const [providers, setProviders] = useState(["gtranslate", "edge", "openai", "elevenlabs", "googlecloud", "azure", "custom"]);
  const [provider, setProvider] = useState(d.engine || settings?.ttsProvider || "gtranslate");
  const voices = voicesByProvider[provider] || [];
  const [voice, setVoice] = useState(d.voice || settings?.slideshowVoice || "");
  const [slidesMode, setSlidesMode] = useState((has("slidesMode") ? d.slidesMode : settings?.slideshowSlides) === "question" ? "question" : "both");
  const [questionSec, setQuestionSec] = useState(d.questionSec || settings?.slideshowQuestionSec || 10);
  const [answerSec, setAnswerSec] = useState(d.answerSec || settings?.slideshowAnswerSec || 8);
  const [reveal, setReveal] = useState(d.reveal || { pauseSec: settings?.slideshowRevealPauseSec ?? 3, showSec: settings?.slideshowRevealSec ?? 3, say: settings?.slideshowRevealSay !== false });
  const [captions, setCaptions] = useState(has("autoCaptions") ? d.autoCaptions !== false : settings?.slideshowAutoCaptions !== false);
  const [readOpts, setReadOpts] = useState(() => (d.read ? { ...readOptsFrom({}), ...d.read } : readOptsFrom(settings)));
  const [savingDefaults, setSavingDefaults] = useState(false);
  // Preview: the FULL video + the Short + the thumbnail, exactly as a real run
  // would make them — never posted.
  const PV_EMPTY = { busy: false, job: null, error: "" };
  const [pv, setPv] = useState(PV_EMPTY);
  // 4) Post to
  const [toYoutube, setToYoutube] = useState(d.toYoutube !== false);
  const [toFacebook, setToFacebook] = useState(!!d.toFacebook);
  const [asShort, setAsShort] = useState(d.asShort ?? true);
  // The same vertical Short also as a Facebook / Instagram Reel, and the full
  // video's link commented under the Short + Reels.
  const [shortToFacebook, setShortToFacebook] = useState(!!d.shortToFacebook);
  const [shortToInstagram, setShortToInstagram] = useState(!!d.shortToInstagram);
  const [lvToTelegram, setLvToTelegram] = useState(!!d.toTelegram); // Telegram gets the video's LINK
  const [linkComment, setLinkComment] = useState(d.linkComment !== false);

  const load = () => youtubeService.longVideos().then((r) => {
    setJobs(r?.jobs || []);
    if (r?.maxQuestions) setMaxQ(r.maxQuestions);
    if (r && "facebookReady" in r) setReady({ youtube: !!r.youtubeReady, facebook: !!r.facebookReady });
  }).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    facebookService.ttsVoices().then((r) => {
      if (r?.voicesByProvider && typeof r.voicesByProvider === "object") setVoicesByProvider(r.voicesByProvider);
      if (Array.isArray(r?.providers) && r.providers.length) setProviders(r.providers);
    }).catch(() => {});
  }, []);
  // How many questions the picked content has.
  useEffect(() => {
    if (!hasSource) return undefined;
    let live = true;
    youtubeService.longVideoCount({ source }).then((r) => { if (live) setTotal(Number(r?.total) || 0); }).catch(() => { if (live) setTotal(null); });
    return () => { live = false; };
  }, [source.subject, source.session, source.quiz, source.testSeries]); // eslint-disable-line react-hooks/exhaustive-deps
  // The topic's quizzes (for "Start from quiz"), re-counted per video size.
  const perVideo = qMode === "all" ? maxQ : Math.max(1, Math.min(maxQ, parseInt(count, 10) || 25));
  useEffect(() => {
    if (!isTopicSource || when !== "repeat") return undefined; // the list is only shown for a topic + Repeat
    let live = true;
    youtubeService.longVideoTopicQuizzes({ source, per: perVideo })
      .then((r) => { if (live) { setTopicQuizzes(r?.quizzes || []); setQuizStartId((cur) => (r?.quizzes || []).some((q) => q.id === cur) ? cur : (r?.quizzes?.[0]?.id || "")); } })
      .catch(() => { if (live) setTopicQuizzes([]); });
    return () => { live = false; };
  }, [source.topic, source.session, source.practiceTopic, source.quiz, source.testSeries, when, perVideo]); // eslint-disable-line react-hooks/exhaustive-deps
  const useByQuiz = when === "repeat" && isTopicSource && byQuiz;
  const quizPlan = (() => {
    if (!useByQuiz || !topicQuizzes) return null;
    const from = Math.max(0, topicQuizzes.findIndex((q) => q.id === quizStartId));
    const rest = topicQuizzes.slice(from).filter((q) => q.questions > 0);
    return { from, skipped: from, quizzes: rest.length, videos: rest.reduce((n, q) => n + q.videos, 0), first: topicQuizzes[from], last: rest[rest.length - 1], empty: topicQuizzes.slice(from).length - rest.length };
  })();

  // Poll while any job is still working.
  const active = jobs.some((j) => j.status === "queued" || j.status === "running");
  // A 1-second clock (only while a job is working) so the % and time-left tick
  // smoothly between the 5-second status polls — like the AI Slideshow test.
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (!active && !pv.busy) return undefined;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, pv.busy]);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [active]);

  const clamp = (v, def, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const known = hasSource && Number.isInteger(total);
  const nCount = clamp(count, 25, 1, maxQ);
  const nStart = order === "random" ? 1 : clamp(startAt, 1, 1, 100000);
  // What will actually be in the video.
  const planned = (() => {
    if (!known) return null;
    if (qMode === "all" && order === "sequential" && nStart === 1) return { n: Math.min(total, maxQ), from: 1, to: Math.min(total, maxQ) };
    const want = qMode === "all" ? maxQ : nCount;
    if (order === "random") return { n: Math.min(total, want), random: true };
    const n = Math.max(0, Math.min(want, total - nStart + 1));
    return { n, from: nStart, to: nStart + n - 1 };
  })();
  const withAnswer = slidesMode === "both";
  const perQ = clamp(questionSec, 10, 3, 40) + (withAnswer ? clamp(answerSec, 8, 3, 40) : clamp(reveal.pauseSec, 3, 0, 15) + clamp(reveal.showSec, 3, 1, 15));
  // Rough length (real narration may run longer — the server re-checks). A Short
  // is only offered when the video is about 3 minutes or less.

  const voiceValue = voices.some((v) => v.id === voice) || (FREE_FORM_VOICE.has(provider) && voice.trim()) ? voice.trim() : (voices[0]?.id || voice);

  // Every setting on screen, as sent to the server.
  const buildOptions = () => ({
    count: qMode === "all" ? 0 : nCount, start: nStart, order,
    engine: provider, voice: voiceValue, slidesMode,
    reveal: { pauseSec: clamp(reveal.pauseSec, 3, 0, 15), showSec: clamp(reveal.showSec, 3, 1, 15), say: reveal.say },
    questionSec: clamp(questionSec, 10, 3, 40), answerSec: clamp(answerSec, 8, 3, 40), autoCaptions: captions,
    read: readOpts, useTemplates, toYoutube, toFacebook, asShort, shortToFacebook, shortToInstagram, linkComment, toTelegram: lvToTelegram,
  });
  // "Save settings only": the form opens with these next time.
  const saveDefaults = async () => {
    setSavingDefaults(true); setMsg(null);
    try { onStatus?.(await youtubeService.saveLongVideoDefaults({ options: buildOptions() })); setMsg({ ok: true, text: "Settings saved — the long-video form will open with them next time." }); }
    catch (e) { setMsg({ ok: false, text: e.message }); } finally { setSavingDefaults(false); }
  };
  // Repeat: a schedule that makes the next part at each time.
  const createRepeat = async () => {
    const cleanTimes = times.filter(Boolean);
    if (!hasSource) { setMsg({ ok: false, text: "Pick the topic / quiz first." }); return; }
    if (!cleanTimes.length) { setMsg({ ok: false, text: "Add at least one time." }); return; }
    if (!toYoutube && !toFacebook) { setMsg({ ok: false, text: "Choose YouTube and/or Facebook." }); return; }
    if (useByQuiz && !quizPlan?.quizzes) { setMsg({ ok: false, text: "This topic has no quizzes with questions from the chosen start quiz." }); return; }
    if (firstRunAt && new Date(firstRunAt).getTime() < Date.now() - 60000) { setMsg({ ok: false, text: "The start date & time is in the past." }); return; }
    setBusy(true); setMsg(null);
    try {
      const pl = playlistChoice(playlist.id, playlist.title);
      await facebookService.create({
        kind: "longvideo", enabled: true, mode: "recurring",
        title: schTitle.trim(), source, times: cleanTimes, days, timezone: "Asia/Kolkata",
        order: useByQuiz ? "sequential" : order, stopWhenExhausted, hashtags: hashtags.trim(),
        ...(firstRunAt ? { startAt: localToIso(firstRunAt) } : {}),
        longVideo: {
          options: useByQuiz ? { ...buildOptions(), order: "sequential", start: 1 } : buildOptions(), title: title.trim(), privacy,
          playlist: pl === undefined ? "" : pl.id ? pl : "__none__",
          useThumbnail: useThumb,
          nextStart: useByQuiz || order === "random" ? 1 : nStart, part: 0,
          ...(useByQuiz ? { byQuiz: true, quizStartId, quizId: "", quizIdx: 0 } : {}),
        },
      });
      setMsg({ ok: true, text: useByQuiz
        ? `Quiz-by-quiz schedule created — ${quizPlan.quizzes} quizzes (${quizPlan.first?.name} → ${quizPlan.last?.name}), ${quizPlan.videos} videos, one at each time${firstRunAt ? ` from ${new Date(firstRunAt).toLocaleString()}` : ""}. It's in Scheduled posts below.`
        : `Long-video schedule created for ${source.label || "the picked content"} — it's in Scheduled posts below. Each time makes the next ${qMode === "all" ? maxQ : nCount} questions as one video.` });
      setSource({ subject: null, session: null, quiz: null, testSeries: null, label: "" }); setPickerKey((k) => k + 1); setTotal(null);
      setSchTitle(""); setTimes(["09:00"]); setDays([]); setFirstRunAt(""); setTopicQuizzes(null);
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const start = async () => {
    if (when === "repeat") { createRepeat(); return; }
    if (!hasSource) { setMsg({ ok: false, text: "Pick the topic / quiz first." }); return; }
    if (planned && planned.n === 0) { setMsg({ ok: false, text: `This content has only ${total} questions — lower "Start from".` }); return; }
    if (!toYoutube && !toFacebook) { setMsg({ ok: false, text: "Choose YouTube and/or Facebook." }); return; }
    if (publishAtError(publishAt)) { setMsg({ ok: false, text: publishAtError(publishAt) }); return; }
    setBusy(true); setMsg(null);
    try {
      const pl = playlistChoice(playlist.id, playlist.title);
      await youtubeService.longVideo({
        source, title: title.trim(), privacy, publishAt: localToIso(publishAt), hashtags: hashtags.trim(),
        ...(pl ? { playlist: pl } : {}), useThumbnail: useThumb,
        options: buildOptions(),
      });
      setMsg({ ok: true, text: `Started — the video is being made in “Recent long videos” below. It can take 5–20 minutes; you can leave this page (you'll get an email).${publishAt ? ` It goes live on ${new Date(publishAt).toLocaleString()}.` : ""} Tip: don't deploy a backend update while it's being made — that stops it (you can Retry).` });
      setPublishAt("");
      // Next part: continue from where this video ends.
      if (qMode === "custom" && order === "sequential" && planned?.to) setStartAt(planned.to + 1);
      else { setSource({ subject: null, session: null, quiz: null, testSeries: null, label: "" }); setPickerKey((k) => k + 1); setTotal(null); }
      load();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  const previewVideo = async () => {
    if (!hasSource) { setPv({ ...PV_EMPTY, error: "Pick the topic / quiz first." }); return; }
    if (planned && planned.n === 0) { setPv({ ...PV_EMPTY, error: `This content has only ${total} questions — lower "Start from".` }); return; }
    setPv({ busy: true, job: { status: "queued", percent: 0, createdAt: Date.now() }, error: "" });
    setPubMsg(null);
    setClock(Date.now());
    try {
      const startRes = await youtubeService.longVideoPreview({ source, title: title.trim(), useThumbnail: useThumb, options: buildOptions() });
      const id = startRes?.job?.id;
      if (!id) throw new Error(startRes?.message || "Could not start the preview.");
      setPv({ busy: true, job: startRes.job, error: "" });
      const deadline = Date.now() + 90 * 60 * 1000;
      let errors = 0;
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        let j;
        try { j = (await youtubeService.longVideoPreviewStatus(id))?.job; errors = 0; }
        catch (e) { if ((e?.status >= 400 && e?.status < 500) || ++errors >= 8) throw e; continue; }
        if (!j) continue;
        if (j.status === "done") { setPv({ busy: false, job: j, error: "" }); return; }
        if (j.status === "failed") throw new Error(j.error || "The preview could not be made.");
        setPv({ busy: true, job: j, error: "" });
        if (Date.now() > deadline) throw new Error("The preview is taking too long — please try again.");
      }
    } catch (e) {
      setPv({ busy: false, job: null, error: e?.message || "The preview could not be made." });
    }
  };
  // "Publish" on a finished preview: posts THOSE files (no re-render), with the
  // form's current Post to / visibility / time / playlist / hashtags.
  const [pubBusy, setPubBusy] = useState(false);
  const [pubMsg, setPubMsg] = useState(null);
  const publishPreview = async () => {
    const id = pv.job?.id; if (!id) return;
    if (!toYoutube && !toFacebook) { setPubMsg({ ok: false, text: "Choose YouTube and/or Facebook under “Post to”." }); return; }
    if (publishAtError(publishAt)) { setPubMsg({ ok: false, text: publishAtError(publishAt) }); return; }
    setPubBusy(true); setPubMsg(null);
    try {
      const pl = playlistChoice(playlist.id, playlist.title);
      await youtubeService.publishLongVideoPreview(id, {
        privacy, publishAt: localToIso(publishAt), hashtags: hashtags.trim(),
        ...(pl ? { playlist: pl } : {}),
        options: { toYoutube, toFacebook, asShort: toYoutube && asShort, shortToFacebook, shortToInstagram, linkComment, toTelegram: lvToTelegram },
      });
      setPv((p) => ({ ...p, job: p.job ? { ...p.job, canPublish: false, published: true } : p.job }));
      setPubMsg({ ok: true, text: `Publishing — the previewed video${toYoutube && asShort ? " and Short are" : " is"} being uploaded (not re-made). Follow it in “Recent long videos” below.${publishAt ? ` It goes live on ${new Date(publishAt).toLocaleString()}.` : ""}` });
      load();
    } catch (e) { setPubMsg({ ok: false, text: e?.message || "Could not publish." }); } finally { setPubBusy(false); }
  };
  // Retry a failed video (e.g. one stopped by a server restart / deploy).
  const [retrying, setRetrying] = useState("");
  const retryJob = async (id) => {
    setRetrying(id); setMsg(null);
    try { await youtubeService.retryLongVideo(id); setMsg({ ok: true, text: "Started again with the same settings — follow it below." }); load(); }
    catch (e) { setMsg({ ok: false, text: e?.message || "Could not retry." }); } finally { setRetrying(""); }
  };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
  const PV_PHASE = { picking: "Loading questions", full: "Full video", short: "Short", vertical: "Short", upload: "Saving", thumb: "Thumbnail" };

  const step = (n, text) => <p className="mb-1 mt-5 text-sm font-semibold">{n}. {text}</p>;
  const secInput = (value, set, lo, hi, def) => (
    <input type="number" min={lo} max={hi} className="input h-9 w-20" value={value}
      onChange={(e) => set(e.target.value)} onBlur={(e) => set(clamp(e.target.value, def, lo, hi))} />
  );

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Makes <b>one landscape video</b> from a topic, narrated, with a clickable chapter for every question — then posts it to <b>YouTube</b> and/or your <b>Facebook Page</b>, now or at a scheduled time.
      </p>

      {step(1, "Content")}
      <SourcePicker key={pickerKey} onPick={(s) => { setSource(s); setTotal(null); setStartAt(1); }} />
      {source.label && <p className="mt-1 text-xs text-slate-500">Selected: <b>{source.label}</b>{known ? <> · <b>{total}</b> complete question{total === 1 ? "" : "s"}</> : hasSource ? " · counting…" : ""}</p>}

      {step(2, "Questions")}
      <div className="grid gap-2 sm:grid-cols-2">
        {[["all", when === "repeat" ? `${maxQ} questions per video (most)` : `All questions (up to ${maxQ})`], ["custom", when === "repeat" ? "Choose how many per video" : "Choose how many"]].map(([k, l]) => (
          <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${qMode === k ? "border-[#FF0000] bg-red-50/50 dark:bg-red-900/10" : "border-slate-200 dark:border-slate-700"}`}>
            <input type="radio" name="lvQMode" className="h-4 w-4 accent-[#FF0000]" checked={qMode === k} onChange={() => setQMode(k)} /> {l}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        {qMode === "custom" && (
          <div>
            <label className="mb-1 block text-sm font-medium">Questions in the video</label>
            <input type="number" min={1} max={maxQ} className="input h-9 w-24" value={count} onChange={(e) => setCount(e.target.value)} onBlur={() => setCount(nCount)} />
          </div>
        )}
        {order === "sequential" && (
          <div>
            <label className="mb-1 block text-sm font-medium">Start from question</label>
            <input type="number" min={1} className="input h-9 w-24" value={startAt} onChange={(e) => setStartAt(e.target.value)} onBlur={() => setStartAt(nStart)} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Order</label>
          <select className="input h-9" value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="sequential">Sequential (oldest first)</option>
            <option value="random">Random</option>
          </select>
        </div>
      </div>
      {planned && (
        <p className={`mt-2 text-xs ${planned.n ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
          {planned.n === 0 ? `Nothing to make — this content has only ${total} questions.`
            : planned.random ? <>The video will have <b>{planned.n}</b> random questions.</>
            : <>The video will have questions <b>{planned.from}–{planned.to}</b> ({planned.n}){total > planned.to ? <> — {total - planned.to} more left for a next part (start from {planned.to + 1}).</> : "."}</>}
          {planned.n > 0 && <> About <b>{Math.max(1, Math.round((planned.n * perQ) / 60))} min</b> long.</>}
        </p>
      )}

      {step(3, "Narration & slides")}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Narration engine</label>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => {
              const paid = PAID_ENGINES[p];
              const keySet = paid ? !!settings?.[`${paid.keyField}Set`] : true;
              return (
                <option key={p} value={p}>
                  {p === "gtranslate" ? "Free — Google (no key)" : p === "edge" ? "Free — Microsoft Edge (no key)" : `Paid — ${paid?.label || p}${keySet ? " ✓ key saved" : " (add the key in AI Slideshow)"}`}
                </option>
              );
            })}
          </select>
          {PAID_ENGINES[provider] && !settings?.[`${PAID_ENGINES[provider].keyField}Set`] && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No key saved for this engine — add it in the <b>AI Slideshow</b> card, or the free Google voice is used.</p>
          )}
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium"><Volume2 className="h-4 w-4 text-slate-400" /> Voice</label>
          {FREE_FORM_VOICE.has(provider) && !voices.length
            ? <input className="input" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Voice ID" />
            : (
              <select className="input" value={voiceValue} onChange={(e) => setVoice(e.target.value)}>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
              </select>
            )}
          <p className="mt-1 text-xs text-slate-400">API keys and models are set once in the <b>AI Slideshow</b> card.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Captions</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Show the narration as captions on the slides</label>
        </div>
      </div>

      {/* Which slides each question gets — same choices as the AI Slideshow */}
      <p className="mb-1.5 mt-4 flex items-center gap-1.5 text-sm font-medium"><Film className="h-4 w-4 text-slate-400" /> Slides per question</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["both", "Question + answer slide", "Slide 1 asks the question; slide 2 reveals the answer, explanation, key points & quick recall."],
          ["question", "Question slide only", "After the question is read, a short pause, then the correct option turns green on the same slide. No explanation slide."],
        ].map(([value, label, hint]) => (
          <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${slidesMode === value ? "border-brand-500 bg-brand-50/60 dark:bg-brand-900/20" : "border-slate-200 dark:border-slate-700"}`}>
            <input type="radio" name="lvSlidesMode" className="mt-0.5 h-4 w-4 accent-brand-600" checked={slidesMode === value} onChange={() => setSlidesMode(value)} />
            <span><span className="font-medium">{label}</span><span className="mt-0.5 block text-xs text-slate-400">{hint}</span></span>
          </label>
        ))}
      </div>

      {!withAnswer && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Answer reveal</p>
          <div className="flex flex-wrap items-end gap-4">
            {[
              ["pauseSec", "Thinking pause", "silence after the question is read", 0, 15],
              ["showSec", "Show green answer for", "the correct option in green", 1, 15],
            ].map(([key, label, hint, lo, hi]) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium">{label}</label>
                <div className="flex items-center gap-2">
                  {secInput(reveal[key], (v) => setReveal((r) => ({ ...r, [key]: v })), lo, hi, 3)}
                  <span className="text-xs text-slate-500">sec</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
              </div>
            ))}
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={reveal.say} onChange={(e) => setReveal((r) => ({ ...r, say: e.target.checked }))} />
              Say the answer (“The correct answer is option B: 1, 2 and 3”)
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["Question time", "Slide 1 — question + options", questionSec, setQuestionSec, 10],
          ...(withAnswer ? [["Answer reveal time", "Slide 2 — answer + explanation", answerSec, setAnswerSec, 8]] : []),
        ].map(([label, hint, value, setValue, def]) => (
          <div key={label}>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium"><Clock className="h-4 w-4 text-slate-400" /> {label}</label>
            <div className="flex items-center gap-2">
              {secInput(value, setValue, 3, 40, def)}
              <span className="text-sm text-slate-500 dark:text-slate-400">seconds</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Each question ≈ {perQ}s{planned?.n ? <> · whole video ≈ <b>{Math.max(1, Math.round((planned.n * perQ) / 60))} min</b> ({planned.n} questions)</> : ""}. If the voice needs longer than the time you set, that slide stays up until the narration finishes.
      </p>

      <p className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-medium"><Volume2 className="h-4 w-4 text-slate-400" /> Read aloud</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(withAnswer ? [1, 2] : [1]).map((slide) => (
          <div key={slide} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{slide === 1 ? "Slide 1 — question" : "Slide 2 — answer"}</p>
            {slide === 2 && (
              <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-400">
                <input type="checkbox" className="h-4 w-4" checked disabled /> Correct answer <span className="text-xs">(always read)</span>
              </label>
            )}
            {READ_TOGGLES.filter((t) => t.slide === slide).map((t) => (
              <label key={t.key} className="mb-1.5 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={readOpts[t.key] !== false}
                  onChange={(e) => setReadOpts((r) => ({ ...r, [t.key]: e.target.checked }))} />
                {t.label} <span className="text-xs text-slate-400">({t.hint})</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-400">Each ticked part is read in full. Reading more makes the video longer than the slide times above.</p>

      {/* 16:9 slide templates (separate from the 9:16 Reel templates) */}
      <p className="mb-1 mt-4 text-sm font-medium">Slide templates <span className="font-normal text-slate-400">(optional, 16:9)</span></p>
      <p className="mb-2 text-xs text-slate-400">
        Your own background for the slides — best at <b>1920×1080</b>. Keep a band at the <b>top</b> (about 190 px, logo/title) and the <b>bottom</b> (about 150 px, website/buttons) for your branding; the question or answer goes on a white card in the middle. Saved for every long video; leave empty for the built-in design. These are separate from the tall (9:16) Reel templates in the AI Slideshow card.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SlideTemplateUploader landscape label={withAnswer ? "Question slide template" : "Question & green-answer template"}
          hint={withAnswer ? "Background for the question + options slide" : "Used for the question and the green reveal (same slide)"}
          settingKey="longVideoQuestionTemplateUrl" settings={settings} saveSettings={saveSettings} />
        {withAnswer && (
          <SlideTemplateUploader landscape label="Answer slide template" hint="Background for the answer + explanation slide"
            settingKey="longVideoAnswerTemplateUrl" settings={settings} saveSettings={saveSettings} />
        )}
      </div>
      <CardBoxEditor landscape key={`cb-l-${settings?.longVideoQuestionTemplateUrl || settings?.longVideoAnswerTemplateUrl || ""}`}
        templateUrl={settings?.longVideoQuestionTemplateUrl || settings?.longVideoAnswerTemplateUrl || ""}
        boxKey="longVideoCardBox" settings={settings} saveSettings={saveSettings} />
      {st && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={hideAllSlideText} disabled={hidingText || allSlideTextHidden} className="btn-outline text-sm">
            {hidingText ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {allSlideTextHidden ? "Text hidden on end slides ✓" : "Hide text on end slides"}
          </button>
          <span className="text-xs text-slate-400">Full video + Short end slides: viewers see only your templates, the narrator still reads the lines. The intro slide keeps its text.</span>
          {hideMsg && <span className={`w-full text-xs font-medium ${hideMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>{hideMsg.text}</span>}
        </div>
      )}
      {st && (
        <div key={slideEdRev} className="mt-3 space-y-3">
          <SlideTextEditor role="intro" title="Intro slide" note="Opening title (subject / topic · “Let's begin”)."
            settingKey="longVideoIntroText" templateKey="longVideoIntroTemplateUrl" initial={st.introText} onSaved={onStatus} ttsEngine={provider} ttsVoice={voiceValue} />
          <SlideTextEditor role="outro" title="End slide (full video)" note="Closing “Thanks for watching · subscribe, like &amp; share for more”."
            settingKey="longVideoOutroText" templateKey="longVideoOutroTemplateUrl" initial={st.outroText} onSaved={onStatus} ttsEngine={provider} ttsVoice={voiceValue} />
          <p className="pt-2 text-sm font-semibold">Short slides <span className="font-normal text-slate-400">(vertical 9:16 — the Short is made vertical from the start)</span></p>
          <p className="text-xs text-slate-400">The Short's question / answer slides use the <b>9:16 Reel templates</b> from the AI Slideshow card.</p>
          <SlideTextEditor role="shortintro" title="Intro slide (Short)" note="The Short's opening title (subject / topic · “Let's begin”)."
            settingKey="longVideoShortIntroText" templateKey="longVideoShortIntroTemplateUrl" initial={st.shortIntroText} onSaved={onStatus} ttsEngine={provider} ttsVoice={voiceValue} />
          <SlideTextEditor role="shortoutro" title="End slide (Short)" note="Short's closing “Thanks for watching · subscribe, like &amp; share · watch the full quiz on the channel”."
            settingKey="longVideoShortOutroText" templateKey="longVideoShortOutroTemplateUrl" initial={st.shortOutroText} onSaved={onStatus} ttsEngine={provider} ttsVoice={voiceValue} />
        </div>
      )}
      {(settings?.longVideoQuestionTemplateUrl || (withAnswer && settings?.longVideoAnswerTemplateUrl) || st?.introText?.templateUrl || st?.outroText?.templateUrl || st?.shortOutroText?.templateUrl || st?.shortIntroText?.templateUrl || settings?.slideshowQuestionTemplateUrl) && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={useTemplates} onChange={(e) => setUseTemplates(e.target.checked)} />
          Use my slide templates for this video
        </label>
      )}
      {withAnswer && settings?.longVideoQuestionTemplateUrl && !settings?.longVideoAnswerTemplateUrl && useTemplates && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No answer template — the answer slides will use the built-in design.</p>
      )}

      {step(4, "Post to")}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={toYoutube} onChange={(e) => setToYoutube(e.target.checked)} /> <Youtube className="h-4 w-4 text-[#FF0000]" /> YouTube <span className="text-slate-400">(normal video)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#1877F2]" checked={toFacebook} onChange={(e) => setToFacebook(e.target.checked)} /> <Facebook className="h-4 w-4 text-[#1877F2]" /> Facebook Page <span className="text-slate-400">(normal video)</span>
        </label>
      </div>
      {toYoutube && !ready.youtube && <p className="mt-1 text-xs text-amber-600">YouTube isn't connected — connect it in the YouTube Shorts card.</p>}
      {toFacebook && !ready.facebook && <p className="mt-1 text-xs text-amber-600">Facebook isn't connected — add your Page ID and token in the Facebook settings.</p>}
      {/* Short option — YouTube only, and only for videos of about 3 minutes or less. */}
      {toYoutube && (
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#FF0000]" checked={asShort} onChange={(e) => setAsShort(e.target.checked)} />
          <span>Also post a <b>YouTube Short</b> <span className="text-slate-400">— a vertical teaser of the <b>first 3 questions</b> with a link to the full video in its description. You get <b>two</b> YouTube uploads: the full video and the Short.</span></span>
        </label>
      )}
      {/* The same vertical Short on Facebook and Instagram as a Reel. */}
      <div className="mt-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
        <p className="mb-1.5 text-sm font-medium">Also post the Short as a Reel</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[#1877F2]" checked={shortToFacebook} onChange={(e) => setShortToFacebook(e.target.checked)} /> <Facebook className="h-4 w-4 text-[#1877F2]" /> Facebook Reel
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[#E1306C]" checked={shortToInstagram} onChange={(e) => setShortToInstagram(e.target.checked)} /> <Instagram className="h-4 w-4 text-[#E1306C]" /> Instagram Reel
          </label>
          <label className="flex items-center gap-2 text-sm" title="A message with the full video's link (and the Short's) — not the video file">
            <input type="checkbox" className="h-4 w-4 accent-[#229ED9]" checked={lvToTelegram} onChange={(e) => setLvToTelegram(e.target.checked)} /> <Send className="h-4 w-4 text-[#229ED9]" /> Telegram <span className="text-slate-400">(link to the video)</span>
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-400">The same vertical Short (first 3 questions), with the full video's link in the caption. Posted when you publish right away (a scheduled video isn't public yet).</p>
        {(shortToFacebook || shortToInstagram) && !ready.facebook && <p className="mt-1 text-xs text-amber-600">Facebook isn't connected — Reels need your Page (and its linked Instagram account).</p>}
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={linkComment} onChange={(e) => setLinkComment(e.target.checked)} />
          <span>Comment the <b>full video's link</b> under the YouTube Short and the Reels <span className="text-slate-400">— “▶ Watch the full video: …”. YouTube, Facebook and Instagram don't let apps <b>pin</b> a comment, so tap ⋮ → <b>Pin</b> on it once (it's the first comment). YouTube needs <b>Reconnect YouTube</b> once for the comment permission.</span></span>
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Title <span className="font-normal text-slate-400">(optional — used on YouTube and Facebook)</span></label>
          <input className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={planned && !planned.random && (planned.from > 1 || planned.to < total)
              ? `Automatic: Subject | Topic | Quiz 1 (Part ${Math.floor((planned.from - 1) / Math.max(1, qMode === "all" ? maxQ : nCount)) + 1}) (${planned.n} Questions)`
              : `Automatic: Subject | Topic | Quiz 1 (${planned?.n || 25} Questions)`} />
        </div>
        {toYoutube && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">YouTube visibility</label>
              <select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">YouTube playlist (folder)</label>
              {st?.connected
                ? <YtPlaylistPicker value={playlist.id} onChange={(id, t) => setPlaylist({ id, title: t })} emptyLabel={defaultPlaylistLabel(st)} noneOption={!!st?.longPlaylist?.id} />
                : <p className="text-xs text-slate-400">Playlists appear here after you click <b>Connect YouTube</b> in the YouTube Shorts card (they're read from the channel).</p>}
            </div>
          </>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Extra hashtags <span className="font-normal text-slate-400">(optional)</span></label>
          <input className="input" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#GK #JKSSB" />
        </div>
      </div>

      {/* Thumbnail — upload the template ONCE; the text is filled in per video */}
      <p className="mb-1 mt-4 text-sm font-medium">Thumbnail</p>
      {st
        ? <YtThumbnailTemplateEditor st={st} onSaved={onStatus} />
        : <p className="flex items-center gap-1 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>}
      {thumbReady(st) && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={useThumb} onChange={(e) => setUseThumb(e.target.checked)} />
          Use my thumbnail for this video <span className="text-slate-400">(its subject, topic &amp; quiz are written on it · YouTube + Facebook)</span>
        </label>
      )}

      {step(5, "When")}
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["once", "One video", "Make this video once — publish now or at a date & time."],
          ["repeat", "Repeat — the next part at set times", "A schedule: each time makes the next questions as a new video (Part 1, Part 2 …) until the topic is done."],
        ].map(([k, l, hint]) => (
          <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${when === k ? "border-[#FF0000] bg-red-50/50 dark:bg-red-900/10" : "border-slate-200 dark:border-slate-700"}`}>
            <input type="radio" name="lvWhen" className="mt-0.5 h-4 w-4 accent-[#FF0000]" checked={when === k} onChange={() => setWhen(k)} />
            <span><span className="font-medium">{l}</span><span className="mt-0.5 block text-xs text-slate-400">{hint}</span></span>
          </label>
        ))}
      </div>
      {when === "once" ? (
        <div className="mt-3">
          <YtPublishTimeField key={pickerKey} value={publishAt} onChange={setPublishAt}
            note={`The video is made and uploaded right away; ${[toYoutube && "YouTube", toFacebook && "Facebook"].filter(Boolean).join(" and ") || "it"} publish${toYoutube && toFacebook ? "" : "es"} it at this time.`} />
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium"><Clock className="h-4 w-4 text-slate-400" /> Times (a new video at each)</p>
          <div className="flex flex-wrap items-center gap-2">
            {times.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
                <input type="time" value={t} onChange={(e) => setTimes((ts) => ts.map((x, k) => (k === i ? e.target.value : x)))} className="bg-transparent text-sm outline-none" />
                {times.length > 1 && <button type="button" onClick={() => setTimes((ts) => ts.filter((_, k) => k !== i))} className="text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>}
              </span>
            ))}
            <button type="button" onClick={() => setTimes((ts) => [...ts, "18:00"])} className="btn-outline !py-1 !text-xs"><Plus className="h-3.5 w-3.5" /> Add time</button>
          </div>
          <p className="mb-1 mt-3 flex items-center gap-1.5 text-sm font-medium"><CalendarClock className="h-4 w-4 text-slate-400" /> Days <span className="font-normal text-slate-400">(none = every day)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => (
              <button type="button" key={w.v} onClick={() => setDays((dd) => (dd.includes(w.v) ? dd.filter((x) => x !== w.v) : [...dd, w.v]))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${days.includes(w.v) ? "bg-[#FF0000] text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{w.l}</button>
            ))}
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium">Start on <span className="font-normal text-slate-400">(optional — the FIRST video is made at exactly this date &amp; time, then at the times above)</span></label>
            <input type="datetime-local" className="input h-9 w-auto" value={firstRunAt} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setFirstRunAt(e.target.value)} />
            {firstRunAt && (() => {
              const d = new Date(firstRunAt);
              const t = times.filter(Boolean).sort();
              return (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                  First video: <b>{d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</b>
                  {t.length ? <> · then {days.length ? "on the chosen days" : "every day"} at <b>{t.join(", ")}</b></> : null}.
                </p>
              );
            })()}
          </div>
          {isTopicSource && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={byQuiz} onChange={(e) => setByQuiz(e.target.checked)} />
                <span><b>Quiz by quiz</b> <span className="text-slate-500 dark:text-slate-400">— one quiz per time, in order, through the whole topic. A quiz with more than {perVideo} questions is split: <b>Quiz 5 (Part 1)</b>, then <b>Quiz 5 (Part 2)</b>… then the next quiz.</span></span>
              </label>
              {byQuiz && (
                topicQuizzes == null ? <p className="mt-2 text-xs text-slate-500"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Loading the topic's quizzes…</p>
                : !topicQuizzes.length ? <p className="mt-2 text-xs text-rose-600">This topic has no quizzes (disabled ones are skipped).</p>
                : (
                  <div className="mt-2">
                    <label className="mb-1 block text-sm font-medium">Start from quiz</label>
                    <select className="input h-9" value={quizStartId} onChange={(e) => setQuizStartId(e.target.value)}>
                      {topicQuizzes.map((q) => <option key={q.id} value={q.id}>{q.name} — {q.questions} question{q.questions === 1 ? "" : "s"}{q.videos > 1 ? ` (${q.videos} parts)` : ""}</option>)}
                    </select>
                    {quizPlan && (
                      <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                        {quizPlan.skipped > 0 && <>Skips {quizPlan.skipped} quiz{quizPlan.skipped === 1 ? "" : "zes"} before it. </>}
                        Publishes <b>{quizPlan.quizzes}</b> quiz{quizPlan.quizzes === 1 ? "" : "zes"} ({quizPlan.first?.name} → {quizPlan.last?.name || "—"}) as <b>{quizPlan.videos}</b> video{quizPlan.videos === 1 ? "" : "s"} — one at each time{times.filter(Boolean).length > 1 ? `, ${times.filter(Boolean).length} a day` : ""}.
                        {quizPlan.empty > 0 && <> {quizPlan.empty} empty quiz{quizPlan.empty === 1 ? " is" : "zes are"} skipped.</>}
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Schedule name <span className="font-normal text-slate-400">(optional, for the list)</span></label>
              <input className="input" value={schTitle} onChange={(e) => setSchTitle(e.target.value)} placeholder="e.g. Polity full quiz — daily part" />
            </div>
            <label className="flex items-start gap-2 self-end text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#FF0000]" checked={stopWhenExhausted} onChange={(e) => setStopWhenExhausted(e.target.checked)} />
              <span>Stop when every question has been used <span className="text-slate-400">(else start again from question 1)</span></span>
            </label>
          </div>
          {known && order === "sequential" && (() => {
            const per = qMode === "all" ? maxQ : nCount;
            const left = Math.max(0, total - nStart + 1);
            const parts = Math.ceil(left / per);
            return (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                Part 1 = questions {nStart}–{Math.min(total, nStart + per - 1)} · <b>{parts}</b> video{parts === 1 ? "" : "s"} in all ({left} questions, {per} per video).
              </p>
            );
          })()}
          <p className="mt-1 text-xs text-slate-400">Each video is posted as soon as it's ready (a few minutes after its time). Title: <b>Subject | Topic | Quiz 1 (Part 1) (25 Questions)</b> — or <b>Quiz 1 (25 Questions)</b> when one video holds the whole quiz — unless you type one. The description starts with the title. It appears under <b>Scheduled posts</b>, where you can pause, run now or delete it.</p>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">Your default + subject/topic hashtags are added automatically (YouTube tags too). Tip: tick <b>“Also make one full video”</b> on a Shorts schedule to have this made automatically after its last Short.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={start} disabled={busy || !hasSource || (!toYoutube && !toFacebook)} className="btn-primary !bg-[#FF0000] hover:!bg-[#d90000]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : when === "repeat" ? <Plus className="h-4 w-4" /> : <Clapperboard className="h-4 w-4" />}
          {when === "repeat" ? "Create long-video schedule" : publishAt ? "Make & schedule video" : "Make & post video"}
        </button>
        <button type="button" onClick={saveDefaults} disabled={savingDefaults} className="btn-outline">
          {savingDefaults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings only
        </button>
        <button type="button" onClick={previewVideo} disabled={pv.busy || !hasSource} className="btn-outline">
          {pv.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Preview video
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
      {pv.busy && pv.job && (() => {
        const j = pv.job;
        // Time from when THIS preview started rendering (not while it waited in line).
        const since = j.startedAt || j.createdAt || clock;
        const elapsed = Math.max(0, Math.floor((clock - since) / 1000));
        const pct = Number.isFinite(j.percent) ? j.percent : 0;
        const remain = j.status === "running" && pct > 2 ? Math.round((elapsed * (100 - pct)) / pct) : null;
        const stepText = j.status === "queued" ? "Waiting for another video to finish"
          : `${PV_PHASE[j.phase] || "Working"} — ${j.stageLabel || "working"}${j.progress?.total ? ` ${j.progress.done}/${j.progress.total}` : ""}`;
        return (
          <div className="mt-2 max-w-xl">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-[#FF0000] transition-all" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Preview: <b>{pct}%</b> · {stepText} · {mmss(elapsed)} elapsed{remain != null ? <> · about <b>{mmss(remain)}</b> left</> : " · estimating time left…"}
            </p>
          </div>
        );
      })()}
      {!pv.busy && (
        <p className="mt-1 text-xs text-slate-400">
          Preview makes the <b>full video</b>{planned?.n ? <> ({planned.n} questions, with intro &amp; end slides)</> : " (with intro & end slides)"}, the <b>Short</b> (first 3 questions) and the <b>thumbnail</b> — exactly as they'd be posted, but nothing is posted. It takes about as long as a real video. Save settings only keeps these settings for next time.
        </p>
      )}
      {pv.error && <p className="mt-2 text-sm font-medium text-rose-600">{pv.error}</p>}
      {!pv.busy && pv.job?.status === "done" && (() => {
        const j = pv.job;
        return (
          <div className="mt-3 space-y-4">
            {j.title && <p className="text-sm">Title: <b>{j.title}</b></p>}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="mb-1 text-sm font-semibold">Full video <span className="font-normal text-slate-400">(YouTube / Facebook)</span></p>
                <video src={j.videoUrl} poster={j.thumbnailUrl || undefined} controls playsInline preload="metadata" className="aspect-video w-full max-w-xl rounded-lg bg-black" />
                <p className="mt-1 text-xs text-slate-500">
                  {j.questions} question{j.questions === 1 ? "" : "s"}{j.range ? ` (Q${j.range})` : ""} · {mmss(j.duration || 0)} · intro + end slide{j.voice ? ` · ${j.voice}` : ""}
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold">Short <span className="font-normal text-slate-400">(YouTube Shorts)</span></p>
                <video src={j.shortUrl} controls playsInline preload="metadata" className="aspect-[9/16] w-56 rounded-lg bg-black" />
                <p className="mt-1 text-xs text-slate-500">{j.shortQuestions} question{j.shortQuestions === 1 ? "" : "s"} · {mmss(j.shortDuration || 0)} · intro + Short end slide</p>
              </div>
            </div>
            {j.thumbnailUrl && (
              <div>
                <p className="mb-1 text-sm font-semibold">Thumbnail</p>
                <img src={j.thumbnailUrl} alt="Video thumbnail" className="aspect-video w-full max-w-sm rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
              </div>
            )}
            {j.notes?.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{j.notes.join(" · ")}</p>}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Happy with it? Publish these videos</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Posts exactly what you see above — no re-making. Goes to: <b>{[toYoutube && `YouTube (${privacy})`, toYoutube && asShort && "YouTube Short", toFacebook && "Facebook Page", shortToFacebook && "Facebook Reel", shortToInstagram && "Instagram Reel", lvToTelegram && "Telegram (link)"].filter(Boolean).join(" + ") || "nothing selected"}</b>
                {publishAt ? <> · goes live <b>{new Date(publishAt).toLocaleString()}</b></> : " · right away"}. Change these under <b>Post to</b> above.
              </p>
              <button type="button" onClick={publishPreview} disabled={pubBusy || !j.canPublish || (!toYoutube && !toFacebook)}
                className="btn-primary mt-2 !bg-emerald-600 hover:!bg-emerald-700">
                {pubBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {j.published || j.publishedJobId ? "Published ✓" : publishAt ? "Schedule these videos" : "Publish these videos"}
              </button>
              {pubMsg && <p className={`mt-2 text-sm font-medium ${pubMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>{pubMsg.text}</p>}
            </div>
          </div>
        );
      })()}

      {jobs.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold">Recent long videos</p>
          {jobs.map((j) => (
            <div key={j.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{j.title || j.label || "Full quiz video"}{j.auto && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">auto</span>}</span>
                <span className={`text-xs font-semibold ${j.status === "done" ? "text-emerald-600" : j.status === "failed" ? "text-rose-600" : "text-amber-600"}`}>
                  {j.status === "done" ? "Posted" : j.status === "failed" ? "Failed" : j.stageLabel}
                  {(j.status === "running" || j.status === "queued") && Number.isFinite(j.percent) ? ` · ${j.percent}%` : ""}
                </span>
              </div>
              {(j.status === "running" || j.status === "queued") && Number.isFinite(j.percent) && (() => {
                const elapsed = Math.max(0, Math.floor((clock - (j.createdAt || clock)) / 1000));
                const remain = j.percent > 3 ? Math.round((elapsed * (100 - j.percent)) / j.percent) : null;
                const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
                return (
                  <div className="mt-1.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-[#FF0000] transition-all" style={{ width: `${Math.max(2, j.percent)}%` }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {j.percent}% · {mmss(elapsed)} elapsed{remain != null ? ` · about ${mmss(remain)} left` : ""}
                    </p>
                  </div>
                );
              })()}
              <p className="mt-0.5 text-xs text-slate-500">
                {[j.toYoutube && "YouTube", j.toFacebook && "Facebook"].filter(Boolean).join(" + ")}
                {j.questions ? ` · ${j.questions} questions${j.range ? ` (Q${j.range})` : ""}` : ""}{j.duration ? ` · ${Math.floor(j.duration / 60)}:${String(j.duration % 60).padStart(2, "0")} min` : ""}
                {j.publishAt ? ` · publishes ${new Date(j.publishAt).toLocaleString()}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-3">
                {j.url && <a href={j.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#FF0000] hover:underline">Open on YouTube{j.privacy && j.privacy !== "public" ? ` (${j.privacy})` : ""}</a>}
                {j.shortUrl && <a href={j.shortUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#FF0000] hover:underline">Open Short</a>}
                {j.fbUrl && <a href={j.fbUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#1877F2] hover:underline">Open on Facebook</a>}
              </div>
              {j.notes?.length > 0 && <p className="mt-1 text-xs text-slate-500">{j.notes.join(" · ")}</p>}
              {j.error && <p className="mt-1 text-xs text-rose-600">{j.error}</p>}
              {j.status === "failed" && j.canRetry && (
                <button type="button" onClick={() => retryJob(j.id)} disabled={retrying === j.id} className="btn-outline mt-2 !px-2.5 !py-1 text-xs">
                  {retrying === j.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Retry — make it again with the same settings
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnVideoUploadForm({ st, onStatus }) {
  const [file, setFile] = useState(null);
  const [thumb, setThumb] = useState(null);
  const [useTemplate, setUseTemplate] = useState(true);
  const [playlist, setPlaylist] = useState({ id: "", title: "" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [publishAt, setPublishAt] = useState("");
  const [pct, setPct] = useState(null);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(null);
  const busy = pct !== null;

  const pickFile = (f) => {
    setFile(f || null); setDone(null); setMsg(null);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 100));
  };
  const upload = async () => {
    if (!file) { setMsg({ ok: false, text: "Choose a video file." }); return; }
    if (!title.trim()) { setMsg({ ok: false, text: "Add a title." }); return; }
    if (publishAtError(publishAt)) { setMsg({ ok: false, text: publishAtError(publishAt) }); return; }
    setPct(0); setMsg(null); setDone(null);
    // Keep the screen awake / warn before leaving while uploading.
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    try {
      const tagList = tags.split(/[,#\n]+/).map((t) => t.trim()).filter(Boolean).slice(0, 30);
      const r = await uploadVideoFileToYoutube(file, {
        title: title.trim().replace(/[<>]/g, "").slice(0, 100),
        description: description.replace(/[<>]/g, "").slice(0, 4900),
        tags: tagList, privacy, publishAt: localToIso(publishAt),
      }, { thumbnail: thumb, onProgress: (p) => setPct(Math.round(p * 100)) });
      // Template thumbnail (when no own image was chosen) + playlist — done on the server.
      const pl = playlistChoice(playlist.id, playlist.title) ?? (st?.longPlaylist?.id ? st.longPlaylist : null);
      const wantTemplate = !thumb && useTemplate && thumbReady(st);
      let notes = [];
      if (wantTemplate || pl?.id) {
        try {
          notes = (await youtubeService.finishUpload(r.id, { title: title.trim(), useThumbnail: wantTemplate, playlist: pl?.id ? pl : null }))?.notes || [];
        } catch (e) { notes = [`Thumbnail/playlist not set: ${e.message}`]; }
      }
      setDone(r);
      setMsg({ ok: true, text: `Uploaded${r.privacy && r.privacy !== privacy ? ` (YouTube set it to ${r.privacy})` : ""}.${r.thumbError ? ` ${r.thumbError}` : ""}${notes.length ? ` ${notes.join(" · ")}` : ""}` });
      setFile(null); setThumb(null); setTitle(""); setDescription(""); setTags(""); setPublishAt("");
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setPct(null); window.removeEventListener("beforeunload", warn); }
  };
  const mb = (n) => `${(n / 1024 / 1024).toFixed(n > 1024 * 1024 * 1024 ? 0 : 1)} MB`;

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Upload a lesson, lecture or any video — it goes <b>straight from this device to YouTube</b>, so big files work. Keep this page open until it finishes.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Video file</label>
          <input type="file" accept="video/*" disabled={busy} onChange={(e) => pickFile(e.target.files?.[0])} className="block w-full text-sm" />
          {file && <p className="mt-1 text-xs text-slate-500">{file.name} · {mb(file.size)}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="e.g. Indian Polity | Fundamental Rights | Full Lecture" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea className="input min-h-[90px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder={"What the video covers…\n\n0:00 Introduction\n2:15 Article 14 …   (timestamps become chapters)"} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tags <span className="font-normal text-slate-400">(comma separated)</span></label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} placeholder="Indian Polity, Fundamental Rights, JKSSB" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Visibility</label>
          <select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)} disabled={busy}>
            <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Scheduled time</label>
          <YtPublishTimeField key={done?.id || "own"} value={publishAt} onChange={setPublishAt} disabled={busy} note="The file uploads now; YouTube publishes it at this time." />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Thumbnail <span className="font-normal text-slate-400">(optional, JPG/PNG ≤ 2 MB)</span></label>
          <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(e) => setThumb(e.target.files?.[0] || null)} className="block w-full text-sm" />
          {thumbReady(st) && !thumb && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={useTemplate} disabled={busy} onChange={(e) => setUseTemplate(e.target.checked)} />
              Or use my thumbnail template <span className="text-slate-400">(with the title)</span>
            </label>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Playlist (folder)</label>
          {st?.connected
            ? <YtPlaylistPicker value={playlist.id} disabled={busy} onChange={(id, t) => setPlaylist({ id, title: t })} emptyLabel={defaultPlaylistLabel(st)} noneOption={!!st?.longPlaylist?.id} />
            : <p className="text-xs text-slate-400">Playlists appear here after you click <b>Connect YouTube</b> in the YouTube Shorts card (they're read from the channel).</p>}
        </div>
      </div>
      {st && !thumb && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">Thumbnail template (upload once, used for every long video)</summary>
          <YtThumbnailTemplateEditor st={st} onSaved={onStatus} />
        </details>
      )}
      {busy && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-[#FF0000] transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">Uploading… {pct}% — keep this page open.</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={upload} disabled={busy || !file} className="btn-primary !bg-[#FF0000] hover:!bg-[#d90000]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload to YouTube
        </button>
        {msg && <span className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
      {done?.url && <a href={done.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-[#FF0000] hover:underline">Open the video on YouTube</a>}
      <p className="mt-3 text-xs text-slate-400">Videos longer than 15 minutes need a verified channel (youtube.com/verify). Custom thumbnails need a verified channel too.</p>
    </div>
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
  toFacebook: true, toInstagram: false, toYoutube: false, toTelegram: false, ytTitle: "", ytFullVideo: false, ytPlaylistId: "", ytPlaylistTitle: "", asImage: false,
  asReel: false, customAudios: [], reelDuration: 30, // Reel mode for question/flashcard: rotate through these music tracks, trimmed to reelDuration seconds
  asStory: false, // also share the image as a 24h Story (Facebook + Instagram)
  // AI Educational Slideshow + Voice — builds narrated 9:16 slides and posts a Reel.
  asSlideshow: false, ttsVoice: "coral", autoCaptions: true, generateImages: false,
  questionSec: 10, answerSec: 8, // AI Slideshow: seconds slide 1 (question) / slide 2 (answer) stay up
  slideshowQuestions: 1, // AI Slideshow: questions per video
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
  // Connections tab — open YouTube when we've just come back from Google's login.
  const [connTab, setConnTab] = useState(() => (new URLSearchParams(window.location.search).has("youtube") ? "youtube" : "facebook"));
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
    _id: s._id,
    kind: ["custom", "flashcard", "slideshow"].includes(s.kind) ? s.kind : (s.asSlideshow ? "slideshow" : "question"),
    mode: s.mode === "once" ? "once" : "recurring",
    runAt: s.runAt ? toLocalInput(s.runAt) : "",
    title: s.title || "", source: s.source || emptyForm.source,
    customText: s.customText || "", customMedia: Array.isArray(s.customMedia) ? s.customMedia : [], customVideo: s.customVideo || "",
    times: s.times?.length ? s.times : ["09:00"], days: s.days || [], timezone: s.timezone || "Asia/Kolkata",
    includeOptions: s.includeOptions !== false, includeAnswer: !!s.includeAnswer, includeLink: !!s.includeLink,
    hashtags: s.hashtags || "", order: s.order || "random",
    stopWhenExhausted: s.stopWhenExhausted !== false,
    toFacebook: s.toFacebook !== false, toInstagram: !!s.toInstagram, toYoutube: !!s.toYoutube, toTelegram: !!s.toTelegram, ytTitle: s.ytTitle || "", ytFullVideo: !!s.ytFullVideo, ytPlaylistId: s.ytPlaylistId || "", ytPlaylistTitle: s.ytPlaylistTitle || "", asImage: !!s.asImage,
    asReel: !!s.asReel,
    reelDuration: s.reelDuration || 30,
    asStory: !!s.asStory,
    asSlideshow: s.kind === "slideshow" || !!s.asSlideshow,
    questionSec: s.questionSec || 10,
    slideshowQuestions: s.slideshowQuestions || 1,
    answerSec: s.answerSec || 8,
    ttsVoice: s.ttsVoice || "coral",
    autoCaptions: s.autoCaptions !== false,
    generateImages: !!s.generateImages,
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
    if (!form.toFacebook && !form.toInstagram && !form.toYoutube && !form.toTelegram) { setError("Choose at least one destination (Facebook, Instagram, YouTube or Telegram)."); return; }
    // YouTube only accepts videos: AI Slideshow, a Reel, or a custom video.
    if (form.toYoutube && !scheduleHasVideo(form)) {
      setError("YouTube needs a video — use AI Slideshow, turn on Reel, or add a custom video (or untick YouTube)."); return;
    }
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        asSlideshow: form.kind === "slideshow",
        asReel: form.kind === "slideshow" ? false : form.asReel,
        times: form.times.filter(Boolean),
        mode: isOnce ? "once" : "recurring",
        runAt: isOnce && form.runAt ? new Date(form.runAt).toISOString() : null,
      };
      if (form._id) await facebookService.update(form._id, payload);
      else await facebookService.create(payload);
      setForm(null); load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const [lvEdit, setLvEdit] = useState(null); // the long-video schedule being edited
  // Live progress of long videos being made by a schedule: scheduleId → job,
  // from GET /facebook/schedules/live (looked up by schedule id, so scheduled
  // videos always show). When one finishes the list reloads to show the result.
  const lvIds = schedules.filter((s) => s.kind === "longvideo").map((s) => String(s._id));
  const lvIdsKey = lvIds.join(",");
  const hasLongVideoRows = lvIds.length > 0;
  const [lvJobs, setLvJobs] = useState({});
  const [lvClock, setLvClock] = useState(Date.now());
  const lvActiveRef = useRef(new Set());
  useEffect(() => {
    if (!hasLongVideoRows) return undefined;
    let stop = false;
    let t = null;
    const tick = async () => {
      let busy = false;
      try {
        const r = await facebookService.liveProgress(lvIdsKey.split(","));
        const map = r?.jobs && typeof r.jobs === "object" ? r.jobs : {};
        if (stop) return;
        const now = new Set(Object.keys(map));
        const finished = [...lvActiveRef.current].some((id) => !now.has(id));
        lvActiveRef.current = now;
        setLvJobs(map);
        if (finished) load();
        busy = now.size > 0;
      } catch { /* keep the list usable if the feed fails */ }
      // 3 s while a video is being made (live %), else 15 s so a schedule that
      // just started shows its box quickly.
      if (!stop) t = setTimeout(tick, busy ? 3000 : 15000);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLongVideoRows, lvIdsKey]);
  const lvBusy = Object.keys(lvJobs).length > 0;
  useEffect(() => {
    if (!lvBusy) return undefined;
    const i = setInterval(() => setLvClock(Date.now()), 1000);
    return () => clearInterval(i);
  }, [lvBusy]);
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

  // ---- Bulk selection (pause / resume / delete many at once) ----
  // `selected` = ids ticked by hand (kept across pages). `allMatching` = the
  // admin chose "Select all N" → the action applies to EVERY schedule matching
  // the current search / time filter, on every page.
  const [selected, setSelected] = useState(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  // In "all pages" mode: ids the admin unticked afterwards (everything else stays selected).
  const [excluded, setExcluded] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(""); // "" | "pause" | "resume" | "delete"
  const [bulkMsg, setBulkMsg] = useState("");
  const clearSelection = () => { setSelected(new Set()); setExcluded(new Set()); setAllMatching(false); };
  // A new search / filter changes what "all" means — start the selection fresh.
  useEffect(() => { clearSelection(); }, [search, fromTime, toTime]);

  const pageIds = schedules.map((s) => String(s._id));
  const isTicked = (id) => (allMatching ? !excluded.has(String(id)) : selected.has(String(id)));
  const pageAllTicked = pageIds.length > 0 && pageIds.every(isTicked);
  const selectedCount = allMatching ? Math.max(0, total - excluded.size) : selected.size;
  const allPagesTicked = allMatching && excluded.size === 0 && total > 0;
  const toggleOne = (id) => {
    const k = String(id);
    if (allMatching) {
      // Stay in "all pages" mode — just untick / re-tick this one.
      setExcluded((cur) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); return n; });
      return;
    }
    setSelected((cur) => { const n = new Set(cur); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  const togglePage = () => {
    if (allMatching) {
      setExcluded((cur) => { const n = new Set(cur); pageIds.forEach((id) => (pageAllTicked ? n.add(id) : n.delete(id))); return n; });
      return;
    }
    setSelected((cur) => { const n = new Set(cur); pageIds.forEach((id) => (pageAllTicked ? n.delete(id) : n.add(id))); return n; });
  };
  // Select / unselect EVERY schedule on EVERY page (matching the current filter).
  const toggleAllPages = () => {
    if (allPagesTicked) { clearSelection(); return; }
    setSelected(new Set()); setExcluded(new Set()); setAllMatching(true);
  };
  // Unticking everything while in "all pages" mode → back to an empty selection.
  useEffect(() => { if (allMatching && total > 0 && excluded.size >= total) clearSelection(); }, [allMatching, excluded, total]);

  const runBulk = async (action) => {
    if (!selectedCount) return;
    const noun = `${selectedCount} schedule${selectedCount === 1 ? "" : "s"}`;
    if (action === "delete" && !window.confirm(`Delete ${noun}? This cannot be undone.`)) return;
    if (action === "pause" && !window.confirm(`Stop (pause) ${noun}? They won't post until resumed.`)) return;
    setBulkBusy(action); setBulkMsg(""); setError("");
    try {
      const body = allMatching
        ? { action, all: true, q: search, exclude: [...excluded], ...(fromTime && toTime ? { from: fromTime, to: toTime } : {}) }
        : { action, ids: [...selected] };
      const r = await facebookService.bulk(body);
      const n = r?.matched ?? selectedCount;
      const verb = action === "delete" ? "Deleted" : action === "pause" ? "Paused" : "Resumed";
      setBulkMsg(`${verb} ${n} schedule${n === 1 ? "" : "s"}.`);
      clearSelection();
      load();
    } catch (e) { setError(e.message || "Bulk action failed."); }
    finally { setBulkBusy(""); }
  };

  const daysLabel = (days) => (!days?.length ? "Every day" : WEEKDAYS.filter((w) => days.includes(w.v)).map((w) => w.l).join(", "));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Share2 className="h-6 w-6 text-brand-600" /> Social Media Auto Posting</h1>
        <p className="text-slate-500 dark:text-slate-400">Connect Facebook, Instagram, YouTube and Telegram, then schedule quiz questions, Reels, Shorts, long videos — or your own text &amp; media posts — to publish automatically at set times.</p>
      </div>

      {/* Connections — one tab per platform */}
      <CollapsibleCard title="Connections" icon={Power} iconClass="h-4 w-4 text-brand-600" defaultOpen>
        <div className="mt-1 flex flex-wrap gap-1.5" role="tablist">
          {[
            ["facebook", "Facebook", Facebook, "#1877F2", !!(settings?.fbEnabled && settings?.fbTokenSet)],
            ["instagram", "Instagram", Instagram, "#E1306C", !!(settings?.igEnabled && settings?.fbTokenSet)],
            ["youtube", "YouTube", Youtube, "#FF0000", null],
            ["telegram", "Telegram", Send, "#229ED9", !!(settings?.tgEnabled && settings?.tgBotTokenSet && settings?.tgChatId)],
          ].map(([k, label, Icon, color, on]) => (
            <button key={k} type="button" role="tab" aria-selected={connTab === k} onClick={() => setConnTab(k)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${connTab === k ? "border-transparent text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              style={connTab === k ? { background: color } : undefined}>
              <Icon className="h-4 w-4" style={connTab === k ? undefined : { color }} /> {label}
              {on != null && <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-400" : "bg-slate-300"}`} title={on ? "Connected" : "Not connected"} />}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          {connTab === "facebook" && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold"><Facebook className="h-4 w-4 text-[#1877F2]" /> Facebook connection</p>
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
          )}
          {connTab === "instagram" && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold"><Instagram className="h-4 w-4 text-[#E1306C]" /> Instagram connection</p>
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
          )}
          {connTab === "youtube" && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold"><Youtube className="h-4 w-4 text-[#FF0000]" /> YouTube connection</p>
              <YoutubeSection />
            </div>
          )}
          {connTab === "telegram" && <TelegramConnection settings={settings} saveSettings={saveSettings} />}
        </div>
      </CollapsibleCard>

      {/* Social links → YouTube descriptions + a comment on Facebook / Instagram posts */}
      <SocialLinksSection settings={settings} saveSettings={saveSettings} />

      {/* Header logo + name / footer website on every video slide (per account) */}
      <VideoBrandingSection key={`vb-${getActiveSocialProfile() || "main"}`} settings={settings} saveSettings={saveSettings} />

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

      <YoutubeLongVideoSection />

      {/* Selfie / logo Watermark */}
      <SelfieWatermarkSection settings={settings} saveSettings={saveSettings} />

      {/* Center text Watermark */}
      <TextWatermarkSection settings={settings} saveSettings={saveSettings} />

      {/* Flashcard template image (for the Flashcard post type) */}
      <FlashcardTemplateSection settings={settings} saveSettings={saveSettings} />

      {/* Shared Reel music library (set once, reused by every Reel schedule) */}
      <ReelMusicLibrarySection settings={settings} saveSettings={saveSettings} />

      {/* AI Slideshow post type — times, narration engine, voice, test */}
      <AiSlideshowSection settings={settings} saveSettings={saveSettings} onCreated={() => { setPage(1); load(); }} />

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
            <div className="mb-3 flex flex-wrap gap-2">
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
              {form.kind === "slideshow" && (
                <button type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5" /> AI Slideshow
                </button>
              )}
            </div>

            <label className="mb-1 block text-sm font-medium">Title (optional)</label>
            <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={form.kind === "custom" ? "e.g. Weekly announcement" : form.kind === "flashcard" ? "e.g. Daily Biology flashcard" : form.kind === "slideshow" ? "e.g. Daily Biology slideshow" : "e.g. Daily Accountancy question"} />

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
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#FF0000]" checked={!!form.toYoutube} onChange={(e) => setForm((f) => ({ ...f, toYoutube: e.target.checked }))} /> YouTube <span className="text-slate-400">(Short)</span>
              </label>
              <label className="flex items-center gap-2 text-sm" title="Question / flashcard → image · Reel / slideshow / custom video → video · custom text → message">
                <input type="checkbox" className="h-4 w-4 accent-[#229ED9]" checked={!!form.toTelegram} onChange={(e) => setForm((f) => ({ ...f, toTelegram: e.target.checked }))} /> <Send className="h-4 w-4 text-[#229ED9]" /> Telegram <span className="text-slate-400">({form.kind === "slideshow" || form.asReel ? "video" : form.kind === "custom" ? "post" : "image"})</span>
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
                  : form.kind === "slideshow"
                    ? "Instagram posts a Reel — the narrated slideshow video is published automatically."
                    : form.asReel
                      ? "Instagram posts a Reel — the auto-generated card is mixed with your music into a video."
                      : "Instagram always posts an image, so a question image is generated automatically."}
              </p>
            )}
            {form.toYoutube && (
              <div className="mt-3 rounded-lg border border-red-100 bg-red-50/40 p-3 dark:border-red-900/40 dark:bg-red-900/10">
                <label className="mb-1 block text-sm font-medium">YouTube title</label>
                <input className="input" maxLength={90} value={form.ytTitle || ""} onChange={(e) => setForm((f) => ({ ...f, ytTitle: e.target.value }))}
                  placeholder="Automatic: Subject | Topic | Quiz 1" />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Leave blank for the automatic title <b>Subject | Topic | Quiz 1</b>, then Quiz 2, Quiz 3… — each video is the next set of questions from this source (e.g. 25 questions at 5 per video → Quiz 1 to Quiz 5). Or type your own: <code>{"{subject}"}</code> <code>{"{topic}"}</code> <code>{"{n}"}</code> <code>{"{total}"}</code> (a plain title like “Daily GK Quiz” becomes “Daily GK Quiz #1”). Use <b>Sequential</b> order so Quiz 1 is the first questions. The caption + hashtags become the description.
                </p>
                <label className="mb-1 mt-3 block text-sm font-medium">Playlist (folder) for these Shorts</label>
                <YtPlaylistPicker value={form.ytPlaylistId || ""} emptyLabel="Default Shorts playlist (YouTube settings)"
                  onChange={(id, t) => setForm((f) => ({ ...f, ytPlaylistId: id, ytPlaylistTitle: t }))} />
                {form.kind !== "custom" && (
                  <label className="mt-2 flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#FF0000]" checked={!!form.ytFullVideo} onChange={(e) => setForm((f) => ({ ...f, ytFullVideo: e.target.checked }))} />
                    <span>Also make <b>one full video</b> of the whole topic when the last Short is posted <span className="text-slate-400">(landscape, all questions + answers, e.g. “Subject | Topic | Quiz 1 (25 Questions)”). Needs “Stop when all posted”.</span></span>
                  </label>
                )}
                {!scheduleHasVideo(form) && (
                  <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    YouTube only accepts videos — {form.kind === "custom" ? "add a video URL above" : "turn on Reel below (or use the AI Slideshow post type)"}.
                  </p>
                )}
              </div>
            )}

            {(form.kind === "question" || form.kind === "flashcard") && (
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

            {form.kind === "slideshow" && (
              <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" />
                <span>Each run posts
                <input type="number" min={1} max={10} className="input mx-1 inline-block h-7 w-16 !py-0 text-center"
                  value={form.slideshowQuestions || 1}
                  onChange={(e) => setForm((f) => ({ ...f, slideshowQuestions: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)) }))} />
                question(s) from this source as a narrated Reel (question → answer for each).
                Question time, answer reveal time, voice and captions are in the <b>AI Slideshow</b> section above (new slideshow schedules are created there too).</span>
              </p>
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
        {bulkMsg && !form && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{bulkMsg}</p>}
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
              {/* Bulk actions — tick schedules (or select all), then Stop / Resume / Delete */}
              {!form && schedules.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={pageAllTicked} onChange={togglePage} />
                      Select all on this page
                    </label>
                    {total > schedules.length && (
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allPagesTicked} onChange={toggleAllPages} />
                        Select all pages ({total}{search || rangeActive ? " matching the filter" : ""})
                      </label>
                    )}
                    <span className="text-xs text-slate-500 dark:text-slate-400">{selectedCount ? `${selectedCount} selected` : "None selected"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => runBulk("pause")} disabled={!selectedCount || !!bulkBusy} className="btn-outline !py-1.5 !text-xs text-amber-600 disabled:opacity-40" title="Stop the selected schedules (they won't post until resumed)">
                      {bulkBusy === "pause" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} Stop selected
                    </button>
                    <button type="button" onClick={() => runBulk("resume")} disabled={!selectedCount || !!bulkBusy} className="btn-outline !py-1.5 !text-xs text-emerald-600 disabled:opacity-40" title="Resume (enable) the selected schedules">
                      {bulkBusy === "resume" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} Resume selected
                    </button>
                    <button type="button" onClick={() => runBulk("delete")} disabled={!selectedCount || !!bulkBusy} className="btn-outline !py-1.5 !text-xs text-rose-600 disabled:opacity-40" title="Delete the selected schedules">
                      {bulkBusy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete selected
                    </button>
                    {selectedCount > 0 && (
                      <button type="button" onClick={clearSelection} disabled={!!bulkBusy} className="btn-outline !py-1.5 !text-xs disabled:opacity-40">
                        <X className="h-3.5 w-3.5" /> Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
              {schedules.map((s) => (
                <div key={s._id} className={`rounded-xl border p-4 ${isTicked(s._id) ? "border-brand-400 bg-brand-50/40 dark:border-brand-600 dark:bg-brand-900/10" : "border-slate-200 dark:border-slate-700"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input type="checkbox" aria-label="Select this schedule" className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-600" checked={isTicked(s._id)} onChange={() => toggleOne(s._id)} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className={`inline-block h-2 w-2 rounded-full ${s.completedAt ? "bg-emerald-500" : s.enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {s.title || (s.kind === "custom" ? "Custom post" : s.source?.label) || "Untitled schedule"}
                        {s.kind === "custom" && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Custom</span>}
                        {s.kind === "flashcard" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Flashcard</span>}
                        {s.kind === "longvideo" && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Long video{s.longVideo?.postedCount ? ` · ${s.longVideo.postedCount} posted` : s.longVideo?.part ? ` · ${s.longVideo.part} started` : ""}
                          </span>
                        )}
                        {(s.kind === "slideshow" || s.asSlideshow) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            <Sparkles className="h-3 w-3" /> AI Slideshow{s.slideshowQuestions > 1 ? ` · ${s.slideshowQuestions}Q` : ""}
                          </span>
                        )}
                        {((s.asReel && !s.asSlideshow && s.kind !== "slideshow") || (s.kind === "custom" && s.customVideo)) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300">
                            <Film className="h-3 w-3" /> Reel
                          </span>
                        )}
                        {s.kind === "longvideo" && longVideoTargets(s).map(({ key, label, cls, Icon }) => (
                          <span key={key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
                            <Icon className="h-3 w-3" /> {label}
                          </span>
                        ))}
                        {s.kind !== "longvideo" && s.toTelegram && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                            <Send className="h-3 w-3" /> Telegram
                          </span>
                        )}
                        {s.kind !== "longvideo" && s.toYoutube && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            <Youtube className="h-3 w-3" /> YouTube
                          </span>
                        )}
                        {s.asStory && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            <Camera className="h-3 w-3" /> Story
                          </span>
                        )}
                        {s.completedAt && <span title={s.kind === "longvideo" ? "Every quiz / question in this source has been made into a video, so the schedule stopped. Edit it or pick a new source to continue." : "Every question in this source has been posted, so the schedule stopped."} className="cursor-help rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Completed</span>}
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
                        {s.kind === "longvideo"
                          ? <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" /> {s.longVideo?.postedCount || 0} video{(s.longVideo?.postedCount || 0) === 1 ? "" : "s"} posted</span>
                          : <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" /> {s.postCount || 0}{s.poolSize ? ` / ${s.poolSize}` : ""} posted</span>}
                        {s.mode !== "once" && <span className="text-slate-400">{s.timezone}</span>}
                      </div>
                      {(rowMsg[s._id] || s.lastResult) && <p className="mt-1 text-xs text-slate-400">{compactScheduleResult(rowMsg[s._id] || s.lastResult)}</p>}
                      {s.kind === "longvideo" && lvJobs[s._id] && (() => {
                        const j = lvJobs[s._id];
                        const pct = Number.isFinite(j.percent) ? Math.max(0, Math.min(100, j.percent)) : 0;
                        const elapsed = Math.max(0, Math.floor((lvClock - (j.createdAt || lvClock)) / 1000));
                        const remain = pct > 3 ? Math.round((elapsed * (100 - pct)) / pct) : null;
                        const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.max(0, x) % 60).padStart(2, "0")}`;
                        return (
                          <div className="mt-2 w-full max-w-md rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {j.stageLabel || "Making the video"}</span>
                              <span className="text-lg font-extrabold tabular-nums text-amber-700 dark:text-amber-300">{pct}%</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/40">
                              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(2, pct)}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {mmss(elapsed)} elapsed{remain != null ? ` · about ${mmss(remain)} left` : " · working out the time left…"}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button onClick={() => postNow(s)} disabled={busyId === s._id} title="Post one now" className="rounded-lg p-2 text-[#1877F2] hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-900/30">{busyId === s._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
                      <button onClick={() => toggleEnabled(s)} disabled={busyId === s._id} title={s.enabled ? "Pause" : "Enable"} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"><Power className="h-4 w-4" /></button>
                      <button onClick={() => (s.kind === "longvideo" ? setLvEdit(s) : openEdit(s))} title="Edit" className="rounded-lg p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30"><Pencil className="h-4 w-4" /></button>
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
      {lvEdit && <LongVideoScheduleEditModal schedule={lvEdit} onClose={() => setLvEdit(null)} onSaved={() => { setLvEdit(null); load(); }} />}
    </div>
  );
}
