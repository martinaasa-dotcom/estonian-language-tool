import { prisma } from "@/lib/db";

/**
 * Is this deployment up, and does its database answer.
 *
 * Public and unauthenticated, because the readers are an uptime monitor, a
 * load balancer and somebody on the buying side who was pointed here from
 * `/trust` and wants to see the app say something about itself. A health check
 * behind a token is a health check nobody can use, and there is nothing here
 * worth a token: the answer is two words and a commit hash.
 *
 * WHAT IT MAY NOT SAY, WHICH IS MOST OF WHAT A HEALTH ENDPOINT USUALLY SAYS.
 *
 * No connection string, no host, no database name, no error message from the
 * driver, no library version, no environment variable value, and no count of
 * anything. Prisma quotes the datasource in an initialization failure, which
 * is the same fault `safeMessage` exists for one layer over: a page or a
 * response built out of what the database said can carry the deployment's own
 * password. So the failure branch here throws the error away entirely and
 * answers with one word, and the real message goes to the server log where it
 * belongs. A version number is withheld for a duller reason: it tells an
 * attacker which advisories to try and tells an honest reader nothing.
 *
 * The build identifier is the exception and is safe because the repository is
 * public. It is the short commit hash, so a report of a fault can be tied to
 * the code that was running, and it is absent rather than invented where the
 * platform did not set one.
 *
 * NEVER AN UNHANDLED THROW. The one thing a health endpoint must not do is
 * fail in a way that looks like the app being wholly down when the app is
 * serving pages perfectly well, so every path here returns a response and the
 * database is asked behind a short deadline rather than the driver's own.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Short enough that a monitor polling this is never the slow thing. */
const DB_TIMEOUT_MS = 2_000;

/** The commit this build came from, or nothing. Never a longer story. */
function buildId(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return sha ? sha.slice(0, 7) : null;
}

/**
 * `SELECT 1` under a deadline.
 *
 * The race leaves the query running when it loses, which is deliberate: a
 * database taking longer than two seconds to answer this is already the
 * finding, and cancelling it would need a second connection to do the
 * cancelling on.
 */
async function databaseAnswers(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), DB_TIMEOUT_MS);
    });
    const query = prisma.$queryRaw`SELECT 1`.then(() => true).catch((error: unknown) => {
      // Logged, never returned: what the driver says can quote the datasource.
      console.error("[health] database check failed", error);
      return false;
    });
    return await Promise.race([query, timeout]);
  } catch (error) {
    console.error("[health] database check threw", error);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const database = (await databaseAnswers()) ? "ok" : "unreachable";
  const ok = database === "ok";

  return new Response(
    JSON.stringify({
      status: ok ? "ok" : "degraded",
      database,
      build: buildId(),
      time: new Date().toISOString(),
    }),
    {
      /*
        503 when the database is not answering, because a monitor reads the
        status line and a body it has to parse is a body it will parse wrong.
        The app itself is still serving: `/offline`, the cached pages and a
        review session already in hand all survive this, which is what the
        availability section of `/trust` says and why "degraded" is the word
        rather than "down".
      */
      status: ok ? 200 : 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
