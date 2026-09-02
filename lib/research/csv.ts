/**
 * The export as one flat file, which is the form somebody actually opens.
 *
 * The JSON is the complete answer and is what a second program should read.
 * This is for the person who was sent it: one row per published cell, one
 * column per thing about that cell, openable in a spreadsheet and loadable in
 * one line of R or pandas. Long rather than wide, so that a table with one
 * dimension and a table with three live in the same file without a second
 * header, which is what lets the whole export be one attachment.
 *
 * The method travels with the data. Every line above the header starts with a
 * `#`, which both `read.csv(comment.char = "#")` and `read_csv(comment = "#")`
 * skip without being asked twice, and a spreadsheet shows as text at the top.
 * A file of percentages with no denominators and no caveats is the thing this
 * whole feature is trying not to produce, and a method note that lives in a
 * different file from the numbers is a method note that gets separated from
 * them by the second email.
 */

import type { Section } from "./corpus";

/** How many key columns the file carries, which is the widest table in it. */
export function keyColumns(sections: readonly Section[]): number {
  return Math.max(1, ...sections.map((s) => s.dimensions.length));
}

/**
 * One CSV field.
 *
 * Quoted whenever quoting could matter rather than only when it does, since the
 * cost is a byte and the failure is a file that parses into the wrong shape on
 * somebody else's machine. A lemma cannot contain a comma today, and this file
 * should not be the thing that breaks on the day a gloss does.
 */
function field(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function row(values: (string | number | null)[]): string {
  return values.map(field).join(",");
}

/**
 * The header block, as comment lines.
 *
 * Each line is prefixed rather than wrapped, so a long note stays one logical
 * line and a parser skipping comments skips all of it.
 */
export function commentBlock(lines: readonly string[]): string {
  return lines.map((line) => (line ? `# ${line}` : "#")).join("\n");
}

export interface CsvHeader {
  /** Free prose, one entry per line, written above the data. */
  preamble: readonly string[];
}

export function toCsv(sections: readonly Section[], header: CsvHeader): string {
  const keys = keyColumns(sections);
  const out: string[] = [];

  if (header.preamble.length > 0) out.push(commentBlock(header.preamble), "#");

  const columns: string[] = ["section"];
  for (let i = 1; i <= keys; i++) columns.push(`dimension_${i}`, `value_${i}`);
  columns.push("reviews", "learners", "accuracy_pct", "mature_reviews", "mature_accuracy_pct");
  out.push(row(columns));

  for (const section of sections) {
    for (const cell of section.cells) {
      const values: (string | number | null)[] = [section.id];
      for (let i = 0; i < keys; i++) {
        values.push(section.dimensions[i] ?? null, cell.keys[i] ?? null);
      }
      values.push(
        cell.all.reviews,
        cell.all.learners,
        cell.all.accuracyPct,
        cell.mature?.reviews ?? null,
        cell.mature?.accuracyPct ?? null,
      );
      out.push(row(values));
    }
  }

  return `${out.join("\n")}\n`;
}
