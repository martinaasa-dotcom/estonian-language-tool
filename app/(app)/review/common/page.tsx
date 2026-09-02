import { TrendingUp } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { requireUserId } from "@/lib/auth/session";
import { commonGroup } from "@/lib/collections/commonGroups";
import { commonCounts } from "@/lib/progress/common";
import { Card, Chip, Empty, Page, Stack } from "@/components/ui";
import { ButtonLink } from "@/components/Button";
import { DeepenButton } from "./DeepenButton";

export const metadata = { title: "Most common words" };

export const dynamic = "force-dynamic";

/**
 * THE FOUR LISTS, AS FOUR ROUNDS.
 *
 * `/dictionary/common` is the same four lists as lists: what is on them, in
 * order, with a button that collects a hundred words cheaply. This is the other
 * question about them, which is what to do with them, and the answer is a round
 * per list.
 *
 * Both exist because they are genuinely two things. Reading the hundred
 * commonest verbs is worth doing once; working through them twenty at a time,
 * asked in a different form each morning, is worth doing for a month. The
 * dictionary's page links here and this links back, so neither is a dead end.
 *
 * It carries the counts because they are the one thing that decides which list
 * to press, and `/practice` deliberately does not: that card is four buttons on
 * a page that already asks five questions of the database, and a number nobody
 * is choosing by is not worth a query on the screen somebody opens every day.
 */
export default async function CommonRoundsPage() {
  const ownerId = await requireUserId();
  const counts = await commonCounts(ownerId);
  const found = counts.reduce((sum, c) => sum + c.found, 0);

  return (
    <Page
      title="Most common words"
      lead="Counted over film and television subtitles, which is the spoken language."
    >
      {found === 0 ? (
        /*
          A deployment seeded before the course harvest holds a few hundred
          words and can answer for almost none of these. A real state, fixed by
          a reseed, and saying so is more use than four empty cards.
        */
        <Empty
          title="The dictionary has not been loaded yet"
          body="These rounds are drawn from it, so there is nothing to ask until it is seeded."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      ) : (
        <Stack>
          {counts.filter((c) => c.found > 0).map((count) => {
          const group = commonGroup(count.group);
          return (
            <Card key={group.key}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `var(--${group.tone})`, color: "var(--surface)" }}
                >
                  <TrendingUp size={18} aria-hidden />
                </span>
                <h2 className="min-w-0 text-base font-bold" style={{ color: "var(--ink)" }}>
                  {group.title}
                </h2>
                <span className="ml-auto">
                  <Chip tone={count.inDeck >= count.found ? "good" : "neutral"}>
                    {count.inDeck} of {count.found} in your deck
                  </Chip>
                </span>
              </div>

              <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>{group.blurb}</p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/*
                  The app's own button rather than a link painted to look like
                  one. The hand-rolled version set `--surface` on `--accent`,
                  which is a hue's fill carrying text, and axe measured it under
                  4.5 (docs/14-design-system.md: every hue has an ink).
                */}
                <ButtonLink href={`/review/common/${group.slug}`} variant="primary">
                  Start the round
                </ButtonLink>
                <DeepenButton group={group.key} />
              </div>
            </Card>
          );
        })}

          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            Every word on these lists is one the dictionary can teach.{" "}
            <Link
              href="/dictionary/common"
              className="underline"
              style={{ color: "var(--accent-deep)" }}
            >
              See the lists in full
            </Link>
            .
          </p>
        </Stack>
      )}
    </Page>
  );
}
