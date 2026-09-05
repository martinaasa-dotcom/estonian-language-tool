import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./lib/security/headers";

/**
 * The static security headers go here rather than in the middleware so they
 * cover every response, including the files the middleware's matcher skips.
 * The Content Security Policy is the one exception and is set in
 * middleware.ts, because it has to read the environment to know which
 * Supabase project to allow. See lib/security/headers.ts.
 */
const config: NextConfig = {
  /*
    WHERE THE BUILD GOES, WHICH IS ONLY EVER A QUESTION FOR ONE SUITE.

    Whether this app gates every route or runs as one local learner is decided
    by `supabaseConfigured()`, and `NEXT_PUBLIC_` variables are inlined when
    the bundle is built rather than read when it starts. So the mode is a
    property of the build: a server started with the keys cleared still gates
    every route if the build had them, which was measured rather than assumed.

    Every browser suite runs against a local-mode build, which is why the
    hosted sign-in screen, the first thing any stranger meets, had never been
    rendered by anything. `scripts/test-signin.mjs` builds its own in hosted
    mode, and it needs somewhere to put it that is not the build the other
    suites are running against.

    Defaults to `.next`, so nothing else in the repository or on a deployment
    sees any of this.
  */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /*
    NOTHING ADVERTISES THE FRAMEWORK.

    Next sends `X-Powered-By: Next.js` on every response by default, which is
    the version-shaped half of a fingerprint handed to anybody who curls the
    site once. It buys a reader nothing, and this app already sets every other
    header on the list deliberately (lib/security/headers.ts), so the one that
    arrived by default was the odd one out.
  */
  poweredByHeader: false,

  /*
    LINT IS PART OF THE BUILD, NOT ONLY PART OF CI.

    This was `ignoreDuringBuilds: true`, and the `lint` job in CI was the only
    thing enforcing it. That covers every push and every pull request, which is
    where the code actually arrives — until somebody runs `vercel --prod` by
    hand, or forks this and trims the workflow, and then a rule this repository
    treats as non-negotiable is enforced by nothing at all.

    Every other rule here is asserted by something the build itself runs. This
    is the same argument, and the cost is a few seconds on a deploy.
  */
  eslint: { ignoreDuringBuilds: false },

  /*
    THE FORMS LIST TRAVELS WITH THE DEPLOYMENT.

    `lib/dict/forms.ts` reads `prisma/data/forms/` at runtime, and a bundler
    traces what a module imports rather than what it opens, so without this a
    hosted function has the reader and none of the files: every dictionary
    miss says "nothing found" and Sõnad refuses every guess, silently, on the
    one platform the app is measured on. Traced into every function, since the
    two readers are a page and a Server Action and the list is one set of
    files either way.
  */
  outputFileTracingIncludes: { "/**": ["./prisma/data/forms/**"] },
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    /*
      A backup grows with the deck, and restore sends the whole file to a
      Server Action. The default ceiling is 1 MB, which a real learner passes
      quietly: the export here was 990 KB after two months and the restore
      failed with a 413 that never reached the screen. The learner with the
      most history to lose is the first to hit it, which is the worst possible
      order.

      16 MB is roughly a decade of daily review at the observed rate, and it is
      only a ceiling: nothing is allocated by raising it. RestorePanel now
      surfaces the failure rather than swallowing it, so the day somebody does
      exceed this they are told, and told to say so, instead of watching a
      button do nothing.
    */
    serverActions: { bodySizeLimit: "16mb" },

    /*
      AND THE SAME CEILING AGAIN, THROUGH A DOOR THAT DID NOT EXIST WHEN THE
      COMMENT ABOVE WAS WRITTEN.

      Restoring a backup was moved out of a Server Action and into
      /api/restore precisely to get out from under a body limit. Next 15.5
      then added `middlewareClientMaxBodySize`, which defaults to 10 MB and
      applies to any request that passes through middleware — and this app's
      middleware matches every route, because the forged-request gate has to.

      So the route built to escape a limit acquired a lower one, and it fails
      in the worst available way: the body is *truncated* at 10 MB rather than
      refused, so the JSON arrives cut in half, fails to parse, and the
      learner is told their file "doesn't look like a Kodukeel backup". It
      looks exactly like a Kodukeel backup. It is one.

      Measured: a full dictionary and one learner's deck exports at 15.3 MB,
      which is over the old ceiling and under the new one, so the restore path
      was broken for anybody whose dictionary had grown past a few thousand
      words. `scripts/test-restore.mjs` catches it now; it did not before,
      because it was last run against a database small enough to fit.

      AND THEN IT CROSSED THIS ONE TOO, which is what finally moved the fix to
      the right place. One correction pass over the dictionary took the export
      from 15.9 MB to 16.5 MB and the restore started refusing a learner's own
      file. Raising the ceiling again would have bought a few thousand words,
      because the file was growing with the *dictionary* rather than with the
      person: `/api/export` sent every lexeme in the database. It sends the
      words that learner's own rows point at now, 0.08 MB on a demo deck, and
      the ceiling below stopped being a countdown.

      Matched to `bodySizeLimit` above deliberately. Two limits on the same
      upload that disagree is how this happened, and the next person to raise
      one needs to find the other in the same glance.
    */
    middlewareClientMaxBodySize: "16mb",

    /*
      HOW LONG THE BROWSER MAY REUSE A PAGE IT HAS ALREADY FETCHED.

      Next's default for a dynamic route is **zero**, and every route in this
      app is dynamic, correctly: a deck, a streak and a due count are facts
      about the person reading. Zero means the router cache holds nothing, so
      going back to the page you were on ten seconds ago is a fresh render of
      it, queries and all. Somebody moving between Today, Practice and their
      deck the way this app is meant to be used paid full price for every one
      of those, in both directions, and that is what "the navigation feels
      slow" turned out to mean.

      Thirty seconds is chosen against what a stale panel actually costs here.
      A mutation is not covered by it and does not have to be: every one in
      this app is a Server Action and every one of them calls
      `revalidatePath`, which drops the client's copy of those routes as well
      as the server's. So grading a card, adding a word or ticking a task
      still shows up immediately on Today. What thirty seconds buys is the
      case with no mutation in it at all. Reading the grammar page, going
      back, opening the dictionary, going back: that is most of what moving
      around an app is.

      `static` is what a link marked `prefetch` is held under, which here means
      a page fetched because a pointer settled on it (components/PrefetchLink).
      Two minutes rather than the default five: a page fetched on a hover is
      still a page somebody is about to read, and it should not be able to be
      much older than the moment they reached for it.
    */
    staleTimes: { dynamic: 30, static: 120 },
  },
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default config;
