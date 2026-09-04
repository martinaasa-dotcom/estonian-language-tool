/*
  WHAT A MODEL WRITES BETWEEN THE WORDS, READ BACK INTO TYPOGRAPHY.

  Every model this app can ask writes markdown whether or not it is asked
  to: a word it is pointing at comes wrapped in `**`, a list of three forms
  comes with a dash in front of each, and a longer answer arrives under a
  `###` heading. Anu's bubble drew all of it as text, so a learner read
  `**raamatut**` with the asterisks in, on the one word the sentence was
  about, and a numbered list as four lines beginning `1.`. The prompt can
  ask for less of it, and now does, but a prompt is a request and this is
  the pass that makes the answer clean whatever arrived.

  IT IS DELIBERATELY SMALL. Bold, italic, inline code, a bulleted or
  numbered list, a heading and a paragraph are the whole of it, because
  those are the shapes a teacher's message has and the only ones the prompt
  allows. A table, a link, an image or a code block is not something Anu
  should be sending a learner, so none of those is understood: the text is
  shown as it came, which is the honest answer to markup nobody asked for
  and is also what keeps this module from being the third dependency this
  app takes on for a chat bubble.

  IT NEVER CHANGES A WORD. Markers are typography and are lifted off; what
  sits between them is passed through character for character, Estonian
  included, which is the rule everything under `lib/tutor/` is written to
  (ADR-005). An unpaired marker stays on screen as the character it is,
  since guessing which half of a sentence a model meant to bold would be
  editing what she said. `lib/tutor/markdown.test.ts` holds it to both.

  Pure, so it can be tested without a browser and used by the component that
  draws a reply and by anything that needs the plain text of one.
*/

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "break" };

export type Block =
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "heading"; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s{0,3}(?:[-*+•])\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d+[.)]\s+(.*)$/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
/** A line indented under a list item, which continues that item. */
const CONTINUATION = /^\s{2,}(\S.*)$/;

/**
 * The inline shapes, longest marker first so `**` is read before `*`.
 *
 * A single asterisk or underscore counts as emphasis only where it opens
 * against a non-space and closes against one, and only where it is not
 * glued to a word on the outside, which is what keeps `keda/mida*` (the
 * asterisk Ekilex writes into a government string) and `snake_case` as the
 * characters they are.
 */
const INLINE = /(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1|`([^`\n]+)`|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])/;

/** Split one run of text into its inline pieces. */
export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push({ kind: "text", text: rest });
      break;
    }
    if (match.index > 0) out.push({ kind: "text", text: rest.slice(0, match.index) });
    if (match[2] !== undefined) out.push({ kind: "strong", text: match[2] });
    else if (match[3] !== undefined) out.push({ kind: "code", text: match[3] });
    else out.push({ kind: "em", text: match[4] ?? match[5] ?? "" });
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

/** Lines of one paragraph, joined with a break between each. */
function paragraphInlines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ kind: "break" });
    out.push(...parseInlines(line));
  });
  return out;
}

/** A reply, read into the blocks a bubble draws. */
export function parseReply(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", inlines: paragraphInlines(paragraph) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ordered: list.ordered, items: list.items.map(paragraphInlines) });
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (RULE.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", inlines: parseInlines(heading[1] ?? "") });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item !== undefined) {
      flushParagraph();
      const ordered = numbered !== null && numbered !== undefined;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push([item]);
      continue;
    }

    const continuation = list ? CONTINUATION.exec(raw) : null;
    if (list && continuation) {
      list.items[list.items.length - 1]!.push(continuation[1] ?? "");
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** The words of a reply with every marker lifted off, for anywhere that shows plain text. */
export function plainText(text: string): string {
  return parseReply(text)
    .map((block) => {
      if (block.kind === "list") {
        return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : "-"} ${inlineText(item)}`).join("\n");
      }
      return inlineText(block.inlines);
    })
    .join("\n\n");
}

function inlineText(inlines: Inline[]): string {
  return inlines.map((piece) => (piece.kind === "break" ? "\n" : piece.text)).join("");
}
