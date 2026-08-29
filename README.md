# Kodukeel — Estonian learning dashboard

*Kodukeel* — "home language". An Estonian study workspace: a dictionary that shows the forms you
actually have to memorise, spaced-repetition flashcards that work without a connection, seven kinds
of practice, an AI tutor that is structurally prevented from inventing Estonian, and homework
tracking that follows your course week by week.

It runs locally or hosted. Hosted, it uses Google sign-in and each account keeps its own deck; what
is stored and what leaves the site is on the [privacy page](app/privacy/page.tsx), written from the
schema rather than from a template.

> **Status: in use.** The daily loop is complete and the operational shell is real — CI, spend caps,
> offline review, error reporting. `docs/13-mvp-status.md` says what is in, what is deliberately
> not, and what is still known to be weak.

## Running it

You need [Node.js](https://nodejs.org) 20 or newer and a Postgres database — the app is hosted (see
"Deploying it as a real website" below), so local dev points at the same kind of database rather than
a zero-setup local file. The free tier of [supabase.com](https://supabase.com) works fine for this;
use a separate Supabase project from production if you'd rather not develop against live data.

```bash
npm install       # fetches the libraries
npm run setup     # copies .env.example to .env — fill in DATABASE_URL/DIRECT_URL first, then re-run
npm run dev       # starts the app
```

Open **http://localhost:3000**. That is the whole installation.

To stop it, press Ctrl-C in the terminal. To start again later, just `npm run dev`.

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
- **Flashcards** — FSRS scheduling, seven card types, keyboard-only review, and it keeps working
  with the network gone: grades queue on the device and replay in order when you are back. The
  review log is append-only, which is what makes that sync conflict-free.
- **Verb government** — which case a verb demands (`aitan sind`, `helistan sulle`). The error
  English speakers never stop making, and the one thing nothing else drills systematically.
- **Minimal pairs** — the length contrasts Estonian spelling only half records, found automatically
  wherever two forms in the dictionary differ by a doubled letter. Needs the speech service.
- **From your reading** — paste real Estonian; words already in your deck are blanked out. The
  answer is the form a native writer used, so nothing is generated.
- **Diagnosis** — not "you are weak at the partitive" but "you are fine at the partitive except on
  gradating stems", which names something you can go and study.
- **Leech clinic** — the cards you keep failing, with what their history actually says about *how*
  they are failing, instead of quietly burying them.
- **Tasks, import, export, week view** — the course week ties vocabulary and homework together.

## Writing practice, and why the AI can be trusted with it

The one exercise where you produce Estonian of your own: *write a sentence using `tuba` in the
inessive*. It is marked in two visibly separate parts, because they have different authorities
behind them.

Whether you produced the required form is decided by string comparison against Ekilex, **before any
model is called**. That verdict is certain, it costs nothing, and it still works with no API key.
Only the rest — is the sentence idiomatic, is the object case right — goes to the tutor, which is
what a language model is genuinely good at.

The model is then held to it in code, not in the prompt: every Estonian word in its feedback must be
one the dictionary supplied, one you wrote, or the English gloss. Anything else is a form it made up,
and the note is withheld rather than shown with a caveat. See `lib/tutor/verify.ts`. (The open-ended
chat with Anu is not restricted this way — it is a conversation, everything it suggests is tagged
`AI · verify`, and nothing becomes a flashcard answer without your confirmation.)

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

The default is still local-only (`file:./dev.db`), but the schema was built Postgres-portable from
the start (ADR-002), so hosting it is a datasource swap, documented in `docs/03-architecture.md`
ADR-011:

1. Create a project at [supabase.com](https://supabase.com) → **Connect** (or Project Settings →
   Database → Connection string). Take **both** strings from the `pooler.supabase.com` host:
   the **transaction pooler** (port 6543) as `DATABASE_URL`, with `?pgbouncer=true` appended, and
   the **session pooler** (port 5432) as `DIRECT_URL`. Percent-encode any special characters in
   the password.

   Do *not* use the direct `db.<project-ref>.supabase.co` host that the dashboard shows first: it
   resolves to IPv6 only, and Vercel has no IPv6 route to it, so every build dies with
   `P1001: Can't reach database server`. The poolers are IPv4. `DIRECT_URL` wants the *session*
   pooler specifically — it is a full Postgres session, so `prisma db push` can run schema changes
   through it, which the transaction pooler cannot.
2. In Vercel, import this repo and set the environment variables (Production, and Preview if you
   want preview deploys to work): `DATABASE_URL`, `DIRECT_URL`, plus whichever of
   `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` and `EKILEX_API_KEY` you're using.
   Never prefix any of these `NEXT_PUBLIC_` — they must stay server-side.
3. Deploy. Vercel's build runs `prisma generate && prisma db push && next build` (see
   `package.json`), so the schema is created/updated against `DIRECT_URL` automatically on every
   deploy — no manual push step. `prisma db push` fails the build rather than silently applying a
   destructive change, so an unusual schema change (e.g. dropping a column with data in it) shows up
   as a failed deploy asking you to confirm, not as quiet data loss.

Two things that used to change when hosted have since been fixed. Review works on a train again —
it is a PWA, grades go to a device-local outbox and replay when the connection returns. And the
audio cache is durable rather than per-instance: set `SUPABASE_SERVICE_ROLE_KEY` and clips are
content-addressed in Supabase Storage, fetched once for everyone rather than once per cold start.
Without that key it falls back to local disk, and Settings says so plainly.

**Set a spend cap.** The tutor is metered per user per day with a global ceiling on top
(`AI_DAILY_USD_GLOBAL`, default $20). The defaults are live whether or not you configure anything —
there is no way to turn metering off, because sign-up is open by default. If you would rather run a
private instance, `ALLOWED_EMAILS` or `ALLOWED_EMAIL_DOMAINS` turns the same deployment into one.

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
npm run dev            # development server
npm run build          # production build
npm run typecheck      # tsc --noEmit
npm run test           # unit tests — hermetic, no database, under two seconds
npm run test:db        # integration tests — needs a Postgres in DATABASE_URL
npm run check:secrets  # fails if a credential reached the client bundle
npm run demo           # fill the deck with sample data to look around
npm run db:seed        # reload the built-in dictionary
```

Browser tests need the server running with a stand-in session, which only works outside a
production build:

```
E2E_TEST_USER_ID=me npm run dev          # in one shell
node scripts/smoke-new.mjs               # every route renders, no console errors
node scripts/smoke-interact.mjs          # each mode does what it claims
```

CI runs typecheck, unit tests, integration tests against a real Postgres, the production build, and
the credential scan on every push.

## How it is put together

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · Prisma + Postgres · `ts-fsrs` ·
Supabase Auth · TartuNLP speech · any OpenAI-compatible or Anthropic model.

```
lib/estonian/   the language model — cases, principal parts, gradation. No React, fully tested.
lib/srs/        FSRS scheduling and card generation.
lib/dict/       search.
lib/tutor/      provider-agnostic chat and the writing grader; keys stay server-side.
lib/analysis/   diagnosis and leech classification over the review log.
lib/usage/      the spend ledger and the quota policy.
lib/offline/    the grade outbox and its replay rules.
app/            routes; api/ holds the server proxies.
prisma/data/    the built-in dictionary.
docs/           the full plan and the decisions behind it.
```

Four rules the code holds to, each enforced by something other than good intentions:

- **Estonian forms are never invented.** Principal parts are stored; the eleven regular cases are
  derived from the genitive at render time. Where a form is unknown the app shows a gap — an
  invented form gets drilled into memory by the SRS, which is worse than a blank. In the writing
  grader this is a code check over the model's output, not a line in the prompt.
- **No key ever reaches the browser.** Server routes only, and CI greps the built client bundle for
  key shapes on every push. It knows a public Supabase anon JWT from a `service_role` one.
- **The review log is append-only.** No foreign key ties it to a card, so deleting a card — or
  restoring a backup over the top of your deck — cannot destroy the history. There is an
  integration test for exactly that.
- **AI spending is capped.** Per user, per day, and globally. The ledger fails closed, and an
  unrecognised model is priced at the dearest rate in the table rather than at zero.

## Credits

- Speech synthesis: [TartuNLP](https://tartunlp.ai), University of Tartu (MIT).
- The plan this was built from, including the audit of the original spec, is in `docs/`.
