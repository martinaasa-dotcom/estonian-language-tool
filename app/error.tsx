"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/Button";
import { SuggestFix } from "@/components/SuggestFix";

/**
 * Something threw on the server.
 *
 * Calm about it, and never suggesting the learner has lost anything, because
 * they have not: the review log is only ever appended to.
 *
 * THE MESSAGE IS NOT THE USEFUL PART IN A PRODUCTION BUILD, AND THIS SAID IT WAS.
 *
 * The header used to argue that showing the message turns a fixable
 * configuration problem, "usually a missing DATABASE_URL", into something a
 * self-hoster can act on. Driven against a build pointed at a database that is
 * not there, which is that exact case, what the page actually showed was Next's
 * own line: "An error occurred in the Server Components render. The specific
 * message is omitted in production builds to avoid leaking sensitive details."
 * So the sentence promising the useful part below it pointed at boilerplate,
 * and the one reader it was written for had a dead end.
 *
 * A production build keeps the message on the server on purpose, and that is
 * the right default: a message can carry a connection string. What crosses is
 * the digest, and the same digest is written next to the full error in the
 * server log, which makes it the thing worth showing and worth naming as a
 * reference rather than as an explanation. In development the message is real
 * and is still printed, which is why both are here.
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
        works.
      </p>
      <code
        className="max-w-full overflow-x-auto rounded-[var(--r)] px-3 py-2 text-left text-xs"
        style={{ background: "var(--raised)", color: "var(--ink-2)" }}
      >
        {error.message || "Unknown error"}
        {error.digest ? ` (${error.digest})` : ""}
      </code>
      {error.digest && (
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
          If you run this copy of Kodukeel, the server log holds the full message under that
          reference.
        </p>
      )}
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
