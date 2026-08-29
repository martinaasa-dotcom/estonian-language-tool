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

  So the path is a fallback rather than the answer: Playwright's own resolution
  goes first, which finds whatever `npx playwright install` put in the cache,
  and the sandbox path is used only when it is really there.
*/
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";

export function launchChromium(options = {}) {
  return chromium.launch(
    existsSync(SANDBOX_CHROMIUM)
      ? { executablePath: SANDBOX_CHROMIUM, ...options }
      : options,
  );
}
