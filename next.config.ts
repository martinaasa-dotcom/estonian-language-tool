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
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default config;
