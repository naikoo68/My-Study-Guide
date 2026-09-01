import { createContext, useContext, useState, useCallback, useEffect, lazy, Suspense } from "react";
import { contentService } from "../services";
import { getActiveGenJob } from "../lib/activeGenJob";

// The modals are admin-only and fairly heavy, so load them on demand (keeps the
// initial bundle small for public/student visitors who never open them).
const AiGenerate = lazy(() => import("../components/admin/AiGenerate"));
const AiImport = lazy(() => import("../components/admin/AiImport"));
// The floating pill that re-attaches to a background generation after a reload.
const ActiveGenerationPill = lazy(() => import("../components/admin/ActiveGenerationPill"));

// App-level host for the AI "Generate with AI" and "Import from Web" modals.
//
// These modals used to be rendered INSIDE each admin page, so minimizing one and
// then navigating to another section unmounted the page — and the minimized
// pill (and the running background generation) vanished with it. Hosting a
// single instance of each here, ABOVE the router, keeps a minimized/background
// job alive and its pill visible no matter where you navigate.
//
// Pages open a modal by calling openAiGenerate(props) / openAiImport(props) with
// exactly the props they used to pass as JSX (title, onUpload, onGenerationStart,
// coverageQuestions, …). The props are captured at open time; the onUpload /
// onGenerationStart closures keep targeting the destination the generation was
// started for (via the destination snapshot), even after the originating page
// has unmounted.
const AiModalContext = createContext(null);

export function useAiModal() {
  const ctx = useContext(AiModalContext);
  if (!ctx) throw new Error("useAiModal must be used within <AiModalProvider>");
  return ctx;
}

export function AiModalProvider({ children }) {
  const [genProps, setGenProps] = useState(null); // props for AiGenerate, or null when closed
  const [impProps, setImpProps] = useState(null); // props for AiImport, or null when closed

  const openAiGenerate = useCallback((props) => setGenProps(props || {}), []);
  const openAiImport = useCallback((props) => setImpProps(props || {}), []);

  // Is there a background generation job to re-attach to? Checked on mount and
  // whenever the tab regains focus (returning from another app) or on a short
  // interval, so the floating pill reappears after a full page reload — even
  // though the React state that started the job is long gone.
  const [hasActiveJob, setHasActiveJob] = useState(() => !!getActiveGenJob());
  useEffect(() => {
    const check = () => setHasActiveJob(!!getActiveGenJob());
    check();
    const id = setInterval(check, 5000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  // Reopen the full generator from the floating pill after a reload. The saved
  // destination snapshot rebuilds a working uploader so Insert still lands in the
  // right quiz, and the target name rebuilds the checkpoint key so the generated
  // questions are restored for review. (Content-library destinations only — for
  // other targets the pill still restores the questions; reopen from that page
  // to insert.)
  const openFromPill = useCallback(({ targetName, label, dest } = {}) => {
    const snap = dest || {};
    const recoveryUpload = async (questions, opts = {}) => {
      const d = opts.dest || snap || {};
      if (!d.quizId) throw new Error("Reopen the generator from the quiz to insert these here — your generated questions are safe and restored.");
      return contentService.bulkQuestions(questions, { subject: d.subjectId, session: d.sessionId, quiz: d.quizId });
    };
    setGenProps({
      title: "Generate Questions with AI",
      currentTargetName: targetName || "",
      defaultTopic: label || "",
      onUpload: recoveryUpload,
    });
  }, []);

  // Closing runs the page-supplied onClose cleanup first (it may reset page
  // state such as aiTopicLevel / gapPrefill / forceSection), then unmounts.
  const closeGen = useCallback(() => {
    setGenProps((p) => { try { p?.onClose?.(); } catch { /* page may be unmounted */ } return null; });
  }, []);
  const closeImp = useCallback(() => {
    setImpProps((p) => { try { p?.onClose?.(); } catch { /* page may be unmounted */ } return null; });
  }, []);

  return (
    <AiModalContext.Provider value={{ openAiGenerate, openAiImport }}>
      {children}
      {/* Mounted only while open (props !== null). A minimized generation keeps
          props set — only closeGen/closeImp clears them — so the modal stays
          mounted (pill visible, job running) across route changes. `open` and
          `onClose` are set AFTER the spread so the provider always owns them. */}
      {genProps && (
        <Suspense fallback={null}>
          <AiGenerate {...genProps} open onClose={closeGen} />
        </Suspense>
      )}
      {impProps && (
        <Suspense fallback={null}>
          <AiImport {...impProps} open onClose={closeImp} />
        </Suspense>
      )}
      {/* Floating progress pill for a background generation — shown ONLY when no
          full modal is open (the open generator manages its own minimized pill),
          so there's never a double pill or double polling. This is what survives
          a reload: it re-attaches to the running job via the localStorage
          pointer and keeps the progress visible when you return to the tab. */}
      {!genProps && !impProps && hasActiveJob && (
        <Suspense fallback={null}>
          <ActiveGenerationPill onOpen={openFromPill} />
        </Suspense>
      )}
    </AiModalContext.Provider>
  );
}
