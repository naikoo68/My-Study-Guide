import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import {
  ListChecks,
  FileStack,
  Play,
  Clock,
  ShieldCheck,
  AlarmClock,
  Sparkles,
  HelpCircle,
  ChevronRight,
  ArrowRight,
  GraduationCap,
  FolderOpen,
  Layers,
} from "lucide-react";
import { practiceService } from "../../services";
import { useAuth } from "../../context/AuthContext";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

const fmtDate = (d) =>
  new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function relativeTo(d) {
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `in ${hrs} hr${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
const isExpired = (d) => d && new Date(d).getTime() < Date.now();

// The two sub-modules a client practices. My Quiz drills Stream → Subject →
// Topic → Quiz; My Test drills Stream → Test.
const KINDS = [
  { key: "quiz", label: "My Quiz", Icon: ListChecks, tone: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300" },
  { key: "test", label: "My Test", Icon: FileStack, tone: "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300" },
];

const eq = (a, b) => String(a || "") === String(b || "");

// Collect the distinct nodes referenced by `list` under the given key
// (e.g. every distinct stream among a set of quizzes), preserving order.
function uniqueNodes(list, key) {
  const map = new Map();
  for (const it of list) {
    const node = it[key];
    if (node && node._id && !map.has(String(node._id))) map.set(String(node._id), node);
  }
  return [...map.values()];
}

// The client's home. Shows profile + validity, then lets them browse and
// practice the quizzes and tests they built (this is where practicing happens,
// not the builder). `onBuild` switches to the builder tab to add/edit content.
export default function ClientDashboard({ onBuild }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Drill-down state. `kind` picks the sub-module; the selected stream/subject/
  // topic define how deep we've navigated. Switching kind resets the path.
  const [kind, setKind] = useState("quiz");
  const [stream, setStream] = useState(null);
  const [subject, setSubject] = useState(null);
  const [topic, setTopic] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    practiceService
      .myItems()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const resetPath = () => { setStream(null); setSubject(null); setTopic(null); };
  const switchKind = (k) => { setKind(k); resetPath(); };

  const play = (item) => {
    if (item.kind === "quiz") navigate(`/practice/quiz/play/${item._id}`);
    else navigate(`/test-series/attempt/${item._id}`);
  };

  const expired = isExpired(user?.expiresAt);

  const quizzes = items.filter((i) => i.kind === "quiz");
  const tests = items.filter((i) => i.kind === "test");

  // Which level are we viewing for the active kind?
  //   My Quiz : streams → subjects → topics → items(quizzes)
  //   My Test : streams → items(tests)
  const level = kind === "quiz"
    ? (topic ? "items" : subject ? "topics" : stream ? "subjects" : "streams")
    : (stream ? "items" : "streams");

  // Rows for the current level, derived from the flat item list.
  let rows = [];
  if (kind === "quiz") {
    if (level === "streams") rows = uniqueNodes(quizzes, "stream");
    else if (level === "subjects") rows = uniqueNodes(quizzes.filter((q) => eq(q.stream?._id, stream._id)), "subject");
    else if (level === "topics") rows = uniqueNodes(quizzes.filter((q) => eq(q.subject?._id, subject._id)), "topic");
    else rows = quizzes.filter((q) => eq(q.topic?._id, topic._id));
  } else {
    if (level === "streams") rows = uniqueNodes(tests, "stream");
    else rows = tests.filter((t) => eq(t.stream?._id, stream._id));
  }

  const isItems = level === "items";

  // Breadcrumb trail for the active kind.
  const crumbs = [{ label: KINDS.find((k) => k.key === kind).label, onClick: resetPath }];
  if (stream) crumbs.push({ label: stream.name, onClick: () => { setSubject(null); setTopic(null); } });
  if (subject) crumbs.push({ label: subject.name, onClick: () => setTopic(null) });
  if (topic) crumbs.push({ label: topic.name, onClick: null });

  const openNode = (node) => {
    if (kind === "test") { setStream(node); return; } // stream → tests
    if (level === "streams") setStream(node);
    else if (level === "subjects") setSubject(node);
    else if (level === "topics") setTopic(node);
  };

  const levelHint =
    level === "streams" ? "Choose a stream"
    : level === "subjects" ? "Choose a subject"
    : level === "topics" ? "Choose a topic"
    : kind === "quiz" ? "Select a quiz to start" : "Select a test to start";

  const fallbackIcon = level === "streams" ? GraduationCap : level === "topics" ? Layers : FolderOpen;

  return (
    <div className="space-y-6">
      {/* Profile + validity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">Welcome back,</p>
          <h1 className="text-2xl font-extrabold">{user?.name || "there"}</h1>
          <p className="mt-0.5 text-sm text-slate-400">{user?.email}</p>
          <button onClick={onBuild} className="btn-outline mt-4">
            <Sparkles className="h-4 w-4" /> Build quizzes & tests
          </button>
        </div>

        {/* Validity */}
        <div className={`card p-5 ${expired ? "border-rose-300 dark:border-rose-900/60" : ""}`}>
          <div className="flex items-center gap-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${expired ? "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>
              {user?.expiresAt ? <AlarmClock className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </span>
            <h2 className="font-bold">Account validity</h2>
          </div>
          {user?.expiresAt ? (
            expired ? (
              <div className="mt-3">
                <Badge variant="Hard">Expired</Badge>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Your access ended on {fmtDate(user.expiresAt)}. Contact the administrator to renew.</p>
              </div>
            ) : (
              <div className="mt-3">
                <Badge variant="accent"><Clock className="h-3 w-3" /> Active · expires {relativeTo(user.expiresAt)}</Badge>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Valid until {fmtDate(user.expiresAt)}.</p>
              </div>
            )
          ) : (
            <div className="mt-3">
              <Badge variant="Easy">Active · never expires</Badge>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Your account has no expiry date.</p>
            </div>
          )}
        </div>
      </div>

      {/* Practice browser */}
      <div className="card p-5">
        {/* Kind tabs: My Quiz vs My Test */}
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => switchKind(k.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                kind === k.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <k.Icon className="h-4 w-4" /> {k.label}
            </button>
          ))}
        </div>

        {/* Breadcrumb */}
        <nav className="mt-4 flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 text-slate-400" />}
              {c.onClick ? (
                <button onClick={c.onClick} className="rounded px-2 py-1 font-medium text-slate-500 hover:text-brand-600">{c.label}</button>
              ) : (
                <span className="rounded px-2 py-1 font-medium text-brand-600">{c.label}</span>
              )}
            </span>
          ))}
        </nav>

        <h2 className="mt-2 text-lg font-bold">{levelHint}</h2>

        {loading ? (
          <div className="mt-6"><Loading label="Loading your content..." /></div>
        ) : error ? (
          <div className="mt-6"><ErrorState message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {level === "streams" ? `No ${kind === "quiz" ? "quizzes" : "tests"} yet.` : "Nothing here yet."}
            </p>
            <button onClick={onBuild} className="btn-outline mt-3">
              <Sparkles className="h-4 w-4" /> Build one
            </button>
          </div>
        ) : isItems ? (
          // Leaf level — playable quizzes / tests
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((item) => {
              const empty = (item.questionCount ?? 0) === 0;
              const cta = kind === "quiz" ? "Practice" : "Take Test";
              return (
                <div key={item._id} className="card p-4">
                  <p className="truncate font-semibold">{item.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1"><HelpCircle className="h-3 w-3" /> {item.questionCount} Qs</span>
                    {item.kind === "test" && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {item.duration} min</span>}
                    {item.difficulty && <Badge variant={item.difficulty}>{item.difficulty}</Badge>}
                  </div>
                  <button
                    onClick={() => play(item)}
                    disabled={empty}
                    title={empty ? "Add questions to this first" : cta}
                    className="btn-primary mt-3 w-full py-1.5 text-xs disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" /> {empty ? "No questions" : cta}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          // Grouping level — streams / subjects / topics
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((node) => {
              const Icon = Icons[node.icon] || fallbackIcon;
              return (
                <button
                  key={node._id}
                  onClick={() => openNode(node)}
                  className="card-hover group p-5 text-left"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${node.color || "from-violet-500 to-fuchsia-600"} text-white shadow-soft`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 font-bold">{node.name}</h3>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
                    Open <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
