// Chrome-less 9:16 (1080×1920) slide for the AI Slideshow Reel, screenshotted
// by the backend (cardShot.renderSlideCardShots). It reuses the SAME components
// students see in the quiz (Inter font, MathText/KaTeX, option rows, the answer
// flashcard), so slideshow slides match posts, Reels and the student view.
//
// Route: /slide-card/:id
//   ?role=question|answer   which slide to draw
//   &tag=QUESTION 1 OF 3    the pill at the top of the card
//   &cap=<text>             optional auto-caption (the narration) at the bottom
//   &tpl=1                  template mode: transparent page, content on a white
//                           card in the middle (the uploaded template is laid
//                           underneath by ffmpeg, never cropped)
//   &site=<text>            footer text for the built-in design
//   &o=l                    LANDSCAPE 16:9 (1920×1080) slide for long YouTube videos
// Sets data-card-ready="1" once the question + web fonts have loaded and the
// content has been scaled to fit.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { contentService } from "../services";
import MathText from "../components/ui/MathText";
import FlashcardAnswer from "../components/ui/FlashcardAnswer";
import { FrontContent } from "./FlashcardCardImage";
import { stemText } from "../lib/questions";

const SLIDE_W = 1080, SLIDE_H = 1920;
// Card area. Template mode keeps the same box the old slides used (so existing
// templates still line up): the template's header above, footer below.
const TEMPLATE_CARD = { left: 50, top: 300, width: 980, height: 1360 };

// The template is shown FITTED inside the 9:16 frame (never cropped), so a
// template that isn't 9:16 occupies a smaller centred rectangle. Place the card
// in the same relative spot inside THAT rectangle (header above, footer below,
// same side margins), so it never covers the template's own header / footer /
// buttons. `tw`×`th` = the template's pixel size (unknown → full 9:16 frame).
function templateCard(tw, th) {
  if (!(tw > 0 && th > 0)) return TEMPLATE_CARD;
  const s = Math.min(SLIDE_W / tw, SLIDE_H / th);
  const fw = tw * s, fh = th * s;
  const fx = (SLIDE_W - fw) / 2, fy = (SLIDE_H - fh) / 2;
  const rx = (v) => Math.round(fx + (v / SLIDE_W) * fw);
  const ry = (v) => Math.round(fy + (v / SLIDE_H) * fh);
  const left = rx(TEMPLATE_CARD.left), top = ry(TEMPLATE_CARD.top);
  return {
    left, top,
    width: rx(TEMPLATE_CARD.left + TEMPLATE_CARD.width) - left,
    height: ry(TEMPLATE_CARD.top + TEMPLATE_CARD.height) - top,
  };
}
const BUILTIN_CARD = { left: 50, top: 230, width: 980, height: 1530 };
// Landscape (1920×1080): slim brand bar on top, a wide card below.
const LAND_W = 1920, LAND_H = 1080;
const LAND_CARD = { left: 70, top: 150, width: 1780, height: 830 };
const LAND_CAPTION_H = 150;
const CARD_PAD = 56;
const CAPTION_H = 230; // room kept at the bottom of the card for the caption
// The quiz components are sized for a ~450px-wide phone card; draw them at that
// width and zoom up (max 2.6×) so text is big on a phone-sized video. Long
// content zooms less so it always fits.
const MAX_ZOOM = 2.6;
// Landscape content is laid out wider (not a phone column) so it uses the width.
const LAND_LAYOUT_W = 900;

// Zooms its content to fill `width` × `height` (never above MAX_ZOOM) and
// centres it vertically. Reports when the size has settled.
// `layoutW` (landscape): lay content out at this fixed width, zoom it to fit
// both the width and the height, and centre it horizontally.
function ZoomFit({ width, height, onFit, children, maxZoom = MAX_ZOOM, layoutW = 0 }) {
  const innerRef = useRef(null);
  const [zoom, setZoom] = useState(maxZoom);
  const [offset, setOffset] = useState(0);
  const passes = useRef(0);
  // Re-fit whenever the content's size changes (math / fonts / images load
  // after the first paint). Each pass: zoom = what makes the content (laid out
  // at width/zoom) fill the height, capped at MAX_ZOOM. A few passes converge;
  // if they don't, the smaller zoom wins so the content always fits.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return undefined;
    const fit = () => {
      const sh = el.scrollHeight; // untransformed height at the current layout width
      const cap = layoutW ? Math.min(maxZoom, width / layoutW) : maxZoom;
      const k = Math.min(cap, height / Math.max(1, sh)) * 0.99;
      const cur = parseFloat(el.dataset.zoom) || maxZoom;
      if (Math.abs(k - cur) > 0.01 && passes.current < 8) {
        passes.current += 1;
        onFit?.(false);
        setZoom(passes.current >= 6 ? Math.min(k, cur) : k);
        return;
      }
      const z = sh * cur > height ? height / sh : cur; // final safety: must fit
      if (z !== cur) { setZoom(z); return; }
      setOffset(Math.max(0, (height - sh * cur) / 2));
      onFit?.(true);
    };
    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, width, height, onFit, maxZoom, layoutW]);
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden" }}>
      <div ref={innerRef} data-zoom={zoom} style={{
        position: "absolute", top: offset,
        left: layoutW ? Math.max(0, (width - layoutW * zoom) / 2) : 0,
        width: layoutW || width / zoom,
        transformOrigin: "top left", transform: `scale(${zoom})`,
      }}>
        {children}
      </div>
    </div>
  );
}

function Tag({ role, text }) {
  const cls = role === "answer" ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700";
  return <span className={`mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${cls}`}>{text}</span>;
}

// `reveal`: the same slide with the correct option turned green (question-only
// mode's answer reveal). The layout is identical, so the video "recolours" in place.
function QuestionSlide({ q, tag, reveal = false }) {
  return (
    <>
      {tag && <Tag role="question" text={tag} />}
      {q.image && <img src={q.image} alt="" className="mb-3 max-h-56 rounded-xl object-contain" />}
      <FrontContent q={q} revealCorrect={reveal} />
    </>
  );
}

function AnswerSlide({ q, tag }) {
  return (
    <>
      {tag && <Tag role="answer" text={tag} />}
      {/* <div>, not <p>: the site's global p rule would shrink it to 11px. */}
      <div className="text-base font-semibold leading-relaxed text-slate-700"><MathText>{stemText(q)}</MathText></div>
      <FlashcardAnswer q={q} />
    </>
  );
}

export default function SlideCardImage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const roleParam = sp.get("role");
  const role = roleParam === "answer" ? "answer" : roleParam === "reveal" ? "reveal" : "question";
  const tag = (sp.get("tag") || "").trim();
  const caption = (sp.get("cap") || "").trim();
  const templateMode = sp.get("tpl") === "1";
  const site = (sp.get("site") || "").trim();
  const tplW = parseInt(sp.get("tw"), 10) || 0;
  const tplH = parseInt(sp.get("th"), 10) || 0;
  const landscape = sp.get("o") === "l";
  const [q, setQ] = useState(null);
  const [error, setError] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const [fitted, setFitted] = useState(false);
  // Safety net: if the fit never reports "settled" (e.g. content keeps
  // re-sizing while late images / math load on a slow server), still signal
  // ready a few seconds after the fonts are in — ZoomFit always keeps the
  // content inside the card, so the slide is correct, just not re-centred.
  // Without this the backend waits, times out and falls back to the basic design.
  const [forced, setForced] = useState(false);
  useEffect(() => {
    if (!fontsReady || fitted) return undefined;
    const t = setTimeout(() => setForced(true), 5000);
    return () => clearTimeout(t);
  }, [fontsReady, fitted]);
  const ready = fontsReady && (fitted || forced);

  // Light theme, no animations (the screenshot must never catch a fade-in), and
  // a transparent page in template mode so the template shows around the card.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    const style = document.createElement("style");
    style.textContent = `*,*::before,*::after{animation:none!important;transition:none!important}` +
      (templateMode ? `html,body,#root{background:transparent!important}` : "");
    document.head.appendChild(style);
    return () => style.remove();
  }, [templateMode]);

  useEffect(() => {
    let alive = true;
    contentService.cardQuestion(id, { answer: true })
      .then((data) => { if (alive) setQ(data); })
      .catch((e) => { if (alive) setError(e.message || "Question not found"); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!q) return undefined;
    let alive = true;
    const done = () => { if (alive) requestAnimationFrame(() => requestAnimationFrame(() => alive && setFontsReady(true))); };
    if (document.fonts?.ready) document.fonts.ready.then(done).catch(done);
    else done();
    return () => { alive = false; };
  }, [q]);

  if (error) return <div data-card-error="1" style={{ padding: 24, fontFamily: "sans-serif" }}>{error}</div>;
  if (!q) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;

  if (landscape) return <LandscapeSlide q={q} role={role} tag={tag} caption={caption} site={site} ready={ready} onFit={setFitted} />;

  const card = templateMode ? templateCard(tplW, tplH) : BUILTIN_CARD;
  const innerW = card.width - CARD_PAD * 2;
  const innerH = card.height - CARD_PAD * 2 - (caption ? CAPTION_H : 0);

  return (
    <div
      data-card-el
      data-card-ready={ready ? "1" : "0"}
      style={{
        position: "relative", width: SLIDE_W, height: SLIDE_H, overflow: "hidden",
        background: templateMode ? "transparent" : "linear-gradient(180deg,#eef2ff 0%,#ffffff 45%,#ecfdf5 100%)",
      }}
    >
      {!templateMode && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 70 }} className="flex items-center justify-center gap-4">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-600 text-white"><GraduationCap className="h-11 w-11" /></span>
          <span className="text-6xl font-extrabold leading-none"><span className="text-slate-900">My</span><span className="text-brand-600">Study</span><span className="text-slate-900">Guide</span></span>
        </div>
      )}

      <div
        style={{
          position: "absolute", left: card.left, top: card.top, width: card.width, height: card.height,
          padding: CARD_PAD, borderRadius: 36, background: templateMode ? "rgba(255,255,255,0.94)" : "#ffffff",
          boxShadow: "0 12px 40px rgba(15,23,42,0.10)", boxSizing: "border-box",
        }}
      >
        <ZoomFit width={innerW} height={innerH} onFit={setFitted}>
          {role === "answer" ? <AnswerSlide q={q} tag={tag} /> : <QuestionSlide q={q} tag={tag} reveal={role === "reveal"} />}
        </ZoomFit>
        {caption && (
          <div
            style={{ position: "absolute", left: CARD_PAD, right: CARD_PAD, bottom: CARD_PAD, height: CAPTION_H - 30 }}
            className="flex items-center justify-center overflow-hidden rounded-3xl bg-slate-900/85 px-8 text-center text-[34px] font-semibold leading-snug text-white"
          >
            <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{caption}</span>
          </div>
        )}
      </div>

      {!templateMode && site && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 70 }} className="text-center text-3xl font-semibold text-slate-500">{site}</div>
      )}
    </div>
  );
}

// 16:9 slide for long YouTube videos: brand bar + site on top, one wide card
// with the question (or answer), and the caption strip at the bottom of it.
function LandscapeSlide({ q, role, tag, caption, site, ready, onFit }) {
  const card = LAND_CARD;
  const pad = 48;
  const innerW = card.width - pad * 2;
  const innerH = card.height - pad * 2 - (caption ? LAND_CAPTION_H : 0);
  return (
    <div
      data-card-el
      data-card-ready={ready ? "1" : "0"}
      style={{ position: "relative", width: LAND_W, height: LAND_H, overflow: "hidden", background: "linear-gradient(135deg,#eef2ff 0%,#ffffff 50%,#ecfdf5 100%)" }}
    >
      <div style={{ position: "absolute", left: card.left, right: card.left, top: 36, height: 80 }} className="flex items-center justify-between">
        <span className="flex items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white"><GraduationCap className="h-9 w-9" /></span>
          <span className="text-5xl font-extrabold leading-none"><span className="text-slate-900">My</span><span className="text-brand-600">Study</span><span className="text-slate-900">Guide</span></span>
        </span>
        {site && <span className="text-3xl font-semibold text-slate-500">{site}</span>}
      </div>
      <div
        style={{
          position: "absolute", left: card.left, top: card.top, width: card.width, height: card.height,
          padding: pad, borderRadius: 36, background: "#ffffff", boxShadow: "0 12px 40px rgba(15,23,42,0.10)", boxSizing: "border-box",
        }}
      >
        <ZoomFit width={innerW} height={innerH} onFit={onFit} maxZoom={2.2} layoutW={LAND_LAYOUT_W}>
          {role === "answer" ? <AnswerSlide q={q} tag={tag} /> : <QuestionSlide q={q} tag={tag} reveal={role === "reveal"} />}
        </ZoomFit>
        {caption && (
          <div
            style={{ position: "absolute", left: pad, right: pad, bottom: pad, height: LAND_CAPTION_H - 24 }}
            className="flex items-center justify-center overflow-hidden rounded-3xl bg-slate-900/85 px-10 text-center text-[32px] font-semibold leading-snug text-white"
          >
            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{caption}</span>
          </div>
        )}
      </div>
    </div>
  );
}
