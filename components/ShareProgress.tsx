"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/Button";

/**
 * Share the progress card.
 *
 * On a phone this hands the image to the system share sheet, which is where
 * anyone actually shares anything. Everywhere else it opens the PNG in a tab to
 * save. Nothing is posted anywhere by the app itself — the card is generated
 * for the signed-in learner and handed to them.
 */
export function ShareProgress() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/share");
      if (!response.ok) throw new Error("could not render");
      const blob = await response.blob();
      const file = new File([blob], "kodukeel.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Estonian progress" });
      } else {
        /*
          A blob URL rather than a download attribute: some browsers block
          programmatic downloads, and every one of them can open a tab.

          Revoked on a timer rather than straight after `open`, and that is
          the whole difficulty: the new tab has not fetched the url yet when
          this line returns, so releasing it immediately hands somebody a
          blank tab. Held for a minute, which is far longer than any tab
          takes to load an image it was opened for, and then let go. Without
          this the card stayed in memory for as long as the tab that made it
          was open, and sharing twice held two.
        */
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      setError("Could not build the card just now. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <>
      <Button onClick={() => void share()} disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Share2 size={15} aria-hidden />}
        {busy ? "Building…" : "Share your progress"}
      </Button>
      {error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--again-ink)" }}>{error}</p>}
    </>
  );
}
