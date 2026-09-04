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
    name: "Kodukeel. Ready for the real thing",
    short_name: "Kodukeel",
    description:
      "Estonian you can use on somebody: practice that sticks, a conversation to rehearse, and one thing to say out loud today.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9ff",
    theme_color: "#7a6bf0",
    lang: "en",
    categories: ["education"],
    icons: [
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      // A maskable icon is a separate drawing rather than the same file listed
      // twice. Android crops it to a circle 80% of the icon's width, so the
      // rounded tile loses its corners and anything near the top goes with
      // them: pointing both purposes at the standard mark cropped the tilde
      // off the top of the head on every Android launcher.
      { src: "/app-icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Review", short_name: "Review", url: "/review" },
      { name: "The course", short_name: "Course", url: "/learn" },
      { name: "Situations", short_name: "Situations", url: "/situations" },
      { name: "Dictionary", short_name: "Dictionary", url: "/dictionary" },
    ],
  };
}
