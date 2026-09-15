import { useEffect, useState } from "react";
import { Target, Eye, HeartHandshake, Users, Award, BookOpen } from "lucide-react";
import { useSettings } from "../context/SettingsContext";
import { analyticsService } from "../services";
import { useSeo } from "../lib/useSeo";
import { parseRichText } from "../lib/aboutContent";

// Fixed icon sets (cycled by index) so admins only edit the text.
const VALUE_ICONS = [Target, Eye, HeartHandshake];
const STAT_ICONS = [Users, BookOpen, Award];

export default function About() {
  useSeo("About Us", "Learn about My Study Guide — our mission to make structured, data-driven exam preparation accessible and affordable for every student.");
  const { settings } = useSettings();
  const values = settings.aboutValues?.length ? settings.aboutValues : [];

  // Live platform stats (real counts).
  const [realStats, setRealStats] = useState(null);
  useEffect(() => {
    analyticsService.stats().then(setRealStats).catch(() => {});
  }, []);
  // Parse the admin-editable intro into structured blocks so long, multi-section
  // write-ups render with real (bold) section headings and a readable article
  // layout instead of one flat, centered block. Everything BEFORE the first
  // heading stays a centered "lead"; from the first heading on we render a
  // left-aligned article. Short intros (no headings) render centered as before.
  const introBlocks = parseRichText(settings.aboutIntro);
  const firstHeadingIdx = introBlocks.findIndex((b) => b.type === "heading");
  const leadBlocks = firstHeadingIdx === -1 ? introBlocks : introBlocks.slice(0, firstHeadingIdx);
  const bodyBlocks = firstHeadingIdx === -1 ? [] : introBlocks.slice(firstHeadingIdx);

  const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
  const DEFAULT_KEYS = ["students", "quizzes", "tests"];
  const DEFAULT_ROWS = [
    { label: "Total Students", metric: "students" },
    { label: "Total Quizzes", metric: "quizzes" },
    { label: "Total Public Test Series", metric: "tests" },
  ];
  const manualStats = settings.aboutStats?.length ? settings.aboutStats : [];
  let stats = [];
  if (settings.statsAuto === false) {
    stats = manualStats;
  } else if (realStats) {
    const rows = manualStats.length ? manualStats : DEFAULT_ROWS;
    stats = rows.map((s, i) => {
      const key = s.metric || DEFAULT_KEYS[i] || "students";
      return { label: s.label || DEFAULT_ROWS[i]?.label || "", value: fmt(realStats[key] ?? 0) };
    });
  }

  return (
    <div className="container-page py-14">
      <div className="mx-auto max-w-3xl text-center">
        <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">About Us</span>
        <h1 className="mt-4 text-4xl font-extrabold">{settings.aboutHeading}</h1>
        {leadBlocks.map((b, i) => (
          <p key={i} className="mt-4 whitespace-pre-line text-lg text-slate-600 dark:text-slate-300">{b.text}</p>
        ))}
      </div>

      {bodyBlocks.length > 0 && (
        <article className="mx-auto mt-10 max-w-3xl text-left">
          {bodyBlocks.map((b, i) =>
            b.type === "heading" ? (
              <h2 key={i} className="mt-10 text-2xl font-bold text-slate-800 first:mt-0 dark:text-slate-100">{b.text}</h2>
            ) : (
              <p key={i} className="mt-3 whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">{b.text}</p>
            )
          )}
        </article>
      )}

      {values.length > 0 && (
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {values.map((v, i) => {
            const Icon = VALUE_ICONS[i % VALUE_ICONS.length];
            return (
              <div key={i} className="card p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 text-accent-600 dark:bg-accent-900/40 dark:text-accent-300">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{v.desc}</p>
              </div>
            );
          })}
        </div>
      )}

      {stats.length > 0 && (
        <div className="mt-12 grid gap-4 rounded-3xl bg-gradient-to-r from-brand-600 to-accent-500 p-8 text-center text-white sm:grid-cols-3">
          {stats.map((s, i) => {
            const Icon = STAT_ICONS[i % STAT_ICONS.length];
            return (
              <div key={i} className="flex flex-col items-center">
                <Icon className="h-8 w-8 opacity-90" />
                <p className="mt-2 text-3xl font-extrabold">{s.value}</p>
                <p className="text-white/90">{s.label}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
