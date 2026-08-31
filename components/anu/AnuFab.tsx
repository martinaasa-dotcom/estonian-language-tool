"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Mascot } from "@/components/brand";

/*
  The panel (the conversation, the starters, the sentence check, the
  suggest-a-fix form reachable from inside a reply) is real weight: markup and
  logic most sessions never touch, since most page loads never open Anu at
  all. Loaded on first open rather than bundled with every signed-in route,
  the same fix as `components/CommandPalette.tsx` next door.
*/
const AnuPanel = lazy(() => import("./AnuPanel").then((m) => ({ default: m.AnuPanel })));

/**
 * Anu, reachable from anywhere: a button in the bottom right corner of every
 * signed-in screen, opening the same conversation the `/tutor` page shows.
 *
 * Mounted once in `app/(app)/layout.tsx`, which the App Router does not remount
 * on client-side navigation, so the open panel and the conversation inside it
 * survive moving between pages exactly the way the rest of the app's global
 * chrome (the command palette, the install prompt) already does. Hidden on
 * `/tutor` itself, which renders the same conversation full-page: without that,
 * a learner there would see two copies of one exchange and two boxes to type
 * into.
 *
 * The panel stays mounted, hidden rather than unmounted, once it has been
 * opened once: closing it must not lose a reply mid-stream or throw away a
 * conversation that is about to be refetched from the database anyway.
 */
export function AnuFab({
  configured, readerCanConfigure,
}: {
  configured: boolean;
  readerCanConfigure: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname === "/tutor") return null;

  return (
    <div className="bottom-notice fixed right-[max(1rem,env(safe-area-inset-right))] z-[90] flex flex-col items-end">
      {loaded && (
        <div hidden={!open}>
          <Suspense fallback={null}>
            <AnuPanel
              configured={configured}
              readerCanConfigure={readerCanConfigure}
              onClose={() => setOpen(false)}
            />
          </Suspense>
        </div>
      )}
      {!open && (
        <button
          type="button"
          onClick={() => { setLoaded(true); setOpen(true); }}
          aria-label="Ask Anu"
          title="Ask Anu"
          className="press lift flex h-14 w-14 items-center justify-center rounded-full border"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
        >
          <Mascot size={32} />
        </button>
      )}
    </div>
  );
}
