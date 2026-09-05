#!/usr/bin/env python3
"""
EVERY FORM OF EVERY HEADWORD, FROM VABAMORF, WITH GUESSING OFF.

Reads headwords on stdin, one a line, and writes `form<TAB>headword` pairs on
stdout. Called by `scripts/build-forms.ts`, which unions what comes back with
the other sources and writes the shards; nothing here touches the repository.

Vabamorf is Filosoft's open-source morphological analyser and synthesiser for
Estonian (LGPL, lexicon included), reached through estnltk. Guessing is off on
both sides on purpose: `analyze(guess=False)` answers only for a headword the
lexicon holds, and `synthesize(guess=False)` produces a form only from the
endings the lexicon assigned that word, so nothing here is a rule applied to a
spelling it has never seen. A headword the lexicon does not carry produces nothing and
the builder keeps it as itself.

What is produced is an *accept list*: it decides whether a spelling is a word
and which headword it belongs to, and it decides nothing else. No form written
here reaches a card, a paper or a marking target (`scripts/test-invariants.ts`
holds that line), which is what keeps ADR-005 whole: a generated form on the
accept side costs a non-word being let through, and a generated form on the
answer side would be drilled.

    pip install estnltk
    printf 'põhi\ntuba\n' | python3 scripts/lib/synthesize-forms.py
"""
import sys

try:
    from estnltk.vabamorf.morf import Vabamorf, synthesize
except ImportError:
    sys.stderr.write("estnltk is not installed: pip install estnltk\n")
    sys.exit(2)

# Every slot Vabamorf can synthesise for a nominal: 14 cases in two numbers,
# plus the short illative. The codes are Vabamorf's own.
NOMINAL = [
    "sg n", "sg g", "sg p", "adt", "sg ill", "sg in", "sg el", "sg all", "sg ad",
    "sg abl", "sg tr", "sg ter", "sg es", "sg ab", "sg kom",
    "pl n", "pl g", "pl p", "pl ill", "pl in", "pl el", "pl all", "pl ad",
    "pl abl", "pl tr", "pl ter", "pl es", "pl ab", "pl kom",
]
# And for a verb: both infinitives, every person of the present and the simple
# past, the conditional, the imperative, the participles, the impersonal and
# the negative stems.
VERB = [
    "ma", "da", "des", "b", "d", "n", "me", "te", "vad", "o", "s", "sid", "sin",
    "sime", "site", "ksin", "ks", "ksid", "ksime", "ksite", "ge", "gem", "gu",
    "nud", "tud", "takse", "ta", "tama", "tavat", "v", "tav", "mata", "mas",
    "mast", "maks", "vat", "neg o", "neg nud", "neg tud", "nuks", "tuks",
    "nuvat", "ti", "taks", "tagu",
]
# Vabamorf's part-of-speech letters that decline like a nominal.
NOMINAL_POS = {"S", "A", "P", "N", "O", "H", "G", "Y", "U"}


def main() -> None:
    vm = Vabamorf()
    out = sys.stdout
    for line in sys.stdin:
        word = line.strip()
        if not word:
            continue
        analyses = vm.analyze([word], guess=False, propername=False, disambiguate=False)[0]["analysis"]
        seen = set()
        for a in analyses:
            pos = a["partofspeech"]
            root = a["root"].replace("_", "").replace("=", "")
            if (root, pos) in seen:
                continue
            seen.add((root, pos))
            slots = NOMINAL if pos in NOMINAL_POS else VERB if pos == "V" else []
            for slot in slots:
                for form in synthesize(root, slot, pos, guess=False):
                    out.write(f"{form.lower()}\t{word}\n")
    out.flush()


if __name__ == "__main__":
    main()
