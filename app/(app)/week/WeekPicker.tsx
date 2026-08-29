"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setCurrentWeek } from "@/app/actions";
import { Button } from "@/components/Button";

/**
 * Sets which week the course is in.
 *
 * Only one control, because there is only one decision: everything added from
 * now on is filed under this number. Marking the week you are viewing as current
 * is the common case, so that is the button.
 */
export function WeekPicker({ current, viewing }: { current: number | null; viewing: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (current === viewing) {
    return (
      <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--good)" }}>
        <Check size={14} aria-hidden /> Current week
      </span>
    );
  }

  return (
    <Button
      disabled={pending}
      onClick={() => start(async () => {
        await setCurrentWeek(viewing);
        router.refresh();
      })}
    >
      {pending
        ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Setting…</>
        : `Make week ${viewing} current`}
    </Button>
  );
}
