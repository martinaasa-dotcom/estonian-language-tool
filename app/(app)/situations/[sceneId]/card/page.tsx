import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { PrintButton } from "@/components/PrintButton";
import { Speak } from "@/components/Speak";
import { Chip } from "@/components/ui";
import { unitById } from "@/lib/collections/syllabus";
import { sceneMaterial } from "@/lib/progress/scenes";
import { sceneById } from "@/lib/scenes/catalogue";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const scene = sceneById(sceneId);
  return { title: scene ? `${scene.title} · before you go in` : "Before you go in" };
}

/**
 * The card to take with you.
 *
 * A scene's beats, in order, with the goal of each in English and the
 * recorded sentences the dictionary can vouch for under it: what the other
 * side is likely to say, with a speaker button on the screen and nothing to
 * press on paper. Printable, because the moment somebody wants this is the
 * bus to the appointment, and offline, because the page is cached the way
 * every page is.
 *
 * Nothing here is written for the card. Every Estonian line is one a
 * lexicographer recorded, and a beat nothing recorded fits says so rather
 * than making one up.
 */
export default async function BeforeYouGoIn({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const scene = sceneById(sceneId);
  if (!scene) notFound();
  await requireUserId();
  const material = await sceneMaterial(scene.id);
  if (!material) notFound();
  const unit = unitById(scene.tests);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 md:px-10 md:py-12">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/situations/${scene.id}`} className="inline-flex items-center gap-1 text-sm" style={{ color: "var(--ink-2)" }}>
          <ArrowLeft size={14} aria-hidden /> Back to the situation
        </Link>
        <PrintButton label="Print this card" />
      </div>
      <header>
        <p className="label-xs" style={{ color: "var(--accent-deep)" }}>Before you go in · {scene.level}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>{scene.title}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{scene.place}. {unit ? unit.canDo : ""}</p>
      </header>
      <ol className="mt-6 flex flex-col gap-5">
        {scene.beats.map((beat, i) => {
          const lines = material.lines.get(beat.id) ?? [];
          return (
            <li key={beat.id} className="flex flex-col gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {i + 1}. {beat.goal}
              </p>
              {lines.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {lines.slice(0, 3).map((l) => (
                    <li key={l.text} className="flex items-center gap-2">
                      <span lang="et" className="text-base" style={{ color: "var(--ink)" }}>{l.text}</span>
                      <span className="no-print"><Speak text={l.text} size={13} /></span>
                      <span className="no-print"><Chip>recorded under <span lang="et">{l.lemma}</span></Chip></span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                  Nothing recorded fits this turn, so it is not written here. In the scene it is composed and checked, or they wait.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-xs" style={{ color: "var(--ink-3)" }}>
        Every line is a sentence a lexicographer recorded, with the word it illustrates beside it. Nothing on this card was written for it.
      </p>
    </div>
  );
}
