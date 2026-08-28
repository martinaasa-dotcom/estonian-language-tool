# Kodukeel — Estonian learning dashboard

*Kodukeel* — "home language". An Estonian study workspace built around the thing that actually makes
the language hard: the cases. A dictionary that answers with the whole paradigm, a course you can
work through, flashcards scheduled by FSRS, four practice modes, and a grammar tutor that is never
allowed to invent an Estonian form.

> **Status: usable by someone who is not you.** First run walks a new learner through a setup wizard
> and builds them a real deck; the daily loop — path, review, practice, progress — is complete, works
> on a phone, installs as an app and keeps working with the network off. Built from the plan in
> `docs/`; `docs/13-mvp-status.md` says what is in and what is deliberately not.

## Running it

You need [Node.js](https://nodejs.org) 20 or newer and a Postgres database.

```bash
npm install       # fetches the libraries
npm run setup     # writes .env, creates the schema, loads the built-in dictionary
npm run dev       # starts the app
```

Open **http://localhost:3000** and the setup wizard takes it from there.

`DATABASE_URL` and `DIRECT_URL` in `.env` are the only settings that are not optional. Any Postgres
will do — a local one, or the free tier of [supabase.com](https://supabase.com).

**Sign-in is optional.** With no Supabase keys configured the app runs in *local mode*: one learner,
no accounts, everything in the database on your machine. Add `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and it becomes multi-user with Google sign-in, every route gated and
each person's deck their own. That switch is the only thing that decides it — a deployment with the
keys set can never fall back to the open local mode.

To stop it, press Ctrl-C in the terminal. To start again later, just `npm run dev`.

## What it does

- **A learning path.** Eighteen units from *Tervitused* to *Akadeemiline eesti keel*, each a
  sitting's worth of words. Adding a unit builds real flashcards — full paradigm, audio, both
  directions — and a unit only reads as finished when the scheduler agrees the words are retained.
- **Review that asks properly.** Type the answer and it is checked: a dropped `õ` is told apart from
  a typo and from a genuinely wrong word, and each verdict suggests a grade you can override. New
  words are introduced with their answer rather than guessed at, and multiple choice covers
  recognition. `u` undoes the last grade without touching the review log.
- **Four practice modes over one deck** — the daily review, a 60-second Case Sprint, a Match round
  against the clock, and Listening, plus a one-click drill for whichever case you keep missing.
  Everything writes to the same review log, so a game still moves the schedule forward.
- **Progress worth looking at.** XP, levels, a streak with shields, three daily quests, badges, a
  six-month heatmap, a two-week forecast, per-case accuracy and vocabulary reach by CEFR — all
  computed live from the review log, never stored, so none of it can drift from what you actually
  did. An opt-in weekly leaderboard exists for classes; it is off until you set a name and join.
- **Offline.** Installable as an app; reviewing works with no connection and every grade is kept on
  the device with the time you actually answered, then sent when you are back.
- **⌘K** to jump to any screen or look a word up from anywhere.

## The dictionary

With a free **Ekilex** key (see `.env.example`) the dictionary reaches the whole Estonian lexicon:
search any word and you get the authoritative paradigm from the Institute of the Estonian Language —
every case, both numbers, irregular plurals and the parallel forms Estonian really has — plus its
CEFR level, verb government and an Estonian definition. Each word is stored on first lookup, so the
second time is instant and works offline. Words from the built-in set are upgraded to the
authoritative paradigm the first time you open them.

Ekilex carries no English on a reader key, so translations are resolved in layers: one you have
already accepted, then Wiktionary, then Anu, then an honest blank for you to fill. Every layer says
where it came from, and you can always overwrite it.

## What works without any API key

Everything except the tutor:

- **Dictionary** — 360 words (A1 to C1) with checked principal parts, consonant gradation and the
  full case table worked out from the genitive. Search an inflected form you met in class —
  `toas`, `lugesin`, `tubadega` — and it finds the word *and* tells you which form you typed.
  Anything missing can be added by hand, principal parts and all.
- **Audio** — real Estonian speech from the University of Tartu's neural voice. No key, no setup.
- **Flashcards** — FSRS scheduling, five card types, typed or flipped, keyboard-only review.
- **The learning path, all four practice modes, XP, quests, badges and the progress charts.**
- **Tasks, import, export** — all local.

## Turning on Anu, the tutor

Anu needs one API key. **Settings** in the app walks through it, but in short:

1. Sign in at [openrouter.ai](https://openrouter.ai) with Google — free, no card.
2. Avatar (top right) → **Keys** → **Create Key**. Copy it; you only see it once.
3. Open the file `.env` in this folder and fill in:
   ```
   OPENROUTER_API_KEY="paste-your-key-here"
   OPENROUTER_MODEL="z-ai/glm-5.2:free"
   ```
4. Stop the app (Ctrl-C) and run `npm run dev` again.

That model costs nothing. If Anu ever feels vague about Estonian, swap the model line for
`anthropic/claude-sonnet-5` or `openai/gpt-4o` — a fraction of a cent per question and noticeably
sharper. An `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` works instead of OpenRouter if you prefer;
whichever key is present is the one used.

## Deploying it as a real website

Local mode needs nothing but a Postgres URL; hosting it for a class needs two more steps. The schema
was built Postgres-portable from the start (ADR-002), so this was a datasource swap rather than a
rebuild — documented in `docs/03-architecture.md` ADR-011:

1. Create a project at [supabase.com](https://supabase.com) → **Project Settings → Database →
   Connection string**. Copy the pooled string (port 6543) as `DATABASE_URL` and the direct one
   (port 5432) as `DIRECT_URL`.
2. In Vercel, import this repo and set the environment variables (Production, and Preview if you
   want preview deploys to work): `DATABASE_URL`, `DIRECT_URL`, plus whichever of
   `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` and `EKILEX_API_KEY` you're using.
   Never prefix any of these `NEXT_PUBLIC_` — they must stay server-side.
3. Deploy. Vercel's build runs `prisma generate && prisma db push && next build` (see
   `package.json`), so the schema is created/updated against `DIRECT_URL` automatically on every
   deploy — no manual push step. `prisma db push` fails the build rather than silently applying a
   destructive change, so an unusual schema change (e.g. dropping a column with data in it) shows up
   as a failed deploy asking you to confirm, not as quiet data loss.

Two things change once it's hosted rather than local: review needs a network path to the database
(it no longer runs on a train), and the TTS audio cache becomes per-instance instead of permanent,
since Vercel's filesystem is read-only outside `/tmp`. Both are explained in ADR-011.

### Adding Google sign-in (multi-user)

Every route is gated behind sign-in (`middleware.ts`); each Google account gets its own dictionary
deck, tasks and review history, while the dictionary itself stays shared — see ADR-012. Two accounts
to set up, both one-time:

1. **Google Cloud Console** → [console.cloud.google.com](https://console.cloud.google.com) →
   create a project (or pick an existing one) → **APIs & Services → OAuth consent screen**: fill in
   an app name and your email, external user type is fine for a small group. Then
   **Credentials → Create Credentials → OAuth client ID** → type **Web application** → add an
   **Authorized redirect URI**: `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase's
   callback, not Vercel's — find the exact URL in the next step). Save; copy the **Client ID** and
   **Client Secret**.
2. **Supabase dashboard** → your project → **Authentication → Providers → Google** → toggle it on,
   paste the Client ID and Client Secret from step 1, save. The callback URL to put in Google Cloud
   is shown right there on this page.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API — the
   anon/publishable key, safe to be public) in both your local `.env` and Vercel's environment
   variables.

Neither Google credential nor the Supabase service role key is ever needed in this app's own code —
the OAuth exchange happens entirely inside Supabase.

## Backing up

**Settings → Download a backup** writes a JSON file with every word, card and review, and the same
panel restores one. Merge is the default and cannot delete anything, so restoring the same file twice
is harmless; replacing everything is behind a typed confirmation.

Your review history is the one thing here that cannot be recreated — grab a copy now and then, and
try restoring it once while nothing is at stake. A backup you have never restored is a hypothesis.

## Commands

```
npm run dev        # development server
npm run build      # production build
npm run test       # unit tests (171) — no database needed; DB-backed tests skip themselves
npm run test:e2e   # browser checks (73) — needs the server running
npm run demo       # fill the deck with two months of sample history to look around
npm run typecheck  # tsc --noEmit
npm run db:seed    # reload the built-in dictionary
```

## How it is put together

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · Prisma + Postgres · `ts-fsrs` ·
TartuNLP speech · any OpenAI-compatible or Anthropic model.

```
lib/estonian/     the language model — cases, principal parts, gradation, answer checking.
                  No React, no Prisma, fully tested.
lib/srs/          FSRS scheduling and card generation.
lib/collections/  the learning path: units as references into the dictionary.
lib/gamification/ XP, levels and the daily quests. Pure functions over stats.
lib/stats/        heatmap, forecast and accuracy aggregation.
lib/progress/     the database side of the above, shared by Today, the path and /progress.
lib/offline/      the queue that lets a review session survive with no network.
lib/dict/         search.
lib/tutor/        provider-agnostic chat; keys stay server-side.
app/              routes; api/ holds the three server proxies.
prisma/data/      the built-in dictionary.
docs/             the full plan and the decisions behind it.
```

Three rules the code holds to, all explained in `docs/`:

- **Estonian forms are never invented.** Principal parts are stored; the eleven regular cases are
  derived from the genitive at render time. Where a form is unknown, the app shows a gap — an
  invented form gets drilled into memory by the SRS, which is worse than a blank.
- **No key ever reaches the browser.** The AI and speech services are called from server routes only.
- **Progress is derived, never stored.** XP, levels, streaks, quests and every chart are computed
  from the append-only review log on each request. There is no score column to increment, so there
  is no way to be awarded something that did not happen — and none of it can be lost in a restore.

## Credits

- Speech synthesis: [TartuNLP](https://tartunlp.ai), University of Tartu (MIT).
- The plan this was built from, including the audit of the original spec, is in `docs/`.
