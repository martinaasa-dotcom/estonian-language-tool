import { CommandPalette } from "@/components/CommandPalette";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Shortcuts } from "@/components/Shortcuts";
import { Sidebar } from "@/components/Sidebar";
import { Wash } from "@/components/ui";

/**
 * The signed-in shell: rail on the left, floating tab bar on mobile, pastel
 * wash behind everything, ⌘K over the top of it.
 *
 * Routes that own the whole screen — the landing page, sign-in, first-run setup
 * — sit in `app/(chromeless)/` and get none of it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
