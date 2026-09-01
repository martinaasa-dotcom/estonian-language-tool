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
  /**
   * Drains the outbox now and resolves when it has stopped, whether or not
   * everything landed. Sign-out calls this first, because a grade still
   * queued belongs to the person leaving and the device is about to forget
   * them (`lib/offline/forget.ts`).
   */
  flush: () => Promise<void>;
}

const Context = createContext<OfflineState>({
  online: true, pending: 0, refresh: () => {}, flush: async () => {},
});

/** How often to retry a stuck queue. Long enough to be invisible, short enough to matter. */
const RETRY_INTERVAL_MS = 30_000;

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
    // Cheap guard so the retry interval costs nothing in the normal case.
    if ((await outboxSize()) === 0) { setPending(0); return; }
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

    // Registered in production, and in development only when explicitly asked
    // for. A service worker in dev otherwise serves stale code and wastes an
    // afternoon; without the opt-in, the offline path could not be exercised in
    // a browser at all, which is worse.
    const wantsServiceWorker =
      process.env.NODE_ENV === "production" ||
      process.env.NEXT_PUBLIC_ENABLE_SW === "1";

    if ("serviceWorker" in navigator && wantsServiceWorker) {
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

    // A retry while nothing else is happening. The events above cover the common
    // cases — a connection returning, a tab coming back — but a sync that fails
    // for any other reason (a server hiccup, a deploy mid-request) would
    // otherwise sit until one of them fires, which for someone who never leaves
    // the tab could be never. Cheap because it does nothing when the queue is
    // empty.
    const retry = setInterval(() => {
      if (navigator.onLine) void sync();
    }, RETRY_INTERVAL_MS);

    return () => {
      clearInterval(retry);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Deliberately once: `sync` re-creates on every state change, and re-running
    // this would register duplicate listeners on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Context.Provider value={{ online, pending, refresh, flush: sync }}>
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
      ? `Offline · ${pending} grade${pending === 1 ? "" : "s"} saved on this device`
      : "Offline · review still works"
    : `Syncing ${pending} grade${pending === 1 ? "" : "s"}`;

  return (
    <div
      role="status"
      aria-live="polite"
      /* `bottom-notice` clears the mobile dock by a measured height rather than
         a typed offset, so this cannot drift out from under the nav bar. */
      className="bottom-notice fixed inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm md:left-auto md:right-3 md:inset-x-auto md:rounded-md"
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
