import { bucketForOwner, checkRateLimit } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/db";
import { ekilexConfigured, fetchEkilexDetails, searchEkilex } from "@/lib/ekilex/client";
import { mapEkilexDetails } from "@/lib/ekilex/mapper";
import { mergeExamples, parseExamples, serialiseExamples } from "./examples";
import { fetchEnglishGloss } from "./wiktionary";
import { translateWithAnu } from "@/lib/tutor/translate";
import { NEEDS_TRANSLATION, NO_VALUE } from "@/lib/copy/values";
import { isRecentMiss, rememberMiss, singleFlight } from "@/lib/cache/singleFlight";
import { gradates } from "@/lib/estonian/gradation";

/**
 * How long a word Ekilex had nothing to say about is left alone.
 *
 * The upgrade path used to record nothing at all when the answer was nothing,
 * so a word Ekilex does not carry cost two round trips on every single render
 * of the page it sits on. Not once, not once a day: every render, for ever,
 * against a free academic service, and the word never got any better for it.
 *
 * A day is the balance. Ekilex is a living lexicographic database and a word
 * added to it tomorrow has to be findable tomorrow, so this cannot be a
 * permanent verdict; and nothing in it changes often enough that asking more
 * than once a day is anything but noise.
 */
const MISS_TTL_MS = 24 * 60 * 60 * 1_000;

/**
 * The same window for a search that matched nothing at all.
 *
 * That case has no row to write to, since there is no word to write it
 * against, so it is held in memory for the life of the instance instead. It
 * absorbs exactly what it needs to: somebody typing a word that does not
 * exist, seeing nothing, and pressing enter again.
 */
const QUERY_MISS_TTL_MS = 10 * 60 * 1_000;

/**
 * Fetches a word we do not hold locally, and stores it.
 *
 * No single source has everything, so each supplies what it is actually good at:
 *
 *   Ekilex      every authoritative form, CEFR level, verb government and
 *               an Estonian definition — but no English on a reader key
 *   Wiktionary  the English gloss Ekilex lacks, for most everyday vocabulary
 *   Anu         the remaining gaps, tagged as unverified because it is a guess
 *   the learner the final word, via the edit form
 *
 * Everything is written to the local database on the way through, so the second
 * lookup of a word is instant, works offline, and does not trouble a free
 * academic API again.
 */
export interface LookupResult {
  id: string;
  lemma: string;
  translationSource: "WIKTIONARY" | "AI" | "NONE";
}

/**
 * Upgrades a locally-held word to Ekilex's authoritative forms.
 *
 * The built-in dictionary is a warm start, not the truth: its forms are
 * hand-written and it holds only principal parts. The first time a seeded word is
 * actually looked at, we replace them with the real forms and keep the
 * translation the learner already has. Every word she uses becomes authoritative;
 * words she never opens cost nothing.
 */
/**
 * How long a page will wait for an upgrade it does not need.
 *
 * `enrichFromEkilex` improves an entry that is already on screen: the word, its
 * principal parts and every regular case derived from them are in the database
 * before this runs. So it is worth a moment and not worth a page.
 *
 * The Ekilex client allows fifteen seconds per request and the upgrade makes
 * two of them in sequence, which means a slow minute upstream could hold a
 * dictionary render for half a minute with nothing on the screen. Measured
 * here, the upgrade normally takes about 1.4 seconds and every later visit to
 * the same word takes 35 milliseconds, because the forms are then stored.
 *
 * Past this deadline the page renders what it has. Nothing is lost: the
 * request that was in flight still finishes and still writes its cache, and
 * the next visit either finds it there or tries again.
 */
const UPGRADE_DEADLINE_MS = 2_500;

/**
 * The upgrade, given up on rather than waited for.
 *
 * Returns false on a timeout, which is what the caller already does for "there
 * was nothing to add", and is true in the only sense the caller cares about:
 * there is nothing new to show this time round.
 */
export async function enrichWithinDeadline(
  lexemeId: string,
  deadlineMs = UPGRADE_DEADLINE_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), deadlineMs);
  });
  try {
    return await Promise.race([
      // A failure here is already handled inside enrichFromEkilex; this catch
      // is so an unexpected one degrades to "not upgraded" rather than to an
      // error page over a word the reader can already see.
      enrichFromEkilex(lexemeId).catch(() => false),
      gaveUp,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichFromEkilex(lexemeId: string): Promise<boolean> {
  if (!ekilexConfigured()) return false;
  /*
    One upgrade per word at a time. Two renders of the same entry arriving
    together used to make two full upgrades: four Ekilex requests, and then two
    `deleteMany` plus `createMany` pairs racing over the same word's forms.
    Joining the one already running costs nothing and removes both.
  */
  return singleFlight(`ekilex:enrich:${lexemeId}`, () => runEnrich(lexemeId));
}

async function runEnrich(lexemeId: string): Promise<boolean> {
  const lexeme = await prisma.lexeme.findUnique({
    where: { id: lexemeId },
    select: {
      id: true, lemma: true, pos: true, ekilexWordId: true, lookupMissAt: true,
      translation: true, provenance: true, government: true, examples: true,
      // The marker alone is not proof: re-running the seed rewrites forms with
      // principal parts only while leaving ekilexWordId set, which would strand
      // the word half-upgraded forever.
      forms: { where: { isPrincipal: false }, select: { id: true }, take: 1 },
    },
  });
  if (!lexeme) return false;
  // Typed in by hand — hers, not ours to overwrite.
  if (lexeme.provenance === "USER") return false;
  // Already carries the forms Ekilex supplied.
  if (lexeme.ekilexWordId && lexeme.forms.length > 0) return false;
  /*
    Asked recently, and Ekilex had nothing. Not an error and not a permanent
    verdict: a word can be added to Ekilex tomorrow, so the marker expires. It
    just stops this from being asked twice per render of a page that will show
    the same thing either way.
  */
  if (lexeme.lookupMissAt && Date.now() - lexeme.lookupMissAt.getTime() < MISS_TTL_MS) {
    return false;
  }

  const matches = await searchEkilex(lexeme.lemma);
  const first = matches.find((m) => m.wordValue === lexeme.lemma) ?? matches[0];
  if (!first) return recordMiss(lexeme.id);

  const details = await fetchEkilexDetails(first.wordId);
  const mapped = details ? mapEkilexDetails(details) : null;
  if (!mapped || mapped.lemma !== lexeme.lemma) return recordMiss(lexeme.id);

  await prisma.lexeme.update({
    where: { id: lexeme.id },
    data: {
      // The hand-written English stays: it is better than anything we would refetch.
      cefr: mapped.cefr ?? undefined,
      // A pronoun's stem change is suppletion, not gradation, whatever the
      // classifier makes of `kes : kelle`. The stored part of speech decides.
      gradation: gradates(lexeme.pos) ? mapped.gradation : "NONE",
      gradationNote: gradates(lexeme.pos) ? mapped.gradationNote : null,
      // Ekilex records government as bare question words ("kellest/millest").
      // A worked example we already hold teaches more, so it is not overwritten.
      government: lexeme.government ?? mapped.government ?? undefined,
      notes: mapped.notes,
      // Sentences are merged rather than replaced: a translation already
      // resolved for one survives the refetch, exactly as the gloss does.
      examples: serialiseExamples(mergeExamples(parseExamples(lexeme.examples), mapped.examples)),
      ekilexWordId: mapped.ekilexWordId,
      provenance: "EKILEX",
      fetchedAt: new Date(),
      // Whatever we wrote down last time, Ekilex has answered now.
      lookupMissAt: null,
    },
  });
  await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
  await prisma.form.createMany({
    data: mapped.forms.map((f) => ({ ...f, lexemeId: lexeme.id })),
  });
  return true;
}

/**
 * Writes down that Ekilex was asked and had nothing, and reports "not
 * upgraded" to the caller, which is what it was going to say anyway.
 *
 * Only `lookupMissAt` is touched. Not `fetchedAt`, which means a successful
 * retrieval and is read as a ranking signal by the exam pool; not
 * `provenance`, which is a claim about where the entry came from and is
 * unchanged by a question nobody answered. A failed write is swallowed: the
 * cost of it is one wasted lookup next time, which is the state we were
 * already in, and it must never turn a page render into an error.
 */
async function recordMiss(lexemeId: string): Promise<false> {
  await prisma.lexeme
    .update({ where: { id: lexemeId }, data: { lookupMissAt: new Date() } })
    .catch(() => undefined);
  return false;
}

/**
 * `ownerId` is here because the last step of a lookup can cost money.
 *
 * Ekilex and Wiktionary are free; the fallback gloss is a model call, and this
 * app meters every one of those against the person who caused it. So a lookup
 * is somebody's lookup, and the signature says so rather than leaving the
 * charge nameless.
 */
export async function lookupAndStore(
  ownerId: string,
  query: string,
): Promise<LookupResult | null> {
  if (!ekilexConfigured()) return null;
  const trimmed = query.trim();

  /*
    A CAP ON THE ONE PATH THAT REACHES THREE SERVICES ON SOMEBODY ELSE'S BILL.

    This runs on every render of `/dictionary?q=` whose local search came back
    empty, and again from `resolveScannedWord`, a Server Action with no
    allowance of its own. Each *unique* unknown string is two requests to
    Ekilex on the deployment's academic key, one to Wiktionary, and then a
    metered model call; the miss cache and the single flight collapse repeats
    of the same string and do nothing at all about a loop that never repeats
    one. So the limit is on the caller rather than on the query, and it sits
    here rather than in the two call sites, because the next one would
    inherit nothing.

    Thirty a minute is far above anybody typing, including a learner working
    through a page of new words, and far below a script.
  */
  if (!checkRateLimit(`lookup:${bucketForOwner(ownerId)}`, 30, 60_000).ok) return null;
  /*
    Nothing came back for this exact query a moment ago, so nothing will now.
    A search that misses is the one a person retries, and each attempt is two
    requests to a free academic service for an answer we already have.
  */
  if (isRecentMiss(`ekilex:q:${trimmed}`)) return null;
  /*
    And one upstream search per query, however many people typed it at once.

    A joiner is not charged for a request it did not make, which is the same
    rule speech follows: the class of twenty-five who all look up the unit's
    new word cost one lookup and one gloss, billed to whoever asked first.
  */
  return singleFlight(`ekilex:lookup:${trimmed}`, () => runLookup(ownerId, trimmed));
}

async function runLookup(ownerId: string, query: string): Promise<LookupResult | null> {
  const missKey = `ekilex:q:${query}`;

  const matches = await searchEkilex(query);
  const first = matches[0];
  if (!first) {
    rememberMiss(missKey, QUERY_MISS_TTL_MS);
    return null;
  }

  const details = await fetchEkilexDetails(first.wordId);
  if (!details) {
    rememberMiss(missKey, QUERY_MISS_TTL_MS);
    return null;
  }

  const mapped = mapEkilexDetails(details);
  if (!mapped) {
    rememberMiss(missKey, QUERY_MISS_TTL_MS);
    return null;
  }

  // Already stored under this lemma from an earlier lookup or the seed.
  const existing = await prisma.lexeme.findUnique({
    where: { lemma_pos: { lemma: mapped.lemma, pos: mapped.pos } },
    select: { id: true, translation: true, examples: true },
  });

  const { translation, source } = await resolveTranslation(
    ownerId,
    mapped.lemma,
    existing?.translation,
  );

  const data = {
    lemma: mapped.lemma,
    pos: mapped.pos,
    translation,
    cefr: mapped.cefr,
    gradation: mapped.gradation,
    gradationNote: mapped.gradationNote,
    government: mapped.government,
    notes: mapped.notes,
    examples: serialiseExamples(mergeExamples(parseExamples(existing?.examples), mapped.examples)),
    ekilexWordId: mapped.ekilexWordId,
    provenance: "EKILEX",
    fetchedAt: new Date(),
    lookupMissAt: null,
  };

  const lexeme = existing
    ? await prisma.lexeme.update({ where: { id: existing.id }, data })
    : await prisma.lexeme.create({ data });

  // Ekilex is authoritative, so its forms replace whatever we held.
  await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
  await prisma.form.createMany({
    data: mapped.forms.map((f) => ({ ...f, lexemeId: lexeme.id })),
  });

  return { id: lexeme.id, lemma: lexeme.lemma, translationSource: source };
}

/**
 * An English translation, from the best source that has one.
 *
 * A translation the learner has already accepted always wins — re-fetching would
 * overwrite a correction she made deliberately.
 */
/*
  A translation that is really a gap.

  Three spellings, because the marker has changed twice and the dictionary is
  seeded data that outlives a deploy. Rows written before `NO_VALUE` existed
  open with an em dash. Matching only today's spelling would leave every one
  of those looking like a translation somebody had chosen, so this would stop
  trying to fill it in and the word would keep a dash for its meaning for
  ever.
*/
function isPlaceholder(translation: string): boolean {
  const trimmed = translation.trim();
  return (
    trimmed.startsWith("\u2014") ||
    trimmed === NO_VALUE ||
    trimmed === NEEDS_TRANSLATION
  );
}

async function resolveTranslation(
  ownerId: string,
  lemma: string,
  existing: string | undefined,
): Promise<{ translation: string; source: LookupResult["translationSource"] }> {
  if (existing && existing.trim() && !isPlaceholder(existing)) {
    return { translation: existing, source: "NONE" };
  }

  const gloss = await fetchEnglishGloss(lemma);
  if (gloss) return { translation: gloss.senses.join("; "), source: "WIKTIONARY" };

  /*
    The last resort, and the only paid one. It is metered against this
    learner's allowance like every other call to a model: this was the one
    path in the app that reached a provider without going through the ledger,
    so a search box was a way to spend a deployment's budget without leaving a
    row behind saying so.

    A refusal reads exactly like the model not knowing the word, which is
    correct here. The entry is written either way, with every form and
    the Estonian definition, and the English left honestly blank for the
    learner to fill in. Nothing about a quota belongs on a dictionary entry.
  */
  const guess = await translateWithAnu(ownerId, lemma);
  if (guess.ok) return { translation: guess.text, source: "AI" };

  // Better an honest blank than a wrong word: the entry still carries every
  // form and the Estonian definition, and the learner can type the English.
  return { translation: NEEDS_TRANSLATION, source: "NONE" };
}
