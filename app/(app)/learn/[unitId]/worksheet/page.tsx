import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { unitById } from "@/lib/collections/syllabus";
import { buildWorksheet, type WorksheetWord } from "@/lib/collections/worksheet";
import { parseExamples } from "@/lib/dict/examples";
import { Empty, Note } from "@/components/ui";
import { ButtonLink } from "@/components/Button";
import { PrintButton } from "@/components/PrintButton";
import { oneEntryPerLemma } from "@/lib/dict/search";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = unitById(unitId);
  return { title: unit ? `${unit.title} · worksheet` : "Worksheet" };
}

/** A ruled line to write on. Paper needs somewhere to put the answer. */
function Rule({ width = 120 }: { width?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block align-baseline"
      style={{ width, borderBottom: "1px solid var(--ink-3)", height: "1em" }}
    />
  );
}

/**
 * A printable worksheet for one unit, with the answer key on its own page.
 *
 * The thing an Estonian course actually asks for and no flashcard app ships:
 * paper. Half of a real class happens in a room with no phones out, and a
 * teacher who cannot hand out a sheet uses a different app for that half.
 *
 * Everything on the sheet is material the dictionary already holds — attested
 * sentences with one of their own words hidden, and case tables with cells left
 * out. Nothing is generated (ADR-005), which is also why an exercise simply
 * does not appear when the material for it is missing.
 *
 * The print rules live in `app/globals.css`: the rail, the pastel wash and
 * anything marked `no-print` come off the page, and `page-break` puts the key
 * on its own sheet so it can be kept back until the end of the lesson.
 */
export default async function WorksheetPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = unitById(unitId);
  if (!unit) notFound();

  // Signed in, like every other page here — a worksheet is generated from the
  // dictionary, not published.
  await requireUserId();

  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: [...unit.lemmas] } },
    select: {
      id: true,
      lemma: true,
      translation: true,
      pos: true,
      provenance: true,
      examples: true,
      forms: { select: { formType: true, value: true } },
    },
  });

  // One row per lemma, in the unit's own order. This printed `tuba` six times,
  // once per section, wherever the dictionary held two entries for a word.
  const lexemes = oneEntryPerLemma(rows, unit.lemmas);

  const words: WorksheetWord[] = lexemes.map((l) => ({
    lemma: l.lemma,
    translation: l.translation,
    pos: l.pos,
    forms: l.forms,
    examples: parseExamples(l.examples),
  }));

  const sheet = buildWorksheet(words);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/learn/${unit.id}`}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "var(--accent-deep)" }}
        >
          <ArrowLeft size={14} aria-hidden /> Back to {unit.title}
        </Link>
        <PrintButton />
      </div>

      {sheet.empty ? (
        <Empty
          title="Nothing to print for this unit yet"
          body="A worksheet is built from what the dictionary holds: attested sentences to hide a word in, and principal parts to leave out of a table. Look these words up once and the sheet fills itself in."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      ) : (
        <>
          <header className="mb-8 border-b pb-5" style={{ borderColor: "var(--rule)" }}>
            <p className="label-xs" style={{ color: "var(--ink-3)" }}>
              Kodukeel · {unit.cefr} · {unit.subtitle}
            </p>
            <h1 lang="et" className="est mt-1 text-2xl font-bold" style={{ color: "var(--ink)" }}>
              {unit.title}
            </h1>
            <p className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-xs" style={{ color: "var(--ink-2)" }}>
              <span>Nimi / Name: <Rule width={180} /></span>
              <span>Kuupäev / Date: <Rule width={110} /></span>
            </p>
          </header>

          {sheet.vocabulary.length > 0 && (
            <section className="avoid-break mb-9">
              <h2 className="est mb-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                A · Mis see on? What does it mean?
              </h2>
              <p className="mb-4 text-xs" style={{ color: "var(--ink-3)" }}>
                Write the English meaning next to each word.
              </p>
              <ol className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {sheet.vocabulary.map((item, i) => (
                  <li key={item.lemma} className="flex items-baseline gap-2 text-base">
                    <span className="tnum w-5 shrink-0" style={{ color: "var(--ink-3)" }}>{i + 1}.</span>
                    <span lang="et" className="est w-32 shrink-0" style={{ color: "var(--ink)" }}>
                      {item.lemma}
                    </span>
                    <Rule width={140} />
                  </li>
                ))}
              </ol>
            </section>
          )}

          {sheet.gaps.length > 0 && (
            <section className="avoid-break mb-9">
              <h2 className="est mb-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                B · Täida lüngad. Fill the gaps
              </h2>
              <p className="mb-4 text-xs" style={{ color: "var(--ink-3)" }}>
                Put the word in brackets into the right form. Every sentence here is a real one,
                recorded by the Institute of the Estonian Language.
              </p>
              <ol className="flex flex-col gap-4">
                {sheet.gaps.map((gap, i) => (
                  <li key={gap.text} className="flex items-baseline gap-2 text-base">
                    <span className="tnum w-5 shrink-0" style={{ color: "var(--ink-3)" }}>{i + 1}.</span>
                    <span className="flex-1">
                      <span lang="et" className="est" style={{ color: "var(--ink)" }}>{gap.text}</span>
                      <span lang="et" className="ml-2 text-xs italic" style={{ color: "var(--ink-3)" }}>
                        ({gap.hint})
                      </span>
                      {gap.english && (
                        <span className="mt-0.5 block text-xs" style={{ color: "var(--ink-3)" }}>
                          {gap.english}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {sheet.cases.length > 0 && (
            <section className="avoid-break mb-9">
              <h2 className="est mb-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                C · Kääna. Complete the table
              </h2>
              <p className="mb-4 text-xs" style={{ color: "var(--ink-3)" }}>
                Fill in the missing principal parts. These three are the ones that have to be
                memorised; every other case is built on the second of them.
              </p>
              {/*
                A blank to write on is 110px wide because that is what a hand
                needs, so three of them and their padding come to more than a
                360px phone has. The sheet is made to be printed and prints at
                its full width; on a screen too narrow for it the scroller is
                the way out, which is the same bargain every other table in the
                app makes and what lets `table { overflow-wrap: break-word }`
                in app/globals.css keep an Estonian form whole.
              */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-base">
                  <thead>
                    <tr>
                      {["Nimetav · nominative", "Omastav · genitive", "Osastav · partitive"].map((h) => (
                        <th
                          key={h}
                          className="border-b px-2 py-2 text-left text-xs font-semibold"
                          style={{ borderColor: "var(--ink-3)", color: "var(--ink-2)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.cases.map((row) => (
                      <tr key={row.lemma} style={{ borderBottom: "1px solid var(--rule)" }}>
                        <td lang="et" className="est px-2 py-3" style={{ color: "var(--ink)" }}>
                          {row.nominative}
                        </td>
                        <td lang="et" className="est px-2 py-3" style={{ color: "var(--ink)" }}>
                          {row.blanks.includes("genitive") ? <Rule width={110} /> : row.genitive}
                        </td>
                        <td lang="et" className="est px-2 py-3" style={{ color: "var(--ink)" }}>
                          {row.blanks.includes("partitive") ? <Rule width={110} /> : row.partitive}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="mt-10 text-2xs" style={{ color: "var(--ink-3)" }}>
            Forms and sentences from Ekilex, Institute of the Estonian Language · CC BY 4.0.
            Worksheet generated by Kodukeel, nothing on this sheet was written by software.
          </p>

          {/* The key, on its own sheet, so it can be printed and kept back. */}
          <section className="page-break mt-12 border-t pt-8" style={{ borderColor: "var(--rule)" }}>
            <p className="label-xs" style={{ color: "var(--ink-3)" }}>Answer key</p>
            <h2 lang="et" className="est mt-1 text-xl font-bold" style={{ color: "var(--ink)" }}>
              {unit.title}
            </h2>

            {sheet.vocabulary.length > 0 && (
              <div className="mt-6">
                <h3 className="est mb-2 text-md font-bold" style={{ color: "var(--ink)" }}>A</h3>
                <ol className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                  {sheet.vocabulary.map((item, i) => (
                    <li key={item.lemma} style={{ color: "var(--ink-2)" }}>
                      <span className="tnum mr-1.5" style={{ color: "var(--ink-3)" }}>{i + 1}.</span>
                      <span lang="et" className="est" style={{ color: "var(--ink)" }}>{item.lemma}</span>
                      {" · "}{item.translation}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {sheet.gaps.length > 0 && (
              <div className="mt-6">
                <h3 className="est mb-2 text-md font-bold" style={{ color: "var(--ink)" }}>B</h3>
                <ol className="flex flex-col gap-1.5 text-sm">
                  {sheet.gaps.map((gap, i) => (
                    <li key={gap.text} style={{ color: "var(--ink-2)" }}>
                      <span className="tnum mr-1.5" style={{ color: "var(--ink-3)" }}>{i + 1}.</span>
                      <span lang="et" className="est" style={{ color: "var(--ink)" }}>{gap.answer}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {sheet.cases.length > 0 && (
              <div className="mt-6">
                <h3 className="est mb-2 text-md font-bold" style={{ color: "var(--ink)" }}>C</h3>
                <ol className="flex flex-col gap-1.5 text-sm">
                  {sheet.cases.map((row) => (
                    <li key={row.lemma} lang="et" className="est" style={{ color: "var(--ink)" }}>
                      {row.nominative} · {row.genitive} · {row.partitive}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <div className="no-print mt-10">
            <Note tone="neutral">
              Printing gives the worksheet and, on a second sheet, the answer key. The rail and the
              background come off automatically. Every exercise is built from the dictionary, so a
              unit whose words have not been looked up yet prints a shorter sheet rather than an
              invented one.
            </Note>
          </div>
        </>
      )}
    </div>
  );
}
