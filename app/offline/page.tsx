import { CloudOff } from "lucide-react";
import { Mascot } from "@/components/brand";

export const metadata = { title: "Offline" };

/**
 * The service worker's fallback for a page that was never visited while online.
 * Deliberately static: it must render from the cache with no data of any kind.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <Mascot size={58} mood="thinking" animate={false} />
      <span
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{ background: "var(--butter-soft)", color: "var(--butter-ink)" }}
      >
        <CloudOff size={13} aria-hidden /> Offline
      </span>
      <h1 className="est text-2xl font-bold" style={{ color: "var(--ink)" }}>
        This screen needs a connection
      </h1>
      <p className="text-base" style={{ color: "var(--ink-2)" }}>
        Screens you have already opened still work offline, and so does reviewing, anything you
        grade while offline is saved on this device and sent the moment you reconnect.
      </p>
      <a
        href="/review"
        className="grad-accent press mt-2 rounded-full px-6 py-3 text-base font-semibold"
        style={{ color: "var(--accent-ink)", boxShadow: "var(--shadow-accent)" }}
      >
        Go to review
      </a>
    </main>
  );
}
