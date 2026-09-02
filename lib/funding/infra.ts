/**
 * Everything this app runs on, named.
 *
 * `/privacy` already names whoever a deployment sends data to, because Article
 * 13 asks for the recipients. That is a shorter list than this one and it is a
 * different question: a service can be load-bearing without ever seeing a
 * learner. Postgres holds every row and is not a recipient of anything;
 * Wiktionary supplies most of the English in the dictionary and is only
 * contacted for a live lookup.
 *
 * So this is the other list, and the reason to publish it is that anybody
 * asked to pay for this deserves to know what they would be paying for, and
 * anybody thinking of running their own copy deserves to know what they are
 * taking on. Both of those readers are better served by a list that includes
 * the parts costing nothing, because "this is free and here is why it might
 * not stay free" is the useful sentence about an academic API.
 *
 * `whenItIsGone` is the column that makes this worth writing down. Every entry
 * is a real state the app has been in and handles, rather than a disaster
 * scenario: the dictionary works with no Ekilex key, review works with no
 * network, and the tutor is the only part that has nothing to fall back on.
 *
 * Pure: a catalogue, no configuration. Which of these a *particular*
 * deployment has switched on is read from the environment by the page, the way
 * `lib/legal/recipients.ts` does it.
 */

/** What kind of thing this is, which decides where it sits on the page. */
export type InfraKind =
  /** Somebody bills for it, by usage. */
  | "paid"
  /** Free, and free because a public institution decided so. */
  | "public"
  /** Free, and free because a company chose a free tier that could change. */
  | "goodwill"
  /** Nobody is billed because it runs on the reader's own device. */
  | "device";

export interface InfraItem {
  readonly id: string;
  readonly name: string;
  /** Who operates it. */
  readonly who: string;
  readonly kind: InfraKind;
  /** What it does for this app, in one line. */
  readonly does: string;
  /** What a learner loses if it stops answering. */
  readonly whenItIsGone: string;
  /** The environment variable that switches it on, where there is one. */
  readonly setBy?: string;
}

export const INFRA: readonly InfraItem[] = [
  {
    id: "postgres",
    name: "A Postgres database",
    who: "Supabase, on the hosted deployment. Anything speaking Postgres will do",
    kind: "paid",
    does: "Holds the dictionary, every deck, and the review log the scheduling is derived from.",
    whenItIsGone: "Nothing works, and the landing page falls back to a dictionary of five words.",
    setBy: "DATABASE_URL",
  },
  {
    id: "hosting",
    name: "Somewhere to run the app",
    who: "Vercel, on the hosted deployment. It is a Next.js app and will run anywhere Node runs",
    kind: "paid",
    does: "Renders every page and answers every action, in the same region as the database.",
    whenItIsGone: "The pages a phone has already seen still open, and nothing new loads.",
  },
  {
    id: "auth",
    name: "Sign-in",
    who: "Supabase Auth, with Google and a mailed link",
    kind: "paid",
    does: "Tells one learner's deck from another's. Without it the app is one local learner.",
    whenItIsGone: "Nobody can sign in. Anybody already signed in keeps working until their token expires.",
    setBy: "NEXT_PUBLIC_SUPABASE_URL",
  },
  {
    id: "ekilex",
    name: "Ekilex",
    who: "The Institute of the Estonian Language",
    kind: "public",
    does: "Every Estonian form and every example sentence. No key, and the built-in dictionary still has 6,050 words.",
    whenItIsGone: "Live lookups stop. The seeded dictionary carries on, and a word it lacks is simply missing.",
    setBy: "EKILEX_API_KEY",
  },
  {
    id: "wiktionary",
    name: "Wiktionary",
    who: "The Wikimedia Foundation",
    kind: "public",
    does: "The English meaning of most of the built-in dictionary, and the second half of a live lookup.",
    whenItIsGone: "A word Ekilex answers for shows its forms with no English beside them.",
  },
  {
    id: "tts",
    name: "Estonian speech",
    who: "TartuNLP, at the University of Tartu",
    kind: "public",
    does: "Reads a word or a sentence aloud, in any of twelve voices. Every clip is cached and asked for once.",
    whenItIsGone: "Cards are silent, and the listening part of the mock exam says so rather than failing.",
  },
  {
    id: "model",
    name: "A language model",
    who: "OpenRouter by default, or Anthropic, OpenAI, Groq or Google if a key for one is set",
    kind: "paid",
    does: "Anu, the note on a piece of writing, and reading a photographed page. Never a single Estonian form.",
    whenItIsGone: "Anu says she cannot reach anybody. Review, the dictionary and every drill are untouched.",
    setBy: "OPENROUTER_API_KEY",
  },
  {
    id: "storage",
    name: "Somewhere to keep the speech",
    who: "Supabase Storage, or the server's own disk",
    kind: "paid",
    does: "Holds each clip by its content, so a class of twenty-five asking at once costs one request upstream.",
    whenItIsGone: "Every cold start starts asking TartuNLP from scratch, which is what the cache exists to prevent.",
    setBy: "SUPABASE_SERVICE_ROLE_KEY",
  },
  {
    id: "domain",
    name: "A domain name",
    who: "A registrar, under the Estonian Internet Foundation",
    kind: "paid",
    does: "The address people type. The cheapest line here by a long way.",
    whenItIsGone: "The app is still there under whatever address the host gave it.",
  },
  {
    id: "news",
    name: "An Estonian news feed",
    who: "Whichever public feed the deployment points at",
    kind: "goodwill",
    does: "Suggests words off today's front page, and prints a few headlines the dictionary can open.",
    whenItIsGone: "The suggestion row draws from the season or at random instead, and says which.",
    setBy: "NEWS_FEED_URL",
  },
  {
    id: "errors",
    name: "Error reporting",
    who: "Wherever the operator points it, if anywhere",
    kind: "paid",
    does: "Posts a redacted description of anything that breaks. Off unless a deployment sets it.",
    whenItIsGone: "Errors are in the server log and nowhere else.",
    setBy: "ERROR_WEBHOOK_URL",
  },
  {
    id: "browser",
    name: "The learner's own phone",
    who: "Them",
    kind: "device",
    does: "Keeps 400 clips, 60 pages and every grade that could not be sent, so review works on a train.",
    whenItIsGone: "There is no app. This is the one piece of the infrastructure nobody can pay for.",
  },
];

/** The four kinds, in the order the page reads them, with what each one means. */
export const KIND_NOTE: Readonly<Record<InfraKind, string>> = {
  paid: "Somebody gets a bill for this, and it grows with use.",
  public: "Free, and free because a public institution in Estonia decided it should be.",
  goodwill: "Free at the tier this uses, on terms the company can change.",
  device: "Runs on the reader's own hardware and costs the deployment nothing.",
};
