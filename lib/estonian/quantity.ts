/**
 * Length contrasts, found in the dictionary rather than written by hand.
 *
 * Known limitation 2 in docs/13 says gradation detection is orthographic, because
 * Estonian's three-way quantity (*välde*) is a difference in duration that the
 * spelling does not record. That is true, and it has a consequence nobody drew:
 * the part of the contrast that *is* written — single versus doubled letters,
 * `lina` against `linna`, `kapi` against `kappi` — is invisible to a reader who
 * has never heard it, and audio is the only channel that can teach it.
 *
 * So the pairs are discovered, not authored: collapse every doubled letter in a
 * stored form and two forms that collide differ only in length. Both sides are
 * real forms already in the dictionary, from Ekilex or from the hand-checked
 * seed set, which keeps this on the right side of "never generate Estonian
 * morphology" — nothing here is invented, only noticed.
 *
 * What this deliberately does *not* claim to teach is the second-versus-third
 * quantity distinction, where the two forms are spelled identically. Speech
 * synthesis is given the same string for both and will say the same thing, so a
 * drill built on it would be a lie. The UI says so.
 */

/** Collapses every run of a repeated letter to one, so `linna` and `lina` agree. */
export function collapseDoubles(word: string): string {
  return word.toLowerCase().replace(/(.)\1+/g, "$1");
}

export interface FormRef {
  /** The spelling, exactly as stored. */
  value: string;
  lemma: string;
  translation: string;
  /** A readable name for the slot this form fills, e.g. "genitive". */
  formLabel: string;
  lexemeId: string;
}

export interface QuantityPair {
  /** Two forms that differ only in the length of one sound. */
  a: FormRef;
  b: FormRef;
  /** The shared skeleton, for grouping and for the explanation. */
  key: string;
  /**
   * True when both forms belong to one word — `maja` against `majja`, the
   * nominative against the short illative.
   *
   * These turn out to be almost all of them, and they are the better lesson:
   * the learner is not distinguishing two vocabulary items but two *slots of
   * the same paradigm* that mean "house" and "into the house". Getting the
   * length wrong there changes the grammar of the sentence, not just the word.
   */
  sameWord: boolean;
}

/**
 * True when two spellings differ *only* by how many times a letter is repeated.
 *
 * Requires the collapsed forms to match and the originals not to — `lina` and
 * `linna` qualify, `lina` and `lina` do not, and neither do two words that
 * merely look similar.
 */
export function isLengthPair(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return false;
  return collapseDoubles(x) === collapseDoubles(y);
}

/**
 * Finds every length contrast among the supplied forms.
 *
 * Both kinds count. Within one paradigm the contrast carries grammar — `mere`
 * is "of the sea" and `merre` is "into the sea" — and across two words it
 * carries meaning. The first kind is far more common in practice and is what
 * the built-in dictionary mostly yields.
 */
export function findQuantityPairs(forms: FormRef[], limit = 60): QuantityPair[] {
  const groups = new Map<string, FormRef[]>();

  for (const form of forms) {
    if (form.value.length < 3) continue;                 // too short to carry a contrast
    if (/\s/.test(form.value)) continue;                 // phrases are not minimal pairs
    const key = collapseDoubles(form.value);
    const group = groups.get(key);
    if (group) group.push(form);
    else groups.set(key, [form]);
  }

  const pairs: QuantityPair[] = [];
  for (const [key, group] of groups) {
    // One spelling per distinct written form: two identically spelled forms are
    // the Q2/Q3 case this cannot teach, so they are not a pair here.
    const bySpelling = new Map<string, FormRef>();
    for (const form of group) {
      const spelling = form.value.toLowerCase();
      if (!bySpelling.has(spelling)) bySpelling.set(spelling, form);
    }
    const distinct = [...bySpelling.values()];
    if (distinct.length < 2) continue;

    for (let i = 0; i < distinct.length; i++) {
      for (let j = i + 1; j < distinct.length; j++) {
        const a = distinct[i]!;
        const b = distinct[j]!;
        pairs.push({ a, b, key, sameWord: a.lexemeId === b.lexemeId });
      }
    }
  }

  return pairs.slice(0, limit);
}

/**
 * Which of the two is written with the doubled letter — the longer sound, and
 * the one an English ear tends to miss.
 */
export function longerOf(pair: QuantityPair): FormRef {
  return pair.a.value.length >= pair.b.value.length ? pair.a : pair.b;
}

/** Names the letter whose length is at issue, for the explanation after an answer. */
export function contrastLetter(pair: QuantityPair): string | null {
  const longer = longerOf(pair).value.toLowerCase();
  const match = longer.match(/(.)\1/);
  return match?.[1] ?? null;
}
