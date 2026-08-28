# Data Model

Prisma schema. v4.0 specified none (audit C3), which is why its `+ Add to Deck` bridge had no
defined destination. Written to be Postgres-portable per ADR-002: no SQLite-specific types, string
UUID primary keys, UTC timestamps.

`Lexeme` is the hub. Tasks, cards, tutor messages and imports all reference it — the structural
expression of "the word is the unit" (`01-product-spec.md` §2) and the fix for audit gap D4.

```prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "sqlite"; url = env("DATABASE_URL") }

// ─────────────────────────── Vocabulary core ───────────────────────────

model Lexeme {
  id            String   @id @default(uuid())
  lemma         String                     // citation form: nominative sg / ma-infinitive
  pos           PartOfSpeech
  ekilexWordId  Int?     @unique           // null for user-created entries
  cefr          String?                    // A1..C1 where Ekilex supplies it
  gradation     Gradation @default(NONE)
  gradationNote String?                    // e.g. "b : ∅ (tuba : toa)"
  provenance    Provenance @default(EKILEX)
  fetchedAt     DateTime?                  // cache freshness for Ekilex-sourced entries
  classWeek     Int?                       // ties vocabulary to the syllabus
  notes         String?

  forms        Form[]
  senses       Sense[]
  examples     Example[]
  governs      Government[]
  cards        Card[]
  tasks        TaskLexeme[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([lemma])
  @@index([classWeek])
}

/// One inflected form. Principal parts carry isPrincipal = true; derived forms are
/// computed at render time and are NOT stored, so a stem correction can never leave
/// stale derivations behind.
model Form {
  id          String   @id @default(uuid())
  lexemeId    String
  lexeme      Lexeme   @relation(fields: [lexemeId], references: [id], onDelete: Cascade)
  formType    FormType
  value       String
  isPrincipal Boolean  @default(false)
  provenance  Provenance @default(EKILEX)
  audioId     String?
  audio       AudioClip? @relation(fields: [audioId], references: [id])

  @@unique([lexemeId, formType])
  @@index([lexemeId])
}

model Sense {
  id           String  @id @default(uuid())
  lexemeId     String
  lexeme       Lexeme  @relation(fields: [lexemeId], references: [id], onDelete: Cascade)
  definitionEt String?
  translationEn String
  orderIndex   Int     @default(0)
}

model Example {
  id         String  @id @default(uuid())
  lexemeId   String
  lexeme     Lexeme  @relation(fields: [lexemeId], references: [id], onDelete: Cascade)
  et         String
  en         String?
  provenance Provenance @default(EKILEX)   // AI-sourced examples are visibly flagged
  audioId    String?
  audio      AudioClip? @relation(fields: [audioId], references: [id])
}

/// Verb case government (rektsioon) — see 02-estonian-domain.md §4.
model Government {
  id          String     @id @default(uuid())
  lexemeId    String
  lexeme      Lexeme     @relation(fields: [lexemeId], references: [id], onDelete: Cascade)
  grammCase   GrammCase
  preposition String?
  example     String
  gloss       String?
}

// ─────────────────────────── Spaced repetition ─────────────────────────

model Card {
  id         String   @id @default(uuid())
  lexemeId   String?
  lexeme     Lexeme?  @relation(fields: [lexemeId], references: [id], onDelete: SetNull)
  cardType   CardType
  front      String
  back       String
  hint       String?
  targetCase GrammCase?                   // for CASE_FORM cloze cards
  audioId    String?
  audio      AudioClip? @relation(fields: [audioId], references: [id])
  source     CardSource @default(MANUAL)
  suspended  Boolean  @default(false)

  // FSRS scheduling state (ts-fsrs) — ADR-003
  due        DateTime @default(now())
  stability  Float    @default(0)
  difficulty Float    @default(0)
  elapsedDays Int     @default(0)
  scheduledDays Int   @default(0)
  reps       Int      @default(0)
  lapses     Int      @default(0)
  state      FsrsState @default(NEW)
  lastReview DateTime?

  reviews    Review[]
  deckId     String?
  deck       Deck?    @relation(fields: [deckId], references: [id], onDelete: SetNull)
  createdAt  DateTime @default(now())

  @@index([due, suspended])               // the hot query: "what is due now"
  @@index([deckId])
}

model Deck {
  id        String @id @default(uuid())
  name      String @unique
  classWeek Int?
  cards     Card[]
  createdAt DateTime @default(now())
}

/// Append-only. Never updated, never deleted — this is the irreplaceable data
/// (01-product-spec.md §2.5) and the input to future FSRS parameter optimisation.
model Review {
  id           String   @id @default(uuid())
  cardId       String
  card         Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  rating       Int      // 1 Again · 2 Hard · 3 Good · 4 Easy
  reviewedAt   DateTime @default(now())
  durationMs   Int
  stateBefore  FsrsState
  scheduledDays Int
  targetCase   GrammCase?                 // powers the weak-case heatmap
  @@index([reviewedAt])
  @@index([cardId])
}

// ─────────────────────────── Tasks & calendar ──────────────────────────

model Task {
  id        String   @id @default(uuid())
  title     String
  notes     String?
  tag       TaskTag
  customTag String?
  classWeek Int?
  dueAt     DateTime?
  completed Boolean  @default(false)
  completedAt DateTime?
  lexemes   TaskLexeme[]
  createdAt DateTime @default(now())
  @@index([dueAt, completed])
  @@index([classWeek])
}

model TaskLexeme {
  taskId   String
  lexemeId String
  task     Task   @relation(fields: [taskId],   references: [id], onDelete: Cascade)
  lexeme   Lexeme @relation(fields: [lexemeId], references: [id], onDelete: Cascade)
  @@id([taskId, lexemeId])
}

model CalendarFeed {
  id         String   @id @default(uuid())
  name       String
  url        String
  enabled    Boolean  @default(true)
  lastSyncAt DateTime?
  lastError  String?                      // per-feed failure, surfaced in the UI
  events     CalendarEvent[]
}

model CalendarEvent {
  id        String   @id @default(uuid())
  feedId    String
  feed      CalendarFeed @relation(fields: [feedId], references: [id], onDelete: Cascade)
  uid       String
  summary   String
  startsAt  DateTime
  endsAt    DateTime?
  allDay    Boolean @default(false)
  @@unique([feedId, uid])
  @@index([startsAt])
}

// ─────────────────────────── Tutor & media ─────────────────────────────

model Conversation {
  id        String @id @default(uuid())
  title     String
  messages  Message[]
  createdAt DateTime @default(now())
}

model Message {
  id             String @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String       // "user" | "assistant"
  content        String
  inputTokens    Int?
  outputTokens   Int?
  cacheReadTokens Int?        // proves prompt caching is working (06-anu-tutor.md §6)
  costUsd        Float?
  createdAt      DateTime @default(now())
}

/// Daily spend ledger backing the budget cap — audit C5.
model UsageDay {
  date        String @id      // YYYY-MM-DD
  inputTokens Int    @default(0)
  outputTokens Int   @default(0)
  costUsd     Float  @default(0)
  requests    Int    @default(0)
}

/// Cached TTS. A word's pronunciation never changes, so these are cached
/// indefinitely and keyed by content hash — see 05-integrations.md §2.
model AudioClip {
  id        String @id @default(uuid())
  textHash  String @unique   // sha256(text + speaker + speed)
  text      String
  speaker   String
  path      String           // file on disk under .data/audio/
  bytes     Int
  createdAt DateTime @default(now())
  forms     Form[]
  examples  Example[]
  cards     Card[]
}

model Setting {
  key   String @id
  value String                // JSON blob: CEFR level, target retention, daily cap, TTS speaker
}

// ─────────────────────────── Enums ─────────────────────────────────────

enum PartOfSpeech { NOUN VERB ADJECTIVE ADVERB PRONOUN NUMERAL PARTICLE PHRASE OTHER }
enum Gradation    { NONE QUANTITATIVE QUALITATIVE }
enum Provenance   { EKILEX DERIVED AI USER }

enum FormType {
  NOM_SG GEN_SG PART_SG ILL_SG_SHORT PART_PL     // noun principal parts (5)
  INF_MA INF_DA PRES_1SG PAST_1SG PART_TUD       // verb principal parts (5)
  OTHER
}

enum GrammCase {
  NOMINATIVE GENITIVE PARTITIVE ILLATIVE INESSIVE ELATIVE
  ALLATIVE ADESSIVE ABLATIVE TRANSLATIVE TERMINATIVE
  ESSIVE ABESSIVE COMITATIVE
}

enum CardType {
  RECOGNITION      // et → en
  PRODUCTION       // en → et
  CASE_FORM        // cloze: produce a named case form
  GRADATION        // strong ↔ weak grade
  GOVERNMENT       // which case does this verb take
  LISTENING        // audio → meaning
  OBJECT_CASE      // total vs partial object minimal pair
}

enum CardSource { MANUAL DICTIONARY TUTOR IMPORT }
enum FsrsState  { NEW LEARNING REVIEW RELEARNING }
enum TaskTag    { GRAMMAR HOMEWORK VOCABULARY SPEAKLY_GOAL LISTENING CUSTOM }
```

## Notes on three deliberate choices

**Derived forms are not stored.** Only principal parts live in `Form` — five per lexeme, drawn
from the ten `FormType` values (five noun, five verb). The ten derived cases
are computed at render time from the genitive stem. Storing them would create a second source of
truth that goes stale the moment a stem is corrected.

**`Review` is append-only.** No update path, no delete path. It is the one table whose loss cannot
be recovered by re-fetching from anywhere, and it is the input to future FSRS optimisation.

**`AudioClip` is content-addressed** by `sha256(text + speaker + speed)`, so the same word requested
from a dictionary entry and from a flashcard hits one cached file.
