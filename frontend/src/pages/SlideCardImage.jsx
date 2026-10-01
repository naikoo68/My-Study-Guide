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
//                           (with &tpl=1: the 16:9 long-video template mode)
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
// `cb` = the admin's card position on the template ({ top, bottom, side }
// fractions of the template, see backend utils/cardBox.js) or null (default box).
function boxToCard(cb, W, H) {
  return { left: Math.round(cb.side * W), top: Math.round(cb.top * H), width: Math.round(W * (1 - 2 * cb.side)), height: Math.round(H * (1 - cb.top - cb.bottom)) };
}
function templateCard(tw, th, cb = null) {
  const base = cb ? boxToCard(cb, SLIDE_W, SLIDE_H) : TEMPLATE_CARD;
  if (!(tw > 0 && th > 0)) return base;
  const s = Math.min(SLIDE_W / tw, SLIDE_H / th);
  const fw = tw * s, fh = th * s;
  const fx = (SLIDE_W - fw) / 2, fy = (SLIDE_H - fh) / 2;
  const rx = (v) => Math.round(fx + (v / SLIDE_W) * fw);
  const ry = (v) => Math.round(fy + (v / SLIDE_H) * fh);
  const left = rx(base.left), top = ry(base.top);
  return {
    left, top,
    width: rx(base.left + base.width) - left,
    height: ry(base.top + base.height) - top,
  };
}
// Template-mode card look from the saved opacities (cb): background + shadow
// fade together; `text` fades the quiz content (text + option boxes).
const cardBg = (cb) => `rgba(255,255,255,${cb ? cb.card : 0.94})`;
const cardShadow = (cb) => `0 12px 40px rgba(15,23,42,${(0.10 * (cb ? cb.card : 1)).toFixed(3)})`;

// Where the template image sits in the frame (it's FITTED, never cropped; the
// 16:9 one inside a small safe margin `inset`) → { x, y, w, h } in px.
function templateRect(W, H, tw, th, inset = 0) {
  if (!(tw > 0 && th > 0)) return { x: 0, y: 0, w: W, h: H };
  const m = Math.max(0, Math.min(0.2, Number(inset) || 0));
  const s = Math.min((W * (1 - 2 * m)) / tw, (H * (1 - 2 * m)) / th);
  const w = tw * s, h = th * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
// The admin's extra image (logo / badge) at its spot on the template.
function TemplateLogo({ logo, rect }) {
  if (!logo) return null;
  return (
    <img src={logo.url} alt="" style={{
      position: "absolute", left: rect.x + logo.x * rect.w, top: rect.y + logo.y * rect.h,
      width: logo.w * rect.w, height: "auto", opacity: logo.opacity, zIndex: 5, pointerEvents: "none",
    }} />
  );
}

const BUILTIN_CARD = { left: 50, top: 230, width: 980, height: 1530 };
// Landscape (1920×1080): slim brand bar on top, a wide card below.
const LAND_W = 1920, LAND_H = 1080;
const LAND_CARD = { left: 70, top: 150, width: 1780, height: 830 };
const LAND_CAPTION_H = 150;
// Landscape TEMPLATE mode: the card sits in the template's middle, leaving a
// header band on top (logo / title) and a footer band below (site / buttons).
const LAND_TEMPLATE_CARD = { left: 110, top: 190, width: 1700, height: 740 };

// Same idea as templateCard(), for the 16:9 frame: the template is FITTED
// (never cropped) inside 1920×1080, and the card keeps the same relative spot
// inside the fitted template. `inset` is the SAFE MARGIN (fraction per side)
// the video compositor leaves around the template, so the card lines up with
// the template exactly as it appears in the finished video.
function landTemplateCard(tw, th, inset = 0, cb = null) {
  const base = cb ? boxToCard(cb, LAND_W, LAND_H) : LAND_TEMPLATE_CARD;
  if (!(tw > 0 && th > 0)) return base;
  const m = Math.max(0, Math.min(0.2, Number(inset) || 0));
  const boxW = LAND_W * (1 - 2 * m), boxH = LAND_H * (1 - 2 * m);
  const s = Math.min(boxW / tw, boxH / th);
  const fw = tw * s, fh = th * s;
  const fx = (LAND_W - fw) / 2, fy = (LAND_H - fh) / 2;
  const rx = (v) => Math.round(fx + (v / LAND_W) * fw);
  const ry = (v) => Math.round(fy + (v / LAND_H) * fh);
  const left = rx(base.left), top = ry(base.top);
  return {
    left, top,
    width: rx(base.left + base.width) - left,
    height: ry(base.top + base.height) - top,
  };
}
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

// Opening / closing slide: a big centred heading + a couple of lines, on the
// same branded card as the question slides. No question is fetched.
// Header brand: the account's own logo + name (a cross-posting user's channel),
// or the built-in "MyStudyGuide" wordmark when none is given. `size` = "lg"
// (portrait question slide) or "md" (intro / end / landscape).
function Brand({ brand, size = "md" }) {
  const box = size === "lg" ? "h-20 w-20 rounded-3xl" : "h-16 w-16 rounded-2xl";
  const icon = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const text = size === "lg" ? "text-6xl" : "text-5xl";
  const custom = !!(brand?.name || brand?.logo);
  const bg = brand?.color ? { backgroundColor: brand.color } : undefined;
  if (!custom) {
    return (
      <>
        <span className={`flex ${box} items-center justify-center bg-brand-600 text-white`}><GraduationCap className={icon} /></span>
        <span className={`${text} font-extrabold leading-none`}><span className="text-slate-900">My</span><span className="text-brand-600">Study</span><span className="text-slate-900">Guide</span></span>
      </>
    );
  }
  return (
    <>
      {brand.logo
        ? <img src={brand.logo} alt="" className={`${box} flex-shrink-0 object-contain`} />
        : <span className={`flex ${box} flex-shrink-0 items-center justify-center text-white ${bg ? "" : "bg-brand-600"}`} style={bg}>
            <span className={size === "lg" ? "text-5xl font-black" : "text-4xl font-black"}>{(brand.name || "?").trim().charAt(0).toUpperCase()}</span>
          </span>}
      {brand.name && <span className={`${text} truncate font-extrabold leading-none text-slate-900`} style={{ maxWidth: size === "lg" ? 820 : 1200 }}>{brand.name}</span>}
    </>
  );
}

function IntroOutroSlide({ heading, lines, tag, site, brand, landscape, templateMode, tplW, tplH, ready, onReady }) {
  useEffect(() => { onReady?.(); }, [onReady]);
  const W = landscape ? LAND_W : SLIDE_W;
  const H = landscape ? LAND_H : SLIDE_H;
  const card = templateMode
    ? (landscape ? landTemplateCard(tplW, tplH, 0.03) : templateCard(tplW, tplH))
    : (landscape ? LAND_CARD : BUILTIN_CARD);
  const pad = landscape ? 48 : CARD_PAD;
  return (
    <div data-card-el data-card-ready={ready ? "1" : "0"}
      style={{ position: "relative", width: W, height: H, overflow: "hidden",
        background: templateMode ? "transparent" : "linear-gradient(135deg,#eef2ff 0%,#ffffff 50%,#ecfdf5 100%)" }}>
      {!templateMode && (
        <div style={{ position: "absolute", left: card.left, right: card.left, top: 36, height: 80 }} className="flex items-center gap-3">
          <Brand brand={brand} />
        </div>
      )}
      <div style={{ position: "absolute", left: card.left, top: card.top, width: card.width, height: card.height,
        padding: pad, borderRadius: 36, background: templateMode ? "rgba(255,255,255,0.94)" : "#ffffff",
        boxShadow: "0 12px 40px rgba(15,23,42,0.10)", boxSizing: "border-box",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 28 }}>
        {tag && <span className="rounded-full bg-brand-50 px-6 py-2 text-3xl font-bold uppercase tracking-wide text-brand-700">{tag}</span>}
        <h1 className="font-black leading-tight text-slate-900" style={{ fontSize: landscape ? 84 : 76 }}>{heading}</h1>
        {(lines || []).map((l, i) => (
          <div key={i} className={`font-bold ${i === 0 ? "text-brand-600" : "text-slate-600"}`} style={{ fontSize: landscape ? 52 : 46, lineHeight: 1.2 }}>{l}</div>
        ))}
      </div>
      {!templateMode && site && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 60 }} className="text-center text-3xl font-semibold text-slate-500">{site}</div>
      )}
    </div>
  );
}

export default function SlideCardImage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const roleParam = sp.get("role");
  const role = roleParam === "answer" ? "answer" : roleParam === "reveal" ? "reveal"
    : (roleParam === "intro" || roleParam === "shortintro") ? "intro" : (roleParam === "outro" || roleParam === "shortoutro") ? "outro" : "question";
  const tag = (sp.get("tag") || "").trim();
  const caption = (sp.get("cap") || "").trim();
  const templateMode = sp.get("tpl") === "1";
  const site = (sp.get("site") || "").trim();
  const tplW = parseInt(sp.get("tw"), 10) || 0;
  const tplH = parseInt(sp.get("th"), 10) || 0;
  const tplInset = parseFloat(sp.get("m")) || 0; // safe margin around the template (fraction/side)
  const landscape = sp.get("o") === "l";
  // Card position on the template: "top,bottom,side" fractions (else default).
  // Extra image on the template: lg = https URL, lp = "x,y,w,opacity" fractions.
  const tplLogo = (() => {
    const url = (sp.get("lg") || "").trim();
    const v = (sp.get("lp") || "").split(",").map(Number);
    if (!/^https:\/\//i.test(url) || v.length !== 4 || !v.every((x) => Number.isFinite(x) && x >= 0 && x <= 1)) return null;
    return { url, x: v[0], y: v[1], w: Math.max(0.02, v[2]), opacity: Math.max(0.05, v[3]) };
  })();
  // Card position + opacities on the template: "top,bottom,side[,card,text]"
  // (fractions; see backend utils/cardBox.js) — else the defaults.
  const cardBox = (() => {
    const v = (sp.get("cb") || "").split(",").map(Number);
    if (!(v.length === 3 || v.length === 5) || !v.every((x) => Number.isFinite(x) && x >= 0 && x <= 1)) return null;
    const [top, bottom, side, card = 0.94, text = 1] = v;
    if (top > 0.45 || bottom > 0.45 || top + bottom > 0.71 || side > 0.3) return null;
    return { top, bottom, side, card, text: Math.max(0.1, text) };
  })();
  // Per-account header (cross-posting users): name, hosted https logo, colour.
  const bn = (sp.get("bn") || "").trim().slice(0, 40);
  const blRaw = (sp.get("bl") || "").trim();
  const bcRaw = (sp.get("bc") || "").trim();
  const brand = {
    name: bn,
    logo: /^https:\/\//i.test(blRaw) ? blRaw : "",
    color: /^[0-9a-f]{6}$/i.test(bcRaw) ? `#${bcRaw}` : "",
  };
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

  const isIntroOutro = role === "intro" || role === "outro";
  const heading = (sp.get("h") || "").trim();
  const subLines = (sp.get("sub") || "").split("||").map((x) => x.trim()).filter(Boolean);

  useEffect(() => {
    if (isIntroOutro) return undefined; // no question to fetch for intro/outro
    let alive = true;
    contentService.cardQuestion(id, { answer: true })
      .then((data) => { if (alive) setQ(data); })
      .catch((e) => { if (alive) setError(e.message || "Question not found"); });
    return () => { alive = false; };
  }, [id, isIntroOutro]);

  useEffect(() => {
    if (!q && !isIntroOutro) return undefined;
    let alive = true;
    const done = () => { if (alive) requestAnimationFrame(() => requestAnimationFrame(() => alive && setFontsReady(true))); };
    if (document.fonts?.ready) document.fonts.ready.then(done).catch(done);
    else done();
    return () => { alive = false; };
  }, [q, isIntroOutro]);

  if (isIntroOutro) {
    return <IntroOutroSlide heading={heading} lines={subLines} tag={tag} site={site} brand={brand} landscape={landscape}
      templateMode={templateMode} tplW={tplW} tplH={tplH} ready={fontsReady} onReady={() => setFitted(true)} />;
  }

  if (error) return <div data-card-error="1" style={{ padding: 24, fontFamily: "sans-serif" }}>{error}</div>;
  if (!q) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading…</div>;

  if (landscape) return <LandscapeSlide q={q} role={role} tag={tag} caption={caption} site={site} brand={brand} cardBox={cardBox} tplLogo={tplLogo} ready={ready} onFit={setFitted} templateMode={templateMode} tplW={tplW} tplH={tplH} tplInset={tplInset} />;

  const card = templateMode ? templateCard(tplW, tplH, cardBox) : BUILTIN_CARD;
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
          <Brand brand={brand} size="lg" />
        </div>
      )}

      <div
        style={{
          position: "absolute", left: card.left, top: card.top, width: card.width, height: card.height,
          padding: CARD_PAD, borderRadius: 36, background: templateMode ? cardBg(cardBox) : "#ffffff",
          boxShadow: templateMode ? cardShadow(cardBox) : "0 12px 40px rgba(15,23,42,0.10)", boxSizing: "border-box",
        }}
      >
        <ZoomFit width={innerW} height={innerH} onFit={setFitted}>
          <div style={templateMode && cardBox && cardBox.text < 1 ? { opacity: cardBox.text } : undefined}>
            {role === "answer" ? <AnswerSlide q={q} tag={tag} /> : <QuestionSlide q={q} tag={tag} reveal={role === "reveal"} />}
          </div>
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
      {templateMode && <TemplateLogo logo={tplLogo} rect={templateRect(SLIDE_W, SLIDE_H, tplW, tplH)} />}
    </div>
  );
}

// 16:9 slide for long YouTube videos: brand bar + site on top, one wide card
// with the question (or answer), and the caption strip at the bottom of it.
// Template mode: transparent page (the uploaded 16:9 template is laid underneath
// by ffmpeg), no built-in brand bar, and the card placed in the template's middle.
function LandscapeSlide({ q, role, tag, caption, site, brand, cardBox = null, tplLogo = null, ready, onFit, templateMode = false, tplW = 0, tplH = 0, tplInset = 0 }) {
  const card = templateMode ? landTemplateCard(tplW, tplH, tplInset, cardBox) : LAND_CARD;
  const pad = templateMode ? 40 : 48;
  const innerW = card.width - pad * 2;
  const innerH = card.height - pad * 2 - (caption ? LAND_CAPTION_H : 0);
  return (
    <div
      data-card-el
      data-card-ready={ready ? "1" : "0"}
      style={{ position: "relative", width: LAND_W, height: LAND_H, overflow: "hidden", background: templateMode ? "transparent" : "linear-gradient(135deg,#eef2ff 0%,#ffffff 50%,#ecfdf5 100%)" }}
    >
      {!templateMode && <div style={{ position: "absolute", left: card.left, right: card.left, top: 36, height: 80 }} className="flex items-center justify-between">
        <span className="flex items-center gap-3">
          <Brand brand={brand} />
        </span>
        {site && <span className="text-3xl font-semibold text-slate-500">{site}</span>}
      </div>}
      <div
        style={{
          position: "absolute", left: card.left, top: card.top, width: card.width, height: card.height,
          padding: pad, borderRadius: 36, background: templateMode ? cardBg(cardBox) : "#ffffff",
          boxShadow: templateMode ? cardShadow(cardBox) : "0 12px 40px rgba(15,23,42,0.10)", boxSizing: "border-box",
        }}
      >
        <ZoomFit width={innerW} height={innerH} onFit={onFit} maxZoom={2.2} layoutW={LAND_LAYOUT_W}>
          <div style={templateMode && cardBox && cardBox.text < 1 ? { opacity: cardBox.text } : undefined}>
            {role === "answer" ? <AnswerSlide q={q} tag={tag} /> : <QuestionSlide q={q} tag={tag} reveal={role === "reveal"} />}
          </div>
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
      {templateMode && <TemplateLogo logo={tplLogo} rect={templateRect(LAND_W, LAND_H, tplW, tplH, tplInset)} />}
    </div>
  );
}
