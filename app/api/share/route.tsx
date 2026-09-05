import { ImageResponse } from "next/og";
import { requireUserId } from "@/lib/auth/session";
import { dailySummary, deckSnapshot } from "@/lib/progress/summary";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { bucketForOwner, rateLimited } from "@/lib/security/rateLimit";
import { checkSharedRateLimit } from "@/lib/usage/sharedLimit";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A progress card worth posting.
 *
 * Generated per request for whoever is signed in, and for nobody else — the
 * numbers on it come from `requireUserId()`, so this cannot be pointed at
 * another learner's account by changing a query string. Sharing is the
 * learner's act: they open this and save the image.
 *
 * The figures are the same ones /progress computes from the review log, so a
 * shared card cannot flatter: there is no stored score to inflate.
 */
export async function GET() {
  const ownerId = await requireUserId();

  // Rendering an image costs real CPU, and a card is something a person saves
  // once. Thirty a minute leaves room to reload while looking at it.
  const limit = await checkSharedRateLimit(`share:${bucketForOwner(ownerId)}`, 30, 60_000);
  if (!limit.ok) return rateLimited(limit, "Give the card a moment to draw.");

  const now = new Date();
  const snapshot = await deckSnapshot(ownerId, now);
  const [summary, settings] = await Promise.all([
    dailySummary(ownerId, now, await learnerDayClock(ownerId)),
    readSettings(ownerId, [SETTING_KEYS.displayName]),
  ]);

  const name = settings[SETTING_KEYS.displayName]?.trim();
  /*
    Each figure keeps the hue it has inside the app, butter for the streak,
    mint for what is known, cornflower for the log itself, so a shared card
    reads as the same product rather than as a generic stat graphic.

    The third used to be an XP total under a level title. XP was withdrawn
    along with the badges it was weighed in, and what stands in its place is
    the thing the level was derived from all along: how many answers this
    learner has actually given.
  */
  const stats: [string, string, string][] = [
    [String(summary.streak), "day streak", "#cf9114"],
    [String(snapshot.knownCards), "cards known", "#1fb894"],
    [String(summary.reviewsAllTime), "reviews", "#7a6bf0"],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fbf9ff",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundImage: "linear-gradient(135deg, #7a6bf0 0%, #e2559a 100%)",
                color: "#fff",
                fontSize: 36,
                fontWeight: 700,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              õ
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#241f35" }}>Kodukeel</div>
              <div style={{ display: "flex", fontSize: 17, color: "#8b84a3", letterSpacing: 2 }}>ESTONIAN, DAILY</div>
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 44, fontSize: 54, fontWeight: 700, color: "#241f35", lineHeight: 1.1 }}>
            {name ? `${name} is learning Estonian` : "Learning Estonian"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          {stats.map(([value, label, tone]) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                background: "#ffffff",
                border: "1px solid #e8e3f7",
                borderRadius: 22,
                padding: "28px 32px",
              }}
            >
              <div style={{ display: "flex", fontSize: 62, fontWeight: 700, color: tone, lineHeight: 1 }}>{value}</div>
              <div style={{ display: "flex", marginTop: 10, fontSize: 21, color: "#8b84a3" }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 20, color: "#8b84a3" }}>
          Every number here is counted from reviews actually done.
        </div>
      </div>
    ),
    {
      width: 1200, height: 630,
      /*
        NOT A YEAR, AND NOT SHARED.

        `ImageResponse` sets `public, immutable, max-age=31536000` when
        nothing says otherwise, and this picture carries a name, a streak, a
        card count and an XP total for one learner at one fixed URL. Measured
        against the running build: three fetches, one request; the second and
        third were served from the browser's own cache after everything
        `forgetThisDevice` clears had been cleared, so signing out on a shared
        laptop left the last person's card one fetch away. It is theirs, it is
        never worth keeping, and the `Cookie` vary says which of those a cache
        in front of the app is looking at.
      */
      headers: { "cache-control": "private, no-store", vary: "Cookie" },
    },
  );
}
