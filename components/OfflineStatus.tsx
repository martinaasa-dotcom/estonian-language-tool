"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { gradeCards } from "@/app/actions";
import { flushQueue, queueSize } from "@/lib/offline/queue";

/**
 * Registers the service worker, and tells the truth about the connection.
 *
 * The banner appears for two different situations, and says which one it is:
 * the browser is offline right now, or it is back but grades from an offline
 * session are still waiting to be sent. Silence in the second case would be the
 * worst outcome — the learner would have no way of knowing whether the evening
 * they just spent reviewing had actually been recorded.
 */
export function OfflineStatus() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // Registration failing is not worth surfacing: everything still works,
      // it just will not open without a connection.
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const sync = () => {
      setOffline(!navigator.onLine);
      setPending(queueSize());
    };
    sync();

    const flush = async () => {
      if (!navigator.onLine || queueSize() === 0) { sync(); return; }
      setSending(true);
      const { remaining } = await flushQueue((batch) => gradeCards(batch));
      setPending(remaining);
      setSending(false);
      setOffline(false);
    };

    window.addEventListener("online", flush);
    window.addEventListener("offline", sync);
    const timer = window.setInterval(sync, 15_000);
    void flush();

    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", sync);
      window.clearInterval(timer);
    };
  }, []);

  if (!offline && pending === 0) return null;

  return (
    <div
      className="fixed bottom-16 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-[12.5px] md:bottom-4"
      role="status"
      style={{
        borderColor: "var(--rule)",
        background: offline ? "var(--hard-soft)" : "var(--accent-soft)",
        color: offline ? "var(--hard)" : "var(--accent)",
        boxShadow: "var(--shadow)",
      }}
    >
      {offline ? <CloudOff size={14} aria-hidden /> : <RefreshCw size={14} aria-hidden className={sending ? "animate-spin" : ""} />}
      {offline
        ? pending > 0
          ? `Offline — ${pending} grade${pending === 1 ? "" : "s"} saved here, review keeps working`
          : "Offline — reviewing still works, grades are saved on this device"
        : `Sending ${pending} saved grade${pending === 1 ? "" : "s"}…`}
    </div>
  );
}
