import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, X, ChevronRight, FolderOpen, Layers, BookOpen, HelpCircle, ListChecks, Upload, Eye, EyeOff, Copy, Download, GraduationCap, Search, Clock, Share2, Building2 } from "lucide-react";
import { contentService, aiService } from "../../services";
import ShareToInstitutesModal from "../../components/admin/ShareToInstitutesModal";
import { useAuth } from "../../context/AuthContext";
import { suggestSubjects } from "../../data/streamSubjects";
import { loadNav, saveNav } from "../../lib/navState";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import BulkUploadQuestions, { questionsToCsv } from "../../components/admin/BulkUploadQuestions";
import QuestionFormModal from "../../components/admin/QuestionFormModal";
import ContentMoveQuestionsModal from "../../components/admin/ContentMoveQuestionsModal";
import ContentMoveQuizModal from "../../components/admin/ContentMoveQuizModal";
import QuestionView from "../../components/admin/QuestionView";
import QuestionTypeFilter from "../../components/admin/QuestionTypeFilter";
import QuestionStatusFilter, { filterByStatus } from "../../components/admin/QuestionStatusFilter";
import AddToTestModal from "../../components/admin/AddToTestModal";
import { questionDateText, searchQuestions, questionTypeKey, QUESTION_TYPE_LABELS } from "../../lib/questions";
import DuplicatesModal from "../../components/admin/DuplicatesModal";
import { useAiModal } from "../../context/AiModalContext";
import ExtendExplanationsModal from "../../components/admin/ExtendExplanationsModal";
import ExtendOneQuestionModal from "../../components/admin/ExtendOneQuestionModal";
import RegenerateAllModal from "../../components/admin/RegenerateAllModal";
import RegenerateOneModal from "../../components/admin/RegenerateOneModal";
import ScheduleQuestionModal from "../../components/admin/ScheduleQuestionModal";
import RecycleBinModal from "../../components/admin/RecycleBinModal";
import MissingItemsModal from "../../components/admin/MissingItemsModal";
import SubjectTopicDuplicatesModal from "../../components/admin/SubjectTopicDuplicatesModal";
import LinkExistingSubjectModal from "../../components/admin/LinkExistingSubjectModal";
import RowActionButton from "../../components/admin/RowActionButton";
import { Sparkles, Files, Globe, Wand2, Loader2, ClipboardList, RefreshCw, Scissors, GitMerge, CheckCircle2, Maximize2, Minimize2, Archive, ArrowRightLeft, ScanSearch, Save, Link2 } from "lucide-react";

const COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-teal-600",
];

// Singular type name for each drill-down level (used by the form modal).
const VIEW_TYPE = { streams: "stream", subjects: "subject", topics: "topic", sessions: "session", quizzes: "quiz", questions: "question" };

// Question types offered per subtopic in the "Missing areas" sequential generator.
const GEN_TYPES = [
  { id: "mcq", label: "MCQ" },
  { id: "matching", label: "Matching" },
  { id: "statement", label: "Statement" },
  { id: "pair", label: "Pair" },
  { id: "pairselect", label: "Pair-select" },
  { id: "assertion", label: "Assertion" },
  { id: "table", label: "Table" },
];
const GEN_DIFFS = ["Easy", "Medium", "Hard"]; // difficulty levels per type

// Sum every type×level cell of a subtopic's mix.
const mixTotal = (row) => Object.values(row || {}).reduce((s, dm) => s + Object.values(dm || {}).reduce((a, v) => a + (parseInt(v, 10) || 0), 0), 0);



const NAV_KEY = "mpm-admin-content-nav"; // remembers drill-down position across refreshes

export default function AdminContent() {
  // Drill-down context — restored from sessionStorage so a refresh keeps you
  // exactly where you were (e.g. inside a topic), instead of jumping to Streams.
  // ── URL is the source of truth for the drill-down position ──────────────
  // The selected entity IDs live in the query string, so the address bar always
  // matches what's shown and refresh / direct links / new tabs / browser
  // Back-Forward all work. The current `view` is DERIVED from which IDs are
  // present, so navigating up (dropping deeper IDs) can NEVER leave stale child
  // state behind — this is what makes breadcrumbs reset correctly.
  //   ?s=<streamId>&sub=<subjectId>&t=<topicId>&se=<sessionId>&qz=<quizId>
  const [searchParams, setSearchParams] = useSearchParams();
  const sid = searchParams.get("s") || "";
  const subId = searchParams.get("sub") || "";
  const tid = searchParams.get("t") || "";
  const seid = searchParams.get("se") || "";
  const qid = searchParams.get("qz") || "";
  // The "Session" level is hidden: a topic drills straight to its Quizzes. `se`
  // still lives in the URL (the topic's single implicit session) so quiz/question
  // loading + student/search/analytics keep working, but the user never sees it.
  const view = qid ? "questions" : (seid || tid) ? "quizzes" : subId ? "topics" : sid ? "subjects" : "streams";

  // Entity OBJECTS (for breadcrumb names + child loading). Seeded from the
  // per-tab cache so a refresh is instant; the URL-sync effect reconciles them
  // against the URL IDs and fetches any that are missing (cold load / deep link).
  const [stream, setStream] = useState(() => loadNav(NAV_KEY).stream || null);
  const [subject, setSubject] = useState(() => loadNav(NAV_KEY).subject || null);
  const [topic, setTopic] = useState(() => loadNav(NAV_KEY).topic || null);
  const [session, setSession] = useState(() => loadNav(NAV_KEY).session || null);
  const [quiz, setQuiz] = useState(() => loadNav(NAV_KEY).quiz || null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { openAiGenerate, openAiImport } = useAiModal();
  const [modal, setModal] = useState(null); // { type, mode, data }
  const [bulkOpen, setBulkOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState(null); // {id,title} — after AI creates a new quiz, later batches target it
  const [extendOpen, setExtendOpen] = useState(false); // AI extend-explanations (whole quiz)
  const [regenAllOpen, setRegenAllOpen] = useState(false); // AI regenerate-all (whole quiz)
  const [scheduleQ, setScheduleQ] = useState(null); // question to post/schedule to Facebook
  const [extendingQId, setExtendingQId] = useState(null); // per-question extend in progress
  const [extendOneItem, setExtendOneItem] = useState(null); // per-question extend confirm modal target
  const [regenId] = useState(null); // legacy inline spinner id — regenerate now runs in RegenerateOneModal
  const [regenOneItem, setRegenOneItem] = useState(null); // per-question regenerate dialog target
  const [dupOpen, setDupOpen] = useState(false);
  const [dupScope, setDupScope] = useState({ id: "all", name: "" }); // which subject the duplicate scan targets
  const [recycleOpen, setRecycleOpen] = useState(false); // Recycle Bin (soft-deleted content) modal
  // Split a topic/quiz into quizzes of N. { kind: "quiz"|"topic", id, name, count }
  const [splitTarget, setSplitTarget] = useState(null);
  const [splitPer, setSplitPer] = useState(50);
  const [splitting, setSplitting] = useState(false);
  // Merge sibling quizzes (same session) INTO one target quiz (inverse of split).
  const [mergeTarget, setMergeTarget] = useState(null);
  const [mergeIds, setMergeIds] = useState([]);
  const [merging, setMerging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewQ, setViewQ] = useState(null); // single question to preview
  const [viewFull, setViewFull] = useState(true); // single-question viewer opens full-screen (toggle to shrink)
  const [addToTestQ, setAddToTestQ] = useState(null); // question being copied into a test
  const [viewAll, setViewAll] = useState(false); // preview all questions
  const [studentView, setStudentView] = useState(true); // View All: defaults to student view (answers hidden)
  const [typeFilter, setTypeFilter] = useState([]); // View All: which question types to show ([] = all)
  const [statusFilter, setStatusFilter] = useState("all"); // View All: updated/not_updated/all
  const [reopenAfterEdit, setReopenAfterEdit] = useState(null); // question _id to reopen in the preview after editing it there
  const [selected, setSelected] = useState([]); // bulk-selected question ids
  const [moveQ, setMoveQ] = useState(null); // { mode: "move" | "copy" } — move/copy selected questions to another quiz
  const [migrateQuiz, setMigrateQuiz] = useState(null); // quiz being moved/copied to another session (Migrate)
  const [shareInstitutesTarget, setShareInstitutesTarget] = useState(null); // super-admin: copy a whole stream into institute(s)
  const { user: authUser } = useAuth();
  const isSuperAdmin = authUser?.role === "admin"; // platform super-admin (not an institute_admin)
  // "Scan missing areas": analyse all quizzes in this topic for uncovered syllabus.
  const [scanOpen, setScanOpen] = useState(false);
  const [scanFull, setScanFull] = useState(false); // full-screen the Missing areas modal
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [scanMissing, setScanMissing] = useState([]);
  const [scanTopic, setScanTopic] = useState("");
  const [scanStems, setScanStems] = useState([]);
  const [scanResumed, setScanResumed] = useState(false); // showing a saved plan (not a fresh scan)
  // Per-subtopic sequential generation from the "missing areas" scan.
  const [scanCounts, setScanCounts] = useState({}); // subtopic index -> total question count
  const [scanTypes, setScanTypes] = useState({});   // subtopic index -> { type: { level: count } }
  const [openTypeRows, setOpenTypeRows] = useState(() => new Set()); // which rows show the type editor
  const [globalMix, setGlobalMix] = useState({});   // shared type×level mix set once for ALL subtopics
  const [mixOpen, setMixOpen] = useState(false);
  const [seqRunning, setSeqRunning] = useState(false);
  const [seqProgress, setSeqProgress] = useState({}); // subtopic name -> { status, count }
  const [seqLive, setSeqLive] = useState(null); // real-time view of the CURRENT subtopic's job: { subtopic, count, byBucket:[{type,difficulty,have,want}] }
  const [seqMsg, setSeqMsg] = useState("");
  const seqStopRef = useRef(false);
  const [delProgress, setDelProgress] = useState(null); // real-time bulk-delete progress: { total, done, finished? }
  const [bulkAddBusy, setBulkAddBusy] = useState(null); // live auto-add progress: { done, total, added, kind: "subject"|"topic" }
  const [missingLevel, setMissingLevel] = useState(null); // "subject" | "topic" — open "Search Missing Subjects/Topics" scan
  const [dupLevel, setDupLevel] = useState(null); // "subject" | "topic" — open "Find Duplicates" scan
  const [linkOpen, setLinkOpen] = useState(false); // "Add existing subject" (reuse from another stream) modal
  const [search, setSearch] = useState(""); // question search query

  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = view === "questions" && items.length > 0 && selected.length === items.length;
  const toggleAll = () => setSelected(allSelected ? [] : items.map((i) => i._id));

  // ---- Bulk delete of NODES (streams/subjects/topics/sessions/quizzes) ----
  const [selNodes, setSelNodes] = useState([]); // ticked node ids (non-question views)
  const [delNodeBusy, setDelNodeBusy] = useState(null); // { done, total } while deleting nodes
  const toggleNode = (id) => setSelNodes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allNodesSelected = view !== "questions" && items.length > 0 && selNodes.length === items.length;
  const toggleAllNodes = () => setSelNodes(allNodesSelected ? [] : items.map((i) => i._id));
  const deleteSelectedNodes = async () => {
    if (!selNodes.length || delNodeBusy) return;
    const type = VIEW_TYPE[view];
    const total = selNodes.length;
    if (!window.confirm(`Delete ${total} selected ${type}${total === 1 ? "" : "s"}? This also removes everything inside them. This cannot be undone.`)) return;
    setDelNodeBusy({ done: 0, total });
    setError("");
    try {
      let done = 0;
      for (const id of selNodes) {
        if (type === "stream") await contentService.deleteStream(id);
        else if (type === "subject") {
          // Shared (linked) subjects are unlinked from this stream, not deleted.
          const it = items.find((x) => x._id === id);
          if (it?.stream && sid && String(it.stream) !== sid) await contentService.unlinkSubject(id, sid);
          else await contentService.deleteSubject(id);
        }
        else if (type === "topic") await contentService.deleteTopic(id);
        else if (type === "session") await contentService.deleteSession(id);
        else if (type === "quiz") await contentService.deleteQuiz(id);
        setDelNodeBusy({ done: ++done, total });
      }
      setSelNodes([]);
      load(view);
    } catch (e) {
      setError(e.message);
    } finally {
      setDelNodeBusy(null);
    }
  };
  const deleteSelected = async () => {
    if (!selected.length || delProgress) return;
    const total = selected.length;
    if (!window.confirm(`Delete ${total} selected question(s)? This cannot be undone.`)) return;
    setDelProgress({ total, done: 0 });
    try {
      let done = 0;
      for (const id of selected) {
        await contentService.deleteQuestion(id);
        setDelProgress({ total, done: ++done }); // tick up in real time
      }
      setDelProgress({ total, done: total, finished: true, remaining: Math.max(0, items.length - total) });
      setSelected([]);
      load("questions");
      setTimeout(() => setDelProgress(null), 5000);
    } catch (e) {
      setError(e.message);
      setDelProgress(null);
    }
  };

  // Bulk-delete the questions currently shown in "View all" — i.e. the set
  // matching the active TYPE filter (or every question when no type is
  // selected). Lets an admin clear out one whole question type at once.
  const deleteByType = async () => {
    if (delProgress) return;
    const targets = items.filter((it) => !typeFilter.length || typeFilter.includes(questionTypeKey(it)));
    const ids = targets.map((q) => q._id);
    if (!ids.length) return;
    const label = typeFilter.length
      ? typeFilter.map((t) => QUESTION_TYPE_LABELS[t] || t).join(", ")
      : "all types";
    if (!window.confirm(`Delete ${ids.length} question(s) of type: ${label}? This cannot be undone.`)) return;
    setDelProgress({ total: ids.length, done: 0 });
    try {
      let done = 0;
      for (const id of ids) {
        await contentService.deleteQuestion(id);
        setDelProgress({ total: ids.length, done: ++done });
      }
      setDelProgress({ total: ids.length, done: ids.length, finished: true, remaining: Math.max(0, items.length - ids.length) });
      setSelected([]);
      await load("questions");
      setTimeout(() => setDelProgress(null), 5000);
    } catch (e) {
      setError(e.message);
      setDelProgress(null);
    }
  };

  // Regenerate ONE question: open the dialog (options/answer rebuild toggles +
  // AI source/model) — the modal runs the request itself.
  const regenerateQ = (item) => setRegenOneItem(item);

  // Apply a single-question regenerate result (from RegenerateOneModal) to the
  // open preview and reload the list.
  const applyRegenerated = async (updated) => {
    const item = regenOneItem;
    if (item) setViewQ((prev) => (prev && prev._id === item._id ? { ...prev, ...updated } : prev));
    setRegenOneItem(null);
    await load("questions");
  };

  // Extend ONE question's explanation with AI — open the confirm modal first.
  const extendOneQuestion = (item) => setExtendOneItem(item);

  // Run the actual extend once the user confirms in the modal.
  const runExtendOne = async ({ fixOptions, extendQuestion, shuffleOptions } = {}) => {
    const item = extendOneItem;
    if (!item) return;
    setExtendingQId(item._id);
    try {
      const updated = await aiService.extendOne({ questionId: item._id, fixOptions, extendQuestion, shuffleOptions });
      // If this question is open in the preview modal, reflect the change live.
      setViewQ((prev) => (prev && prev._id === item._id ? { ...prev, ...updated } : prev));
      setExtendOneItem(null);
      load("questions");
    } catch (e) {
      setError(e.message);
      setExtendOneItem(null);
    } finally {
      setExtendingQId(null);
    }
  };

  // `{ manage: true }` — the admin manager must also see DISABLED items (to
  // re-enable them); the public site omits it so disabled content stays hidden.
  const loaders = {
    streams: () => contentService.streams({ manage: true }),
    subjects: () => contentService.subjectsByStream(stream._id, { manage: true }),
    topics: () => contentService.topics(subject._id, { manage: true }),
    sessions: () => contentService.sessions(topic._id, { manage: true }),
    quizzes: () => contentService.quizzes(session._id, { manage: true }),
    questions: () => contentService.quizQuestions(quiz._id),
  };

  // Refresh the CURRENT level from component state (used after add/edit/delete,
  // when the parent objects are already settled in state).
  const load = useCallback((which) => {
    setLoading(true);
    setError("");
    loaders[which]()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, subject, topic, session, quiz]);

  // Load a level's list from EXPLICIT parent objects — used by the URL-sync
  // effect below, where React state may not have committed the new objects yet.
  const loadWith = (which, o) => {
    setLoading(true);
    setError("");
    const p =
      which === "subjects" ? contentService.subjectsByStream(o.stream._id, { manage: true })
      : which === "topics" ? contentService.topics(o.subject._id, { manage: true })
      : which === "sessions" ? contentService.sessions(o.topic._id, { manage: true })
      : which === "quizzes" ? contentService.quizzes(o.session._id, { manage: true })
      : which === "questions" ? contentService.quizQuestions(o.quiz._id)
      : contentService.streams({ manage: true });
    p.then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  // ── URL-sync ────────────────────────────────────────────────────────────
  // Whenever the URL drill-path changes (click, breadcrumb, Back/Forward,
  // refresh, direct deep link) reconcile the entity OBJECTS with the URL IDs —
  // fetching any we don't already hold — then load the current level. If an ID
  // no longer resolves (deleted content / stale link) we drop to the deepest
  // valid ancestor by rewriting the URL, so the view is never broken.
  useEffect(() => {
    let cancelled = false;
    setSelected([]); setSelNodes([]); setSearch("");
    // Clear the previous level's list and show the spinner up-front, so a
    // drill-down never briefly renders the OLD items under the NEW view. Without
    // this, tapping a topic flashes the topic itself as a phantom
    // "0 questions · undefined" quiz while the (hidden) session resolves.
    setItems([]); setLoading(true);
    (async () => {
      try {
        const find = (arr, id) => (arr || []).find((x) => String(x._id) === String(id)) || null;
        let strm = stream, subj = subject, tpc = topic, sess = session, qz = quiz;

        if (!sid) strm = null;
        else if (!strm || String(strm._id) !== sid) strm = find(await contentService.streams({ manage: true }), sid);
        if (sid && !strm) { if (!cancelled) setSearchParams({}, { replace: true }); return; }

        if (!subId) subj = null;
        else if (strm && (!subj || String(subj._id) !== subId)) subj = find(await contentService.subjectsByStream(sid, { manage: true }), subId);
        if (subId && !subj) { if (!cancelled) setSearchParams({ s: sid }, { replace: true }); return; }

        if (!tid) tpc = null;
        else if (subj && (!tpc || String(tpc._id) !== tid)) tpc = find(await contentService.topics(subId, { manage: true }), tid);
        if (tid && !tpc) { if (!cancelled) setSearchParams({ s: sid, sub: subId }, { replace: true }); return; }

        // Session level is HIDDEN: when a topic is open but the URL has no
        // session id, resolve (or create) the topic's single implicit session
        // and jump straight to its quizzes — so the user never sees a Session.
        if (tid && !seid) {
          const ds = await contentService.topicSession(tid).catch(() => null);
          if (cancelled) return;
          if (ds?._id) setSearchParams({ s: sid, sub: subId, t: tid, se: String(ds._id) }, { replace: true });
          else { setError("Couldn't open this topic's quizzes."); setLoading(false); }
          return;
        }
        if (!seid) sess = null;
        else if (tpc && (!sess || String(sess._id) !== seid)) sess = find(await contentService.sessions(tid, { manage: true }), seid);
        if (seid && !sess) { if (!cancelled) setSearchParams({ s: sid, sub: subId, t: tid }, { replace: true }); return; }

        if (!qid) qz = null;
        else if (sess && (!qz || String(qz._id) !== qid)) qz = find(await contentService.quizzes(seid, { manage: true }), qid);
        if (qid && !qz) { if (!cancelled) setSearchParams({ s: sid, sub: subId, t: tid, se: seid }, { replace: true }); return; }

        if (cancelled) return;
        setStream(strm); setSubject(subj); setTopic(tpc); setSession(sess); setQuiz(qz);
        loadWith(view, { stream: strm, subject: subj, topic: tpc, session: sess, quiz: qz });
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, subId, tid, seid, qid]);

  // Load ALL question stems in the current topic (across its quizzes — they
  // share the topic's implicit session) so "Generate with AI" can show the
  // Syllabus-coverage / Missing-areas report for the whole topic, not just one
  // quiz. Same engine My Practice uses (AiGenerate's coverageQuestions).
  // After editing a question that was opened from the single-question preview,
  // reopen the preview on that (now-reloaded, updated) question so you land back
  // on the question you just edited instead of the list.
  useEffect(() => {
    if (!reopenAfterEdit) return;
    const q = (items || []).find((x) => x._id === reopenAfterEdit);
    if (q) { setViewQ(q); setReopenAfterEdit(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Save an AI-generated / imported batch. When opts.newTarget = { name } is set
  // (the "New quiz" option in the modal) we CREATE a new quiz under the current
  // session and insert the batch there; later batches then default to that new
  // quiz. Otherwise the batch goes into the quiz currently open.
  const saveAiBatch = async (questions, opts = {}) => {
    // A minimized/background generation snapshots its destination at start
    // (opts.dest), so inserting later lands in the RIGHT topic even if you've
    // since browsed elsewhere. Falls back to the currently-open destination.
    const dest = opts.dest || {};
    const subjId = dest.subjectId || subject?._id;
    const sessId = dest.sessionId || session?._id;
    let quizId = dest.quizId || aiTarget?.id || quiz?._id;
    if (opts.newTarget) {
      const title = String(opts.newTarget.name || "").trim();
      if (!title) throw new Error("Enter a name for the new quiz.");
      if (!subjId || !sessId) throw new Error("Lost the destination — reopen the generator from the topic.");
      const created = await contentService.createQuiz({ title, subject: subjId, session: sessId });
      if (!created?._id) throw new Error("Could not create the new quiz.");
      quizId = created._id;
      setAiTarget({ id: quizId, title }); // subsequent batches target the new quiz
    }
    const res = await contentService.bulkQuestions(questions, {
      subject: subjId,
      session: sessId,
      quiz: quizId,
    });
    // Remember the topic/subtopics on the quiz so reopening the generator
    // pre-fills them and coverage can continue from where it left off.
    if (quizId && (opts.topic || opts.subtopics)) {
      contentService
        .updateQuiz(quizId, { aiTopic: opts.topic || "", aiSubtopics: opts.subtopics || "" })
        .then((u) => setQuiz((q) => (q && q._id === quizId ? { ...q, aiTopic: u.aiTopic, aiSubtopics: u.aiSubtopics } : q)))
        .catch(() => {});
    }
    if (quizId === quiz?._id) load("questions"); // refresh only when writing to the open quiz
    return res;
  };

  // ───────────────────────── Scan missing areas ─────────────────────────
  // Analyse ALL questions in the current topic (they share the topic's implicit
  // session) against the syllabus, list the subtopics NOT yet covered, then let
  // the admin generate questions for just those — one subtopic at a time into a
  // new "<topic> — gaps" quiz. Mirrors the same feature in My Practice.
  const scanStorageKey = (name) => `mstg.missingAreas:${name || scanTopic || "global"}`;
  const persistScan = (name, extra) => {
    const missing = extra?.missing || scanMissing;
    if (!missing.length) return;
    try {
      localStorage.setItem(scanStorageKey(name), JSON.stringify({
        topic: name || scanTopic,
        missing,
        counts: extra?.counts || scanCounts,
        types: scanTypes,
        globalMix,
        progress: seqProgress,
        savedAt: Date.now(),
      }));
    } catch { /* storage blocked/full — the in-memory plan still works this session */ }
  };

  // Every question stem in the topic (via its implicit session) → the AI uses
  // these to work out what's already covered.
  const gatherScanStems = async () => {
    try {
      if (!session?._id) return [];
      const qs = await contentService.questions(session._id).catch(() => []);
      return (qs || []).map((q) => q?.text).filter(Boolean);
    } catch { return []; }
  };

  // The actual AI scan (also used by the "Re-scan" button).
  const runScan = async (topicName) => {
    setScanning(true); setScanErr(""); setScanMissing([]); setScanTopic(topicName); setScanStems([]);
    setScanCounts({}); setScanTypes({}); setOpenTypeRows(new Set()); setGlobalMix({}); setMixOpen(false); setSeqProgress({}); setSeqMsg(""); seqStopRef.current = false;
    setScanResumed(false);
    try {
      const stems = await gatherScanStems();
      setScanStems(stems);
      const r = await aiService.coverageGaps({ topic: topicName, questions: stems, subject: subject?.name, stream: stream?.name });
      const missing = Array.isArray(r?.missing) ? r.missing : [];
      setScanMissing(missing);
      const counts = Object.fromEntries(missing.map((_, i) => [i, 10])); // default 10 per subtopic
      setScanCounts(counts);
      persistScan(topicName, { missing, counts }); // save the fresh scan right away
    } catch (e) {
      setScanErr(e.message || "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  // Button entry point: resume a saved plan for this topic if there is one,
  // otherwise run a fresh scan.
  const scanMissingAreas = async () => {
    const topicName = topic?.title || "";
    setScanOpen(true); setScanFull(false); setScanErr(""); setSeqMsg(""); seqStopRef.current = false;
    let saved = null;
    try { const raw = localStorage.getItem(scanStorageKey(topicName)); saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
    if (saved && Array.isArray(saved.missing) && saved.missing.length) {
      setScanning(false);
      setScanResumed(true);
      setScanTopic(saved.topic || topicName);
      setScanMissing(saved.missing);
      setScanCounts(saved.counts || {});
      setScanTypes(saved.types || {});
      setGlobalMix(saved.globalMix || {});
      const restored = {};
      Object.entries(saved.progress || {}).forEach(([k, v]) => { restored[k] = v && v.status === "working" ? { ...v, status: "pending" } : v; });
      setSeqProgress(restored);
      setOpenTypeRows(new Set()); setMixOpen(false);
      gatherScanStems().then(setScanStems); // re-gather stems in bg (not persisted)
      return;
    }
    await runScan(topicName);
  };

  // Keep the saved plan in sync as the admin tweaks counts/types/progress.
  useEffect(() => {
    if (!scanOpen || !scanMissing.length) return;
    persistScan(scanTopic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanOpen, scanMissing, scanCounts, scanTypes, globalMix, seqProgress]);

  // ── Resume a saved AI session ───────────────────────────────────────────
  // The AI generator checkpoints its work to localStorage keyed by the target
  // (the quiz title, else the topic). Surface it HERE on the content page so you
  // can SEE a session is waiting and jump straight back into it — instead of
  // only discovering it after opening the generator. Uses the SAME key the
  // generator restores from, so "Resume" lands on the same saved questions.
  const [savedSession, setSavedSession] = useState(null); // { key, done, target, label } | null
  const readSavedSession = useCallback(() => {
    try {
      const name = (quiz?.title || "") || (quiz?.aiTopic || topic?.title || "");
      if (!name) return null;
      const key = `mstg.genJob:${name}`;
      const ck = JSON.parse(localStorage.getItem(key) || "null");
      if (!ck || !Array.isArray(ck.preview) || !ck.preview.length) return null;
      if (!ck.updatedAt || Date.now() - ck.updatedAt > 7 * 24 * 3600 * 1000) return null; // 7-day window (matches the generator)
      const target = ck.matrix
        ? Object.values(ck.matrix).reduce((s, dm) => s + Object.values(dm || {}).reduce((a, v) => a + (Number(v) || 0), 0), 0)
        : ck.preview.length;
      return { key, done: ck.preview.length, target, label: name };
    } catch { return null; }
  }, [quiz?.title, quiz?.aiTopic, topic?.title]);
  useEffect(() => {
    const refresh = () => setSavedSession(readSavedSession());
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [readSavedSession]);
  const discardSavedSession = () => {
    if (!savedSession) return;
    if (!window.confirm("Discard the saved AI session for this topic? The generated questions kept in your browser will be removed.")) return;
    try { localStorage.removeItem(savedSession.key); } catch { /* ignore */ }
    setSavedSession(null);
  };

  // Open the APP-LEVEL AI generator (hosted by AiModalProvider) so a minimized
  // generation keeps running and its pill stays visible even after navigating to
  // another admin section. Props are captured here at open time; the onUpload /
  // onGenerationStart closures keep targeting the right destination (via the
  // destination snapshot) even after this page unmounts.
  const openContentGenerate = async ({ topicLevel = false, gap = null, stems = null } = {}) => {
    setAiTarget(null);
    // Coverage stems for the whole topic (previously loaded by a lazy effect
    // gated on the modal opening). Fetch here unless the caller supplies them
    // (the missing-areas scan passes its own).
    let cover = stems;
    if (cover == null) {
      cover = session?._id
        ? await contentService.questions(session._id).then((qs) => (qs || []).map((q) => q?.text).filter(Boolean)).catch(() => [])
        : [];
    }
    openAiGenerate({
      title: topicLevel ? `Generate with AI — ${topic?.title || ""} (missing areas)` : `Generate with AI${quiz ? ` — ${quiz.title}` : ""}`,
      allowNewTarget: true,
      newLeafLabel: "quiz",
      currentTargetName: quiz?.title || "",
      existingQuestions: view === "questions" ? items : [],
      defaultTopic: gap?.topic || quiz?.aiTopic || topic?.title || "",
      defaultSubtopics: gap?.subtopics || quiz?.aiSubtopics || "",
      defaultDest: topicLevel ? "new" : "current",
      coverageQuestions: cover,
      subjectName: subject?.name || "",
      onGenerationStart: () => ({ subjectId: subject?._id, sessionId: session?._id, quizId: aiTarget?.id || quiz?._id }),
      onUpload: (questions, opts = {}) => saveAiBatch(questions, opts),
      onClose: () => setSavedSession(readSavedSession()), // refresh the page banner after insert/discard
    });
  };
  const openContentImport = () => {
    setAiTarget(null);
    openAiImport({
      title: `Import from Web${quiz ? ` — ${quiz.title}` : ""}`,
      allowNewTarget: true,
      newLeafLabel: "quiz",
      currentTargetName: quiz?.title || "",
      onUpload: (questions, opts = {}) => saveAiBatch(questions, opts),
    });
  };

  // "All-in-one": hand the whole gap list to the standard AI generator modal.
  const generateFromGaps = () => {
    setScanOpen(false);
    openContentGenerate({ topicLevel: true, gap: { topic: scanTopic, subtopics: scanMissing.join(", ") }, stems: scanStems });
  };

  // Poll a generation job, honouring a stop request (keeps the partial result).
  const pollGenJob = async (jobId, onTick) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let cancelSent = false;
    for (let i = 0; i < 240; i++) {
      await sleep(2000);
      if (seqStopRef.current && !cancelSent) { cancelSent = true; try { await aiService.cancelJob(jobId); } catch { /* keep polling for the partial */ } }
      let s;
      try { s = await aiService.job(jobId); } catch { continue; }
      try { onTick?.(s); } catch { /* live UI update must never break polling */ }
      if (s.status === "done") return s.questions || [];
      if (s.status === "error") throw new Error(s.error || "Generation failed.");
    }
    throw new Error("Generation timed out.");
  };

  // Core per-subtopic generator: build the type×level plan, generate in rounds
  // (topping up any buckets that fall short), de-duped, until satisfied/stopped.
  const runSubtopic = async (i, avoidBase) => {
    const name = scanMissing[i];
    const chosen = scanTypes[i];
    const want = (() => {
      const b = [];
      if (chosen) {
        for (const [type, dm] of Object.entries(chosen)) {
          for (const [difficulty, v] of Object.entries(dm || {})) {
            const n = parseInt(v, 10) || 0;
            if (n > 0) b.push({ type, difficulty, count: n });
          }
        }
      }
      return b.length ? b : [{ type: "mcq", difficulty: "Medium", count: Math.max(0, parseInt(scanCounts[i], 10) || 0) }];
    })();
    const collected = [];
    const keyOf = (q) => `${q?.type || "mcq"}::${String(q?.text || "").trim().toLowerCase()}::${Array.isArray(q?.columnA) ? q.columnA.join("|").toLowerCase() : ""}::${String(q?.assertion || "").toLowerCase()}`;
    const seen = new Set();
    let rounds = 0, emptyRounds = 0, lastErr = "";
    while (rounds < 6 && emptyRounds < 2 && !seqStopRef.current) {
      const have = {};
      collected.forEach((q) => { const k = `${q.type || "mcq"}|${q.difficulty || "Medium"}`; have[k] = (have[k] || 0) + 1; });
      const plan = want
        .map((b) => ({ type: b.type, difficulty: b.difficulty, count: Math.max(0, b.count - (have[`${b.type}|${b.difficulty}`] || 0)) }))
        .filter((b) => b.count > 0);
      if (!plan.length) break;
      const body = {
        topic: scanTopic,
        subject: subject?.name,
        stream: stream?.name,
        plan,
        notes: `Write EVERY question ONLY about the subtopic "${name}" within "${scanTopic}". Do not drift to other subtopics.`,
        avoid: [...avoidBase, ...collected.map((q) => q.text)].filter(Boolean).slice(-400),
      };
      let got = [];
      const doneSoFar = collected.length;
      const onTick = (s) => setSeqLive({
        subtopic: name,
        count: doneSoFar + (s?.count || 0),
        byBucket: Array.isArray(s?.byBucket) ? s.byBucket : [],
      });
      try { const { jobId } = await aiService.generate(body); if (jobId) got = await pollGenJob(jobId, onTick); else lastErr = "Could not start generation."; }
      catch (e) { lastErr = e?.message || "Generation failed."; }
      const before = collected.length;
      for (const q of got) { const k = keyOf(q); if (String(q?.text || "").trim() && !seen.has(k)) { seen.add(k); collected.push(q); } }
      if (collected.length <= before) emptyRounds += 1; else emptyRounds = 0;
      rounds += 1;
    }
    return { collected, lastErr };
  };

  // Ensure the "<topic> — gaps" quiz exists (create once), returning its id.
  // Insert generated questions there directly — self-contained so a sequential
  // run reliably appends to ONE quiz (no reliance on async aiTarget state).
  const ensureGapsQuiz = async (existingId) => {
    if (existingId) return existingId;
    if (!subject?._id || !session?._id) throw new Error("Open a topic's quizzes first.");
    const created = await contentService.createQuiz({ title: `${scanTopic} — gaps`, subject: subject._id, session: session._id });
    if (!created?._id) throw new Error("Could not create the gaps quiz.");
    setAiTarget({ id: created._id, title: `${scanTopic} — gaps` });
    return created._id;
  };
  const insertGapQuestions = async (quizId, list, subtopics) => {
    await contentService.bulkQuestions(list, { subject: subject._id, session: session._id, quiz: quizId });
    contentService.updateQuiz(quizId, { aiTopic: scanTopic, aiSubtopics: subtopics || "" }).catch(() => {});
  };

  // Generate a SINGLE subtopic now (per-row "Generate" button).
  const generateOne = async (i) => {
    const name = scanMissing[i];
    const cnt = scanTypes[i] ? mixTotal(scanTypes[i]) : (parseInt(scanCounts[i], 10) || 0);
    if (cnt <= 0) { setSeqMsg(`Set a question count for “${name}” first.`); return; }
    if (!subject?._id || !session?._id) { setSeqMsg("Open a topic's quizzes first."); return; }
    seqStopRef.current = false;
    setSeqRunning(true);
    setSeqProgress((p) => ({ ...p, [name]: { status: "working", count: 0 } }));
    setSeqMsg("");
    try {
      const { collected, lastErr } = await runSubtopic(i, [...scanStems]);
      if (collected.length) {
        const targetId = await ensureGapsQuiz(aiTarget?.id);
        await insertGapQuestions(targetId, collected, name);
        setSeqProgress((p) => ({ ...p, [name]: { status: "done", count: collected.length } }));
        setSeqMsg(seqStopRef.current ? `Stopped — kept ${collected.length} question(s) for “${name}”.` : `Generated ${collected.length} question(s) for “${name}”.`);
        load(view); // refresh the quiz list so the gaps quiz + counts show
      } else {
        setSeqProgress((p) => ({ ...p, [name]: { status: "failed", count: 0, err: lastErr || "No questions returned — rate-limited/quota, or mix too large." } }));
      }
    } catch (e) {
      setSeqProgress((p) => ({ ...p, [name]: { status: "failed", count: 0, err: e.message || "Generation failed." } }));
    } finally {
      setSeqRunning(false);
      setSeqLive(null);
    }
  };

  // Generate EVERY chosen subtopic in turn, all into the same new gaps quiz.
  const generateSequential = async () => {
    const subs = scanMissing
      .map((name, i) => ({ name, i, count: (scanTypes[i] ? mixTotal(scanTypes[i]) : (parseInt(scanCounts[i], 10) || 0)) }))
      .filter((s) => s.count > 0);
    if (!subs.length) { setSeqMsg("Set a question count (e.g. 10) on at least one subtopic first."); return; }
    if (!subject?._id || !session?._id) { setSeqMsg("Open a topic's quizzes first."); return; }

    seqStopRef.current = false;
    setSeqRunning(true); setSeqMsg("");
    const prog = {}; subs.forEach((s) => (prog[s.name] = { status: "pending", count: 0 })); setSeqProgress({ ...prog });
    setAiTarget(null);
    const targetName = `${scanTopic} — gaps`;
    const allNames = subs.map((x) => x.name).join(", ");
    const doneStems = [...scanStems];
    let targetId = null; // the gaps quiz, created lazily on the first successful subtopic
    let total = 0;

    try {
      for (const s of subs) {
        if (seqStopRef.current) break;
        prog[s.name].status = "working"; setSeqProgress({ ...prog });
        const { collected, lastErr } = await runSubtopic(s.i, doneStems);
        if (collected.length) {
          try {
            targetId = await ensureGapsQuiz(targetId);
            await insertGapQuestions(targetId, collected, allNames);
            total += collected.length;
            doneStems.push(...collected.map((q) => q.text).filter(Boolean));
            prog[s.name] = { status: "done", count: collected.length };
          } catch (e) { prog[s.name] = { status: "failed", count: 0, err: e.message || "Insert failed." }; }
        } else {
          prog[s.name] = { status: "failed", count: 0, err: lastErr || "No questions returned — keys may be rate-limited/out of quota, or the mix is too large for the free tier." };
        }
        setSeqProgress({ ...prog });
      }
      const failed = Object.values(prog).filter((p) => p.status === "failed").length;
      const failNote = failed ? ` ${failed} subtopic(s) produced 0 (rate-limited/out of quota or too large a mix — try fewer questions or more working keys).` : "";
      setSeqMsg(seqStopRef.current
        ? `Stopped. Generated ${total} question(s) into “${targetName}” so far.${failNote}`
        : `Done — generated ${total} question(s) across ${subs.length} subtopic(s) into “${targetName}”.${failNote}`);
      if (targetId) load(view); // refresh the quiz list
    } catch (e) {
      setSeqMsg(e.message || "Sequential generation failed.");
    } finally {
      setSeqRunning(false);
      seqStopRef.current = false;
      setSeqLive(null);
    }
  };

  const cancelSequential = () => { seqStopRef.current = true; setSeqMsg("Stopping after the current subtopic…"); };

  // ── Question-mix helpers (shared mix set once, applied to every subtopic) ──
  const setGlobalType = (type, diff, value) => setGlobalMix((prev) => {
    const row = { ...prev }; const cell = { ...(row[type] || {}) };
    let n = parseInt(value, 10); if (!Number.isFinite(n) || n < 0) n = 0;
    cell[diff] = n; row[type] = cell; return row;
  });
  const applyMixToAll = () => {
    const total = mixTotal(globalMix);
    if (total <= 0) { setSeqMsg("Set at least one question in the mix above first."); return; }
    const clone = JSON.parse(JSON.stringify(globalMix));
    setScanTypes(Object.fromEntries(scanMissing.map((_, i) => [i, JSON.parse(JSON.stringify(clone))])));
    setScanCounts(Object.fromEntries(scanMissing.map((_, i) => [i, total])));
    setSeqMsg(`Applied ${total} question(s) per subtopic (same mix) to all ${scanMissing.length} subtopic(s).`);
  };
  const setSubType = (i, type, diff, value) => setScanTypes((prev) => {
    const cap = Math.max(0, parseInt(scanCounts[i], 10) || 0);
    const row = { ...(prev[i] || {}) };
    const cell = { ...(row[type] || {}) };
    const othersTotal = mixTotal(row) - (parseInt(cell[diff], 10) || 0);
    let n = parseInt(value, 10); if (!Number.isFinite(n) || n < 0) n = 0;
    n = Math.min(n, Math.max(0, cap - othersTotal));
    cell[diff] = n;
    row[type] = cell;
    return { ...prev, [i]: row };
  });
  const toggleTypeRow = (i) => {
    setOpenTypeRows((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
    setScanTypes((prev) => (prev[i] ? prev : { ...prev, [i]: { mcq: { Medium: Math.max(0, parseInt(scanCounts[i], 10) || 0) } } }));
  };

  // Remember the current drill-down position so a page refresh restores it.
  useEffect(() => {
    saveNav(NAV_KEY, { view, stream, subject, topic, session, quiz });
  }, [view, stream, subject, topic, session, quiz]);

  // Navigation WRITES THE URL (the single source of truth). react-router then
  // manages history natively, so Back/Forward, refresh, deep links and new tabs
  // all work with no manual history juggling. We also set the object we already
  // hold so the breadcrumb name shows instantly without waiting for a refetch.
  const openStream = (s) => { setStream(s); setSearchParams({ s: s._id }); };
  const openSubject = (s) => {
    // A subject REUSED from another stream (its home `stream` differs from the
    // one we're browsing) opens in ITS ORIGINAL/home stream, where its topics
    // live — so shared content is never duplicated. Otherwise open normally.
    const home = s?.stream ? String(s.stream) : sid;
    if (home && sid && home !== sid) { setSubject(s); setSearchParams({ s: home, sub: s._id }); return; }
    setSubject(s);
    setSearchParams({ s: sid, sub: s._id });
  };
  const openTopic = (t) => { setTopic(t); setSearchParams({ s: sid, sub: subId, t: t._id }); };
  const openSession = (s) => { setSession(s); setSearchParams({ s: sid, sub: subId, t: tid, se: s._id }); };
  const openQuiz = (q) => { setQuiz(q); setSearchParams({ s: sid, sub: subId, t: tid, se: seid, qz: q._id }); };

  // Breadcrumb / upward navigation: drop every DEEPER ID from the URL. Because
  // `view` derives from which IDs are present, this can never leave stale child
  // state behind — the URL, breadcrumb and selection always match.
  const goTo = (level) => {
    if (level === "streams") setSearchParams({});
    else if (level === "subjects") setSearchParams({ s: sid });
    else if (level === "topics") setSearchParams({ s: sid, sub: subId });
    else if (level === "quizzes") setSearchParams({ s: sid, sub: subId, t: tid, ...(seid ? { se: seid } : {}) });
    else setSearchParams({ s: sid, sub: subId, t: tid, se: seid, qz: qid });
  };

  // Open the right level for the current view (used for whole-card tapping).
  const openItem = (item) =>
    view === "streams" ? openStream(item)
    : view === "subjects" ? openSubject(item)
    : view === "topics" ? openTopic(item)
    : view === "sessions" ? openSession(item)
    : view === "quizzes" ? openQuiz(item)
    : undefined;

  // ---- Save handlers ----
  const save = async (form) => {
    setSaving(true);
    setError("");
    try {
      const { type, mode, data } = modal;
      if (type === "stream") {
        if (mode === "add") await contentService.createStream(form);
        else await contentService.updateStream(data._id, form);
      } else if (type === "subject") {
        if (mode === "add") await contentService.createSubject({ ...form, stream: stream._id });
        else await contentService.updateSubject(data._id, form);
      } else if (type === "topic") {
        if (mode === "add") await contentService.createTopic({ ...form, subject: subject._id });
        else await contentService.updateTopic(data._id, form);
      } else if (type === "session") {
        if (mode === "add") await contentService.createSession({ ...form, subject: subject._id, topic: topic._id });
        else await contentService.updateSession(data._id, form);
      } else if (type === "quiz") {
        if (mode === "add") await contentService.createQuiz({ ...form, subject: subject._id, session: session._id });
        else await contentService.updateQuiz(data._id, form);
      }
      setModal(null);
      load(view);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Bulk-add several suggested subjects to the current stream in one go. Each is
  // created with its own name/icon/colour/description; failures (e.g. a name
  // that already exists) are skipped and summarised rather than aborting the batch.
  const bulkSaveSubjects = async (list) => {
    if (!list?.length || !stream?._id) return;
    setSaving(true);
    setError("");
    setBulkAddBusy({ done: 0, total: list.length, added: 0, kind: "subject" }); // live counter
    try {
      let added = 0;
      const failed = [];
      for (const s of list) {
        try {
          await contentService.createSubject({
            name: s.name,
            description: s.description || "",
            icon: s.icon || "BookOpen",
            color: s.color || COLORS[0],
            stream: stream._id,
          });
          added += 1;
        } catch (e) {
          failed.push(`${s.name} — ${e.message}`);
        }
        // Update the live "Added X of Y" counter after every attempt.
        setBulkAddBusy((p) => (p ? { ...p, done: p.done + 1, added } : p));
      }
      setModal(null);
      load(view);
      if (failed.length) {
        window.alert(`Added ${added} subject${added === 1 ? "" : "s"}.\nSkipped ${failed.length}:\n\n${failed.join("\n")}`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
      setBulkAddBusy(null);
    }
  };

  // Bulk-add several suggested topics to the current subject in one go — the
  // topic-level twin of bulkSaveSubjects. Each topic keeps its title/description
  // and gets a sequential order index appended after the existing ones; failures
  // (e.g. a duplicate title) are skipped and summarised rather than aborting.
  const bulkSaveTopics = async (list) => {
    if (!list?.length || !subject?._id) return;
    setSaving(true);
    setError("");
    setBulkAddBusy({ done: 0, total: list.length, added: 0, kind: "topic" }); // live counter
    try {
      let added = 0;
      const failed = [];
      let idx = items?.length || 0; // continue numbering after the topics already there
      for (const t of list) {
        try {
          idx += 1;
          await contentService.createTopic({
            title: t.name || t.title,
            description: t.description || "",
            index: idx,
            subject: subject._id,
          });
          added += 1;
        } catch (e) {
          failed.push(`${t.name || t.title} — ${e.message}`);
        }
        // Update the live "Added X of Y" counter after every attempt.
        setBulkAddBusy((p) => (p ? { ...p, done: p.done + 1, added } : p));
      }
      setModal(null);
      load(view);
      if (failed.length) {
        window.alert(`Added ${added} topic${added === 1 ? "" : "s"}.\nSkipped ${failed.length}:\n\n${failed.join("\n")}`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
      setBulkAddBusy(null);
    }
  };

  // Question add/edit uses the shared QuestionFormModal, which passes a clean payload.
  const saveQuestion = async (payload) => {
    setSaving(true);
    setError("");
    try {
      if (modal.mode === "add") {
        await contentService.createQuestion({ ...payload, subject: subject._id, session: session._id, quiz: quiz._id });
      } else {
        await contentService.updateQuestion(modal.data._id, payload);
      }
      setModal(null);
      load(view);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Split a quiz (or a whole topic) into quizzes of `splitPer` questions each.
  const doSplit = async () => {
    if (!splitTarget) return;
    const per = Math.max(1, parseInt(splitPer, 10) || 50);
    setSplitting(true);
    setError("");
    try {
      const res = splitTarget.kind === "topic"
        ? await contentService.splitTopic(splitTarget.id, per)
        : await contentService.splitQuiz(splitTarget.id, per);
      setSplitTarget(null);
      window.alert(res?.message || "Done.");
      load(view);
    } catch (e) {
      setError(e.message);
    } finally {
      setSplitting(false);
    }
  };

  // Merge the selected sibling quizzes INTO `mergeTarget` (moves their questions
  // in, then deletes the emptied source quizzes).
  const doMerge = async () => {
    if (!mergeTarget || !mergeIds.length) return;
    setMerging(true);
    setError("");
    try {
      const res = await contentService.mergeQuiz(mergeTarget._id, mergeIds);
      setMergeTarget(null);
      setMergeIds([]);
      window.alert(res?.message || "Merged.");
      load(view);
    } catch (e) {
      setError(e.message);
    } finally {
      setMerging(false);
    }
  };

  // Remove the ticked duplicate subjects/topics (soft-delete → Recycle Bin, so
  // they're recoverable). A shared/linked subject is UNLINKED from this stream
  // instead of deleted, keeping its home stream + content intact.
  const bulkRemoveDuplicates = async (type, ids) => {
    if (!ids?.length) return;
    setSaving(true);
    setError("");
    setBulkAddBusy({ done: 0, total: ids.length, added: 0, kind: type });
    const failed = [];
    for (const id of ids) {
      try {
        if (type === "subject") {
          const it = items.find((x) => x._id === id);
          const isLinked = it?.stream && sid && String(it.stream) !== sid;
          if (isLinked) await contentService.unlinkSubject(id, sid);
          else await contentService.deleteSubject(id);
        } else {
          await contentService.deleteTopic(id);
        }
      } catch {
        failed.push(id);
      }
      setBulkAddBusy((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setSaving(false);
    setBulkAddBusy(null);
    if (failed.length) setError(`Couldn't remove ${failed.length} item${failed.length === 1 ? "" : "s"}.`);
    load(view);
  };

  const remove = async (type, id, label) => {
    // A SHARED subject (linked from another stream — its home `stream` differs
    // from the one we're browsing) is UNLINKED from this stream rather than
    // deleted, so its home stream and shared content stay intact.
    if (type === "subject") {
      const it = items.find((x) => x._id === id);
      const isLinked = it?.stream && sid && String(it.stream) !== sid;
      if (isLinked) {
        if (!window.confirm(`Remove the shared subject "${label}" from this stream? It stays in its home stream with all its content.`)) return;
        try { await contentService.unlinkSubject(id, sid); load(view); } catch (e) { setError(e.message); }
        return;
      }
    }
    if (!window.confirm(`Delete "${label}"? This also removes everything inside it.`)) return;
    try {
      if (type === "stream") await contentService.deleteStream(id);
      else if (type === "subject") await contentService.deleteSubject(id);
      else if (type === "topic") await contentService.deleteTopic(id);
      else if (type === "session") await contentService.deleteSession(id);
      else if (type === "quiz") await contentService.deleteQuiz(id);
      else if (type === "question") await contentService.deleteQuestion(id);
      load(view);
    } catch (e) {
      setError(e.message);
    }
  };

  // Public share link for a node — the page a student/visitor would open.
  //   stream  → /streams/<slug>      subject → /subjects/<slug>
  //   topic   → /quiz/<subjectId>/<topicId>
  //   quiz    → /quiz/<subjectId>/<topicId>/<sessionId>/<quizId>
  const sharePath = (item) => {
    if (view === "streams") return item.slug ? `/streams/${item.slug}` : null;
    if (view === "subjects") return item.slug ? `/subjects/${item.slug}` : null;
    if (view === "topics") return subject ? `/public-quizzes/${subject._id}/${item._id}` : null;
    if (view === "quizzes") return subject && topic && session ? `/public-quizzes/${subject._id}/${topic._id}/${session._id}/${item._id}` : null;
    return null;
  };
  const shareLink = async (item) => {
    const path = sharePath(item);
    if (!path) { setError("No public link is available for this item."); return; }
    const url = `${window.location.origin}${path}`;
    try { await navigator.clipboard.writeText(url); window.alert(`Public link copied:\n${url}`); }
    catch { window.prompt("Copy this public link:", url); }
  };

  // Toggle a node's "disabled" flag (hide from students / public) via its
  // existing update endpoint. Admins still see disabled items (with a badge).
  const toggleDisabled = async (item) => {
    const svc = view === "streams" ? contentService.updateStream
      : view === "subjects" ? contentService.updateSubject
      : view === "topics" ? contentService.updateTopic
      : view === "quizzes" ? contentService.updateQuiz
      : null;
    if (!svc) return;
    try { await svc(item._id, { disabled: !item.disabled }); load(view); }
    catch (e) { setError(e.message); }
  };

  // ---- Breadcrumb ----
  const Crumb = () => (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      <button onClick={() => goTo("streams")} className={`rounded px-2 py-1 font-medium ${view === "streams" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>Streams</button>
      {stream && view !== "streams" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("subjects")} className={`rounded px-2 py-1 font-medium ${view === "subjects" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{stream.name}</button>
      </>)}
      {subject && view !== "streams" && view !== "subjects" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("topics")} className={`rounded px-2 py-1 font-medium ${view === "topics" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{subject.name}</button>
      </>)}
      {topic && (view === "quizzes" || view === "questions") && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <button onClick={() => goTo("quizzes")} className={`rounded px-2 py-1 font-medium ${view === "quizzes" ? "text-brand-600" : "text-slate-500 hover:text-brand-600"}`}>{topic.title}</button>
      </>)}
      {quiz && view === "questions" && (<>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="rounded px-2 py-1 font-medium text-brand-600">{quiz.title}</span>
      </>)}
    </nav>
  );

  const headings = {
    streams: { title: "Streams", add: "Add Stream", icon: GraduationCap },
    subjects: { title: `Subjects in ${stream?.name || ""}`, add: "Add Subject", icon: FolderOpen },
    topics: { title: `Topics in ${subject?.name || ""}`, add: "Add Topic", icon: Layers },
    sessions: { title: `Sessions in ${topic?.title || ""}`, add: "Add Session", icon: BookOpen },
    quizzes: { title: `Quizzes in ${topic?.title || ""}`, add: "Add Quiz", icon: ListChecks },
    questions: { title: `Questions in ${quiz?.title || ""}`, add: "Add Question", icon: HelpCircle },
  };
  const H = headings[view];

  const openAdd = () => setModal({ type: VIEW_TYPE[view], mode: "add", data: {} });
  const openEdit = (item) => setModal({ type: VIEW_TYPE[view], mode: "edit", data: item });

  // Copy all questions of the current quiz as CSV text to the clipboard.
  const copyCsv = async (questions) => {
    if (!questions?.length) return;
    try {
      await navigator.clipboard.writeText(questionsToCsv(questions));
      window.alert(`Copied ${questions.length} question(s) as CSV to the clipboard.`);
    } catch {
      window.alert("Couldn't access the clipboard — use “Download CSV” instead.");
    }
  };

  // Download all questions of the current quiz as a .csv file.
  const downloadCsv = (questions, name) => {
    if (!questions?.length) return;
    const url = URL.createObjectURL(new Blob([questionsToCsv(questions)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(name || "quiz").replace(/[^\w-]+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Fuzzy question search: 40%+ matches, best first (null when not searching).
  const questionResults = view === "questions" ? searchQuestions(items, search) : null;
  const shown = questionResults || items;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Public Quizzes Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Stream → Subject → Topic → Quiz → Questions. Add, edit or delete at any level.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setDupScope({ id: subject?._id || "all", name: subject?.name || "" }); setDupOpen(true); }}
            className="btn-outline"
            title={subject ? `Scan duplicates in ${subject.name}` : "Scan all questions for duplicates"}
          >
            <Files className="h-4 w-4" /> Find Duplicate Questions{subject ? ` — ${subject.name}` : ""}
          </button>
          <button
            onClick={() => setRecycleOpen(true)}
            className="btn-outline"
            title="Restore recently deleted streams, subjects, topics, sessions, quizzes or questions"
          >
            <Archive className="h-4 w-4" /> Recycle Bin
          </button>
          {view === "questions" && (
            <>
              <button onClick={() => { setTypeFilter([]); setStatusFilter("all"); setViewAll(true); }} className="btn-outline">
                <Eye className="h-4 w-4" /> View All
              </button>
              <button onClick={() => setBulkOpen(true)} className="btn-outline">
                <Upload className="h-4 w-4" /> Bulk Upload
              </button>
              <button onClick={() => openContentGenerate()} className="btn-outline text-brand-600">
                <Sparkles className="h-4 w-4" /> Generate with AI
              </button>
              <button onClick={() => openContentImport()} className="btn-outline text-brand-600">
                <Globe className="h-4 w-4" /> Import from Web
              </button>
              <button onClick={() => setExtendOpen(true)} disabled={!items.length} className="btn-outline text-brand-600" title="AI: make all explanations detailed for this quiz">
                <Wand2 className="h-4 w-4" /> Extend Explanations
              </button>
              <button onClick={() => setRegenAllOpen(true)} disabled={!items.length} className="btn-outline text-violet-600" title="AI: regenerate every question's options/answer (reshuffles pair/matching Column B)">
                <RefreshCw className="h-4 w-4" /> Regenerate All
              </button>
              <button onClick={() => copyCsv(selected.length ? items.filter((q) => selected.includes(q._id)) : items)} disabled={!items.length} className="btn-outline">
                <Copy className="h-4 w-4" /> Copy CSV{selected.length ? ` (${selected.length})` : ""}
              </button>
              <button onClick={() => downloadCsv(selected.length ? items.filter((q) => selected.includes(q._id)) : items, quiz?.title || "quiz")} disabled={!items.length} className="btn-outline">
                <Download className="h-4 w-4" /> Download CSV{selected.length ? ` (${selected.length})` : ""}
              </button>
            </>
          )}
          {view === "subjects" && (
            <>
              <button onClick={() => setMissingLevel("subject")} className="btn-outline text-brand-600" title="Ask AI which subjects belong to this stream, then add the ones you're missing">
                <ScanSearch className="h-4 w-4" /> Search Missing Subjects
              </button>
              <button onClick={() => setDupLevel("subject")} className="btn-outline text-brand-600" title="Find duplicate or overlapping subjects in this stream and remove the extras">
                <Copy className="h-4 w-4" /> Find Duplicate Subjects
              </button>
              <button onClick={() => setLinkOpen(true)} className="btn-outline" title="Reuse a subject that already exists in another stream (no duplicate — content stays shared)">
                <Link2 className="h-4 w-4" /> Add Existing Subject
              </button>
            </>
          )}
          {view === "topics" && (
            <>
              <button onClick={() => setMissingLevel("topic")} className="btn-outline text-brand-600" title="Ask AI which topics make up this subject, then add the ones you're missing">
                <ScanSearch className="h-4 w-4" /> Search Missing Topics
              </button>
              <button onClick={() => setDupLevel("topic")} className="btn-outline text-brand-600" title="Find duplicate or overlapping topics in this subject and remove the extras">
                <Copy className="h-4 w-4" /> Find Duplicate Topics
              </button>
            </>
          )}
          {view === "quizzes" && (
            <>
              <button onClick={scanMissingAreas} className="btn-outline text-brand-600" title="Scan this topic's questions for uncovered syllabus areas, then generate the missing ones">
                <ScanSearch className="h-4 w-4" /> Scan Missing Areas
              </button>
              <button onClick={() => openContentGenerate({ topicLevel: true })} className="btn-outline text-brand-600" title="Generate other question types for this topic (pick the types in the generator)">
                <Sparkles className="h-4 w-4" /> Other question types
              </button>
            </>
          )}
          <button onClick={openAdd} className="btn-primary">
            <Plus className="h-4 w-4" /> {H.add}
          </button>
        </div>
      </div>

      <div className="card px-4 py-3"><Crumb /></div>

      {savedSession && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900/50 dark:bg-brand-900/20">
          <Sparkles className="h-5 w-5 flex-shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Resume your previous AI session</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {savedSession.done}{savedSession.target > savedSession.done ? ` of ${savedSession.target}` : ""} question(s) saved for “{savedSession.label}”. Pick up where you left off — no duplicates.
            </p>
          </div>
          <button onClick={() => openContentGenerate()} className="btn-primary py-1.5 text-sm">
            <Wand2 className="h-4 w-4" /> Resume previous session
          </button>
          <button onClick={discardSavedSession} className="btn-outline py-1.5 text-sm">Discard</button>
        </div>
      )}

      {loading ? (
        <Loading label={`Loading ${view}...`} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(view)} />
      ) : items.length === 0 ? (
        <EmptyState message={`No ${view} yet. Click "${H.add}".`} />
      ) : (
        <div className="space-y-3">
          {view === "questions" && (
            <div className="space-y-3">
              {/* Search questions — shows a match % (40%–100%), best first */}
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions…  (shows matches 40%–100%)"
                  className="w-full bg-transparent text-sm outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} title="Clear search" className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-700">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-5 w-5 accent-brand-600" /> Select all
                </label>
                {questionResults && (
                  <span className="text-sm font-medium text-slate-500">{questionResults.length} match{questionResults.length === 1 ? "" : "es"} (40%+)</span>
                )}
                {(selected.length > 0 || delProgress) && (
                  delProgress ? (
                    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${delProgress.finished ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                      {delProgress.finished ? (
                        <><CheckCircle2 className="h-4 w-4" /> Deleted {delProgress.total} question{delProgress.total === 1 ? "" : "s"}{delProgress.remaining != null ? ` — ${delProgress.remaining} remaining` : " — done"}</>
                      ) : (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Deleting {delProgress.done} of {delProgress.total}…</>
                      )}
                    </span>
                  ) : (
                    <>
                      <span className="text-sm text-slate-500">{selected.length} selected</span>
                      <button onClick={() => setMoveQ({ mode: "move" })} className="btn-outline py-1.5"><ArrowRightLeft className="h-4 w-4" /> Move</button>
                      <button onClick={() => setMoveQ({ mode: "copy" })} className="btn-outline py-1.5"><Copy className="h-4 w-4" /> Copy</button>
                      <button onClick={deleteSelected} className="btn-outline py-1.5 text-rose-600"><Trash2 className="h-4 w-4" /> Delete selected</button>
                      <button onClick={() => setSelected([])} className="text-sm text-slate-500 hover:underline">Clear</button>
                    </>
                  )
                )}
              </div>
            </div>
          )}
          {view !== "questions" && items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-2 dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={allNodesSelected} onChange={toggleAllNodes} className="h-5 w-5 accent-brand-600" /> Select all
              </label>
              {(selNodes.length > 0 || delNodeBusy) && (
                delNodeBusy ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting {delNodeBusy.done} of {delNodeBusy.total}…
                  </span>
                ) : (
                  <>
                    <span className="text-sm text-slate-500">{selNodes.length} selected</span>
                    {view === "streams" && isSuperAdmin && (
                      <button
                        onClick={() => setShareInstitutesTarget({ targets: items.filter((it) => selNodes.includes(it._id)).map((it) => ({ id: it._id, name: it.name || it.title })) })}
                        className="btn-outline py-1.5 text-indigo-600"
                      >
                        <Building2 className="h-4 w-4" /> Share to institutes
                      </button>
                    )}
                    <button onClick={deleteSelectedNodes} className="btn-outline py-1.5 text-rose-600"><Trash2 className="h-4 w-4" /> Delete selected</button>
                    <button onClick={() => setSelNodes([])} className="text-sm text-slate-500 hover:underline">Clear</button>
                  </>
                )
              )}
              <span className="ml-auto text-xs text-slate-400">Tick to delete several at once</span>
            </div>
          )}
          {questionResults && questionResults.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              No questions match “{search}” at 40% or higher. Try fewer or different words.
            </p>
          )}
          <div className={view === "questions" ? "space-y-3" : "grid items-start gap-3 sm:grid-cols-2"}>
          {shown.map((item, i) => (
            <div
              key={item._id}
              onClick={view !== "questions" ? () => openItem(item) : undefined}
              className={`card p-5 ${view !== "questions" ? "cursor-pointer transition hover:border-brand-300 dark:hover:border-brand-600" : ""}`}
            >
              <div className="flex items-center gap-3">
              {view === "questions" && (
                <input type="checkbox" checked={selected.includes(item._id)} onChange={() => toggleSelect(item._id)} className="h-5 w-5 flex-shrink-0 accent-brand-600" />
              )}
              {view !== "questions" && (
                <input type="checkbox" checked={selNodes.includes(item._id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleNode(item._id)} className="h-5 w-5 flex-shrink-0 accent-brand-600" title="Select to delete" />
              )}
              <div className="min-w-0 flex-1">
                {view === "questions" ? (
                  <>
                    <p className="truncate font-medium"><span className="text-slate-400">Q{i + 1}.</span> {item.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item._match != null && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{item._match}% match</span>
                      )}
                      <Badge variant={item.type === "matching" ? "accent" : "brand"}>
                        {item.type === "matching" ? "Matching" : "MCQ"}
                      </Badge>
                      <Badge variant={item.difficulty}>{item.difficulty}</Badge>
                      <Badge variant={item.status === "published" ? "brand" : "neutral"}>{item.status}</Badge>
                      {item.correct !== undefined && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Correct: {String.fromCharCode(65 + item.correct)}</span>
                      )}
                      {questionDateText(item) && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" /> {questionDateText(item)}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <H.icon className="h-5 w-5 flex-shrink-0 text-brand-500" />
                      <p className="truncate font-semibold">{item.name || item.title}</p>
                      {item.disabled && <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Disabled</span>}
                      {view === "subjects" && item.stream && sid && String(item.stream) !== sid && (
                        <span className="flex-shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" title="This subject also lives in another stream — opening it goes to where it was first added">Shared</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {view === "streams" && `${item.subjects ?? 0} subjects`}
                      {view === "subjects" && `${item.topics ?? 0} topics`}
                      {view === "topics" && `${item.quizzes ?? 0} quizzes`}
                      {view === "quizzes" && `${item.questions ?? 0} questions · ${item.difficulty}`}
                    </p>
                  </>
                )}
              </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
                {view === "subjects" && (
                  <RowActionButton icon={Files} label="Duplicates" tone="brand" title={`Find duplicates in ${item.name}`} onClick={() => { setDupScope({ id: item._id, name: item.name }); setDupOpen(true); }} />
                )}
                {view === "questions" && (
                  <RowActionButton icon={Eye} label="View" tone="slate" onClick={() => setViewQ(item)} />
                )}
                {view === "questions" && (
                  <RowActionButton icon={Wand2} label="Extend with AI" tone="brand" loading={extendingQId === item._id} title="Extend this explanation with AI" onClick={() => extendOneQuestion(item)} />
                )}
                {view === "questions" && (
                  <RowActionButton icon={RefreshCw} label="Regenerate" tone="violet" loading={regenId === item._id} title="Regenerate options/answer to fit the question (reshuffles pair/matching columns)" onClick={() => regenerateQ(item)} />
                )}
                {(view === "quizzes" || view === "topics") && (
                  <RowActionButton icon={Scissors} label="Split" tone="indigo" title={view === "topics" ? "Split this topic's questions into quizzes of N" : "Split this quiz into quizzes of N"} onClick={() => { setSplitPer(50); setSplitTarget({ kind: view === "topics" ? "topic" : "quiz", id: item._id, name: item.title || item.name, count: item.questions ?? null }); }} />
                )}
                {view === "quizzes" && (
                  <RowActionButton icon={GitMerge} label="Merge" tone="indigo" title="Merge other quizzes in this topic into this one" onClick={() => { setMergeIds([]); setMergeTarget(item); }} />
                )}
                {view === "quizzes" && (
                  <RowActionButton icon={ArrowRightLeft} label="Move / Copy" tone="emerald" title="Migrate: move or copy this whole quiz to another topic" onClick={() => setMigrateQuiz(item)} />
                )}
                {view === "streams" && isSuperAdmin && (
                  <RowActionButton icon={Building2} label="Share to institutes" tone="indigo" title="Share a copy of this whole stream to institutes (appears in their account automatically)" onClick={() => setShareInstitutesTarget({ id: item._id, name: item.name })} />
                )}
                {view !== "questions" && (
                  <RowActionButton icon={Share2} label="Share link" tone="sky" title="Copy the public share link (the page students/visitors open)" onClick={() => shareLink(item)} />
                )}
                {view !== "questions" && (
                  <RowActionButton icon={item.disabled ? EyeOff : Eye} label={item.disabled ? "Enable" : "Disable"} tone={item.disabled ? "amber" : "slate"} title={item.disabled ? "Enable — show to students" : "Disable — hide from students (stays here for you)"} onClick={() => toggleDisabled(item)} />
                )}
                <RowActionButton icon={Pencil} label="Edit" tone="brand" onClick={() => openEdit(item)} />
                <RowActionButton icon={Trash2} label="Delete" tone="rose" onClick={() => remove(VIEW_TYPE[view], item._id, item.name || item.title || "this question")} />
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {modal && (modal.type === "question" ? (
        <QuestionFormModal
          key={modal.mode === "edit" ? modal.data?._id : "new-question"}
          question={modal.mode === "edit" ? modal.data : null}
          saving={saving}
          onClose={() => { setModal(null); setReopenAfterEdit(null); }}
          onSave={saveQuestion}
        />
      ) : (
        <FormModal
          modal={modal}
          streamName={stream?.name}
          subjectName={subject?.name}
          saving={saving}
          bulkProgress={bulkAddBusy}
          onClose={() => setModal(null)}
          onSave={save}
          onBulkSave={bulkSaveSubjects}
          onBulkSaveTopics={bulkSaveTopics}
          onAiSuggest={(name) => aiService.suggestSubjects({ stream: name, existing: items.map((it) => it.name || it.title).filter(Boolean) }).then((r) => r.subjects || [])}
          onAiSuggestTopics={(name) => aiService.suggestTopics({ subject: name, stream: stream?.name, existing: items.map((it) => it.name || it.title).filter(Boolean) }).then((r) => r.topics || [])}
        />
      ))}

      {missingLevel && (
        <MissingItemsModal
          level={missingLevel}
          parentName={missingLevel === "topic" ? subject?.name : stream?.name}
          parentKind={missingLevel === "topic" ? "subject" : "stream"}
          existing={items.map((it) => it.name || it.title).filter(Boolean)}
          fetchSuggestions={() =>
            missingLevel === "topic"
              ? aiService.suggestTopics({ subject: subject?.name, stream: stream?.name, existing: items.map((it) => it.name || it.title).filter(Boolean) }).then((r) => r.topics || [])
              : aiService.suggestSubjects({ stream: stream?.name, existing: items.map((it) => it.name || it.title).filter(Boolean) }).then((r) => r.subjects || [])
          }
          onAdd={async (picked) => {
            await (missingLevel === "topic" ? bulkSaveTopics : bulkSaveSubjects)(picked);
            setMissingLevel(null);
          }}
          bulkProgress={bulkAddBusy}
          onClose={() => setMissingLevel(null)}
        />
      )}

      {dupLevel && (
        <SubjectTopicDuplicatesModal
          level={dupLevel}
          parentName={dupLevel === "topic" ? subject?.name : stream?.name}
          fetchGroups={() =>
            aiService.findDuplicates({
              level: dupLevel,
              parentName: dupLevel === "topic" ? subject?.name : stream?.name,
              items: items.map((it) => ({ id: it._id, name: it.name || it.title })),
            })
          }
          onDelete={async (ids) => {
            await bulkRemoveDuplicates(dupLevel, ids);
            setDupLevel(null);
          }}
          bulkProgress={bulkAddBusy}
          onClose={() => setDupLevel(null)}
        />
      )}

      {linkOpen && (
        <LinkExistingSubjectModal
          streamId={stream?._id}
          streamName={stream?.name}
          existingIds={items.map((it) => it._id)}
          onClose={() => setLinkOpen(false)}
          onLinked={() => { setLinkOpen(false); load(view); }}
        />
      )}

      <ContentMoveQuestionsModal
        open={!!moveQ}
        mode={moveQ?.mode}
        sourceQuizId={quiz?._id}
        questionIds={selected}
        onClose={() => setMoveQ(null)}
        onMoved={() => { setSelected([]); load("questions"); }}
      />

      <ContentMoveQuizModal
        open={!!migrateQuiz}
        quiz={migrateQuiz}
        onClose={() => setMigrateQuiz(null)}
        onMoved={() => { load("quizzes"); }}
      />

      <BulkUploadQuestions
        open={bulkOpen}
        title={`Bulk Upload Questions${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setBulkOpen(false)}
        onUpload={async (questions, opts = {}) => {
          if (opts.replace) {
            for (const it of items) await contentService.deleteQuestion(it._id);
          }
          const res = await contentService.bulkQuestions(questions, {
            subject: subject._id,
            session: session._id,
            quiz: quiz._id,
          });
          load("questions");
          return res;
        }}
      />

      {/* Scan missing areas — coverage report across all quizzes in this topic */}
      {scanOpen && (
        <div className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 ${scanFull ? "items-stretch p-2 sm:p-4" : "items-start p-4"}`} onClick={() => setScanOpen(false)}>
          <div className={`card flex flex-col p-6 ${scanFull ? "m-0 h-full w-full max-w-none" : "my-8 max-h-[calc(100vh-4rem)] w-full max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <ScanSearch className="h-5 w-5 text-brand-600" /> Missing areas{scanTopic ? ` — ${scanTopic}` : ""}
              </h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setScanFull((v) => !v)} title={scanFull ? "Exit full screen" : "Full screen"} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  {scanFull ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </button>
                <button onClick={() => setScanOpen(false)} title="Close"><X className="h-5 w-5" /></button>
              </div>
            </div>

            {scanning ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning {items.length} quiz(zes) for uncovered subtopics…
              </p>
            ) : scanErr ? (
              <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{scanErr}</div>
            ) : scanMissing.length === 0 ? (
              <p className="text-sm text-slate-500">No obvious gaps found — the {scanStems.length} question(s) here already cover the topic broadly.</p>
            ) : (
              <>
                {scanResumed && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                    <Save className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Resumed your <b>saved plan</b> for this topic — your list and progress were kept. Use <b>Re-scan</b> below to refresh the gaps.</span>
                  </div>
                )}
                <p className="mb-2 text-sm text-slate-500">
                  These subtopics are <b>not yet covered</b> (in study order). Set the question mix <b>once</b> below and apply it to every subtopic — they're generated <b>one subtopic at a time</b> into a new quiz. This list is <b>saved automatically</b>, so you can close it and finish later.
                </p>

                {/* Shared question mix — set the type × level counts once, apply to all subtopics. */}
                <div className="mb-2 rounded-xl border border-brand-200 bg-brand-50/40 dark:border-brand-900/40 dark:bg-brand-900/10">
                  <button onClick={() => setMixOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold">
                    <span>Question mix for all subtopics{mixTotal(globalMix) > 0 ? ` — ${mixTotal(globalMix)}/subtopic` : ""}</span>
                    <span className="text-slate-400">{mixOpen ? "▾" : "▸"}</span>
                  </button>
                  {mixOpen && (
                    <div className="px-3 pb-3">
                      <div className="grid grid-cols-[1fr_repeat(3,3rem)] items-center gap-x-2 gap-y-1">
                        <span />
                        {GEN_DIFFS.map((d) => <span key={d} className="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">{d}</span>)}
                        {GEN_TYPES.map((t) => (
                          <Fragment key={t.id}>
                            <span className="text-xs text-slate-600 dark:text-slate-300">{t.label}</span>
                            {GEN_DIFFS.map((d) => (
                              <input key={d} type="number" min="0" value={globalMix[t.id]?.[d] ?? 0} onChange={(e) => setGlobalType(t.id, d, e.target.value)} className="input !w-12 py-0.5 text-center text-xs" />
                            ))}
                          </Fragment>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Total <b>{mixTotal(globalMix)}</b> questions per subtopic</span>
                        <button onClick={applyMixToAll} className="btn-primary py-1 text-xs"><Sparkles className="h-3.5 w-3.5" /> Apply to all {scanMissing.length} subtopics</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className={`space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${scanFull ? "min-h-0 flex-1" : "max-h-72"}`}>
                  {scanMissing.map((m, i) => {
                    const st = seqProgress[m];
                    const cap = Math.max(0, parseInt(scanCounts[i], 10) || 0);
                    const row = scanTypes[i] || {};
                    const alloc = mixTotal(row);
                    const customized = alloc > 0;
                    return (
                      <div key={i} className="border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-brand-500">•</span>
                          <span className="flex-1 text-sm">{m}</span>
                          {st?.status === "working" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> generating…</span>
                          ) : (
                            <>
                              {st?.status === "done" && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ {st.count}</span>}
                              {st?.status === "failed" && <span title={st.err} className="cursor-help text-xs font-semibold text-rose-600 dark:text-rose-400">✗ 0</span>}
                              <input
                                type="number" min="0"
                                value={scanCounts[i] ?? 10}
                                onChange={(e) => setScanCounts((c) => ({ ...c, [i]: e.target.value }))}
                                disabled={seqRunning}
                                title="Total questions for this subtopic (max for the type mix)"
                                className="input !w-14 py-1 text-xs"
                              />
                              <button onClick={() => toggleTypeRow(i)} className={`rounded-lg border px-2 py-1 text-xs font-medium ${customized ? "border-brand-500 text-brand-600" : "border-slate-200 text-slate-500 dark:border-slate-700"}`} title="Choose how many of each question type (MCQ, matching, …)">
                                Types{customized ? ` (${alloc})` : ""}
                              </button>
                              <button onClick={() => generateOne(i)} disabled={seqRunning} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50" title="Generate this subtopic now">
                                <Sparkles className="h-3.5 w-3.5" /> {st?.status === "done" || st?.status === "failed" ? "Again" : "Generate"}
                              </button>
                            </>
                          )}
                        </div>
                        {st?.status !== "working" && openTypeRows.has(i) && (
                          <div className="ml-4 mt-1 rounded-lg border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                              <span className="text-slate-500 dark:text-slate-400">Split up to <b>{cap}</b> across types</span>
                              <span className={alloc > cap ? "font-semibold text-rose-600" : "text-slate-500 dark:text-slate-400"}>allocated {alloc} · {Math.max(0, cap - alloc)} left</span>
                            </div>
                            <div className="grid grid-cols-[1fr_repeat(3,3rem)] items-center gap-x-2 gap-y-1">
                              <span />
                              {GEN_DIFFS.map((d) => <span key={d} className="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">{d}</span>)}
                              {GEN_TYPES.map((t) => (
                                <Fragment key={t.id}>
                                  <span className="text-xs text-slate-600 dark:text-slate-300">{t.label}</span>
                                  {GEN_DIFFS.map((d) => (
                                    <input
                                      key={d}
                                      type="number" min="0" max={cap}
                                      value={row[t.id]?.[d] ?? 0}
                                      onChange={(e) => setSubType(i, t.id, d, e.target.value)}
                                      className="input !w-12 py-0.5 text-center text-xs"
                                    />
                                  ))}
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {scanMissing.length > 0 && (() => {
                  const perSub = (i) => (scanTypes[i] ? mixTotal(scanTypes[i]) : (parseInt(scanCounts[i], 10) || 0));
                  const req = scanMissing.reduce((a, _, i) => a + perSub(i), 0);
                  const gen = Object.values(seqProgress).reduce((a, p) => a + (p.count || 0), 0);
                  const doneN = Object.values(seqProgress).filter((p) => p.status === "done" || p.status === "failed").length;
                  const activeSubs = scanMissing.filter((_, i) => perSub(i) > 0).length;
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800/40">
                      <span>Total requested: <b>{req}</b></span>
                      <span>Generated so far: <b className="text-emerald-600 dark:text-emerald-400">{gen}</b></span>
                      <span>Subtopics done: <b>{doneN}</b> / {activeSubs}</span>
                    </div>
                  );
                })()}
                {seqLive && (
                  <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-xs dark:border-brand-900/40 dark:bg-brand-900/10">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Now generating: {seqLive.subtopic}
                      <span className="font-normal text-slate-500 dark:text-slate-400">· {seqLive.count} question(s) so far</span>
                    </p>
                    {seqLive.byBucket?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {seqLive.byBucket.map((b, k) => (
                          <span key={k} className={`rounded-full border px-2 py-0.5 ${(b.have || 0) >= (b.want || 0) ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                            {(QUESTION_TYPE_LABELS[b.type] || b.type)} · {b.difficulty}: <b>{b.have || 0}</b>/{b.want || 0}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {seqMsg && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{seqMsg}</p>}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {seqRunning ? (
                    <button onClick={cancelSequential} className="btn-outline !text-rose-600 dark:!text-rose-400"><X className="h-4 w-4" /> Cancel &amp; keep</button>
                  ) : (
                    <>
                      <button onClick={() => { persistScan(scanTopic); setSeqMsg("Saved — you can close this and reopen \u201cMissing areas\u201d for this topic any time to resume the list and your progress."); }} className="btn-outline" title="Save this list & progress so you can finish it later"><Save className="h-4 w-4" /> Save</button>
                      <button onClick={() => runScan(scanTopic)} className="btn-outline" title="Scan again for fresh gaps (replaces the saved list)"><ScanSearch className="h-4 w-4" /> Re-scan</button>
                      <button onClick={() => setScanCounts(Object.fromEntries(scanMissing.map((_, i) => [i, 10])))} className="btn-outline">Set all to 10</button>
                      <button onClick={() => { try { navigator.clipboard?.writeText(scanMissing.join(", ")); } catch { /* ignore */ } }} className="btn-outline">Copy list</button>
                      <button onClick={generateFromGaps} className="btn-outline"><Sparkles className="h-4 w-4" /> All-in-one</button>
                      <button onClick={generateSequential} className="btn-primary"><Sparkles className="h-4 w-4" /> Generate per subtopic</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Split a quiz / topic into quizzes of N */}
      {splitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={splitting ? undefined : () => setSplitTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md animate-scale-in card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><Scissors className="h-5 w-5 text-indigo-600" /> Split into quizzes</h3>
              <button type="button" onClick={() => setSplitTarget(null)} disabled={splitting}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {splitTarget.kind === "topic"
                ? <>Split all questions in the topic <b>“{splitTarget.name}”</b> into quizzes named Quiz 1, Quiz 2, …</>
                : <>Split the quiz <b>“{splitTarget.name}”</b>{splitTarget.count != null ? <> ({splitTarget.count} questions)</> : null} — it keeps its name and first chunk; the rest go into new quizzes numbered after your existing ones (e.g. splitting “Quiz 2” adds Quiz 3, Quiz 4, …).</>}
            </p>
            <label className="mb-1 block text-sm font-semibold">Questions per quiz</label>
            <input
              type="number"
              min={1}
              max={500}
              value={splitPer}
              onChange={(e) => setSplitPer(e.target.value)}
              className="input"
              autoFocus
            />
            {splitTarget.count != null && (
              <p className="mt-1 text-xs text-slate-400">
                {splitTarget.count} questions ÷ {Math.max(1, parseInt(splitPer, 10) || 1)} = about {Math.ceil((splitTarget.count || 0) / Math.max(1, parseInt(splitPer, 10) || 1))} quiz(zes).
              </p>
            )}
            {splitTarget.kind === "topic" && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                This reorganises the whole topic: all its questions move into fresh Quiz 1…N, and the topic's old quizzes are replaced.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSplitTarget(null)} disabled={splitting} className="btn-outline">Cancel</button>
              <button type="button" onClick={doSplit} disabled={splitting} className="btn-primary">
                {splitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Splitting…</> : <><Scissors className="h-4 w-4" /> Split</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge sibling quizzes (same session) into one */}
      {mergeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={merging ? undefined : () => setMergeTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md animate-scale-in card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><GitMerge className="h-5 w-5 text-indigo-600" /> Merge into “{mergeTarget.title || mergeTarget.name}”</h3>
              <button type="button" onClick={() => setMergeTarget(null)} disabled={merging}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Pick other quizzes in this topic to merge into <b>“{mergeTarget.title || mergeTarget.name}”</b>. Their questions move in and the emptied quizzes are deleted.
            </p>
            {(() => {
              const others = items.filter((it) => it._id !== mergeTarget._id);
              if (!others.length) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">There are no other quizzes in this topic to merge.</p>;
              const otherIds = others.map((o) => o._id);
              const allSelected = otherIds.every((id) => mergeIds.includes(id));
              return (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border-b border-slate-200 px-2 py-1.5 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                    <input type="checkbox" checked={allSelected} onChange={() => setMergeIds(allSelected ? [] : otherIds)} />
                    <span className="text-sm">Select all <span className="text-slate-400">· {others.length}</span></span>
                  </label>
                  {others.map((it) => (
                    <label key={it._id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="checkbox" checked={mergeIds.includes(it._id)} onChange={() => setMergeIds((s) => (s.includes(it._id) ? s.filter((x) => x !== it._id) : [...s, it._id]))} />
                      <span className="text-sm">{it.title || it.name} <span className="text-slate-400">· {it.questions ?? 0} q</span></span>
                    </label>
                  ))}
                </div>
              );
            })()}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setMergeTarget(null)} disabled={merging} className="btn-outline">Cancel</button>
              <button type="button" onClick={doMerge} disabled={merging || !mergeIds.length} className="btn-primary">
                {merging ? <><Loader2 className="h-4 w-4 animate-spin" /> Merging…</> : <><GitMerge className="h-4 w-4" /> Merge{mergeIds.length ? ` ${mergeIds.length}` : ""}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <DuplicatesModal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        defaultSubject={dupScope.id}
        defaultSubjectName={dupScope.name}
      />

      {shareInstitutesTarget && (
        <ShareToInstitutesModal
          area="public-quiz"
          target={shareInstitutesTarget.targets ? undefined : shareInstitutesTarget}
          targets={shareInstitutesTarget.targets}
          onClose={() => setShareInstitutesTarget(null)}
        />
      )}

      <RecycleBinModal
        open={recycleOpen}
        onClose={() => setRecycleOpen(false)}
        onChange={() => load(view)}
      />

      <ExtendExplanationsModal
        open={extendOpen}
        target={{ quiz: quiz?._id }}
        title={`Extend all explanations${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setExtendOpen(false)}
        onDone={() => load("questions")}
      />

      <RegenerateAllModal
        open={regenAllOpen}
        target={{ quiz: quiz?._id }}
        title={`Regenerate all${quiz ? ` — ${quiz.title}` : ""}`}
        onClose={() => setRegenAllOpen(false)}
        onDone={() => load("questions")}
      />

      <ScheduleQuestionModal open={!!scheduleQ} question={scheduleQ} onClose={() => setScheduleQ(null)} />

      <ExtendOneQuestionModal
        open={!!extendOneItem}
        busy={!!extendingQId}
        onCancel={() => setExtendOneItem(null)}
        onConfirm={runExtendOne}
      />

      <RegenerateOneModal
        open={!!regenOneItem}
        question={regenOneItem}
        onClose={() => setRegenOneItem(null)}
        onDone={applyRegenerated}
      />

      {/* View single question */}
      {viewQ && (
        <div className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 ${viewFull ? "items-stretch p-0 sm:p-4" : "items-start p-4"}`} onClick={() => setViewQ(null)}>
          <div onClick={(e) => e.stopPropagation()} className={`card flex flex-col animate-scale-in ${viewFull ? "m-0 min-h-full w-full max-w-none rounded-none p-4 sm:min-h-0 sm:h-full sm:rounded-2xl sm:p-6" : "my-8 w-full max-w-2xl p-6"}`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Question</h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setViewFull((v) => !v)} title={viewFull ? "Exit full screen" : "Full screen"} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  {viewFull ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </button>
                <button onClick={() => setViewQ(null)}><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className={viewFull ? "min-h-0 flex-1 overflow-y-auto" : ""}>
            <QuestionView q={viewQ} {...(() => { const L = shown; const i = L.findIndex((x) => x._id === viewQ._id); return { position: i >= 0 ? `${i + 1} / ${L.length}` : undefined, onPrev: i > 0 ? () => setViewQ(L[i - 1]) : undefined, onNext: i >= 0 && i < L.length - 1 ? () => setViewQ(L[i + 1]) : undefined }; })()} onRegenerate={() => regenerateQ(viewQ)} regenerating={regenId === viewQ._id} onExtend={() => setExtendOneItem(viewQ)} extending={extendingQId === viewQ._id} onSchedule={() => setScheduleQ(viewQ)} onEdit={() => { const q = viewQ; setReopenAfterEdit(q._id); setViewQ(null); openEdit(q); }} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={async () => { if (!window.confirm("Delete this question? This cannot be undone.")) return; await contentService.deleteQuestion(viewQ._id); setViewQ(null); load("questions"); }} className="btn-outline mr-auto text-rose-600">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
              <button onClick={() => setAddToTestQ(viewQ)} className="btn-outline">
                <ClipboardList className="h-4 w-4" /> Add to test
              </button>
              <button onClick={() => setViewQ(null)} className="btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Copy the viewed question into a chosen test series */}
      {addToTestQ && (
        <AddToTestModal question={addToTestQ} onClose={() => setAddToTestQ(null)} />
      )}

      {/* View all questions */}
      {viewAll && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-0 sm:p-4" onClick={() => setViewAll(false)}>
          <div onClick={(e) => e.stopPropagation()} className="min-h-full w-full max-w-none animate-scale-in card m-0 rounded-none p-4 sm:rounded-2xl sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold">All questions {quiz ? `in ${quiz.title}` : ""} ({items.length})</h3>
              <div className="flex items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold dark:border-slate-700">
                  <button onClick={() => setStudentView(false)} className={`px-3 py-1.5 ${!studentView ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Admin view</button>
                  <button onClick={() => setStudentView(true)} className={`px-3 py-1.5 ${studentView ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Student view</button>
                </div>
                <button onClick={() => setViewAll(false)}><X className="h-5 w-5" /></button>
              </div>
            </div>
            {studentView && (
              <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Student view — answers &amp; explanations are hidden. Use “Reveal answer” on any question to expose it.
              </p>
            )}
            <QuestionTypeFilter questions={items} selected={typeFilter} onChange={setTypeFilter} />
            <QuestionStatusFilter questions={items} selected={statusFilter} onChange={setStatusFilter} />
            {!studentView && (() => {
              const shownCount = filterByStatus(items.filter((it) => !typeFilter.length || typeFilter.includes(questionTypeKey(it))), statusFilter).length;
              if (!shownCount) return null;
              return (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button onClick={deleteByType} disabled={!!delProgress} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20">
                    <Trash2 className="h-3.5 w-3.5" />
                    {delProgress
                      ? `Deleting ${delProgress.done}/${delProgress.total}…`
                      : typeFilter.length
                      ? `Delete these ${shownCount} (${typeFilter.map((t) => QUESTION_TYPE_LABELS[t] || t).join(", ")})`
                      : `Delete all ${shownCount}`}
                  </button>
                  {!typeFilter.length && <span className="text-xs text-slate-400">Tip: pick a Type above to delete only that type.</span>}
                </div>
              );
            })()}
            {!studentView && delProgress && (
              <p className={`mb-3 flex items-center gap-1.5 text-xs font-medium ${delProgress.finished ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                {delProgress.finished
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Deleted {delProgress.done}{delProgress.remaining != null ? ` • ${delProgress.remaining} remaining` : ""}</>
                  : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting {delProgress.done} of {delProgress.total}…</>}
              </p>
            )}
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {filterByStatus(items, statusFilter)
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => !typeFilter.length || typeFilter.includes(questionTypeKey(it)))
                .map(({ it, i }) => (
                <div key={(studentView ? "s" : "a") + it._id} className="relative rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    <button onClick={() => setAddToTestQ(it)} title="Add to test" className="rounded-lg bg-white p-1.5 text-emerald-600 shadow hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-900/30">
                      <ClipboardList className="h-4 w-4" />
                    </button>
                    {!studentView && (
                      <>
                        <button onClick={() => { setViewAll(false); openEdit(it); }} title="Edit" className="rounded-lg bg-white p-1.5 text-brand-600 shadow hover:bg-brand-50 dark:bg-slate-800 dark:hover:bg-brand-900/30">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove("question", it._id, "this question")} title="Delete" className="rounded-lg bg-white p-1.5 text-rose-600 shadow hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-900/30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                  <QuestionView q={it} index={i + 1} studentView={studentView} onRegenerate={() => regenerateQ(it)} regenerating={regenId === it._id} onExtend={() => setExtendOneItem(it)} extending={extendingQId === it._id} onSchedule={() => setScheduleQ(it)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Render a single emoji into a 128×128 PNG data URI on a soft gradient, so an
// AI-picked emoji can be stored on the entity's `image` field (reused by every
// card/logo renderer) exactly like an uploaded/generated logo. No server or
// Cloudinary needed — this is a pure client-side draw.
function emojiToImage(emoji) {
  // 16:9 to match the stream banner exactly, so the result fills the banner
  // edge-to-edge (no shrinking, no cropping) instead of sitting as a small
  // square in the middle. The emoji is drawn large and centered on the gradient.
  const w = 1280;
  const h = 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#eef2ff"); // indigo-50
  g.addColorStop(1, "#e0e7ff"); // indigo-100
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // ~66% of the banner height — big and prominent, with margin so tall glyphs
  // aren't clipped at the top/bottom.
  ctx.font = "480px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, w / 2, h / 2 + 10);
  return canvas.toDataURL("image/png");
}

/* ---------------- Form modal (adapts to subject/topic/session/question) ---------------- */
function FormModal({ modal, streamName, subjectName, saving, bulkProgress, onClose, onSave, onBulkSave, onBulkSaveTopics, onAiSuggest, onAiSuggestTopics }) {
  const { type, mode, data } = modal;
  // Bulk-add picker: search suggested subjects (under a stream) or topics (under
  // a subject), tick several to add them all at once, or type a single custom
  // one. The same UI serves both levels — only the wording and data source differ.
  const [subjQuery, setSubjQuery] = useState("");
  const [picked, setPicked] = useState([]); // selected suggestions (bulk add)
  const [aiSubjects, setAiSubjects] = useState(null); // AI-fetched list (null = not run yet) — overrides the static catalog
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");

  const isSubjectAdd = type === "subject" && mode === "add";
  const isTopicAdd = type === "topic" && mode === "add";
  const isPickerAdd = isSubjectAdd || isTopicAdd;
  // Entity-aware labels + data source so one picker can serve both levels.
  const noun = isTopicAdd ? "topic" : "subject"; // singular
  const nounPlural = isTopicAdd ? "topics" : "subjects";
  const parentName = isTopicAdd ? subjectName : streamName; // stream for subjects, subject for topics
  const parentKind = isTopicAdd ? "subject" : "stream";
  const aiSuggestFn = isTopicAdd ? onAiSuggestTopics : onAiSuggest;
  const bulkSaveFn = isTopicAdd ? onBulkSaveTopics : onBulkSave;
  // Subjects have a static catalog (streamSubjects.js); topics do not, so the
  // topic picker starts empty and relies on Auto-search.
  const staticSuggest = isSubjectAdd
    ? suggestSubjects(streamName, subjQuery)
    : { matched: false, streamLabel: null, subjects: [] };

  const bulkMode = isPickerAdd && picked.length > 0;
  const pickedHas = (name) => picked.some((p) => p.name === name);
  const togglePick = (s) =>
    setPicked((prev) => (prev.some((p) => p.name === s.name) ? prev.filter((p) => p.name !== s.name) : [...prev, s]));

  // The list shown in the picker: the AI results (once fetched) take over from
  // the built-in catalog. Filtered by the search box either way.
  const q = subjQuery.trim().toLowerCase();
  const shownList = aiSubjects
    ? aiSubjects.filter((s) => !q || s.name.toLowerCase().includes(q))
    : staticSuggest.subjects;

  const shownAllPicked = shownList.length > 0 && shownList.every((s) => pickedHas(s.name));
  const toggleAllShown = () => {
    const names = new Set(shownList.map((s) => s.name));
    if (shownAllPicked) setPicked((prev) => prev.filter((p) => !names.has(p.name)));
    else setPicked((prev) => { const have = new Set(prev.map((p) => p.name)); return [...prev, ...shownList.filter((s) => !have.has(s.name))]; });
  };

  // "Auto-search": ask the AI for the subjects that belong to THIS stream, or
  // the topics that make up THIS subject (works for anything, e.g. Electrical
  // Engineering → subjects, or Physics → topics). Results replace the static
  // suggestions and get their own colours. The AI returns {name} for subjects
  // and {title} for topics — we normalise to `name` for the picker here.
  const runAiSearch = () => {
    if (!aiSuggestFn || aiBusy) return;
    setAiBusy(true); setAiErr("");
    Promise.resolve(aiSuggestFn(parentName))
      .then((list) => {
        const mapped = (list || []).map((s, i) => ({ name: s.name || s.title, description: s.description || "", icon: isTopicAdd ? "ListChecks" : "BookOpen", color: COLORS[i % COLORS.length] }));
        if (!mapped.length) setAiErr(`The AI didn't return any ${nounPlural}. Try again.`);
        setAiSubjects(mapped);
      })
      .catch((e) => setAiErr(e?.message || `Couldn't auto-search ${nounPlural}.`))
      .finally(() => setAiBusy(false));
  };
  const [form, setForm] = useState(() => {
    if (type === "stream") return { name: data.name || "", description: data.description || "", icon: data.icon || "GraduationCap", color: data.color || COLORS[0], image: data.image || "" };
    if (type === "subject") return { name: data.name || "", description: data.description || "", icon: data.icon || "BookOpen", color: data.color || COLORS[0], image: data.image || "" };
    if (type === "topic") return { title: data.title || "", description: data.description || "", index: data.index || 1 };
    if (type === "session") return { title: data.title || "", difficulty: data.difficulty || "Medium", index: data.index || 1 };
    if (type === "quiz") return { title: data.title || "", difficulty: data.difficulty || "Medium", index: data.index || 1 };
    return {};
  });

  const titleMap = { stream: "Stream", subject: "Subject", topic: "Topic", session: "Session", quiz: "Quiz" };
  const submit = (e) => { e.preventDefault(); if (bulkMode) { bulkSaveFn(picked); return; } onSave(form); };

  // Generate a logo image with AI (Gemini) from the name + description (+ the
  // stream's subjects). Returns a stored URL we drop straight into `form.image`.
  const [logoBusy, setLogoBusy] = useState(""); // "" | "icon" | "text" — which AI logo is generating
  const [logoErr, setLogoErr] = useState("");
  const genLogo = (style = "icon") => {
    if (!form.name?.trim()) { setLogoErr("Enter a name first, then generate a logo."); return; }
    setLogoBusy(style); setLogoErr("");
    aiService.logo({ kind: type, name: form.name, description: form.description, id: data?._id, style })
      .then((r) => { if (r?.image) setForm((f) => ({ ...f, image: r.image })); else setLogoErr("No image was returned — try again."); })
      .catch((e) => setLogoErr(e?.message || "Could not generate the logo."))
      .finally(() => setLogoBusy(""));
  };

  // "Emoji" logo: ask the TEXT model for the single best emoji (considering the
  // name, description and the stream's subjects), then render it to an image
  // client-side and store it on `form.image` — no image model / Cloudinary.
  const genEmojiLogo = () => {
    if (!form.name?.trim()) { setLogoErr("Enter a name first, then pick an emoji."); return; }
    setLogoBusy("emoji"); setLogoErr("");
    aiService.logoEmoji({ kind: type, name: form.name, description: form.description, id: data?._id })
      .then((r) => {
        if (r?.emoji) setForm((f) => ({ ...f, image: emojiToImage(r.emoji) }));
        else setLogoErr("No emoji was returned — try again.");
      })
      .catch((e) => setLogoErr(e?.message || "Could not pick an emoji."))
      .finally(() => setLogoBusy(""));
  };

  // "Auto" description: AI-write a short description from the name (+ subjects).
  const [descBusy, setDescBusy] = useState(false);
  const [descErr, setDescErr] = useState("");
  const genDescription = () => {
    if (!form.name?.trim()) { setDescErr("Enter a name first, then auto-write a description."); return; }
    setDescBusy(true); setDescErr("");
    aiService.describe({ kind: type, name: form.name, id: data?._id })
      .then((r) => { if (r?.description) setForm((f) => ({ ...f, description: r.description })); else setDescErr("No description was returned — try again."); })
      .catch((e) => setDescErr(e?.message || "Could not write a description."))
      .finally(() => setDescBusy(false));
  };

  // Upload a custom subject logo, downscaled to a 128×128 PNG data URI.
  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = 128;
        const canvas = document.createElement("canvas");
        canvas.width = s;
        canvas.height = s;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(s / img.width, s / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
        setForm((f) => ({ ...f, image: canvas.toDataURL("image/png") }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{mode === "add" ? "Add" : "Edit"} {titleMap[type]}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          {isPickerAdd && (
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Add {nounPlural} for {staticSuggest.streamLabel || parentName || `this ${parentKind}`}</span>
                {bulkProgress ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <Loader2 className="h-3 w-3 animate-spin" /> Added {bulkProgress.added} of {bulkProgress.total}
                  </span>
                ) : picked.length > 0 ? (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{picked.length} selected</span>
                ) : null}
              </div>
              <div className="mb-2 flex gap-2">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Search className="h-4 w-4" /></div>
                  <input className="input pl-9" value={subjQuery} onChange={(e) => setSubjQuery(e.target.value)} placeholder={`Search ${nounPlural}…`} />
                </div>
                <button type="button" onClick={runAiSearch} disabled={aiBusy} className="btn-outline flex-shrink-0 whitespace-nowrap" title={`Ask AI to find the ${nounPlural} for this ${parentKind}`}>
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiBusy ? "Searching…" : "Auto-search"}
                </button>
              </div>
              {aiErr && <p className="mb-2 text-xs font-medium text-rose-600">{aiErr}</p>}
              {shownList.length > 0 ? (
                <>
                  <label className="mb-1 flex cursor-pointer items-center gap-2 border-b border-slate-100 pb-2 text-sm font-medium dark:border-slate-700">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={shownAllPicked} onChange={toggleAllShown} />
                    Select all{subjQuery ? " matching" : ""} ({shownList.length})
                  </label>
                  <div className="max-h-64 space-y-0.5 overflow-y-auto py-1">
                    {shownList.map((s) => (
                      <label key={s.name} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-700">
                        <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300" checked={pickedHas(s.name)} onChange={() => togglePick(s)} />
                        <span className={`mt-0.5 h-5 w-5 flex-shrink-0 rounded-md bg-gradient-to-br ${s.color}`} />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{s.name}</span>
                          {s.description && <span className="block text-xs text-slate-400">{s.description}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-2 text-sm text-slate-400">{aiBusy ? "Searching…" : `No matching ${nounPlural}. Use Auto-search, or add a custom one below.`}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                {aiSubjects
                  ? `AI-found ${nounPlural} for “${parentName || `this ${parentKind}`}”. Tick the ones you want and add them all at once.`
                  : staticSuggest.matched
                    ? `Suggested ${nounPlural} for the “${staticSuggest.streamLabel}” ${parentKind}. Tick the ones you want, or use Auto-search for a full AI list.`
                    : `No preset list${isTopicAdd ? "" : " for this stream"} — tap Auto-search to let AI find the ${nounPlural}, or ${isTopicAdd ? "add a custom topic below" : "tick a common one / type a custom subject below"}.`}
              </p>
            </div>
          )}
          {(type === "stream" || type === "subject") && (
            <>
              {!bulkMode && (
                <>
                  {isSubjectAdd && <p className="-mb-1 text-xs font-medium text-slate-500">Or add a single custom subject:</p>}
                  <Field label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={type === "stream" ? "e.g. JKSSB" : "e.g. Physics"} /></Field>
                  <Field label="Description">
                    <textarea rows={2} className="input resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    <div className="mt-1.5 flex items-center gap-2">
                      <button type="button" onClick={genDescription} disabled={descBusy} className="btn-outline" title={`Let AI write a short description from the name${type === "stream" ? " and this stream's subjects" : ""}`}>
                        {descBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {descBusy ? "Writing…" : "Auto (AI)"}
                      </button>
                      {descErr && <span className="text-xs font-medium text-rose-600">{descErr}</span>}
                    </div>
                  </Field>
                  <Field label="Icon name (lucide)"><input className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="e.g. Atom, FlaskConical, BookOpen" /></Field>
                  <Field label="Colour">
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((c) => (
                        <button type="button" key={c} onClick={() => setForm({ ...form, color: c })} className={`h-9 w-14 rounded-lg bg-gradient-to-br ${c} ${form.color === c ? "ring-2 ring-offset-2 ring-slate-800 dark:ring-white dark:ring-offset-slate-900" : ""}`} />
                      ))}
                    </div>
                  </Field>
                  {(type === "subject" || type === "stream") && (
                    <Field label="Logo (optional)">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                          {form.image ? <img src={form.image} alt="" className="h-full w-full object-cover" /> : <BookOpen className="h-6 w-6 text-slate-400" />}
                        </div>
                        <label className="btn-outline cursor-pointer"><Upload className="h-4 w-4" /> Upload<input type="file" accept="image/*" className="hidden" onChange={onPickImage} /></label>
                        <button type="button" onClick={() => genLogo("icon")} disabled={!!logoBusy} className="btn-outline" title="Generate a symbol/icon logo with AI (no text)">
                          {logoBusy === "icon" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {logoBusy === "icon" ? "Generating…" : "Generate with AI"}
                        </button>
                        <button type="button" onClick={() => genLogo("text")} disabled={!!logoBusy} className="btn-outline" title="Generate a text / wordmark logo with AI (shows the name)">
                          {logoBusy === "text" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {logoBusy === "text" ? "Generating…" : "Text logo"}
                        </button>
                        <button type="button" onClick={genEmojiLogo} disabled={!!logoBusy} className="btn-outline" title="Pick a fitting emoji with AI (text only — no image model needed)">
                          {logoBusy === "emoji" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {logoBusy === "emoji" ? "Picking…" : "Emoji"}
                        </button>
                        {form.image && <button type="button" onClick={() => setForm({ ...form, image: "" })} className="text-sm font-medium text-rose-600 hover:underline">Remove</button>}
                      </div>
                      {logoErr && <p className="mt-1 text-xs font-medium text-rose-600">{logoErr}</p>}
                      <p className="mt-1 text-xs text-slate-400">
                        Overrides the icon. Leave empty to auto-pick {type === "stream" ? "an icon" : "an emoji"} from the name.
                        {type === "stream" ? " AI uses the name, description and this stream's subjects." : ""} “Emoji” needs no image model — it picks a fitting emoji using text only.
                      </p>
                    </Field>
                  )}
                </>
              )}
            </>
          )}

          {type === "topic" && !bulkMode && (
            <>
              {isTopicAdd && <p className="-mb-1 text-xs font-medium text-slate-500">Or add a single custom topic:</p>}
              <Field label="Topic Title"><input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mechanics" /></Field>
              <Field label="Description"><textarea rows={2} className="input resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Order (index)"><input type="number" className="input" value={form.index} onChange={(e) => setForm({ ...form, index: +e.target.value })} /></Field>
            </>
          )}

          {type === "session" && (
            <>
              <Field label="Session Title"><input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Laws of Motion" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Difficulty">
                  <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </Field>
                <Field label="Order (index)"><input type="number" className="input" value={form.index} onChange={(e) => setForm({ ...form, index: +e.target.value })} /></Field>
              </div>
            </>
          )}

          {type === "quiz" && (
            <>
              <Field label="Quiz Title"><input required className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Practice Set 1" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Difficulty">
                  <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                </Field>
                <Field label="Order (index)"><input type="number" className="input" value={form.index} onChange={(e) => setForm({ ...form, index: +e.target.value })} /></Field>
              </div>
            </>
          )}

        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          {bulkMode ? (
            <button type="button" disabled={saving} className="btn-primary" onClick={() => bulkSaveFn(picked)}>
              {bulkProgress ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Added {bulkProgress.added} of {bulkProgress.total} {noun}{bulkProgress.total === 1 ? "" : "s"}…</>
              ) : (
                `Add ${picked.length} ${noun}${picked.length === 1 ? "" : "s"}`
              )}
            </button>
          ) : (
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save"}</button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
