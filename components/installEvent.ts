"use client";

import { useEffect, useState } from "react";

/**
 * The one `beforeinstallprompt` this page will ever get, held where more than
 * one thing can use it.
 *
 * Chrome and Edge fire it once, early, and it is gone if nobody calls
 * `preventDefault()` on it. It used to be captured inside the banner, which
 * meant the banner was the only thing that could ever install the app: once it
 * had been shown and dismissed, the Settings page could do nothing but describe
 * the address bar and hope. Since the banner now appears at most once in a
 * device's life, that would leave the app effectively uninstallable from inside
 * itself, which is the opposite of the point.
 *
 * So the event is caught at module level and kept, and both the banner and the
 * button in Settings read it from here.
 */
export interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let held: InstallEvent | null = null;
const listeners = new Set<(event: InstallEvent | null) => void>();

function publish(event: InstallEvent | null) {
  held = event;
  for (const listener of listeners) listener(event);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    publish(event as InstallEvent);
  });
  // Installed elsewhere, or from this event: there is nothing left to offer.
  window.addEventListener("appinstalled", () => publish(null));
}

/** The held event, or null when this browser has not offered one. */
export function useInstallEvent(): InstallEvent | null {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    setEvent(held);
    listeners.add(setEvent);
    return () => {
      listeners.delete(setEvent);
    };
  }, []);

  return event;
}

/** Runs the browser's own install flow, and forgets the spent event. */
export async function runInstall(event: InstallEvent): Promise<void> {
  try {
    await event.prompt();
    await event.userChoice;
  } finally {
    publish(null);
  }
}

/** Already installed: opened from a home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone Safari, which has no install event and needs the Share menu spelled out. */
export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}
