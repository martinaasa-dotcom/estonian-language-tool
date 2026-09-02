import { CommandPalette } from "@/components/CommandPalette";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Shortcuts } from "@/components/Shortcuts";
import { createHash } from "node:crypto";
import { Sidebar } from "@/components/Sidebar";
import { DeviceOwner } from "@/components/DeviceOwner";
import { Wash } from "@/components/ui";
import { AnuFab } from "@/components/anu/AnuFab";
import { TimeZoneSync } from "@/components/TimeZoneSync";
import { LetterBarScope } from "@/components/DiacriticBar";
import { resolveProviders } from "@/lib/tutor/provider";
import { requireUserId } from "@/lib/auth/session";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { supabaseConfigured } from "@/lib/auth/mode";
import { letterBarFrom } from "@/lib/ux/letterBar";
import { AudioPrefsProvider } from "@/components/AudioPrefs";
import { autoplayFrom, feedbackSoundsFrom, voiceFrom } from "@/lib/audio/voice";

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
  /*
    Two settings the shell needs, in one read rather than two.

    The letter bar has to be resolved here rather than on each page, because
    Anu's floating input and the command palette sit outside every page and
    carry Estonian fields too. The timezone has to be here for the same shape
    of reason: the heatmap, the badges, the class roster and the share card all
    count days, so a value collected on one screen would be missing for anybody
    whose first visit landed on another. `readSettings` takes both keys in one
    indexed query, on a request that is already dynamic.

    See lib/ux/letterBar.ts for why the bar is a question at all, and
    lib/time/day.ts for what the zone is worth.
  */
  const ownerId = await requireUserId();
  const settings = await readSettings(
    ownerId,
    [
      SETTING_KEYS.letterBar, SETTING_KEYS.timeZone,
      SETTING_KEYS.ttsVoice, SETTING_KEYS.autoplayAudio, SETTING_KEYS.feedbackSounds,
    ],
  );
  const letters = letterBarFrom(settings[SETTING_KEYS.letterBar]);
  const storedZone = settings[SETTING_KEYS.timeZone] ?? null;
  // How Estonian is read aloud, published once for every speaker button and
  // every round inside the shell. See components/AudioPrefs.tsx.
  const audio = {
    voice: voiceFrom(settings[SETTING_KEYS.ttsVoice]),
    autoplay: autoplayFrom(settings[SETTING_KEYS.autoplayAudio]),
    sounds: feedbackSoundsFrom(settings[SETTING_KEYS.feedbackSounds]),
  };
  return (
    <AudioPrefsProvider value={audio}>
    <LetterBarScope value={letters} dismissible>
      <DeviceOwner owner={ownerDigest(ownerId)} />
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
        {/*
          `dock-pad` is the phone bar's measured height, so the last card in a
          list is never left under it. See lib/layout/dockClearance.ts.

          `min-w-0` is the rule in app/globals.css applied to the one flex item
          the whole app sits inside. From `md:` up this is a row, and a flex
          item's automatic minimum is its min-content width, so anything wide
          in a page (a table of forms, a row of chips that will not wrap) made
          `main` wider than the window rather than being contained by it. The
          body clips sideways, so the overflow did not even leave a scrollbar
          to find it with: the right-hand end of the page was simply gone.
          Below `md:` this is a column and the question never arose, which is
          why it took measuring at 768 to see it at all.
        */}
        {/*
          A GUTTER FOR THE BUTTON THAT FLOATS OVER THIS COLUMN.

          Anu's button is fixed 1rem from the right and 56px wide, so its left
          edge is at 1208 on a 1280 window while the content column ends at
          1232, and at 768 the column ends at 728 with the button starting at
          696. It scrolled over the right-hand cards on Today and over the far
          right of every case row. From the width the rail appears at up to the
          point the window is wide enough that the column no longer reaches,
          the column gives it room instead.
        */}
        <main id="main" className="dock-pad min-w-0 flex-1 md:pr-[5rem] 2xl:pr-0">{children}</main>
      </div>
      {/* The browser's own pull to refresh went with `overscroll-behavior-y:
          none` in globals.css, and there is no setting that keeps one and not
          the other. Installed to a home screen there is no address bar and so
          no reload button anywhere in this app. */}
      <TimeZoneSync stored={storedZone} />
      <PullToRefresh />
      <CommandPalette />
      {/* `?` anywhere. Documentation with a keyboard binding — see the component. */}
      <Shortcuts />
      {/* Offered once, inside the app only: someone still reading the landing
          page has not decided they want this on their home screen. */}
      <InstallPrompt />
      {/* No planned label: the panel names the model that answered and makes no
          prediction about one that has not. `/tutor` has the room for both. */}
      <AnuFab configured={chain.length > 0} readerCanConfigure={!supabaseConfigured()} />
    </LetterBarScope>
    </AudioPrefsProvider>
  );
}

/**
 * What the browser is told about who is using it: enough to notice a change
 * of account, and nothing that names one. See `components/DeviceOwner.tsx`.
 */
function ownerDigest(ownerId: string): string {
  return createHash("sha256").update(ownerId).digest("hex").slice(0, 16);
}
