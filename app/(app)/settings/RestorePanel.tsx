"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Upload } from "lucide-react";
import { inspectBackup, restoreBackup, type RestoreSummary } from "@/app/actions";
import { Button } from "@/components/Button";

type Mode = "merge" | "replace";

/**
 * Restoring a backup. Merge is the default and cannot lose anything — rows are
 * written by their original id, so restoring the same file twice is a no-op.
 * Replace is destructive and asks for the word to be typed out.
 */
export function RestorePanel({ currentReviews }: { currentReviews: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [json, setJson] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [mode, setMode] = useState<Mode>("merge");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = async (file: File | undefined) => {
    setError(null); setDone(null); setSummary(null); setJson(null);
    if (!file) return;
    setFilename(file.name);
    const text = await file.text();
    const result = await inspectBackup(text);
    if (!result.ok) { setError(result.error); return; }
    setJson(text);
    setSummary(result.summary);
  };

  const submit = () => {
    if (!json) return;
    setError(null);
    start(async () => {
      const result = await restoreBackup(json, mode);
      if (!result.ok) { setError(result.error); return; }
      setDone(
        mode === "merge"
          ? `Merged in ${result.summary.words} words, ${result.summary.cards} cards and ${result.summary.reviews} reviews. Nothing was removed.`
          : `Replaced everything with the backup: ${result.summary.words} words, ${result.summary.cards} cards, ${result.summary.reviews} reviews.`,
      );
      setJson(null); setSummary(null); setConfirmText("");
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const replaceBlocked = mode === "replace" && confirmText.trim().toLowerCase() !== "replace";

  return (
    <div>
      <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
        Restore from a backup file — after moving to a new computer, or to undo something. A backup
        you have never restored is only a hypothesis, so it is worth trying once while nothing is
        at stake.
      </p>

      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Choose a backup file"
          onChange={(e) => void pick(e.target.files?.[0])}
          className="text-[13.5px] file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-[var(--accent-soft)] file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-[var(--accent-deep)]"
          style={{ color: "var(--ink-2)" }}
        />
      </div>

      {summary && (
        <div className="mt-4 rounded-[var(--r-lg)] p-5" style={{ background: "var(--raised)" }}>
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            <span style={{ color: "var(--ink)" }}>{filename}</span> holds{" "}
            <span className="tnum">{summary.words}</span> words,{" "}
            <span className="tnum">{summary.cards}</span> cards,{" "}
            <span className="tnum">{summary.reviews}</span> reviews and{" "}
            <span className="tnum">{summary.tasks}</span> tasks.
          </p>

          <fieldset className="mt-4">
            <legend className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>How should it go in?</legend>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
                <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} className="mt-1" />
                <span>
                  <span style={{ color: "var(--ink)" }}>Merge — nothing is deleted</span>
                  <span className="block text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    Adds what is missing and leaves everything else alone. Safe to run twice.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
                <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-1" />
                <span>
                  <span style={{ color: "var(--ink)" }}>Replace everything</span>
                  <span className="block text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    Wipes the current deck first. Only use this to roll back to the backup exactly.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {mode === "replace" && (
            <div
              className="mt-4 rounded-[var(--r)] px-4 py-3.5"
              style={{ background: "var(--again-soft)", color: "var(--again)" }}
            >
              <p className="flex items-start gap-2 text-[13px]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  This deletes the {currentReviews} review{currentReviews === 1 ? "" : "s"} currently
                  in the app. Review history cannot be recreated. Type <strong>replace</strong> to confirm.
                </span>
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                aria-label="Type replace to confirm"
                placeholder="replace"
                className="mt-2.5 rounded border px-2.5 py-1.5 text-[13.5px]"
                style={{ borderColor: "var(--again)", background: "var(--surface)", color: "var(--ink)" }}
              />
            </div>
          )}

          <div className="mt-4">
            <Button
              variant={mode === "replace" ? "danger" : "primary"}
              onClick={submit}
              disabled={pending || replaceBlocked}
            >
              <Upload size={15} aria-hidden />
              {pending ? "Restoring…" : mode === "merge" ? "Merge this backup in" : "Replace everything"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-[13.5px]" style={{ color: "var(--again)" }}>{error}</p>}
      {done && <p className="mt-3 text-[13.5px]" style={{ color: "var(--good)" }}>{done}</p>}
    </div>
  );
}
