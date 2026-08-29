"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { deleteMyAccount } from "@/app/actions";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Deleting everything.
 *
 * Behind a disclosure and a typed confirmation, and the copy leads with the
 * export rather than the button: almost everyone who arrives here wants a copy
 * first, and the review history is the part that cannot be recreated.
 */
export function DangerZone({ counts }: { counts: { cards: number; reviews: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteMyAccount(confirmation);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Signing out here as well: the data is gone, so a session pointing at it
      // would show a stranger's-eye view of an empty app rather than a sign-in.
      await createClient().auth.signOut().catch(() => {});
      router.push("/sign-in");
      router.refresh();
    } catch {
      setError("That did not complete. Nothing was deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionTitle>Deleting your data</SectionTitle>
      <Card>
        <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
          You can remove everything this app holds about you: {counts.cards} cards,{" "}
          {counts.reviews} reviews, your tasks, your conversations with Anu, your badges and your
          settings. The shared dictionary stays, because other learners have cards built on it.
        </p>
        <p className="mt-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
          Download a backup first if there is any chance you will want it. Your review history
          cannot be recreated, and this does not keep a copy.
        </p>

        {!open ? (
          <div className="mt-4">
            <Button variant="danger" onClick={() => setOpen(true)}>
              Delete everything
            </Button>
          </div>
        ) : (
          <div
            className="mt-4 rounded-md px-3.5 py-3.5"
            style={{ background: "var(--again-soft)", color: "var(--again)" }}
          >
            <p className="flex items-start gap-2 text-[13.5px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                This cannot be undone. Type <strong>delete</strong> to confirm.
              </span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                aria-label="Type delete to confirm"
                placeholder="delete"
                className="rounded border px-2.5 py-1.5 text-[13.5px]"
                style={{
                  borderColor: "var(--again)", background: "var(--surface)", color: "var(--ink)",
                }}
              />
              <Button
                variant="danger"
                disabled={busy || confirmation.trim().toLowerCase() !== "delete"}
                onClick={() => void remove()}
              >
                {busy
                  ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Deleting…</>
                  : "Delete everything permanently"}
              </Button>
              <Button onClick={() => { setOpen(false); setConfirmation(""); setError(null); }}>
                Cancel
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-2.5 text-[13px]">{error}</p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
