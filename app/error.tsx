"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/Button";
import { SuggestFix } from "@/components/SuggestFix";

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
      <TriangleAlert size={28} aria-hidden style={{ color: "var(--hard-ink)" }} />
      <h1 className="est text-2xl font-bold" style={{ color: "var(--ink)" }}>
        That screen didn&rsquo;t load
      </h1>
      <p className="text-base" style={{ color: "var(--ink-2)" }}>
        Nothing has been lost, your deck and review history are untouched. Trying again usually
        works; if it keeps happening, the message below is the useful part.
      </p>
      <code
        className="max-w-full overflow-x-auto rounded-[var(--r)] px-3 py-2 text-left text-xs"
        style={{ background: "var(--raised)", color: "var(--ink-2)" }}
      >
        {error.message || "Unknown error"}
        {error.digest ? ` (${error.digest})` : ""}
      </code>
      <div className="mt-2 flex gap-3">
        <Button variant="primary" onClick={reset}>Try again</Button>
        <ButtonLink href="/">Back to Today</ButtonLink>
      </div>
      {/*
        A screen that failed is the one place a person has nothing else to do,
        and the message above is the useful part only to somebody who can act
        on it. This is how it reaches them: the digest and the message go with
        the report, so a fault nobody could reproduce arrives with what it
        actually said and on which screen.
      */}
      <div className="mt-2 w-full">
        <SuggestFix
          category="BROKEN"
          trigger={`${error.message || "Unknown error"}${error.digest ? ` (${error.digest})` : ""}`}
          label="Tell the Kodukeel team"
          tone="loud"
        />
      </div>
    </main>
  );
}
