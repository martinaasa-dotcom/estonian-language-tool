import { Skeleton } from "@/components/ui";

/**
 * The shape of a page, while its data loads.
 *
 * Every screen here is `force-dynamic` and reads from the database on each
 * request, so a slow connection means a visible wait. A blank screen during
 * that wait reads as a broken app; a skeleton reads as a loading one.
 *
 * IT HAS TO BE THE SAME PAGE, THOUGH, AND IT WAS NOT. `Page` is `max-w-5xl`
 * and this was `max-w-4xl`; Today splits at `lg` and this split at `md`; the
 * gaps were 20px against Today's 32. So the swap from skeleton to page moved
 * every edge on the screen, and between 768 and 1023 the skeleton promised
 * two columns and the page arrived as one. A skeleton whose shape is a guess
 * is a layout jump with a delay on it, which is worse than the blank it
 * replaced. The container and the split are copied from `Page` and from
 * Today's own grid, and the block heights are the do-now card and the plan
 * beside it.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12" aria-busy="true" aria-label="Loading">
      <Skeleton className="w-56" height={30} />
      <Skeleton className="mt-3 w-80" height={16} />
      <div className="mt-8 grid gap-8 lg:gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-8">
          <Skeleton height={230} />
          <Skeleton height={140} />
        </div>
        <div className="flex flex-col gap-8">
          <Skeleton height={160} />
          <Skeleton height={120} />
        </div>
      </div>
    </div>
  );
}
