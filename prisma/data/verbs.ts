/**
 * Verb seed data: [lemma, english, cefr, infMa, infDa, pres1sg, past1sg, partTud?, government?]
 *
 * Five principal parts, because two infinitives cannot generate a conjugation:
 * `lugema` gives no clue that the present is `loen`.
 *
 * `partTud` is omitted for intransitive verbs that have no impersonal past
 * participle. `government` records the case the verb demands of its complement
 * (rektsioon) — the thing English speakers get wrong for years.
 */
export type VerbSeed = readonly [
  string, string, string, string, string, string, string, string?, string?,
];

export const VERBS: readonly VerbSeed[] = [
  // ── The irregular core ──────────────────────────────────────────────────
  ["olema", "to be", "A1", "olema", "olla", "olen", "olin", "oldud"],
  ["minema", "to go", "A1", "minema", "minna", "lähen", "läksin", "mindud"],
  ["tulema", "to come", "A1", "tulema", "tulla", "tulen", "tulin", "tuldud"],
  ["tegema", "to do, to make", "A1", "tegema", "teha", "teen", "tegin", "tehtud"],
  ["saama", "to get, to become, to be able", "A1", "saama", "saada", "saan", "sain", "saadud"],
  ["pidama", "to have to, to keep", "A1", "pidama", "pidada", "pean", "pidin", "peetud"],
  ["sööma", "to eat", "A1", "sööma", "süüa", "söön", "sõin", "söödud"],
  ["jooma", "to drink", "A1", "jooma", "juua", "joon", "jõin", "joodud"],
  ["tooma", "to bring", "A2", "tooma", "tuua", "toon", "tõin", "toodud"],
  ["viima", "to take away, to carry", "A2", "viima", "viia", "viin", "viisin", "viidud"],

  // ── Everyday actions ────────────────────────────────────────────────────
  ["tahtma", "to want", "A1", "tahtma", "tahta", "tahan", "tahtsin", "tahetud"],
  ["teadma", "to know (a fact)", "A1", "teadma", "teada", "tean", "teadsin", "teatud"],
  ["tundma", "to know (a person), to feel", "A1", "tundma", "tunda", "tunnen", "tundsin", "tuntud"],
  ["nägema", "to see", "A1", "nägema", "näha", "näen", "nägin", "nähtud"],
  ["kuulma", "to hear", "A1", "kuulma", "kuulda", "kuulen", "kuulsin", "kuuldud"],
  ["rääkima", "to speak, to talk", "A1", "rääkima", "rääkida", "räägin", "rääkisin", "räägitud"],
  ["ütlema", "to say", "A1", "ütlema", "öelda", "ütlen", "ütlesin", "öeldud"],
  ["küsima", "to ask", "A1", "küsima", "küsida", "küsin", "küsisin", "küsitud"],
  ["vastama", "to answer", "A1", "vastama", "vastata", "vastan", "vastasin", "vastatud", "allative: vastan küsimusele (I answer the question)"],
  ["lugema", "to read, to count", "A1", "lugema", "lugeda", "loen", "lugesin", "loetud"],
  ["kirjutama", "to write", "A1", "kirjutama", "kirjutada", "kirjutan", "kirjutasin", "kirjutatud"],
  ["õppima", "to learn, to study", "A1", "õppima", "õppida", "õpin", "õppisin", "õpitud"],
  ["õpetama", "to teach", "A1", "õpetama", "õpetada", "õpetan", "õpetasin", "õpetatud"],
  ["töötama", "to work", "A1", "töötama", "töötada", "töötan", "töötasin", "töötatud"],
  ["elama", "to live", "A1", "elama", "elada", "elan", "elasin", "elatud"],
  ["magama", "to sleep", "A1", "magama", "magada", "magan", "magasin", "magatud"],
  ["ostma", "to buy", "A1", "ostma", "osta", "ostan", "ostsin", "ostetud"],
  ["müüma", "to sell", "A2", "müüma", "müüa", "müün", "müüsin", "müüdud"],
  ["maksma", "to pay, to cost", "A1", "maksma", "maksta", "maksan", "maksin", "makstud"],
  ["andma", "to give", "A1", "andma", "anda", "annan", "andsin", "antud"],
  ["võtma", "to take", "A1", "võtma", "võtta", "võtan", "võtsin", "võetud"],
  ["panema", "to put", "A1", "panema", "panna", "panen", "panin", "pandud"],
  ["jääma", "to stay, to remain", "A1", "jääma", "jääda", "jään", "jäin", "jäädud"],
  ["hakkama", "to begin", "A1", "hakkama", "hakata", "hakkan", "hakkasin", "hakatud"],
  ["lõpetama", "to finish", "A2", "lõpetama", "lõpetada", "lõpetan", "lõpetasin", "lõpetatud"],
  ["alustama", "to start", "A2", "alustama", "alustada", "alustan", "alustasin", "alustatud"],
  ["avama", "to open", "A1", "avama", "avada", "avan", "avasin", "avatud"],
  ["sulgema", "to close", "A2", "sulgema", "sulgeda", "sulen", "sulgesin", "suletud"],
  ["otsima", "to look for", "A1", "otsima", "otsida", "otsin", "otsisin", "otsitud"],
  ["leidma", "to find", "A1", "leidma", "leida", "leian", "leidsin", "leitud"],
  ["kaotama", "to lose", "A2", "kaotama", "kaotada", "kaotan", "kaotasin", "kaotatud"],
  ["sõitma", "to drive, to ride", "A1", "sõitma", "sõita", "sõidan", "sõitsin", "sõidetud"],
  ["kõndima", "to walk", "A2", "kõndima", "kõndida", "kõnnin", "kõndisin", "kõnnitud"],
  ["jooksma", "to run", "A2", "jooksma", "joosta", "jooksen", "jooksin", "joostud"],
  ["laulma", "to sing", "A1", "laulma", "laulda", "laulan", "laulsin", "lauldud"],
  ["tantsima", "to dance", "A1", "tantsima", "tantsida", "tantsin", "tantsisin", "tantsitud"],
  ["mängima", "to play", "A1", "mängima", "mängida", "mängin", "mängisin", "mängitud"],

  // ── Verbs whose government trips English speakers up ────────────────────
  ["aitama", "to help", "A1", "aitama", "aidata", "aitan", "aitasin", "aidatud", "partitive: aitan sind (I help you), not 'to you'"],
  ["helistama", "to phone, to call", "A1", "helistama", "helistada", "helistan", "helistasin", "helistatud", "allative: helistan sulle (I call you), literally 'to you'"],
  ["meeldima", "to please, to be liked", "A1", "meeldima", "meeldida", "meeldin", "meeldisin", undefined, "allative experiencer: mulle meeldib see (I like it), literally 'to me it pleases'"],
  ["mõtlema", "to think", "A1", "mõtlema", "mõelda", "mõtlen", "mõtlesin", "mõeldud", "allative or -le peale: mõtlen sinule (I think of you)"],
  ["ootama", "to wait", "A1", "ootama", "oodata", "ootan", "ootasin", "oodatud", "partitive: ootan sind (I wait for you), no preposition"],
  ["armastama", "to love", "A1", "armastama", "armastada", "armastan", "armastasin", "armastatud", "partitive: armastan sind"],
  ["uskuma", "to believe", "A2", "uskuma", "uskuda", "usun", "uskusin", "usutud", "partitive: usun sind (I believe you)"],
  ["kartma", "to fear, to be afraid", "A2", "kartma", "karta", "kardan", "kartsin", "kardetud", "partitive: kardan koera (I fear the dog)"],
  ["vajama", "to need", "A2", "vajama", "vajada", "vajan", "vajasin", "vajatud", "partitive: vajan abi (I need help)"],

  // ── B1–B2 ───────────────────────────────────────────────────────────────
  ["mäletama", "to remember", "A2", "mäletama", "mäletada", "mäletan", "mäletasin", "mäletatud"],
  ["unustama", "to forget", "A2", "unustama", "unustada", "unustan", "unustasin", "unustatud"],
  ["lootma", "to hope", "A2", "lootma", "loota", "loodan", "lootsin", "loodetud"],
  ["proovima", "to try", "A2", "proovima", "proovida", "proovin", "proovisin", "proovitud"],
  ["suutma", "to be able to, to manage", "B1", "suutma", "suuta", "suudan", "suutsin", "suudetud"],
  ["kasutama", "to use", "A2", "kasutama", "kasutada", "kasutan", "kasutasin", "kasutatud"],
  ["muutma", "to change (something)", "B1", "muutma", "muuta", "muudan", "muutsin", "muudetud"],
  ["otsustama", "to decide", "B1", "otsustama", "otsustada", "otsustan", "otsustasin", "otsustatud"],
  ["selgitama", "to explain", "B1", "selgitama", "selgitada", "selgitan", "selgitasin", "selgitatud"],
  ["tähendama", "to mean", "A2", "tähendama", "tähendada", "tähendan", "tähendasin", "tähendatud"],
  ["arendama", "to develop", "B2", "arendama", "arendada", "arendan", "arendasin", "arendatud"],
  ["korraldama", "to organise, to arrange", "B2", "korraldama", "korraldada", "korraldan", "korraldasin", "korraldatud"],
  ["soovitama", "to recommend", "B1", "soovitama", "soovitada", "soovitan", "soovitasin", "soovitatud"],
  ["võrdlema", "to compare", "B2", "võrdlema", "võrrelda", "võrdlen", "võrdlesin", "võrreldud"],
  ["tõestama", "to prove", "B2", "tõestama", "tõestada", "tõestan", "tõestasin", "tõestatud"],
] as const;
