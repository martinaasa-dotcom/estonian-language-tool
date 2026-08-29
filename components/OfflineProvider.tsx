"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { replayGrades } from "@/app/actions";
import { dropFromOutbox, outboxSize, readOutbox } from "@/lib/offline/db";
import { nextBatch, withoutSettled } from "@/lib/offline/outbox";

interface OfflineState {
  online: boolean;
  /** Grades taken on this device that the server has not acknowledged. */
  pending: number;
  /** Re-counts the outbox after a grade is queued. */
  refresh: () => void;
}

const Context = createContext<OfflineState>({ online: true, pending: 0, refresh: () => {} });

export const useOffline = () => useContext(Context);

/**
 * Registers the service worker, tracks connectivity, and drains the outbox.
 *
 * `navigator.onLine` is famously optimistic — it reports true for a captive
 * portal or a dead uplink — so it is treated as a hint for the banner only.
 * What actually decides whether work is pending is whether a replay succeeded.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    void outboxSize().then(setPending);
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      // Drain in batches until the queue is empty or a batch fails to land.
      for (let pass = 0; pass < 20; pass++) {
        const queued = await readOutbox();
        if (queued.length === 0) break;

        const batch = nextBatch(queued);
        const result = await replayGrades(batch.map((g) => ({
          id: g.id, cardId: g.cardId, rating: g.rating,
          durationMs: g.durationMs, reviewedAt: g.reviewedAt,
        })));

        if (!result.ok) break;
        await dropFromOutbox(result.settled);
        setOnline(true);

        // Nothing settled and nothing left to try means the batch is stuck;
        // stop rather than spin.
        if (withoutSettled(batch, result.settled).length === batch.length) break;
      }
    } catch {
      // Still offline, or the action could not be reached. The outbox is
      // durable, so this simply happens again on the next `online` event.
      setOnline(false);
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [syncing, refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // No service worker means no offline review. Everything else is fine,
        // so this is not worth telling anyone about.
      });
    }

    const goOnline = () => { setOnline(true); void sync(); };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // A tab restored from the background may have missed the online event.
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onVisible);

    void sync();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Deliberately once: `sync` re-creates on every state change, and re-running
    // this would register duplicate listeners on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Context.Provider value={{ online, pending, refresh }}>
      {children}
      <OfflineBanner online={online} pending={pending} syncing={syncing} />
    </Context.Provider>
  );
}

/**
 * Shown only when there is something to say. A permanent connectivity indicator
 * is noise; "3 grades waiting to sync" is information.
 */
function OfflineBanner({ online, pending, syncing }: {
  online: boolean; pending: number; syncing: boolean;
}) {
  if (online && pending === 0) return null;

  const label = !online
    ? pending > 0
      ? `Offline — ${pending} grade${pending === 1 ? "" : "s"} saved on this device`
      : "Offline — review still works"
    : `Syncing ${pending} grade${pending === 1 ? "" : "s"}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-[13px] md:bottom-3 md:left-auto md:right-3 md:inset-x-auto md:rounded-md"
      style={{
        background: online ? "var(--accent-soft)" : "var(--raised)",
        color: online ? "var(--accent)" : "var(--ink-2)",
        boxShadow: "var(--shadow)",
      }}
    >
      {online
        ? <RefreshCw size={13} aria-hidden className={syncing ? "animate-spin" : undefined} />
        : <CloudOff size={13} aria-hidden />}
      <span>{label}</span>
    </div>
  );
}
