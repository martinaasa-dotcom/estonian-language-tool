# Situations

A module where the learner uses Estonian on somebody rather than studying it. What a scene is, how
one is drawn so that no two runs are alike, how the difficulty setting works, and the rule that
keeps every Estonian word in it out of a model's hands.

Nothing here is built. This is the design, the arithmetic behind it, the things it must never
become, and the measurements that decide whether it can be built at all.

## 1. The promise the course already made

`lib/collections/syllabus/` holds 81 units and every one of them carries a `canDo`, which is a claim
about what the learner will be able to do:

> Greet someone, thank them, apologise, and say you do not understand.
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
morphological analyser, Vabamorf, which `EstNLTK` wraps, and running a composed line through it is a
real option. What it would add over vouching is less than it first appears: vouching already
establishes that every word is a real form of a word this scene is allowed to use, which is most of
what an analyser reports. What would genuinely help is agreement and government checked across the
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
  says so too. A learner is never invited to memorise a sentence without being told where it came
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

### The catalogue

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
speaking Estonian in Tallinn, it is a large part of why people stop practising, and no textbook
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

Reopening this needs a re-run of `measure-asr.mjs` against a recogniser that clears the bar, and the
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
- **Error.** `app/error.tsx`'s rules, and a scene interrupted mid-run is resumable rather than lost.
- **Offline.** One scene pre-assembled and cached. Difficulty 0, attested lines only, marking is
  mechanical so it needs nothing, and the finished run goes to the outbox with the grades. A
  conversation you can have on a train is worth more than most of what this app can do offline.

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
readings of it. That is also what keeps the scene catalogue from drifting into a list of situations
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
somebody decides about them, which is the correct behaviour and the reason that check reads the
schema rather than a list somebody typed. Both belong in the backup and in the erasure. Neither
belongs in the classroom roll-up (§18).

An unfinished run lives on the device, the way an unfinished exam paper does
(`app/(app)/exam/[level]/resume.ts`), and the server sees the finished run. The client sends the
turns; the server re-runs `readTurn` to decide the objectives and the grades. That is ADR-022's
discipline, the client never sends a mark, and it costs one function call because the marker is
pure.

## 16. Cost, and what happens when there is none

`UsageKind` gets `SCENE`, and a scene books **one call rather than one per turn**, because running
out of allowance halfway through a conversation is the worst failure available to this module. The
reservation is written at the start for the whole scene's expected tokens, exactly as the ledger
already books a call before opening a provider, and the real figures arrive at the end as the
settlement that corrects it, which is negative whenever the estimate was generous. A scene abandoned
before it composed anything hands the booking back through `releaseReservation`, which is what that
function is for: a call that reached nobody is not a question anybody asked. Booking per scene is
also what makes the honest sentence possible, "two conversations left today", rather than "eleven
calls left".

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

**Phase 1.** Three scenes at A2 and B1, drawn from units the course already teaches: the health
centre (`keha-ja-tervis`), the landlord (`eluase`), and the counter that wants a document
(`linn-ja-teenused`). Typed turns, mechanical marking, attested and composed lines, four
curveballs, the debrief, the offline scene. Every guard in §18 on day one, because a guard added
afterwards is a guard that was missing for a release. Done means what `docs/09-roadmap.md` says it
means, plus the suite in §21, plus one figure §29 asks for that no run of the eval can produce:
**how often a beat falls back to its attested line**, which is what a learner actually feels.

**Phase 2.** The rest of the dials, the spoken unmarked mode, the two-way link from the unit pages,
the full curveball catalogue, class assignment, and the loop that makes this more than practice:
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
- **A model deciding whether the learner was understood.** The judgement a model is least qualified
  to make, with the worst failure mode available: a learner marked wrong for being right, in a
  language they cannot yet argue in.
- **A score.** Every version of a percentage on a conversation read worse than the outcome sentence
  that replaced it.
- **Two learners in one class taking the two roles.** Genuinely good, and it needs realtime
  infrastructure this app does not have. Worth revisiting once a language house is actually using
  the classroom.
- **A patience meter.** §7.
- **Voice to voice.** Needs a recogniser this design has already turned down, and it would put the
  whole conversation behind a microphone prompt on a phone.
- **A morphological analyser in the gate, for now.** §2 says what Vabamorf would and would not buy.
  The short version is that it overlaps vouching almost entirely, and the part that does not overlap
  is a syntactic check that is a project rather than a check.

## 21. The invariants

Written the way `scripts/test-invariants.ts` would assert them, because a rule with nothing behind
it is a rule that drifts:

1. **Every lemma a scene names is a word one of its own declared units teaches.** This replaces
   what was written here first, which was "no scene file contains an Estonian letter", modelled on
   the tripwire over `lib/estonian/grammar.ts`. Building the catalogue showed that rule to be
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

And one browser suite, `scripts/test-scene.mjs`, with the model stubbed the way `test-scan.mjs`
stubs it: a whole scene played through, the provenance chips, the repair path, a curveball and its
out, the debrief, the offline scene, and a run completed with no provider key at all. It declares a
floor like every other suite, and it waives with a number and a reason rather than a line saying
SKIP. It invents its own word if it writes to the shared dictionary, for the reason `test-scan.mjs`
does.

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
  because it is the encounter people are most afraid of. The other two are a judgement about the
  audience an integration foundation serves, and somebody who works with that audience should make
  it rather than this document.
- **Does the register dial belong to the scene or the learner?** A scene sets `teie` because a
  health centre does. Somebody practising for a workplace where everybody says `sina` might want to
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

Fifty-one readable questions across the whole of A2 is not a pool to build a catalogue on, or one
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
naming the neighbours, its definition **is** a list of synonyms, and comparing the strings read that
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

The first thing it measured was a bug in the scene catalogue. `arsti-aeg` is set at a health
centre and its word list did not contain `arst`; none of the three scenes contained `olema`, so
every line built on "Kas teil **on** valu?" was withheld; `uuri-remont` is about something broken
in a flat and had neither `korter` nor `köök`. Nothing about the catalogue looked wrong. A scene
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
is the answer being right about where a word belongs and the catalogue not knowing: `kohasonad` and
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

**And there is no principled end to widening a catalogue**, which is worth saying because the
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

What is banked either way: the government check is settled, the scene catalogue is correct on the
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

