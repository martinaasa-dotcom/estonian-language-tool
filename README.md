# Kodukeel. Estonian learning dashboard

*Kodukeel*, "home language". An Estonian study workspace built around the thing that actually makes
the language hard: the cases. A dictionary that answers with the whole paradigm, a course you can
work through, flashcards scheduled by FSRS, seven practice modes, a grammar reference written in
English, printable worksheets for a real class, a mock of the state language examination at every
level, and a tutor that is never allowed to invent an Estonian form.

> **Status: usable by someone who is not you.** First run walks a new learner through a setup wizard
> and builds them a real deck; the daily loop, path, review, practice, progress, is complete, works
> on a phone, installs as an app and keeps working with the network off. Built from the plan in
> `docs/`; `docs/13-mvp-status.md` says what is in and what is deliberately not.

It runs locally or hosted. Hosted, it uses Google sign-in and each account keeps its own deck; what
is stored and what leaves the site is on the privacy page, written from the schema rather than from
a template. AI spending is metered per person per day with a global cap, because sign-up is open.

## Running it

You need [Node.js](https://nodejs.org) 20 or newer and a Postgres database.

```bash
npm install       # fetches the libraries
npm run setup     # writes .env, creates the schema, loads the built-in dictionary
npm run dev       # starts the app
```

Open **http://localhost:3000** and the setup wizard takes it from there.

`DATABASE_URL` and `DIRECT_URL` in `.env` are the only settings that are not optional. Any Postgres
will do, a local one, or the free tier of [supabase.com](https://supabase.com).

**Sign-in is optional.** With no Supabase keys configured the app runs in *local mode*: one learner,
no accounts, everything in the database on your machine. Add `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and it becomes multi-user with Google sign-in, every route gated and
each person's deck their own. That switch is the only thing that decides it, a deployment with the
keys set can never fall back to the open local mode.

To stop it, press Ctrl-C in the terminal. To start again later, just `npm run dev`.

## What it does

- **A learning path.** Eighteen units from *Tervitused* to *Akadeemiline eesti keel*, each a
  sitting's worth of words. Adding a unit builds real flashcards, full paradigm, audio, both
  directions, and a unit only reads as finished when the scheduler agrees the words are retained.
- **Words in context.** Every entry carries the sentences Ekilex's lexicographers recorded for it,
  with audio and a translation on request. Those same sentences become gap-fill cards
  ("Hotelli ____ on näha vanalinna.") and a word-order builder. Nothing is generated: the app only
  ever hides or reorders attested Estonian.
- **Review that asks properly.** Type the answer and it is checked: a dropped `õ` is told apart from
  a typo and from a genuinely wrong word, and each verdict suggests a grade you can override. New
  words are introduced with their answer rather than guessed at, and multiple choice covers
  recognition. `u` undoes the last grade without touching the review log.
- **Seven practice modes over one deck**, the daily review, a 60-second Case Sprint, a Match round
  against the clock, Sentences, Speaking, Listening and Dictation, plus a one-click drill for
  whichever case you keep missing. Everything writes to the same review log, so a game still moves
  the schedule forward.
- **A mock of the state examination.** Estonia examines at A2, B1, B2 and C1; B1 is what a
  citizenship application asks for. Sit an imitation of any of them, on the real clock, out of the
  real points, under the real rule that sixty percent passes and a zero in any one part fails the
  whole thing. Plus an A1 and a C2 paper the state has never set, clearly labelled, because it is
  worth being allowed to find out. Every level carries a percentage chance of passing it today,
  with the evidence behind that number stated rather than implied, and a list of what to fix that
  links to where to fix it. Nothing about the paper is written by a model: the questions are
  assembled out of the dictionary and the marks come from comparing your answer with a form the
  dictionary vouches for.
- **Dictation, marked word by word.** A real sentence is played and you write it down; the marking
  shows which word you missed and whether you only lost its Estonian letters. Estonian welds its
  case endings onto the stem, so hearing a sentence perfectly and writing the wrong ending is a
  specific failure worth naming.
- **Speaking that does not lie to you.** Say the word, then hear a native voice and your own
  recording back to back. It is not scored: there is no verified Estonian speech recogniser this app
  can use, and an invented confidence number would be believed.
- **A level check that measures rather than asks.** Reading, listening, writing and speaking, about
  ten minutes, assembled entirely out of the dictionary: meanings, case forms, case identification,
  verb government, recorded sentences, dictation, and a sentence you write that has to contain a
  named case. Questions climb the levels and a skill stops as soon as a band is clearly past you.
  Nothing is marked by an AI. Speaking is not scored, because nothing here honestly can, so it is
  yours to rate and it is kept out of the level. The result is a profile per skill, not a badge, and
  the overall figure follows your weakest measured skill because that is what a CEFR level claims.
  Take it whenever you like, and every sitting is kept.
- **A plan in hours, and it is not flattering.** Say why you are learning, how far you want to get
  and by when, and the app does the arithmetic: how many study hours that level usually takes, how
  many of them your daily goal actually covers, and how many are left to find in a class or a
  conversation. Estonian is around 1 100 classroom hours for an English speaker by the Foreign
  Service Institute's own budgeting; fifteen minutes a day here is about 90 hours a year. Both
  numbers are on the same screen, with their sources named.
- **Setup that teaches the app.** First run asks what you are here for before it asks which level,
  offers to measure you rather than making you guess, shows the timeline before you have picked a
  single word, and walks through every screen along with an equally long list of what this app
  cannot do. That list is kept at `/guide`.
- **Classes.** A six-character join code, a roster showing who is keeping up, the cases the group
  keeps missing, and a unit set as homework into each student's own task list. A class is a view
  over what learners already own, joining shares progress, never your deck, and leaving stops it.
- **Progress worth looking at.** XP, levels, a streak with shields, three daily quests, badges, a
  six-month heatmap, a two-week forecast, per-case accuracy and vocabulary reach by CEFR, all
  computed live from the review log, never stored, so none of it can drift from what you actually
  did. An opt-in weekly leaderboard exists for classes; it is off until you set a name and join.
- **Offline.** Installable as an app; reviewing works with no connection and every grade is kept on
  the device with the time you actually answered, then sent when you are back. A daily reminder is
  offered as a calendar event, which fires whether or not the app is open.
- **A grammar reference in English.** One page per case: what it is for, when Estonian reaches for
  it, and the mistake an English speaker makes, with the case shown on real words from your own
  deck, each form labelled with where it came from. The explanations are the only part of those
  pages this app wrote.
- **Photograph a page.** Point the camera at a vocabulary list, a page of your textbook or last
  night's homework, and the words on it come back matched against the dictionary. An exercise sheet
  is written in cases rather than in citation forms, so `toas` is traced back to `tuba` and told
  you as the inessive. Every word arrives ticked, editable, and labelled either "in the dictionary"
  or "read from the photo", because the only person who can say what is printed on the paper is the
  one holding it. Nothing becomes a flashcard until you say so, a word the dictionary vouches for
  brings its own principal parts, and the picture itself is read once and never stored. The page
  then becomes a set you can drill on its own.
- **Worksheets you can print.** Any unit becomes a sheet, vocabulary, gap-fills built from attested
  sentences, a principal-parts table, with the answer key on its own page. For the half of a class
  that happens in a room.
- **True retention.** Not the raw recall rate, which counts first sights of new cards, but how often
  a card the scheduler *thought* you knew actually came back, against the 90% FSRS is steering for,
  with one instruction rather than a chart to interpret.
- **⌘K** to jump to any screen or look a word up from anywhere, and **?** for every shortcut.

## The dictionary

With a free **Ekilex** key (see `.env.example`) the dictionary reaches the whole Estonian lexicon:
search any word and you get the authoritative paradigm from the Institute of the Estonian Language, 
every case, both numbers, irregular plurals and the parallel forms Estonian really has, plus its
CEFR level, verb government and an Estonian definition. Each word is stored on first lookup, so the
second time is instant and works offline. Words from the built-in set are upgraded to the
authoritative paradigm the first time you open them.

Ekilex carries no English on a reader key, so translations are resolved in layers: one you have
already accepted, then Wiktionary, then Anu, then an honest blank for you to fill. Every layer says
where it came from, and you can always overwrite it.

## What works without any API key

Everything except the two things that need a model, Anu and reading a photograph of a page:

- **Dictionary**, about 5,400 words (A1 to C1) with principal parts, consonant gradation and the
  full case table worked out from the genitive. Search an inflected form you met in class, 
  `toas`, `lugesin`, `tubadega`, and it finds the word *and* tells you which form you typed.
  Anything missing can be added by hand, principal parts and all.
- **Audio**, real Estonian speech from the University of Tartu's neural voice. No key, no setup.
- **Flashcards**. FSRS scheduling, five card types, typed or flipped, keyboard-only review.
- **The learning path, every practice mode, the grammar reference, printable worksheets, XP, quests,
  badges and the progress charts.**
- **Writing**. Write your own sentence using a word in a named case. The form is checked against
  the dictionary *before* any model runs, so the verdict is certain and works with no API key.
- **Verb government**. Which case a verb demands (`aitan sind`, `helistan sulle`). The error
  English speakers never stop making, and the one nothing else drills systematically.
- **Minimal pairs**. The length contrasts Estonian spelling only half records, found automatically
  wherever two forms in the dictionary differ by a doubled letter.
- **From your reading**. Paste real Estonian; words already in your deck are blanked out.
- **Diagnosis and the leech clinic**. Not "you are weak at the partitive" but "you are fine at the
  partitive except on gradating stems", and the cards you keep failing taken apart properly.
- **Offline review**. Grades queue on the device and replay in order when you are back. The review
  log is append-only, which is what makes that sync conflict-free.
- **Tasks, import, export, week view**, all local. The course week ties vocabulary and homework
  together.

## Turning on Anu, the tutor

Anu needs one API key, and so does scanning a page. **Settings** in the app walks through it, but in short:

1. Sign in at [openrouter.ai](https://openrouter.ai) with Google, free, no card.
2. Avatar (top right) → **Keys** → **Create Key**. Copy it; you only see it once.
3. Open the file `.env` in this folder and fill in:
   ```
   OPENROUTER_API_KEY="paste-your-key-here"
   OPENROUTER_MODEL="z-ai/glm-5.2:free"
   ```
4. Stop the app (Ctrl-C) and run `npm run dev` again.

That model costs nothing. If Anu ever feels vague about Estonian, swap the model line for
`anthropic/claude-sonnet-5` or `openai/gpt-4o`, a fraction of a cent per question and noticeably
sharper. An `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` works instead of OpenRouter if you prefer;
whichever key is present is the one used.

**Scan a page** needs the same key and one more line, because reading a photograph needs a model
that can look at one and the free chain above cannot. Scanning uses whatever model is configured
above unless you say otherwise, deliberately: switching the camera on must never move a free
deployment onto a paid model by itself. So add
`OPENROUTER_VISION_MODEL="openai/gpt-4o"` (or `ANTHROPIC_VISION_MODEL` / `OPENAI_VISION_MODEL`) and
it is used for scanning and nothing else. A page is roughly a third of a cent.

## Deploying it as a real website

Local mode needs nothing but a Postgres URL; hosting it for a class needs two more steps. The schema
was built Postgres-portable from the start (ADR-002), so this was a datasource swap rather than a
rebuild, documented in `docs/03-architecture.md` ADR-011:

1. Create a project at [supabase.com](https://supabase.com) → **Connect** (or Project Settings →
   Database → Connection string). Take **both** strings from the `pooler.supabase.com` host:
   the **transaction pooler** (port 6543) as `DATABASE_URL`, with `?pgbouncer=true` appended, and
   the **session pooler** (port 5432) as `DIRECT_URL`. Percent-encode any special characters in
   the password.

   Do *not* use the direct `db.<project-ref>.supabase.co` host that the dashboard shows first: it
   resolves to IPv6 only, and Vercel has no IPv6 route to it, so every build dies with
   `P1001: Can't reach database server`. The poolers are IPv4. `DIRECT_URL` wants the *session*
   pooler specifically, it is a full Postgres session, so `prisma db push` can run schema changes
   through it, which the transaction pooler cannot.
2. In Vercel, import this repo and set the environment variables (Production, and Preview if you
   want preview deploys to work): `DATABASE_URL`, `DIRECT_URL`, plus whichever of
   `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` and `EKILEX_API_KEY` you're using.
   Never prefix any of these `NEXT_PUBLIC_`, they must stay server-side.
3. Deploy. Vercel's build runs `prisma generate && prisma db push && npm run db:seed:ensure &&
   next build` (see `package.json`), so a hosted deployment sets itself up: the schema is
   created/updated against `DIRECT_URL`, and a database with an empty dictionary gets the built-in
   the whole dictionary loaded before the build renders anything. The seed writes it in six statements
   rather than three per word, which is what keeps that first deploy to a few seconds instead of
   the several minutes a thousand sequential round trips to another region used to cost.

   Both steps are deliberately conservative. `prisma db push` fails the build rather than silently
   applying a destructive change, so an unusual schema change (e.g. dropping a column with data in
   it) shows up as a failed deploy asking you to confirm, not as quiet data loss. `db:seed:ensure`
   only runs when the dictionary is *completely* empty, a deployment whose dictionary already has
   words (including ones you added by hand, or that Ekilex cached) is left alone, and neither step
   ever touches `Card` or `Review`. To force a reseed after correcting the seed data, run
   `npm run db:seed` against the hosted database yourself.

Two things that used to change when hosted have since been fixed. Review works on a train again:
it is a PWA, grades go to a device-local outbox and replay when the connection returns. And the
audio cache is durable rather than per-instance: set `SUPABASE_SERVICE_ROLE_KEY` and clips are
content-addressed in Supabase Storage, fetched once for everyone rather than once per cold start.
Without that key it falls back to local disk, and Settings says so plainly.

**Set a spend cap.** The app is free to whoever uses it, and the caps are what make that
affordable rather than a leap of faith. The tutor is metered per user per day (ten conversations,
`AI_DAILY_CALLS_PER_USER`) under a global ceiling (`AI_DAILY_USD_GLOBAL`, default $20). The
writing grader and speech scale off the same number in `lib/usage/ledger.ts`, higher, because they
cost far less. Nothing a learner does outside the tutor is metered at all.

The last quarter of the day's shared budget is held back for people who have not asked anything
yet (`AI_GLOBAL_RESERVE_FRACTION`). Without it the cap is first come, first served: an enthusiastic
morning spends the day and everyone arriving later, newcomers included, finds the tutor switched
off. The reserve costs a heavy user their eleventh conversation and gives a newcomer their first.

The defaults are live whether or not you configure anything. There is no way to turn metering off,
because sign-up is open by default. If you would rather run a private instance, `ALLOWED_EMAILS` or
`ALLOWED_EMAIL_DOMAINS` turns the same deployment into one.

### Adding Google sign-in (multi-user)

Every route is gated behind sign-in (`middleware.ts`); each Google account gets its own dictionary
deck, tasks and review history, while the dictionary itself stays shared, see ADR-012. Two accounts
to set up, both one-time:

1. **Google Cloud Console** → [console.cloud.google.com](https://console.cloud.google.com) →
   create a project (or pick an existing one) → **APIs & Services → OAuth consent screen**: fill in
   an app name and your email, external user type is fine for a small group. Then
   **Credentials → Create Credentials → OAuth client ID** → type **Web application** → add an
   **Authorized redirect URI**: `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase's
   callback, not Vercel's, find the exact URL in the next step). Save; copy the **Client ID** and
   **Client Secret**.
2. **Supabase dashboard** → your project → **Authentication → Providers → Google** → toggle it on,
   paste the Client ID and Client Secret from step 1, save. The callback URL to put in Google Cloud
   is shown right there on this page.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API, the
   anon/publishable key, safe to be public) in both your local `.env` and Vercel's environment
   variables.

Neither Google credential nor the Supabase service role key is ever needed in this app's own code, 
the OAuth exchange happens entirely inside Supabase.

## The way it looks

A signed-out visitor lands on **/welcome**, a single-page tour with a working flashcard, a live
case table and an honest comparison against the streak apps. Every Estonian form on that page is
read from the real dictionary and derived by the app's own code, not typed into marketing copy.

Inside, the app runs on a pastel design system built around the cornflower, *rukkilill*, Estonia's
national flower, with Fraunces for Estonian words and headings, and a mascot made out of the
letter **õ**. Light and dark both ship, and the theme toggle sits at the bottom of the rail.
`docs/14-design-system.md` has the palette, the tokens and the rules colour follows.

## Backing up

**Settings → Download a backup** writes a JSON file with every word, card and review, and the same
panel restores one. Merge is the default and cannot delete anything, so restoring the same file twice
is harmless; replacing everything is behind a typed confirmation.

Your review history is the one thing here that cannot be recreated, grab a copy now and then, and
try restoring it once while nothing is at stake. A backup you have never restored is a hypothesis.

## Commands

```
npm run dev              # development server
npm run build            # production build
npm run typecheck        # tsc --noEmit
npm run test             # unit tests, hermetic: no database, no network
npm run test:db          # integration tests, needs a Postgres in DATABASE_URL
npm run test:invariants  # the rules in CLAUDE.md, asserted
npm run check:secrets    # fails if a credential reached the client bundle
npm run test:e2e         # the browser suites, needs the server running
npm run test:browser     # routes, modes, offline, the level check, scanning and accessibility
npm run test:mobile      # the phone, measured; needs the server running
npm run demo             # two months of sample history, to look around
npm run db:seed          # reload the built-in dictionary (always)
npm run db:seed:ensure   # load it only if the dictionary is empty, what the deploy runs
```

The end-to-end suite and `npm run demo` refuse to run against anything but a local database, and
say so rather than proceeding. They delete rows on purpose (`test-restore` empties every table to
prove a backup brings it back) and Prisma reads `DATABASE_URL` from the environment *before* it
reads `.env`, so a shell that already holds hosted credentials would otherwise point them at real
data while `.env` sat there saying `localhost`. Set `KODUKEEL_ALLOW_REMOTE_DB=1` if you genuinely
mean it. `test-restore` also writes the backup to a file before it deletes anything, so a run that
dies halfway is recoverable rather than final.

## How it is put together

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · Prisma + Postgres · `ts-fsrs` ·
TartuNLP speech · any OpenAI-compatible or Anthropic model.

```
lib/estonian/     the language model: cases, principal parts, gradation, answer checking.
                  No React, no Prisma, fully tested.
lib/srs/          FSRS scheduling, card generation, and offline grade replay.
lib/analysis/     diagnosis and leech classification over the review log.
lib/usage/        the AI spend ledger and the quota policy.
lib/offline/      the grade outbox and its replay rules.
lib/collections/  the learning path: units as references into the dictionary.
lib/classroom/    join codes and the roster a teacher sees, and only that.
lib/gamification/ XP, levels and the daily quests. Pure functions over stats.
lib/stats/        heatmap, forecast and accuracy aggregation.
lib/progress/     the database side of the above, shared by Today, the path and /progress.
lib/offline/      the queue that lets a review session survive with no network.
lib/dict/         search.
lib/tutor/        provider-agnostic chat; keys stay server-side.
app/(app)/        the signed-in app: Today, the path, review, dictionary, Anu, words, tasks.
app/(chromeless)/ pages that own the whole screen: the landing page, sign-in, first-run setup.
app/api/          the three server proxies.
components/       ui primitives, the brand mark and the mascot.
prisma/data/      the built-in dictionary.
docs/             the full plan and the decisions behind it.
```

Four rules the code holds to, all explained in `docs/`:

- **Estonian forms are never invented.** Principal parts are stored; the eleven regular cases are
  derived from the genitive at render time. Where a form is unknown, the app shows a gap, an
  invented form gets drilled into memory by the SRS, which is worse than a blank.
- **No key ever reaches the browser.** The AI and speech services are called from server routes only.
- **Progress is derived, never stored.** XP, levels, streaks, quests and every chart are computed
  from the append-only review log on each request. There is no score column to increment, so there
  is no way to be awarded something that did not happen, and none of it can be lost in a restore.
- **Every view has four states.** Empty, loading, error and offline, a view without an empty state
  is not finished. `docs/08-ux-ia-a11y.md` §4.

## Credits

- Speech synthesis: [TartuNLP](https://tartunlp.ai), University of Tartu (MIT).
- The plan this was built from, including the audit of the original spec, is in `docs/`.
