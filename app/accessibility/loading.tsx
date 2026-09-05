import { Skeleton } from "@/components/ui";

/**
 * The accessibility statement, while it reads the deployment it is describing.
 *
 * `force-dynamic` for the reason `/privacy` gives: the address a reader writes
 * to is who runs this installation, which is a fact about the deployment
 * rather than about the build. That means a real wait on a cold start, and
 * this page sits outside both route groups, so neither the signed-in shell's
 * loading state nor the chromeless one covers it.
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
