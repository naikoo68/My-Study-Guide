import { createContext, useContext, useState, useCallback, lazy, Suspense } from "react";

// The modals are admin-only and fairly heavy, so load them on demand (keeps the
// initial bundle small for public/student visitors who never open them).
const AiGenerate = lazy(() => import("../components/admin/AiGenerate"));
const AiImport = lazy(() => import("../components/admin/AiImport"));

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
    </AiModalContext.Provider>
  );
}
