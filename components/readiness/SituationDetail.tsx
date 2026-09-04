import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Meter, Note, SectionTitle } from "@/components/ui";
import { EVIDENCE_NOTE } from "@/lib/exam/readiness";
import {
  CONVERSATIONAL_MS, RUNG_LABEL, SLOW_MS, wordStanding, type Reading,
} from "@/lib/readiness/rungs";
import type { WordEvidence } from "@/lib/readiness/evidence";
import { paceWords, verdictFor } from "@/lib/readiness/narrative";
import { RUNG_INK, RungChip } from "./Rung";

/**
 * One situation, in full: the verdict, the three rungs as three bars, what
 * stands in the way of the next one, and the thing worth going out and doing.
 *
 * The struggles are the point of the page and come before the encouragement,
 * because somebody who reads "you could take part" and stops has read the
 * headline; the line under it about pace is what they meet at the counter.
 * The encouragement is real and is printed only once the log supports it.
 */
export function SituationDetail({
  reading, words,
}: {
  reading: Reading;
  /** The situation's words with their evidence, for the list at the bottom. */
  words: readonly { lemma: string; gloss: string; evidence: WordEvidence | undefined }[];
}) {
  const { situation, rung, at, total, pace, struggles, evidence } = reading;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const missing = words.filter((w) => {
    const s = wordStanding(w.evidence);
    return s === "unmet" || s === "met";
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <RungChip rung={rung} />
          <Chip tone="neutral">{situation.level}</Chip>
          {situation.live && <Chip tone="sky">A live exchange</Chip>}
        </div>
        <p className="mt-3 text-lg font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          {verdictFor(reading)}
        </p>
        {rung === "unmet" ? (
          <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
            The log has nothing on these {total} words. The unit is where they come from.
          </p>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
            {EVIDENCE_NOTE[evidence]} {reading.answers} answers on {total} words, and none of them heard.
          </p>
        )}
        {reading.uncapped !== rung && (
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            The answers so far would say {RUNG_LABEL[reading.uncapped].toLowerCase()}. It is held here until there are more of them.
          </p>
        )}
      </Card>

      <section>
        <SectionTitle hint="counted in words, and a share is not an average">The three rungs</SectionTitle>
        <Card>
          <ul className="flex flex-col gap-4">
            <Bar
              label="Follow it" ink={RUNG_INK.follow} n={at.follow} total={total} pct={pct(at.follow)}
              what="Words you know when you see them. The rung a vocabulary percentage measures, and the lowest."
            />
            <Bar
              label="Take part" ink={RUNG_INK.takePart} n={at.takePart} total={total} pct={pct(at.takePart)}
              what="Words you have produced right more than once, and the last time. Answering is producing."
            />
            <Bar
              label="Lead it" ink={RUNG_INK.lead} n={at.lead} total={total} pct={pct(at.lead)}
              what={situation.live
                ? "Solid in more than one form, at pace, with the endings and the numbers it runs on, and some evidence you can follow speech."
                : "Solid in more than one form, with the endings it turns on."}
            />
          </ul>
        </Card>
      </section>

      {situation.live && rung !== "unmet" && (
        <section>
          <SectionTitle hint="typed answers, so generous rather than tight">Pace</SectionTitle>
          <Card>
            {pace.medianMs === null ? (
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                Not enough timed answers on these words to say how fast they come. Knowing a word and reaching it in two seconds are different things, and only the second one is any use when somebody is waiting.
              </p>
            ) : (
              <>
                <p className="text-base" style={{ color: "var(--ink)" }}>
                  These words come to you in about {paceWords(pace.medianMs)} each, over {pace.timedWords} of them.
                </p>
                <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
                  {pace.label === "quick"
                    ? "Quick enough to answer before the other person fills the silence."
                    : pace.label === "steady"
                      ? "Enough to answer a patient person. Leading means reaching for the next word while they are still finishing the last one."
                      : "A pause somebody at a counter will fill for you, usually in English. Speed is drilled separately from knowing."}
                </p>
                <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                  Read off correct typed answers, typing included. Under {CONVERSATIONAL_MS / 1000} seconds is called quick and over {SLOW_MS / 1000} slow, which are assumptions, so the seconds are printed beside the word.
                </p>
              </>
            )}
          </Card>
        </section>
      )}

      {struggles.length > 0 && (
        <section>
          <SectionTitle hint="what is in the way first">Where it would go wrong</SectionTitle>
          <ul className="flex flex-col gap-3">
            {struggles.map((s) => (
              <li key={s.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="neutral">stands in the way of {RUNG_LABEL[s.blocks].toLowerCase()}</Chip>
                  </div>
                  <p className="mt-2 font-semibold" style={{ color: "var(--ink)" }}>{s.title}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{s.detail}</p>
                  {s.href && s.cta && (
                    <div className="mt-3">
                      <ButtonLink href={s.href} size="sm">{s.cta}</ButtonLink>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reading.tryThis ? (
        <section>
          <SectionTitle hint="the log says you have enough for it">Try it for real</SectionTitle>
          <Card tone="mint">
            <p className="text-base font-semibold" style={{ color: "var(--mint-ink)" }}>{reading.tryThis}</p>
            {situation.expect && (
              <p className="mt-2 text-sm" style={{ color: "var(--mint-ink)" }}>What comes back: {situation.expect}</p>
            )}
            <p className="mt-2 text-sm" style={{ color: "var(--mint-ink)" }}>
              It will go less smoothly than a card, and that is the point. What you could not say is what to look up afterwards.
            </p>
          </Card>
        </section>
      ) : situation.expect ? (
        <Note tone="neutral">
          When you do try this, expect {situation.expect.charAt(0).toLowerCase()}{situation.expect.slice(1)}
        </Note>
      ) : null}

      {missing.length > 0 && (
        <section>
          <SectionTitle hint={`${missing.length} of ${total}`}>Words not there yet</SectionTitle>
          <Card>
            <ul className="flex flex-wrap gap-2">
              {missing.map((w) => (
                <li key={w.lemma}>
                  <Link
                    href={`/dictionary?q=${encodeURIComponent(w.lemma)}`}
                    className="tap-tint inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                    style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
                  >
                    <span lang="et" className="font-semibold">{w.lemma}</span>
                    <span className="text-xs" style={{ color: "var(--ink-3)" }}>{w.gloss}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {situation.live && (
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          Nothing on this page has heard you speak. How you sound is yours to judge, in{" "}
          <Link href="/review/speaking" className="underline" style={{ color: "var(--accent-deep)" }}>speaking practice</Link>
          , and no number here pretends otherwise.
        </p>
      )}
    </div>
  );
}

function Bar({ label, ink, n, total, pct, what }: {
  label: string; ink: string; n: number; total: number; pct: number; what: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold" style={{ color: ink }}>{label}</span>
        <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>{n} of {total} words</span>
      </div>
      <div className="mt-1.5">
        <Meter pct={pct} label={`${label}: ${n} of ${total} words`} tone={ink} height={7} />
      </div>
      <p className="mt-1.5 text-xs" style={{ color: "var(--ink-3)" }}>{what}</p>
    </li>
  );
}
