/**
 * Browser security headers.
 *
 * Static headers live in `next.config.ts` so they cover every response,
 * including the static files that never reach the middleware. The CSP is set
 * in the middleware instead: two CSP headers are intersected by the browser,
 * so a second copy would only ever make the policy stricter in ways nobody
 * asked for, and the policy needs to read the environment to know which
 * Supabase project to allow.
 */

export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  /*
    Sõnaveeb and Ekilex send `X-Frame-Options: DENY` at us, and this app sends
    it back out for the same reason. Nothing here is meant to be embedded in
    somebody else's page, and a flashcard app framed inside one is a
    clickjacking target with a Google session attached.
  */
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  /*
    Google's OAuth handshake opens in the same tab, but keeping popups usable
    costs nothing and breaks nothing.
  */
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  /*
    The microphone is `self`, not `()`: speaking practice records the learner
    reading a word back (components/Recorder.tsx). Denying it here would
    switch that feature off with no error anybody could act on. The camera and
    location are denied, because nothing in this app has ever wanted either.
  */
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** The Supabase project this deployment talks to, if it has one. */
function supabaseConnectSrc(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

/**
 * The policy.
 *
 * `'unsafe-inline'` in `script-src` is required rather than chosen: the app
 * shell is prerendered and CDN-cached, and Next.js only stamps a nonce onto
 * markup it renders per request. A fresh nonce in the header against cached
 * inline Flight scripts that carry none means the browser refuses to hydrate
 * and the page never becomes interactive. A nonce would also silently disable
 * `'unsafe-inline'` for every other inline script, the theme script in
 * app/layout.tsx included.
 *
 * The rest is as tight as the app allows, and every entry has a reason:
 *
 * - `img-src` takes `https:` because a Google account's avatar is served from
 *   whichever googleusercontent host that account happens to be on.
 * - `media-src` takes `blob:` because a recording in speaking practice never
 *   leaves the device, and a blob URL is how it is played back.
 * - `connect-src` needs no third party at all: Ekilex, Wiktionary and the
 *   TartuNLP speech service are only ever reached from the server, which is
 *   the same rule that keeps their keys off the client.
 * - `frame-src` and `frame-ancestors` are both `'none'`. Neither direction of
 *   framing is wanted here, and the outward one was verified rather than
 *   assumed (docs/00-audit-v4.md section A).
 */
export function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== "production";

  const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])];
  const connectSrc = [
    "'self'",
    ...supabaseConnectSrc(),
    ...(isDev ? ["ws://localhost:*", "ws://127.0.0.1:*", "http://localhost:*"] : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    // next/font self-hosts every face at build time, so no font CDN is needed.
    "font-src 'self'",
    "media-src 'self' blob: data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
