import { Link, useParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { ChevronLeft, Play, HelpCircle, FileQuestion } from "lucide-react";
import { getSessions, getSubject } from "../../data/subjects";
import Badge from "../../components/ui/Badge";
import ProgressBar from "../../components/ui/ProgressBar";

export default function SubjectSessions() {
  const { subjectId } = useParams();
  const subject = getSubject(subjectId);
  const sessions = getSessions(subjectId);

  if (!subject) {
    return (
      <div className="container-page py-20 text-center">
        <FileQuestion className="mx-auto h-12 w-12 text-slate-400" />
        <h2 className="mt-4 text-2xl font-bold">Subject not found</h2>
        <Link to="/quiz" className="btn-primary mt-6">Back to subjects</Link>
      </div>
    );
  }

  const Icon = Icons[subject.icon] || Icons.BookOpen;

  return (
    <div className="container-page py-12">
      <Link to="/quiz" className="btn-ghost mb-6 -ml-2 w-fit">
        <ChevronLeft className="h-4 w-4" /> All subjects
      </Link>

      <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${subject.color} text-white shadow-soft`}
        >
          <Icon className="h-8 w-8" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold">{subject.name}</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{subject.description}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{sessions.length}</p>
          <p className="text-xs text-slate-500">Sessions</p>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-bold">Sessions & Chapters</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s, i) => (
          <div
            key={s.id}
            style={{ animationDelay: `${i * 50}ms` }}
            className="card-hover animate-fade-in-up flex flex-col p-6 opacity-0"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-sm font-bold text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                {s.index}
              </span>
              <Badge variant={s.difficulty}>{s.difficulty}</Badge>
            </div>
            <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <HelpCircle className="h-4 w-4" /> {s.questions} questions
            </p>

            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Progress</span>
                <span className="font-semibold">{s.progress}%</span>
              </div>
              <ProgressBar value={s.progress} />
            </div>

            <Link to={`/quiz/${subjectId}/${s.id}`} className="btn-primary mt-5 w-full">
              <Play className="h-4 w-4" /> {s.progress > 0 ? "Continue" : "Start"} Quiz
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
