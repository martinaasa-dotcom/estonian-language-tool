# Kodukeel. Estonian that finally sticks

*Kodukeel*, "home language". An Estonian learning app whose purpose is to be left: it teaches the
words properly, then puts you in front of somebody with an agenda of their own, and then counts
the conversations you have outside it. A dictionary that answers with every form of a word, a
course you can work through, flashcards scheduled by FSRS, listening that sounds like the street
rather than the studio, a grammar reference written in English, printable worksheets for a real
class, a mock of the state language examination at every level, a tutor that is never allowed to
invent an Estonian form, and Situations: a receptionist, a landlord, a clerk at a counter, each with a
reason of their own to make it hard, marked against the dictionary and never by a model.

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

- **Situations.** Seven of them: a café, a bus ticket, a street corner, a health centre, a
  landlord, a counter, and a friend on the phone. A card says who you are today and what you came
  for, and the other side speaks first, reacts to what you say, repeats your word back, and asks
  again when you were not understood. Something goes wrong on the way at every difficulty above the
  easiest, and the debrief says whether you handled it. Every line is a phrase the course teaches
  or a line written for the scene inside its own words and checked word by word before you see it,
  the screen says which, and all fourteen play without a model key. Whether you were understood is decided by the
  dictionary, never by a model, so you cannot be marked wrong for being right. Difficulty is a
  budget of things that go wrong: the slot you asked for has gone, a queue forms, they switch to
  English. You can walk out. The debrief leads with what happened and never with a score.
- **Say it today.** Each morning, one press to say whether you spoke Estonian to anybody
  yesterday: they understood, they switched to English, not yesterday. Where the answer is no,
  one small errand for today, order a coffee, ask the time, drawn from the units you have
  started, with the scene that rehearses it a link away. Progress counts the conversations ahead
  of every chart, because a conversation you had is the only measure that matters here.
- **Hearing the way people talk.** A word you know well comes back at speed, over café noise, down
  a phone line, from halfway through, in a different voice each time. The words never change; the
  delivery does, because nobody at a counter talks like a clean synthetic voice in a quiet room.
- **A course.** 82 units across five CEFR levels, from *Tervitused* to *Nüansid*, each a
  sitting's worth of words, and the words between the words too: question words, pronouns, the
  postpositions, the months and the adverbs of time have units of their own. Adding a unit builds real flashcards, every form, audio, both
  directions, and a unit only reads as finished when the scheduler agrees the words are retained.
- **A meaning in the language you think in.** Most people learning Estonian in Estonia already
  speak Russian or Ukrainian, and being told that `kohv` is "coffee" asks you to reach a word
  through the language you are least sure of. `tuba` is комната and кімната, from Ekilex, written
  by the same lexicographers as the Estonian: 1,367 of the course's words carry a Russian
  equivalent and 1,165 a Ukrainian one. Chosen in Settings, printed beside the English rather than
  instead of it, and no model is anywhere near it.
- **Words in context.** Every entry carries the sentences Ekilex's lexicographers recorded for it,
  with audio and a translation on request. Those same sentences become gap-fill cards
  ("Hotelli ____ on näha vanalinna.") and a word-order builder. Nothing is generated: the app only
  ever hides or reorders attested Estonian.
- **Review that asks properly.** Type the answer and it is checked: a dropped `õ` is told apart from
  a typo and from a genuinely wrong word, and each verdict suggests a grade you can override. New
  words are introduced with their answer rather than guessed at, and multiple choice covers
  recognition. `u` undoes the last grade without touching the review log.
- **22 ways to practice, over one deck.** Six rounds against the clock (a 60-second Case
  Sprint, Match, Sentences, Listening, Dictation and Speaking), two passes over the words you are
  working on (flash cards over the whole deck, and the hundred commonest words of each kind,
  counted over film and television subtitles rather than chosen by anybody), five games (a picture
  board with no English on it, a picture to write one Estonian sentence about, Sõnad, a six-letter
  word a day in six guesses, Ristsõna, a crossword with English clues and Estonian answers, and
  Target for endings before the timer runs out), a two-minute daily quest aimed at whatever is going
  worst, and eight drills that sit on the page naming the thing they drill: a sentence you write in
  a named case, verb government, long against short, your own pasted Estonian, the conjugation
  table, the words the endings cannot reach, the cards you keep failing, and the words you looked
  up yourself rather than met in a unit, which the queue is otherwise slowest to reach. Everything
  writes to the same review log, so a game still moves the schedule forward.
- **Where the endings stop.** Three forms memorized and eleven worked out is most of the language
  and not all of it: `tuba` goes to `tuppa`, not `toasse`, and its stem is `toa`, which no rule
  predicts. The exception area is every word in the dictionary whose stored form disagrees with the
  pattern, grouped by what breaks, with a drill that shows you the form, asks for it, and then asks
  for it inside a sentence a lexicographer wrote. Nothing on it is a list anybody typed: it is
  worked out by comparing the pattern with what the dictionary holds, so a word that is not there
  can be guessed at, which is the whole point of it.
- **A mock of the state examination.** Estonia examines at A2, B1, B2 and C1; B1 is what a
  citizenship application asks for. Sit an imitation of any of them, on the real clock, out of the
  real points, under the real rule that sixty percent passes and a zero in any one part fails the
  whole thing. Plus an A1 paper the state has never set, clearly labelled, because it is worth
  being allowed to find out. Every level carries a percentage chance of passing it today,
  with the evidence behind that number stated rather than implied, and a list of what to fix that
  links to where to fix it. Nothing about the paper is written by a model: the questions are
  assembled out of the dictionary and the marks come from comparing your answer with a form the
  dictionary vouches for.
- **Dictation, marked word by word.** A real sentence is played and you write it down; the marking
  shows which word you missed and whether you only lost its Estonian letters. Estonian welds its
  case endings onto the stem, so hearing a sentence perfectly and writing the wrong ending is a
  specific failure worth naming.
- **Speaking that does not lie to you.** Say the word, then hear a native voice and your own
  recording back to back. It is not scored: there is no verified Estonian speech recognizer this app
  can use, and an invented confidence number would be believed.
- **A level check that measures rather than asks.** Eighty questions across A1 to C1: six reading
  and six writing at each level, three listening, one spoken. Assembled entirely out of the
  dictionary, so it is meanings, sentences with a word taken out of them, dictation, and forms you
  type. Questions climb the levels, and a skill asks one level past the first one you do not pass
  and then stops, so a beginner answers about fifteen of them and nobody answers all eighty
  without earning it. The size is measured rather than picked: simulated against the real
  dictionary, the old nineteen-question paper placed 43% of learners correctly and put 57% of them
  below where they were, and this one places between 72% and 98% depending on the level. Nothing
  is marked by an AI. Speaking is not scored, because nothing here
  honestly can, so it is yours to rate and it is kept out of the level. The result is a profile per
  skill, not a badge, and the overall figure follows your weakest measured skill because that is
  what a CEFR level claims. Take it whenever you like, and every sitting is kept.
- **A level you can just set.** Settings has the level the app is going on and a row of five chips
  to change it. A measurement is the wrong instrument for having been moved up in your class, or
  for a check taken on a bad evening, and whichever of the two was stated later is the one the app
  holds. It decides where the course opens, which words review introduces next, and the band the
  practice rounds and the dictionary draw from.
- **A plan in hours, and it is not flattering.** Say why you are learning, how far you want to get
  and by when, and the app does the arithmetic: how many study hours that level usually takes, how
  many of them your daily goal actually covers, and how many are left to find in a class or a
  conversation. Estonian is around 1 100 classroom hours for an English speaker by the Foreign
  Service Institute's own budgeting; fifteen minutes a day here is about 90 hours a year. Both
  numbers are on the same screen, with their sources named. And it is about you rather than the
  average: a measured level is costed skill by skill and a guessed one is widened for the guess,
  living in Estonia or having Estonian at home counts as hours your week already holds, and once
  there is a fortnight of reviews the pace it plans on is the one you actually keep.
- **Setup that teaches the app.** First run asks what you are here for before it asks which level,
  offers to measure you rather than making you guess, shows the timeline before you have picked a
  single word, and says in one line what this app will not do for you before it asks for anything.
- **Classes.** A six-character join code, a roster showing who is keeping up, the cases the group
  keeps missing, and a unit set as homework onto each student's own Today. A class is a view
  over what learners already own, joining shares progress, never your deck, and leaving stops it.
- **Your Estonian week.** Almost everybody using this is also sitting in a class, and the app knew
  what was due and nothing about the Monday evening that produced it. Put your class times and the
  slots you study in, and what is due shows up beside them. Estonian only: a dentist appointment
  belongs in the calendar you already have.
- **Progress worth looking at.** A streak with shields, a six-month heatmap, per-case accuracy,
  the cards that keep coming back, what you could hold a conversation about and vocabulary reach by
  CEFR, all computed live from the review log, never stored, so none of it can drift from what you
  actually did. There is no XP and there are no badges: a second score beside the readings that
  mean something is noise, and this one is not the app anybody is here for. An opt-in weekly leaderboard exists for classes; it is off until you set a name and join.
- **How ready you actually are, in situations rather than a percentage.** Every unit of the course
  makes a claim, "describe a symptom to a doctor and understand the advice", and the app reads each
  one on three rungs off your own answers: whether you would follow it, take part in it, or lead
  it. Recognizing words on cards never clears the second rung. It names what stands in the way,
  the endings that encounter turns on, how many seconds a word takes you to reach, whether anything
  has ever tested your ear, and it offers a real thing to go and try only once your record supports
  answering. `docs/22-readiness.md`.
- **Offline.** Installable as an app; reviewing works with no connection and every grade is kept on
  the device with the time you actually answered, then sent when you are back. A daily reminder is
  offered as a calendar event, which fires whether or not the app is open.
- **A grammar reference in English, named in Estonian.** One page per case: what it is for, when
  Estonian reaches for it, and the mistake an English speaker makes, with the case shown on real
  words from your own deck, each form labelled with where it came from. Everything is named the way
  a course names it, by the Estonian term and the question it answers, with the English name kept
  beside it for when you are reading an English grammar, because nobody teaching this language says
  "the inessive". The explanations are the only part of those pages this app wrote.
- **Photograph a page.** Point the camera at a vocabulary list, a page of your textbook or last
  night's homework, and the words on it come back matched against the dictionary. An exercise sheet
  is written in cases rather than in citation forms, so `toas` is traced back to `tuba` and told
  you as the seesütlev. Every word arrives ticked, editable, and labelled either "in the dictionary"
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
search any word and you get the authoritative forms from the Institute of the Estonian Language, 
every case, both numbers, irregular plurals and the parallel forms Estonian really has, plus its
CEFR level, verb government and an Estonian definition. Each word is stored on first lookup, so the
second time is instant and works offline. Words from the built-in set are upgraded to the
authoritative forms the first time you open them.

Ekilex carries no English on a reader key, so translations are resolved in layers: one you have
already accepted, then Wiktionary, then Anu, then an honest blank for you to fill. Every layer says
where it came from, and you can always overwrite it.

It does carry Russian and Ukrainian, though, in the same response as the forms, and the course
harvest keeps them: 1,400 of the 1,404 course words have a Russian equivalent and 1,198 a
Ukrainian one, written by the same lexicographers. Pick a language in Settings and it is printed
beside the English on the entry and on the first meeting with a word in review. The English stays,
because it is the one gloss every entry has and the Wiktionary-derived words have no other.

The dictionary's landing page also reads the morning's front page. A few of the day's headlines
from ERR, Estonia's public broadcaster, are printed as written, and every word the dictionary can
vouch for is a link to its entry, so the most ordinary Estonian there is comes with a case table
under it. A word the dictionary will not vouch for is left plain rather than guessed at, and
nothing from the feed is stored. `NEWS_FEED_URL` points it at another RSS feed, or `off` turns it
off.

Which words are worth learning first is answered by counting rather than by opinion. **The words
you will hear most** is a published frequency count over a corpus of film and television subtitles,
gated through the dictionary so every word on the page is one the app can teach, with your own deck
marked against it. The page names the corpus, because subtitles are dialogue: `tere` and `aitäh`
rank high there and the vocabulary of a newspaper leader does not, which is the right corpus for
somebody learning to talk to people and the wrong one to call "the most common words in Estonian"
without saying so.

## What works without any API key

Everything except the two things that need a model, Anu and reading a photograph of a page:

- **Dictionary**, 6,116 words (A1 to C2) with principal parts, consonant gradation and the
  full case table worked out from the genitive. Search an inflected form you met in class,
  `toas`, `lugesin`, `tubadega`, `helistab`, and it finds the word *and* tells you which form you
  typed.
  Anything missing can be added by hand, principal parts and all.
- **Audio**, real Estonian speech from the University of Tartu's neural voices, twelve of them to
  choose from. A card reads itself aloud when a word is met and when its answer appears, and the
  next card's clip is fetched while you answer this one. No key, no setup.
- **Flashcards**. FSRS scheduling, 7 card types, typed or flipped, keyboard-only review.
- **The learning path, every practice mode, the grammar reference, printable worksheets and the
  progress charts.**
- **Writing**. Write your own sentence using a word in a named case. The form is checked against
  the dictionary *before* any model runs, so the verdict is certain and works with no API key.
- **Verb government**. Which case a verb demands (`aitan sind`, `helistan sulle`). The error
  English speakers never stop making, and the one nothing else drills systematically.
- **Every verb conjugated**. The present tense, the negative, the conditional and the imperative
  are worked out from the stored first person for every verb in the dictionary, a rule checked
  against Ekilex for all 797 of them, and the conjugation drill asks you to type the table back.
- **Minimal pairs**. The length contrasts Estonian spelling only half records, found automatically
  wherever two forms in the dictionary differ by a doubled letter.
- **From your reading**. Paste real Estonian; words already in your deck are blanked out.
- **Diagnosis and the leech clinic**. Not "you are weak at the osastav" but "you are fine at the
  osastav except on gradating stems", and the cards you keep failing taken apart properly.
- **Offline review**. Grades queue on the device and replay in order when you are back. The review
  log is append-only, which is what makes that sync conflict-free.
- **The calendar, import and export**, all local. Your class times, the slots you study in and
  what is due, in one week.

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

   **Run the app in the same region as the database, and put the pair as near Estonia as you
   can.** Those are two rules and the first one comes first, because the two distances are not
   paid the same number of times. This app derives everything from the review log on each request
   (ADR-014), so a page is a handful of database round trips: Today makes about eight it cannot
   avoid, and every one of them crosses whatever sits between the function and the database. A
   learner's own distance to the function is crossed once per page. So a function 30ms nearer the
   reader and 35ms further from the database is a page that got slower, by a factor of about eight.

   `vercel.json` says `"regions": ["dub1"]`, which is Dublin, which is AWS `eu-west-1`, which is
   where a Supabase project on `aws-*-eu-west-1.pooler.supabase.com` lives. Vercel's own default
   is `iad1`, in Washington, and against a database in Ireland that is roughly 80ms a query, which
   is most of a second on Today before the page has drawn anything.

   Nearly everybody learning Estonian is in Estonia, and the nearest pair to Tallinn is Stockholm:
   Supabase's `eu-north-1` and Vercel's `arn1`, about 400km away against Dublin's 1,800. Moving
   there means moving the Supabase project, which is a migration rather than a setting, so **move
   both or neither**. A deployment in `arn1` reading a database in Ireland is the worst of the
   three arrangements, and it is the one you get by changing the easy half first.
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

### What it costs to run

`/funding` is the whole bill, itemized, with a slider on it. It is a public page, like `/privacy`
and `/terms`, because the people most likely to want it (somebody deciding whether to fund this,
and somebody wondering what a free app is selling instead) have no account here.

**Nothing anybody bills for is counted as free.** A free tier is a plan that pauses when nobody is
on it, forbids commercial use, or hands out an allowance that goes the week you launch, so
modeling one would describe a deployment nobody runs. Every vendor is on the plan a real
deployment is on.

**What is given is credited, not priced.** Ekilex, Wiktionary and TartuNLP are public institutions
that decided this work should be available. They ask for nothing, they are named with what each one
gives and its licence, and they are in no total. Where buying the same thing is possible the page
says what that would come to, so the size of the gift is visible without being charged for.

**One list.** `lib/funding/services.ts` is every piece of infrastructure with its own price
function. Adding a new tool is one entry there: the bill, the totals, the chart, the ladder and the
page's own description all read the registry, and the invariants fail if any of them stops.

Every number is measured on this repository with the command that produced it, quoted off a
vendor's price list with the date it was read, or named as one of the assumptions listed in full on
the page. Two lines are billed in euros and the rest in dollars; the rate is the European Central
Bank's, and every price is net of VAT because that is how the vendors quote their own.

Four things on it are worth knowing before you deploy this for anybody.

- **The floor is about $300 a month before a single learner arrives**, and most of it does not move
  when they do. The first thousand people are close to free to serve.
- **Speech is the fastest-growing thing on the page.** TartuNLP returns uncompressed 32-bit audio,
  so a two-second phrase is 188 KB and the whole spoken dictionary is 2.8 GB. At a hundred thousand
  learners, buying that speech would come to more than every billed line put together.
- **The tooling is on the bill.** What writes and maintains the app is not runtime infrastructure
  and is most of the cost at the sizes anybody starts at, so leaving it out would imply the
  software maintains itself.
- **The model line has a ceiling in the code.** Every call is booked against a shared daily budget
  (`AI_DAILY_USD_GLOBAL`) that cannot be turned off, so the projection cannot show a bill the
  running app would refuse to run up.

### When the app gets something wrong

The dictionary is built from Ekilex and Wiktionary rather than typed, which keeps invented Estonian
out of it and does not make every entry right. So every dead end offers to send a suggested fix: a
search that found nothing, a gloss that is the wrong sense, a principal part that is wrong, an
answer marked wrong that was right, a page whose explanation does not match what a course says, a
screen that failed. What is sent carries the screen and what the app had just said, so a report
arrives with the thing it is about rather than as a sentence out of context.

They land in a review queue at `/admin/suggestions`, grouped so that one problem is one decision
however many people reported it, with what the entry says now beside what is proposed. Accepting a
dictionary correction writes it into the shared entry in one click. `ADMIN_EMAILS` names who may do
that; with sign-in configured and nobody named, the queue says so instead of showing an empty list.
Running locally there is one learner and they review their own. Anyone can see what they sent, and
what happened to it, at `/suggestions`.

### Adding sign-in (multi-user)

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

**One address, and Supabase has to be told which.** A Vercel deployment answers on
`<app>.vercel.app` as well as on the domain you point at it, and Google sign-in is the one path
that cannot survive the difference: the sign-in starts on the origin the learner is on, and
Supabase sends them back there only if that origin's `/auth/callback` is on the project's
**Redirect URLs**. Anywhere else it falls back to the project's **Site URL**, silently, and the
exchange then fails on a host that never started the sign-in, which reads as a sign-in that
"did not go through" and works on the second press. So, under **Authentication → URL
Configuration**: set **Site URL** to the address people use (`https://kodukeel.ee`), add
`https://kodukeel.ee/auth/callback` to **Redirect URLs**, and set `NEXT_PUBLIC_SITE_URL` to the
same address in Vercel. With that set the app redirects every other host it answers on, the
platform's own name included, to that one, permanently, so there is a single origin for the
verifier cookie, the session and the callback to agree on. Previews and `localhost` are never
redirected. A callback that still arrives with nothing to finish it says so on the sign-in
screen and names the setting.

**A mailed link, so a Google account is not the price of entry.** Anyone without one, or unwilling
to attach one to a language app, could not reach the product at all. Supabase dashboard →
**Authentication → Providers → Email**: turn it on and leave "Confirm email" as it is. Then
**Authentication → URL Configuration → Redirect URLs**: add `https://<your-app>/auth/callback`,
which is the one address either way in lands on, so the allowlist is checked in a single place.

**Set up your own SMTP before you tell anybody about it.** Supabase's built-in email service sends
a couple of messages an hour for the whole project and says itself it is for testing, so on a
public copy the second person to ask for a link does not get one. It lives under
**Authentication → Emails → SMTP Settings** (Supabase has moved this out of Project Settings a
few times across versions; if it is not there, check Authentication → URL Configuration or
Advanced). It takes any provider; this app is run on **Resend**, added as a verified sending
domain (`kodukeel.ee`) with these settings:

- **Host**: `smtp.resend.com`
- **Port**: `465`
- **Username**: `resend` (the literal word, not an account name)
- **Password**: a Resend API key with sending access, created under **API Keys**
- **Sender email**: an address on the verified domain, e.g. `noreply@kodukeel.ee`

Resend's own **Logs** tab shows every send attempt and its delivery status, which is the fastest
way to debug a bounce or a missing email.

The mailed link is **on by default**, and `EMAIL_SIGN_IN="off"` hides it. It was the other way
round for a while, off until somebody set it on, on the argument that a form which takes an
address and mails nobody is worse than no form. The argument holds and the default did not: the
switch was one more thing to remember in a dashboard, and the one deployment this app has spent
weeks offering Google as the only way in. Turn it off only for a copy whose mail really does not
go out, and set up SMTP before anybody but you is asking for links.

The link is opened in the browser that asked for it, because that is where the verifier lives, and
the sign-in screen says so. If you would rather it survived being forwarded to a phone, change the
magic-link email template to point at
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`. `app/auth/callback/route.ts`
already answers that shape; nothing in the app needs changing.

## The way it looks

A signed-out visitor lands on **/welcome**, a single-page tour with a working flashcard, a live
case table and an honest comparison against the streak apps. Every Estonian form on that page is
read from the real dictionary and derived by the app's own code, not typed into marketing copy.

Inside, the app runs on a pastel design system built around the cornflower, *rukkilill*, Estonia's
national flower, set throughout in Plus Jakarta Sans, with a mascot made out of the
letter **õ**. Light is the default everywhere and dark is a choice: the toggle sits at the bottom of the rail.
`docs/14-design-system.md` has the palette, the tokens and the rules colour follows.

## Backing up

**Settings → Download a backup** writes a JSON file with every word, card and review, and the same
panel restores one. Merge is the default and cannot delete anything, so restoring the same file twice
is harmless; replacing everything is behind a typed confirmation.

Your review history is the one thing here that cannot be recreated, grab a copy now and then, and
try restoring it once while nothing is at stake. A backup you have never restored is a hypothesis.

## What learners get wrong, counted

The review log already records every exercise anybody has answered and whether they got it right,
because the scheduler needs it. Aggregated across everybody, that is a picture of where learners of
Estonian actually fail, by case, by stem change and by word, which is not something a textbook or a
single classroom can measure.

Set `RESEARCH_TOKEN` and `/api/research` produces it as a CSV you can send to somebody who teaches
Estonian or studies how it is learned. Leave it unset and the route does not exist.

```
curl -H "Authorization: Bearer $RESEARCH_TOKEN" \
     "https://your-app/api/research?format=csv" -o learner-errors.csv
```

Nothing in that file rests on fewer than ten people or fifty answers, no one person may be more than
half of any figure, counts are rounded and head counts are given as bands. A category below the
threshold is missing from the file rather than shown as a small number, so a gap means too little
data and never no errors. Anyone can leave their own answers out in **Settings → Anonymous
statistics**, and out means their rows are never read rather than subtracted afterwards.

Read `docs/19-research-export.md` before sending a file to anybody. It says what the tables can and
cannot support, which is the half that makes the rest of it worth having.

## Commands

```
npm run dev              # development server
npm run build            # production build
npm run typecheck        # tsc --noEmit
npm run test             # unit tests, hermetic: no database, no network
npm run test:db          # integration tests, needs a Postgres in DATABASE_URL
npm run test:invariants  # the rules in CLAUDE.md, asserted
npm run audit:sense      # does every question make sense for the word it is about
npm run check:secrets    # fails if a credential reached the client bundle
npm run test:e2e         # the browser suites, needs the server running
npm run test:browser     # routes, modes, offline, the level check, scanning and accessibility
npm run test:mobile      # the phone, measured; needs the server running
npm run build:frequency  # recount the commonest words from the published corpus
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
lib/collections/  the course: syllabus, lessons, placement and checkpoints, as references into the dictionary.
lib/classroom/    join codes and the roster a teacher sees, and only that.
lib/stats/        heatmap, streak, accuracy and answer-time aggregation.
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
- **Progress is derived, never stored.** The streak, the goal and every chart are computed
  from the append-only review log on each request. There is no score column to increment, so there
  is no way to be awarded something that did not happen, and none of it can be lost in a restore.
- **Every view has four states.** Empty, loading, error and offline, a view without an empty state
  is not finished. `docs/08-ux-ia-a11y.md` §4.

## Credits

- Estonian forms and example sentences: [Ekilex](https://ekilex.ee), the lexicographic
  database of the Institute of the Estonian Language. CC BY 4.0.
- English glosses: [English Wiktionary](https://en.wiktionary.org), by its contributors.
  CC BY-SA 4.0.
- Speech synthesis: [TartuNLP](https://tartunlp.ai), University of Tartu (MIT).
- The plan this was built from, including the audit of the original spec, is in `docs/`.

## License

The code is MIT, in `LICENSE`. The language data is not, and the difference matters if you
redistribute rather than merely run this: Ekilex is CC BY 4.0 and Wiktionary is CC BY-SA 4.0,
which is share-alike, so `prisma/data/expanded.json` carries CC BY-SA as a build product of
both. Both attributions are rendered in the running app rather than only in this file, on the
sign-in page, in the landing footer and on `/terms`, which is where a licence of that shape
expects to find them. `LICENSE` sets all of this out.
