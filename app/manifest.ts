import type { MetadataRoute } from "next";

/**
 * Installable as an app.
 *
 * Not decoration: review is the daily path and it has to survive a bus with no
 * signal (CLAUDE.md). Installed, Kodukeel opens straight into the review screen
 * from the home screen, the service worker has the shell cached, and grades made
 * offline queue locally until there is a connection (lib/offline/queue.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kodukeel — Estonian study",
    short_name: "Kodukeel",
    description:
      "Learn Estonian by its cases: a dictionary with full paradigms, spaced-repetition flashcards, speed rounds and a grammar tutor.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#3e6ba8",
    lang: "en",
    categories: ["education"],
    icons: [
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Review", short_name: "Review", url: "/review" },
      { name: "Learning path", short_name: "Learn", url: "/learn" },
      { name: "Dictionary", short_name: "Dictionary", url: "/dictionary" },
    ],
  };
}
