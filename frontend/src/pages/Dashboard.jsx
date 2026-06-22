import { Link } from "react-router-dom";
import { Line, Radar } from "react-chartjs-2";
import "../lib/chartSetup";
import {
  Flame,
  Trophy,
  CalendarClock,
  CheckCircle2,
  BookOpen,
  Bell,
  TrendingUp,
  ArrowRight,
  Crown,
  ChevronUp,
  ChevronDown,
  Minus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import StatCard from "../components/ui/StatCard";
import Badge from "../components/ui/Badge";
import ProgressBar from "../components/ui/ProgressBar";
import {
  testSeries,
  upcomingTests,
  recentScores,
  leaderboard,
  notifications,
} from "../data/tests";

export default function Dashboard() {
  const { user } = useAuth();
  const enrolled = testSeries.filter((t) => t.enrolled);

  const trendData = {
    labels: ["Feb", "Mar", "Apr", "May", "Jun"],
    datasets: [
      {
        label: "Avg. Percentile",
        data: [62, 70, 74, 83, 91],
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.12)",
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#2563eb",
      },
    ],
  };

  const radarData = {
    labels: ["Physics", "Chemistry", "Maths", "Biology", "English"],
    datasets: [
      {
        label: "Subject Strength",
        data: [85, 72, 90, 68, 80],
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.2)",
        pointBackgroundColor: "#f97316",
      },
    ],
  };

  const changeIcon = (c) =>
    c === "up" ? (
      <ChevronUp className="h-4 w-4 text-emerald-500" />
    ) : c === "down" ? (
      <ChevronDown className="h-4 w-4 text-rose-500" />
    ) : (
      <Minus className="h-4 w-4 text-slate-400" />
    );

  return (
    <div className="container-page py-10">
      {/* Welcome + profile */}
      <div className="flex flex-col gap-5 rounded-3xl bg-gradient-to-r from-brand-600 to-accent-500 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold backdrop-blur">
            {user?.avatar}
          </span>
          <div>
            <p className="text-sm text-white/80">Welcome back,</p>
            <h1 className="text-2xl font-extrabold">{user?.name}</h1>
            <p className="text-sm text-white/80">{user?.email}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl bg-white/15 px-5 py-3 text-center backdrop-blur">
            <Flame className="mx-auto h-5 w-5" />
            <p className="mt-1 text-xl font-bold">{user?.streak ?? 7}</p>
            <p className="text-xs text-white/80">Day streak</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-5 py-3 text-center backdrop-blur">
            <Trophy className="mx-auto h-5 w-5" />
            <p className="mt-1 text-xl font-bold">#5</p>
            <p className="text-xs text-white/80">Rank</p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="BookOpen" label="Enrolled Series" value={enrolled.length} accent="brand" />
        <StatCard icon="CalendarClock" label="Upcoming Tests" value={upcomingTests.length} accent="accent" />
        <StatCard icon="CheckCircle2" label="Completed Tests" value={recentScores.length} accent="green" />
        <StatCard icon="TrendingUp" label="Avg. Percentile" value="91.0" sub="+8 this month" accent="violet" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Performance trend */}
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold">
              <TrendingUp className="h-5 w-5 text-brand-600" /> Performance Analytics
            </h3>
            <div className="h-64">
              <Line data={trendData} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }} />
            </div>
          </div>

          {/* Enrolled series */}
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold">
                <BookOpen className="h-5 w-5 text-accent-500" /> Enrolled Test Series
              </h3>
              <Link to="/test-series" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
                Browse all
              </Link>
            </div>
            <div className="space-y-3">
              {enrolled.map((t) => (
                <div key={t.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t.questions} Q · {t.marks} marks · {t.duration} min
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={t.difficulty}>{t.difficulty}</Badge>
                    <Link to="/test-series" className="btn-primary py-2">
                      Resume <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent scores */}
          <div className="card p-6">
            <h3 className="mb-4 font-bold">Recent Scores</h3>
            <div className="space-y-3">
              {recentScores.map((r) => {
                const pct = Math.round((r.score / r.total) * 100);
                return (
                  <div key={r.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-slate-500">
                        {r.score}/{r.total} · {r.date}
                      </span>
                    </div>
                    <ProgressBar value={pct} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Subject strength radar */}
          <div className="card p-6">
            <h3 className="mb-4 font-bold">Subject Strength</h3>
            <div className="h-56">
              <Radar data={radarData} options={{ plugins: { legend: { display: false } }, scales: { r: { suggestedMin: 0, suggestedMax: 100 } } }} />
            </div>
          </div>

          {/* Leaderboard */}
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold">
              <Crown className="h-5 w-5 text-amber-500" /> Leaderboard
            </h3>
            <div className="space-y-2">
              {leaderboard.map((p) => (
                <div
                  key={p.rank}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                    p.isCurrentUser
                      ? "bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-800"
                      : ""
                  }`}
                >
                  <span className={`w-5 text-center text-sm font-bold ${p.rank <= 3 ? "text-amber-500" : "text-slate-400"}`}>
                    {p.rank}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold dark:bg-slate-700">
                    {p.avatar}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                  {changeIcon(p.change)}
                  <span className="text-sm font-semibold text-slate-500">{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold">
              <CalendarClock className="h-5 w-5 text-brand-600" /> Upcoming Tests
            </h3>
            <div className="space-y-3">
              {upcomingTests.map((u) => (
                <div key={u.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {u.date} · {u.time}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="card p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold">
              <Bell className="h-5 w-5 text-accent-500" /> Notifications
            </h3>
            <div className="space-y-3">
              {notifications.map((n) => (
                <div key={n.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.unread ? "bg-accent-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                  <div>
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{n.body}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
