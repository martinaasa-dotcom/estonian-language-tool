import { existsSync } from "node:fs";
import { chromium } from "playwright";

/*
  Launch Chromium wherever this machine keeps it.

  Every browser script here was written inside a sandbox that ships Chromium at
  a fixed path and sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, so they all said
  `executablePath: "/opt/pw-browsers/chromium"` and all of them were correct
  exactly there. On any other machine, including CI, that path does not exist
  and Playwright refuses to launch with a message about a missing executable
  rather than about a wrong assumption. `npm run test:e2e` was therefore a
  command only one machine could run.

  So the path is a fallback rather than the answer, in three steps: an explicit
  `SYSTEM_CHROMIUM` if somebody set one, then the sandbox path if it is really
  there, then Playwright's own resolution, which finds whatever `npx playwright
  install` put in the cache.

  Neither half is hypothetical, and the list below is not this file's own. A
  second copy of this logic had grown up inside the script that rasterised the
  app icon into PNGs, and it was the better copy: a list of real locations
  rather than the single path this file started with, including a system
  Chromium, which is what saves a machine that has a browser but has never run
  `playwright install`. The list moved here and that copy went, because two of
  anything is how they drift. The script itself has gone since, for a different
  reason: nothing ever read the PNGs it wrote.
*/
const CANDIDATES = [
  "/opt/pw-browsers/chromium",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
];

function executablePath() {
  const named = process.env.SYSTEM_CHROMIUM?.trim();
  if (named) return named;
  return CANDIDATES.find((path) => existsSync(path)) ?? null;
}

export function launchChromium(options = {}) {
  const path = executablePath();
  return chromium.launch(path ? { executablePath: path, ...options } : options);
}

/**
 * Wait for something to become true, by polling from here.
 *
 * A Server Action is a round trip and then a router refresh, and how long
 * that takes is a fact about the machine. Every check in these suites that
 * follows a fixed `waitForTimeout` is asserting the runner's speed as much as
 * the app's behaviour: e2e's `task is created and persists` slept 2000ms and
 * failed on a CI runner while passing everywhere else, on an app that had
 * created the task correctly. The sleeps that happened to be 2500ms passed in
 * the same run, which is the whole argument.
 *
 * Polled from Node rather than through `page.waitForFunction`, which injects
 * its predicate as a string and throws under this app's Content Security
 * Policy, and which resolves immediately on an async predicate because a
 * Promise is truthy.
 *
 * It still fails when the thing never happens. It just stops failing when the
 * thing happens a moment later than somebody guessed.
 */
export async function eventually(isTrue, { timeoutMs = 15_000, everyMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await isTrue()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}
