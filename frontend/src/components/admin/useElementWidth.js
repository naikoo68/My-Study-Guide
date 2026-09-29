import { useLayoutEffect, useState } from "react";

// Width of an element, kept up to date (for scaling the live preview).
export default function useElementWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setW(el.getBoundingClientRect().width);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  });
  return w;
}
