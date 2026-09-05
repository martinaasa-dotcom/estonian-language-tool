"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Check, CloudOff, Image as ImageIcon, Loader2, Pencil, Search, Sparkles, X,
} from "lucide-react";
import { saveScan, resolveScannedWord } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { useOffline } from "@/components/OfflineProvider";
import { SuggestFix } from "@/components/SuggestFix";
import { Card, Chip, Note } from "@/components/ui";
import { MAX_EDGE } from "@/lib/scan/image";
import { MAX_ITEMS } from "@/lib/scan/extract";
import { summarise, type ResolvedItem } from "@/lib/scan/items";

/** A row on screen: what came back, plus whether the learner still wants it. */
interface Row extends ResolvedItem {
  keep: boolean;
}

type Phase = "idle" | "reading" | "review" | "saving" | "saved";

/**
 * Point a camera at a page, get the vocabulary off it.
 *
 * THE CONFIRMATION STEP IS THE FEATURE, not an obstacle in front of it. A
 * model read the photograph and the dictionary vouched for the words it
 * recognized, but the only person who can say what is actually printed on the
 * paper is the one holding it. So every word arrives ticked but editable, each
 * row says plainly whether the dictionary knows it, and nothing becomes a
 * flashcard until somebody has said yes. That is the same standard the paste
 * importer meets, and it is what keeps ADR-005 intact on a path where a model
 * is, unavoidably, the thing reading Estonian.
 *
 * The picture is shrunk here rather than sent whole: a modern phone camera
 * produces twelve megapixels, no model needs more than sixteen hundred pixels
 * to read printed text, and the difference is the whole upload on a bus.
 */
export function ScanCapture() {
  const router = useRouter();
  const { online } = useOffline();

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [readBy, setReadBy] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState<{ id: string; words: number; cards: number } | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setPhase("idle");
    setPreview(null);
    setRows([]);
    setError(null);
    setReadBy(null);
    setEditing(null);
    setSaved(null);
  };

  const read = async (file: File) => {
    setError(null);
    setEditing(null);
    setPhase("reading");
    try {
      const dataUrl = await shrink(file);
      setPreview(dataUrl);

      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const body = (await response.json()) as { items?: ResolvedItem[]; error?: string };
      if (!response.ok) {
        setError(body.error ?? "We couldn't read that photo.");
        setPhase("idle");
        return;
      }

      const found = body.items ?? [];
      if (found.length === 0) {
        setError(
          "We couldn't find any Estonian words on that. Try a flatter angle, more light, and " +
          "filling the frame with just the list.",
        );
        setPhase("idle");
        return;
      }

      setReadBy(
        `${response.headers.get("x-model-provider") ?? ""} ${response.headers.get("x-model-id") ?? ""}`.trim(),
      );
      setRows(found.map((item) => ({ ...item, keep: true })));
      setTitle(defaultTitle());
      setPhase("review");
    } catch {
      setError("We couldn't send that photo. Check your connection and try again.");
      setPhase("idle");
    }
  };

  const onPick = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    // Cleared straight away so picking the same file twice still fires a change.
    if (input) input.value = "";
    if (file) void read(file);
  };

  const update = (index: number, patch: Partial<Row>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  /** Re-checks a corrected spelling, and reaches Ekilex when it is configured. */
  const recheck = (index: number) => {
    const row = rows[index];
    if (!row) return;
    start(async () => {
      const result = await resolveScannedWord(row.et);
      if (!result.ok || !result.item) return;
      update(index, { ...result.item, keep: true });
    });
  };

  const kept = rows.filter((r) => r.keep);
  const summary = summarise(kept);

  const save = (addCards: boolean) => {
    setPhase("saving");
    start(async () => {
      const result = await saveScan({
        title,
        items: kept.map(({ keep: _keep, ...item }) => item),
        addCards,
      });
      if (!result.ok) {
        setError(result.error);
        setPhase("review");
        return;
      }
      setSaved({ id: result.id, words: result.words, cards: result.cards });
      setPhase("saved");
      router.refresh();
    });
  };

  if (!online && phase === "idle") {
    return (
      <Card tone="sky">
        <div className="flex items-start gap-3">
          <CloudOff size={18} aria-hidden style={{ color: "var(--sky-ink)" }} />
          <div>
            <p className="font-semibold" style={{ color: "var(--ink)" }}>
              Reading a page needs a connection.
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
              Review still works offline, and so does everything already in your deck. Come back to
              this when you have signal, or type the list in from Settings.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (phase === "saved" && saved) {
    return (
      <Card tone="mint" className="pop-in">
        <div className="flex items-start gap-3">
          <Check size={20} aria-hidden style={{ color: "var(--good-ink)" }} />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
              {title} is saved.
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
              {saved.words} word{saved.words === 1 ? "" : "s"} on the page
              {saved.cards > 0
                ? `, and ${saved.cards} card${saved.cards === 1 ? "" : "s"} are in your deck.`
                : ". Nothing has been added to your deck yet."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {/*
                A DOCUMENT LOAD, NOT `router.push`. `AddWord` records the same
                finding at length and reached it first: a push issued next to a
                Server Action's own `revalidatePath` is dropped often enough to
                measure, and the browser stays on the screen it was already on.

                Measured here rather than assumed. The handler was instrumented
                with a counter and, on a failing run, it had run exactly once:
                React dispatched the click, the component called the router, and
                the navigation never happened. Three times in ten runs against a
                warm server the learner tapped "Open the page", stayed on the
                capture screen, and had to tap again. Moving the neighbouring
                `router.refresh()`, and removing `revalidatePath("/scan")` from
                the action, each left it failing at the same rate.

                This is the tap that finishes the whole paper-to-deck path, so it
                may not be best-effort. The destination is `force-dynamic` and
                renders fresh on arrival.
              */}
              <Button variant="primary" onClick={() => window.location.assign(`/scan/${saved.id}`)}>
                Open the page
              </Button>
              <Button variant="secondary" onClick={reset}>
                <Camera size={15} aria-hidden />
                Scan another
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (phase === "review" || phase === "saving") {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <label htmlFor="scan-title" className="label-xs block" style={{ color: "var(--ink-3)" }}>
            What is this page?
          </label>
          <input
            id="scan-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="field-lg mt-2 w-full text-base"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
          />

          <p className="mt-4 text-sm" style={{ color: "var(--ink-2)" }}>
            {summary.total} word{summary.total === 1 ? "" : "s"} ticked
            {summary.known > 0 && <> · {summary.known} matched the dictionary</>}
            {summary.inflected > 0 && <> · {summary.inflected} in an inflected form</>}
          </p>
          {readBy && (
            <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
              Read by {readBy}. Check it against the paper before you add anything.
            </p>
          )}
        </Card>

        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={`${row.et}-${index}`}>
              <ScanRow
                row={row}
                editing={editing === index}
                busy={pending}
                onToggle={() => update(index, { keep: !row.keep })}
                onEdit={() => setEditing(editing === index ? null : index)}
                onChange={(patch) => update(index, patch)}
                onRecheck={() => recheck(index)}
              />
            </li>
          ))}
        </ul>

        {summary.unknown > 0 && (
          <div className="flex flex-col gap-3">
            <Note tone="again">
              {summary.unknown} of these {summary.unknown === 1 ? "is" : "are"} not in the dictionary
              yet. They came straight off the photo, so open one and check the spelling against the
              paper. Add them as they are and you&apos;ll get a recognition card and a production
              card, but no case forms: there&apos;s nothing verified yet to build those from.
            </Note>
            {/*
              A word the dictionary would not vouch for is a gap in the
              dictionary at least as often as it is a misreading, and the
              person holding the paper is the one who can tell which. Sending
              it costs them nothing and does not hold up their cards.
            */}
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                Spelled right on your paper and still not found? Tell us.
              </p>
              <SuggestFix
                category="MISSING_WORD"
                lemma={rows.find((r) => !r.lexemeId)?.et ?? undefined}
                trigger={`${summary.unknown} word(s) off a photographed page were not in the dictionary.`}
                label="A word here is missing"
              />
            </div>
          </div>
        )}

        {error && <Note tone="again">{error}</Note>}

        <Card className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => save(true)}
            disabled={phase === "saving" || kept.length === 0}
          >
            {phase === "saving" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            Make {kept.length} flashcard{kept.length === 1 ? "" : "s"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => save(false)}
            disabled={phase === "saving" || kept.length === 0}
          >
            Just save the page
          </Button>
          <Button variant="ghost" onClick={reset} disabled={phase === "saving"}>
            Start again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-base" style={{ color: "var(--ink-2)" }}>
          Photograph a vocabulary list, a page from your textbook, or last night&apos;s homework. We
          match the words against the dictionary, so anything it recognizes comes with its real
          forms, and an inflected form on a worksheet gets traced back to the word it belongs to.
        </p>

        {phase === "reading" ? (
          <div className="mt-5 flex items-center gap-4">
            {preview && (
              /*
                A data URL for a picture that exists only in this tab for the
                next few seconds. `next/image` optimizes files it can fetch and
                cache, and there is nothing here to fetch or cache.
              */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className="h-20 w-20 rounded-[var(--r)] object-cover"
                style={{ boxShadow: "var(--shadow-sm)" }}
              />
            )}
            <div>
              <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--ink)" }}>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Reading the page
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                A few seconds. Nothing is stored: the picture is read once and dropped.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            <PickFile
              label="Take a photo"
              icon={<Camera size={17} aria-hidden />}
              capture
              primary
              onPick={onPick}
            />
            <PickFile
              label="Choose a picture"
              icon={<ImageIcon size={17} aria-hidden />}
              onPick={onPick}
            />
          </div>
        )}

        <p className="mt-4 text-sm" style={{ color: "var(--ink-3)" }}>
          One page at a time, up to {MAX_ITEMS} words. The photo is shrunk on this device before it
          is sent, and it is never saved anywhere.
        </p>
      </Card>

      {error && (
        <Note tone="again">
          <span className="flex items-start gap-2">
            <X size={15} aria-hidden className="mt-0.5 shrink-0" />
            {error}
          </span>
        </Note>
      )}
    </div>
  );
}

/**
 * The two ways in, and why they are labels rather than buttons.
 *
 * A button that reaches over and clicks a hidden file input works with a mouse
 * and is a dead end with a keyboard: the thing that actually opens the picker
 * has been taken out of the tab order and stripped of its name, so a screen
 * reader is offered a control that does nothing and a real control it cannot
 * see. Wrapping the input in its own label instead means the input *is* the
 * control, it keeps its accessible name, and it is reached by tabbing like
 * anything else. The label carries the focus ring on its behalf, because the
 * input it contains is clipped to a pixel.
 *
 * Two of them rather than one, because `capture` is not a preference: on a
 * phone it opens the camera and offers no way to reach the photo library, so a
 * page already photographed would be unreachable with only that one.
 */
function PickFile({ label, icon, capture, primary, onPick }: {
  label: string;
  icon: ReactNode;
  capture?: boolean;
  primary?: boolean;
  onPick: (input: HTMLInputElement | null) => void;
}) {
  return (
    <label
      className={
        "press inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border " +
        "px-6 py-3.5 text-base font-semibold transition-ui hover:-translate-y-px " +
        "hover:brightness-[1.04] focus-within:outline focus-within:outline-2 " +
        "focus-within:outline-offset-2 " +
        (primary ? "grad-accent" : "")
      }
      style={
        primary
          ? { color: "var(--accent-ink)", borderColor: "transparent", boxShadow: "var(--shadow-accent)" }
          : {
              background: "var(--surface)", color: "var(--ink)",
              borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)",
            }
      }
    >
      {icon}
      {label}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" as const } : {})}
        className="sr-only"
        onChange={(e) => onPick(e.currentTarget)}
      />
    </label>
  );
}

/**
 * One word, and the two facts that matter about it: is it what the paper says,
 * and does the dictionary know it.
 *
 * Collapsed by default and editable on request. Six diacritic buttons per row
 * on a list of forty words would be a wall, and the row that needs them is the
 * one where a camera read `o` for `õ`, which is a handful per page at most.
 */
function ScanRow({ row, editing, busy, onToggle, onEdit, onChange, onRecheck }: {
  row: Row;
  editing: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onChange: (patch: Partial<Row>) => void;
  onRecheck: () => void;
}) {
  const known = row.lexemeId !== null;

  return (
    <div
      className="rounded-[var(--r-lg)] border px-4 md:px-5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--rule)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center gap-3 py-2">
        <label
          className="flex min-h-11 flex-1 cursor-pointer items-center gap-3"
          style={{ opacity: row.keep ? 1 : 0.5 }}
        >
          <input
            type="checkbox"
            checked={row.keep}
            onChange={onToggle}
            className="h-6 w-6 shrink-0 rounded-[var(--r-sm)]"
            style={{ accentColor: "var(--accent)" }}
          />
          <span className="min-w-0 flex-1">
            <span lang="et" className="block text-base" style={{ color: "var(--ink)" }}>
              {row.et}
            </span>
            <span className="block text-sm" style={{ color: "var(--ink-3)" }}>
              {row.translation ?? row.en ?? ""}
            </span>
          </span>
        </label>

        <div className="flex shrink-0 items-center gap-2">
          {known ? (
            <Chip tone="good">In the dictionary</Chip>
          ) : (
            <Chip tone="again">Read from the photo</Chip>
          )}
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${row.et}`}
            aria-expanded={editing}
            className="press flex h-11 w-11 items-center justify-center rounded-full transition-ui"
            style={{ background: "var(--raised)", color: "var(--ink-2)" }}
          >
            <Pencil size={15} aria-hidden />
          </button>
        </div>
      </div>

      {row.matchedAs && (
        <p className="pb-2 text-sm" style={{ color: "var(--sky-ink)" }}>
          On the page as the {row.matchedAs}
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-3 border-t py-4" style={{ borderColor: "var(--rule-soft)" }}>
          <div>
            <span className="label-xs block pb-2" style={{ color: "var(--ink-3)" }}>
              Estonian, as it is printed
            </span>
            <EstonianInput
              value={row.et}
              onChange={(next) => onChange({ et: next })}
              ariaLabel="Estonian word"
              onEnter={onRecheck}
            />
          </div>
          <div>
            <span className="label-xs block pb-2" style={{ color: "var(--ink-3)" }}>
              English
            </span>
            <input
              value={row.en}
              onChange={(e) => onChange({ en: e.target.value })}
              aria-label="English translation"
              className="field-lg w-full text-base"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </div>
          <div>
            <Button variant="soft" onClick={onRecheck} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} aria-hidden />}
              Look this up again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Page from 29.08", which is what a person would write on a folder tab. */
function defaultTitle(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `Page from ${day}.${month}`;
}

/**
 * Shrinks and re-encodes a photograph before it leaves the device.
 *
 * A phone camera hands over a twelve megapixel HEIC or JPEG. Nothing reading
 * printed text needs more than `MAX_EDGE`, and the difference is several
 * megabytes over whatever connection the learner is on, which is usually the
 * one in a classroom. `createImageBitmap` is asked for the orientation the
 * file declares, so a page photographed in portrait does not arrive on its
 * side and get read as a column of nonsense.
 */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // JPEG rather than PNG: a photograph of paper compresses about fifteen times
  // better, and no model reads the difference.
  return canvas.toDataURL("image/jpeg", 0.82);
}
