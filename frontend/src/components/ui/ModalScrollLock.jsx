import { useEffect } from "react";

// Site-wide background-scroll lock for modals/dialogs.
//
// Every modal in the app renders a full-screen backdrop with the same Tailwind
// signature: `fixed inset-0 … bg-black/<opacity>`. Rather than wiring a lock
// into each of the ~60 modals by hand (easy to forget on the next new one),
// this single root-mounted watcher observes the DOM and locks <body> scroll
// whenever at least one such backdrop is on screen — so scrolling inside ANY
// dialog never moves the page behind it. It restores the page the instant the
// last modal closes. Because it keys off the shared backdrop markup, new modals
// get the behaviour automatically with no extra code.
export default function ModalScrollLock() {
  useEffect(() => {
    const body = document.body;
    let locked = false;
    let prevOverflow = "";

    // A modal is open when a full-screen `fixed inset-0` element also carries a
    // `bg-black/…` backdrop class (the shared modal-overlay signature). We check
    // the raw class string so Tailwind's slash opacity (bg-black/50, /60, …) all
    // match without needing to escape the "/" in a CSS selector.
    const anyModalOpen = () => {
      const overlays = document.querySelectorAll(".fixed.inset-0");
      for (const el of overlays) {
        const cls = el.getAttribute("class") || "";
        if (cls.includes("bg-black/")) return true;
      }
      return false;
    };

    const apply = () => {
      const open = anyModalOpen();
      if (open && !locked) {
        prevOverflow = body.style.overflow;
        body.style.overflow = "hidden";
        locked = true;
      } else if (!open && locked) {
        body.style.overflow = prevOverflow;
        locked = false;
      }
    };

    // Coalesce bursts of DOM mutations (a modal mounting adds many nodes) into a
    // single check per animation frame.
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    };

    const obs = new MutationObserver(schedule);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"], // also catch a modal that toggles its backdrop class
    });

    apply(); // lock immediately if a modal is already open when this mounts

    return () => {
      obs.disconnect();
      if (locked) body.style.overflow = prevOverflow;
    };
  }, []);

  return null;
}
