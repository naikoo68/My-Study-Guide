import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { noticeService } from "../../services";

// A scrolling "notice board" ticker shown at the very top of the site. It
// pulls active notices from the backend and animates them right → left in a
// seamless loop. Hovering pauses the scroll. Renders nothing when empty.
export default function NoticeTicker() {
  const [notices, setNotices] = useState([]);

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
    <div className="relative z-[55] flex items-stretch overflow-hidden bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 text-sm font-medium text-white">
      <div className="z-10 flex flex-shrink-0 items-center gap-1.5 bg-accent-600 px-3 py-1.5 font-bold uppercase tracking-wide shadow-md">
        <Megaphone className="h-4 w-4" />
        <span className="hidden sm:inline">Notice</span>
      </div>
      <div
        className="marquee-track flex flex-1 items-center overflow-hidden py-1.5"
        style={{ "--marquee-duration": `${duration}s` }}
      >
        <Track />
        <Track aria-hidden="true" />
      </div>
    </div>
  );
}
