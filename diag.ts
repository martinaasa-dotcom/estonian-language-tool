import { searchEkilex, fetchEkilexDetails } from "./lib/ekilex/client";
import { mapEkilexDetails } from "./lib/ekilex/mapper";
import { fetchEnglishGloss } from "./lib/dict/wiktionary";

async function main() {
  for (const w of ["koor", "koristaja", "koppel", "kopikas", "raamat", "laud"]) {
    const hits = await searchEkilex(w);
    const exact = hits.find((h) => h.wordValue === w) ?? hits[0];
    let principal = -1;
    if (exact) {
      const d = await fetchEkilexDetails(exact.wordId);
      const m = d ? mapEkilexDetails(d) : null;
      principal = m ? m.forms.filter((f) => f.isPrincipal).length : -1;
    }
    const g = await fetchEnglishGloss(w);
    console.log(
      w.padEnd(12),
      `ekilex=${exact ? "hit" : "MISS"}`.padEnd(12),
      `principal=${principal}`.padEnd(14),
      `gloss=${g?.short ? JSON.stringify(g.short) : "MISS"}`,
    );
  }
}
void main();
