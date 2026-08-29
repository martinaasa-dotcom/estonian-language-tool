/**
 * A stand-in session for local end-to-end tests.
 *
 * The browser tests in `scripts/` predate sign-in and have been walking into a
 * redirect ever since Google auth landed, which means the app's only full-stack
 * tests have quietly not been running. Driving a real OAuth flow from Playwright
 * would test Google, not this app.
 *
 * Two conditions, both required, and neither satisfiable on a deployment:
 *
 *   1. `E2E_TEST_USER_ID` is set, which nothing sets by accident, and
 *   2. `NODE_ENV` is not "production" — which it always is under `next start`
 *      and on every host worth deploying to.
 *
 * The second is the real guarantee: a production build cannot honour this even
 * if the variable leaks into the environment. It is also announced on every
 * call, so a session running under it is never a surprise.
 */
let warned = false;

export function testUserId(): string | null {
  const id = process.env.E2E_TEST_USER_ID;
  if (!id) return null;
  if (process.env.NODE_ENV === "production") return null;

  if (!warned) {
    warned = true;
    console.warn(
      `[auth] E2E_TEST_USER_ID is set — every request is being treated as user "${id}". ` +
      `This is for local browser tests and cannot take effect in a production build.`,
    );
  }
  return id;
}
