import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Legal, P, S } from "@/components/Legal";
import { CostExplorer } from "./CostExplorer";
import { resolveOperator } from "@/lib/legal/operator";
import { audioCacheIsDurable } from "@/lib/audio/store";
import { supabaseConfigured } from "@/lib/auth/mode";
import { ekilexConfigured } from "@/lib/ekilex/client";
import { resolveProviders } from "@/lib/tutor/provider";
import { priceFor } from "@/lib/usage/pricing";
import { DEFAULT_LIMITS } from "@/lib/usage/quota";
import { SERVICES } from "@/lib/funding/model";
import {
  COMPUTE, DEVTOOLS, DOMAIN, EMAIL, ERRORS, FX, MEASURED, MEASURED_ON,
  PRICES_CHECKED, SPEECH_MARKET, SUPABASE, VERCEL,
} from "@/lib/funding/facts";

export const metadata = { title: "Funding" };

/*
  Same reason as /privacy and /terms: most of what is worth saying here is a
  fact about this particular deployment rather than about the software, and a
  page baked at build time would describe whichever machine ran the build.
*/
export const dynamic = "force-dynamic";

/**
 * What this costs to run, who pays, and what money would change.
 *
 * WHY A PAGE AND NOT A PARAGRAPH IN THE README. Three kinds of reader end up
 * asking the same question from different directions. Somebody at a ministry
 * wants to know they are not underwriting a company's margin. A university
 * wants to know what happens to the work when the money stops. A company's
 * community budget wants to know the number is real and small. All three are
 * asking "what am I actually paying for", and the honest answer is an itemised
 * list with the arithmetic left in.
 *
 * A learner is a fourth reader and the one this page is most careful with. An
 * app for people whose data is the reason they are careful has to be able to
 * say where its money comes from, because "free" is the word that should make
 * somebody ask what is being sold. Nothing is. `/privacy` says that and this
 * page shows the bill that makes it possible.
 *
 * WHAT MAKES IT DIFFERENT FROM A PITCH. Every number is either measured on
 * this repository, quoted off a vendor's price list with the date it was read,
 * or named as an assumption the reader can change. The interactive part is not
 * decoration: a total somebody can move is a total they can check, and the
 * three least flattering findings on the page (that the floor is about
 * forty-six dollars before anybody arrives, that speech is the fastest-growing
 * line once anybody puts a figure on it, and that what is given to this app
 * outgrows what it pays for) are all things the model surfaced rather than
 * things anybody chose to admit.
 */
export default function FundingPage() {
  const operator = resolveOperator();
  const chain = resolveProviders();
  const modelLabels = [...new Set(chain.map((p) => p.label))];
  /*
    Whether the configured chain actually charges, asked of the pricing table
    rather than of the model's name.

    The first version of this read `isFreeModel`, which is true only of a slug
    ending in `:free`, so a deployment on Groq or Gemini (whose free models
    carry no such suffix) was told on a page about honesty that at least one of
    its models charges. The table is the thing that knows, and it fails the
    safe way: a model it has never heard of prices at the dearest rate in it,
    which reads here as "something on this chain costs money" rather than as a
    reassurance nobody checked.
  */
  const freeChain = chain.length > 0 && chain.every((p) => {
    const price = priceFor(p.model);
    return price.inputPerMTok === 0 && price.outputPerMTok === 0;
  });

  /*
    Whether a piece of the infrastructure is switched on *here*.

    Only ever a boolean, and never the value: several of these variables are
    keys, this page is public, and the whole point of the credential rules in
    CLAUDE.md is that nothing reads one out loud. An item with no variable
    behind it is always on, because it is Postgres, a host, or the reader's own
    phone.
  */
  const switchedOn = (key: string | undefined): boolean =>
    key === undefined ? true : Boolean(process.env[key]?.trim());

  return (
    <Legal title="Funding" updated="2 September 2026">
      <P>
        Kodukeel is free to use, there is nothing to buy, and nothing about you is sold.
        This page is the arithmetic behind that sentence: what the app runs on, what each
        piece costs, who is paying for the copy you are reading, and what would change if
        somebody funded it.
      </P>

      <S title="Who pays for this copy">
        {operator.identified ? (
          <P>
            This installation is run by <strong>{operator.name}</strong>, and they pay the
            bills on this page. Kodukeel is software somebody installs rather than one
            service, so every copy has its own operator and its own invoice.
          </P>
        ) : (
          <P>
            <strong>Whoever runs this installation has not filled their name in.</strong>{" "}
            Kodukeel is software somebody installs rather than one service, so the bills
            below are paid by whoever set this copy up. They are supposed to be named here
            and on the <Link href="/privacy" className="underline underline-offset-2">privacy page</Link>,
            and they are not. If that is you, set <code>OPERATOR_NAME</code>,{" "}
            <code>OPERATOR_ADDRESS</code> and <code>OPERATOR_EMAIL</code>.
          </P>
        )}
        <P>
          The code is MIT licensed and the dictionary data is not ours to license: Ekilex
          is CC BY 4.0 and Wiktionary is CC BY-SA 4.0, which is share-alike and therefore
          reaches the built dictionary as well. Anyone may run their own copy, and at one
          learner it costs the price of a domain name.
        </P>
      </S>

      <S title="What it runs on">
        <P>
          {SERVICES.length} things, and every one of them has a price on it. The list is
          longer than the one on{" "}
          <Link href="/privacy" className="underline underline-offset-2">the privacy page</Link>,
          because that page answers a narrower question: a service can hold every row in
          the database without ever being told who a learner is.
        </P>
        <P>
          <strong>Nothing anybody bills us for is counted as free.</strong> Every vendor
          here is on the plan a real deployment is on, because a free tier is one that
          pauses when nobody is on it or forbids commercial use, and modelling one would
          describe a deployment nobody runs.
        </P>
        <P>
          <strong>What is given is credited, not priced.</strong> Ekilex, Wiktionary and
          TartuNLP are public institutions that decided this work should be available.
          They ask for nothing, and that is a good arrangement rather than a gap in the
          accounts, so they are named here with what each one gives and the licence it
          comes under, and they appear in no total. Where buying the same thing is
          possible the panel says what that would come to, because the size of the gift is
          worth seeing. The last line of each card is the one worth reading: every entry
          is a state the app already handles rather than a disaster.
        </P>

        <ul className="space-y-3">
          {SERVICES.map((service) => (
            <li
              key={service.id}
              className="rounded-[var(--r-lg)] border p-4"
              style={{ background: "var(--surface)", borderColor: "var(--rule)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-base font-semibold" style={{ color: "var(--ink)" }}>
                  {service.name}
                </span>
                <span
                  className="label-xs"
                  style={{ color: switchedOn(service.setBy) ? "var(--mint-ink)" : "var(--ink-3)" }}
                >
                  {switchedOn(service.setBy) ? "on here" : "not set here"}
                </span>
              </div>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>{service.who}</p>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {service.does}
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-3)" }}>
                Without it: {service.whenItIsGone}
              </p>
            </li>
          ))}
        </ul>

        <P>
          <strong>On this installation.</strong> Sign-in is{" "}
          {supabaseConfigured()
            ? "on, so every learner has a deck of their own"
            : "off, so this copy is one local learner"}. Live dictionary lookups are{" "}
          {ekilexConfigured() ? "on" : "off, so the built-in dictionary answers by itself"}, and
          speech is cached {audioCacheIsDurable() ? "in shared storage" : "on the server's own disk"}.{" "}
          {chain.length === 0
            ? "No model key is set, so Anu is not here at all and nothing on this page bills for her."
            : `Anu is answered by ${modelLabels.length > 1
              ? `${modelLabels.slice(0, -1).join(", ")} and ${modelLabels[modelLabels.length - 1]}`
              : modelLabels[0]}, on ${freeChain
              ? "models that are given away at the tier this uses, which the panel below still prices as though they were bought"
              : "at least one model that charges"}.`}
        </P>
      </S>

      <S title="What it comes to">
        <P>
          Move the slider. Nothing here is stored and nothing is sent anywhere; the
          arithmetic runs in your browser, out of the same modules the app itself uses to
          decide when to stop spending.
        </P>
        <CostExplorer />
      </S>

      <S title="What was measured, and how">
        <P>
          Taken on {MEASURED_ON}, against Postgres 16 on one machine and a production
          build served locally. Each row says what to run to get the same number, because
          a figure nobody can reproduce is a claim rather than a measurement.
        </P>
        <div className="scroll-host overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Measurements taken on this repository</caption>
            <thead>
              <tr style={{ color: "var(--ink-3)" }}>
                <th scope="col" className="label-xs py-1 text-left">What</th>
                <th scope="col" className="label-xs py-1 text-left">How much</th>
              </tr>
            </thead>
            <tbody>
              {MEASURED.map((m) => (
                <tr key={m.what} className="border-t align-top" style={{ borderColor: "var(--rule)" }}>
                  <td className="py-2 pr-3" style={{ color: "var(--ink-2)" }}>
                    {m.what}
                    <span className="mt-0.5 block text-xs" style={{ color: "var(--ink-3)" }}>{m.how}</span>
                  </td>
                  <td className="py-2" style={{ color: "var(--ink)" }}>{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>
          Two of those are worth stopping on. A review row is 300 bytes, so a learner
          costs about 1.3 MB a year and the whole review log of a thousand people for a
          year fits in less space than a phone photograph album. And a spoken clip is
          uncompressed 32-bit audio, 88 KB for every second of it, which makes speech the
          largest thing this app moves by a wide margin. Turning the audio off in the
          panel above is the single biggest saving available, and it is also the feature
          hardest to argue for losing.
        </P>
      </S>

      <S title="Where the prices came from">
        <P>
          Read on {PRICES_CHECKED}. These are the numbers most likely to be out of date by
          the time you read this, which is why they carry a date rather than being folded
          into the total.
        </P>
        <ul className="space-y-1.5 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <li>
            <a href={VERCEL.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">Vercel</a>
            : ${VERCEL.pro.baseUsd} a month, then{" "}
            ${VERCEL.overage.perTransferGb} a gigabyte out past the first{" "}
            {VERCEL.pro.included.transferGb?.toLocaleString("en-GB")}.
          </li>
          <li>
            <a href={SUPABASE.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">Supabase</a>
            : ${SUPABASE.pro.baseUsd} a month with {SUPABASE.pro.included.dbGb} GB of
            database, {SUPABASE.pro.included.storageGb} GB of files and{" "}
            ${SUPABASE.computeCreditUsd} of compute credit.
          </li>
          <li>
            <a href={COMPUTE.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">Database instances</a>
            : from ${COMPUTE.sizes[0]!.usd} a month to ${COMPUTE.sizes[COMPUTE.sizes.length - 1]!.usd.toLocaleString("en-GB")}. This is the steepest ladder on the page.
          </li>
          <li>
            <a href={SPEECH_MARKET.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">Speech</a>
            : ${SPEECH_MARKET.usdPerMillionCharacters} a million characters, which is what{" "}
            {SPEECH_MARKET.equivalentOf} charge. TartuNLP charge nothing. That rate is here
            only to show the size of what they give, and it is in no total on this page.
          </li>
          <li>
            <a href={EMAIL.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">Resend</a>
            : ${EMAIL.pro.baseUsd} a month for{" "}
            {EMAIL.pro.included.emails?.toLocaleString("en-GB")} emails, then{" "}
            ${EMAIL.overage.perThousandEmails} a thousand.
          </li>
          <li>
            <a href={ERRORS.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">Error reporting</a>
            : ${ERRORS.team.baseUsd} a month for{" "}
            {ERRORS.team.included.events?.toLocaleString("en-GB")} events.
          </li>
          <li>
            <a href={DEVTOOLS.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">{DEVTOOLS.plan}</a>
            : {DEVTOOLS.eurPerMonth} euros a month. The tooling that writes and maintains
            this, which is the one line here that is not runtime and the one that does not grow.
          </li>
          <li>
            <a href={FX.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">The euro</a>
            : {FX.usdPerEur} dollars, the European Central Bank&rsquo;s reference rate. Two
            lines here are billed in euros and the rest in dollars, and every price is net
            of VAT, which is how each vendor quotes its own.
          </li>
          <li>
            <a href={DOMAIN.ref.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">A .ee domain</a>
            : about {DOMAIN.eurPerYear} euros a year.
          </li>
        </ul>
        <P>
          Ekilex, Wiktionary and TartuNLP are not on that list, because they do not charge
          and this page does not pretend otherwise. They are credited above instead, with
          what each one gives and the licence it comes under. Where buying the same thing
          is possible the panel says what that would come to, so the size of the gift is
          visible, and that figure is in no total here.
        </P>
      </S>

      <S title="What that number leaves out">
        <P>
          <strong>Somebody&rsquo;s time</strong>, which is the largest real cost of this
          project by a long way and is not a hosting bill. The panel above prices
          machines. It does not price writing the course, checking 5,363 English glosses
          against their sources, or reading the queue of corrections learners send in.
        </P>
        <P>
          <strong>Answering people.</strong> A dead end in this app offers to send a
          report, and somebody has to work through them for that to mean anything.
        </P>
        <P>
          <strong>A bad month.</strong> The projection is a steady month. It does not
          model the week something is on the radio, and a plan&rsquo;s included allowance is
          exactly where a spike is felt first.
        </P>
      </S>

      <S title="What money would change">
        <P>
          Four things, in the order they would matter.
        </P>
        <P>
          <strong>The daily cap on the tutor could go up.</strong> Every model call in the
          app is booked against a shared budget of{" "}
          ${(DEFAULT_LIMITS.dailyMicrosGlobal / 1e6).toFixed(0)} a day, which cannot be
          turned off and is what stops the one line that could run away. Raising it is a
          knob with a stop on it rather than an open cheque, and at ten thousand learners
          it is already the thing holding that line down.
        </P>
        <P>
          <strong>A school could keep its history.</strong> Everything on the progress
          screens is worked out from the review log on each request rather than stored, so
          the log is never thrown away and the database only grows. That is the right
          design and it is what makes the instance ladder the steepest line on this page.
        </P>
        <P>
          <strong>The corrections could be worked.</strong> The dictionary is built from
          Ekilex and Wiktionary rather than typed, which keeps invented Estonian out of it
          and does not make every entry right. Learners already report the wrong ones.
        </P>
        <P>
          <strong>Something could go back to the institutions this is built on.</strong>{" "}
          Ekilex, Wiktionary and TartuNLP ask for nothing and there is no suggestion they
          should start. But this app would not exist without any of the three, and at a
          size worth funding the decent thing is to support the work rather than only to
          use it: a contribution, a corrected entry sent back, or paying for the compute
          somebody else is currently absorbing.
        </P>
      </S>

      <S title="What it will not be spent on">
        <P>
          There is no advertising, no analytics script and no third-party tracker on any
          page of this app, which the{" "}
          <Link href="/privacy" className="underline underline-offset-2">privacy page</Link>{" "}
          states and the code keeps true: an analytics package was mounted here once, on
          every visitor of the hosted build, while that same notice said there was none.
          It was removed rather than the notice being edited.
        </P>
        <P>
          Nothing about a learner is sold, shared or used to train anything. Whether a
          teacher can see a pupil is answered narrowly and separately, and the answer is
          effort rather than contents. Every one of those promises costs money to keep
          rather than saving it, which is most of why this page exists.
        </P>
      </S>
    </Legal>
  );
}
