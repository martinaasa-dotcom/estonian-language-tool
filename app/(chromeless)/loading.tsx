import { Skeleton } from "@/components/ui";

/**
 * The shape of a chromeless screen, while its data loads.
 *
 * `app/(app)/` has had one of these since the four-state rule was written down;
 * this group had none, so the landing page, sign-in and first run each showed
 * nothing at all until they were ready. First run is the worst of the three to
 * lose: it builds a whole level check on the server before it renders, which is
 * a handful of queries deliberately paid for up front, and a blank screen for
 * the length of them is the first thing this app shows anybody.
 *
 * A single centered card rather than the dashboard skeleton next door, because
 * that is the shape all three of these screens actually are.
 */
export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-10 md:px-8"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton height={340} />
    </main>
  );
}
