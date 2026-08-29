#!/usr/bin/env node
/**
 * Fails the build if a credential reached the client bundle.
 *
 * CLAUDE.md makes this a non-negotiable, and a rule with no enforcement is a
 * comment. Everything the browser downloads is scanned: the pattern list is
 * deliberately about *shapes* of keys rather than the values in any one .env,
 * so it catches a key that was never on this machine.
 *
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` is designed to be public and is expected in
 * the bundle — a Supabase *anon* JWT carries `"role":"anon"`. A `service_role`
 * JWT carries the same shape and must never appear, so the two are told apart
 * by the decoded role claim rather than by name.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [".next/static", ".next/server/app", ".next/server/chunks"];
const TEXT = /\.(js|mjs|cjs|json|css|map|html|txt)$/;

const PATTERNS = [
  { name: "OpenAI / OpenRouter secret key", re: /\bsk-(?:proj-|or-v1-|ant-)?[A-Za-z0-9_-]{20,}/g },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "Postgres connection string with a password", re: /postgres(?:ql)?:\/\/[^\s"'`:]+:[^\s"'`@]+@/g },
  { name: "Ekilex API key assignment", re: /EKILEX_API_KEY["'`\s]*[:=]\s*["'`][^"'`\s]{8,}/g },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

/** A JWT whose payload claims a privileged role. Anon keys are fine; these are not. */
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g;
const FORBIDDEN_ROLES = ["service_role", "supabase_admin"];

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (TEXT.test(entry)) yield path;
  }
}

/** Redacts a match so a failing CI log never becomes the leak itself. */
const redact = (s) => `${s.slice(0, 6)}…${s.slice(-2)} (${s.length} chars)`;

const findings = [];
let scanned = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    scanned++;
    const text = readFileSync(file, "utf8");

    for (const { name, re } of PATTERNS) {
      for (const m of text.matchAll(re)) {
        findings.push({ file, name, sample: redact(m[0]) });
      }
    }

    for (const m of text.matchAll(JWT)) {
      let role = "";
      try {
        const payload = JSON.parse(Buffer.from(m[0].split(".")[1], "base64url").toString("utf8"));
        role = String(payload.role ?? payload.rol ?? "");
      } catch { continue; } // Not a JWT after all — some other base64-ish blob.
      if (FORBIDDEN_ROLES.includes(role)) {
        findings.push({ file, name: `Supabase ${role} JWT`, sample: redact(m[0]) });
      }
    }
  }
}

if (scanned === 0) {
  console.error("check-secrets: nothing scanned — run `next build` first.");
  process.exit(2);
}

if (findings.length > 0) {
  console.error(`\n✗ Credential-shaped strings found in ${findings.length} place(s):\n`);
  for (const f of findings) console.error(`  ${f.file}\n    ${f.name}: ${f.sample}`);
  console.error("\nMove it behind a Route Handler or server action. See CLAUDE.md.\n");
  process.exit(1);
}

console.log(`✓ check-secrets: ${scanned} built files scanned, no credentials in the client bundle.`);
