"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/Button";

/**
 * Something threw on the server.
 *
 * The message is shown rather than hidden: this is a study tool someone is
 * running for themselves, and "something went wrong" with no detail turns a
 * fixable configuration problem — usually a missing DATABASE_URL — into a
 * mystery. It is deliberately calm about it, and never suggests the learner has
 * lost anything, because they have not: the review log is only ever appended to.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <TriangleAlert size={28} aria-hidden style={{ color: "var(--hard)" }} />
      <h1 className="est text-[26px] font-bold" style={{ color: "var(--ink)" }}>
        That screen didn&rsquo;t load
      </h1>
      <p className="text-[14.5px]" style={{ color: "var(--ink-2)" }}>
        Nothing has been lost, your deck and review history are untouched. Trying again usually
        works; if it keeps happening, the message below is the useful part.
      </p>
      <code
        className="max-w-full overflow-x-auto rounded-[var(--r)] px-3 py-2 text-left text-[12px]"
        style={{ background: "var(--raised)", color: "var(--ink-2)" }}
      >
        {error.message || "Unknown error"}
        {error.digest ? ` (${error.digest})` : ""}
      </code>
      <div className="mt-2 flex gap-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <ButtonLink href="/">Back to Today</ButtonLink>
      </div>
    </main>
  );
}
