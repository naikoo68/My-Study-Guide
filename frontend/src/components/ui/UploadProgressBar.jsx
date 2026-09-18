// Site-wide upload progress indicator. Mounted once at the app root; it shows a
// thin top bar + a "Uploading NN%" pill whenever ANY upload is in flight
// (anywhere in the app), driven by the shared uploadProgress store. Hidden when
// nothing is uploading.
import { useEffect, useState } from "react";
import { subscribeUploads } from "../../lib/uploadProgress";

export default function UploadProgressBar() {
  const [{ count, pct }, setState] = useState({ count: 0, pct: 0 });
  useEffect(() => subscribeUploads(setState), []);
  if (!count) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, pointerEvents: "none" }} aria-live="polite" aria-label={`Uploading ${pct}%`}>
      <div style={{ height: 3, background: "rgba(79,70,229,0.18)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#4f46e5", transition: "width .2s ease" }} />
      </div>
      <div style={{ position: "absolute", top: 8, right: 12, background: "#4f46e5", color: "#fff", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
        Uploading {pct}%{count > 1 ? ` · ${count} files` : ""}
      </div>
    </div>
  );
}
