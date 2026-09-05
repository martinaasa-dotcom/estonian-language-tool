import { describe, expect, it } from "vitest";
import { parseShard } from "./forms";
import { LENGTH_FILE, shardKey } from "./formsLayout";

/*
  The pure halves. Reading a shard off disk is the integration the builder
  proves by writing one; what has logic worth pinning is how a spelling finds
  its shard and how a line is read back, because the writer and the reader
  share the first and would drift apart in silence if either was retyped.
*/
describe("shardKey", () => {
  it("is the folded first three letters", () => {
    expect(shardKey("pohjas")).toBe("poh");
  });
  it("writes a hyphen as an underscore so the key is a filename", () => {
    expect(shardKey("a-duur")).toBe("a_d");
  });
  it("has a key for a form shorter than a whole key", () => {
    expect(shardKey("a")).toBe("a");
    expect(shardKey("")).toBe("_");
  });
});

describe("parseShard", () => {
  it("reads a form and every headword after the tab, keyed on the folded spelling", () => {
    const shard = parseShard("põhjas\tpõhi,põhjama\ntuppa\ttuba\n");
    expect(shard.get("pohjas")).toEqual([{ form: "põhjas", lemmas: ["põhi", "põhjama"] }]);
    expect(shard.get("tuppa")).toEqual([{ form: "tuppa", lemmas: ["tuba"] }]);
  });
  it("keeps two spellings that fold alike under one key", () => {
    // `oli` was, `õli` oil: somebody with no õ key asking for either gets both.
    const shard = parseShard("oli\tolema\nõli\tõli\n");
    expect(shard.get("oli")?.map((l) => l.form)).toEqual(["oli", "õli"]);
  });
  it("skips a blank or malformed line rather than inventing a form", () => {
    expect(parseShard("\n\tpõhi\nkool\n").size).toBe(0);
  });
});

describe("LENGTH_FILE", () => {
  it("names the file by its length", () => {
    expect(LENGTH_FILE(6)).toBe("length-6.txt.gz");
  });
});
