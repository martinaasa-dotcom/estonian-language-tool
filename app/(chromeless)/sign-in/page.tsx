import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowLeft, Check } from "lucide-react";
import { supabaseConfigured } from "@/lib/auth/mode";
import { resolveOperator } from "@/lib/legal/operator";
import { Note } from "@/components/ui";
import { ButtonLink } from "@/components/Button";
import { MascotWatch } from "@/components/MascotWatch";
import { LetterTile } from "@/components/LetterTile";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

const PROMISES = [
  "A dictionary that answers with every form of the word",
  "Cards timed to when you are about to forget, plus sprints, listening and match",
  "Anu explains the grammar, and never invents a form",
];

/**
 * Two refusals used to be written into the URL and read by nothing.
 *
 * `/auth/callback` sends somebody to `?denied=1` when their address is not on
 * this deployment's allowlist, and to `?error=1` when an exchange failed or a
 * mailed link had already been used. Both landed on an ordinary sign-in
 * screen that said nothing at all, so the one person who needed telling why
 * they could not get in was shown the button that had just refused them.
 * Every other dead end in this app says what happened; this one now does too,
 * and where there is somebody to ask, it says who.
 */
export default async function SignInPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const configured = supabaseConfigured();
  const params = await searchParams;
  const operator = resolveOperator();
  /*
    EMAIL SIGN-IN IS OFF UNTIL SOMEBODY HAS SET UP SMTP, and that is a switch
    rather than a guess because the app cannot see the mail configuration.

    Supabase's built-in email service sends a couple of messages an hour for
    the whole project and says itself it is for testing. A form that takes an
    address, says "check your email" and mails nobody is worse than no form:
    the learner waits, checks spam, and concludes the app is broken, which it
    is not. So the door is only drawn once the operator says it opens.
  */
  const emailLink = (process.env.EMAIL_SIGN_IN ?? "").trim().toLowerCase() === "on";
  const denied = params.denied !== undefined;
  const failed = params.error !== undefined;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="wash" style={{ background: "var(--wash-1)", width: 520, height: 520, top: -200, left: -120 }} />
        <span className="wash" style={{ background: "var(--wash-2)", width: 460, height: 460, bottom: -220, right: -140, opacity: 0.65 }} />
      </div>

      <div className="relative w-full max-w-[440px]">
        {/*
          Two letters in the margin beside the card.

          The same ornament the landing page carries, on the screen a learner
          arrives at from it, so the two do not read as two different products.
          They hang off the sides rather than the corners because this card is
          440px inside a page that is at least 640 wherever they are drawn, and
          `sm` is where that becomes true.
        */}
        <LetterTile
          letter="õ" hue="blush" edge="left" character="tumble"
          tilt={-12} travel={{ x: 2, y: -26 }} reach={300}
          className="-left-9 top-28 hidden h-11 w-11 text-xl sm:block md:-left-14"
        />
        <LetterTile
          letter="ä" hue="mint" edge="right" character="hop"
          tilt={14} travel={{ x: -2, y: -22 }} delay={1.1} reach={300}
          className="-right-8 bottom-24 hidden h-10 w-10 text-lg sm:block md:-right-14"
        />
        <Link
          href="/welcome"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-60"
          style={{ color: "var(--ink-3)" }}
        >
          <ArrowLeft size={14} aria-hidden /> Back to the tour
        </Link>

        <div
          className="pop-in rounded-[var(--r-xl)] border p-8 text-center"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-lg)" }}
        >
          <MascotWatch size={62} className="float mx-auto" />
          <h1 className="mt-5 text-2xl font-bold leading-tight tracking-tight" style={{ color: "var(--ink)" }}>
            Tere tulemast tagasi
          </h1>
          <p className="mx-auto mt-2 max-w-[36ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Learn Estonian the way it is actually taught, by its cases. Sign in to reach your deck,
            your dictionary and every review you have ever done.
          </p>

          {denied && (
            <div className="mt-6 text-left">
              <Note tone="again">
                That address cannot use this copy of Kodukeel. It is set up for a named group, so
                sign in with the account you were invited with
                {operator.email ? <>, or ask {operator.email} to add you</> : null}.
              </Note>
            </div>
          )}
          {failed && !denied && (
            <div className="mt-6 text-left">
              <Note tone="hard">
                That sign-in did not go through. A mailed link works once and lasts an hour, so if
                yours is older than that, ask for a new one below.
              </Note>
            </div>
          )}

          <div className="mt-7">
            {configured ? (
              <SignInForm emailLink={emailLink} />
            ) : (
              <div className="rounded-[var(--r-lg)] p-5 text-left" style={{ background: "var(--raised)" }}>
                <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  This copy is running in local mode: no accounts, no signing in, everything just
                  stored right here on this machine. Add{" "}
                  <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                  <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{" "}
                  <code className="text-xs">.env</code> to turn on sign-in and
                  separate decks for each person.
                </p>
                <ButtonLink href="/" variant="primary" className="mt-4 w-full">Start studying</ButtonLink>
              </div>
            )}
          </div>

          <ul className="mt-7 flex flex-col gap-2.5 border-t pt-6 text-left" style={{ borderColor: "var(--rule-soft)" }}>
            {PROMISES.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}
                >
                  <Check size={12} strokeWidth={3} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="mx-auto mt-6 max-w-[46ch] text-center text-xs" style={{ color: "var(--ink-3)" }}>
          Estonian forms and example sentences from Ekilex (Institute of the Estonian Language,
          CC BY 4.0). English glosses from English Wiktionary (CC BY-SA 4.0). Speech from the
          University of Tartu.
        </p>
      </div>
    </main>
  );
}
