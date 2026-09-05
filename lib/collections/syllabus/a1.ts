/**
 * A1 — from nothing to getting by.
 *
 * The level is deliberately front-loaded with concrete, pointable nouns and the
 * fourteen verbs an Estonian sentence cannot avoid. Grammar arrives as it is
 * needed rather than as a syllabus of its own: the partitive turns up in the
 * food unit because that is where a learner first meets it, and the inessive in
 * the home unit because a room is the easiest thing to be inside of.
 */
import { unit } from "./types";

export const A1 = [
  unit({
    id: "tervitused",
    title: "Tervitused",
    subtitle: "Greetings and getting by",
    icon: "Hand",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Greet someone, thank them, apologize, and say you do not understand.",
    blurb: "The phrases that get you through a first conversation without grammar.",
    grammar: ["politeness"],
    cardTypes: ["RECOGNITION", "PRODUCTION"],
    words: [
      ["Tere!", "Hello!", "PHRASE"],
      ["Tere hommikust!", "Good morning!", "PHRASE"],
      ["Head aega!", "Goodbye!", "PHRASE"],
      ["Nägemist!", "See you!", "PHRASE"],
      ["Aitäh!", "Thank you!", "PHRASE"],
      ["Palun", "Please / You're welcome", "PHRASE"],
      ["Vabandust!", "Sorry! / Excuse me!", "PHRASE"],
      ["Kuidas läheb?", "How's it going?", "PHRASE"],
      ["Ma ei saa aru", "I don't understand", "PHRASE"],
      ["Kas sa räägid inglise keelt?", "Do you speak English?", "PHRASE"],
      ["Ma õpin eesti keelt", "I am learning Estonian", "PHRASE"],
      ["Mis kell on?", "What time is it?", "PHRASE"],
      ["Kui palju see maksab?", "How much does it cost?", "PHRASE"],
      ["Mulle meeldib see", "I like it", "PHRASE"],
      ["Head isu!", "Enjoy your meal!", "PHRASE"],
      ["Palju õnne!", "Congratulations!", "PHRASE"],
      ["Mul on hea meel", "I'm glad", "PHRASE"],
      ["Ma ei tea veel", "I don't know yet", "PHRASE"],
    ],
  }),

  unit({
    id: "inimesed",
    title: "Inimesed",
    subtitle: "People and family",
    icon: "Users",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Say who is in your family and introduce the people around you.",
    blurb: "Who is in the room. Also your first gradation: sõber : sõbra.",
    grammar: ["nominative", "genitive", "gradation"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["tervitused"],
    words: [
      ["inimene", "person, human"],
      ["naine", "woman, wife"],
      ["mees", "man, husband"],
      ["laps", "child"],
      ["sõber", "friend"],
      ["ema", "mother"],
      ["isa", "father"],
      ["pere", "family"],
      ["vend", "brother"],
      ["õde", "sister"],
      ["tütar", "daughter"],
      ["poeg", "son"],
      ["vanaema", "grandmother", "NOUN"],
      ["vanaisa", "grandfather"],
      ["nimi", "name"],
      ["õpetaja", "teacher"],
      ["õpilane", "pupil, student"],
      ["arst", "doctor"],
    ],
  }),

  unit({
    id: "arvud",
    title: "Arvud",
    subtitle: "Numbers and counting",
    icon: "Hash",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Count, give your phone number, say a price and tell someone your age.",
    blurb: "Counting is where the partitive first bites: kaks raamatut, not kaks raamat. The teens end in -teist and the tens in -kümmend, and two of each is the whole pattern.",
    grammar: ["numerals", "partitive"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["inimesed"],
    words: [
      /*
        The can-do says "give your phone number, say a price and tell someone
        your age", and the list stopped at ten and then jumped to a hundred, so
        a teacher checking the unit against the promise on its own page finds
        the gap on the first screen. Zero, two teens and two tens is what a
        class actually teaches: the pattern is `-teist` and `-kümmend`, and
        somebody who has met two of each has met the rule. Each of these is a
        request rather than a fact, and the harvest drops and reports any that
        Ekilex will not confirm.
      */
      ["number", "number"],
      ["null", "zero"],
      ["üks", "one"],
      ["kaks", "two"],
      ["kolm", "three"],
      ["neli", "four"],
      ["viis", "five"],
      ["kuus", "six"],
      ["seitse", "seven"],
      ["kaheksa", "eight"],
      ["üheksa", "nine"],
      ["kümme", "ten"],
      ["üksteist", "eleven"],
      ["kaksteist", "twelve"],
      ["kakskümmend", "twenty"],
      ["kolmkümmend", "thirty"],
      ["vanus", "age"],
      ["sada", "hundred"],
      ["tuhat", "thousand"],
      ["esimene", "first", "ADJECTIVE"],
      ["teine", "second, other", "ADJECTIVE"],
      ["pool", "half"],
    ],
  }),

  unit({
    id: "kodu",
    title: "Kodu",
    subtitle: "Home and everyday objects",
    icon: "House",
    level: "A1",
    module: "Igapäevaelu",
    canDo: "Describe your home and say where things are in it.",
    blurb: "Things you can point at, the easiest place to meet the inessive (toas, köögis).",
    grammar: ["inessive", "nominative"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["inimesed"],
    words: [
      ["kodu", "home"],
      ["maja", "house"],
      ["tuba", "room"],
      ["köök", "kitchen"],
      ["korter", "flat, apartment"],
      ["uks", "door"],
      ["aken", "window"],
      ["laud", "table"],
      ["tool", "chair"],
      ["voodi", "bed"],
      ["raamat", "book"],
      ["arvuti", "computer"],
      ["telefon", "telephone"],
      ["võti", "key"],
      ["klaas", "glass"],
      ["tass", "cup"],
      ["pilt", "picture"],
      ["sein", "wall"],
      ["põrand", "floor"],
      ["korrus", "floor, story"],
    ],
  }),

  unit({
    id: "sook-ja-jook",
    title: "Söök ja jook",
    subtitle: "Food and drink",
    icon: "Utensils",
    level: "A1",
    module: "Igapäevaelu",
    canDo: "Order food, shop for groceries and say what you like to eat.",
    blurb: "Enough to order, shop and read a menu. The partitive lives here (ma joon kohvi).",
    grammar: ["partitive", "object"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["kodu"],
    words: [
      ["toit", "food"],
      ["söök", "food, a meal"],
      ["jook", "drink"],
      ["leib", "bread (dark)"],
      ["sai", "bread (white)"],
      ["kohv", "coffee"],
      ["vesi", "water"],
      ["piim", "milk"],
      ["mahl", "juice"],
      ["liha", "meat"],
      ["kala", "fish"],
      ["õun", "apple"],
      ["kartul", "potato"],
      ["juust", "cheese"],
      ["muna", "egg"],
      ["või", "butter"],
      ["sool", "salt"],
      ["suhkur", "sugar"],
      ["supp", "soup"],
    ],
  }),

  unit({
    id: "aeg",
    title: "Aeg",
    subtitle: "Days, hours and when things happen",
    icon: "Clock",
    level: "A1",
    module: "Igapäevaelu",
    canDo: "Tell the time, name the days, and say when something happens.",
    blurb: "Time words carry the adessive and elative constantly, hommikul, esmaspäevast.",
    grammar: ["adessive", "elative", "time-expressions"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["arvud"],
    words: [
      ["aeg", "time"],
      ["päev", "day"],
      ["öö", "night"],
      ["hommik", "morning"],
      ["õhtu", "evening"],
      ["nädal", "week"],
      ["kuu", "month, moon"],
      ["aasta", "year"],
      ["tund", "hour, lesson"],
      ["minut", "minute"],
      ["kell", "clock, o'clock"],
      ["esmaspäev", "Monday"],
      ["teisipäev", "Tuesday"],
      ["kolmapäev", "Wednesday"],
      ["neljapäev", "Thursday"],
      ["reede", "Friday"],
      ["laupäev", "Saturday"],
      ["pühapäev", "Sunday"],
      ["kellaaeg", "time of day"],
    ],
  }),

  unit({
    id: "pohiverbid",
    title: "Põhiverbid",
    subtitle: "The irregular core",
    icon: "Zap",
    level: "A1",
    module: "Tegevused",
    canDo: "Build a simple sentence in the present tense about what you do.",
    blurb: "Verbs that break the rules and are used constantly. Learn these as forms, not patterns.",
    grammar: ["present-tense", "olema", "negation"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CONJUGATION", "CLOZE"],
    requires: ["kodu"],
    words: [
      ["olema", "to be"],
      ["minema", "to go"],
      ["tulema", "to come"],
      ["tegema", "to do, to make"],
      ["saama", "to get, to become"],
      ["pidama", "to have to, must", "VERB", 216079],
      ["sööma", "to eat"],
      ["jooma", "to drink"],
      ["tooma", "to bring"],
      // Not "to take away": in English that means to remove, and Ekilex's own
      // definition and all three stored sentences are about taking somebody or
      // something somewhere ("Isa viis hommikul lapsed kooli"). The unit pairs
      // it with tooma, which is the other direction of the same act, and "take
      // away" points a beginner at ära viima instead.
      ["viima", "to take (somewhere), to carry"],
      ["andma", "to give"],
      ["võtma", "to take"],
      ["panema", "to put"],
      ["jääma", "to stay, to remain"],
    ],
  }),

  unit({
    id: "iga-paev",
    title: "Iga päev",
    subtitle: "Everyday actions",
    icon: "Footprints",
    level: "A1",
    module: "Tegevused",
    canDo: "Describe your daily routine from waking up to going to bed.",
    blurb: "What you do all day, in the two infinitives Estonian actually uses.",
    grammar: ["present-tense", "infinitives"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CONJUGATION", "CLOZE"],
    requires: ["pohiverbid"],
    words: [
      ["tahtma", "to want"],
      ["teadma", "to know (a fact)"],
      ["tundma", "to know (a person), to feel"],
      ["nägema", "to see"],
      ["kuulma", "to hear"],
      ["rääkima", "to speak"],
      ["ütlema", "to say"],
      ["küsima", "to ask"],
      ["vastama", "to answer"],
      ["lugema", "to read, to count"],
      ["kirjutama", "to write"],
      ["õppima", "to learn, to study"],
      ["töötama", "to work"],
      ["elama", "to live"],
      ["magama", "to sleep"],
      ["ärkama", "to wake up"],
      ["istuma", "to sit"],
      ["seisma", "to stand"],
    ],
  }),

  unit({
    id: "omadussonad",
    title: "Omadussõnad",
    subtitle: "Describing things",
    icon: "Palette",
    level: "A1",
    module: "Kirjeldamine",
    canDo: "Describe a thing or a person with an adjective that agrees with it.",
    blurb: "Adjectives agree with their noun in Estonian, so every one you learn pays for itself.",
    grammar: ["adjective-agreement", "nominative"],
    /*
      NO CASE CARD, AND THE ADJECTIVES ARE WHERE THAT RULE BITES FIRST.

      A case card is now built out of a sentence a lexicographer recorded using
      that very case, and not one of this unit's twenty adjectives has one: the
      usages under `kallis` are `Tere, kallis!`, `Kallid sõbrad!` and
      `Kallis taevas!`, which are the word in the nominative three times. It is
      the only unit in the course that loses the type, which is the right place
      for it to be lost, because an adjective in isolation is the emptiest
      version of the question — the whole point of this unit's own `canDo` is
      that an adjective agrees with *its noun*, and a bare `suur → millesse?`
      is that noun taken away. Agreement is taught on the grammar pages this
      unit links to and met in its gap-fill cards, which is the answer `objekt`
      already got when it asked for a card its verbs could not make.
    */
    cardTypes: ["RECOGNITION", "PRODUCTION", "CLOZE"],
    requires: ["kodu"],
    words: [
      ["suur", "big, large", "ADJECTIVE"],
      ["väike", "small", "ADJECTIVE"],
      ["hea", "good", "ADJECTIVE"],
      ["halb", "bad", "ADJECTIVE"],
      ["uus", "new", "ADJECTIVE"],
      ["vana", "old", "ADJECTIVE"],
      ["noor", "young", "ADJECTIVE"],
      ["pikk", "long, tall", "ADJECTIVE"],
      ["lühike", "short", "ADJECTIVE"],
      ["kiire", "fast, quick", "ADJECTIVE"],
      ["aeglane", "slow", "ADJECTIVE"],
      ["kallis", "expensive, dear", "ADJECTIVE"],
      ["odav", "cheap", "ADJECTIVE"],
      ["ilus", "beautiful", "ADJECTIVE"],
      ["tore", "nice, lovely", "ADJECTIVE"],
      ["raske", "difficult, heavy", "ADJECTIVE"],
      ["kerge", "easy, light", "ADJECTIVE"],
      ["lihtne", "simple", "ADJECTIVE"],
      ["valmis", "ready", "ADJECTIVE"],
    ],
  }),

  unit({
    id: "varvid",
    title: "Värvid",
    subtitle: "Colors",
    icon: "Paintbrush",
    level: "A1",
    module: "Kirjeldamine",
    canDo: "Name colors and describe what something looks like.",
    blurb: "Short, concrete, and every one of them declines like an ordinary adjective.",
    grammar: ["adjective-agreement"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["omadussonad"],
    words: [
      ["värv", "color"],
      ["punane", "red", "ADJECTIVE"],
      ["sinine", "blue", "ADJECTIVE"],
      ["roheline", "green", "ADJECTIVE"],
      ["kollane", "yellow", "ADJECTIVE"],
      ["must", "black", "ADJECTIVE"],
      ["valge", "white", "ADJECTIVE"],
      ["hall", "gray", "ADJECTIVE"],
      ["pruun", "brown", "ADJECTIVE"],
      ["roosa", "pink", "ADJECTIVE"],
      ["lilla", "purple", "ADJECTIVE"],
      ["hele", "light, pale", "ADJECTIVE"],
      ["tume", "dark", "ADJECTIVE"],
    ],
  }),

  unit({
    id: "riided",
    title: "Riided",
    subtitle: "Clothes and what you wear",
    icon: "Shirt",
    level: "A1",
    module: "Kirjeldamine",
    canDo: "Say what you are wearing and shop for clothes by size and color.",
    blurb: "A shop conversation you will have in your first week, and a pile of easy nouns.",
    grammar: ["adjective-agreement", "partitive"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["varvid"],
    words: [
      ["särk", "shirt"],
      ["kleit", "dress"],
      ["seelik", "skirt"],
      ["king", "shoe"],
      ["sokk", "sock"],
      ["müts", "hat"],
      ["mantel", "coat"],
      ["jope", "jacket"],
      ["sall", "scarf"],
      ["kinnas", "glove"],
      ["taskurätik", "handkerchief"],
      ["vöö", "belt"],
      ["riie", "cloth, fabric"],
      /*
        "Shop for clothes by size" needs a word for size and a word for
        trousers, and this unit had neither: it taught a handkerchief and a
        belt, which Ekilex rates B1, and left out the two garments a beginner
        buys first. Requests, checked by the harvest like every other lemma.
      */
      ["suurus", "size"],
      ["püksid", "trousers"],
      ["kampsun", "jumper, sweater"],
      ["saabas", "boot"],
    ],
  }),

  unit({
    id: "ilm",
    title: "Ilm",
    subtitle: "Weather",
    icon: "CloudSun",
    level: "A1",
    module: "Maailm ümber",
    canDo: "Talk about the weather, which in Estonia is never small talk for long.",
    blurb: "Half of every Estonian conversation opens here, and the vocabulary is tiny.",
    grammar: ["olema", "adjective-agreement"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["omadussonad"],
    words: [
      ["ilm", "weather"],
      ["päike", "sun"],
      ["vihm", "rain"],
      ["lumi", "snow"],
      ["tuul", "wind"],
      ["pilv", "cloud"],
      ["torm", "storm"],
      ["jää", "ice"],
      ["udu", "fog"],
      ["kraad", "degree"],
      ["külm", "cold", "ADJECTIVE"],
      ["soe", "warm", "ADJECTIVE"],
      ["kuum", "hot", "ADJECTIVE"],
      ["märg", "wet", "ADJECTIVE"],
      ["kuiv", "dry", "ADJECTIVE"],
    ],
  }),

  unit({
    id: "ostmine",
    title: "Poes ja tänaval",
    subtitle: "Shopping and getting around",
    icon: "ShoppingBag",
    level: "A1",
    module: "Maailm ümber",
    canDo: "Buy something, ask the price, and find your way to a place in town.",
    blurb: "Buying, paying, going. Verbs and places together, because that is how they turn up.",
    grammar: ["partitive", "illative", "allative"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["sook-ja-jook", "arvud"],
    words: [
      ["pood", "shop"],
      ["turg", "market"],
      ["raha", "money"],
      ["hind", "price"],
      ["pilet", "ticket"],
      ["ostma", "to buy"],
      ["müüma", "to sell"],
      ["maksma", "to pay, to cost"],
      ["linn", "town, city"],
      ["tänav", "street"],
      ["tee", "road, tea"],
      ["buss", "bus"],
      ["rong", "train"],
      ["auto", "car"],
      ["jaam", "station"],
      ["park", "park"],
    ],
  }),

  unit({
    id: "kus-ja-kuhu",
    title: "Kus ja kuhu",
    subtitle: "Places and directions",
    icon: "Map",
    level: "A1",
    module: "Maailm ümber",
    canDo: "Ask where something is and understand the directions you are given.",
    blurb: "Estonian answers 'where' and 'where to' with different cases. This is that split.",
    grammar: ["inessive", "illative", "elative", "allative", "adessive", "ablative"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["ostmine", "kodu"],
    words: [
      ["koht", "place"],
      ["kesklinn", "town center"],
      ["väljak", "square"],
      ["sild", "bridge"],
      ["nurk", "corner"],
      ["kool", "school"],
      ["töö", "work"],
      ["haigla", "hospital"],
      ["kirik", "church"],
      ["rand", "beach"],
      ["ülikool", "university"],
      ["kohvik", "café"],
      ["restoran", "restaurant"],
      ["hotell", "hotel"],
      /*
        The can-do promises "understand the directions you are given", and
        neither this unit nor Kohasõnad had a word for left, right or straight
        on. Somebody who has met every building in the town center and cannot
        follow "vasakule, siis otse" has not been taught to follow directions.
        Requests, like every other lemma here.
      */
      ["vasak", "left", "ADJECTIVE"],
      /*
        The adverbs, not the adjective, because that is what a direction is
        given with: "vasakul, siis otse". `parem` was requested first and came
        back as Ekilex 213895, whose note and all four sentences are the
        comparative of `hea`, better: the homonym fault this whole pass is
        about, made while fixing it. `paremal` has no such twin.
      */
      ["vasakul", "on the left", "ADVERB"],
      ["paremal", "on the right", "ADVERB"],
      ["otse", "straight on", "ADVERB"],
      ["edasi", "onwards, further", "ADVERB"],
      ["tagasi", "back", "ADVERB"],
      ["asuma", "to be located"],
      ["mujal", "elsewhere", "ADVERB"],
      ["siia", "to here", "ADVERB"],
    ],
  }),

  /*
    THE WORDS EVERY SENTENCE IS MADE OF, WHICH THE COURSE HAD LEFT OUT.

    Fourteen units of nouns, verbs and adjectives, and no unit for the words
    between them: nobody asking "kes?" or "millal?" or looking up "täna" or
    "peal" found anything, and two of the twelve months were missing from the
    dictionary altogether. These six are appended after the fourteen so that
    the first three units at A1, which is what first run builds a deck from,
    stay what they were. Every lemma is still a request the harvest either
    honors or reports, and a pronoun is harvested as a nominal because it
    declines like one: `kes`, `kelle`, `keda`, and the case table follows.
  */
  unit({
    id: "kusisonad",
    title: "Küsisõnad",
    subtitle: "Question words",
    icon: "CircleHelp",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Ask who, what, where, when, why and how, and follow the question when it comes back.",
    blurb: "Every conversation is a question first. These are the words it starts with.",
    grammar: ["word-order"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["tervitused"],
    words: [
      ["kes", "who", "PRONOUN"],
      ["mis", "what", "PRONOUN"],
      ["kus", "where", "ADVERB"],
      ["kuhu", "where to", "ADVERB"],
      ["kust", "where from", "ADVERB"],
      ["millal", "when", "ADVERB"],
      ["miks", "why", "ADVERB"],
      ["kuidas", "how", "ADVERB"],
      ["kas", "whether (opens a yes or no question)", "ADVERB"],
      ["milline", "which, what kind of", "PRONOUN"],
      ["kumb", "which of the two", "PRONOUN"],
      ["mitu", "how many", "PRONOUN"],
      ["palju", "much, many, a lot", "ADVERB"],
      ["kui", "how, as, if, than", "ADVERB"],
    ],
  }),

  unit({
    id: "asesonad",
    title: "Asesõnad",
    subtitle: "Pronouns",
    icon: "Users",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Say I, you, he, we and they, point at this and that, and put each in the case the sentence needs.",
    blurb: "Six persons and a pointer. They decline like nouns, and the short forms are what you hear.",
    grammar: ["nominative", "genitive", "partitive"],
    // No case cards from the seed alone: a pronoun's everyday case forms are
    // the short ones (`mulle`, `mul`), which no rule over the genitive reaches,
    // and a card answering `minule` would mark the form everybody says wrong.
    // Ekilex records both, so an enriched entry shows the pair on its table.
    cardTypes: ["RECOGNITION", "PRODUCTION", "CLOZE"],
    requires: ["inimesed"],
    words: [
      ["mina", "I", "PRONOUN"],
      ["sina", "you (one person)", "PRONOUN"],
      ["tema", "he, she", "PRONOUN"],
      ["meie", "we", "PRONOUN"],
      ["teie", "you (several people, or one politely)", "PRONOUN"],
      ["nemad", "they", "PRONOUN"],
      ["see", "this, it", "PRONOUN"],
      ["too", "that (one over there)", "PRONOUN"],
      ["ise", "self, myself, yourself", "PRONOUN"],
      ["keegi", "somebody, anybody", "PRONOUN"],
      ["miski", "something, anything", "PRONOUN"],
      ["kõik", "all, everything, everybody", "PRONOUN"],
      ["igaüks", "everyone, each one", "PRONOUN"],
      ["mõni", "some, a few", "PRONOUN"],
      ["iga", "every, each", "PRONOUN", 171378],
      // Three Ekilex entries carry this; 211037 is the possessive.
      ["oma", "one's own", "PRONOUN", 211037],
    ],
  }),

  unit({
    id: "millal",
    title: "Millal ja kui tihti",
    subtitle: "When, and how often",
    icon: "Clock",
    level: "A1",
    module: "Igapäevaelu",
    canDo: "Say when something happens and how often, from today to hardly ever.",
    blurb: "No case endings at all: twenty adverbs that carry half of every plan.",
    grammar: ["time-expressions"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CLOZE"],
    requires: ["aeg"],
    words: [
      ["täna", "today", "ADVERB"],
      ["homme", "tomorrow", "ADVERB"],
      ["eile", "yesterday", "ADVERB"],
      ["ülehomme", "the day after tomorrow", "ADVERB"],
      ["üleeile", "the day before yesterday", "ADVERB"],
      ["nüüd", "now", "ADVERB"],
      ["praegu", "right now, at the moment", "ADVERB"],
      ["kohe", "at once, straight away", "ADVERB"],
      ["varsti", "soon", "ADVERB"],
      ["hiljem", "later", "ADVERB"],
      ["alati", "always", "ADVERB"],
      ["tihti", "often", "ADVERB"],
      ["sageli", "often, frequently", "ADVERB"],
      ["harva", "rarely, seldom", "ADVERB"],
      ["mõnikord", "sometimes", "ADVERB"],
      ["kunagi", "ever, at some time; never (with a negative)", "ADVERB"],
      ["juba", "already", "ADVERB"],
      ["veel", "still, yet, more", "ADVERB"],
      ["jälle", "again", "ADVERB"],
      ["ammu", "long ago, for a long time", "ADVERB"],
    ],
  }),

  unit({
    id: "kohasonad",
    title: "Peal, all, ees, taga",
    subtitle: "Where things are",
    icon: "Compass",
    level: "A1",
    module: "Maailm ümber",
    canDo: "Say what is on, under, in front of, behind and next to what.",
    blurb: "Most of these come after the noun and put it in the genitive: laua peal, not peal laud. A few go in front and ask for another case, and this unit has both.",
    /*
      All four cases this unit's twenty words actually take, not the two it
      used to name. Fifteen of them take the genitive; koos takes the
      comitative, ilma the abessive, and enne, pärast and mööda the partitive.
      A beginner following a unit that named only the genitive writes "ilma
      raha" and "koos sõbra", and the app's own dictionary contradicts the
      unit on the rektsioon of the very words it links to. Each id resolves to
      a case page through `grammarPoint`, so the chips say the Estonian name
      and the question it answers.
    */
    grammar: ["genitive", "adessive", "partitive", "comitative", "abessive"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CLOZE"],
    requires: ["kus-ja-kuhu"],
    words: [
      ["peal", "on, on top of", "ADVERB"],
      ["all", "under, below", "ADVERB"],
      ["ees", "in front of", "ADVERB"],
      ["taga", "behind", "ADVERB"],
      ["kõrval", "next to, beside", "ADVERB"],
      ["juures", "at, by, with (a person or a place)", "ADVERB"],
      ["vahel", "between", "ADVERB"],
      ["sees", "inside", "ADVERB"],
      ["keskel", "in the middle of", "ADVERB"],
      ["vastas", "opposite", "ADVERB"],
      ["ümber", "around", "ADVERB"],
      ["üle", "over, across", "ADVERB"],
      ["läbi", "through", "ADVERB"],
      ["koos", "together with", "ADVERB"],
      ["ilma", "without", "ADVERB"],
      ["enne", "before", "ADVERB"],
      ["pärast", "after", "ADVERB"],
      ["lähedal", "near, close to", "ADVERB"],
      ["kohal", "above, over", "ADVERB"],
      ["mööda", "along", "ADVERB"],
      ["alates", "from, starting from", "ADVERB"],
      ["kaasas", "along, with you", "ADVERB"],
    ],
  }),

  unit({
    id: "kuud",
    title: "Kuud ja tähtpäevad",
    subtitle: "Months and the days that matter",
    icon: "CalendarRange",
    level: "A1",
    module: "Igapäevaelu",
    canDo: "Name the months, give a date, and say when your birthday is.",
    blurb: "Twelve months, all in the inessive when something happens in them: jaanuaris, mais.",
    grammar: ["inessive", "time-expressions"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["aeg"],
    words: [
      ["jaanuar", "January"],
      ["veebruar", "February"],
      ["märts", "March"],
      ["aprill", "April"],
      ["mai", "May"],
      ["juuni", "June"],
      ["juuli", "July"],
      ["august", "August"],
      ["september", "September"],
      ["oktoober", "October"],
      ["november", "November"],
      ["detsember", "December"],
      ["kuupäev", "date"],
      ["sünnipäev", "birthday"],
      ["tähtpäev", "anniversary, special day"],
      ["jaanipäev", "Midsummer Day"],
      ["nädalavahetus", "weekend"],
      ["puhkepäev", "day off"],
    ],
  }),

  unit({
    id: "riigid",
    title: "Riigid ja rahvad",
    subtitle: "Countries and peoples",
    icon: "Landmark",
    level: "A1",
    module: "Maailm ümber",
    canDo: "Say where you are from, what you are, and which language you speak.",
    blurb: "The neighbors first. A nationality ends in -lane. Eesti and Soome take the inside cases, Eestist; the countries ending in -maa take the outside ones, the way the islands do: Saksamaal, Saksamaale, Saksamaalt.",
    grammar: ["elative", "nominative"],
    cardTypes: ["RECOGNITION", "PRODUCTION", "CASE_FORM", "CLOZE"],
    requires: ["kus-ja-kuhu"],
    words: [
      ["Eesti", "Estonia"],
      ["Soome", "Finland"],
      ["Läti", "Latvia"],
      ["Venemaa", "Russia"],
      ["Rootsi", "Sweden"],
      ["Saksamaa", "Germany"],
      ["Inglismaa", "England"],
      ["Ameerika", "America"],
      ["Euroopa", "Europe"],
      ["eestlane", "an Estonian"],
      ["soomlane", "a Finn"],
      ["lätlane", "a Latvian"],
      ["venelane", "a Russian"],
      ["rootslane", "a Swede"],
      ["sakslane", "a German"],
      ["inglane", "an English person"],
      ["ameeriklane", "an American"],
      ["välismaalane", "foreigner"],
      ["kodumaa", "homeland"],
      ["rahvus", "nationality"],
    ],
  }),

  /*
    THE WORDS BETWEEN THE WORDS, PART TWO.

    Six units were appended here for the words every sentence is made of, and
    a frequency count over a large corpus of film and television subtitles
    said the job was half done: of the four hundred commonest words in
    Estonian, a hundred and twenty-five were ones the dictionary could not
    vouch for in any form, and the top of that list is not exotic. It is `ja`,
    `et`, `aga`, `jah`, `ei`, `ka`, `siis`, `nii` and `väga`: the words that
    hold a sentence together, which a learner meets in their first hour and
    could not look up.

    They are labeled ADVERB for the reason `scripts/harvest-ekilex.ts`
    already gives about the connectives it had: an Estonian adverb does not
    inflect, so demanding a set of forms for one would drop every connective
    in the course, and existing in Ekilex is the whole check that matters.
    The label is a bucket saying which card types a word can take rather than
    a claim that `ja` is an adverb, which is the same latitude `kas` has been
    taking in the question words unit since it was written.

    Three units rather than one, because sixty words in a row is a list
    nobody works through, and because these are three different jobs: joining
    two clauses, answering somebody, and saying how much.
  */
  unit({
    id: "sidesonad",
    title: "Sidesõnad",
    subtitle: "Joining two thoughts",
    icon: "Link",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Join two clauses, give a reason, and set one thing against another.",
    blurb: "Estonian puts a comma before et, sest, kui and kes, always, even where English would not.",
    grammar: ["word-order"],
    cardTypes: ["RECOGNITION", "PRODUCTION"],
    requires: ["tervitused"],
    words: [
      ["ja", "and", "ADVERB"],
      ["ning", "and (joining the last of a list)", "ADVERB"],
      // Also a noun meaning a troubling circumstance, and a district in Russia.
      ["aga", "but", "ADVERB", 155181],
      ["vaid", "only, and nothing else", "ADVERB"],
      // Also the ISO code for Estonian, which Ekilex holds as a word.
      ["et", "that", "ADVERB", 165201],
      ["sest", "because", "ADVERB"],
      ["kuna", "since, because", "ADVERB"],
      ["ega", "nor", "ADVERB"],
      // The conjunction, not the butter the food unit already teaches.
      ["või", "or", "ADVERB", 258019],
      ["ehk", "perhaps, maybe", "ADVERB"],
      ["kuni", "until", "ADVERB"],
      ["nagu", "like, as", "ADVERB"],
      ["sellepärast", "for that reason", "ADVERB"],
      ["seega", "so, therefore", "ADVERB"],
      ["siis", "then", "ADVERB"],
      ["nii", "so, like this", "ADVERB"],
      ["mitte", "not", "ADVERB", 203249],
    ],
  }),

  unit({
    id: "vastused",
    title: "Vastused",
    subtitle: "Yes, no and everything between",
    icon: "MessageCircle",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Answer a question, agree, disagree, and say how sure you are.",
    blurb: "Estonian answers a negative question with jah for yes, where English hesitates over which one it means.",
    grammar: ["politeness"],
    cardTypes: ["RECOGNITION", "PRODUCTION"],
    requires: ["tervitused"],
    words: [
      ["jah", "yes", "ADVERB"],
      ["ei", "no, not", "ADVERB"],
      ["muidugi", "of course", "ADVERB"],
      ["kindlasti", "definitely", "ADVERB"],
      ["vist", "probably, I think", "ADVERB"],
      ["äkki", "maybe, suddenly", "ADVERB"],
      ["küll", "indeed, do (an emphasizing word)", "ADVERB", 191080],
      ["eks", "right? (asking for agreement)", "ADVERB"],
      ["tõesti", "really", "ADVERB"],
      ["tegelikult", "actually", "ADVERB"],
      // An adjective, not a particle, and the one word in this unit that
      // declines: `õige, õige, õiget`. Labeled ADVERB it would be harvested
      // formless, get no case table and no case cards, and `npm run
      // audit:senses` says so, because Ekilex calls it `adj`.
      ["õige", "right, correct", "ADJECTIVE"],
      ["tere", "hello", "ADVERB"],
      ["aitäh", "thank you", "ADVERB"],
    ],
  }),

  unit({
    id: "maaramine",
    title: "Kui palju",
    subtitle: "How much, how often, how far",
    icon: "Gauge",
    level: "A1",
    module: "Esimesed sammud",
    canDo: "Say how much of something there is, and how strongly you mean it.",
    blurb: "These are the words that change a sentence without changing a single ending.",
    grammar: ["word-order"],
    cardTypes: ["RECOGNITION", "PRODUCTION"],
    requires: ["tervitused"],
    words: [
      ["ka", "also, too", "ADVERB"],
      ["ju", "you know (a softening word)", "ADVERB"],
      ["just", "just, exactly", "ADVERB"],
      ["väga", "very", "ADVERB"],
      ["hästi", "well", "ADVERB"],
      ["ainult", "only", "ADVERB"],
      ["enam", "any more", "ADVERB", 164013],
      ["isegi", "even", "ADVERB"],
      ["ikka", "still, always", "ADVERB"],
      ["rohkem", "more", "ADVERB", 228501],
      // Not the sports league.
      ["liiga", "too (much)", "ADVERB", 194792],
      ["päris", "quite, fairly", "ADVERB"],
      ["natuke", "a little", "ADVERB"],
      ["üldse", "at all", "ADVERB"],
      ["eriti", "especially", "ADVERB"],
      ["sama", "the same", "ADVERB"],
      ["uuesti", "again", "ADVERB"],
      ["varem", "earlier", "ADVERB"],
      ["kaua", "for a long time", "ADVERB"],
      // Not the steel rail a curtain runs along.
      ["siin", "here", "ADVERB", 233338],
      ["siit", "from here", "ADVERB"],
      ["sinna", "to there", "ADVERB"],
    ],
  }),
] as const;
