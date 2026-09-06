import { createContext, useContext, useState, useCallback, useEffect, lazy, Suspense } from "react";
import { contentService, practiceService } from "../services";
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
    // The saved destination tells us whether this batch belongs to the content
    // library (sessionId/quizId) or to My Practice (itemId/streamId/kind).
    const isPractice = !!(snap.itemId || snap.streamId || snap.kind);
    const leaf = isPractice ? (snap.kind === "test" ? "test" : "quiz") : "quiz";

    // Insert the reopened batch. Supports CREATING a new target (when the user
    // picks "New quiz/test" and names it) as well as inserting into the existing
    // snapshotted one — for BOTH content and practice — so a resumed session can
    // always be saved somewhere. Previously this only handled a content quiz and
    // REQUIRED an existing quizId, so a practice resume (or a session whose quiz
    // no longer existed) had NO way to insert — the questions looked stuck/lost.
    const recoveryUpload = async (questions, opts = {}) => {
      const d = opts.dest || snap || {};
      if (isPractice) {
        let itemId = opts.existingTargetId || d.itemId;
        if (opts.newTarget) {
          const name = String(opts.newTarget.name || "").trim();
          if (!name) throw new Error(`Enter a name for the new ${leaf}.`);
          const created = await practiceService.createItem({
            name,
            practiceStream: d.streamId,
            practiceSubject: d.subjectId,
            practiceTopic: d.topicId,
            practiceKind: d.kind || "quiz",
          });
          if (!created?._id) throw new Error(`Could not create the new ${leaf}.`);
          itemId = created._id;
        }
        if (!itemId) throw new Error(`Choose “New ${leaf}” and enter a name to save these questions.`);
        return contentService.bulkQuestions(questions, { testSeries: itemId, section: d.section || "" });
      }
      // Content library
      let quizId = opts.existingTargetId || d.quizId;
      if (opts.newTarget) {
        const title = String(opts.newTarget.name || "").trim();
        if (!title) throw new Error("Enter a name for the new quiz.");
        if (!d.subjectId || !d.sessionId) throw new Error("Reopen the generator from the topic to insert these — your questions are safe and restored.");
        const created = await contentService.createQuiz({ title, subject: d.subjectId, session: d.sessionId });
        if (!created?._id) throw new Error("Could not create the new quiz.");
        quizId = created._id;
      }
      if (!quizId) throw new Error("Choose “New quiz” and enter a name to save these questions.");
      return contentService.bulkQuestions(questions, { subject: d.subjectId, session: d.sessionId, quiz: quizId });
    };

    setGenProps({
      title: "Generate Questions with AI",
      // Show the destination picker so you can create/choose a real quiz to
      // insert into — without this, a resumed batch had no "New quiz" option.
      allowNewTarget: true,
      newLeafLabel: leaf,
      defaultDest: "new", // default to a fresh target (safest for a restored batch)
      defaultTopic: label || "",
      onUpload: recoveryUpload,
      onGenerationStart: () => snap, // a Resume keeps targeting the same place
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
