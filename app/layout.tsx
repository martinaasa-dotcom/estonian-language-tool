import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { OfflineProvider } from "@/components/OfflineProvider";
import "./globals.css";

/**
 * Fraunces for anything that should feel written — headings, and every Estonian
 * word in the app. Plus Jakarta Sans for the interface around it. Both carry
 * latin-ext, which is not optional here: without it õ ä ö ü š ž fall back to a
 * different face mid-word.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jakarta",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  /*
    A title per screen, and a template so none of them has to remember the
    app's name.

    Thirty-four of the forty-five routes here set nothing, so every one of them
    was called "Kodukeel. Estonian that finally sticks" — the landing page's
    marketing line, in the browser tab, in the history and in the bookmark, on
    /review and /settings and /progress alike. Somebody with the review screen
    and the dictionary open side by side had two identical tabs, and somebody
    reading their history back had a column of the same sentence. The three
    pages that did set one each did it a different way ("Grammar · käänded",
    "What this app is · Kodukeel", "Offline. Kodukeel"), which is what a
    template is for.

    `default` is what a route without its own title gets, which is the landing
    page and nothing else worth naming.
  */
  title: {
    default: "Kodukeel. Estonian that finally sticks",
    template: "%s · Kodukeel",
  },
  description:
    "A calm daily home for learning Estonian: real forms from Ekilex, spaced repetition that " +
    "knows when to stop, native audio, and a grammar tutor that explains the rule.",
  icons: { icon: "/icon.svg" },
  applicationName: "Kodukeel",
  appleWebApp: { capable: true, title: "Kodukeel", statusBarStyle: "default" },
  openGraph: {
    title: "Kodukeel. Estonian that finally sticks",
    description:
      "Real forms from Ekilex, spaced repetition, native audio and a grammar tutor. Fifteen minutes a day.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9ff" },
    { media: "(prefers-color-scheme: dark)", color: "#12101d" },
  ],
  // The review screen is thumb-driven; zoom stays enabled because disabling it
  // is an accessibility failure, not a polish detail.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/*
  THE THEME, DECIDED BEFORE THE FIRST PAINT RATHER THAN AFTER IT.

  `ThemeToggle` writes `data-theme` on <html> from a `useEffect`, which runs
  after React has hydrated, which is after the browser has already painted.
  So a learner who chose dark got a full frame of the light palette on every
  single page load: a white flash, at whatever hour somebody who chose dark is
  most likely to be reviewing.

  There is no way to read `localStorage` from the server, so the only thing
  that can answer before paint is a blocking inline script. It is three lines,
  it runs once, and `suppressHydrationWarning` on <html> is what lets it write
  an attribute React did not render without React objecting on arrival.

  Nothing stored means nothing written, and the `prefers-color-scheme` block
  in globals.css keeps deciding. A `try` around it because Safari throws on
  `localStorage` outright in private browsing rather than returning null, and
  a theme is not worth a blank page.
*/
const THEME_SCRIPT =
  "try{var t=localStorage.getItem('theme');" +
  "if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables go on <html>, not <body>: `--font-serif` is declared on
    // :root and references `--font-fraunces`, and a custom property is
    // substituted where it is *declared*, so the face has to be in scope there.
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        {/* Registers the service worker and drains the offline grade queue, so
            it has to sit above both route groups — the offline fallback is
            reachable from either. */}
        <OfflineProvider>{children}</OfflineProvider>
      </body>
    </html>
  );
}
