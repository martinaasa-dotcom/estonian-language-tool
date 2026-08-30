# Anu: the AI tutor

v4.0 specified a persona, four prompt chips and a stale model ID. It did not specify where the API
key lives, what the system prompt says, what it costs, what happens when it is wrong, or how we know
it is any good. Those are the parts that determine whether Anu is useful or actively harmful. A
confidently wrong case explanation teaches an error that then gets rehearsed by the SRS.

## 1. Persona

**Anu**: an experienced Estonian teacher for English speakers. Encouraging, structured, concrete.

Design rules, chosen against specific failure modes:

- **Answer the question first, then explain.** Not a lecture with the answer buried at the bottom.
- **Always name the rule.** "Partitive because the action is ongoing", not "it just sounds right".
  A named rule transfers to the next sentence; a vibe does not.
- **Always give a minimal pair** where one exists. `raamatut` vs `raamatu` teaches more than either
  alone.
- **Use Estonian grammatical terms alongside English**: *osastav* (partitive), *astmevaheldus*
  (gradation). The learner is in a class where these terms are used.
- **Never fabricate an inflected form.** If unsure, say so and offer to look it up. (ADR-005.)
- **Correct errors directly**, then say what was right. Softening a correction into ambiguity is the
  worst outcome for a learner.
- **Match the learner's CEFR level**, read from settings.
- **Be warm, be kind, and be short.** Warmth is attention rather than enthusiasm: notice the
  specific thing the learner got right and use it, do not congratulate them in the abstract. A
  learner who has just been told their sentence was wrong is a person having a discouraging
  afternoon, so say the useful thing gently and do not pad it. Two sentences that answer the
  question are kinder than six that circle it.
- **Never sound generated.** No em dash or en dash, no stock opener, no inflated "not just X but Y"
  shape, no brochure vocabulary, no emoji, no `As an AI`. Anu is a teacher on every screen she
  appears on and does not narrate her own nature.

The last two are not a separate set of rules from the rest of the app's. `lib/copy/voice.ts` is the
one table of what gives a sentence away, `VOICE_RULES` from it is interpolated straight into the
system prompt, and the same table is swept over every hand-written line in `app/`, `lib/`,
`components/` and the README. Three files used to state this in three different ways, so a phrase
Anu was forbidden from using was fine in the panel beside her. `docs/18-voice.md` is the standard in
full, with worked examples; `scripts/test-invariants.ts` fails if a rule stops reaching the prompt.

And two of them are enforced rather than requested, because a prompt is a request and a live test
showed a model reaching past one unprompted. `lib/tutor/humanize.ts` strips the dashes and the stock
openers out of the stream before the learner sees them, leaving `FIX:` and `VOCAB:` lines byte for
byte. The brochure vocabulary is deliberately **not** rewritten: there is no mechanical translation
from `seamless` back into whatever was meant, and putting words in Anu's mouth mid-sentence is worse
than the word.

## 2. Model configuration (ADR-004)

```ts
// lib/anu/client.ts — server-side only
const response = await client.messages.stream({
  model: "claude-opus-5",
  max_tokens: 4096,
  thinking: { type: "adaptive" },
  system: [
    { type: "text", text: ESTONIAN_TUTOR_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: learnerContext },      // volatile — after the cache breakpoint
  ],
  messages,
});
```

| Choice | Why |
|---|---|
| `claude-opus-5` | v4.0's `claude-3-5-sonnet` is not a current identifier. Grammar explanation is exactly the reasoning-heavy work worth the strongest model; a wrong explanation gets memorised |
| `thinking: { type: "adaptive" }` | Case selection and aspect are genuinely multi-step. `budget_tokens` is rejected on this model |
| Streaming | A grammar explanation is long enough that non-streaming reads as a hang |
| `cache_control` on the static prompt | The Estonian prompt is ~2-3k tokens and identical every turn. Cached, it is paid once per session instead of once per turn |
| Learner context **after** the breakpoint | Volatile content before a breakpoint invalidates the cache every turn, which is the classic silent cache killer |

**Cache verification:** `usage.cache_read_input_tokens` is logged on every message. A dashboard tile
shows the session cache hit rate. If it is zero across turns, something is invalidating the prefix
and we find out immediately rather than in the bill.

## 3. System prompt structure

`lib/anu/prompt.ts`, assembled from the domain model so the tutor and the app cannot disagree:

1. **Identity and teaching style**: the persona rules above.
2. **The learner**: CEFR level, class week, target exam.
3. **Estonian reference**: the 14 cases with Estonian names and suffixes, the noun and verb
   principal-part schemas, gradation types, the object-case rule, and a government table. Generated
   from `lib/estonian/`, so a change to the domain model propagates to the tutor automatically.
4. **Response format**: answer, rule name, minimal pair, then a `<vocab>` block for extractable
   words.
5. **Honesty rules**: never invent forms; say when unsure; offer the dictionary lookup instead.

Sections 1 and 3 are static and sit inside the cache breakpoint. Section 2 is volatile and sits
after it.

## 4. Preset chips

v4.0's three, plus the ones the domain audit says matter most:

| Chip | Sends |
|---|---|
| Break down this sentence | Morpheme-by-morpheme analysis with case labels |
| Which case, and why? | Case selection with the governing rule named |
| **Object case check** | Total vs partial object, the top English-speaker error (`02` §3) |
| **Explain this gradation** | Why `tuba → toa`, with the pattern named |
| Parse these notes into cards | Free text → structured vocabulary |
| Quiz me on this week | Generates questions from this week's lexemes |
| Correct my Estonian | Error correction with explanations |

Chips are context-aware: with a dictionary entry open, they pre-fill with that lexeme.

## 5. The flashcard bridge and the provenance rule

`+ Add to Deck` on any vocabulary or example Anu produces. It is the one interaction v4.0 got exactly
right, and v5 promotes to a core principle.

Extraction uses **structured outputs** rather than regex over prose:

```ts
output_config: { format: { type: "json_schema", schema: VocabExtractionSchema } }
```

**The safety rule (ADR-005).** A card created from Anu output is written with `provenance: AI` and
`source: TUTOR`, and shows an amber "AI-generated, verify" badge until confirmed. Where the lexeme
exists in Ekilex, the app offers a one-click **enrich** that replaces AI forms with authoritative
ones and clears the badge.

This is the single most important safeguard in the app. An unverified partitive plural in a
flashcard does not just sit there being wrong. The SRS *drills it into the learner's memory*. The
asymmetry is the whole design: **Anu explains, Ekilex supplies.**

## 6. Cost model and budget control (audit C5)

`claude-opus-5`: $5 / MTok input, $25 / MTok output.

A realistic heavy turn: ~3 000 input tokens (of which ~2 500 cached) + ~700 output.

| Component | Tokens | Cost |
|---|---|---|
| Uncached input | 500 | $0.0025 |
| Cached read | 2 500 | ~$0.0013 |
| Output | 700 | $0.0175 |
| **Per turn** | | **≈ $0.021** |
| 30 turns/day (heavy study day) | | **≈ $0.63** |
| Sustained daily heavy use, per month | | **≈ $19** |

Prompt caching is roughly a 40% saving on input at this shape, which is the reason the breakpoint placement
in §2 is not a micro-optimisation.

**Controls:**
- `UsageDay` ledger written from real `usage` on every response, so spend is measured rather than estimated.
- Configurable daily cap (default **$2.00**). At 80% the UI warns; at 100% chat returns a clear
  message and the rest of the app is unaffected.
- A live token/cost meter in the tutor panel.
- Long documents pasted for parsing go to the **Batch API** at 50% cost where latency does not
  matter.

## 7. Failure handling

| Failure | Behaviour |
|---|---|
| 429 rate limit | Typed `RateLimitError` → "Anu is busy, retrying…" with automatic backoff |
| 5xx | Retry twice, then a clear error with the message preserved for resend |
| Budget cap | Explicit message naming the cap and where to change it |
| `stop_reason: "refusal"` | Handled explicitly, checked before reading content |
| Network loss mid-stream | Partial response kept and marked incomplete; never silently truncated |
| Missing API key | Tutor tab shows setup instructions; **rest of the app works normally** |

## 8. Evaluating the tutor

Untested prompts drift. A small eval suite (`evals/anu/`) of ~40 Estonian grammar questions with
known-correct answers, covering:

- case selection in context (10),
- object case / aspect minimal pairs (10),
- gradation identification (5),
- verb government (5),
- error correction of learner sentences (10).

Scored by an LLM judge against a reference answer, run before any prompt change ships. The bar:
**no regression on case selection or object case**, the two categories where a wrong answer does
the most damage.

## 9. Security

- Key server-side only; CI greps the client bundle for `sk-ant` patterns (`10-testing-quality.md` §5).
- Route Handler rate-limited per session to bound both cost and abuse.
- Conversations stored locally; never sent anywhere but Anthropic.
- Pasted content is treated as data, not instruction: user text is never concatenated into the
  system prompt, only into `messages`. This matters because the importer's whole purpose is pasting
  text from elsewhere, since a class handout or a web page could otherwise carry prompt injection.
