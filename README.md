# Sõnasepp — Estonian learning dashboard

A personal Estonian study workspace: a dictionary that shows the forms you actually have to
memorise, spaced-repetition flashcards, an AI grammar tutor, and homework tracking. Everything runs
on your own computer. No account, no bill, no data leaving the machine.

> **Status: working MVP.** The daily loop is complete — look a word up, add it to your deck, review
> it, ask about the grammar. Built from the plan in `docs/`; `docs/13-mvp-status.md` says what is in
> and what is deliberately not.

## Running it

You need [Node.js](https://nodejs.org) 20 or newer. Then, in this folder:

```bash
npm install       # fetches the libraries
npm run setup     # creates the database and loads 360 Estonian words
npm run dev       # starts the app
```

Open **http://localhost:3000**. That is the whole installation.

To stop it, press Ctrl-C in the terminal. To start again later, just `npm run dev`.

## What works without any API key

Everything except the tutor:

- **Dictionary** — 360 words (A1 to C1) with checked principal parts, consonant gradation and the
  full case table worked out from the genitive. Anything missing can be added by hand, principal
  parts and all.
- **Audio** — real Estonian speech from the University of Tartu's neural voice. No key, no setup.
- **Flashcards** — FSRS scheduling, seven card types, keyboard-only review.
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
npm run test       # unit tests (56)
npm run test:e2e   # browser checks (39) — needs the server running
npm run demo       # fill the deck with sample data to look around
npm run typecheck  # tsc --noEmit
npm run db:seed    # reload the built-in dictionary
```

## How it is put together

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · Prisma + SQLite · `ts-fsrs` ·
TartuNLP speech · any OpenAI-compatible or Anthropic model.

```
lib/estonian/   the language model — cases, principal parts, gradation. No React, fully tested.
lib/srs/        FSRS scheduling and card generation.
lib/dict/       search.
lib/tutor/      provider-agnostic chat; keys stay server-side.
app/            routes; api/ holds the three server proxies.
prisma/data/    the built-in dictionary.
docs/           the full plan and the decisions behind it.
```

Two rules the code holds to, both explained in `docs/`:

- **Estonian forms are never invented.** Principal parts are stored; the eleven regular cases are
  derived from the genitive at render time. Where a form is unknown, the app shows a gap — an
  invented form gets drilled into memory by the SRS, which is worse than a blank.
- **No key ever reaches the browser.** The AI and speech services are called from server routes only.

## Credits

- Speech synthesis: [TartuNLP](https://tartunlp.ai), University of Tartu (MIT).
- The plan this was built from, including the audit of the original spec, is in `docs/`.
