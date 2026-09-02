import { Skeleton } from "@/components/ui";

/**
 * The funding page, while it reads the deployment it is costing.
 *
 * `force-dynamic` for the same reason /privacy and /terms are: which services
 * this installation has switched on, and who is paying for it, are facts about
 * the deployment rather than about the software. So there is a real wait on a
 * cold start, and this page sits outside both route groups, which is exactly
 * where a loading state goes missing.
 *
 * The tall block stands in for the panel with the slider in it, because that
 * is what the page is mostly made of and a placeholder that is the wrong shape
 * is a second layout shift rather than a way of avoiding one.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 md:px-8 md:py-16" aria-busy="true" aria-label="Loading">
      <Skeleton className="w-40" height={30} />
      <Skeleton className="mt-3 w-32" height={14} />
      <div className="mt-8 flex flex-col gap-8">
        <Skeleton height={70} />
        <Skeleton height={140} />
        <Skeleton height={220} />
        <Skeleton height={100} />
      </div>
    </main>
  );
}
