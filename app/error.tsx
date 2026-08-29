"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/Button";

/**
 * The error state required of every view by docs/08-ux-ia-a11y.md §4, applied
 * once at the route level so a view cannot ship without one.
 *
 * `digest` is Next.js's server-side correlation id: the real message and stack
 * stay on the server, and this is the only handle a learner can quote. Showing
 * it is the difference between a bug report we can act on and "it broke".
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-5 py-20 text-center">
      <h1 className="est text-[26px] font-bold" style={{ color: "var(--ink)" }}>
        That did not load
      </h1>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14.5px]" style={{ color: "var(--ink-2)" }}>
        Something on this page failed. Your deck and your review history are untouched — nothing
        is saved by loading a page.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <ButtonLink href="/">Back to Today</ButtonLink>
      </div>

      {error.digest && (
        <p className="mt-8 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Reference <code className="tnum">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
