# Situations

A module where the learner uses Estonian on somebody rather than studying it. What a scene is, how
one is drawn so that no two runs are alike, how the difficulty setting works, and the rule that
keeps every Estonian word in it out of a model's hands.

This was the design before anything was built, the arithmetic behind it, the things it must never
become, and the measurements that decided whether it could be built at all. **Phase 1 is built**, in
September 2026, and §30 says what building it found; `docs/22-real-life.md` is why it was worth
building and `docs/13-mvp-status.md` §30 what shipped with it. Everything above §30 is kept as the
argument it was.

## 1. The promise the course already made

`lib/collections/syllabus/` holds 81 units and every one of them carries a `canDo`, which is a claim
about what the learner will be able to do:

> Greet someone, thank them, apologize, and say you do not understand.
>
> Ask where something is and understand the directions you are given.
>
> Describe a symptom to a doctor and understand the advice you are given.
>
> Buy something, ask the price, and find your way to a place in town.

Not one of those 81 claims is ever tested. The app has four verbs and this is not among them: it
teaches a word, drills it, looks it up and measures it. Every one of those happens with the learner
alone, at their own pace, with the right answer sitting in the dictionary the whole time. The
closest thing to a conversation anywhere in the product is the mock exam's spoken part, which is a
monologue the learner marks themselves, and Anu, who explains grammar in English and is the most
patient interlocutor anybody has ever met.

What a person actually needs is the receptionist who says one sentence too fast, has no appointment
on Thursday, and switches to English the moment you hesitate. That is the gap, it is the largest one
left in the product, and it is the one an integration foundation is asking about when it writes
about using Estonian in natural communication settings.

So: **Situations**. A short scene, played one turn at a time, where the learner has something to get
done in Estonian and the other person has an agenda of their own.

The name is plain on purpose. Not "roleplay", which is a word for a game, and not an Estonian title,
because a scene file may not write Estonian and a name it cannot spell for itself is a name it has
borrowed.

## 2. The one rule the module lives under

**The scene names a move; the dictionary supplies the words.**

That is `lib/copy/almanac.ts`'s rule applied to dialogue. The almanac names a *meaning* (a pancake,
a bonfire) and the dictionary answers with the word, which is how a table deciding what today is
holds no Estonian at all. A scene file names a *move* (ask why they came, offer a time, refuse) and
the same thing happens: no scene file contains an Estonian character, and there is a tripwire on it,
exactly as there is on `lib/estonian/grammar.ts`.

That settles the authored half. The other half is what has kept this module unbuilt: a conversation
cannot be assembled out of dictionary entries the way a case table can. Something has to produce a
sentence nobody wrote down in advance.

### The ladder

`sceneLine()` is the one function that answers "what does the other side say here", and it works the
way `caseAnswer` works: an attested form ahead of a stored one ahead of a derived one, with the
screen saying which it got.

1. **Attested.** A sentence a lexicographer recorded, used whole. `lib/estonian/cloze.ts` already
   holds the test of whether a usage is a sentence somebody said (`naturalSentence`, which rejects
   101 of the 8,826 usages that clear the length rules), and the exam already searches that corpus
   for a sentence containing a given form. A beat that needs "ask what is wrong" wants a recorded
   question containing a form of a lemma from the health unit, inside the learner's band, whose
   other words are in the scene's own list. Where one exists, that is the line. Nothing is generated,
   nothing needs checking, and it costs a query.
2. **Reviewed.** A line a person approved into the scene's phrase bank through the suggestion queue.
   Phase 3, and deliberately not in the first build (§19).
3. **Composed.** A model is given the move, the beat, the closed word list and the last two turns,
   and returns one line, which then has to get past the gate below.
4. **The way out.** Composition can fail twice and there is still a person standing there waiting,
   so the fallback is a move that is always in character and always attested: they did not catch
   that, and they ask again. The learner sees somebody who missed what they said, which is the
   truest thing that can happen in a conversation, rather than an error. `patience` bounds it, so a
   beat whose line cannot be built at all is skipped and the debrief says the app could not build
   that turn. A failure is reported, never hidden, and never looped.

**Measured, and the first rung is thinner than it looks.** `npm run measure:scenes` has been run and
§25 has the numbers. The short version, because it changes how the rest of this reads: retrieval
fills the moves every conversation shares and almost none of the moves that make it this
conversation, because a lexicographer records a sentence to illustrate a word rather than to ask a
question about it. The composer is load-bearing rather than a fallback, which makes the gate below
the thing the whole module rests on.

### The gate, which is four checks and not one

A line is **withheld whole** when it fails any of them, the way `lib/tutor/verify.ts` withholds a
grader's note, and never shown with a caveat. A caveat still puts a wrong form in front of somebody
trying to learn one.

1. **Shape.** One sentence, inside a word count set by the level, ending in a full stop, a question
   mark or an exclamation mark, and no markdown. A move of `ask` that comes back without a question
   mark did not do what it was told.
2. **Vouching.** Every Estonian token has to resolve, through `matchEstonianForm` at
   `VOUCHED_SCORE`, against **the scene's own word list** rather than against the whole dictionary.
   That distinction is the whole constraint: vouching against the dictionary would pass any Estonian
   word in the language, and vouching against a few hundred lemmas means the model is choosing
   inside a box. The list is built by the same function the grader's check uses
   (`buildAllowlist`), because a second copy of it is where the two stop agreeing.
3. **Register.** A scene set in `teie` may not come back with a `sina` form unless a curveball says
   so. It is one lookup against the pronoun unit, and it catches the model error a learner would
   find most jarring.
4. **Government, proposed and now measured.** The dictionary records what case a word demands for
   268 verbs, 36 nouns and 12 adjectives, and `parseGovernment` reads it. A composed line containing
   a governed verb and a noun in a case that verb does not govern is probably wrong. Probably was
   not good enough to ship, so `npm run eval:scene` built the labelled set out of what Ekilex had
   already recorded and asked: **it withholds 42.3% of real errors and 2.1% of good lines**, a net
   of +115 over 286 pairs, so it goes in. §29 has the method and the one thing it cannot see.

   What made that number defensible is how weakly the check is drawn. There is no parser here, so
   nothing can say which noun is a verb's complement, and the strict reading, that every noun must
   be in a governed case, fires on any sentence carrying an adjunct, which is most of them. So it
   asks the weakest thing that is still a check: a line holding a governed verb has to hold **at
   least one** nominal in a case that verb governs. A line with no governed verb and a line with no
   nominal are both outside what it can say, and it passes them.

### Why word-level vouching is enough here, and where it is not

Vouching every word does not prove a sentence is grammatical. That is the honest limit of this
design and it has to be argued rather than walked past.

What survives the four checks is a line whose words all exist, in the right register and in a
plausible shape, so what is left is an error of order, of agreement, or of sense. Those are real and
they will happen. The claim is not that they cannot, it is that this is the smallest space the error
can be squeezed into with the tools already in the repository.

There is a bigger tool and it should be named rather than ignored. Estonian has an open source
morphological analyzer, Vabamorf, which `EstNLTK` wraps, and running a composed line through it is a
real option. What it would add over vouching is less than it first appears: vouching already
establishes that every word is a real form of a word this scene is allowed to use, which is most of
what an analyzer reports. What would genuinely help is agreement and government checked across the
sentence, and that is a dependency, a service and a body of Estonian-specific code that this app has
so far managed to avoid entirely. It belongs in the open questions, not in Phase 1, and the
government check above is the cheap half of it done with what is already here.

What makes that acceptable is what happens to the sentence afterwards. A wrong form on a flashcard
is *drilled*: the scheduler brings it back until it sticks, which is why ADR-005 exists at all. A
wrong form in the other side's line is read once, in context, never stored, never becomes a card
answer, never reaches `Lexeme` or `Form`, and is gone at the end of the scene. That distinction is
already written into the app twice: the chat guard flags rather than gates because prose is not
acted on the way a correction is, and the grader gates because it is (ADR-005 amendment 2).

Three things narrow what is left, and all three are cheap:

- **Every line carries its provenance on screen.** Attested says so and names the entry. Composed
  says so too. A learner is never invited to memorize a sentence without being told where it came
  from, which is the rule the grammar pages already follow for every form they print.
- **Every line has a report button.** `components/SuggestFix.tsx` mounts on the turn with the turn
  attached, and "this is not how anybody says it" becomes a row in the queue an admin works.
- **The learner is never marked against a composed line.** What advances a scene is what the
  dictionary finds in the **learner's** turn, and that path has no model in it at all (§8).

## 3. What a scene is

A scene is a small machine, authored in English, that knows the shape of an encounter without
knowing a word of it.

```ts
export interface SceneSpec {
  id: string;                          // "arsti-aeg"
  title: string;                       // "Booking a doctor's appointment"
  place: string;                       // "The reception desk at a health centre"
  level: Level;                        // the band the scene is written for
  /** Which of the course's units supply its vocabulary. Ids, never words. */
  units: readonly string[];            // ["keha-ja-tervis", "aeg", "arvud"]
  /** What the other side calls you, and expects back. */
  register: "teie" | "sina";
  other: readonly PersonaSpec[];       // who is behind the desk today
  role: RoleCardSpec;                  // who you are today
  beats: readonly BeatSpec[];
  props: readonly PropSlot[];
  curveballs: readonly CurveballId[];  // which ones this scene admits
  outcomes: readonly OutcomeSpec[];    // how it can end, including badly
}
```

`units` is the load-bearing field and it is the topical calendar's trick again
(`lib/collections/topical.ts` names unit ids and never words, so a misspelled seasonal word cannot
ship in silence). A scene names units; the syllabus names lemmas; the Ekilex harvest decides whether
those lemmas exist. A scene therefore cannot reference a word that is not in the dictionary, and
`scenes.test.ts` fails on a unit id that is not a unit, the way `topical.test.ts` does.

A scene is offered one band either side of the learner's level, through
`lib/collections/levels.ts`, which is the same table that decides which words the minimal pairs
round and the government drill draw from. A second answer to "what is around this learner's level"
is how the first one rots.

### Beats

```ts
export interface BeatSpec {
  id: string;                    // "reason"
  /** What the learner has to get done here. English, and shown to them. */
  goal: string;                  // "Say what is wrong with you."
  /** What the other side is doing. One of about ten verbs. */
  move: MoveKind;                // greet | ask | offer | confirm | correct | refuse | instruct | close
  /** What counts as done. Dictionary facts only. */
  needs: readonly Requirement[];
  /** Required beats are the objectives. Optional ones are the colour. */
  required: boolean;
  /** How many times they will try again before moving on. */
  patience: number;
}
```

### Requirements, which are the whole of the marking

Every requirement is decidable by a module that already exists, with no model anywhere near it:

```ts
type Requirement =
  | { kind: "lemma";    oneOf: string[] }              // matchEstonianForm, lib/dict/search.ts
  | { kind: "case";     lemma: string; case: CaseKey } // caseAnswer, lib/estonian/answer.ts
  | { kind: "datum";    slot: PropId }                 // the prop value, as text or as digits
  | { kind: "question" }                               // a question mark, or a word from kusisonad
  | { kind: "negation" }                               // the negator, from the course
  | { kind: "register" }                               // a form of the expected pronoun, from asesonad
  | { kind: "any" };                                   // small talk. Never fails.
```

The three that look hardest are the ones that got easiest last month. `kusisonad` (question words),
`asesonad` (pronouns) and `kohasonad` (postpositions) were among the six units the seventeenth pass
added for the words between the words, and they are exactly the machinery a conversation marker
needs: "did they ask a
question" is answerable because the question words are now dictionary entries with forms, and "did
they use the right register" is answerable because the pronouns are.

### The role card, which is not a decoration

**The learner never plays themselves.** They are handed a card: you are a patient, your throat has
hurt since Tuesday, you can come any afternoon except Wednesday, your ID number is on the card.

Two reasons, and the second is the one that matters legally.

The first is that marking has to know what the learner is trying to say. A scene that invites
somebody to describe their own symptoms cannot tell a complete turn from an incomplete one, because
it does not know what the complete one was.

The second is that a doctor scene where somebody types about their own health is a database holding
health data about an identified person, which is Article 9 special category data, in a product whose
privacy notice is one of the reasons people choose it. The role card removes the question: nothing
in a transcript is true about the person who wrote it. `/privacy` says so, and the scene screen says
so once, in one line, before the first scene.

**A scene that asks for a document number supplies a fictional one on the card**, and never invites
the learner to type their own. An identity code typed into a practice app is the one thing this
module could collect that nobody could ever take back.

The card is English. Its facts come from `props`, and a prop is either a dictionary word (so the
Estonian the learner needs exists and can be checked) or a generated value: a time, a date, a
number, a room, a fictional code.

### Outcomes

```ts
export interface OutcomeSpec {
  id: string;
  /** Which required beats have to have been met. */
  when: readonly string[];
  /** One line, English, in the debrief. The thing a person remembers. */
  says: string;   // "You have an appointment on Thursday at 14:00."
}
```

At least one outcome is a **failure that is not the learner's fault**, because a real encounter has
those and a module where trying hard enough always works is a module that has stopped simulating
anything. Walking out is an outcome too, and it is written kindly.

## 4. A worked run

The Estonian is left as slots, because this document may not write any either. Everything in square
brackets is filled at run time from the dictionary; the quoted phrases are course phrases that
already exist in `lib/collections/syllabus/a1.ts`.

Scene `arsti-aeg`, A2, difficulty *Ordinary day* (budget 4). Persona drawn: the one who is thorough
and slow. Curveballs drawn: *the time you asked for is gone* (2), *small talk* (1), *they speed up*
(1).

| Beat | Other side | Learner has to | Marked on |
|---|---|---|---|
| greet | `Tere!`, attested | Greet back | `{ kind: "lemma", oneOf: [the greeting phrases] }` |
| reason | [attested question containing a form of `valu`] | Say what hurts | `{ case: "part", lemma: <the prop symptom> }` |
| since | [composed, `ask`] | Say since when | `{ datum: "since" }` |
| offer | [composed, `offer`, with the drawn time] | Accept or decline | `{ oneOf: [yes and no words] }` |
| *curveball* | That slot has gone. They offer another. | Take it, or ask for another | `{ datum: "time" }` |
| *curveball* | Small talk about the weather | Anything | `{ kind: "any" }` |
| confirm | [composed, `confirm`, reading the details back] | Confirm, or correct them | `{ oneOf: [...] }` |
| close | [attested closing phrase] | Say goodbye | `{ oneOf: [the closing phrases] }` |

Outcome: an appointment on the day and time actually agreed, which is not the one the learner asked
for. Objectives: five of six required beats. The one missed is `since`, where the learner wrote a
weekday in the wrong case twice and the other side moved on, which is what the debrief opens on
after the outcome line.

Two things this table is meant to show. Half the turns cost nothing, because a greeting, a closing
and a question about pain are all things the dictionary has recorded somebody saying. And the
learner is marked on a case, a datum and a word choice, every one of which is a string comparison
against something the dictionary vouches for. There is no point in the run where a model decides
anything about the learner.

## 5. Every run is a different draw

A run is a pure function of `(scene, seed, level, difficulty, pool)`, exactly as a paper is
(`lib/exam/paper.ts`), and for the same reason: a reload in the middle of a conversation has to give
back the same conversation rather than a fresh one. The seed is stored with the run, so a learner
can send a friend the same encounter and a teacher can set one for a class.

What varies, in the order a learner notices it:

| Axis | What it changes |
|---|---|
| Persona | Who is behind the desk. Their agenda, their patience, their voice, their speed. |
| Props | The card you are handed and the facts they ask you for. |
| Curveballs | Which ones fire, and at which beat. |
| Beat order | Which of the optional beats are in, and where. Required beats never move. |
| Lines | Which attested sentence fills a move, out of the several that fit. |

**The persona's agenda is the strongest lever and it is nearly free.** A receptionist who wants the
queue gone, one who is thorough and slow, one who is new and unsure, one who is following a script
and will not deviate: same beats, same props, four conversations that feel nothing alike, because
the agenda biases which move the machine prefers and which curveballs attach. Props change the
words. An agenda changes the person.

### The claim to make, and the claim not to make

Multiplying those axes gives a number in the millions and it is worth nothing, because nobody plays
a scene a million times. What a learner notices is repetition **in a row**, so that is what gets
promised and measured:

- no prop value repeats within three consecutive runs of one scene,
- no curveball repeats within five,
- no attested line repeats until the pool for that move is exhausted, and when it is, the run says
  so rather than quietly cycling.

All three are enforceable because `SceneRun` is append-only and the last runs are one indexed read,
which makes the recency memory derived rather than a stored counter (ADR-014).
`scripts/measure-scenes.ts` plays twenty consecutive runs of every scene and reports the three
numbers. A pool too thin to keep the promise is a fact about the dictionary, and it is reported the
way `paper.ts` reports a shortfall rather than papered over.

## 6. The other side's turn

Per turn:

1. The machine picks the move from the beat, the persona's agenda, and what the learner just did.
2. `sceneLine()` walks the ladder in §2 and returns a line with its provenance and its words.
3. The words come back already resolved, because resolving them is how they were vouched for, so
   **every word in the other side's line is tappable and opens its dictionary entry**. That is free,
   and it is what a learner in a real conversation most wishes they could do.
4. The line is spoken in the persona's voice, from `lib/audio/voice.ts`'s twelve, at the persona's
   speed. A second persona in a scene gets a different voice, which is how an interruption reads as
   a second person rather than as more of the first.

### What the model is asked for, and what it is not

One line, for one move, inside a closed word list. It never sees the plot, never decides what
happens next, never marks anything, and never sees the learner's deck beyond the words lent to the
list. The static half of the prompt is identical on every turn of every scene, so it sits behind the
Anthropic `cache_control` breakpoint the tutor already uses.

A rejected line costs one retry with the failing words named, then the fallback. **The gate
rejection rate is the number that decides whether composition is safe**, and it is measured before
the module ships rather than watched afterwards. Above one line in twenty withheld, either the word
list is too small or the model is the wrong one for this, and the answer is not to loosen the gate.

### Latency, and the turn that is already written

An attested turn is a query and appears at once. A composed turn is a model call, so the other side
would pause for a second every time they say something the dictionary had not recorded. That is
survivable and it is also avoidable: while the learner is typing, the machine already knows the most
likely next move, which is the one where the learner does what was asked. So it composes that line
after the first keystroke and either uses it or drops it. This is `PrefetchLink`'s argument on the
one path in the app where somebody is definitely about to need the next thing.

Speculation is bounded: one branch only, never when the day's allowance is thin, and counted inside
the scene's reservation, so a dropped line is still paid for honestly.

## 7. There are no meters

Real conversations have no progress bar, no timer and no patience gauge, and every one of those
would turn this into a game about the gauge. Pressure is carried in what the other person says. When
their patience runs out, they say so, in words, and move on.

The one thing that stays on screen is the objective list from the role card. Knowing what you came
in to get done is not a hint; it is what a person walking into a health centre already knows.

## 8. The learner's turn

This is the half with no model in it, and the type system is what keeps it that way.

```ts
/** What the dictionary found in a turn. The only thing that can advance a scene. */
export interface Evidence { /* per requirement: met, and with what */ }

/** The one producer. Takes dictionary candidates, not prose. */
export function readTurn(text: string, needs: readonly Requirement[], lex: Lexicon): Evidence;

/** The one consumer. Cannot be called with anything a model wrote. */
export function advance(state: SceneState, evidence: Evidence): SceneState;
```

`advance` taking `Evidence` rather than a verdict is the same device as `buildOptions` taking a
parsed `Government` rather than a case key: a caller holding only a model's opinion cannot satisfy
the type, so a fifth screen cannot reintroduce the fault by not knowing about the rule.

### Five outcomes, not two

- **Understood, complete.** The scene advances and the other side answers the content.
- **Understood, incomplete.** They answer, and ask for the part that was missing. Receptionists do
  this constantly and no drill in this app has ever imitated it.
- **Not recognised.** Nothing matched and few of the words were vouched for. The repair move: they
  did not catch it, and they ask again.
- **Vouched, and not what was asked for.** Several words the dictionary knows, none of them the
  point. Worth separating, because this is a learner who said something real that the scene did not
  anticipate: they get a narrower re-ask rather than "say again", and their turn appears in the
  debrief with each word marked as recognised.
- **English.** A turn with no Estonian in it is recognised as English rather than as unreadable
  Estonian, because those are different things and telling somebody "I did not understand" when they
  wrote a clear English sentence is a lie. What happens next is the persona's: the helpful one
  translates the question, the brisk one repeats it in Estonian. It is counted in the debrief and it
  is never scolded. Reaching for English under pressure is the thing being practised against.

### Understood before correct (amendment, §35)

Each of the readings above is decided against the dictionary's exact spelling, and that turned out
to be the wrong instrument for a conversation: a learner is understood far more often than they are
correct, and the gap between the two is most of what makes speaking feel possible. So a requirement
is met by the word *nearly* as well: a diacritic folded away, one letter out on a word of five or
more, the right word in the wrong case, or the ma-infinitive straight after a subject pronoun. Each
is the beat met, with a `Slip` written down beside it, and the other side says the word back the way
they say it. §35 is the argument and the boundaries.

### What counts as a turn

Two holes are worth closing before somebody finds them.

**A bare word is an answer at A1 and a dodge at B1.** Nothing above stops a learner typing the one
required word on its own, every time, and finishing a scene without ever building a sentence. So a
beat carries a `shape`: `word` where a one-word answer is what a person would actually say, and
`sentence` where it is not, checked with `looksLikeSentence` from `lib/estonian/writing.ts`, which
the writing exercise already uses. A turn that is one word where a sentence was wanted is not marked
wrong, it gets the response a person would give, which is a look and a wait.

**A turn that repeats the other side's line back is not a turn.** It would satisfy several
requirements at once, because their line is full of vouched words. A turn that is contained in the
line above it is answered in character, once, and does not advance anything.

### The learner pushes back, and the scene gets better

A turn marked "not what was asked for" that was in fact a good answer is a scene bug, and the person
who knows is the one standing in front of it. So that outcome carries a report button and a category
of its own: **this should have counted**. It arrives in the queue with the scene, the beat, the
requirement and the exact turn, which is everything a reviewer needs to add a lemma to a `oneOf` and
close it for everybody who meets it.

That is the loop the dictionary already has, pointed at the course. It is also the only mechanism in
this design that makes the scenes improve without somebody sitting down to improve them.

### The help button

"What is the word for" is a search by English gloss, scoped to the scene's word list, which is a
query the dictionary already answers. Every use writes a `SceneGap` row, so the debrief can hand
back exactly the words the conversation needed and the learner did not have. It is help, it is
counted, and it is never taken away: a learner who asks for four words and finishes has learned more
than one who gave up with none.

## 9. Curveballs

**A difficulty setting is a budget, not a mode.** Each curveball costs points, the setting is how
many points a run may spend, and the draw is seeded. Difficulty is then one number a learner can
move by one, rather than four presets that jump.

| Setting | Budget | What it feels like |
|---|---|---|
| Textbook | 0 | Everything goes the way the unit taught it. |
| Good day | 2 | One thing is not quite as expected. |
| Ordinary day | 4 | Two or three, and one of them is real. |
| Bad day | 7 | About as bad as a Tuesday at a government counter. |

### The catalog

Each entry names its cost, what it changes mechanically, and its **out**: the move that resolves it.
A curveball with no out is a trap.

| Curveball | Cost | Out |
|---|---|---|
| They ask for something you were not given | 2 | Say you do not have it. A negation, which the course teaches. |
| The time you asked for is gone | 2 | Take the one offered, or ask for another. |
| They mishear your word for its minimal pair | 3 | Correct them, and say it again. |
| They switch to English | 3 | Keep going in Estonian, and they come back. |
| Someone interrupts | 2 | Wait, or say you were first. A second voice, one turn. |
| They speed up | 1 | Ask them to slow down. Free, always, and taught. |
| Small talk about the weather | 1 | Answer it and return. The `ilm` unit, doing its job. |
| The form has to be filled in their order | 2 | Give the data as asked, not as you planned. |
| What you came for is not possible | 3 | Ask what is, or when. |
| They use the register you did not expect | 1 | Match them, or do not. |
| The price is not what you were told | 2 | Query it. |
| A queue forms behind you | 1 | Nothing. Their patience drops by one. |
| They contradict what they said two turns ago | 3 | Notice, and say so. B2 and above. |
| They give you an instruction with a place in it | 2 | Follow it, or ask where. The `kohasonad` unit. |

Three deserve a note.

**The switch to English is the most real thing in the table.** It is what happens to a foreigner
speaking Estonian in Tallinn, it is a large part of why people stop practicing, and no textbook
rehearses it because a textbook cannot. Here the other side switches, the learner may switch too,
and holding the line in Estonian brings them back.

**The mishearing ties this module to the phonology drills.** It is drawn only where the prop word has
a genuine pair, which `lib/estonian/quantity.ts` and `sounds.ts` already know how to find, so a
learner meets in conversation the exact contrast the minimal pairs round drills in isolation.

**The queue is the only one with no words in it.** It costs a point and its whole effect is one
number, which is the argument for it: pressure that is felt rather than announced.

### The rules of the draw

- **Never on the first beat.** You get to say hello and be answered. A scene that ambushes somebody
  at the door teaches them to dread it.
- **No two of the same kind in a run**, and none within two beats of another.
- **Never one whose out is not sayable.** Asserted: every curveball's out is expressed as
  requirements, and every requirement has to resolve inside the scene's own word list at its level.
  A curveball a learner cannot answer is not difficulty, it is a bug in a costume.
- **At most one cost-3 below Ordinary day**, so that step is a step and not a cliff.

## 10. Difficulty is four dials, and only one of them is curveballs

The presets set all four at once. Each is separately reachable, because they measure different
things and nobody is evenly bad at all four.

- **Curveballs.** How much goes wrong.
- **Memory.** How much of the transcript stays on screen: all of it, the last two turns, or none. In
  a real conversation you cannot scroll back, and this is the only dial that changes the kind of
  work rather than the amount. Default is the last two turns.
- **Pace.** How fast they speak, and whether their line is written down at all. At the top setting
  the text arrives only after you have answered, which is the state examination's listening
  condition and the hardest honest thing this module can ask. Off by default, and never the only way
  to play a scene: a learner who cannot hear it is not locked out of the module, exactly as the
  placement check leaves listening unmeasured rather than failed when there is no audio.
- **Help.** Whether the help button is there. It is there by default and it is never removed as a
  punishment: at the top setting it is still there, and the debrief counts what it was used for,
  which is a word list worth more than the score it would have cost.

## 11. Speaking

ADR-018 stands and nothing here scores pronunciation. `scripts/measure-asr.mjs` measured
`whisper-large-v3` at a 14.6% word error rate on clean native audio, with its errors landing on
consonant length, voicing and word boundaries, which is precisely where a learner is weakest. Using
that to decide whether a scene advances would be scoring pronunciation with extra steps, and it
would stall a learner who said the right thing, which is worse than not listening at all.

So there are two ways to take a turn, and both are honest about what they are:

- **Typed.** The turn is marked mechanically, the scene advances on evidence, and the learner may
  press to hear a native rendering of what they typed and compare. That is the app's speaking
  practice, inside a conversation.
- **Spoken, unmarked.** Nothing is typed, nothing is marked, the transcript is hidden, and the scene
  advances when the learner says they have answered. It is a language lab drill, it is labelled as
  one, and it is the mode somebody uses on the walk to an appointment they are dreading. Rehearsal
  does not need a verdict.

Reopening this needs a re-run of `measure-asr.mjs` against a recognizer that clears the bar, and the
bar is not "good": a false stall has to be rarer than a real one, or the app tells a learner they
were wrong when they were right, on the screen where that costs the most.

## 12. The debrief

The order is the argument.

1. **What happened**, in one line. You have an appointment on Thursday at 14:00. Or you do not, and
   why. A person remembers the outcome, so it goes first, before any teaching.
2. **What you got done.** The required beats, ticked. A count of things achieved, never a
   percentage: a mark on a conversation is a claim about somebody's Estonian, and the only module
   allowed to make one is the mock exam, which caveats it heavily (ADR-022).
3. **Your turns**, with each word marked as recognised or not, and the near misses named. This is
   where a learner finds out that the word they were sure of was not the word.
4. **The words you needed and did not have**, from the help button and from the beats that stalled,
   each with an add-to-deck button.
5. **One thing to work on**, as a `DrillLink` into the drill that addresses it, chosen from the
   cases and forms that actually failed in this run.
6. **Try it again**, which keeps the role card and redraws the persona and the curveballs. The
   second run is where most of the learning is, and it should be one button.

### What it writes

A card added from a scene carries `SCENE_SOURCE` in the `source` column `Card` already has, so
"words your conversations needed" is a query and never a counter (ADR-014).

Grading is deliberately conservative. Every mode grades through `gradeCard` (ADR-016) and a scene is
no exception, but a conversation is a noisy instrument, so a `Review` row is written only where the
retrieval was unambiguous: the learner produced a vouched form of a word they hold a card for,
without pressing help for it, in a beat that asked for it. `Good` on the first attempt, `Hard` after
a repair, `Again` where the app had to supply the word. Never `Easy`, because a conversation cannot
tell easy from lucky. Where the requirement was a case, the row carries its `targetCase`, which
means **the case you fail under pressure lands in the same weak-case charts as the case you fail on
a card**. An abandoned scene writes nothing, exactly as an abandoned round does.

## 13. The screen

**Choosing one.** A list of scenes at and around the learner's level, each showing the place, what
you would be trying to get done, and how long it takes. The difficulty dial sits on the scene, not
in Settings, because it is a decision about this conversation rather than a preference about the
app, and because somebody who found the last one hard should be able to turn it down at the moment
they feel that rather than two screens away.

Four states, per `docs/08-ux-ia-a11y.md` §4:

- **Empty.** No conversation yet, and a scene that needs only the first three A1 units, so the empty
  state is a door rather than an explanation. The body stays under 100 characters.
- **Loading.** The pool query and the draw. A skeleton the shape of the header, which is the one
  part whose shape is known before the draw.
- **Error.** `app/error.tsx`'s rules. A turn that will not reach the server says so and leaves the
  conversation where it was: the turn they typed is still theirs and pressing again resends it. The
  status is read rather than the body alone, so a five hundred and a dead network stop reading
  identically, which the first version got wrong and which sent whoever met it to check their wifi
  about a bug in this app.
- **Offline.** **Not in this build, and said here rather than left to be discovered.** A scene runs
  on the scene's whole closed list, which is a few hundred entries with their forms, and on a
  marker that has to be given them; the marking really is mechanical and needs nothing else, so the
  piece that is missing is the lexicon reaching the browser at all, plus a service worker that
  pre-assembles one scene. Nothing in the design blocks it: `readTurn`, `advance` and `gradesFor`
  are pure and already run on data rather than on a database, the grades are the shape the outbox
  already carries, and `Review` replays in order by construction. It is a piece of work rather than
  a question, and a conversation you can have on a train is still worth more than most of what this
  app can do offline. Until it exists, the scene needs a connection and the offline page says so
  like any other route.

The layout, at 360px first: the role card and the objectives at the top, collapsible and never gone;
the turns in their own scroll container, per the containment rules; the input above the phone bar
with the letter bar, the help button, and "say that again" as a first-class control, because asking
for repetition is the most useful sentence a learner can own and putting it on screen teaches it.

**Accessibility.** The turns are a log region that announces each new turn once and does not
re-announce the ones above it, which is the lesson the exam clock taught: a live region that updates
constantly reads a number a second at somebody. The provenance chip is text, not a colour. The
objective ticks carry an icon and a word beside the hue, because mint means recalled and nothing in
this app may be carried by colour alone.

You can walk out. Leaving is a real option in a real conversation, and the debrief handles it
without a word of reproach.

**What crosses to the browser is the briefing, not the run.** The planned run holds the seed, the
persona's leans and the curveballs, which are the things that are supposed to *happen* to somebody
rather than be read off a card, and the first version sent the lot: anybody with a network tab had
the whole afternoon, which counter clerk they got and what was about to go wrong and in what order.
Sonad answers the same question the other way and says why, because marking without a round trip is
most of how it plays; here nothing is bought by sending it, since every turn is marked on the server
anyway. `Briefing` in `lib/progress/scene.ts` is who you are, what you were given and who is behind
the desk.

**And the card shows what it points at.** Six props across the three scenes said "the word below" or
"the day below" and printed nothing below, so a learner could not know whether they had a fever or a
sore throat, and two of the doctor scene's three props were unanswerable: the beat could be met only
by guessing. The briefing carries the English of what was dealt, which is the exercise rather than a
concession to ADR-005. The card says what is wrong and you say it in Estonian; printing `valu` would
leave nothing to produce, which is the fault `npm run audit:questions` exists for one floor down.

**"I need a word" gives you a word.** It recorded the beat id, so a debrief listed `reason` and
`greet` under "words this conversation needed" with no way to keep any of them, on the one screen
whose whole job is turning a gap into a card. `sceneHelp` reads the run's own row, replays the
transcript to find which beat it is on, and offers a lemma from that beat's declared topic with the
dictionary's own English beside it: no provider, no booking, and through `oneEntryPerLemma`, because
`hall` is a noun meaning frost and an adjective meaning grey and this hands one entry to a button
that keeps it. Asking still costs the turn its `helped` flag and nothing else.

## 14. Where it lives

`lib/ux/nav.ts` gets one row, in `Every day`, after Practice. The rail answers four questions and
none of them is "what do I do with this", which is the argument for a row rather than a tile inside
Practice.

It does not take a cell in the phone bar. The bar holds four and a fifth breaks the 44px floor; its
four are the daily loop, and this is not yet part of anybody's daily loop.

Individual scenes carry `within: "/situations"`, which is the rule `lib/ux/modes.ts` already applies
to the five targeted drills: a scene is offered on the unit page whose `canDo` it tests, and a unit
links to the scene that tests its promise. That two-way link is what makes this part of the course
rather than a side game, and it is the reason the module is worth building: the syllabus has been
claiming for 81 units that a learner will be able to do something, and this is where it finds out.

**A scene's required beats are that `canDo` taken apart.** "Describe a symptom to a doctor and
understand the advice you are given" is three beats, and they are the three the scene marks, so the
claim the course makes and the thing the module checks are one sentence rather than two people's
readings of it. That is also what keeps the scene catalog from drifting into a list of situations
somebody thought sounded useful.

No panel on Today in the first build. `lib/ux/disclosure.ts` decides what a screen leads with, a
scene is a five to eight minute sitting rather than a daily obligation, and a module nobody has used
yet does not get to push the review button down the page.

## 15. Data model

```prisma
model SceneRun {
  id         String   @id @default(uuid())
  ownerId    String
  sceneId    String
  seed       String
  level      String
  difficulty Int
  /// JSON: the persona, the props, the curveballs drawn, the turns and their provenance.
  /// Nothing in here is true about the learner: the role card is fiction (§3).
  transcript String    @default("{}")
  /// Which required beats were met, and how it ended.
  outcome    String    @default("{}")
  startedAt  DateTime  @default(now())
  endedAt    DateTime?

  @@index([ownerId, startedAt])
  @@index([ownerId, sceneId, startedAt])
}

model SceneGap {
  id        String   @id @default(uuid())
  ownerId   String
  runId     String
  lexemeId  String?
  /// ASKED (the help button) | STALLED (the beat could not be met)
  kind      String
  createdAt DateTime @default(now())

  @@index([ownerId, createdAt])
  @@index([ownerId, lexemeId])
}
```

`SceneRun` is append-only, like `Review` and `Assessment`, with the same single exception: somebody
erasing their own account, because the promise on `/privacy` outranks the rule. `SceneGap` is a
child table rather than a field inside the transcript so that "the words my conversations keep
needing" is one indexed query instead of a JSON scan over every run.

Both are owner-scoped, so the export coverage invariant in `lib/legal/exportCoverage.ts` fails until
somebody decides about them, which is the correct behavior and the reason that check reads the
schema rather than a list somebody typed. Both belong in the backup and in the erasure. Neither
belongs in the classroom roll-up (§18).

An unfinished run lives on the device, the way an unfinished exam paper does
(`app/(app)/exam/[level]/resume.ts`), and the server sees the finished run. The client sends the
turns; the server re-runs `readTurn` to decide the objectives and the grades. That is ADR-022's
discipline, the client never sends a mark, and it costs one function call because the marker is
pure.

## 16. Cost, and what happens when there is none

`UsageKind` gets `SCENE`, and **each composed turn books its own call**. This section said the
opposite when it was written, and the reasoning behind that is worth keeping because half of it is
still right: running out of allowance halfway through a conversation is the worst failure available
to this module, and one booking for the whole scene was the obvious way to make that impossible.

It does not survive the ledger's own arithmetic. A call is written down when it is **authorised**,
which is what stops ten tabs reading the same "under the limit", and two of the three limits count
`CALL` rows. So a dozen composed turns behind a single booking is eleven calls the allowance never
saw, on the dearest path in the app, and the burst limiter, which exists to stop exactly this, would
have been counting one. It was also a reservation crossing to the browser and coming back, which is
a value the caller picks even when it is verified.

What survives is the requirement that a mid-scene refusal be **survivable**, and it is, because the
rung below the model is a real conversational move rather than an error: the other side did not
catch that, say it again. So the scene degrades where it runs out rather than stopping, which is the
same behavior §16 already promised a keyless deployment.

Two rules fall out of the per-turn shape and both are the ledger's own. The attested rung is tried
**before** the ledger is asked, because a line the dictionary already had costs nothing and booking
for it would ration a learner over a request nobody made. And a booking is handed back through
`releaseReservation` wherever nothing was composed, because a release gives back the *call* and not
only the money.

The honest sentence a learner is shown is therefore about the day rather than about scenes left:
what the quota says when it refuses names no one feature, since a conversation, the tutor and the
scanner all reach the same allowance and a receptionist screen saying "today's limit for Anu" is a
screen naming a feature the reader is not using.

The number itself needs the Phase 0 measurement, and the shape of the table is worth noting before
somebody picks one. `ALLOWANCE` is a whole multiple of the base, which is the tutor's ten a day, so
the smallest thing that can be said is ten scenes. A scene is worth roughly five grader calls in
tokens, so ten scenes is a real amount of somebody's budget, and the limit that actually binds is
the money rather than the count: the reservation is the whole scene, so the global budget sees a
scene as a scene. Either the table learns a fraction, or the entry is ten and the deployment's daily
budget is what rations it. That is a decision to make with a measured cost in hand, and not before.

**A deployment with no key runs this module, and Phase 0 cut that claim down.** The marking never
needed a model and still does not, so a keyless scene is marked identically. What a keyless scene
cannot do is ask: §25 found 350 questions in the whole shipped dictionary and 31 of them readable at
A2, so attested lines alone fill the greeting, the offer, the confirmation and the closing, and
leave the beats that carry the encounter empty. A keyless deployment therefore gets a real but
shorter scene, built from the beats retrieval can fill and saying so on the screen, rather than a
whole one with holes in it.

That moves the reviewed phrase bank of §19 from a later convenience to the thing that makes the
keyless path a conversation, which is a change Phase 0 paid for.

## 17. The learner's text reaches a model, so it is data

The last two turns go into the composer's prompt, which means somebody can type instructions into
it. The blast radius is worth stating rather than assuming.

The model's only output is one line, which is then checked for shape, vouched word by word against a
closed list, and checked for register. A line that tries to be anything other than a short Estonian
sentence fails the shape check; a line reaching outside the word list fails vouching; and either way
what the learner gets is the fallback, which is somebody asking them to repeat. The model cannot
call anything, cannot see the deck, cannot mark, and cannot advance the scene. The worst available
outcome is a wasted call and a withheld line.

Prompt text is never built by string-concatenating the learner's turn into an instruction: the turns
go in as conversation, the way the tutor's do. And the report button on every turn is the path for
anything strange that does get through.

## 18. What this must never become

Each of these is a way the module fails, with the guard that stops it.

- **A chatbot in a costume.** Guard: the state machine decides what happens, the dictionary decides
  what advances it, and the model writes one line for one move inside a closed word list.
- **A second exam.** Guard: no score, no percentage, no level, no pass mark. Counts of things
  achieved, and an outcome.
- **A teacher of wrong Estonian.** Guard: attested first, four checks always, withheld rather than
  caveated, provenance on every line, a report button on every turn, and nothing generated ever
  written to `Lexeme`, `Form` or a card answer.
- **A thing that needs a key.** Guard: §16.
- **The same conversation every time.** Guard: the recency rules in §5, measured.
- **A place people feel small.** Guard: the curveball budget is the learner's own dial, help is
  never taken away, walking out is allowed, asking for repetition is free and taught, English is
  counted and not scolded, and the debrief leads with what got done.
- **A window into somebody's private life.** Guard: the role card, and no scene asks for a real
  document number.
- **A way for a teacher to read a student's mistakes.** Guard: ADR-019 stands unchanged. A class
  sees effort and aggregate: a roster row says how many conversations were finished, and the class
  panel says which objective the group most often misses. A transcript belongs to one person.

## 19. Phases

**Phase 0 is done, both halves.** `npm run measure:scenes` answered the first and §25 is what it
said. `npm run eval:scene` answered the second and §29 is what it said, which is a different answer
from the one this section expected when it was written: the government check ships, and the
residual was never the gate or the model but words this course did not teach and forms this
dictionary did not hold.

**The vocabulary gap is closed and the number moved.** Fifteen words went into the units whose
subject they are, all fifteen back from Ekilex with attested sentences; the scenes now declare
where those words live; and three morphological gaps the eval exposed on the way are filled, the
polite imperative, both participles, and the second stem of a verb Ekilex records twice over.
The rate went from 60 to 70 percent to 35 to 50. That is a real change, it is still seven times the
design's line of 5, and §29 is why the recommendation is nonetheless to build.

**Phase 1 is not blocked.** What is left in the residual is a long tail of ordinary words nobody
has put in a unit yet, the government check's own 8.3% floor on honest lines, and the shape rule
refusing a two-sentence greeting. None of those is closed by another vocabulary pass, and none is a
reason to hold a module whose whole design is that a line it cannot vouch for is never shown: §6
already says a withheld line is retried once and the attested line stands. What that rate costs is
variety rather than correctness.

**Phase 1 is built, less the offline scene.** Three scenes at A2 and B1, drawn from units the
course already teaches: the health centre (`keha-ja-tervis`), the landlord (`eluase`), and the
counter that wants a document (`linn-ja-teenused`). Typed turns, mechanical marking, attested and
composed lines, curveballs on a four-position dial, personas, the debrief, and every guard in §18,
because a guard added afterwards is a guard that was missing for a release. `scripts/test-scene.mjs`
plays one through in a browser and CI runs it.

**The offline scene is the one piece not in it**, and §13 says what is missing rather than leaving
it to be found: the lexicon reaching the browser, and a service worker that pre-assembles one scene.
Nothing in the design blocks it and none of the pure modules would change.

The figure §29 asked for that no run of the eval could produce, **how often a beat falls back to its
attested line**, turned out to need no instrument at all once the module existed, and the answer was
not the one anybody was measuring for. §30 is what playing one through found.

**Phase 2.** The rest of the dials, the spoken unmarked mode, the two-way link from the unit pages,
the full curveball catalog, class assignment, and the loop that makes this more than practice:
**a word you could not say last week comes back in the next scene's props**. That is spaced
repetition applied to conversation gaps, `SceneGap` is already the right shape for it, and it is
Phase 2 rather than Phase 1 because it needs real runs behind it before anybody can tune how hard it
pushes.

**Phase 3.** The reviewed phrase bank: a line an admin approved becomes reusable, so scenes need the
model less over time. Out of Phase 1 deliberately, because it is a new kind of write into shared
content and it deserves its own argument rather than arriving inside a feature. It would have to
meet everything `lib/dict/upsert.ts` meets, plus one more rule: a banked line may never be a card
answer, an exam answer or a marking target, and that is an invariant rather than a note.

Phase 3 also holds **the worked example**, where the app plays both sides and the learner watches
once before trying. It is the most useful thing here for a beginner and it is the one feature that
puts composed Estonian in front of somebody explicitly as a model to imitate. Same gate, same
provenance, and a decision somebody should make on purpose rather than by extension.

## 20. What was considered and rejected

- **Hand-written dialogue.** The obvious answer, and the one this project cannot take: a scene file
  full of typed Estonian is ADR-005 broken in the most direct way available, and the first
  misspelling ships in silence.
- **A branching authored tree.** Variety by writing more branches. It multiplies the authoring cost
  by the thing it is trying to fix, and every branch is authored Estonian again.
- **Building it into Anu.** She already talks. She also streams, which is what stops her Estonian
  being gated rather than flagged (ADR-005 amendment 2), and she has no state machine, no
  mechanical marking and no closed word list. Putting this behind her would trade every guarantee in
  §18 for a chat window.
- **Speech recognition to advance a turn.** §11. Measured, not assumed.
- **A model deciding whether the learner was understood.** The judgment a model is least qualified
  to make, with the worst failure mode available: a learner marked wrong for being right, in a
  language they cannot yet argue in.
- **A score.** Every version of a percentage on a conversation read worse than the outcome sentence
  that replaced it.
- **Two learners in one class taking the two roles.** Genuinely good, and it needs realtime
  infrastructure this app does not have. Worth revisiting once a language house is actually using
  the classroom.
- **A patience meter.** §7.
- **Voice to voice.** Needs a recognizer this design has already turned down, and it would put the
  whole conversation behind a microphone prompt on a phone.
- **A morphological analyzer in the gate, for now.** §2 says what Vabamorf would and would not buy.
  The short version is that it overlaps vouching almost entirely, and the part that does not overlap
  is a syntactic check that is a project rather than a check.

## 21. The invariants

Written the way `scripts/test-invariants.ts` would assert them, because a rule with nothing behind
it is a rule that drifts:

1. **Every lemma a scene names is a word one of its own declared units teaches.** This replaces
   what was written here first, which was "no scene file contains an Estonian letter", modelled on
   the tripwire over `lib/estonian/grammar.ts`. Building the catalog showed that rule to be
   incoherent: a scene has to name the words its beats are about, and a check keyed on `õäöüšž`
   would allow `valu` and reject `küte`, which is not a distinction about anything. What replaced it
   is stronger, because a scene can then introduce no vocabulary at all, only point at vocabulary
   the Ekilex harvest already brought back. `lib/scenes/catalogue.test.ts` asserts it word by word.
2. Every `units` entry is a real syllabus unit id.
3. Every scene names the unit whose `canDo` its required beats take apart, and that unit exists.
4. Every curveball's out resolves inside its scene's word list at its level.
5. `advance` takes `Evidence`, `readTurn` is its only producer, and nothing under `lib/scenes/`
   imports a provider, a React module or Prisma.
6. Every line reaching a screen came from `sceneLine`, and `sceneLine` withholds rather than
   caveats.
7. Nothing generated is written to `Lexeme`, `Form` or `Card.back`.
8. `SceneRun` and `SceneGap` are append-only outside the erasure path, are in the export, are in the
   erasure, and are absent from the classroom roll-up.
9. The scene action is in `ACTION_LIMITS`, and the scene route sends `no-store`.
10. Every truncated read in the module states its order and ends on `id`.
11. A curveball is never drawn on the first beat.
12. `SCORED_SKILLS` is unchanged. This module contributes nothing to any level.

And one browser suite, `scripts/test-scene.mjs`, which is built and which CI runs: the chooser, the
briefing, the role card, the first line and its provenance chip, a turn that lands, the help button,
walking out, the debrief, and what was written down. It declares a floor like every other suite and
waives with a number and a reason rather than a line saying SKIP.

Two things about it are different from what was planned here, and both are corrections. **The model
is not stubbed.** `test-scan.mjs` stubs it because a scanner without one has no camera and there is
nothing to drive; a scene without one has a working ladder, so the honest test is the one that runs
in whatever state the server is in and reports which, which is what `e2e.mjs` already does about the
tutor. Keyed, the composed check runs; keyless, it is waived by one with the state that would lift
it named, and every other rung and every screen is checked either way. The floor is the count in the
full state, so both states are held to the same arithmetic.

**And it writes to no shared table**, so it needs no invented word: a run is the learner's own row,
and the cleanup is scoped to this scene's runs rather than to the table. The rule `test-scan.mjs`
states still applies to anything that does write one.

The offline scene is not in the suite because it is not in the build (§13).

## 22. For a language house pilot

The classroom already draws the boundary this needs: effort, never contents (ADR-019). A teacher can
set a scene for a week, see who finished it, and see which objective the group missed most often,
and can see no transcript at all. That is the honest shape of what a language house wants, which is
to know whether the class can book an appointment, and not to read twenty people's practice
attempts.

One thing belongs here because it is easy to get wrong in a funding application: the classroom
feature is built and no real class has used it. It should not be cited as a case study until one
language house has run one course with it. Until then the accurate sentence is that the feature
exists and is waiting for a pilot, which is fair to say and is a different thing from a result.

## 23. ADR-025, proposed

**A scene is assembled from the dictionary, advanced by the dictionary, and says which of its lines
a model wrote.**

The scene file names moves and unit ids and holds no Estonian. What the other side says comes from a
recorded usage where one fits, and otherwise from a model working inside a closed word list, checked
for shape and register and vouched word by word against that list at the same floor a photographed
word has to clear, withheld whole when it fails, and marked on screen as composed. What the learner
says is read by `readTurn` against the dictionary and by nothing else, so no model ever decides
whether a learner was understood and no model output can advance a scene. Nothing generated is
stored as a form, a card answer or a sentence in the shared dictionary. Speaking is unmarked
(ADR-018), and this module contributes nothing to any level (ADR-020).

This extends ADR-005 in the direction ADR-021 already went for a photograph and ADR-024 for a
headline: a model may propose Estonian, and the dictionary decides whether the learner sees it.

When the module ships, this belongs in `docs/03-architecture.md` §6 with the others.

## 24. Open questions

- **How much of a scene can attested sentences fill?** Phase 0 answers it, and the answer changes
  the cost, the risk and the shape of the first build.
- **Does a learner want the same scene twice?** The design assumes the second run is where the
  learning is. That is a belief, and a pilot can measure it: how many runs of one scene before
  somebody stops.
- **Which three scenes first?** The health centre is the strongest candidate, because
  `keha-ja-tervis` already promises at A2 that a learner can describe a symptom to a doctor, and
  because it is the encounter people are most afraid of. The other two are a judgment about the
  audience an integration foundation serves, and somebody who works with that audience should make
  it rather than this document.
- **Does the register dial belong to the scene or the learner?** A scene sets `teie` because a
  health centre does. Somebody practicing for a workplace where everybody says `sina` might want to
  override it. The safer answer is that the scene owns it and there are two scenes.
- **Is a syntactic check worth its dependency?** Vabamorf plus agreement and government rules over a
  whole sentence would close most of what §2 admits is left open. It is also the first
  Estonian-specific service this app would take a dependency on, and every module so far has been
  built out of the dictionary instead. Worth costing once the gate rejection rate is known, because
  a low rate makes the question smaller.
- **What happens to a run somebody abandons halfway, twice a week, for a month?** Nothing writes a
  grade, which is right, and the gaps still record what they could not say, which may be the most
  useful signal in the module or may be a way of telling somebody they keep failing. Worth watching
  before it is built on.

## 25. Phase 0, run

`npm run measure:scenes` reads the shipped dictionary out of the same files `prisma/seed.ts` reads,
builds the closed word list for each scene, and asks of every beat how many recorded sentences could
be that turn. No network, no database, no key. It reports rather than passes: a coverage figure is
an input to a decision, not a check somebody can break.

### What the dictionary holds

| | |
|---|---|
| Entries | 6,102 |
| Distinct forms, stored and derived | 155,557 |
| Attested lines | 14,913 |
| Of those, things a person says | 8,908 |
| Of those, questions | 335, which is 4% |

Two corrections stand behind those numbers and both were faults in the reading
rather than in the dictionary. The first run counted its corpus twice, because
it read the six files the seed reads without deduplicating on `(lemma, pos)`;
§28 has that. The second read the merge wrong in the other direction: the seed
lets the course harvest **supersede** a hand-typed entry and lets the built
expansion **defer** to one, and `shippedDictionary()` treated both as
deferring, so 293 words came back as their hand-typed version with none of the
harvest's sentences, level or forms. `olema` is one of them, which is how it
was found: the measurement went on reporting `on`, `oli` and `pole` as words
nothing could vouch for after they had been stored.

"Things a person says" is a rule this needed and did not have. `naturalSentence` rejects a usage
that trails off, carries a slash or labels itself, and has no opinion on `Kodune aadress.`, which is
a good illustration of a noun and is not a thing anybody says at a counter. A clause needs a finite
verb, and this app can list every finite verb form it knows without a parser: the stored principal
parts plus `derivedVerbForms`, which `npm run audit:verbs` already checked against Ekilex over 797
verbs. A question is let through without one, because `Mis kell on?` is a clause with no verb in it.

### The result

Twelve of the 21 beats fill from a scene's own units, and 15 from the whole course to that level.

Which reads well and is the wrong way to read it. What fills is the greeting, the closing, the offer
and the confirmation, in all three scenes. **The beats that carry the encounter fill at zero**: what
is wrong with you, where does it hurt, since when, what have you come for, which document, what has
broken. Those are the `ask` moves, and they collapse at the shape check rather than at readability:
the doctor scene's `where` beat has hundreds of lines mentioning a body part and single figures of
them are questions.

That is not a gap in the dictionary and no amount of harvesting fixes it. Ekilex records a usage to
illustrate a word, so 5% of what it holds is a question at all, and asking whether one is also
*about* the beat's own word is asking for a coincidence.

### The other bound, which is more useful than the first

A question usually does not name the thing it is asking about. "What happened" is a good way to ask
what is wrong with somebody and contains no word from a health unit, so matching a question by topic
is too strict for the one move that matters most. Matching by move alone gives the ceiling:

| Level | Readable questions | With the missing words | Allowing one unknown |
|---|---|---|---|
| A1 | 36 | 36 | 111 |
| A2 | 51 | 51 | 149 |

Fifty-one readable questions across the whole of A2 is not a pool to build a catalog on, or one
scene's worth of variety. It is enough to seed a phrase bank by hand and no more. The middle column
has stopped moving, which is its own small result: the words the corpus needs and the dictionary
could not vouch for were the missing units and the forms no rule reaches, and both are in now.

### The finding nobody was looking for

**The words that hold an Estonian sentence together are not in this app's dictionary.** 13,458
distinct words the attested corpus used could not be vouched for by any entry, and they appeared in
79% of all attested lines. The commonest were not obscure: `ja` 1,507 times, then `ta`, `oli`, `et`,
`ka`, `pole`, `nii`.

The measurement deliberately does not hard-code that list. Writing Estonian function words into a
file would be this project writing Estonian, and a frequency ranking is the better answer anyway.

**Reading the list turned out to matter more than the number, because it holds three faults and only
one of them is a missing unit.**

1. **Untaught closed-class words.** `ja`, `et`, `ka`, `nii`, `aga`, `nagu`, `siis`, `ainult` and
   their kind. The course had never taught a single conjunction. This is the missing unit and it is
   built: §26.
2. **Forms of `olema`.** `oli`, `pole`, `ole`, `olid`, `olnud`, `oled`, `polnud`, about a thousand
   occurrences between them. `olema` is in the dictionary; its present is irregular, so
   `lib/estonian/conjugate.ts` excludes it by name and correctly refuses to derive one, and its past
   is not derivable for any verb. A unit teaching `oli` as a headword would be wrong, because the
   headword is `olema`. The fix is stored or enriched forms on the entry that already exists.
3. **Short pronoun forms and the simple past.** `ta`, `tal`, `mu`, `me`, `su`, `nad`, and `jäi`,
   `läks`, `hakkas`, `tegi`. Both are documented decisions rather than oversights: CLAUDE.md says a
   pronoun's everyday case forms are the short ones that no rule over the genitive reaches, and that
   the simple past is not derived and may not be. Both arrive with the first enrichment of the entry.

Only the first is a syllabus unit, and conflating the three would have produced a unit teaching
inflected forms as headwords, which is the one thing a unit may not do.

### Three things the measurement got wrong first

Worth recording, because each was a plausible reading of the design and each was found by looking at
the lines rather than at the number.

**The band filter.** The first version kept only lines whose source entry was within one CEFR band
of the scene, through `isAround`. That window exists to choose which words to *teach* somebody and
it is the wrong question twice over here: a band is a fact about the headword rather than about the
sentence filed beneath it, and a symmetric window drops a line for being too easy, which took every
A1 greeting out of the B1 scene. There is no level in `fits` at all now. The level enters where it
belongs, in which units the closed list is built from, and readability then answers the question
precisely rather than by proxy.

**The two-word floor.** A one-word usage under a headword is a label rather than a sentence, so the
first version required two. `Tere!` is one word and is a complete turn, and so is `Nägemist!`, and
the floor took every greeting and closing beat to zero. Greeting and leaving are the exception and
it is not a special case, it is the shape of those two acts.

**The closed list.** The first version built it from the scene's own six units, about 119 words.
Somebody sitting an A2 scene has been through A1, so a line is readable to them if they have met its
words anywhere in the course. Both are reported now, because they answer different questions, and
the gap between them is small: 12 beats against 13.

### And a number that should not be trusted on its own

`--show` prints the lines a beat found, and it defaults to on, because this is a measurement with a
lot of moving parts between a JSON file and a percentage. It earns that immediately. The offer beat
in the doctor scene matches `Aeg ei peatu.`, which means time does not stop: a true sentence, a
recorded one, mentioning the word for time, and not a thing a receptionist says when offering an
appointment. A beat matches a line by keyword, which is the right test for whether a line is about
something and no test at all of whether it performs the move.

So every count above is an upper bound, and the honest conclusion is stronger than the numbers look
rather than weaker. The composer is load-bearing, the gate in §2 is what the module rests on, and
the reviewed phrase bank is what a keyless deployment needs to hold a conversation rather than a
greeting.

## 26. The unit the measurement asked for

Two units, both A1, appended after the twenty that were there, so the first three units at A1 stay
what they were and first run still builds the same deck.

| Unit | Words | What it is for |
|---|---|---|
| `sidesonad` | 10 | `ja`, `ning`, `aga`, `või`, `et`, `sest`, `ega`, `nagu`, `ehk`, `kuni`. Joining two thoughts. |
| `maarsonad` | 23 | `ka`, `ju`, `küll`, `siis`, `nii`, `ainult`, `vaid`, `mitte` and fifteen more. The words that put the weight where you mean it. |

Every one came back from Ekilex through `npm run harvest` with four attested sentences and its own
CEFR level, which is what makes this a request rather than this project writing Estonian: the
syllabus named 33 lemmas and Ekilex decided whether they exist. All 33 arrived; none was dropped.

Four things about how it was built are worth keeping.

**The part of speech is `ADVERB`, and that is what this course already calls an uninflecting function
word.** `kas`, `kui` and `palju` are `ADVERB` in `kusisonad`, and the harvest's own comment says
demanding forms for one "would drop every single connective in the course". Ekilex labels most of
these `konj`. Adding a part of speech for that would move the key `Lexeme` is unique on, which
`docs/13-mvp-status.md` §22 is the story of, for the sake of a label.

**Every gloss was checked against the Ekilex entry rather than written from memory, and two were
wrong.** `ehk` is first of all "perhaps" rather than "or", and `vaid` is "only" rather than "but
rather". A gloss is the answer side of a flashcard, so a wrong one is drilled rather than displayed.

**Every homonym is pinned by word id**, because `siin` is also a curtain rail, `liiga` is also a
sports league, `aga` is also a noun and a district in Russia, `et` is also the ISO code for Estonian,
and `või` is the butter the food unit already teaches. Six of the thirty three needed one, and every
one was found by a person reading Ekilex entries, which is not a method. See §27.

**Nothing was left out.** `ning`, `vaid` and `enam` were dropped for a day, because each is an exact
synonym of `ja`, `ainult` or `rohkem` and Ekilex gives each pair one definition, so a production card
asking "English to Estonian" has two right answers and marks one wrong. That was the wrong trade and
§27 is why: the course already shipped nine of those pairs, so dropping three of the commonest words
in Estonian would have made one unit pay for a course-wide fault. They are in, and reported.

### What it bought

| | Before | After |
|---|---|---|
| Attested lines containing a word nothing can vouch for | 79% | 76% |
| Readable questions at A1 | 23 | 30 |
| Readable questions at A2 | 31 | 40 |
| Readable questions at B1 | 37 | 48 |
| Beats filled by retrieval, of 21 | 13 | 13 |

A third more readable questions at every level, and **no change at all to the beat count**. That is
not a disappointment, it is the same finding twice: the beats retrieval cannot fill are limited by
how few recorded sentences are questions, not by how many words a learner knows. Teaching `ja` does
not make a lexicographer write a question they did not write.

**Both columns of that table are high, and the delta is the part to keep.** The measurement built
its pool by reading the six files the seed reads and did not dedupe them, where the seed writes
under a conflict key of `(lemma, pos)` and keeps the first writer. A word in both the hand-checked
seed and the course harvest was therefore counted twice, and its sentences with it. Corrected, the
dictionary is 6,083 entries rather than 7,127, which is exactly `SEED_SET_SIZE`, and the corpus is
13,683 attested lines rather than 15,920. Both columns were measured the same way on the same day,
so the comparison holds and the absolute figures did not. `scripts/lib/dictionary.ts` is the one
assembly now, shared with `audit-senses.ts`, because two scripts reading the same six files their
own way is how two reports about one dictionary start disagreeing about its size.

The re-harvest is worth one line of its own. It refetched all 1,371 existing words from a cold cache
and reproduced every one of them byte for byte: 30 added, none removed, **none changed**. That is
the harvest being deterministic and Ekilex being stable, and it is the reason a full re-run is a
safe thing to do rather than a diff nobody can review.

## 27. What the unit turned up on its way in

Three of the four notes written when the units landed were decisions somebody would have to take on
trust. They are checks now, and each one found something.

### The harvest was reporting an ambiguous homonym on one path out of two

`docs/13-mvp-status.md` tells the story of `kohus` at length: Ekilex numbers its homonyms, the
harvest took the first one in silence, and six course words were a different word for a year. The
answer was that a homonym is resolved by a person or reported, never guessed through, and the report
was written into the path that reads forms.

An adverb has no forms, so it returns before reaching it. Every uninflecting word in the course was
taking the first Ekilex candidate silently, which is how six pins in these two units came to be
found by hand. The formless path reports now, and there is no form set to filter a rival with, so
every other entry for the lemma is named.

It went from 73 reported to 88, and the fifteen it added were **already in the course**. All of them
come from the six units the seventeenth pass added for the words between the words, which is exactly
where you would expect them: `all`, `eile`, `enne`, `hiljem`, `homme`, `kohe`, `koos`, `kui`, `miks`,
`otse`, `palju`, `sees`, `teie`, `täna`.

Every one was then read against Ekilex, and **all fourteen had taken the right sense**. That is
luck rather than design, and the rivals say how much: `kohe` would have been the adjective for
porous, `koos` a ship's course, `miks` a remixed piece of music, `sees` the peplum of a blouse, and
`all` the name of the allative case. They are left unpinned, which is what the other path does with
the seventy three it reports, because the report is the mechanism and a pin is for a word that was
actually wrong.

Proved by removing the pin on `siin` and watching the run name the curtain rail, then putting it
back. A check nobody has made fail once is a check nobody knows the state of.

### Nothing had ever checked a course gloss

`audit:glosses` re-reads every built entry against Wiktionary and `audit:pos` does the same for its
label. Both point at the built expansion. The course harvest, whose English is the one authored
column in the whole pipeline and therefore the one no upstream source can be blamed for, was checked
by people reading definitions one at a time. Two of the thirty three glosses here were wrong that
way, and both were caught by hand.

`npm run audit:senses` is the check, and it needs no key and no network because the evidence came
back with the harvest and was sitting unread. `note` is Ekilex's own definition of the sense whose
forms, level and sentences an entry carries, so **two course words with the same definition are one
meaning by the Institute's own account**. That one fact reads two ways and both are faults: same
gloss means a production card with two right answers, and different glosses mean one of them
describes a sense the entry does not carry. The second is what would have caught `vaid`.

It found twelve pairs that way, and then the rule turned out to be the wrong one and the real number
is **372**. §28 is that story, because it changed what the fix is.

### The label was thrown away, so a coarsening could not be told from a mistake

`ADVERB` is what this course calls an uninflecting function word, which is why `kas`, `kui` and
`palju` were already ADVERB before any of this. Ekilex calls most of these `konj`. Using the coarser
label is right, because `pos` is half the key `Lexeme` is unique on and adding one is a migration
rather than a rename, but the harvest was **discarding Ekilex's own label**, so nothing could tell a
deliberate coarsening from a mistake.

It is recorded now, and the same audit reads it. The table of legitimate coarsenings was set by
narrowing until something honest complained rather than widening until nothing did: written wide
enough to admit `s` and `v` under ADVERB, nothing needed it, so it does not have it. The one real
widening is `num` on the two nominal labels, because an Estonian numeral declines and `kakskümmend`
has to be a nominal here or the numbers unit has no case table to teach from.

With that written down, the course's label and Ekilex's agree on **all 1,404 words**.

## 28. The rule was about meaning and the fault was about the prompt

The check in §27 grouped course words by Ekilex's own definition, on the reasoning that two words
the Institute gives one definition are one meaning and therefore one production card with two right
answers. It found twelve pairs. Both halves of that reasoning were wrong.

**A card knows nothing but its front.** A production card is front `translation`, hint `pos`, back
`lemma`, and `checkAnswer` marks against the back. Two entries collide when a learner cannot tell
which of them is wanted, and what the learner sees is the gloss and the part of speech. Whether the
Institute considers them one meaning does not enter into it. Grouping by the prompt instead finds
**372 prompts in the shipped dictionary that more than one word answers**, and every one of them
was a card able to mark a right answer wrong.

`sameMeaning` from `lib/questions/distractors.ts` was tried as the grouping and is wrong in the
other direction. It is built for "could these two be offered as different answers to one question"
and is deliberately generous, so it called `abi` "help" and `aitama` "to help" one prompt, which no
learner reading the hint would confuse. It found 459.

### The fix is the one the illative got

Every answer the prompt fits goes on the back, joined with the separator `acceptedAnswers` splits
on, so what the screen shows and what the marker takes are one string. `ja` and `ning` both build a
card reading "and" with the back `ja / ning`, and both words are marked right.

`lib/collections/senses.ts` is the rule, `lib/dict/facts.ts` caches the answer across requests
because which words share a prompt is a fact about the shared dictionary rather than about the
person waiting, and `lib/srs/deck.ts` reads it once per build rather than once per word, which is
the rule a deck build is already held to. `LexemeForCards.alsoAccepted` is optional: a caller that
has not looked builds the card that was built before, rather than silently claiming a word has no
synonym.

### And the cards already in a deck

Fixing the builder fixes the cards it builds and does nothing for the ones already written, because
a `Card` row carries its own back and nothing rewrites it: a learner who added `defineerima` before
this kept a card that marks `määratlema` wrong and drills it every time they get it right. A fix
that only reaches new learners is half a fix.

`repairProductionBacks` in `prisma/repair.ts` is the other half, and it runs where
`applyPosCorrections` runs and for the same stated reason: before the `--only-if-empty` early
return, because a card built the old way only exists on a database that was already seeded, which is
exactly the case that check skips. After the part-of-speech corrections, because `pos` is half of
what a prompt is.

Three things bound it. It may touch the **back and nothing else**, never `due`, `stability`, `reps`
or `lapses`, because a repair that reset somebody's progress would cost more than the bug it fixes.
It only ever **widens**: the answer the card already had stays first and the others join it. And its
guard is `back = lemma`, which is the signature of a card built before the fix, so a card already
carrying a set is left alone and a second run matches nothing.

`prisma/repair.itest.ts` is against a real database, because every claim there is a claim about
rows, and the one that would hurt is the scheduling: a raw `UPDATE` is exactly the shape that
quietly touches more than it says.

### And half of them are not synonyms at all

Ekilex's definition earns its place as the **diagnosis** rather than the trigger. Where the
Institute gives a group one definition they really are synonyms and accepting both is the whole
fix: `ja` and `ning` are both "and" and no gloss could separate them. Where it gives them two, the
gloss is not describing its own word, and that is a worse bug that accepting both only makes fair
rather than right.

Eleven of those were in the course, and ten of them were a card no learner could answer as asked.
All ten are corrected, from the Institute's own definition of each sense, in the house style the
course already had for one English word covering two Estonian ones: `leib` was "bread (dark)" beside
`sai`, "bread (white)", long before any of this.

| Prompt | Was | Is now |
|---|---|---|
| "character" | `iseloom`, `tegelane` | character (a person's) · character (in a story) |
| "application" | `avaldus`, `rakendus` | application (a form you submit) · application (a piece of software) |
| "competition" | `konkurents`, `võistlus` | competition (rivalry) · competition (a contest) |
| "connection" | `seos`, `ühendus` | connection (between things) · connection (a link or a service) |
| "to adapt" | `kohandama`, `kohanema` | to adapt (something) · to adapt (oneself), to settle in |
| "to justify" | `põhjendama`, `õigustama` | to justify (give reasons for) · to justify (defend as right) |
| "expression" | `väljend`, `väljendus` | expression (a phrase) · expression (the act of expressing) |
| "everyday" | `argine`, `igapäevane` | everyday (humdrum) · everyday (happening daily) |
| "equivalent" | `ekvivalent`, `vaste` | equivalent (of equal value) · equivalent (in another language) |
| "on the other hand" | `seevastu`, `teisalt` | by contrast, whereas · on the other hand |

`seevastu` is the one that is not a disambiguation, and it is the more interesting correction. It
had no shared prompt so much as the wrong translation: Ekilex defines it as standing "nagu
vastukaaluks" to what came before, which is `by contrast`, and `teisalt` is the one that really
means `on the other hand`. Two words were sharing a prompt because one of them was in the wrong
place.

### The eleventh was the check being wrong

`teravmeelne` and `vaimukas` are not two words with one gloss between them. Ekilex defines
`teravmeelne` as "vaimukas, nutikas, leidlik" and `vaimukas` as "teravmeelne, ootamatu ja leidlik":
two different strings, each naming the other word. Where the Institute has nothing to add beyond
naming the neighbors, its definition **is** a list of synonyms, and comparing the strings read that
as a disagreement. It sat on the defect list asking somebody to invent a distinction Estonian does
not draw, which is the one repair worse than leaving a gloss alone.

`sharedPrompts` knows the shape now, and the rule is **mutual** naming, which is the whole of why it
is safe. One definition mentioning another word means nothing: `konkurents` is defined as a
`võistlus` for supremacy and is not a contest, `põhjendama` ends "seletama või `õigustama`" and is
not self-defence. Measured over the shipped dictionary, one-way naming picks up both of those and
mutual naming picks up neither, matching exactly one pair in the whole file. A word can be used to
explain a second word without being it; two words can only define each other when there is nothing
between them to explain.

The boundaries are written out rather than left to `\b`, which is ASCII. A space and an `õ` are both
non-word characters to it with no boundary between them, so the obvious spelling misses the words
this language is made of, and a substring would call `seos` a mention of itself inside `seostamine`.
Both are tests, and both were made to fail before they were kept.

### What is left

Nothing on this axis. The defect list is gone rather than empty, because an empty exemption list
with two tests round it is the parking space every exemption list becomes; the check is now the flat
claim that no prompt in the shipped dictionary is one its own gloss cannot answer, with the fix
spelled out in the failure message. Shared prompts fell from 372 to 362.

The other 355 are outside the course, so they carry no Ekilex definition and there is nothing to
judge them by. They are marked correctly all the same, which is the point of fixing the card rather
than the list.

## 29. The gate, measured, and what it turned out to be measuring

§19 said what was left of Phase 0: `scripts/eval-scene.ts`, which measures the gate rejection
rate against a real chain and settles whether §2's government check rejects more real errors
than good lines. Both are answered. Neither answer is the one the design expected, and the more
useful of the two is not a number at all.

### The government check ships

The labelled set needs no key, because Ekilex had already recorded both halves and nobody had
read them together. The good lines are attested usages of a governed verb. The bad ones are the
same sentence with one nominal moved into a case the verb does not govern, which is a derivation
over a stored stem and exactly the error a composed line would make. Nothing is invented and
nothing is shown to anybody: the corrupted line exists for the length of a comparison.

Over 494 pairs it withholds **44.3% of real errors and 8.3% of good lines**, net +178. §2's
condition is met and the check goes in. It was 358 pairs at 48.9% and 8.1% before the case index
learned to read the attested forms; what widened the set is that a pronoun's own case forms are
now visible to it, and the false positive rate held.

What makes that defensible is how weakly it is drawn. There is no parser here, so nothing can say
which noun is a verb's complement, and the strict reading, that every noun be in a governed case,
fires on any sentence carrying an adjunct, which is most of them. So it asks the weakest thing
that is still a check: a line holding a governed verb has to hold **at least one** nominal in a
case that verb governs. A line with no governed verb and a line with no nominal are both outside
what it can say, and it passes them.

### The rejection rate went from 60 to 70 percent to 35 to 50, against a line of 5

Ten runs, three lines per beat, over whichever free model of the configured chain would answer.
The design's condition is that above one line in twenty withheld, "either the word list is too
small or the model is the wrong one for this, and the answer is not to loosen the gate".

| What the scene could say | First attempt | After the one retry §6 allows |
|---|---|---|
| The units it declared, 119 lemmas | 84.1% | 74.6% |
| The whole course to its level, 622 | | 74.6% |
| Its subject units too, 151 | 81.0% | 68.3% |
| The words between the words too, 223 | 69.8% | 61.9% |
| With the polite imperative stored, 223 | 77.8% | 69.8% |
| With the fifteen words the run above named, 226 | 71.4% | 63.5% |
| With the scenes declaring where those words live, 321 | 65.1% | 47.6% |
| With the case index reading attested forms, 321 | 58.7% | 36.5% |
| With both participles and the second stem, 321 | 54.0% | 41.3% |

**Two pairs of rows here are the same configuration twice**, and they differ by eight points and
by five. That is the honest headline of this table: 63 lines is enough to rank causes and not
enough to resolve a difference of that size, so the round-by-round deltas are not measurements and
are not reported as any. What the ten runs establish is two ranges, 60 to 70 percent for the first
six and 35 to 50 for the last two configurations, and the gap between those is several times the
noise and is a real change. It is also still seven times the line.

Read the rows as configurations rather than as a trajectory. Two of the drops are larger than the
noise: the scenes as they were written against the scenes with the words a conversation needs, and
the vocabulary pass and the three faults it exposed against everything before it.

### What the number was actually measuring, four times

The first thing it measured was a bug in the scene catalog. `arsti-aeg` is set at a health
centre and its word list did not contain `arst`; none of the three scenes contained `olema`, so
every line built on "Kas teil **on** valu?" was withheld; `uuri-remont` is about something broken
in a flat and had neither `korter` nor `köök`. Nothing about the catalog looked wrong. A scene
that declares too few units produces a gate that withholds correct Estonian, and the rate reads as
a verdict on the model.

The second thing it measured was the same fault one level out. With the subject units added, the
two commonest words the gate withheld a line over were `ja` and `või`: the course teaches them and
no scene had declared the unit. `pohiverbid`, `sidesonad`, `vastused`, `maaramine` and `millal`
are in `COMMON` now, on the test `COMMON` already stated, that a unit belongs there when it
teaches the machinery a conversation is made of rather than the subject of one.

The third was the same fault a third time, after the vocabulary was in. `sobima`, `asuma`,
`valmis`, `katki`, `alates` and `kaasas` were now taught and were still being withheld, because a
scene declares units and none of these scenes declared the unit each word had been added to. That
is the answer being right about where a word belongs and the catalog not knowing: `kohasonad` and
`kus-ja-kuhu` joined `COMMON` on the test it already stated, the postpositions and the adverbs of
place beside `millal`'s adverbs of time, and `plaanid`, `minevik` and `omadussonad` are declared
per scene against the beat that needs them, which is why the counter takes no `minevik`. Nothing
happens at a counter in the past tense.

The fourth was the instrument. `eval-scene.ts` built its index of "which case is this token in"
through `stemsFromParts`, which returns `retrieved: {}` by design, so it knew the rule's answer and
nothing else: no `mulle`, no `teile`, and nothing at all for a pronoun stored as an attested
set of forms with no principal parts. The government check therefore read the polite register as
ungoverned, which is the register every scene is set in, and `Kas kell kolm sobib teile?` was
withheld over the one word in it that answers `kellele`. `formsOf` one file over had already
learned this and said so in a comment; the script had not.

None of the four would have been found by reading the rate. All four were found by reading the
ranked list of words the model reached for, which is the same instrument `measure:scenes` used to
find the missing connectives unit, and which is why this script prints one.

**And there is no principled end to widening a catalog**, which is worth saying because the
third fault could be chased for ever. `ütlema` and `probleem` are in the residual of the last run
and both are taught; declaring one more unit apiece would remove them and expose the next two. The
test stays what `COMMON` says it is, that a unit teaches the machinery of a conversation or the
subject of this one, and what falls outside it is reported rather than absorbed.

### Vouching was the whole of it, and now it is not

For the first six runs, vouching accounted for about 85% of what was withheld, register for none,
and shape for a handful. The composed Estonian was not the problem. These are real lines the gate
threw away:

    Kui kaua see on kestnud?
    Kas see aeg sobib teile?
    Palun, kus teil valutab?

Those are what a receptionist says. What failed is that `kestma`, `sobima` and `valutama` were not
in this course at any level, and they are not unusual words. They are the verbs the encounter turns
on, and the pattern behind them was one sentence: **the course taught the nouns of a situation and
not the verbs that do things with them.** It had `valu` and `haige` and no `valutama`; a unit on
housing and no `katki`.

The fifteen that closed it, each added to the unit whose subject it is: `valutama`, `sobima`,
`kestma`, `asuma`, `mujal`, `siia`, `esitama`, `tunduma`, `korrus`, `kellaaeg`, `katki`, `valmis`,
`alates`, `kaasas` and `oma`. Every one came back from Ekilex with four attested sentences and a
level, which is what the harvest is for: the syllabus names a lemma and Ekilex decides whether it
exists.

**After that pass the shape of the residual changed rather than only shrinking.** On the last run
vouching is half of what is withheld and government is the other half, where before it was six to
one. That is worth more than the rate, because the check that fires most often now is the one whose
false positive rate Part B publishes, and 8.3% of good lines is a floor this design has already
accepted. What vouching still catches is a long tail of ordinary words nobody has put in a unit,
`üürileandja`, `pärastlõunal`, `tõttu`, next to words the course does teach that no scene declared,
which is the paragraph above about where widening has to stop.

### And three gaps that were forms rather than words

A scene set in `teie` is answered in the polite imperative, and the model reached for `öelge`,
`andke`, `oodake` and `täitke` over and over. The app had no such form for **any verb in the
language**: it is not a suffix on anything the rule holds, since `annan` goes to `andke`, `lähen`
to `minge` and `loen` to `lugege`. It is stored now, one per course verb, and it shows on the
conjugation table and asks a card, because a form somebody is addressed with every day is a form to
learn rather than only to recognise.

The re-run found the second the same way. `Kui kaua see on kestnud?` is how anybody asks how long
something has been going on, the course teaches taisminevik on its own grammar page, and the
dictionary could not vouch for a single `nud` in Estonian. Neither participle is derivable, since
`minna` goes to `läinud`, `teha` to `teinud` and `näha` to `näinud`, so both are stored the way the
imperative is. No card asks one and no screen prints one: a participle is met inside a construction
rather than as a slot, and storing a form and asking about it are two decisions.

The third was not a missing form but a discarded one. `öelge` was in the Ekilex response all along
and was thrown away, because `ütlema` is recorded as **two full sets of forms**, one built on
`ütle-` and one on `öel-`, and the harvest read one of them. `ise` is the same shape, `enese` in one
set and `enda`, which is the form anybody says, in the other, with every oblique case behind it. 167
of the 2,057 form sets the course reads have a second. Reading them all is safe because both belong
to one `wordId`: a homonym is a different word with its own id, which is what the pinning is for,
while two matching sets under one id are two ways the same word inflects, `haigus` with `haigusi`
and `haiguseid`, and both are Estonian.

That is the whole value of running this before Phase 1 rather than after it. All three gaps were in
the morphology the app can produce, all three were invisible from inside the app, and all three were
found by watching a model try to hold a conversation. 814 forms, on the same 6,110 words.

### What this says about Phase 1

Not "the gate is too strict" and not "the model is too weak". Both were the obvious readings and
both were measured: five times the word list bought eight points and the retry bought nine, which
are the sizes of the noise. What the residual was made of, run after run, was words this course did
not teach and forms this dictionary did not hold.

Closing that took the rate from 60 to 70 percent down to 35 to 50, which is a real change and is
still seven times the line. **So the recommendation is no longer to wait.** What is left is not one
gap with a name on it. It is a long tail of ordinary words nobody has put in a unit yet, plus the
government check's own 8.3% floor on good lines, plus the shape rule refusing a two-sentence
greeting. None of those is closed by another vocabulary pass, and none of them is a reason to hold
a module whose whole design is that a line it cannot vouch for is never shown.

What a rate near 40 percent actually costs is variety rather than correctness, because §6 already
says what happens: a withheld line is retried once, and if that goes too the attested line stands.
Phase 1 should be built with that number written on it, and the first thing to measure after real
runs is how often a beat falls back to its attested line, which is a figure a learner can feel and
the rejection rate cannot tell you.

What is banked either way: the government check is settled, the scene catalog is correct on the
test `COMMON` states, the fifteen words are in the course, every verb has its polite imperative and
both participles, a verb with two stems has both of them, and the script that found all of it is in
the repository with a flag for the two allowlists and a ranked list that names the next gap for
whoever runs it.

### How to read a run

`npm run eval:scene` does both halves; the second needs no key. `--lines 10` if the free chain's
daily allowance is not spent, because three is the sampling floor rather than a good sample.
`--allowlist course` measures the wide list. A run that composed nothing reports that it composed
nothing rather than a rate, and names which model refused with what status, because the first
version of this reported `0/0 withheld (0%)` at a rate limit and that reads as a perfect score.


## 30. Building it, and the rung that had never answered

§29 measured the gate and asked for one more figure that no run of the eval could produce: how often
a beat falls back to its attested line. Playing a scene through answered it and the answer was that
**the attested rung had never answered at all**, on any beat of any scene, in any run, including
every run of the eval that §29 is built on.

`Lexeme.examples` is a JSON string column and `sceneContext` split it on newlines. So a word with no
sentences came back as one line reading `[]`, and a word with sentences came back as one line of raw
JSON; `naturalSentence` correctly threw every one of them away. That is not a near miss and it is
not visible from any measurement the eval takes, because the eval measures **what the gate does to a
composed line** and this fault is one rung above it: the composer was being asked on every beat of
every run, including the beats retrieval was supposed to have filled for free. The rate §29 reports
is still the rate the gate withholds. What it was not is a picture of the ladder.

It reads through `parseExamples` and `usableExamples` now, which is what decides what a sentence is
everywhere else in this app, so the scene and the dictionary entry cannot disagree about what is
worth showing.

**And a phrase is its own sentence.** Ekilex records a usage against a *word*, to show it doing its
job in a sentence, and it holds none for `Tere!` or `Kuidas läheb?` because those already are the
sentence. CLAUDE.md has said so for a while about the dictionary entry screen; nothing had connected
it to retrieval. So the beat every scene opens with had nothing whatever in its pool, and keyless the
receptionist said **"Ma ei saa aru" before the learner had said a word**. That is not a conversation,
it is the ladder falling all the way through on the one beat every scene shares. A phrase entry is
now its own line, which is retrieval rather than composition: the lemma is a headword a lexicographer
wrote down, and putting it on a screen is the dictionary speaking.

**What that does to the numbers is not measured here and should not be.** The honest thing to say is
that §29's runs asked a model for lines a working retrieval rung would have supplied, so the split
between rungs in those runs is unknown rather than what was reported, and the withheld *rate* is
unaffected because it is a ratio over composed lines. Re-running the eval would produce a new
number; it would not answer a question anybody has asked yet, and §29's own warning about six runs
of 63 lines applies to it exactly as before.

**Three more faults, all of the same kind: silent, and shaped like an app with nothing in it.** The
route returned a line on three of its four branches without the progress beside it, so the screen was
handed something to read and never told which beat it was on: `beatId` stayed null and "Say it" was
disabled for the whole run. The rate limiter's verdict was returned as though it were a `Response`,
which made every turn a five hundred. And the role card told a learner to read a word off a place on
the card where nothing was printed.

**None of the four is findable by a unit test and all four are trivial in a browser.** They are the
argument for `scripts/test-scene.mjs` rather than an anecdote about it: the module is six processes
and every one of these lived in the seam between two of them. §21's suite was written last, which is
the wrong order, and the four faults are what that cost.

**One design correction fell out of it too.** A scene booked one call for the whole conversation, on
the argument that running out of allowance halfway through is the worst failure available here. The
argument is real and the booking was wrong: the ledger writes a call down when it *authorizes* one,
because two of its three limits count `CALL` rows, so a dozen composed turns behind one booking is
eleven calls the allowance never saw, on the dearest path in the app. Each composed turn books its
own now and hands it back where nothing was composed. What survives of the original argument is that
a mid-scene refusal has to be survivable, and it is, for the reason it always was: the rung below the
model is a real conversational move rather than an error.

## 31. ADR-025 amendment 1: a line written before anybody played

§30 ended with a ladder of three rungs, and two facts about it that pull in opposite directions.
The composer is load-bearing, because a lexicographer records a sentence to illustrate a word and
not to ask a question about it, so retrieval fills the greetings and almost nothing that makes a
scene *this* scene. And the composer is the one rung a keyless deployment does not have, which is
the default deployment, so on the default deployment the receptionist could greet you and then say
nothing a learner could answer. Phase 3 had the fix filed under "later": a reviewed phrase bank, so
scenes need the model less over time. The MVP brief asked for the same thing from the other end,
a mission that is "a sequence of illustrated situations where the learner has to retrieve language
to progress", with "no complicated AI", which is a scene whose other side is known in advance.

**A scripted line is a composed line moved to a different moment.** `scripts/draft-lines.ts` asks
the same chain the route asks, with the same prompt, inside the same closed word list, and runs the
answer through the same four checks in `lib/scenes/gate.ts`. What passes is written into
`lib/scenes/bank.ts`, which is generated and never typed, with the model that wrote it and the day.
The pull request that adds a row is where a person reads it. A native speaker's pass, when there is
one, edits the same file and flips `reviewed`, and the chip on screen changes with it. The ladder
is four rungs now: attested, scripted, composed, the way out, in that order, because that is the
provenance order. A recorded sentence is somebody's Estonian; a scripted line was gated yesterday
and read since; a composed line was gated a second ago and read by nobody.

**What it costs and what it buys.** A keyless deployment holds a conversation on every banked
beat, with the chip saying exactly what it is reading. A keyed one pays for no turn the bank
covers and meets a scene that replays, which is what makes a mission a mission. What is given up
is variety on those beats, bounded at three lines each and passed over once used within a run, and
the honest description of that is the one §5 already makes about attested lines.

**Which beats may have one.** A line that has to name a time, a room number or a document code
cannot be drafted before the run that draws it, so `scriptable` refuses any beat waiting on such a
datum, and the bank is read through that rule rather than trusted. The doctor's `offer` beat stays
the composer's for that reason, and so it should: "does Thursday at three suit you" is the one
line in that scene that has to be about the card in the learner's hand.

**What it must never become**, asserted rather than noted: never a card answer, never an exam
answer, never a marking target. Nothing under `lib/srs`, `lib/exam`, `lib/assessment`, nor the
turn marker, can reach the bank; the drafter refuses a digit, a dash and the fallback phrase before
the gate is even asked, and it refuses a line that hands over the form the beat is about to ask
for, which was the first thing it produced: three lines for the milk beat and every one of them
said `piima`, so a learner who copied the word out would have retrieved nothing. That is the
answer printed in the question, the fault `audit:questions` hunts on every card, and the bank's
test asks it of every row. It refuses a line with no finite verb in it, too, which is the fault the
four checks cannot see and the first full run produced four times: `Kus pood praegu olema?` has
every word on the list, breaks no government and is one sentence long, and it is not a sentence
anybody says, because the `ma`-infinitive is standing where `on` belongs. The retrieval rung
already holds a recorded usage to that floor. And every unreviewed row is re-judged by today's
rules on every run of the drafter, so a rule added after a bank was written reaches the bank rather
than only the next line. The finite-verb rule exempts the greeting and the farewell, which are
phrases, and asks nothing of a line under four words, because `Millisest päevast alates?` is a
question anybody asks and the plain rule struck `Head aega ja aitäh teile!` first; and `bank.test.ts` re-runs every row through the gate against its scene's
own word list on every run of the suite, so a scene edited after a row was drafted, or a unit that
lost a word, shows up as a row that no longer passes rather than as a line a learner meets.

**The first mission is the brief's own example.** `poodi-piima` is going to the shop for milk with
a friend on the phone: `pood` in the illative, the inessive and the elative, and `piim` in the
partitive, met once each in the order an errand meets them. A1, in `sina`, because the other side
is a friend and a first mission should not ask for the polite register on top of the cases.

## 32. ADR-025 amendment 2: the other side reacts, and a usage is not a line

A learner played the first mission and reported that every situation felt strange and the replies
were horrible. They were right, and the screenshot they sent said why in three bubbles. `Tere!`,
then `Kuhu sa lähed?`, then, after they had answered `poodi`, a grey card reading "They ask you
about it." Nothing they said was ever reacted to. The friend on the phone asked a question, was
answered, and asked the next question as though nothing had been said, and when the ladder ran
out the friend was replaced by a sentence about the friend.

Two faults, and neither was in the gate, the marker or the state machine, all three of which were
doing exactly what §2, §3 and §8 asked.

### A usage is about a word, not about a beat

The attested rung took every recorded sentence under a beat's topic words, on the argument in §2:
a lexicographer's sentence outranks anything a model writes. It does, as Estonian. As a line it
was measured offline over the four scenes, and this is what it filled the beats with:

| scene, beat | what the other side said |
|---|---|
| `poodi-piima`, where you are now | `Olla või mitte olla?` |
| `poodi-piima`, what you want | `Mis kell on?` |
| `poodi-piima`, where you are coming from | `Kust sa seda kuulnud oled?` |
| `arsti-aeg`, the time offered | `Aeg ei peatu.` |
| `arsti-aeg`, reading it back | `Aastas on 365 päeva.` |
| `uuri-remont`, they cannot come this week | `Esimesel korrusel on tehtud remont, teisel mitte.` |

Every one of those passed the funnel in `retrieval.ts`: on topic, the right shape, a sentence
somebody said, every word readable. Every one was printed under a chip calling it a recorded
sentence, which was true. A usage illustrates a word doing its job in some sentence; a beat wants a
sentence doing a job in this conversation; and the two meet by luck, which over the catalog they
did exactly once, on `Kuhu sa lähed?`.

So the attested rung fills the beats whose line *is* a phrase the course teaches. `Tere!` and
`Head aega!` are their own sentence (`isPhrase`), and the lemma is the line. Everywhere else the
line is the scripted bank's or the composer's, and both are now told what the beat is for. A person
may still pick a usage out where it happens to be the line: `BeatSpec.lines` names one by its text,
the catalog test fails on a text that is not a usage of one of the beat's own topic words in the
harvest, and the context builder drops one the live dictionary no longer holds. `Kuhu sa lähed?` is
pinned that way. Choosing a lexicographer's sentence is less than hiding a word from one, which
ADR-005 already allows.

### The other side never said what they were doing

The composer and the drafter were told the beat's `goal`, which is written from the learner's
side. "Your move: ask. What you are doing is: say since when." A model given that wrote, for the
landlord, `Millisest päevast alates on teil plaanis remonti teha?`, which asks the tenant when they
plan to do the repairs. The counter clerk asked `Palun, miks te ei ole esitanud oma avaldust?` of
somebody who had come in to hand one over. Every beat carries `they` now, one line of English from
the other side's own point of view, and it does three jobs: it is what the drafter and the composer
are told they are doing, it is the stage direction printed where no Estonian could be built, and
it is the translation a helpful persona offers to somebody who wrote English. It may name a value
off the card, so the receptionist's offer reads "They offer you an appointment at 14:30" rather
than "They offer you something", and a beat whose `they` names one is not scriptable, which is
what took `Kas see on neljapäev?` out of the doctor's confirm beat.

Fifteen rows left the bank on the same reading, each for a stated reason: a line said from the
wrong side, a line pinning a weekday nobody was dealt, a line with no verb in its first clause,
`Tere, mina olen teie omanik`, and `Head aega, sina!`. The drafter's refusals cannot see any of
those, because every one passed the four checks. The pull request is where a person reads a row,
and this is what reading them found.

### A reply is a reaction and then a move

`lib/scenes/reply.ts` is the third change and the one the learner would notice first. `state.ts`
already decided, per turn, whether the other side answers, narrows, repeats, waits, moves on or
answers English; the route then ignored that and asked the ladder for the next beat's line
whatever the answer had been. `replyFor` reads the response and the reading and assembles a short
list:

- **A turn that landed** gets an acknowledgement, then the next move. `Hästi.`, `Aitäh.`, `Jah.`,
  rotating on the number of beats met, never after a greeting, since the next line answers that.
- **A turn nobody could read** gets `Ma ei saa aru` and then the same question again, from the
  text the learner already heard. A person who was not understood repeats themselves; the old
  route drew a fresh line from the pool, which was a different question and read as a non
  sequitur.
- **A turn that missed the point** is asked again in other words where the ladder has some, and
  in the same words where it has none. Never the repair phrase: they were understood.
- **One word where a sentence was due** gets `Jah?` and nothing else. A look and a wait, §8's own
  words, and on a screen the look is one word with a question mark.
- **English** gets the question again in Estonian, and from a helpful persona the stage direction
  under it, which is the translation §8 promised. `PersonaSpec.translates` says who.
- **Out of patience** gets "They let it go, and move on", in English, and the next beat's line.

Every Estonian word in a reaction is a lemma in `REACTIONS` or the repair phrase, and both are
requests against `vastused`, `maaramine` and `tervitused`, which every scene declares, so the
catalog test that checks a beat's words checks these too. Capitalizing a lemma and putting a
full stop or a question mark after it is presentation, the way `Tere!` is printed as a line, and
not composition: the word is the dictionary's and the mark is the move. What the route sends is a
list of lines, each with its provenance; the screen draws a reaction and a move as two bubbles in
one group, draws a stage direction as italic text with no bubble because nobody said it, and
labels a line in words under it rather than in a chip shouting under every bubble. "Say that
again" is a button that says the last line again without a round trip, since a person asked to
repeat themselves does not rephrase.

Two smaller things came out of it. The echo rule in `readTurn` was being handed the learner's own
previous turn as "the line the other side just said", so it read a learner repeating themselves as
parroting and a learner handing the question back as an answer: what they heard travels with each
turn now, and the transcript keeps it, so a debrief can show both sides. And the shop scene's
beats wanted a sentence, so `poodi` to `Kuhu sa lähed?` was a fragment and got a look and a wait,
which is not what a friend on the phone does with a perfectly good one-word answer. §8 already
said a bare word is an answer at A1; the scene's four case beats say `word` now, and the cases are
still the whole exercise.

### The second pass, driven in a browser

Playing every scene through on a seeded database found six more things, and every one of them is
the kind a unit test cannot see because it lives in the seam between the marker, the card and the
screen.

- **The time on the card could not be said.** `words()` returns letters, `11:30` has none, so the
  offer beat's datum was unmatchable and the receptionist gave up on every learner who typed the
  time she had offered. A spelling with a digit in it is looked for in the text now, and so is the
  time in words: `timeWords` names `üksteist` and `pool kaksteist` as lemma requests against
  `arvud`, checked like every other request.
- **The offer and the confirm have an Estonian line keyless.** `BeatSpec.says` names one course
  word and a slot off the card, and `datumLine` says `Kell 11:30?` for the offer and `Kell 11:30.`
  to read it back. Every letter is a headword or a datum the learner is already reading off the
  card, which is the reaction's licence with a value beside it.
- **A farewell ends the conversation wherever it comes.** `Head aega!` in the middle of a scene was
  a one-word answer to "where does it hurt", and got `Jah?`. Somebody who says goodbye has left,
  the other side says goodbye back, and what was not done is what the debrief is for.
- **One turn can answer two beats.** "Tere, ma lähen poodi" greets and says where you are going,
  and the friend does not then ask where you are going. A turn that lands is read against the next
  beat too, and again while it keeps landing.
- **A short question is a whole turn.** `Kui kaua?` has two words and no finite verb, and
  `looksLikeSentence` wanted three: it was written to refuse a bare form before the writing
  exercise spends a call. The scene's rule takes a question mark, or a subject with its verb, as
  a sentence, and the marker was handed `hasFiniteVerb` for it.
- **The brisk persona stops acknowledging.** `PersonaSpec.acknowledges` is the difference between
  brisk and a slightly smaller number: they take the answer and ask the next thing.

### The curveballs are played

The difficulty dial promised "one thing catches you out" and nothing ever did: `planRun` drew the
curveballs, `beginRun` wrote their ids down, `recencyFor` read them back so the next run would not
repeat one, and no turn of any conversation was changed by one. They are hurdles now (`raiseHurdle`,
`advanceHurdle` in `state.ts`). The draw keeps the beat each was placed at; when the conversation
reaches it the other side does what the curveball says, the beat waits, and the learner's turns are
read against the curveball's own `needs` from §9 until one lands or `HURDLE_TRIES` have not. A
learner who ignores it and answers the beat anyway is let through, and the curveball is written
down as let go, because that is what most people do at a counter and it is worth reading
afterwards. A silent one takes a try off the beat, which is what a queue is. Each curveball names
the move the other side makes, so a keyed deployment composes its line inside the same gate, and
keyless it is a stage direction with the way out as the goal on screen. The debrief lists what went
wrong on the way and whether it was handled, which is the first time the dial has produced anything
a learner could read. A run written before the beat was stored holds ids alone and is read as
nothing in play.

### Lines for the curveballs, and who wrote them

The drafter looped a scene's beats and never its curveballs, so keyless every curveball was a line
of English about what happened. `sceneBeats` is the list it loops now: the scene's own beats and
one `hurdle:<id>` beat per curveball the scene admits that has a move to make, and the bank, the
bank test and the context builder all read the same list. The switch to English is the one
curveball said in English on purpose, as a bubble labelled as such, because the whole point of it
is that the other side gave up on Estonian and the learner is practicing not to.

The free models this repository can reach wrote nothing usable for those beats, so the lines were
typed in a session and pushed through the same four checks and the same refusals the drafter
applies, and only what passed went in: 53 rows, model `authored`, `reviewed` false like every row a
person has not yet read. A row is in the bank because the checks let it through and a reader can
see it in the diff, which is the standing every drafted row has had; what a native speaker's pass
adds is the same for both. That is a widening of the bank's own rule, that nothing in it is typed
by hand, and it is written down here rather than left for somebody to find: the rule was there to
keep unchecked Estonian out, and these rows were checked by the very code the rule exists to
route everything through.

Two of the four checks had to be corrected on the way, and both corrections were found by lines
the checks refused that any Estonian speaker would say. The government check withheld `Kust sa
tuled?`, the sentence a lexicographer recorded for `kuhu`, because it wanted a noun in the elative
beside a verb that governs one and did not know that the question word *is* the complement; and
it withheld `See aeg ei sobi enam`, where the only nominal is the subject and the complement is
simply not said. It takes the course's question words now and stands down where one is present,
and it fires only where a nominal in an oblique case sits beside a governed verb with nothing in
a case it governs. The old rule and the new are both applied, so nothing the old rule let through
is refused now. And five units joined the scenes' word lists so the curveballs had words to be said
with: the weather for small talk, `rääkima` and `ütlema`, the documents unit for a health centre
and a landlord that ask for papers, and shopping for a landlord and a counter that name a price.

### The third pass: the other side repeats what it heard, speaks, and there are seven scenes

Three more things, each driven in a browser before it was kept.

- **They repeat your word back.** `Evidence.matched` carries the learner's own words that met a
  requirement, and the reaction to a turn that landed is that word with a full stop: `Pank.` before
  "Minge otse edasi", `Poodi.` before the next call. It is the learner's form, vouched by the
  dictionary as the one the beat asked for, so nothing here chose it; a value with a digit in it is
  never repeated, since the confirm beat reads the time back in its own line. Where nothing was a
  word, the acknowledgement rotates as before.
- **The lines are spoken.** §6 promised every line in the persona's voice and the session never
  played one. Each Estonian bubble carries the app's own speaker button in the run's voice, and the
  newest line plays itself where the learner has autoplay on, since a turn was just pressed and
  the gesture the browser wants has happened.
- **Three more scenes**: ordering a coffee (`kohvikus`, A1), asking the way (`tee-kusimine`, A2)
  and buying a bus ticket (`bussipilet`, A1). Each is a claim a unit already makes, each deals a
  word off the card the learner has to produce, and each shipped with its lines and its curveballs'
  lines written and checked the way the last section describes, so all seven play keyless from the
  first line to the debrief. `scriptable` was corrected on the way: it refused any beat that waits
  on a per-run value, which took "Mis kell?" away from the ticket seller, and what actually cannot
  be drafted is a line that *names* the value, which the stage direction says with a slot.

### Keyless coverage is asserted, and a person can add a line

"All seven play keyless from the first line to the debrief" is a property now rather than a
sentence in this file: `bank.test.ts` walks every beat of every scene, and every curveball a
scene admits that has a move to make, and fails on one with no line that is not a phrase beat the
dictionary answers or a beat said off the card. It found two beats this section had missed on its
first run, the landlord refusing and the clerk pointing at the queue, which is the argument for it.
`npm run check:lines lines.json` is how a person adds a line: a list of `[scene, beat, text]`
goes through the four checks against the scene's own word list and the drafter's refusals, and
the verdict names which words the scene cannot vouch for. A line that passes goes into the bank by
hand as `authored`, and the suite checks it again on every run. The tile for each scene reads what
it practises off its beats, in the words a class uses, and how the last run ended off the runs
(ADR-014), so the list is a place somebody comes back to rather than a menu.

### What this does not fix

Every row a person typed is `reviewed: false` and should be read by a native speaker, which is
the standing every drafted row has always had. The `other-register` curveball has no line and
cannot: a line in the other register fails the gate by design, so it stays a stage direction until
the gate learns to make an exception it can explain. And the drafter still cannot fill a beat whose
line has to name a value off the card, so a keyed deployment composes those live and a keyless one
says `Kell 11:30?` off one course word and the card.

## 33. The fourth pass: an offer names a day, and a yes is an answer

A learner played the landlord scene through and sent the transcript. Every line on it was true to
its own rule and the conversation still did not flow, and the transcript says where.

- **"Millal teil on aeg?" was answered "Jah. Kell 14:00?"** The learner had asked when anybody
  could come, which is the beat's own goal, and the reply opened with a yes to a question that has
  no yes in it and then offered a clock time with no day. The `they` line for that beat has said
  "next week" since it was written and the Estonian never did, because `datumLine` could say one
  course word and one value off the card and a day was neither.
- **"Sobib" was read as Estonian off the point.** The beat took the time alone, so the one word a
  person is waiting for after offering a time was asked again, twice, and the landlord ran out of
  patience over an answer that was the right one. The debrief then named agreeing a time as the one
  thing to work on, to somebody who had agreed it twice.
- **"Neljal korrusel" got "Jah?" and a wait.** The beat asked which floor, wanted a sentence, and
  read a two-word answer with no verb as a learner who had not finished talking. And it could not
  have been met anyway: the requirement named `kord`, which is an occasion or an order, where the
  floor of a building is `korrus`, a word the scene's own `kodu` unit teaches.

Four changes, each the smallest thing that makes that transcript flow.

**A requirement can be a choice.** `Requirement` has an `anyOf` kind, and the marker takes the
first option met and repeats back the word that met it, so an offered time is answered with the
time, with `sobib`, with `jah`, or with `ei`, and every one of those is the beat done. It is one
requirement to the marker and each of its options to everybody else: `leafNeeds` opens it for the
grades, the drills, the tile and the catalog test, carrying the index a `TurnRecord.met` row is
keyed by. Both offers in the catalog take it, the doctor's and the landlord's.

**A line off the card is made of parts, and one of them can be a case.** `says` is a list: a
lemma as the dictionary spells it, a slot as the card dealt it, or a slot in a named case, read off
`Lexicon.caseForm`, which is the case table's own printed singular and never a suffix joined here.
`Teisipäeval kell 14:00?` is the landlord's offer now. A part the dictionary cannot supply withholds
the whole line, because `Kell 14:00?` where a day was meant is the line that started this and the
English stage direction under it at least says "next week".

**A fact can be the other side's.** The day is drawn per run and stored with the card, so a reload
offers the same day and the debrief can say which, and it is marked `theirs` so the briefing never
prints it: a card that says what the landlord is about to propose is a script rather than a role.
The draw carries the English of every drawn word off the dictionary's gloss, so the stage direction
says "Tuesday" inside an English sentence rather than the lemma.

**A phrase that answers the question is not a fragment, and a question is not acknowledged.** A turn
of two or more words that meets everything the beat asked for is an answer whatever its verb count;
a single word on a sentence beat is still a look and a wait. And where the learner's turn was itself
the question the beat wanted, the reaction is the move that answers it, never `Jah.` first. A bare
`14:30` is read as the time it is, which it was not: `words()` returns letters, a turn with none was
"unrecognised" before the datum rule was consulted, and the datum rule had already found it.

**And a no gets a second offer.** The first version of this pass read `ei sobi` as the beat met,
since the goal allows saying it will not do, and the landlord said goodbye. Nobody does that: a
person who hears no tries another day. So a beat can carry a `counter`, what the other side does
when the offer is turned down, with its own parts off the card, and the card deals a second day and
a second time drawn to differ from the first (`differentFrom`). The marker reads a no on such a beat
as `declined` before it reads anything else, because `Ei sobi` holds the very word that accepts the
offer and would otherwise accept it. The machine counters once, at no cost to patience, and a second
no is the learner saying it will not do, which meets the beat. `counter.replaces` names which of the
card's values the second offer stands in for, and `cardInPlay` is the view of the card every later
line reads, so the receptionist's `Kell 14:00.` reads back the time that was accepted rather than
the one that was refused. The route speaks the beat as `counterBeat` on that turn, under an id of
its own, so nothing drafted for the first offer is said as the second.

Driven offline against the harvest: the transcript above meets all seven beats and ends on the
outcome that says so; `Ei sobi` then `Sobib` does the same by way of `Reedel kell 11:30?`; `Ei sobi`
then `Ei` ends on `Hästi.` and the farewell with the beat met. What it does not fix: there is one
counter and not a negotiation, since a third offer is a branch and the machine is a line, and every
line the bank holds is still `reviewed: false`.


## 34. The fifth pass: a turn is credited with two beats on two words, not on one mark

`replay` reads a turn that landed against the next beat too, and the argument for it is sound and
still stands: "Tere, ma lähen poodi" greets and says where you are going, and a friend who heard it
does not then ask where you are going. What that rule never had is a test of whether the turn had
said two things. A requirement can be met by something that is not a word. `{ kind: "question" }` is
satisfied by a question mark anywhere in the text, deliberately, because `Homme?` is a question
anybody asks and has no question word in it; `{ kind: "any" }` is satisfied by anything at all. So a
turn ending in `?` walked past every question-shaped beat downstream of the one it answered, in
silence, on the strength of its own punctuation. Five beats in the catalogue are reachable that way.

A learner found it on the street corner. They were told `Minge otse edasi.`, wrote `okei, otse, ja
kuhu siis?`, and were answered `Head aega!`. Every step was the machine doing what it was told:
`otse` met the directions beat, the question mark then met `far`, whose goal is to ask whether it is
near, the scene arrived at the farewell two beats later, and the ladder said goodbye to somebody who
had just asked where to go next. Their own question was never taken, and the objective on screen
jumped from saying the directions back to saying thank you without ever asking for anything in
between.

**So a second beat is credited to the same turn only where the turn met it with a word the beats
already credited to that turn did not use.** `addsEvidence` in `lib/scenes/turn.ts` is the rule and
`Evidence.satisfiedBy` is what it weighs: every word a requirement was met by, unfiltered. That is a
second list beside `matched` rather than the same one, because `matched` is narrowed to what is
worth saying back and that is a different question: `maksta` out of `Ma tahan maksta` is not
something a waiter repeats and it is still the word that met the beat, so a cascade reading
`matched` would refuse every sentence-shaped beat with a lemma requirement. A word rather than a
requirement, because that is what "they said two things" means and because a mark cannot be said
twice. Not already spent, because `poodi` meeting two beats is one thing said, not two, and the
spent set travels down the cascade rather than being compared only against the beat before.

The hurdle path takes the same guard, since "Mul ei ole, aga siin on avaldus" clears the curveball
and answers the beat behind it on two different words, and a turn that cleared a curveball with a
question mark alone has done one thing.

What it costs is a beat whose only requirement is a question or an `any` being met in the same
breath as the beat before it, which is exactly the case it exists to refuse: the learner asks it as
its own turn, and the other side answers with the beat's own line. A beat that wants a question
*and* something else still cascades on the something else, so `Tere, kus on pank?` greets and asks.

What it does not fix: the other side still cannot answer a question the scene did not anticipate.
`okei, otse, ja kuhu siis?` now gets `Otse.` and the next beat's line rather than a farewell, which
is a street-corner exchange and is not an answer to what was asked. Answering an arbitrary question
means a model deciding what happens next, which is the one thing §18 rules out; what is available
instead is more beats and more pinned lines per beat, which is a catalogue change rather than a
machine one.


## 35. The sixth pass: understood before correct

A learner played the scenes and reported them as robotic and fake, and the concrete example they gave
is the whole of the diagnosis: `ma tulema koju`. That is not Estonian and every Estonian who hears it
knows the person is coming home. The marker held every turn to the dictionary's exact spelling, so a
dropped õ, a slipped letter, `pood` where `poodi` was due and `tulema` where `tulen` was due each read
as a turn nobody could follow, and the other side said "I did not catch that" to somebody who had
been perfectly clear. A learner who meets that three times stops talking, which is the opposite of
what this module is for (§18, and `docs/22-real-life.md`).

**A person understands first and corrects, if at all, in passing.** That is the rule now, and
`lib/scenes/nearly.ts` is where "close enough" is defined, once. Four shapes of nearly-right are read
as the word, understood, with the slip written down:

| Slip | Example | Recast |
|---|---|---|
| spelling, a diacritic folded away | `korvas` for `kõrvas` | the dictionary's spelling |
| spelling, one letter out on a word of five or more | `valusod` for `valusid` | the form it was one edit from |
| case, the right word in the wrong case | `pood` where `poodi` was due | `Lexicon.caseForm`, the same table every case card reads |
| person, the ma-infinitive straight after a subject pronoun | `ma tulema` for `ma tulen` | the derived present, off the stored first person |

**Every recast is the dictionary's and nothing is written.** The case form is read off the same
table `datumLine` reads for an offered day; the person is `derivedVerbForms`, which `npm run
audit:verbs` checked against Ekilex over 797 verbs (ADR-005 amendment 1). A slip the dictionary
cannot recast, `olema` after a pronoun for one, is understood and not recast, which is what a person
does with a verb they cannot put right in passing. `nearly.ts` holds a pronoun table as keys and no
form, asserted.

**What is deliberately not tolerated** is as much of the design as what is. Two letters out, because
at that distance `kool` is `kohv` and the marker would be guessing rather than understanding. A typo
on a word under five letters, because `pea`, `käsi` and `tee` are one edit from each other. A wrong
*word*, which is what `offtarget` already is. And the da-infinitive, because `ma tahan minna` is
right. A slip is a right thought in a slightly wrong shape, and that is the whole of what it may be.

**It reaches the screen three ways and none of them is a mark.** The other side says the word back
put right, `Poodi.` and then the next question, which is the one correction a conversation makes
without stopping and is labeled on screen as the learner's word the way they say it, never as "said
again". Under the learner's own bubble the quiet ink says "Understood. Here it is *poodi*." The
debrief has a section headed by the count of turns that were understood anyway, and the forms under
it for when there is a minute. And the review log sees it as a `Hard` on that word, and on that case
where the slip was a case: the learner *had* the word and was understood, so it is not `Again`, and
the form was not produced, so it is not `Good`, and the case they could not produce at a counter
lands beside the case they could not produce on a card.

**Two smaller things came with it, both in the same direction.** A folded spelling counts as vouched
in the share that tells real Estonian aimed elsewhere from a turn nobody could read, so a clear
sentence with no õ in it is answered with a narrower question rather than with the repair phrase.
And a one-word answer said twice on a sentence-shaped beat is taken the second time where it meets
the beat: a person waits once, and a receptionist told `pea` twice does not ask a third time. A turn
read as `narrow` also takes up the part that landed before the re-ask, `Poodi.` and then the
question, where it used to ask the whole question again as though nothing had been said.

**Measured against the fixture marker:** `Ma lähen tuba` on the illative beat is met with a case
slip and `tuppa` recast; `Mul on valu korvas` on the inessive beat is met with a spelling slip;
`ma tulema koju` is met with `tulen` recast and `ta tulema koju` with `tuleb`; `ma tahan tulla`
carries no slip; `valo` and `valosdi` are still misses. What it does not do: it cannot tell a learner
which word they meant when they used a wrong one, and it cannot answer a question the scene did not
anticipate (§34). Both are what the help button and more beats are for.


## 36. The seventh pass: a question is answered before the move, and a waiting beat waits

§34 stopped a learner's question ticking off a beat it never addressed, and left the question itself
unanswered: `okei, otse, ja kuhu siis?` got `Otse.` and the next line, which is a street-corner
exchange and is not an answer. The person reporting it put the standard plainly: a normal person is
caught off guard by a question and still has a human reaction to it. Silence is the one thing nobody
does with a question.

**`lib/scenes/aside.ts` is what the other side can say about a question they did not expect**, a
ladder like the one for a beat's own line, cheapest and surest first, and every rung is Estonian the
dictionary already vouches for:

| Rung | Answers | Example |
|---|---|---|
| the beat's own answer | a question the beat asked the learner for | "is it near?" gets `Jah, see on lähedal.` off `answer:far` |
| how are you | `kuidas` beside a form of `minema` | `Hästi, aitäh.`, two course words as parts |
| a fact off the card | `millal`, or `kell` in the turn | `Teisipäeval kell 14:30.`, the day in the adessive off the case table |
| more about it | a place question, `mis` or a bare `?` after directions, an offer or a refusal | `Otse edasi ja siis vasakule, see on lähedal.`, the beat's next banked line |
| a model | anything else, on a keyed deployment | one line inside the list, gated as a `confirm`, on the turn's one booking |
| don't know | anything else | `Ei tea.`, `ei` and the derived negative of `teadma` |

`readTurn` writes down that a question was asked and with which word (`Evidence.asked`);
`replyFor` says the aside first and stacks no echo and no `hästi` on it, since "Ei tea. Hästi. Kus
teil valutab?" is a machine and "Ei tea. Kus teil valutab?" is a person; and the route asks
`asideFor` before it walks the ladder for the move, and gives the turn's one model booking to the
question rather than to a fresh phrasing of a move the bank usually has anyway. Never on a turn
nobody understood, where the repair phrase is the whole reaction.

**Where the beat itself asked for the question, the answer is the beat's own, or the next move.**
"Ask whether it is near" is met by a question, and a question is owed an answer: the bank holds it
under `answer:<beat>` (`answerBeatId`, a pseudo-beat `sceneBeats` adds for every beat that wants a
question, so the drafter and the bank test see it), and `asideFor` says it as the reaction. Where the
bank holds none, the next move is the answer, which is how "where is the station?" is answered by the
directions and not by a shrug: `asideOwed` is false there, and no model is asked either.

**And a beat that waits, waits.** `far`'s stage direction is "They wait in case you have another
question" and its banked lines were `Jah, see on lähedal.`, said as the beat's opening move, before
anybody had asked whether it was near, and then never said when they did. `BeatSpec.awaits` is the
fix: the other side opens the beat with nothing but the stage direction, the ladder is not walked
for an opening line, and what the bank holds for the beat lives under its answer id. `far` is the
one such beat so far; `answer:wait` and `answer:confirm` at the counter and `answer:refuse` at the
landlord's carry answers of their own, typed in this pass, gated, `reviewed: false`.

**Three beats learned the case a person says the word in.** The ticket window asked "where to?" and
took `jaam` in any form, so the echo was `Jaam.`; nobody says that. A `datum` requirement can carry
a `grammCase` now, read through the case table exactly as a `case` requirement is, so `jaam` is the
word understood in the wrong case and `Jaama.` is said back; "how will you pay?" takes `kaardiga`
and says `Kaardiga.` to `kaart`; and the café's order is the partitive, `Teed.` to `tee`. Each is a
`Hard` on that case in the review log, which is the point: the comitative you could not produce at
a window lands beside the comitative you could not produce on a card.

**`scripts/play-scene.ts` is the instrument**, and it is why this pass found the waiting beat at
all. It builds every scene from the shipped dictionary with no database (`contextFromRows`), plays
it keyless through the route's own ladder as a generated learner in one of three styles, `clean`,
`sloppy` and `curious`, and prints the conversation with every reading, slip and question beside
it. Reading the seven transcripts is how the asides were shaped, and it is what to run before
touching the marker or the reply again.

What it does not do: the shrug is the same two words whoever is behind the desk, and a friend on
the phone saying `Ei tea.` to "and where then?" is a stranger's shrug in a friend's mouth. A
persona-flavoured off-guard reaction is a table of parts away and was left for a native speaker's
pass, since "what a friend says when you ask them something odd" is not a thing this app should
guess at.
