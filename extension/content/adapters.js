// Modular platform adapters. Each adapter is independent and only reads content
// the user is already authorised to see (visible text, an OPEN transcript panel,
// the current selection). Nothing here bypasses paywalls, DRM, auth or anti-copy
// protection. Adapters attach to a shared object on the content-script global.
(function () {
  const CAP = 40000;
  const clean = (s) => String(s || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  const readText = (el) => (el ? clean(el.innerText) : "");
  const selection = () => (window.getSelection ? clean(String(window.getSelection())) : "");
  const meta = (platform, extra) => Object.assign({ platform, url: location.href, contentType: "text" }, extra || {});

  // Generic fallback — works on ANY page (selected text / visible main text).
  const generic = {
    id: "generic",
    name: "This page",
    canHandle: () => true,
    getTitle: () => document.title || "",
    getSelectedText: selection,
    getTranscript: () => "",
    getVisibleContent() {
      const main = document.querySelector("main, article, [role='main']") || document.body;
      return readText(main).slice(0, CAP);
    },
    getMeta() {
      return meta("Website", { title: document.title });
    },
  };

  // Pull the whole JSON object that starts at `marker` out of an HTML string,
  // by brace-matching (regex can't balance braces reliably).
  const sliceJson = (html, marker) => {
    const i = html.indexOf(marker);
    if (i < 0) return null;
    const start = html.indexOf("{", i);
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let j = start; j < html.length; j++) {
      const c = html[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { if (--depth === 0) return html.slice(start, j + 1); }
    }
    return null;
  };

  const decodeEntities = (s) =>
    String(s || "")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

  // YouTube — reads the video title, and the FULL spoken transcript. It first
  // uses an open transcript panel; if none is open it AUTOMATICALLY fetches the
  // video's caption track (the same captions YouTube itself serves). It never
  // touches the protected video/audio stream. Videos with no captions yield no
  // text (there is nothing spoken that was captioned to read).
  const youtube = {
    id: "youtube",
    name: "YouTube",
    canHandle: () => /(^|\.)youtube\.com$/.test(location.hostname),
    getTitle: () => readText(document.querySelector("h1.ytd-watch-metadata, h1.title")) || document.title,
    getSelectedText: selection,

    // Fast path: transcript panel already open on the page.
    getTranscriptFromPanel() {
      const segs = document.querySelectorAll("ytd-transcript-segment-renderer .segment-text, .ytd-transcript-segment-renderer .segment-text");
      if (!segs.length) return "";
      return clean(Array.from(segs).map((s) => s.innerText).join(" "));
    },

    // Auto path: fetch the watch page HTML, read the caption track URL from
    // ytInitialPlayerResponse, then fetch the caption track and join its text.
    async fetchCaptions() {
      try {
        const vid = new URL(location.href).searchParams.get("v");
        const watchUrl = vid ? `https://www.youtube.com/watch?v=${vid}` : location.href;
        const html = await (await fetch(watchUrl, { credentials: "include" })).text();
        const raw = sliceJson(html, "ytInitialPlayerResponse");
        if (!raw) return "";
        const pr = JSON.parse(raw);
        const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        if (!tracks.length) return "";
        const track = tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith("en")) || tracks[0];
        const base = track?.baseUrl;
        if (!base) return "";
        // Prefer JSON3 (clean segments); fall back to the default XML format.
        try {
          const j = await (await fetch(base + "&fmt=json3", { credentials: "include" })).json();
          const txt = (j.events || []).map((e) => (e.segs || []).map((s) => s.utf8 || "").join("")).join(" ");
          if (clean(txt)) return clean(txt).slice(0, CAP);
        } catch { /* fall through to XML */ }
        const xml = await (await fetch(base, { credentials: "include" })).text();
        const parts = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).map((m) => decodeEntities(m[1]));
        return clean(parts.join(" ")).slice(0, CAP);
      } catch {
        return "";
      }
    },

    async getTranscript() {
      const panel = this.getTranscriptFromPanel();
      if (panel) return panel.slice(0, CAP);
      return await this.fetchCaptions();
    },

    // Description only — the transcript is delivered via getTranscript() (async).
    getVisibleContent() {
      const desc = document.querySelector("#description-inline-expander, #description, ytd-text-inline-expander");
      return readText(desc).slice(0, CAP);
    },
    getMeta() {
      return meta("YouTube", { title: this.getTitle(), contentType: "video" });
    },
  };

  // Platform stubs: page structures differ and change often, so until a real,
  // tested adapter exists these fall back to visible/selected text. This keeps
  // the Companion useful without guessing fragile selectors.
  const stub = (id, name, hostRe) => ({
    id,
    name,
    canHandle: () => hostRe.test(location.hostname),
    getTitle: () => document.title || "",
    getSelectedText: selection,
    getTranscript: () => "",
    getVisibleContent: generic.getVisibleContent,
    getMeta() {
      return meta(name, { title: document.title });
    },
  });

  const adapters = [
    youtube,
    stub("pw", "Physics Wallah", /(^|\.)pw\.live$/),
    stub("unacademy", "Unacademy", /(^|\.)unacademy\.com$/),
    stub("udemy", "Udemy", /(^|\.)udemy\.com$/),
    stub("coursera", "Coursera", /(^|\.)coursera\.org$/),
    generic, // must stay last
  ];

  const pick = () => adapters.find((a) => { try { return a.canHandle(); } catch { return false; } }) || generic;

  // Expose to the sibling content script (shared isolated-world global).
  self.__MSGCompanion = { adapters, pick, generic };
})();
