"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/Button";
import { isIosSafari, isStandalone, runInstall, useInstallEvent } from "@/components/installEvent";
import {
  dayKey,
  markDismissed,
  markOffered,
  readMemory,
  rememberDay,
  shouldOffer,
  writeMemory,
} from "@/lib/install/offer";

const MEMORY_KEY = "kodukeel:install";
/** The flag this used to keep. Read once, so an old dismissal is still honored. */
const LEGACY_KEY = "kodukeel:install-dismissed";

/** iOS has no install event, so the hint waits for somebody to settle into the page. */
const IOS_HINT_DELAY_MS = 20_000;

/**
 * "Add to home screen", offered once in a device's life and then never again.
 *
 * Installed, Kodukeel opens straight into review and keeps working without a
 * connection, which is the difference between a habit and a browser tab
 * somebody means to open. That is worth saying once. It is not worth saying
 * twice, and a banner that reappears on every visit is the kind of thing people
 * come to dislike an app for, so the rule is in `lib/install/offer.ts` with its
 * own tests: the offer waits for a third day of use, is spent the moment it is
 * drawn rather than when it is answered, and an X ends it permanently.
 *
 * Nothing replaces it afterwards. The reminder that this app installs lives in
 * Settings, under "Install it", with a button that works whenever the browser
 * will allow one. Somebody who wants it can find it on the day they want it.
 */
export function InstallPrompt() {
  const event = useInstallEvent();
  const [iosHint, setIosHint] = useState(false);
  const [open, setOpen] = useState(false);

  // One pass at mount: today is recorded, and the offer is either due or not.
  useEffect(() => {
    if (isStandalone()) return;

    let memory;
    try {
      const legacy = window.localStorage.getItem(LEGACY_KEY) === "1";
      memory = rememberDay(readMemory(window.localStorage.getItem(MEMORY_KEY), legacy), dayKey(new Date()));
      window.localStorage.setItem(MEMORY_KEY, writeMemory(memory));
    } catch {
      // Storage blocked. Better to stay quiet forever than to nag every load.
      return;
    }

    if (!isIosSafari()) return;
    if (!shouldOffer(memory, { standalone: false, canInstall: true })) return;
    const timer = window.setTimeout(() => setIosHint(true), IOS_HINT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Chrome and Edge hand over an event, which can arrive after that first pass.
  useEffect(() => {
    if (!event || isStandalone()) return;
    try {
      const memory = readMemory(
        window.localStorage.getItem(MEMORY_KEY),
        window.localStorage.getItem(LEGACY_KEY) === "1",
      );
      if (!shouldOffer(memory, { standalone: false, canInstall: true })) return;
      setOpen(true);
    } catch {
      // Same as above: no memory means no offer.
    }
  }, [event]);

  // Shown is spent, whatever happens next. Somebody who ignores it is answering too.
  useEffect(() => {
    if (!open && !iosHint) return;
    try {
      const memory = readMemory(window.localStorage.getItem(MEMORY_KEY));
      window.localStorage.setItem(MEMORY_KEY, writeMemory(markOffered(memory)));
    } catch {
      // Nothing to do.
    }
  }, [open, iosHint]);

  const dismiss = () => {
    try {
      const memory = readMemory(window.localStorage.getItem(MEMORY_KEY));
      window.localStorage.setItem(MEMORY_KEY, writeMemory(markDismissed(memory)));
    } catch {
      // Nothing to do; it simply may ask again on this device.
    }
    setOpen(false);
    setIosHint(false);
  };

  if (!open && !iosHint) return null;

  return (
    <div
      className="bottom-notice pop-in fixed left-1/2 z-[85] flex w-[min(94vw,420px)] -translate-x-1/2 items-start gap-3 rounded-[var(--r-lg)] border p-4"
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
        <p className="text-base font-bold" style={{ color: "var(--ink)" }}>
          Keep Kodukeel on your home screen
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
          {iosHint ? (
            <>
              Tap <Share size={12} className="inline" aria-label="the Share button" /> then{" "}
              <strong>Add to Home Screen</strong>. It opens straight into review and works offline.
            </>
          ) : (
            "It opens straight into review, and review works offline too."
          )}
        </p>
        <p className="mt-1.5 text-2xs" style={{ color: "var(--ink-3)" }}>
          Asked once. It is in Settings whenever you want it.
        </p>
        {open && event && (
          <Button
            variant="primary"
            className="mt-3"
            onClick={() => {
              void runInstall(event).finally(dismiss);
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
