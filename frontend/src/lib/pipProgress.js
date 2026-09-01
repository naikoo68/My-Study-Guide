// Picture-in-Picture progress window for a running AI generation.
//
// Goal: keep the "Generating… N of M" progress visible even after you LEAVE the
// browser — switch to another app or go to the home screen — as a real floating
// PiP window, not just an in-page pill.
//
// Two strategies, chosen by capability:
//   1. Document Picture-in-Picture (desktop Chrome/Edge): renders real, tappable
//      DOM (with Stop / Open buttons) into the floating window.
//   2. Canvas -> <video> -> requestPictureInPicture (Android Chrome, and a
//      universal fallback): paints the progress onto a canvas, streams it into a
//      hidden muted video, and pops THAT into the OS PiP overlay. It's view-only
//      (the OS supplies the close / return-to-app controls), but it floats over
//      other apps on mobile — which is the whole point here.
//
// PiP must be started from a user gesture (a tap on the "Pop out" button).

let session = null; // active session: { kind, update(state), close() }

// Is any form of PiP available in this browser?
export function isPipSupported() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if ("documentPictureInPicture" in window) return true;
  try {
    const canCapture = typeof document.createElement("canvas").captureStream === "function";
    return !!(document.pictureInPictureEnabled && canCapture);
  } catch {
    return false;
  }
}

export function isProgressPipActive() {
  return !!session;
}

// Normalize the caller's state into the bits we render.
function view(s = {}) {
  const count = Number(s.count || 0);
  const requested = Number(s.requested || 0);
  const done = !!s.done;
  const label = s.label && s.label !== "AI generation" ? s.label : "";
  const pct = requested > 0 ? Math.min(1, count / requested) : done ? 1 : 0;
  const line = done
    ? `${count || ""} ready — open to insert`
    : requested
      ? `${count} of ${requested} · ${Math.max(0, requested - count)} to go`
      : `${count} generated…`;
  return { title: done ? "Questions ready" : "Generating…", label, line, pct, done, count, requested };
}

// ─────────────────────────── Canvas → video PiP ───────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCanvas(ctx, w, h, s) {
  const v = view(s);
  // Card background (dark — always legible over any app behind it).
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0f172a"; // slate-900
  roundRect(ctx, 0, 0, w, h, 20);
  ctx.fill();
  const accent = v.done ? "#34d399" : "#818cf8"; // emerald-400 / indigo-400
  ctx.textBaseline = "top";
  // Title
  ctx.fillStyle = accent;
  ctx.font = "600 22px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(v.title, 24, 22);
  // Big count
  ctx.fillStyle = "#f8fafc"; // slate-50
  ctx.font = "800 46px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const big = v.done ? String(v.count || "") : `${v.count}${v.requested ? ` / ${v.requested}` : ""}`;
  ctx.fillText(big, 24, 52);
  // Sub line (label preferred, else the "N to go" line)
  ctx.fillStyle = "#94a3b8"; // slate-400
  ctx.font = "500 17px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const sub = v.label || v.line;
  ctx.fillText(sub.length > 34 ? `${sub.slice(0, 33)}…` : sub, 24, 110);
  // Progress bar
  const barX = 24;
  const barW = w - 48;
  const barH = 10;
  const barY = h - 30;
  ctx.fillStyle = "#1e293b"; // slate-800
  roundRect(ctx, barX, barY, barW, barH, 5);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, barX, barY, Math.max(barH, barW * v.pct), barH, 5);
  ctx.fill();
}

async function startCanvasPip(state) {
  const W = 380;
  const H = 210;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  let cur = state;
  drawCanvas(ctx, W, H, cur);

  const stream = canvas.captureStream(6); // ~6fps is plenty for a progress bar
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.srcObject = stream;
  // Attached but effectively invisible (some browsers need it in the DOM).
  Object.assign(video.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(video);
  await video.play().catch(() => {});

  // Keep repainting so captureStream emits fresh frames (and the last frame
  // shown while backgrounded stays current when the tab briefly wakes).
  let raf = null;
  const loop = () => {
    drawCanvas(ctx, W, H, cur);
    raf = requestAnimationFrame(loop);
  };
  const iv = setInterval(() => drawCanvas(ctx, W, H, cur), 500);
  loop();

  const cleanup = () => {
    try { clearInterval(iv); } catch { /* noop */ }
    try { if (raf) cancelAnimationFrame(raf); } catch { /* noop */ }
    try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    try { video.remove(); } catch { /* noop */ }
  };

  // The OS "close PiP" control fires this — reset the module session too.
  video.addEventListener(
    "leavepictureinpicture",
    () => {
      cleanup();
      session = null;
    },
    { once: true }
  );

  await video.requestPictureInPicture();

  return {
    kind: "canvas",
    update: (s) => {
      cur = s;
      drawCanvas(ctx, W, H, cur);
    },
    close: async () => {
      try {
        if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      } catch { /* noop */ }
      cleanup();
    },
  };
}

// ─────────────────────── Document PiP (desktop, rich) ───────────────────────
async function startDocPip(state, handlers) {
  const pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: 190 });
  const doc = pip.document;
  const style = doc.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; padding: 16px; }
    .t { font-size: 15px; font-weight: 600; }
    .t.done { color: #34d399; } .t.run { color: #818cf8; }
    .big { font-size: 40px; font-weight: 800; margin-top: 2px; }
    .sub { font-size: 13px; color: #94a3b8; margin-top: 2px; min-height: 16px; }
    .bar { height: 8px; background: #1e293b; border-radius: 4px; margin-top: 12px; overflow: hidden; }
    .fill { height: 100%; background: #818cf8; border-radius: 4px; transition: width .3s; }
    .fill.done { background: #34d399; }
    .row { display: flex; gap: 8px; margin-top: 14px; }
    button { flex: 1; border: 0; border-radius: 8px; padding: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .open { background: #6366f1; color: #fff; }
    .stop { background: transparent; color: #fb7185; border: 1px solid #334155; }
  `;
  doc.head.appendChild(style);

  const v0 = view(state);
  const root = doc.createElement("div");
  root.innerHTML = `
    <div class="t ${v0.done ? "done" : "run"}" data-t></div>
    <div class="big" data-big></div>
    <div class="sub" data-sub></div>
    <div class="bar"><div class="fill ${v0.done ? "done" : ""}" data-fill></div></div>
    <div class="row">
      <button class="open" data-open>Open</button>
      <button class="stop" data-stop>Stop</button>
    </div>
  `;
  doc.body.appendChild(root);

  const $t = root.querySelector("[data-t]");
  const $big = root.querySelector("[data-big]");
  const $sub = root.querySelector("[data-sub]");
  const $fill = root.querySelector("[data-fill]");
  const $open = root.querySelector("[data-open]");
  const $stop = root.querySelector("[data-stop]");

  const render = (s) => {
    const v = view(s);
    $t.textContent = v.title;
    $t.className = `t ${v.done ? "done" : "run"}`;
    $big.textContent = v.done ? String(v.count || "") : `${v.count}${v.requested ? ` / ${v.requested}` : ""}`;
    $sub.textContent = v.label || v.line;
    $fill.style.width = `${Math.round(v.pct * 100)}%`;
    $fill.className = `fill ${v.done ? "done" : ""}`;
    $stop.style.display = v.done ? "none" : "";
  };
  render(state);

  $open.addEventListener("click", () => handlers?.onOpen?.());
  $stop.addEventListener("click", () => handlers?.onStop?.());
  pip.addEventListener("pagehide", () => {
    session = null;
    handlers?.onClose?.();
  });

  return {
    kind: "doc",
    update: render,
    close: async () => {
      try { pip.close(); } catch { /* noop */ }
    },
  };
}

// Start a PiP progress window. `handlers` = { onStop, onOpen, onClose } (onStop/
// onOpen are only wired on desktop Document PiP; the canvas path is view-only).
export async function startProgressPip(state, handlers = {}) {
  if (session) return session;
  let raw;
  if ("documentPictureInPicture" in window) raw = await startDocPip(state, handlers);
  else raw = await startCanvasPip(state);
  session = raw;
  return session;
}

export function updateProgressPip(state) {
  if (session) {
    try { session.update(state); } catch { /* noop */ }
  }
}

export async function closeProgressPip() {
  if (!session) return;
  const s = session;
  session = null;
  try { await s.close(); } catch { /* noop */ }
}
