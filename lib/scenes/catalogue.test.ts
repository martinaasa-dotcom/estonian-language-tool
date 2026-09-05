/**
 * What a scene file is allowed to say.
 *
 * `docs/21-situations.md` §21 named this as invariant 1 and named it wrongly:
 * "no file under the catalog contains an Estonian letter", modeled on the
 * tripwire over `lib/estonian/grammar.ts`. Building the catalog is what
 * showed the rule was incoherent, because a scene has to name the words its
 * beats are about, and a check keyed on `õäöüšž` would allow `valu` and reject
 * `küte`, which is not a distinction about anything.
 *
 * What holds instead is stronger and is what is asserted here: every lemma a
 * scene names is a word one of its own declared units already teaches. A scene
 * cannot introduce vocabulary at all, only point at vocabulary the Ekilex
 * harvest already brought back, so a typo in this catalog fails here rather
 * than becoming a word the app believes in. That is exactly the standing
 * `lib/collections/syllabus/` has, one layer up: a lemma is a request, and
 * `syllabus.test.ts` fails when the harvest did not honor it.
 */
import { describe, expect, it } from "vitest";
import { ASIDES, FALLBACK_PHRASE, REACTIONS, SCENES, sceneById } from "./catalogue";
import { HARVESTED } from "@/prisma/data/harvested";
import { curveballById } from "./curveballs";
import { LEFT_OUTCOME, QUESTION_SHAPE, leafNeeds } from "./types";
import { unitById } from "@/lib/collections/syllabus";
import { TIME_LEMMAS } from "./props";

/** Every lemma a scene names, from its beats' topics and its requirements. */
function lemmasOf(scene: (typeof SCENES)[number]): string[] {
  const out: string[] = [];
  for (const beat of scene.beats) {
    out.push(...beat.topic);
    for (const part of [...(beat.says ?? []), ...(beat.counter?.says ?? [])]) if ("lemma" in part) out.push(part.lemma);
    for (const { need } of leafNeeds(beat.needs)) {
      if (need.kind === "lemma") out.push(...need.oneOf);
      if (need.kind === "case") out.push(need.lemma);
    }
  }
  return out;
}

describe("the scene catalog", () => {
  it("has scenes", () => {
    expect(SCENES.length).toBeGreaterThan(0);
    expect(sceneById(SCENES[0]!.id)?.title).toBe(SCENES[0]!.title);
  });

  it("gives every scene a unique id", () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names only units that exist", () => {
    for (const scene of SCENES) {
      for (const id of scene.units) {
        expect(unitById(id), `${scene.id} names unit ${id}`).toBeDefined();
      }
    }
  });

  /*
    The one that matters. A scene may not write Estonian; it may point at
    Estonian the course already teaches, and this is what makes that mechanical
    rather than a promise in a comment.
  */
  it("names only words its own units teach", () => {
    for (const scene of SCENES) {
      const taught = new Set<string>();
      for (const id of scene.units) {
        for (const lemma of unitById(id)?.lemmas ?? []) taught.add(lemma);
      }
      // The reactions are said in every scene, so every scene has to teach them.
      const asides = Object.values(ASIDES).flatMap((parts) => parts.map((part) => part.lemma));
      /*
        Every reaction, read off the table rather than named here. The first
        version listed `acknowledge` and `waiting`, so the day a third kind
        of reaction was added it was said in every scene and checked in none,
        which is the fault this file's own header describes one layer out.
      */
      const reactions = Object.values(REACTIONS).flat();
      const named = [...lemmasOf(scene), ...reactions, ...asides, ...TIME_LEMMAS];
      const strangers = [...new Set(named)].filter((lemma) => !taught.has(lemma));
      expect(strangers, `${scene.id} names words none of its units teach`).toEqual([]);
    }
  });

  /*
    A CARD MAY NOT DEAL A WORD THE SCENE WILL NOT TAKE.

    The landlord's card drew from six problems and the beat that asks what
    has gone wrong accepted a different six: two of the draws, a third of
    runs, dealt a card whose word the beat refused. The learner reads "the
    window is broken", says so correctly, and is treated as having said
    nothing, which is the worst thing this module can do to somebody.
  */
  it("deals no word its own beats cannot accept", () => {
    for (const scene of SCENES) {
      const accepted = new Set<string>();
      for (const beat of scene.beats) {
        for (const { need } of leafNeeds(beat.needs)) {
          if (need.kind === "lemma") for (const lemma of need.oneOf) accepted.add(lemma);
          if (need.kind === "case") accepted.add(need.lemma);
          // A datum requirement takes whatever the card dealt for that slot.
          if (need.kind === "datum") accepted.add(`slot:${need.slot}`);
        }
      }
      for (const prop of scene.props) {
        if (prop.kind !== "word" && prop.kind !== "weekday") continue;
        if (accepted.has(`slot:${prop.slot}`)) continue;
        const refused = prop.oneOf.filter((lemma) => !accepted.has(lemma));
        expect(refused, `${scene.id} deals ${prop.slot} words no beat accepts`).toEqual([]);
      }
    }
  });

  /*
    A BEAT'S GOAL NAMES THE ANSWER, WHEREVER THERE IS EXACTLY ONE.

    A goal is the objective printed on the screen, and where the beat accepts
    exactly one word a goal that does not name it is a trap rather than an
    instruction. The milk scene had four of them: it asked "Say where you are
    now" and took only "at the shop", so a learner reading their own card,
    which had put them at home, answered honestly three times and was refused
    three times. There is nothing wrong with the marker in that story; the
    screen simply never told them what was wanted.

    The English gloss is what the check reads, because that is the one column
    of the harvest a person authored and it is how the word would be named to
    somebody who does not have it yet. A gloss is a list of senses and any of
    them counts: `pood` is "shop, store", and either word in the goal is the
    goal naming it.

    Deliberately not asked of a beat that would take any of several words: the
    landlord's "say what has gone wrong" accepts eleven, and naming one would
    be the fault `offerFor` already had, where a learner is told to say the
    heating is broken by a scene whose card says it is the door. Nor of a
    `datum`, whose answer is on the card and differs per run; that one is
    covered by the check below.
  */
  it("names the one word it will take, wherever a beat will take exactly one", () => {
    const glosses = new Map(HARVESTED.map((word) => [word.lemma, word.gloss]));
    /* The senses of a gloss, since `shop, store` offers two names for one word. */
    const senses = (gloss: string) =>
      gloss.split(/[,;]/).map((sense) => sense.replace(/\([^)]*\)/g, "").trim()).filter(Boolean);
    const missing: string[] = [];
    for (const scene of SCENES) {
      for (const beat of scene.beats) {
        const leaves = leafNeeds(beat.needs);
        /*
          One requirement, and one word that would meet it. A beat that offers
          a choice is a beat with no single answer to name.
        */
        if (leaves.length !== 1) continue;
        const only = leaves[0]!.need;
        const lemma = only.kind === "case" ? only.lemma
          : only.kind === "lemma" && only.oneOf.length === 1 ? only.oneOf[0]!
          : null;
        if (!lemma) continue;
        const gloss = glosses.get(lemma);
        if (!gloss) continue;
        const goal = beat.goal.toLowerCase();
        if (senses(gloss).some((sense) => goal.includes(sense.toLowerCase()))) continue;
        missing.push(`${scene.id}/${beat.id}: "${beat.goal}" never names ${lemma} (${gloss})`);
      }
    }
    expect(missing, "a beat takes one word and its goal does not say which").toEqual([]);
  });

  /*
    And where the answer is a value off the card, the goal says so, because
    the learner cannot know a card holds it unless they are told. This is the
    other half of the rule above and it is checkable the same way: the word
    "card" is in the sentence, or it is not.
  */
  it("sends the learner to their card wherever the answer is on it", () => {
    const silent: string[] = [];
    for (const scene of SCENES) {
      for (const beat of scene.beats) {
        const leaves = leafNeeds(beat.needs);
        if (!leaves.some(({ need }) => need.kind === "datum")) continue;
        /*
          Except where they have just been told the value: a beat that reads
          a time back to check it was heard is about the line above it, not
          about the card, and sending them to the card there would be sending
          them to the wrong place.
        */
        if (/\{\w+\}/.test(beat.they)) continue;
        if (/card/i.test(beat.goal)) continue;
        silent.push(`${scene.id}/${beat.id}: "${beat.goal}"`);
      }
    }
    expect(silent, "a beat wants a value off the card and never says so").toEqual([]);
  });

  /*
    TIME PASSING IS ENGLISH, AND A SENTENCE. `meanwhile` is printed as a break
    in the conversation, so it is held to what every other authored line in
    this file is held to: no Estonian, and a sentence rather than a fragment.
  */
  it("writes what has happened since in English, as a sentence", () => {
    for (const scene of SCENES) {
      for (const beat of scene.beats) {
        if (!beat.meanwhile) continue;
        expect(beat.meanwhile, `${scene.id}/${beat.id} is not a sentence`).toMatch(/^[A-Z].*\.$/);
        expect(beat.meanwhile, `${scene.id}/${beat.id} carries an Estonian letter`).not.toMatch(/[õäöüšž]/i);
      }
    }
  });

  /*
    A scene exists to check one of the course's own claims, so it says which.
    Without this the catalog drifts into a list of situations somebody thought
    sounded useful, which is the failure mode that has no test.
  */
  it("tests a unit it draws on", () => {
    for (const scene of SCENES) {
      expect(unitById(scene.tests), `${scene.id} tests ${scene.tests}`).toBeDefined();
      expect(scene.units, `${scene.id} tests a unit it does not draw on`).toContain(scene.tests);
      expect(unitById(scene.tests)?.canDo).toBeTruthy();
    }
  });

  it("gives every beat a goal, a known move and a unique id", () => {
    for (const scene of SCENES) {
      const ids = scene.beats.map((b) => b.id);
      expect(new Set(ids).size, `${scene.id} repeats a beat id`).toBe(ids.length);
      for (const beat of scene.beats) {
        expect(beat.goal.length, `${scene.id}/${beat.id} has no goal`).toBeGreaterThan(0);
        expect(QUESTION_SHAPE[beat.move]).toBeDefined();
        expect(beat.topic.length, `${scene.id}/${beat.id} is about nothing`).toBeGreaterThan(0);
        expect(beat.needs.length, `${scene.id}/${beat.id} asks for nothing`).toBeGreaterThan(0);
        expect(beat.patience).toBeGreaterThan(0);
      }
    }
  });

  /*
    WHAT THE OTHER SIDE DOES IS WRITTEN FROM THEIR SIDE, IN ENGLISH. `they` is
    the stage direction printed where no Estonian line could be built, the
    translation a helpful persona offers, and what a model is told it is doing
    when it writes the line, so it has to be a sentence and it has to be about
    them: a beat whose `they` reads like its `goal` has been written from the
    learner's side twice.
  */
  it("says what the other side does on every beat, from their side", () => {
    for (const scene of SCENES) {
      for (const beat of scene.beats) {
        expect(beat.they, `${scene.id}/${beat.id} has no stage direction`).toMatch(/^[A-Z].*\.$/);
        expect(beat.they, `${scene.id}/${beat.id} repeats its goal`).not.toBe(beat.goal);
        expect(beat.they, `${scene.id}/${beat.id} is written from the learner's side`).not.toMatch(/^Say /);
        expect(beat.they, `${scene.id}/${beat.id} carries an Estonian letter`).not.toMatch(/[õäöüšž]/i);
      }
    }
  });

  /*
    A PINNED LINE IS A LEXICOGRAPHER'S SENTENCE, CHOSEN AND NEVER WRITTEN.
    Choosing is allowed (ADR-005 lets an attested sentence be hidden from or
    reordered, and picking one out is less than either); writing is not, and
    the difference is checkable: the text has to be a usage the harvest
    brought back under one of the beat's own topic words.
  */
  it("says a value off the card only through a slot the card deals", () => {
    for (const scene of SCENES) {
      const slots = new Set(scene.props.map((prop) => prop.slot));
      for (const beat of scene.beats) {
        for (const part of [...(beat.says ?? []), ...(beat.counter?.says ?? [])]) {
          if (!("slot" in part)) continue;
          expect(slots.has(part.slot), `${scene.id}/${beat.id} says a slot the card never deals`).toBe(true);
        }
        for (const [from, to] of beat.counter?.replaces ?? []) {
          expect(slots.has(from) && slots.has(to), `${scene.id}/${beat.id} counters with a slot the card never deals`).toBe(true);
        }
      }
    }
  });

  it("pins only recorded usages of its own topic words", () => {
    const usages = new Map<string, Set<string>>();
    for (const word of HARVESTED) {
      const seen = usages.get(word.lemma) ?? new Set<string>();
      for (const usage of word.usages) seen.add(usage);
      usages.set(word.lemma, seen);
    }
    for (const scene of SCENES) {
      for (const beat of scene.beats) {
        for (const line of beat.lines ?? []) {
          const under = beat.topic.some((lemma) => usages.get(lemma)?.has(line));
          expect(under, `${scene.id}/${beat.id} pins "${line}", which no topic word's entry records`).toBe(true);
        }
      }
    }
  });

  /*
    A scene that cannot be failed is not a simulation of anything, and one
    without a way in or out is not an encounter. Both ends are required.
  */
  it("opens, closes, and has something to get done", () => {
    for (const scene of SCENES) {
      const first = scene.beats[0];
      const last = scene.beats[scene.beats.length - 1];
      expect(first?.move, `${scene.id} does not open with a greeting`).toBe("greet");
      expect(last?.move, `${scene.id} does not end`).toBe("close");
      expect(scene.beats.filter((b) => b.required).length).toBeGreaterThan(2);
    }
  });

  /*
    THE OUTCOME LIST IS WHERE A SCENE STOPS BEING A DRILL.

    Three rules, and the middle one is the one worth having. Every `when` names
    beats the scene actually has, or an outcome is unreachable and nobody finds
    out. Every scene has at least one outcome that is **not the learner's
    fault**, because a real encounter has those and a module where trying hard
    enough always works has stopped simulating anything: the test for it is an
    outcome reachable without every required beat, which is exactly what "you
    did most of it and it still did not come off" is. And every scene lets
    somebody leave, because leaving is a real option in a real conversation.

    Fullest first, because `outcomeOf` takes the first that fits: a list in the
    other order would hand everybody the thinnest ending they qualified for.
  */
  it("can end well, can end badly through nobody's fault, and can be walked out of", () => {
    for (const scene of SCENES) {
      const beats = new Set(scene.beats.map((b) => b.id));
      const required = scene.beats.filter((b) => b.required).map((b) => b.id);

      for (const outcome of scene.outcomes) {
        for (const id of outcome.when) {
          expect(beats, `${scene.id}/${outcome.id} waits on a beat that is not there`)
            .toContain(id);
        }
        expect(outcome.says.length, `${scene.id}/${outcome.id} says nothing`).toBeGreaterThan(10);
      }

      const ids = scene.outcomes.map((o) => o.id);
      expect(new Set(ids).size, `${scene.id} repeats an outcome id`).toBe(ids.length);
      expect(ids, `${scene.id} cannot be walked out of`).toContain(LEFT_OUTCOME);

      const best = scene.outcomes.find((o) => required.every((id) => o.when.includes(id)));
      expect(best, `${scene.id} has no outcome for doing all of it`).toBeDefined();

      const short = scene.outcomes.filter(
        (o) => o.id !== LEFT_OUTCOME && !required.every((id) => o.when.includes(id)),
      );
      expect(short.length, `${scene.id} always works if you keep trying`).toBeGreaterThan(0);

      const sizes = scene.outcomes.map((o) => o.when.length);
      expect([...sizes].sort((a, b) => b - a), `${scene.id} lists its outcomes thinnest first`)
        .toEqual(sizes);
    }
  });

  /*
    THE CARD IS WHAT MAKES `datum` MARKABLE, so every slot a beat asks for has
    to be a slot the card carries. A beat waiting on a prop nobody drew is a
    beat that can never be met, and it would look exactly like a learner who
    kept getting it wrong.
  */
  it("has a way out every scene's own units teach", () => {
    /*
      The fallback is Estonian, so it is a lemma request like every other word
      in this file: a misspelled one would fail to arrive and the way out would
      be an empty string on somebody's screen. Every scene, because a scene
      that could not say it is a scene with no way out of a failed beat.
    */
    for (const scene of SCENES) {
      const taught = new Set(scene.units.flatMap((id) => unitById(id)?.lemmas ?? []));
      expect(taught, `${scene.id} has no way to say it did not catch that`)
        .toContain(FALLBACK_PHRASE);
    }
  });

  it("hands out a card that answers every datum its beats ask for", () => {
    for (const scene of SCENES) {
      const slots = new Set(scene.props.map((p) => p.slot));
      for (const beat of scene.beats) {
        for (const { need } of leafNeeds(beat.needs)) {
          if (need.kind !== "datum") continue;
          expect(slots, `${scene.id}/${beat.id} waits on a prop the card does not carry`)
            .toContain(need.slot);
        }
      }
      expect(new Set(scene.props.map((p) => p.slot)).size, `${scene.id} repeats a prop slot`)
        .toBe(scene.props.length);
      expect(scene.role.length, `${scene.id} hands out no role at all`).toBeGreaterThan(20);
    }
  });

  /*
    A CURVEBALL WITH NO OUT IS A TRAP (§9), and the out has to be sayable
    *inside this scene*: a requirement naming a word the scene's units do not
    teach is difficulty a learner cannot answer, which is a bug in a costume.

    Every out in the catalog today is a question, a negation, a register or
    `any`, all of which the units in `COMMON` supply for every scene. That is
    why this check is worth writing now rather than when it first fires: it is
    the entry that names a lemma which would break it, and nobody adding one
    would think to look.
  */
  it("admits only curveballs whose way out its own words can say", () => {
    for (const scene of SCENES) {
      const taught = new Set(scene.units.flatMap((id) => unitById(id)?.lemmas ?? []));
      expect(new Set(scene.curveballs).size, `${scene.id} admits one twice`)
        .toBe(scene.curveballs.length);

      for (const id of scene.curveballs) {
        const ball = curveballById(id);
        expect(ball, `${scene.id} admits ${id}, which is not in the catalog`).toBeDefined();
        for (const { need } of leafNeeds(ball?.needs ?? [])) {
          if (need.kind === "lemma") {
            for (const lemma of need.oneOf) {
              expect(taught, `${scene.id} admits ${id}, whose out needs ${lemma}, which it does not teach`)
                .toContain(lemma);
            }
          }
          if (need.kind === "case") {
            expect(taught, `${scene.id} admits ${id}, whose out needs ${need.lemma}, which it does not teach`)
              .toContain(need.lemma);
          }
          if (need.kind === "datum") {
            expect(scene.props.map((p) => p.slot), `${scene.id} admits ${id}, whose out needs a prop it has not drawn`)
              .toContain(need.slot);
          }
        }
      }
    }
  });

  /*
    A CARD THAT POINTS AT SOMETHING HAS TO SHOW IT, and for a while none of
    them did. Six props across three scenes said "the word below" or "the day
    below" and printed nothing below, so a learner could not know whether they
    had been dealt a fever or a sore throat, and the beat that asks for it was
    unanswerable except by guessing. Two of the doctor scene's three props were
    in that state and the third only worked because a time prints itself.

    The fix was the briefing carrying the English of what was dealt, so what
    this holds is the copy that was covering for its absence: a card may not
    tell somebody to read a word off a place, because there is no "below" any
    more, there is the line and the meaning under it.
  */
  it("does not send a learner looking for a word somewhere else on the card", () => {
    for (const scene of SCENES) {
      for (const prop of scene.props) {
        const says = "says" in prop ? prop.says : "";
        expect(says, `${scene.id}'s ${prop.slot} points somewhere instead of saying what it is`)
          .not.toMatch(/\b(below|above|beside|opposite)\b/i);
      }
    }
  });

  /*
    And a word prop names words the scene teaches, which is what makes the
    gloss reachable at all: the briefing looks the drawn lemma up, and a lemma
    no unit of this scene declares comes back with nothing to print, which is
    the unanswerable card again wearing a different cause.
  */
  it("draws its words from the units it declares", () => {
    for (const scene of SCENES) {
      const taught = new Set(scene.units.flatMap((id) => unitById(id)?.lemmas ?? []));
      for (const prop of scene.props) {
        if (prop.kind !== "word" && prop.kind !== "weekday") continue;
        for (const lemma of prop.oneOf) {
          expect(taught, `${scene.id}'s ${prop.slot} can draw ${lemma}, which no unit of it teaches`)
            .toContain(lemma);
        }
      }
    }
  });
});
