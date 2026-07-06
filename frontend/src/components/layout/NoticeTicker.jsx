import { useEffect, useState } from "react";
import { Megaphone, X, ExternalLink } from "lucide-react";
import { noticeService } from "../../services";

// A scrolling "notice board" ticker shown at the very top of the site. It
// pulls active notices from the backend and animates them right → left in a
// seamless loop. Hovering pauses the scroll. Renders nothing when empty.
// Tapping the "Notice" icon opens a panel listing every notice.
export default function NoticeTicker() {
  const [notices, setNotices] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    noticeService
      .list()
      .then((list) => active && setNotices(Array.isArray(list) ? list : []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!notices.length) return null;

  // Slower scroll for more text so it stays readable.
  const totalChars = notices.reduce((n, x) => n + (x.text?.length || 0), 0);
  const duration = Math.min(80, Math.max(18, Math.round(totalChars / 3)));

  const Item = ({ n }) =>
    n.link ? (
      <a href={n.link} target="_blank" rel="noreferrer" className="mx-6 inline-flex items-center gap-2 hover:underline">
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/70" />
        {n.text}
      </a>
    ) : (
      <span className="mx-6 inline-flex items-center gap-2">
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white/70" />
        {n.text}
      </span>
    );

  // The track is duplicated so the -50% translate loops seamlessly.
  const Track = () => (
    <div className="animate-marquee flex shrink-0 items-center whitespace-nowrap">
      {notices.map((n) => (
        <Item key={n._id} n={n} />
      ))}
    </div>
  );

  return (
    <>
      <div className="relative z-[55] flex items-stretch overflow-hidden bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 text-sm font-medium text-white">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="View all notices"
          className="z-10 flex flex-shrink-0 items-center gap-1.5 bg-accent-600 px-3 py-1.5 font-bold uppercase tracking-wide shadow-md transition hover:bg-accent-500"
        >
          <Megaphone className="h-4 w-4" />
          <span className="hidden sm:inline">Notice</span>
        </button>
        <div
          className="marquee-track flex flex-1 cursor-pointer items-center overflow-hidden py-1.5"
          style={{ "--marquee-duration": `${duration}s` }}
          onClick={() => setOpen(true)}
        >
          <Track />
          <Track aria-hidden="true" />
        </div>
      </div>

      {/* All notices panel */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="my-10 w-full max-w-lg animate-scale-in rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 px-5 py-3.5 text-white">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Megaphone className="h-5 w-5" /> Notice Board
              </h3>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
              {notices.map((n, i) => (
                <div key={n._id} className="flex gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{n.text}</p>
                    {n.link && (
                      <a href={n.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                        <ExternalLink className="h-3.5 w-3.5" /> Open link
                      </a>
                    )}
                    {n.createdAt && (
                      <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
