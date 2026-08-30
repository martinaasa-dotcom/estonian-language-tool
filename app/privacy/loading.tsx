import { Skeleton } from "@/components/ui";

/**
 * The policy page, while it reads the deployment it is describing.
 *
 * Both of these are `force-dynamic` on purpose: who runs this installation and
 * which services it is configured to talk to are facts about the deployment,
 * so a notice baked in at build time describes the build machine. That means a
 * real wait on a cold start, and these two pages sit outside both route groups,
 * so neither the signed-in shell's loading state nor the chromeless one covered
 * them. They showed nothing at all.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 md:px-8 md:py-16" aria-busy="true" aria-label="Loading">
      <Skeleton className="w-40" height={30} />
      <Skeleton className="mt-3 w-32" height={14} />
      <div className="mt-8 flex flex-col gap-8">
        <Skeleton height={90} />
        <Skeleton height={120} />
        <Skeleton height={80} />
      </div>
    </main>
  );
}
