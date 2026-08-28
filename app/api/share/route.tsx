import { ImageResponse } from "next/og";
import { requireUserId } from "@/lib/auth/session";
import { dailySummary, deckSnapshot } from "@/lib/progress/summary";
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
  const now = new Date();
  const snapshot = await deckSnapshot(ownerId, now);
  const [summary, settings] = await Promise.all([
    dailySummary(ownerId, snapshot, now),
    readSettings(ownerId, [SETTING_KEYS.displayName]),
  ]);

  const name = settings[SETTING_KEYS.displayName]?.trim();
  const stats: [string, string][] = [
    [String(summary.streak), summary.streak === 1 ? "day streak" : "day streak"],
    [String(snapshot.knownCards), "cards known"],
    [String(summary.level.totalXp), "XP earned"],
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
          background: "#f6f7f9",
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
                borderRadius: 14,
                background: "#3e6ba8",
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
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#161a21" }}>Kodukeel</div>
              <div style={{ display: "flex", fontSize: 17, color: "#6b7684", letterSpacing: 2 }}>ESTONIAN STUDY</div>
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 44, fontSize: 54, fontWeight: 700, color: "#161a21", lineHeight: 1.1 }}>
            {name ? `${name} is learning Estonian` : "Learning Estonian"}
          </div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 27, color: "#464f5d" }}>
            {`Level ${summary.level.level} · ${summary.level.title}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          {stats.map(([value, label]) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                background: "#ffffff",
                border: "1px solid #d8dee6",
                borderRadius: 18,
                padding: "28px 32px",
              }}
            >
              <div style={{ display: "flex", fontSize: 62, fontWeight: 700, color: "#3e6ba8", lineHeight: 1 }}>{value}</div>
              <div style={{ display: "flex", marginTop: 10, fontSize: 21, color: "#6b7684" }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 20, color: "#6b7684" }}>
          Every number here is counted from reviews actually done.
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
