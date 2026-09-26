// Progress % + "time left" estimate for the AI Slideshow test build.
//
// The server reports which step it's on (slides → narration → video) and, per
// step, how many slides are done ({ done, total }). We turn that into:
//   • percent  — how much of the WORK is done (step position + slide counter),
//                NOT elapsed time, so it can't reach 99% just because a step
//                is slower than guessed.
//   • time left — measured per-slide speed of the current step × slides left,
//                plus the expected time of the steps still to come.
// Two rules keep it honest: a running step never counts as finished (it
// always has some time left), and the shown time-left is smoothed so one new
// server update can't make it jump wildly.
// Expected step times are learned from this browser's previous runs
// (localStorage), so the estimate adapts to the real server speed.

export const ETA_STAGES = ["PENDING", "GENERATING_SLIDES", "GENERATING_AUDIO", "RENDERING_VIDEO"];

// Starting guesses in seconds (tuned by the learned ratios below).
const BASE = {
  PENDING: { fixed: 5, perSlide: 0 }, // picking the voice / provider
  GENERATING_SLIDES: { fixed: 2, perSlide: 3 }, // SVG → image upload → download
  GENERATING_AUDIO: { fixed: 1, perSlide: 3 }, // one TTS call per slide
  RENDERING_VIDEO: { fixed: 12, perSlide: 12 }, // ffmpeg per slide + concat + upload
};

// Share of a step covered by its per-slide counter. The video step still has to
// join the clips and upload the MP4 after the last slide is encoded.
const COUNTED_SHARE = { GENERATING_SLIDES: 1, GENERATING_AUDIO: 1, RENDERING_VIDEO: 0.8 };

// v2: the base timings changed, so ratios learned against v1 no longer apply.
const STORAGE_KEY = "slideshowEtaProfileV2";
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const expectedSec = (stage, slides, profile) => {
  const b = BASE[stage];
  if (!b) return 0;
  const ratio = Number(profile?.[stage]) > 0 ? Number(profile[stage]) : 1;
  return (b.fixed + b.perSlide * Math.max(1, slides)) * ratio;
};

// → { percent (0–99), remainingSec (≥ 1 while running) }
//   stage:           the server's current step ("" / PENDING / GENERATING_… / RENDERING_VIDEO)
//   stageElapsedSec: seconds since that step started
//   progress:        { done, total } within the step (or null)
//   slides:          number of slides in the video (2 per question)
//   profile:         learned speed ratios per step (see learnSlideshowProfile)
//   doneAtSec:       step-relative second at which progress.done last changed
export function estimateSlideshowEta({ stage, stageElapsedSec = 0, doneAtSec = 0, progress = null, slides = 2, profile = null } = {}) {
  const idx = Math.max(0, ETA_STAGES.indexOf(stage || "PENDING"));
  const cur = ETA_STAGES[idx];
  const n = progress?.total > 0 ? progress.total : slides;
  const exp = ETA_STAGES.map((s) => expectedSec(s, n, profile));
  const t = Math.max(0, stageElapsedSec);
  const done = Number(progress?.done) || 0;
  const counted = COUNTED_SHARE[cur];

  let curRemaining;
  let speed = 1; // >1 = this run is slower than expected
  if (counted && done > 0 && progress.total > 0) {
    // Real measurement: seconds per slide, timed up to when the LAST slide
    // finished (doneAtSec) — not "now", or the wait for the next slide would
    // make every slide look slower and the time left would climb.
    const doneAt = doneAtSec > 0 && doneAtSec <= t ? doneAtSec : t;
    const perItem = doneAt / done;
    const inProgress = t - doneAt; // time spent on the slide being made now
    speed = clamp(perItem / ((exp[idx] * counted) / progress.total), 0.3, 8);
    const tail = exp[idx] * (1 - counted) * speed; // e.g. join + upload the MP4
    const left = progress.total - done;
    curRemaining = left > 0
      ? Math.max(perItem - inProgress, inProgress * 0.35 + 1) + perItem * (left - 1) + tail
      : Math.max(tail - inProgress, inProgress * 0.35 + 2);
  } else {
    // No counter yet: use the expected time, but a step that runs over its
    // guess is NEVER treated as done — assume it needs a bit longer still.
    curRemaining = Math.max(exp[idx] - t, t * 0.35 + 3);
    if (t > exp[idx] && exp[idx] > 0) speed = clamp(t / exp[idx], 1, 8);
  }

  // Steps still to come, nudged by this run's speed (half-weight — weak signal).
  const laterScale = (1 + speed) / 2;
  let remaining = curRemaining;
  for (let i = idx + 1; i < ETA_STAGES.length; i++) remaining += exp[i] * laterScale;

  // Percent of WORK done: finished steps + the part of this step that's done,
  // weighted by how long each step takes.
  const weights = exp.map((e, i) => (i < idx ? e : i === idx ? e * speed : e * laterScale));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const curFraction = t + curRemaining > 0 ? t / (t + curRemaining) : 0;
  const workDone = weights.slice(0, idx).reduce((a, b) => a + b, 0) + weights[idx] * curFraction;
  const percent = clamp(Math.floor((workDone / totalW) * 100), 0, 99);

  return { percent, remainingSec: Math.max(1, Math.round(remaining)) };
}

// Smooth the shown time-left: count down 1s per tick, and move only part of
// the way toward a new estimate so a single server update can't make it jump.
export function smoothRemaining(prevShown, target) {
  if (!(prevShown > 0)) return target;
  const ticked = Math.max(1, prevShown - 1);
  if (Math.abs(target - ticked) <= 2) return ticked;
  return Math.max(1, Math.round(ticked + (target - ticked) * 0.3));
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
