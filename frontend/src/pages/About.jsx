import { Target, Eye, HeartHandshake, Users, Award, BookOpen } from "lucide-react";

const values = [
  { icon: Target, title: "Our Mission", desc: "Make high-quality exam preparation accessible and affordable for every student in India." },
  { icon: Eye, title: "Our Vision", desc: "Become the most trusted self-study companion powered by data-driven learning." },
  { icon: HeartHandshake, title: "Our Promise", desc: "Honest content, transparent analytics and relentless focus on student outcomes." },
];

const stats = [
  { icon: Users, value: "1,20,000+", label: "Students" },
  { icon: BookOpen, value: "8,500+", label: "Quizzes" },
  { icon: Award, value: "640+", label: "Test Series" },
];

export default function About() {
  return (
    <div className="container-page py-14">
      <div className="mx-auto max-w-3xl text-center">
        <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">About Us</span>
        <h1 className="mt-4 text-4xl font-extrabold">Built by educators, loved by toppers</h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
          My Prep Mart started with one belief — that smart, structured practice
          beats endless cramming. We combine curated question banks with real-time
          analytics to help you study exactly what matters.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {values.map((v) => (
          <div key={v.title} className="card p-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 text-accent-600 dark:bg-accent-900/40 dark:text-accent-300">
              <v.icon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-bold">{v.title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{v.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-4 rounded-3xl bg-gradient-to-r from-brand-600 to-accent-500 p-8 text-center text-white sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center">
            <s.icon className="h-8 w-8 opacity-90" />
            <p className="mt-2 text-3xl font-extrabold">{s.value}</p>
            <p className="text-white/90">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
