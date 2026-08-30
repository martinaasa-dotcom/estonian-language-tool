import { notFound, redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth/session";
import { paperFor } from "@/lib/progress/exam";
import { isExamLevel } from "@/lib/exam/spec";
import { fillRate } from "@/lib/exam/paper";
import { ExamSession } from "./ExamSession";

export async function generateMetadata({ params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  const upper = level.toUpperCase();
  return { title: isExamLevel(upper) ? `${upper} mock exam` : "Mock exam" };
}

export const dynamic = "force-dynamic";

/**
 * One sitting.
 *
 * The paper is built here, on the server, from a seed that lives in the URL.
 * That is not a detail: `buildPaper` is deterministic in (level, seed, pool), so
 * a learner who reloads mid-listening gets the paper back rather than a fresh
 * one, and `submitExam` can rebuild the same paper to mark it without the client
 * ever sending the questions or the answers it thinks are right.
 *
 * A visit with no seed is redirected to one carrying a fresh seed, which is what
 * makes "another paper" a link rather than a piece of state.
 */
export default async function ExamLevelPage({ params, searchParams }: {
  params: Promise<{ level: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { level } = await params;
  const { seed } = await searchParams;
  const upper = level.toUpperCase();
  if (!isExamLevel(upper)) notFound();

  if (!seed) {
    // Base 36 of a random draw: short enough to read out, long enough that two
    // learners sitting at once do not get the same paper.
    const fresh = Math.random().toString(36).slice(2, 10);
    redirect(`/exam/${upper}?seed=${fresh}`);
  }

  const ownerId = await requireUserId();
  const paper = await paperFor(ownerId, upper, seed);

  return <ExamSession paper={paper} fillRate={fillRate(paper)} />;
}
