import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Legal, P, S } from "@/components/Legal";
import { resolveOperator, SUPERVISORY_AUTHORITY } from "@/lib/legal/operator";
import { resolveRecipients, transfersOutsideEea } from "@/lib/legal/recipients";

export const metadata = { title: "Trust" };

/*
  Same reason as /privacy, /terms and /funding: who runs this and what it is
  configured to talk to are facts about the deployment, so a page baked at
  build time would describe whichever machine ran the build.
*/
export const dynamic = "force-dynamic";

const REPO = "https://github.com/martinaasa-dotcom/kodukeel/blob/main";

/**
 * One page for the reader who has to decide whether this is safe to put in
 * front of other people.
 *
 * A school buying a licence, a ministry funding the work and an engineer
 * reviewing it are asking one question from three directions: who is
 * answerable, where does the data sit, what happens when it breaks, and what
 * has actually been checked by somebody. Each of those is already answered in
 * this repository, in a design document or in the environment the app is
 * running in, and none of it was on a page you could send somebody.
 *
 * WHAT MAKES IT WORTH READING IS THE PARAGRAPH THAT SAYS NO. There is no SOC 2
 * report, no ISO 27001 certificate and no penetration test, and a page that
 * left those out would be a page whose other claims are worth less. A buyer
 * who catches one overclaim stops believing the rest, which is the argument
 * `docs/27-security.md` opens its own gaps section with.
 *
 * Nothing here is asserted twice. The recipients are read from the deployment
 * exactly as `/privacy` reads them, so the two pages cannot disagree about
 * where anything goes.
 */
export default function TrustPage() {
  const operator = resolveOperator();
  const recipients = resolveRecipients();
  const leavesTheUnion = transfersOutsideEea(recipients);

  return (
    <Legal title="Trust and security" updated="5 September 2026">
      <P>
        This page is for whoever has to decide whether Kodukeel is safe to put in front of a
        class, a team or a grant. It says who is answerable, where the data sits, what has
        been checked and by whom, and what has not been done yet.
      </P>

      <S title="Who runs this">
        {operator.identified ? (
          <>
            <P>
              This installation is run by <strong>{operator.name}</strong>
              {operator.registryCode ? `, registry code ${operator.registryCode}` : ""}
              {operator.vatId ? `, VAT number ${operator.vatId}` : ""}, at {operator.address}.
              That is the controller of every learner&rsquo;s data here, and the party a
              contract would be with.
            </P>
            <P>
              One address reaches a person, for a data question, a security report or a
              procurement question alike:{" "}
              <a href={`mailto:${operator.email}`} className="underline underline-offset-2">
                {operator.email}
              </a>
              . There is no separate security mailbox yet, and saying so is more use than
              publishing one nobody reads.
            </P>
          </>
        ) : (
          <P>
            <strong>Whoever runs this installation has not filled their name in.</strong>{" "}
            Kodukeel is software somebody installs rather than a service with one address, so
            the copy you are reading is run by a person or an organisation who is supposed to
            be named here. Until they are, there is nobody on this page to sign anything with.
            If you are running it, set <code>OPERATOR_NAME</code>,{" "}
            <code>OPERATOR_ADDRESS</code> and <code>OPERATOR_EMAIL</code>.
          </P>
        )}
      </S>

      <S title="Where the data is held, and who else touches it">
        <P>
          Everything a learner does is held in this installation&rsquo;s own Postgres
          database. Nothing below gets a deck, a review history or an exam paper. The list is
          read from this deployment&rsquo;s configuration rather than written out here, so it
          is the actual set of services this copy talks to.
        </P>
        <ul className="space-y-2 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {recipients.map((r) => (
            <li key={r.name}>
              <strong>{r.name}</strong>: {r.what}.{" "}
              {r.eea === true
                ? "Established in the European Economic Area."
                : r.eea === false
                  ? "Established outside the European Economic Area."
                  : "Where this one sits depends on how the installation was set up, so ask the operator above."}
            </li>
          ))}
        </ul>
        {leavesTheUnion && (
          <P>
            <strong>Some of that leaves the European Economic Area</strong>, which matters for a
            transfer assessment. It rests on the standard contractual clauses each provider
            publishes. The two features that do it are the tutor and the page scanner, and a
            deployment configured with no AI provider has neither, so an organisation that
            cannot accept the transfer can run the rest of the app without it.
          </P>
        )}
        <P>
          There is no analytics vendor, no advertising identifier and no third-party tracker,
          which is a claim you can check rather than one to take on trust: the app has no
          third-party script tag anywhere in it, and the one thing it counts, whether people
          come back, is worked out from its own review log.{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>{" "}
          is the long version of all of this, written for the learner rather than the buyer.
        </P>
      </S>

      <S title="How a learner gets their data out, and how they delete it">
        <P>
          <strong>Export.</strong> Settings has a button that returns everything held about
          the account as a single JSON file: every card, review, task, setting, scanned word
          list, level check, mock exam paper with the composition in it, tutor message,
          conversation, suggestion, starred word and class membership. It is a real backup and
          the same file restores into a fresh installation, which is what makes it portability
          rather than a gesture.
        </P>
        <P>
          <strong>Erasure.</strong> The same screen deletes the account and everything in it,
          including the sign-in record, in one action and with no request to write. Where an
          installation is not configured to remove the sign-in record itself, the button says
          so plainly instead of reporting a success it did not achieve. Both live under{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>
          .
        </P>
        <P>
          A learner in a class or a workplace group can leave it, which stops the sponsor
          seeing anything and takes nothing out of their own deck.
        </P>
      </S>

      <S title="Security posture">
        <P>
          The security work is written down rather than summarised at you. Three documents,
          each of which names files you can open:
        </P>
        <ul className="space-y-2 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <li>
            <a
              href={`${REPO}/docs/27-security.md`}
              className="underline underline-offset-2"
              rel="noreferrer"
            >
              Security review and threat model
            </a>
            : what the system is, the five trust boundaries, fifteen threats worked through
            one at a time, the controls inventory, and a section on what has not been done.
          </li>
          <li>
            <a
              href={`${REPO}/docs/28-incident-response.md`}
              className="underline underline-offset-2"
              rel="noreferrer"
            >
              Incident response
            </a>
            : severity, who does what, the Article 33 clock for telling the supervisory
            authority, the Article 34 clock for telling the people affected, and runbooks for
            a leaked credential, a runaway AI bill, a database restore and a vandalised
            dictionary.
          </li>
          <li>
            <a
              href={`${REPO}/docs/29-controls.md`}
              className="underline underline-offset-2"
              rel="noreferrer"
            >
              Control map
            </a>
            : the controls a reviewer usually asks about, mapped to where each one lives.
          </li>
        </ul>
        <P>
          <strong>What this project does not have, stated plainly.</strong> There is no SOC 2
          report. There is no ISO/IEC 27001 certificate. The control map is a self-assessment
          written by the people who wrote the code, and it has not been reviewed by anybody
          outside this project. No external penetration test has been commissioned, so
          nobody has attacked this application under contract, and no independent reviewer has
          read the source for security faults. The code being public is not the same thing as
          having been audited.
        </P>
        <P>
          Four more limits worth naming before you find them yourself. Ownership of rows is
          enforced in application code and asserted in the build rather than by Postgres row
          level security. The Content Security Policy carries{" "}
          <code>&lsquo;unsafe-inline&rsquo;</code> in its script sources, for a reason written
          out in the code, and that is the weakest line in it. Nothing watches the logs
          continuously: there is no intrusion detection and no alerting beyond an optional
          error webhook. And multi-factor authentication is inherited from whatever the
          learner&rsquo;s Google account has rather than enforced here.
        </P>
        <P>
          What is there instead is a build that fails on the rules rather than a document
          asserting them: the credential scan greps the built client bundle for every
          server-only value, the invariant suite asserts the rules this project set itself,
          and the browser suites drive the real app. All of it runs on every change.
        </P>
        <P>
          One of those suites is worth naming, because it is the only one that asks these
          questions of a server rather than of the source. It sends the forged requests, reads
          back every security header, checks that what is behind a token stays behind it, and
          reads what the health endpoint is willing to say. It found something on its first
          run: a request carrying an address the app could not parse was being treated as a
          request carrying none, and those had different answers. That is the shape of thing it
          is for. It is a test written by the people who wrote the code, so it cannot tell you
          the design is right, and it is not the outside look this section says is missing.
        </P>
      </S>

      <S title="Availability">
        <P>
          <strong>There is no contractual service level today.</strong> No uptime percentage
          is promised anywhere in this app or in its terms, and nothing here is worth quoting
          as one. What can be said is what the app does when things break, which is a design
          decision rather than a hope.
        </P>
        <P>
          <strong>The review path survives losing the network.</strong> A grade answered with
          no connection goes into a queue in the browser and is sent later with the time it
          was actually answered, never dropped and never restamped, so a session on a train
          costs nothing. The service worker keeps the pages a learner was last on and an
          offline screen behind them, so the app opens rather than showing a browser error.
          The dictionary, the tutor and speech all need a connection and say so instead of
          serving something stale.
        </P>
        <P>
          <strong>When the database is unreachable</strong>, pages that need it fail to an
          error screen that says nothing has been lost, which is true: the review log is only
          ever appended to. The message itself stays on the server, because a database error
          can quote a connection string, and what the screen shows is a reference you can
          quote back at us.
        </P>
        <P>
          <strong>When an AI provider is having a bad minute</strong>, the app moves to the
          next provider configured rather than failing, and where none answers the feature
          says so. Nothing that teaches Estonian depends on a model: the dictionary, the deck,
          the scheduler, the exam and every practice round work with no AI provider at all.
        </P>
        <P>
          <strong>Health check.</strong>{" "}
          <a href="/api/health" className="underline underline-offset-2">
            /api/health
          </a>{" "}
          answers without a session and returns whether the app is up, whether the database
          answers, and the commit this build came from. It carries no counts and nothing about
          anybody. A monitor can poll it.
        </P>
      </S>

      <S title="Reporting a vulnerability">
        <P>
          Send it to{" "}
          {operator.identified && operator.email ? (
            <a href={`mailto:${operator.email}`} className="underline underline-offset-2">
              {operator.email}
            </a>
          ) : (
            "the operator named at the top of this page"
          )}{" "}
          with &ldquo;security&rdquo; in the subject line. The full policy is in{" "}
          <a href={`${REPO}/SECURITY.md`} className="underline underline-offset-2" rel="noreferrer">
            SECURITY.md
          </a>
          , including the response times we can actually keep: three working days to
          acknowledge, ten to tell you whether we agree it is a problem, and a target of
          thirty days to fix anything critical or high. If the report is sensitive enough that
          plain email worries you, say so in one line with no detail in it and we will arrange
          another channel.
        </P>
        <P>
          If a breach ever affects personal data, the incident document above is the procedure
          we follow, and the supervisory authority for Estonia is the{" "}
          {SUPERVISORY_AUTHORITY.name} ({SUPERVISORY_AUTHORITY.localName}).
        </P>
      </S>

      <S title="Accessibility">
        <P>
          Contrast is measured in a browser in both themes, every target is measured against
          44px under a coarse pointer, axe runs over every route on every change, and no audit
          by a person with a disability using assistive technology has been commissioned yet.
          The{" "}
          <Link href="/accessibility" className="underline underline-offset-2">
            accessibility statement
          </Link>{" "}
          says what is claimed, what is tested, and the gaps that are known.
        </P>
      </S>
    </Legal>
  );
}
