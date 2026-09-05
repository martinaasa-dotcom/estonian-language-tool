# Data Model

Postgres, through Prisma. Written to stay portable per ADR-002: no database-specific types, string
UUID primary keys, UTC timestamps, and the values a string column may take written in a comment
beside it rather than as a database enum.

`Lexeme` is the hub. Tasks, cards, tutor messages and imports all reference it, which is the structural
expression of "the word is the unit" (`01-product-spec.md` §2) and the fix for audit gap D4.

**The schema itself lives in `prisma/schema.prisma` and this page does not copy it.** It used to,
272 lines of it, and the copy went stale the way a second source of truth does: it described ten
models that no longer exist (`Deck`, `Sense`, `Government`, `Example`, `Conversation`, `AudioClip`,
`CalendarFeed`, `CalendarEvent`, `TaskLexeme`, `UsageDay`) and named none of the nine that had
arrived since (`Achievement`, `Assessment`, `Classroom`, `ClassroomMember`, `ExamAttempt`, `Scan`,
`StarredWord`, `Suggestion`, `UsageEvent`), and it still opened with
`datasource db { provider = "sqlite" }`. This is the third file `CLAUDE.md` sends a new contributor
to, so more than half of what they read about the schema was wrong. The schema file carries a
comment on every model that needs one; what belongs here is the map and the reasoning.

`scripts/test-invariants.ts` fails if a model is in one and not the other.

## What each model is for

| Model | What it holds |
|---|---|
| `Lexeme` | A dictionary word. **Shared by every learner**: the built-in set plus the Ekilex cache, not anybody's deck. |
| `Form` | An inflected form. Principal parts are the unpredictable ones a learner memorizes; anything Ekilex retrieved keeps its own slot. |
| `KnownWord` | Every Estonian headword there is, and nothing else about it. Shared reference data, like `Lexeme`: it answers "is this a word" for the search screen and for a word game's guesses. |
| `StarredWord` | One learner bookmarking a word. Per learner, unlike the word. |
| `Card` | One thing to answer about one word, in one of seven shapes, with its FSRS scheduling. |
| `Review` | Every grade ever given. Append-only, and the one table whose loss cannot be undone. |
| `Task` | Work a teacher assigned, which is the one thing left of the homework list §24 cut. |
| `StudyEvent` | A class, a study slot or a one-off in the learner's own week. Wall-clock minutes rather than instants, so a Monday class stays at 18:00 across a daylight saving change. |
| `Message` | A turn of a conversation with Anu. |
| `Setting` | The learner's own answers, one key at a time, through `lib/settings/store.ts`. |
| `Achievement` | A badge, written the moment its condition is first met and never removed. |
| `Assessment` | One sitting of the level check. Append-only. |
| `ExamAttempt` | One sitting of a mock state examination, with the seed its paper was built from. Append-only. |
| `Scan` | One photographed page, as the words somebody confirmed. **Never the picture.** |
| `Suggestion` | One thing a learner said was wrong, and what they proposed instead. |
| `Classroom`, `ClassroomMember` | A class, its join code, and who is in it. A view over what the learners already own. |
| `UsageEvent` | One metered call to a paid service. Append-only, and the evidence behind the spend cap. |
| `SceneRun` | One conversation, with the seed it was drawn from and every turn typed in it. Append-only. Nothing in it is true about the learner: the role card is fiction (`docs/19-situations.md` §3). |
| `SceneGap` | A word a conversation needed and the learner did not have. A child table so "the words my conversations keep needing" is one indexed query rather than a scan over every transcript. |
| `Encounter` | One day's answer to whether the learner spoke any Estonian to somebody outside the app, in one of three words. Names the errand where the report was about one, and nothing where the conversation was the learner's own. Append-only. |
| `RateLimit` | One fixed window of one rate limit, counted where every instance can see it, for the four routes the spend ledger does not price. Holds a digest of the caller-and-endpoint key rather than the key, so there is no owner id in it, and every row is deleted once its window has passed. |

## The values a string column may take

Postgres enums are not used, for the portability ADR-002 asks for, so these live as strings with the
allowed values in a comment beside them. Three of the four are named in more than one place and the
invariant checks they agree.

```
CardType    RECOGNITION PRODUCTION CASE_FORM GRADATION GOVERNMENT CLOZE CONJUGATION
CardSource  MANUAL DICTIONARY TUTOR IMPORT SCAN ALMANAC SCENE
SceneGap    ASKED STALLED  (the help button, and a beat that could not be met)
TaskTag     HOMEWORK VOCABULARY  (declared in TASK_TAGS, lib/ux/agenda.ts)
FormType    NOM_SG GEN_SG PART_SG ILL_SG_SHORT NOM_PL PART_PL GEN_PL
            INF_MA INF_DA PRES_1SG PAST_1SG PART_TUD
            EKILEX:<morphCode> for anything retrieved
Language    Lexeme.notes is English (Wiktionary's further senses)
            Lexeme.definition is Estonian (Ekilex's own explanation)
GrammCase   NOMINATIVE GENITIVE PARTITIVE ILLATIVE INESSIVE ELATIVE
            ALLATIVE ADESSIVE ABLATIVE TRANSLATIVE TERMINATIVE
            ESSIVE ABESSIVE COMITATIVE
```


## Notes on three deliberate choices

**Derived forms are not stored.** Only principal parts live in `Form`, drawn from the eleven
`FormType` values: six for a nominal and five for a verb. The sixth nominal part, `GEN_PL`, is what
opens the plural oblique cases, and `ILL_SG_SHORT` is the short illative, which is the one case no
rule reaches; both are present on a word only where the dictionary holds them, so a seeded entry
has three or four and an enriched one more. The ten regular cases and the verb's present, negative,
conditional and imperative are worked out at render time from the genitive stem and the stored
first person. Storing them would create a second source of truth that goes stale the moment a stem
is corrected.

A form Ekilex retrieved is kept under its own slot, `EKILEX:<morphCode>`, so a retrieved form and a
derived one fill the same row of a table and an attested one always answers first.

**`Review` is append-only.** No update path, no delete path. It is the one table whose loss cannot
be recovered by re-fetching from anywhere, and it is the input to future FSRS optimization.

**Audio is cached and is not a table.** A clip is content-addressed on the text, the voice and the
speed, so the same word asked for from a dictionary entry and from a flashcard is one file. It lives
on disk beside the route that fetched it and in the service worker's own bounded cache, which is
where a file belongs: `lib/audio/clip.ts` is the one place that key is built.

**`Assessment` is the second append-only table, and the third exception to "progress is derived".**
A sitting of the level check is a measurement of answers to questions that were never cards and
were never scheduled, made at one moment against a paper assembled for it. Nothing in the review log
can reconstruct it, so it is stored rather than computed, and it is written once and never edited:
a later check is another row, which is what makes the history a history instead of a number that
moved. It holds the per skill levels, the overall (the weakest measured skill), the confidence, how
many scored questions it came from, the learner's own speaking rating, and the band breakdown as
JSON. See ADR-020.

**`ExamAttempt` is the third append-only table, and the fourth exception to the same rule.** A
sitting of a mock state examination is a measurement the review log cannot reconstruct either, and
for a sharper reason than the placement check: the log records that a card was answered, not that it
was answered under a clock, in a paper of four parts, with the answers withheld until the end. It
holds the level, the seed the paper was built from (so the same questions can be rebuilt), the
weighted percentage, whether it passed, and the marked paper as JSON. The percentage is
denormalised out of that JSON so the exam hub can rank six levels without parsing six blobs. Written
once, when the paper is handed in; an abandoned paper writes no row at all (ADR-016). See ADR-022.

The goal it is read against lives in `Setting`, under `goalReason`, `goalTarget`, `goalDeadline`,
`goalDays` and `goalNote`, all through `lib/settings/store.ts`. Five keys rather than one JSON blob
so one answer can change without rewriting the rest.

**`Scan` holds a word list and never a photograph.** A page somebody photographed is stored as the
items they confirmed: the Estonian as it was read, the English, and the `lexemeId` of the dictionary
entry that vouched for it, which is null for a word nothing vouched for. There is no column an image
could go in, and the invariant suite fails if one appears or if the scan route writes to the database
at all. The picture is decoded in a Route Handler, sent to one model, and dropped, exactly as
`lib/estonian/passage.ts` treats a pasted reading: a photograph of somebody's homework has their name
at the top of it. Words are held as references to `Lexeme` rather than as copies, like a learning-path
unit, so correcting a word corrects it on every page it appears on. See ADR-021.
