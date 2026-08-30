import { describe, expect, it } from "vitest";
import { humanizeLine, humanizeReply, ProseStream } from "@/lib/tutor/humanize";

/** Feed a reply through the streaming pass in the smallest chunks possible. */
function streamed(text: string, size = 1): string {
  const stream = new ProseStream();
  let out = "";
  for (let i = 0; i < text.length; i += size) out += stream.push(text.slice(i, i + size));
  return out + stream.end();
}

describe("dashes become punctuation a person would type", () => {
  it("turns an aside into two commas", () => {
    expect(humanizeLine("Partitive — because the action is ongoing — is what you want."))
      .toBe("Partitive, because the action is ongoing, is what you want.");
  });

  it("turns a clause break into a comma", () => {
    expect(humanizeLine("Use the partitive here — the action is ongoing."))
      .toBe("Use the partitive here, the action is ongoing.");
  });

  it("turns a break before a new sentence into a full stop", () => {
    expect(humanizeLine("That form is right — Estonian marks aspect on the object."))
      .toBe("That form is right. Estonian marks aspect on the object.");
  });

  it("keeps a range a range", () => {
    // A comma here would turn a span of time into a list of two numbers.
    expect(humanizeLine("Give it 2 – 3 weeks.")).toBe("Give it 2-3 weeks.");
    expect(humanizeLine("Roughly 10—12 cards.")).toBe("Roughly 10-12 cards.");
  });

  it("leaves prose with no dash in it exactly as written", () => {
    const line = "Lugesin raamatut is ongoing; lugesin raamatu läbi is finished.";
    expect(humanizeLine(line)).toBe(line);
  });
});

describe("stock openers", () => {
  it("drops one and recapitalises what is left", () => {
    expect(humanizeLine("It's important to note that the object takes the partitive."))
      .toBe("The object takes the partitive.");
  });

  it("rewrites the not-just-but shape", () => {
    expect(humanizeLine("It is not just a rule, but a pattern."))
      .toBe("It is a rule, and a pattern.");
  });

  /*
    Openers stack, and one pass only ever removes the outermost. This came out
    of a single pass as "It's important to note that the object takes the
    partitive": the anchored pattern for the second opener cannot match until
    the first has gone, and nothing ran again afterwards. So the list is walked
    until a walk changes nothing.
  */
  it("drops a stack of them, not only the outermost", () => {
    expect(humanizeLine("Great question! It's important to note that the object takes the partitive.")).toBe(
      "The object takes the partitive.",
    );
  });

  it("does not capitalise a line that deliberately continues the one above", () => {
    expect(humanizeLine("and that is why it is partitive.")).toBe("and that is why it is partitive.");
  });
});

describe("Estonian is never rewritten", () => {
  /*
    The whole point of the care in this module. A corrected sentence is the
    one thing in the conversation a learner is meant to be able to trust, and
    a VOCAB line becomes a flashcard. Editing either would be the app writing
    Estonian, which is the rule the project is built on.
  */
  it("passes a corrected sentence through byte for byte", () => {
    const fix = "FIX: Ma loen raamatut — see on huvitav.";
    expect(humanizeLine(fix)).toBe(fix);
    expect(humanizeReply(`Here is the fix.\n${fix}`)).toBe(`Here is the fix.\n${fix}`);
  });

  it("passes a numbered FIX line through too, because models number their answers", () => {
    const fix = "3. FIX: Ma ei loe raamatut — ma kirjutan.";
    expect(humanizeLine(fix)).toBe(fix);
  });

  it("passes a VOCAB line through, so the pipe still parses", () => {
    const vocab = "VOCAB: raamat — book | book";
    expect(humanizeLine(vocab)).toBe(vocab);
  });

  it("leaves an Estonian word quoted in a paragraph alone", () => {
    expect(humanizeLine("The genitive of tuba is toa — note the gradation."))
      .toBe("The genitive of tuba is toa, note the gradation.");
  });
});

describe("streaming reaches the same answer as cleaning it all at once", () => {
  const replies = [
    "Partitive — because the action is ongoing — is what you want here.",
    "It's important to note that the object takes the partitive.\n\nUse it whenever the event is unfinished.",
    "Here is the correction.\n\nFIX: Ma loen raamatut — see on huvitav.\n\nVOCAB: raamat | book",
    "Short.",
    "Use the partitive — the action is ongoing.\nThat form is right — Estonian marks aspect on the object.",
    "aitama takes the partitive (aitan sind), helistama the allative (helistan sulle).",
    "Great question! It's important to note that the object takes the partitive.",
  ];

  for (const reply of replies) {
    it(`matches for: ${reply.slice(0, 40).replace(/\n/g, " ")}...`, () => {
      expect(streamed(reply, 1)).toBe(humanizeReply(reply));
      expect(streamed(reply, 3)).toBe(humanizeReply(reply));
      expect(streamed(reply, 17)).toBe(humanizeReply(reply));
    });
  }

  it("loses nothing, whatever the chunking", () => {
    // The failure this guards against is silent: a stream that holds text back
    // and never releases it drops the end of an answer with nothing to show
    // for it.
    const reply = replies.join("\n\n");
    for (const size of [1, 2, 5, 13, 64, 4096]) {
      expect(streamed(reply, size)).toBe(humanizeReply(reply));
    }
  });

  it("does not sit on a whole paragraph waiting for a dash that never comes", () => {
    const stream = new ProseStream();
    const shown = stream.push(
      "The object case is the one English speakers get wrong most often, and it is worth learning early because it recurs constantly.",
    );
    // Everything but the word still being typed.
    expect(shown.length).toBeGreaterThan(100);
  });
});
