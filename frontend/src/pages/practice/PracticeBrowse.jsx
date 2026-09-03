import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight, ChevronLeft, Clock, HelpCircle, Play, Lock, Unlock, Eye, Film } from "lucide-react";
import { practiceService } from "../../services";
import { useAuth } from "../../context/AuthContext";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import SubjectLogo from "../../components/ui/SubjectLogo";

const KIND_LABEL = { quiz: "My Quiz", test: "My Test", paper: "Previous Papers" };

// Singularise a plural label when the count is 1 ("1 Quiz", "1 Topic").
const singularLabel = (label, n) => (n === 1 ? (label === "Quizzes" ? "Quiz" : label.replace(/s$/, "")) : label);

// One compact "N Exams / Subjects / …" chip on a browse node card — shows the
// NAME next to the number (not just an icon) so it's clear what each count is.
function CountChip({ icon: Ic, n, label }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${n} ${label}`}>
      <Ic className="h-3.5 w-3.5" /> {n} {singularLabel(label, n)}
    </span>
  );
}

// Handles the practice browse levels from the URL. Path segments are positional
// and mean different things per kind (a single set of routes serves all kinds):
//   My Quiz : /practice/quiz/:stream/:exam/:subject/:topic
//             streams → exams → subjects → topics → items
//   My Test : /practice/test/:stream/:subject
//             streams → subjects → items
//   Papers  : /practice/paper/:stream
//             streams → items (papers directly under the stream)
export default function PracticeBrowse() {
  const { kind, streamId, seg2, seg3, seg4 } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Slideshow (recording) is a platform-admin-only tool — hidden from institute
  // admins, clients and students.
  const canRecord = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Map the positional segments to named ids per kind. Only My Quiz uses the
  // exam level, so its subject/topic sit one segment deeper.
  const hasExams = kind === "quiz";
  const examId = hasExams ? seg2 : null;
  const subjectId = hasExams ? seg3 : seg2;
  const topicId = hasExams ? seg4 : seg3;

  const level = topicId ? "items"
    : subjectId ? (kind === "quiz" ? "topics" : "items")
    : examId ? "subjects"
    : streamId ? (kind === "paper" ? "items" : hasExams ? "exams" : "subjects")
    : "streams";

  const load = () => {
    setLoading(true);
    setError("");
    const p =
      level === "items" ? (kind === "paper" ? practiceService.streamItems(kind, streamId) : kind === "quiz" ? practiceService.topicItems(kind, topicId) : practiceService.items(kind, subjectId))
      : level === "topics" ? practiceService.topics(kind, subjectId)
      : level === "subjects" ? (hasExams ? practiceService.examSubjects(kind, examId) : practiceService.subjects(kind, streamId))
      : level === "exams" ? practiceService.exams(kind, streamId)
      : practiceService.streams(kind);
    p.then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [kind, streamId, seg2, seg3, seg4]);

  const back =
    level === "items" ? (kind === "paper" ? `/practice/${kind}` : kind === "quiz" ? `/practice/${kind}/${streamId}/${examId}/${subjectId}` : `/practice/${kind}/${streamId}`)
    : level === "topics" ? `/practice/${kind}/${streamId}/${examId}`
    : level === "subjects" ? (hasExams ? `/practice/${kind}/${streamId}` : `/practice/${kind}`)
    : level === "exams" ? `/practice/${kind}`
    : "/practice";

  const title = level === "items" ? "Select one to start" : level === "topics" ? "Choose a topic" : level === "subjects" ? "Choose a subject" : level === "exams" ? "Choose an exam" : KIND_LABEL[kind] || "Practice";

  const openItem = (item) => {
    // Previous Papers: LOGIN required, but no subscription.
    if (kind === "paper") {
      if (!user) return navigate("/login");
      return navigate(`/practice/quiz/play/${item._id}`);
    }
    // My Quiz: the FIRST quiz in each topic is FREE for everyone.
    if (kind === "quiz") {
      if (item.freePreview) {
        // Logged-in users play the normal (progress-saving) route; guests use
        // the public free-preview route (no login needed).
        return navigate(user ? `/practice/quiz/play/${item._id}` : `/practice/quiz/free/${item._id}`);
      }
      if (!user) return navigate("/login");
      if (item.locked) return navigate("/pricing"); // needs a subscription
      return navigate(`/practice/quiz/play/${item._id}`);
    }
    // My Test Series → full test interface (timed, submit at end). The FIRST
    // test in each subject is FREE for everyone; the rest need login+subscription.
    if (item.freePreview) {
      return navigate(user ? `/public-test-series/attempt/${item._id}` : `/practice/test/free/${item._id}`);
    }
    if (!user) return navigate("/login");
    if (item.locked) return navigate("/pricing");
    navigate(`/public-test-series/attempt/${item._id}`);
  };

  return (
    <div className="container-page py-12">
      <Link to={back} className="btn-ghost mb-6 -ml-2 w-fit"><ChevronLeft className="h-4 w-4" /> Back</Link>
      <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState message={level === "items" ? "No practice content available to you here yet." : "Nothing shared with you here yet."} />
      ) : level === "items" ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((it, i) => {
            // Freemium state for My Quiz: the first quiz per topic is free; the
            // rest are locked until login + subscription. Papers need login.
            const isFreeItem = !!it.freePreview; // first quiz/test in a topic/subject
            const isLocked = !!it.locked;
            const paperNeedsLogin = kind === "paper" && it.loginOnly && !user;
            const btnLabel = isFreeItem ? "Start free" : isLocked ? (it.loginOnly ? "Log in to open" : "Subscribe to unlock") : "Start";
            return (
              <div key={it._id} style={{ animationDelay: `${i * 40}ms` }} className="card animate-fade-in-up p-6 opacity-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold">{it.name}</h3>
                  {isFreeItem && (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><Unlock className="h-3 w-3" /> Free</span>
                  )}
                  {isLocked && (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Lock className="h-3 w-3" /> {it.loginOnly ? "Login" : "Premium"}</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><HelpCircle className="h-4 w-4" /> {it.questionCount} Qs</span>
                  {it.duration ? <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {it.duration} min</span> : null}
                  {it.difficulty && <span>{it.difficulty}</span>}
                  <span className="inline-flex items-center gap-1" title="Total views"><Eye className="h-4 w-4" /> {(it.views || 0).toLocaleString()}</span>
                </div>
                <button onClick={() => openItem(it)} className={`mt-4 w-full ${isLocked && !paperNeedsLogin ? "btn-outline" : "btn-primary"}`}>
                  {isLocked ? <Lock className="h-4 w-4" /> : <Play className="h-4 w-4" />} {btnLabel}
                </button>
                {canRecord && kind === "quiz" && (it.questionCount ?? 0) > 0 && (
                  <button
                    onClick={() => navigate(`/practice/quiz/slideshow/${it._id}`)}
                    className="btn-outline mt-2 w-full"
                    title="Auto-play slideshow — for screen-recording a video tutorial"
                  >
                    <Film className="h-4 w-4" /> Slideshow
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((s, i) => {
            // Each node's banner icon (a subject with an uploaded image shows
            // that image as the banner instead — handled in the card below).
            const Icon = Icons[s.icon] || (level === "streams" ? Icons.GraduationCap : level === "exams" ? Icons.ClipboardList : level === "topics" ? Icons.Layers : Icons.BookOpen);
            const to = level === "streams" ? `/practice/${kind}/${s._id}`
              : level === "exams" ? `/practice/${kind}/${streamId}/${s._id}`
              : level === "subjects" ? (hasExams ? `/practice/${kind}/${streamId}/${examId}/${s._id}` : `/practice/${kind}/${streamId}/${s._id}`)
              : `/practice/${kind}/${streamId}/${examId}/${subjectId}/${s._id}`;
            return (
              <Link key={s._id} to={to} style={{ animationDelay: `${i * 40}ms` }} className="card-hover group flex animate-fade-in-up flex-col overflow-hidden p-0 opacity-0">
                {/* Full-width banner — the node's icon centred over its gradient (a subject's uploaded image fills the banner) */}
                <div className={`relative flex h-24 items-center justify-center overflow-hidden ${level === "subjects" ? "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900" : `bg-gradient-to-br ${s.color || "from-violet-500 to-fuchsia-600"}`}`}>
                  {level === "subjects" ? (
                    // Subjects keep their rich logo: uploaded image → auto emoji +
                    // colour picked from the name (SubjectLogo), centred on a soft banner.
                    <SubjectLogo name={s.name} icon={s.icon} color={s.color} image={s.image} size={64} className="transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <>
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.28),transparent_60%)]" />
                      <Icon className="relative h-11 w-11 text-white drop-shadow-md transition-transform duration-300 group-hover:scale-110" />
                    </>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white">{s.name}</h3>
                  {s.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>}
                {(() => {
                  // What's inside this node — counts come from the browse API.
                  const quizWord = kind === "test" ? "Tests" : "Quizzes";
                  const chips = [
                    ["exams", Icons.ClipboardList, "Exams"],
                    ["subjects", Icons.FolderOpen, "Subjects"],
                    ["topics", Icons.Layers, "Topics"],
                    ["quizzes", Icons.ListChecks, quizWord],
                    ["questions", Icons.HelpCircle, "Questions"],
                  ].filter(([k]) => typeof s[k] === "number" && s[k] > 0);
                  return chips.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {chips.map(([k, Ic, label]) => <CountChip key={k} icon={Ic} n={s[k]} label={label} />)}
                    </div>
                  ) : null;
                })()}
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-brand-600 transition group-hover:gap-2 dark:text-brand-400">
                    Open <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
