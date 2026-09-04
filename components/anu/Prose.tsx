import type { ReactNode } from "react";
import { parseReply, type Inline } from "@/lib/tutor/markdown";

/**
 * Anu's reply, drawn as typography rather than as the characters a model
 * typed.
 *
 * `lib/tutor/markdown.ts` reads the reply into paragraphs, lists, headings
 * and the three inline shapes; this is the one place those become elements,
 * shared by the full `/tutor` page, the floating panel and her reading of an
 * exam composition, so a bold word looks the same wherever she said it.
 *
 * What is bold here is nearly always Estonian, since the prompt asks her to
 * bold the word or form she is pointing at and nothing else, so it is set in
 * the ink rather than a hue: a hue in this app means something (mint is
 * recalled, peach is missed) and a word she is merely pointing at means
 * neither. A heading is drawn as a bold line rather than as a heading
 * element, because a chat bubble is not a document and a screen reader
 * walking a page's headings should not find the middle of a conversation
 * in the list.
 */
export function AnuProse({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseReply(text);
  return (
    <div className={`flex flex-col gap-2.5 text-base leading-relaxed ${className}`} style={{ color: "var(--ink)" }}>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return <p key={i} className="font-semibold">{inlines(block.inlines)}</p>;
        }
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={`flex flex-col gap-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.items.map((item, j) => <li key={j}>{inlines(item)}</li>)}
            </Tag>
          );
        }
        return <p key={i}>{inlines(block.inlines)}</p>;
      })}
    </div>
  );
}

function inlines(pieces: Inline[]): ReactNode[] {
  return pieces.map((piece, i) => {
    switch (piece.kind) {
      case "strong": return <strong key={i} className="font-semibold">{piece.text}</strong>;
      case "em": return <em key={i}>{piece.text}</em>;
      case "code": return (
        <code key={i} className="rounded-md px-1 py-0.5 text-[0.92em]" style={{ background: "var(--raised)" }}>
          {piece.text}
        </code>
      );
      case "break": return <br key={i} />;
      default: return piece.text;
    }
  });
}
