// Progress % + "time left" estimate for the AI Slideshow test build.
//
// The server reports which step it's on (slides → narration → video) and, per
// step, how many slides are done. That alone can't say how long is LEFT, so we
// combine it with a model of how long each step usually takes:
//   expected(step) = (fixed + perSlide × slides) × learned speed ratio
// The ratio is learned from this browser's previous successful runs (stored in
// localStorage), so the estimate adapts to the real server speed over time.

export const ETA_STAGES = ["PENDING", "GENERATING_SLIDES", "GENERATING_AUDIO", "RENDERING_VIDEO"];

// Starting guesses in seconds (tuned by the learned ratios below).
const BASE = {
  PENDING: { fixed: 4, perSlide: 0 }, // picking the voice / provider
  GENERATING_SLIDES: { fixed: 2, perSlide: 3 }, // SVG → image upload → download
  GENERATING_AUDIO: { fixed: 1, perSlide: 2.5 }, // one TTS call per slide
  RENDERING_VIDEO: { fixed: 8, perSlide: 5 }, // ffmpeg per slide + concat + upload
};

// Share of a step covered by its per-slide counter. The video step still has to
// join the clips and upload the MP4 after the last slide is encoded.
const COUNTED_SHARE = { GENERATING_SLIDES: 1, GENERATING_AUDIO: 1, RENDERING_VIDEO: 0.75 };

const STORAGE_KEY = "slideshowEtaProfileV1";
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const expectedSec = (stage, slides, profile) => {
  const b = BASE[stage];
  if (!b) return 0;
  const ratio = Number(profile?.[stage]) > 0 ? Number(profile[stage]) : 1;
  return (b.fixed + b.perSlide * Math.max(1, slides)) * ratio;
};

// → { percent (0–99), remainingSec (≥ 0) }
//   stage:           the server's current step ("" / PENDING / GENERATING_… / RENDERING_VIDEO)
//   stageElapsedSec: seconds since that step started
//   elapsedSec:      seconds since the whole build started
//   progress:        { done, total } within the step (or null)
//   slides:          number of slides in the video (2 per question)
//   profile:         learned speed ratios per step (see learnSlideshowProfile)
export function estimateSlideshowEta({ stage, stageElapsedSec = 0, elapsedSec = 0, progress = null, slides = 2, profile = null } = {}) {
  const idx = Math.max(0, ETA_STAGES.indexOf(stage || "PENDING"));
  const cur = ETA_STAGES[idx];
  const n = progress?.total > 0 ? progress.total : slides;
  const expCur = expectedSec(cur, n, profile);

  // How much slower/faster than expected this run is going (from the counter).
  let speed = 1;
  const done = Number(progress?.done) || 0;
  if (done > 0 && progress.total > 0 && COUNTED_SHARE[cur]) {
    const fraction = (done / progress.total) * COUNTED_SHARE[cur];
    speed = clamp(stageElapsedSec / (expCur * fraction), 0.3, 4);
  }

  let remaining = Math.max(0, expCur * speed - stageElapsedSec);
  // Later steps: nudge by this run's speed (half-weight — it's a weak signal).
  const laterScale = (1 + speed) / 2;
  for (let i = idx + 1; i < ETA_STAGES.length; i++) remaining += expectedSec(ETA_STAGES[i], n, profile) * laterScale;

  remaining = Math.round(remaining);
  const total = elapsedSec + remaining;
  const percent = total > 0 ? clamp(Math.floor((elapsedSec / total) * 100), 0, 99) : 0;
  return { percent: remaining === 0 ? 99 : percent, remainingSec: remaining };
}

// After a successful run, fold the measured step times into the profile.
//   marks: [{ stage, at }] — when each step was first seen (ms), in order
//   endAt: when the finished video came back (ms)
export function learnSlideshowProfile(profile, marks, endAt, slides) {
  const next = { ...(profile || {}) };
  (marks || []).forEach((m, i) => {
    if (!BASE[m.stage]) return;
    const until = i + 1 < marks.length ? marks[i + 1].at : endAt;
    const measured = (until - m.at) / 1000;
    const base = expectedSec(m.stage, slides, null);
    if (!(measured > 0) || !(base > 0)) return;
    const ratio = clamp(measured / base, 0.1, 10);
    const old = Number(next[m.stage]) > 0 ? Number(next[m.stage]) : ratio;
    next[m.stage] = Math.round((old * 0.5 + ratio * 0.5) * 1000) / 1000; // moving average
  });
  return next;
}

export function loadSlideshowProfile() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}; } catch { return {}; }
}

export function saveSlideshowProfile(profile) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile || {})); } catch { /* private mode etc. */ }
}

// Seconds → "m:ss".
export function fmtDuration(s) {
  const v = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
