"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/Button";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "kodukeel:install-dismissed";

/**
 * "Add to home screen", offered once and never nagged.
 *
 * Installed, Kodukeel opens straight into review and keeps working without a
 * connection — which is the difference between a study habit and a browser tab
 * someone means to open. But an install banner that reappears is an advert, so
 * this shows once per device and remembers a dismissal forever.
 *
 * Two paths, because the platforms differ: Chrome and Edge fire
 * `beforeinstallprompt` and can be installed with a button; iOS Safari has no
 * such event and needs the Share → Add to Home Screen instruction spelled out.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Storage blocked: better to stay quiet than to nag every load.
      dismissed = true;
    }
    if (dismissed) return;

    // Already installed — nothing to offer.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires that event, so it is detected and told what to tap.
    const ua = window.navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
      const timer = window.setTimeout(() => setIosHint(true), 20_000);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", onPrompt);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do; it simply may ask again on this device.
    }
    setEvent(null);
    setIosHint(false);
  };

  if (!event && !iosHint) return null;

  return (
    <div
      className="pop-in fixed bottom-20 left-1/2 z-[85] flex w-[min(94vw,420px)] -translate-x-1/2 items-start gap-3 rounded-[var(--r-lg)] border p-4 md:bottom-5"
      role="dialog"
      aria-label="Install Kodukeel"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
      >
        <Download size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="est text-[15.5px] font-bold" style={{ color: "var(--ink)" }}>
          Keep Kodukeel on your home screen
        </p>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
          {iosHint ? (
            <>
              Tap <Share size={12} className="inline" aria-label="the Share button" /> then{" "}
              <strong>Add to Home Screen</strong>. It opens straight into review and works offline.
            </>
          ) : (
            "It opens straight into review, and reviewing keeps working with no connection."
          )}
        </p>
        {event && (
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => {
              void event.prompt().then(() => event.userChoice).finally(dismiss);
            }}
          >
            Install
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
        style={{ color: "var(--ink-3)" }}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
