// The long-video render queue (one video is made at a time): what is being
// made now and what waits behind it. Polls every 4 s while something is in
// the queue, every 20 s when it's empty. `onFinished` fires when a video
// leaves the queue (so lists can reload and show its result). `refresh()`
// checks again right away (e.g. after Stop).
import { useCallback, useEffect, useRef, useState } from "react";
import { youtubeService } from "../../services";

export default function useVideoQueue({ onFinished } = {}) {
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const finishedRef = useRef(onFinished);
  useEffect(() => { finishedRef.current = onFinished; }, [onFinished]);
  const ids = useRef(new Set());

  useEffect(() => {
    let alive = true;
    let timer = null;
    const poll = async () => {
      let busy = false;
      try {
        const r = await youtubeService.longVideoQueue();
        if (!alive) return;
        const list = Array.isArray(r?.queue) ? r.queue : [];
        const now = new Set(list.map((j) => j.id).filter(Boolean));
        const left = [...ids.current].some((id) => !now.has(id));
        ids.current = now;
        setQueue(list);
        setError("");
        if (left) finishedRef.current?.();
        busy = list.length > 0;
      } catch (e) {
        if (alive) setError(e.message || "Couldn't load the video queue.");
      }
      if (alive) timer = setTimeout(poll, busy ? 4000 : 20000);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { queue, error, refresh };
}
