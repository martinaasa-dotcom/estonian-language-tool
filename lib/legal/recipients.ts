import { ekilexConfigured } from "@/lib/ekilex/client";
import { resolveProviders } from "@/lib/tutor/provider";

/**
 * Who this particular installation actually sends anything to, so the privacy
 * page can name them rather than describe them.
 *
 * Article 13(1)(e) asks for the recipients of personal data, and 13(1)(f) for
 * whether any of it goes outside the Union. A page that says "whichever AI
 * provider this installation is configured with" answers neither: the reader
 * cannot tell whether their writing is going to a company in Tallinn or in
 * California, and the operator cannot tell whether they have disclosed it.
 *
 * A deployment already knows the answer, because the answer is its own
 * configuration. So the page reads it. Labels only, never a model name and
 * never anything derived from a key: which company is on the other end is the
 * fact a reader needs, and the rest is operational detail that would only date.
 */

export interface Recipient {
  name: string;
  /** What of theirs goes there, in the reader's terms. */
  what: string;
  /**
   * Whether the service is established in the European Economic Area.
   * `false` makes the transfer disclosure apply; `null` means it depends on
   * an account setting this app cannot see.
   */
  eea: boolean | null;
}

/**
 * Where each provider is established. A judgement about the company, not about
 * a region setting on somebody's account, which is why the two that offer a
 * choice are recorded as unknown rather than guessed.
 */
const PROVIDER_HOME: Record<string, boolean | null> = {
  OpenRouter: false,
  Groq: false,
  "Google Gemini": false,
  Anthropic: false,
  OpenAI: false,
};

export function resolveRecipients(): Recipient[] {
  const recipients: Recipient[] = [];

  for (const label of [...new Set(resolveProviders().map((p) => p.label))]) {
    recipients.push({
      name: label,
      what: "what you type to Anu, and any page you photograph",
      eea: PROVIDER_HOME[label] ?? null,
    });
  }

  if (ekilexConfigured()) {
    recipients.push({
      name: "Ekilex, at the Institute of the Estonian Language",
      what: "a single word you looked up, with no account attached",
      eea: true,
    });
  }

  recipients.push({
    name: "TartuNLP, at the University of Tartu",
    what: "a phrase you asked to hear read aloud, with no account attached",
    eea: true,
  });

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    recipients.push({
      name: "Supabase",
      what: "your email address and everything in the database, as the host of both",
      // The project's region is chosen when it is created and is not readable
      // from here. Saying so is more use than guessing at it.
      eea: null,
    });
  }

  return recipients;
}

/** True when anything on the list is, or may be, outside the EEA. */
export function transfersOutsideEea(recipients: Recipient[]): boolean {
  return recipients.some((r) => r.eea !== true);
}
