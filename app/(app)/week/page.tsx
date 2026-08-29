import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { getCurrentWeek } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * `/week` has no content of its own — it means "the week I am in".
 *
 * Falls back to the highest week anything is filed under, then to week 1, so the
 * link is never a dead end for someone who has not set a week yet.
 */
export default async function WeekIndex() {
  const ownerId = await requireUserId();
  const current = await getCurrentWeek();
  if (current) redirect(`/week/${current}`);

  const [latestTask, latestCard] = await Promise.all([
    prisma.task.findFirst({
      where: { ownerId, classWeek: { not: null } },
      orderBy: { classWeek: "desc" },
      select: { classWeek: true },
    }),
    prisma.card.findFirst({
      where: { ownerId, classWeek: { not: null } },
      orderBy: { classWeek: "desc" },
      select: { classWeek: true },
    }),
  ]);

  const best = Math.max(latestTask?.classWeek ?? 0, latestCard?.classWeek ?? 0);
  redirect(`/week/${best > 0 ? best : 1}`);
}
