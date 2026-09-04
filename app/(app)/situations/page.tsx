import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { bandsAround } from "@/lib/collections/levels";
import { SCENES } from "@/lib/scenes/catalogue";
import { minutesFor } from "@/lib/scenes/run";
import { unitById } from "@/lib/collections/syllabus";
import { Card, Chip, Empty, Page, Stack } from "@/components/ui";
import { ButtonLink } from "@/components/Button";

export const metadata = { title: "Situations" };
export const dynamic = "force-dynamic";

/**
 * Choosing a conversation to have.
 *
 * Each one says where you are standing, what you would be trying to get done,
 * and how long it takes, which is what somebody deciding whether they have time
 * for one actually needs (`docs/19-situations.md` §13).
 *
 * A scene is offered one band either side of the learner's level, through
 * `lib/collections/levels.ts`, which is the same table the minimal pairs round
 * and the government drill draw from. A second answer to "what is around this
 * learner's level" is how the first one rots.
 *
 * The difficulty dial sits on the scene rather than in Settings, because it is
 * a decision about this conversation rather than a preference about the app,
 * and because somebody who found the last one hard should be able to turn it
 * down at the moment they feel that rather than two screens away.
 */
export default async function SituationsPage() {
  await requireUserId();
  const level = await courseLevelFor(await requireUserId());
  const band = bandsAround(level);

  const near = SCENES.filter((scene) => band.includes(scene.level));
  const rest = SCENES.filter((scene) => !band.includes(scene.level));

  return (
    <Page
      title="Situations"
      lead="A conversation with somebody who wants something from you."
    >
      <Stack>
        {near.length === 0 && rest.length === 0 ? (
          /*
            The empty state is a door rather than an explanation, and its body
            stays under 100 characters. There is nothing to explain here that
            opening one would not explain better.
          */
          <Empty
            title="No conversations at your level yet"
            body="More are on the way. The practice rounds are the shortest way in meanwhile."
            action={<ButtonLink href="/practice">Practice</ButtonLink>}
          />
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {near.map((scene) => <SceneTile key={scene.id} scene={scene} />)}
            </ul>
            {rest.length > 0 && (
              <div>
                <p className="mb-3 text-sm" style={{ color: "var(--ink-3)" }}>
                  Above or below where you are. Still worth a try.
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {rest.map((scene) => <SceneTile key={scene.id} scene={scene} />)}
                </ul>
              </div>
            )}
          </>
        )}

        {/*
          Said once, before anybody starts, because it is the answer to a
          question a careful person would otherwise have to ask: nothing you
          type here is about you (§3). It is one line rather than a panel.
        */}
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          You are handed a card and play somebody else. Nothing you write is about you,
          and no conversation here asks for a real document number.
        </p>
      </Stack>
    </Page>
  );
}

function SceneTile({ scene }: { scene: (typeof SCENES)[number] }) {
  const unit = unitById(scene.tests);
  const objectives = scene.beats.filter((beat) => beat.required).length;
  return (
    <li>
      <Link href={`/situations/${scene.id}`} className="block h-full">
        <Card hover className="flex h-full flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-medium">{scene.title}</h2>
            <Chip tone="neutral">{scene.level}</Chip>
          </div>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>{scene.place}</p>
          <p className="mt-auto text-xs" style={{ color: "var(--ink-3)" }}>
            {objectives} things to get done · about {minutesFor(scene)} min
            {unit ? ` · ${unit.title}` : ""}
          </p>
        </Card>
      </Link>
    </li>
  );
}
