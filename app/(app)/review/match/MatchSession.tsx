"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Timer, Trophy, X } from "lucide-react";
import { checkAchievements, gradeCard, recordMatchTime } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Confetti } from "@/components/Confetti";
import { Empty, Page, Stat } from "@/components/ui";
import type { Badge } from "@/lib/achievements/badges";

export interface MatchPair {
  cardId: string;
  estonian: string;
  english: string;
}

interface Tile {
  key: string;
  cardId: string;
  text: string;
  side: "et" | "en";
}

/**
 * Tap-the-pairs, Duolingo's match round.
 *
 * It earns its place for one reason: it is the only mode that makes you scan a
 * *set* of words at once rather than answer one card in isolation, which is
 * exactly the retrieval a vocabulary list never trains.
 *
 * Matches do count as reviews — a pair found first time is a Good, a pair that
 * took a wrong guess is a Hard. Recognising a word among seven others under
 * time pressure is genuine recall, and a game whose results vanish is a game
 * nobody plays twice. What it never does is grade something you did not answer:
 * abandoning a round writes nothing.
 */
export function MatchSession({ pairs: initialPairs, best }: { pairs: MatchPair[]; best: number }) {
  /*
    Snapshotted once on mount. This round grades every pair at the end, and the
    refresh that follows hands down a smaller `pairs` prop as those cards leave
    the due pool: the summary would then report the round against a denominator
    that changed after it finished. Same rule as ReviewSession's frozen queue.
  */
  const [pairs] = useState(initialPairs);
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [selected, setSelected] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [seconds, setSeconds] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const startedAt = useRef(0);
  const saved = useRef(false);

  const tiles = useMemo(() => {
    const all: Tile[] = pairs.flatMap((p) => [
      { key: `et-${p.cardId}`, cardId: p.cardId, text: p.estonian, side: "et" as const },
      { key: `en-${p.cardId}`, cardId: p.cardId, text: p.english, side: "en" as const },
    ]);
    return shuffle(all);
  }, [pairs]);

  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => setSeconds(Math.round((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback(async (finalSeconds: number, missMap: Record<string, number>) => {
    if (saved.current) return;
    saved.current = true;
    setPhase("done");

    // A pair found first time is a clean recall; one that took a wrong guess is
    // a Hard. Written through the same path as any other grade, so the review
    // log and FSRS see exactly what happened.
    for (const pair of pairs) {
      const rating = (missMap[pair.cardId] ?? 0) > 0 ? 2 : 3;
      try {
        await gradeCard(pair.cardId, rating, Math.round((finalSeconds * 1000) / pairs.length));
      } catch {
        // A failed write costs this one card's rep, not the round.
      }
    }

    const result = await recordMatchTime(finalSeconds);
    setIsNewBest(result.isNewBest);
    const check = await checkAchievements({ count: pairs.length, accuracy: accuracyFrom(missMap, pairs.length) });
    if (check.ok) setNewBadges(check.newBadges);
  }, [pairs]);

  const pick = (tile: Tile) => {
    if (phase !== "playing" || matched.has(tile.cardId) || wrong) return;
    if (!selected) { setSelected(tile); return; }
    if (selected.key === tile.key) { setSelected(null); return; }

    if (selected.cardId === tile.cardId && selected.side !== tile.side) {
      const nextMatched = new Set(matched).add(tile.cardId);
      setMatched(nextMatched);
      setSelected(null);
      if (nextMatched.size === pairs.length) {
        const finalSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        setSeconds(finalSeconds);
        void finish(finalSeconds, misses);
      }
      return;
    }

    // Wrong pair: flash both, count it against the card being learned.
    setWrong([selected.key, tile.key]);
    setMisses((m) => ({ ...m, [tile.cardId]: (m[tile.cardId] ?? 0) + 1, [selected.cardId]: (m[selected.cardId] ?? 0) + 1 }));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(50);
    window.setTimeout(() => { setWrong(null); setSelected(null); }, 450);
  };

  if (pairs.length === 0) {
    return (
      <Page title="Match" lead="Pair the Estonian with its meaning, against the clock.">
        <Empty
          title="Not enough cards to make a round"
          body="Match needs at least four words in your deck. Start a unit on the path and come straight back."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      </Page>
    );
  }

  if (phase === "ready") {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center md:px-10">
        <div className="pop-in rounded-[var(--r-xl)] px-6 py-12" style={{ background: "var(--mint-soft)" }}>
          <span
            className="float mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "var(--surface)", color: "var(--mint-ink)", boxShadow: "var(--shadow)" }}
          >
            <Timer size={30} aria-hidden />
          </span>
          <h1 className="est mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Match
          </h1>
          <p className="mx-auto mt-2 max-w-[44ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {pairs.length} pairs. Tap an Estonian word, then its meaning, as fast as you can. Pairs you
            get first time count as a clean review.
          </p>
          {best > 0 && (
            <p
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
              style={{ background: "var(--surface)", color: "var(--mint-ink)" }}
            >
              <Trophy size={14} aria-hidden /> Personal best: {best}s
            </p>
          )}
          <div className="mt-7">
            <Button
              variant="primary"
              size="lg"
              className="px-10"
              onClick={() => { startedAt.current = Date.now(); setPhase("playing"); }}
            >
              Start the clock
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const missed = Object.values(misses).reduce((s, n) => s + n, 0);
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <Confetti count={40} />
        <h1 className="est text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          All matched!
        </h1>
        <p className="mt-2 flex items-center gap-2 text-base" style={{ color: "var(--ink-2)" }}>
          {isNewBest && <Trophy size={17} aria-hidden style={{ color: "var(--hard-ink)" }} />}
          {isNewBest ? "New personal best." : best > 0 ? `Best so far: ${best}s.` : "First round recorded."}
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-[var(--r-lg)] border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={`${seconds}s`} label="Time" tone="var(--accent-deep)" />
          <Stat value={pairs.length} label="Pairs" />
          <Stat value={missed} label="Wrong taps" tone={missed === 0 ? "var(--good)" : undefined} />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/review/match" variant="primary">Another round</ButtonLink>
          <ButtonLink href="/practice">Other modes</ButtonLink>
          <ButtonLink href="/">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Same line as every
          other mode: the start screen and the finished screen each carry one
          and the round itself did not. */}
      <h1 className="sr-only">Match</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="End round"
          className="press flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={18} aria-hidden />
        </Link>
        <div
          className="tnum flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold"
          style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}
        >
          <Timer size={14} aria-hidden /> {seconds}s
        </div>
        <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
          {matched.size}/{pairs.length}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => {
          const isMatched = matched.has(tile.cardId);
          const isSelected = selected?.key === tile.key;
          const isWrong = wrong?.includes(tile.key) ?? false;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => pick(tile)}
              disabled={isMatched}
              lang={tile.side === "et" ? "et" : "en"}
              aria-pressed={isSelected}
              className={`${tile.side === "et" ? "est text-md font-semibold " : "text-base "}press flex min-h-[84px] items-center justify-center rounded-[var(--r-lg)] px-3 py-3 text-center transition-ui hover:-translate-y-0.5 disabled:hover:translate-y-0`}
              style={{
                background: isMatched
                  ? "var(--mint-soft)"
                  : isWrong
                    ? "var(--again-soft)"
                    : isSelected
                      ? "var(--accent-deep)"
                      : tile.side === "et" ? "var(--accent-soft)" : "var(--surface)",
                color: isMatched
                  ? "var(--good-ink)"
                  : isWrong
                    ? "var(--again-ink)"
                    : isSelected
                      ? "var(--accent-ink)"
                      : tile.side === "et" ? "var(--accent-deep)" : "var(--ink)",
                boxShadow: isMatched || isSelected ? "none" : "var(--shadow-sm)",
                outline: isWrong ? "2px solid var(--again)" : "none",
                outlineOffset: -2,
                opacity: isMatched ? 0.5 : 1,
                transform: isSelected ? "scale(0.97)" : undefined,
              }}
            >
              {tile.text}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-center text-xs" style={{ color: "var(--ink-3)" }}>
        <span style={{ color: "var(--accent-deep)" }}>Estonian</span> on the lilac tiles, its meaning
        on the white ones. Wrong taps just cost you time.
      </p>
    </div>
  );
}

function accuracyFrom(misses: Record<string, number>, pairs: number): number {
  const clean = pairs - Object.values(misses).filter((n) => n > 0).length;
  return pairs > 0 ? Math.round((clean / pairs) * 100) : 0;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
