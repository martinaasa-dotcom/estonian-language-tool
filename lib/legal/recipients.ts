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
 * Where each provider is established. A judgment about the company, not about
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

/**
 * The host of a configured URL, or a plain admission that it is unreadable.
 *
 * Never the whole URL: a webhook path is a common place to put a token, and
 * this renders on a page anybody can read.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "an address this installation has configured";
  }
}

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
    /*
      And Wiktionary, on the same trigger and in the same breath, because it is
      the same lookup: Ekilex carries no English on a reader key, so a word it
      answers for is then asked about at Wikimedia. One request, one word, no
      account. It was missing from this list while the lookup that makes it has
      been in the app from the beginning.
    */
    recipients.push({
      name: "Wikimedia, which runs Wiktionary",
      what: "the same single word, asked for its English meaning, with no account attached",
      // Wikimedia Foundation is established in the United States.
      eea: false,
    });
  }

  recipients.push({
    name: "TartuNLP, at the University of Tartu",
    what: "a phrase you asked to hear read aloud, with no account attached",
    eea: true,
  });

  /*
    An operator-chosen endpoint that handled errors are posted to, if one is
    configured. It is redacted — no email address, and anything shaped like a
    credential is stripped — but it carries the opaque user id, and a user id
    plus a timestamp is personal data by any reading of Article 4.

    It was the one recipient this page could not name, because it is the one
    the software does not choose. Which made it exactly the one worth
    generating: the page is meant to be reused as-is by whoever deploys this,
    and it went from accurate to inaccurate the moment a deployer set a single
    variable, silently, with nothing anywhere to notice.

    The host is named rather than the URL. A reader needs to know who is on the
    other end; a path may carry a token, and this page is public.
  */
  const webhook = process.env.ERROR_WEBHOOK_URL?.trim();
  if (webhook) {
    recipients.push({
      name: `The error reporting endpoint at ${hostOf(webhook)}`,
      what: "a description of anything that breaks, with your user id and never your email",
      // Wherever the operator pointed it. Nothing here can tell.
      eea: null,
    });
  }

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
