import { Skeleton } from "@/components/ui";

/**
 * The shape of a page, while its data loads.
 *
 * Every screen here is `force-dynamic` and reads from the database on each
 * request, so a slow connection means a visible wait. A blank screen during
 * that wait reads as a broken app; a skeleton reads as a loading one.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12" aria-busy="true" aria-label="Loading">
      <Skeleton className="w-56" height={30} />
      <Skeleton className="mt-3 w-80" height={16} />
      <div className="mt-8 grid gap-5 md:grid-cols-[1.45fr_1fr]">
        <div className="flex flex-col gap-5">
          <Skeleton height={190} />
          <Skeleton height={120} />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton height={140} />
          <Skeleton height={110} />
        </div>
      </div>
    </div>
  );
}
