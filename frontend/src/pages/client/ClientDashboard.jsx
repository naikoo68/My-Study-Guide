import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListChecks, FileStack, Play, Clock, ShieldCheck, AlarmClock, Sparkles, HelpCircle } from "lucide-react";
import { practiceService } from "../../services";
import { useAuth } from "../../context/AuthContext";
import Badge from "../../components/ui/Badge";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

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

// The client's home. Shows profile + validity and lets them PRACTICE the
// quizzes and tests they built (this is where practicing happens, not the
// builder). `onBuild` switches to the builder tab to add/edit content.
export default function ClientDashboard({ onBuild }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const quizzes = items.filter((i) => i.kind === "quiz");
  const tests = items.filter((i) => i.kind === "test");

  const play = (item) => {
    if (item.kind === "quiz") navigate(`/practice/quiz/play/${item._id}`);
    else navigate(`/test-series/attempt/${item._id}`);
  };

  const expired = isExpired(user?.expiresAt);

  const Section = ({ title, Icon, list, cta, tone }) => (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="ml-auto text-sm text-slate-400">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing here yet.</p>
          <button onClick={onBuild} className="btn-outline mt-3">
            <Sparkles className="h-4 w-4" /> Build one
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((item) => {
            const empty = (item.questionCount ?? 0) === 0;
            return (
              <div key={item._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1"><HelpCircle className="h-3 w-3" /> {item.questionCount} Qs</span>
                    {item.kind === "test" && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {item.duration} min</span>}
                    {item.difficulty && <Badge variant={item.difficulty}>{item.difficulty}</Badge>}
                  </div>
                </div>
                <button
                  onClick={() => play(item)}
                  disabled={empty}
                  title={empty ? "Add questions to this first" : cta}
                  className="btn-primary flex-shrink-0 py-1.5 text-xs disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" /> {empty ? "No questions" : cta}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

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

      {loading ? (
        <Loading label="Loading your content..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Practice Quiz" Icon={ListChecks} list={quizzes} cta="Practice" tone="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300" />
          <Section title="Practice Test" Icon={FileStack} list={tests} cta="Take Test" tone="bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300" />
        </div>
      )}
    </div>
  );
}
