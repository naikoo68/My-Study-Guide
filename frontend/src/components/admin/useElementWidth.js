import { useLayoutEffect, useState } from "react";

// Width of an element, kept up to date (for scaling the live preview).
export default function useElementWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // offsetWidth = the width in the page's own CSS pixels (correct under the site zoom).
    const update = () => setW(el.offsetWidth);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  });
  return w;
}
