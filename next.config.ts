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
  eslint: { ignoreDuringBuilds: true },
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
  },
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default config;
