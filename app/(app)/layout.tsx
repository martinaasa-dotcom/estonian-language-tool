import { CommandPalette } from "@/components/CommandPalette";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Shortcuts } from "@/components/Shortcuts";
import { Sidebar } from "@/components/Sidebar";
import { Wash } from "@/components/ui";
import { AnuFab } from "@/components/anu/AnuFab";
import { LetterBarScope } from "@/components/DiacriticBar";
import { resolveProviders } from "@/lib/tutor/provider";
import { supabaseConfigured } from "@/lib/auth/mode";
import { requireUserId } from "@/lib/auth/session";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import { letterBarFrom } from "@/lib/ux/letterBar";

// Not cached at build time: `configured` below is read from the environment,
// and a notice baked in from the build machine's environment describes
// nobody's deployment (see /privacy and /terms for the same reasoning).
export const dynamic = "force-dynamic";

/**
 * The signed-in shell: rail on the left, floating tab bar on mobile, pastel
 * wash behind everything, ⌘K over the top of it.
 *
 * Routes that own the whole screen — the landing page, sign-in, first-run setup
 * — sit in `app/(chromeless)/` and get none of it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const chain = resolveProviders();
  // One indexed read, on a request that is already dynamic. It has to be here
  // rather than on each page: Anu's floating input and the command palette are
  // outside every page, and they carry Estonian fields too.
  const letters = letterBarFrom(await readSetting(await requireUserId(), SETTING_KEYS.letterBar));
  return (
    <LetterBarScope value={letters} dismissible>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-full focus:px-4 focus:py-2"
        style={{ background: "var(--surface)", color: "var(--ink)", boxShadow: "var(--shadow)" }}
      >
        Skip to content
      </a>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Wash />
        <Sidebar />
        {/* `dock-pad` is the phone bar's measured height, so the last card in
            a list is never left under it. See lib/layout/dockClearance.ts. */}
        <main id="main" className="dock-pad flex-1">{children}</main>
      </div>
      {/* The browser's own pull to refresh went with `overscroll-behavior-y:
          none` in globals.css, and there is no setting that keeps one and not
          the other. Installed to a home screen there is no address bar and so
          no reload button anywhere in this app. */}
      <PullToRefresh />
      <CommandPalette />
      {/* `?` anywhere. Documentation with a keyboard binding — see the component. */}
      <Shortcuts />
      {/* Offered once, inside the app only: someone still reading the landing
          page has not decided they want this on their home screen. */}
      <InstallPrompt />
      <AnuFab
        configured={chain.length > 0}
        readerCanConfigure={!supabaseConfigured()}
        plannedLabel={chain[0] ? `${chain[0].label} · ${chain[0].model}` : null}
      />
    </LetterBarScope>
  );
}
