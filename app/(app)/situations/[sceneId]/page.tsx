import { notFound, redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/session";
import { unitById } from "@/lib/collections/syllabus";
import { clientMaterial, recentDraws, sceneMaterial } from "@/lib/progress/scenes";
import { sceneById } from "@/lib/scenes/catalogue";
import { difficultyFrom } from "@/lib/scenes/curveballs";
import { drawPlan } from "@/lib/scenes/draw";
import { resolveProviders } from "@/lib/tutor/provider";
import { SceneSession } from "./SceneSession";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  return { title: sceneById(sceneId)?.title ?? "Situations" };
}

/**
 * One conversation, drawn from a seed that lives in the URL.
 *
 * The exam's shape (ADR-022): a run is a pure function of (scene, seed,
 * difficulty), so a reload gives the same conversation back and the server
 * can draw the same plan again to read the finished run. A visit with no
 * seed is sent to one, which is what makes "try it again" a link.
 */
export default async function ScenePage({ params, searchParams }: {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<{ seed?: string; d?: string }>;
}) {
  const { sceneId } = await params;
  const { seed, d } = await searchParams;
  const scene = sceneById(sceneId);
  if (!scene) notFound();

  const difficulty = difficultyFrom(d ?? 2);
  if (!seed) {
    const fresh = Math.random().toString(36).slice(2, 10);
    redirect(`/situations/${scene.id}?seed=${fresh}&d=${difficulty}`);
  }

  const ownerId = await requireUserId();
  const [material, drawn] = await Promise.all([sceneMaterial(scene.id), recentDraws(ownerId, scene.id)]);
  if (!material) notFound();

  const plan = drawPlan({
    scene, seed: seed.slice(0, 40), difficulty, glossOf: material.glossOf,
    recentProps: drawn.props, recentCurveballs: drawn.curveballs,
  });

  return (
    <SceneSession
      scene={{ id: scene.id, title: scene.title, place: scene.place, level: scene.level, register: scene.register, tests: scene.tests }}
      plan={plan}
      material={clientMaterial(material, plan)}
      aiAvailable={resolveProviders().length > 0}
      canDo={unitById(scene.tests)?.canDo ?? ""}
    />
  );
}
