import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { launchChromium } from "./lib/browser.mjs";
import { suite } from "./lib/checks.mjs";

/*
  THE SAFETY NET, RENDERED.

  `app/error.tsx` is one of the four states every view owes a reader, and it is
  the only one nothing ever put on a screen. An invariant read its source and
  checked that the failure copy and the report button were both still in the
  file, which is worth having and is not the same question: a client component
  that throws while rendering, or imports something that does, would leave a
  learner with a blank page at the exact moment they most need a sentence. The
  net has to be dropped once to know it holds.

  Driving it needs a server that genuinely fails, so this starts its own on a
  spare port against a database that is not there. That is the case the page
  was written for and, as it turned out, the case it was wrong about: a
  production build keeps the server's message off the page, so the sentence
  that promised "the message below is the useful part" pointed at Next's
  boilerplate saying the message had been withheld. The reference and where to
  find it are what the page offers now, and this is what checks it still does.

  It reuses the build the other suites are running against rather than making
  its own, so the cost is a process start.
*/
/*
  Its own port, because its own server: this one is deliberately broken, so
  pointing it at the server the other suites use would leave nothing to see.
  Overridable all the same, since a fixed port is a clash waiting for somebody
  else's machine, which is the same argument `baseUrl()` makes for the rest.
*/
const PORT = Number(process.env.ERROR_SUITE_PORT ?? 3199);
const { check, done, absent } = suite("The error state", { floor: 6 });

/*
  `detached`, because `child.kill()` on its own does not stop this server.

  `npx next start` is a launcher that spawns the real server as a grandchild,
  so killing the child left `next-server` holding this port for the rest of
  the job. It went unnoticed while nothing else wanted the port and surfaced
  the moment something did: `scripts/test-signin.mjs` runs next, defaults to
  the pair either side of this one, and its own guard against measuring
  somebody else's server refused to start. The orphan was in the runner's
  cleanup log all along, one line under "Cleaning up orphan processes".

  Detached makes the child a process group leader, so `halt` can kill the
  group and take the grandchild with it.
*/
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  detached: true,
  env: {
    ...process.env,
    // Nothing listens here. Prisma fails to connect and the page throws, which
    // is the failure this is about rather than a contrived one.
    DATABASE_URL: "postgresql://postgres@127.0.0.1:5599/nothing-here",
    DIRECT_URL: "postgresql://postgres@127.0.0.1:5599/nothing-here",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  },
  stdio: "ignore",
});

/** Kill the server and the grandchild actually listening, ignoring one already gone. */
function halt(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already dead, or never started. Either way there is nothing to stop.
  }
}

const B = `http://localhost:${PORT}`;
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  up = await fetch(`${B}/offline`).then((r) => r.ok).catch(() => false);
  if (!up) await delay(500);
}

if (!up) {
  absent(6, `no server came up on ${PORT}, so the error state could not be driven`);
  halt(server);
  done();
} else {
  const browser = await launchChromium();
  const page = await (await browser.newContext()).newPage();

  const res = await page.goto(`${B}/`, { waitUntil: "networkidle" }).catch(() => null);
  await page.waitForTimeout(500);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();

  check("a page whose database is gone answers 500, not 200",
    res !== null && res.status() === 500, String(res?.status()));
  check("and the reader gets the error screen rather than a blank page",
    /didn.t load/i.test(body), body.slice(0, 90) || "(nothing rendered)");
  check("which says nothing was lost, because nothing was",
    /Nothing has been lost/i.test(body));
  check("and offers both ways out: try again, and tell somebody",
    (await page.getByRole("button", { name: /Try again/ }).count()) > 0
      && (await page.getByText(/Tell the Kodukeel team/).count()) > 0);
  /*
    The message is withheld by the framework in a production build, so what the
    page can honestly offer is the reference and where the message actually is.
    Asserted together: a digest with no sentence explaining it is the dead end
    this replaced.
  */
  check("and names the reference, and where the message really is",
    /server log/i.test(body) && /Reference \d+/.test(body),
    body.slice(-140));

  /*
    AND NOT THE FRAMEWORK'S OWN THREE SENTENCES ABOUT ITSELF.

    A production build replaces a server error's message with a paragraph about
    Server Components renders, production builds and a digest property on the
    error instance, and this screen printed it in a code block. Nothing else in
    this repository could catch that: `readerCopy.test.ts` sweeps the copy we
    wrote, and this sentence is React's.
  */
  check("and does not read the framework's own prose back to a learner",
    !/Server Components render|digest property|omitted in production/i.test(body),
    body.slice(0, 120));

  await browser.close();
  halt(server);
  done();
}
