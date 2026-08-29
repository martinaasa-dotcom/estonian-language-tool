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

  Neither half is hypothetical. `make-icons.mjs` arrived carrying its own copy
  of this, and a better one: a list of real locations rather than the single
  path this file started with, including a system Chromium, which is what saves
  a machine that has a browser but has never run `playwright install`. That
  list is here now and its copy is gone, because two of anything is how they
  drift.
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
