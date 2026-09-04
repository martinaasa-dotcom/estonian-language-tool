import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Legal, P, S } from "@/components/Legal";
import { resolveOperator, SUPERVISORY_AUTHORITY } from "@/lib/legal/operator";
import { resolveRecipients, transfersOutsideEea } from "@/lib/legal/recipients";

export const metadata = { title: "Privacy" };

/*
  Read at request time rather than at build time, because most of what this
  page says is a fact about the deployment: who runs it, and which services it
  is configured to send anything to. A notice baked in at build would describe
  whatever the build machine happened to have set, which is usually nothing.
*/
export const dynamic = "force-dynamic";

/**
 * Written from the schema and from this deployment's own configuration, not
 * from a template. Every claim here is one somebody could check against
 * `prisma/schema.prisma` or against the environment the app is running in, and
 * it stays accurate only if it is updated when those are.
 *
 * The structure follows Article 13 of the GDPR, which is what a person has to
 * be told at the point their data is collected: who holds it, what is held,
 * why that is allowed, who else sees it, whether it leaves the Union, how long
 * it is kept, what they can demand, and who they complain to. The Estonian
 * Personal Data Protection Act applies the same rules here and adds the local
 * ones this page names, of which the age of consent is the one that changes
 * anything.
 */
export default function PrivacyPage() {
  const operator = resolveOperator();
  const recipients = resolveRecipients();
  const leavesTheUnion = transfersOutsideEea(recipients);

  return (
    <Legal title="Privacy" updated="2 September 2026">
      <P>
        Kodukeel is a tool for learning Estonian. This page says exactly what it stores
        about you, why it is allowed to, who else sees it, and how to get rid of it.
      </P>

      <S title="Who holds this">
        {operator.identified ? (
          <>
            <P>
              The controller of your data, which means the one answerable for it, is{" "}
              <strong>{operator.name}</strong>
              {operator.registryCode ? ` (registry code ${operator.registryCode})` : ""}
              , at {operator.address}. Write to{" "}
              <a href={`mailto:${operator.email}`} className="underline underline-offset-2">
                {operator.email}
              </a>{" "}
              about anything on this page, including any of the requests below.
            </P>
            <P>
              There is no data protection officer. This is a small installation and the
              law requires one only of a public body or of an operation whose core
              business is monitoring people at scale, which this is not. The address
              above reaches a person.
            </P>
          </>
        ) : (
          <P>
            <strong>Whoever runs this installation has not filled their name in.</strong>{" "}
            Kodukeel is software somebody installs rather than a service with one address,
            and the person or school running this copy is the one answerable for your data.
            They are supposed to be named here and are not, which is itself something you
            can complain about to the authority named further down. Ask whoever gave you
            the link. If you are running this yourself, set{" "}
            <code>OPERATOR_NAME</code>, <code>OPERATOR_ADDRESS</code> and{" "}
            <code>OPERATOR_EMAIL</code> and this paragraph becomes your details.
          </P>
        )}
      </S>

      <S title="What is stored, and why that is allowed">
        <P>
          <strong>Your identity.</strong> Signing in with Google gives us your email address
          and a user id, held by Supabase Auth. We never see your Google password, and we do
          not request access to anything else in your Google account. Without it there is no
          way to show you your own deck rather than somebody else&rsquo;s, so this is held to
          provide the service you asked for.
        </P>
        <P>
          <strong>Your learning.</strong> The cards in your deck, every review you have ever
          done (the grade, the moment, and how long you took), your tasks, your starred words,
          your badges and your settings. The review log is what makes the scheduling work.
          It is the app&rsquo;s memory of how well you know each word, and an app that
          forgets it is not the app you signed up for.
        </P>
        <P>
          <strong>Your level checks.</strong> Each sitting is kept: the levels it measured,
          how many questions it came from, and the rating you gave your own speaking. Nothing
          you record is uploaded, and no audio is stored anywhere.
        </P>
        <P>
          <strong>Your mock exams.</strong> A sat paper is kept whole: the level, your score,
          and the marked paper itself, question by question, with what was expected and what
          you gave. That includes <strong>the composition you wrote</strong>, kept in your own
          words, because a piece of writing is only worth going back to if it is the piece you
          actually wrote. It is the longest thing you write anywhere in this app, which is why
          it has a line of its own here. A paper you abandon is never written down at all. The
          spoken part is marked by you and nothing you record leaves your device.
        </P>
        <P>
          <strong>Your conversations in Situations.</strong> Each one you finish is kept whole: who was
          behind the desk, what was on the role card, what went wrong on purpose, every turn, and
          where each of the other side&apos;s lines came from. <strong>Nothing in a transcript is about
          you.</strong> You play a patient, a tenant, a customer, with a card of invented facts and a
          document number that is fiction, and you are never asked for your own. The words a
          conversation needed and you did not have are kept as a list, so they can be handed back.
          A conversation you walk out of is kept as one you walked out of; one you abandon by
          closing the tab is kept on your device only, and goes nowhere until you finish it.
        </P>
        <P>
          <strong>Your class, if you are in one.</strong> Joining with a code stores which
          class you joined, when, and the name you chose to be known by in it, which is the
          one place you can be under a name of your own choosing rather than your account.
          If you run a class, its name and its join code are stored against you. What a
          teacher sees of a pupil is only ever effort, never contents: reviews this week, a
          streak, words known, when they were last here, which grammar the class as a whole is
          weakest at, and which grammar that pupil personally is weakest at, as a percentage
          rolled up over their own reviews. Never a deck, a search or a specific answer.
          Leaving a class removes your membership of it, and deleting your account removes
          every class you are in and every class you run.
        </P>
        <P>
          <strong>Your workplace group, if an employer sponsors you.</strong> A group set up by
          an employer is the same membership row and shows them less than a teacher sees, not
          more: your name, whether you have been reviewing and when you last did, and one of
          four bands for the examination the group works towards. Not a percentage, not which
          grammar you personally find hard, and never a deck, a search or an answer. The band
          is withheld entirely until there is enough history behind it to mean something.
          Leaving stops all of it at once and takes nothing from your own deck.
        </P>
        <P>
          <strong>Your conversations with Anu.</strong> Messages you send the tutor and its
          replies are stored so the conversation survives a page reload.
        </P>
        <P>
          <strong>Pages you photograph.</strong> When you scan a page, what is kept is the word
          list you confirmed: the Estonian, the English, and which dictionary entry each word
          matched. <strong>The photograph itself is never stored.</strong> It is read once,
          on the way through, and dropped. It is not written to a database, not put in file
          storage, and not written to a log. A picture of your homework has your name at the
          top of it.
        </P>
        <P>
          <strong>What the tutor cost.</strong> For every request to the AI, we keep a record:
          which model answered, roughly how much text went in and out, and what it is
          estimated to have cost. The tutor runs on somebody&rsquo;s paid key and sign-up is
          open, so a per-person daily allowance is the only thing standing between an open
          door and an unbounded bill. This is kept because there is a legitimate interest in
          a free service surviving the week, and there is no version of that cap which works
          without counting.
        </P>
        <P>
          <strong>What you report as wrong.</strong> Anywhere the app cannot help you there
          is a button to tell us so. What you send is kept: what kind of problem it was, the
          screen you were on, what the app had just said to you, the correction you proposed
          and anything you wrote. Whoever runs this installation reads it, so treat that box
          as something another person will see, and please do not put anything private in it.
          It is kept because a shared dictionary that nobody can correct goes wrong quietly,
          and because you asked us to look at it. Your own reports and what happened to each
          are on the <strong>Suggestions</strong> page, they are in the export, and they are
          deleted with your account.
        </P>
        <P>
          <strong>Errors.</strong> When something breaks, we log the error message and where
          it happened, along with your account id, never your email. Anything that looks like
          a password or key is stripped out before it is written down. Same reason: an app
          nobody can debug is an app that stays broken.
        </P>
        <P>
          <strong>What is not stored.</strong> No analytics, no advertising identifiers, no
          third-party trackers, no profiling, and no cookie that is not needed to keep you
          signed in.
        </P>
        <P>
          <strong>How we tell whether the app works.</strong> We count, from the review log
          described above, how many people come back after a day, a week and a month. It is
          worked out from what is already there rather than collected separately, which is why
          there is still no tracker on this site. Only totals ever leave that page: no name, no
          address, no word you looked up, and a group of fewer than five people is reported as a
          size with no percentage, because &ldquo;one of two people came back&rdquo; is a fact
          about a person rather than a statistic.
        </P>
        <P>
          <strong>What learners of Estonian get wrong, counted.</strong> From the same review log,
          this installation can produce a table of how often each grammatical case, each stem
          change and each word is answered correctly, added up across everybody. It is worked out
          from what is already here, so nothing extra is collected and no new question is put to
          you. That table can be sent to people who teach Estonian or study how it is learned,
          because where a lot of learners go wrong is not something a textbook or a single
          classroom can measure and this can.
        </P>
        <P>
          What it holds is counts, and the rules it is built under are the point of it. Nothing is
          published that fewer than ten different people are behind, or that rests on fewer than
          fifty answers, and nothing where one person supplied more than half of a figure, because
          ten people is not ten people when one of them is most of the data. Anything below that is
          missing from the table rather than shown as a small number. Counts are rounded and people
          are counted in bands, so two versions of the table cannot be compared to work out what
          happened in between. There is no user id in it, no email, no date anybody studied, no
          word anybody searched for and no individual answer. By the time the table exists it is
          not about you and could not be turned back into anything about you, which is the whole
          reason it is safe to send.
        </P>
        <P>
          You can still say no. <strong>Settings → Anonymous statistics</strong> leaves your
          answers out of it, and out means your rows are skipped when the totals are worked out
          rather than removed from the answer afterwards. Nothing else about the app changes.
        </P>
      </S>

      <S title="What is kept on your own device">
        <P>
          One cookie keeps you signed in. Beyond that the app stores a few things in the
          browser itself: whether you chose the dark theme, whether you have already been
          offered the install prompt, an outbox holding any card you graded while the
          network was down, so that grade is not lost and is sent with the time you actually
          answered it, a mock exam paper you have started but not handed in, so that
          closing the tab three hours into a B2 paper does not throw the whole sitting away,
          and today&apos;s word puzzle, so a reload does not lose the guesses you have made.
        </P>
        <P>
          The unfinished paper holds your answers and when each part&apos;s clock runs out. It
          holds no marks and no questions: the paper is rebuilt from a seed and marked on the
          server, so nothing kept here can change a score. It is replaced as you write and
          removed the moment the paper is handed in. The puzzle keeps your guesses and
          nothing else, and today&apos;s word is worked out from the date rather than kept
          beside them.
        </P>
        <P>
          None of that is a tracker and none of it is shared with anybody. Estonian law
          requires your agreement before something is stored on your device unless it is
          strictly necessary for the service you asked for, and each of these is: a review
          app that silently drops the answers you gave on a train is broken, not private.
          That is why there is no cookie banner. Signing out removes the outbox, the saved
          session, the pages kept for offline use, any unfinished paper and any puzzle, so the next person
          on a shared computer starts from nothing; the theme and the install prompt stay,
          since they are about the device rather than about you. The browser also keeps a
          short code for which account last used it, so that a different account signing in
          clears the previous one&apos;s data even when nobody signed out. Clearing your browser
          storage removes all of it, and costs you nothing except any grade still waiting to
          be sent.
        </P>
      </S>

      <S title="Who else sees it">
        <P>
          This installation only talks to the services below, and nobody else. Each gets only
          what is described beside it, and none of them is paid to profile you.
        </P>
        <ul className="space-y-2 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {recipients.map((r) => (
            <li key={r.name}>
              <strong>{r.name}</strong>: {r.what}.{" "}
              {r.eea === true
                ? "In Estonia."
                : r.eea === false
                  ? "Outside the European Economic Area."
                  : "Where this is hosted depends on how the installation was set up, so ask the operator above."}
            </li>
          ))}
        </ul>
        <P>
          Your deck, your review history, your tasks and your level checks are never sent to
          any of them. The counted table described further up is the one thing that may go to
          somebody not on this list, and it holds none of those: it is totals, and it is only
          totals that at least ten people are behind.
        </P>
        {leavesTheUnion && (
          <P>
            <strong>Some of that leaves the European Economic Area.</strong> The AI providers
            are established outside it, so what you type to Anu and any page you photograph
            crosses a border to be read. That transfer rests on the standard contractual
            clauses the provider publishes, and nothing else. It is worth knowing that
            protection there is not identical to protection here. It is also avoidable: the
            tutor and the page scanner are the only features that do it, and using neither
            means nothing of yours leaves.
          </P>
        )}
        <P>
          None of it is sold, and we never use it to train a model ourselves. What a provider
          does with what we send them is governed by their own terms, and that is a real
          limit on this promise, not just a formality: some free tiers are free because the
          provider keeps the right to look at what goes through them.
        </P>
      </S>

      <S title="How long it is kept">
        <P>
          Your learning, your conversations and your scanned word lists are kept for as long
          as you keep the account, because their whole value is that they are long. The
          scheduling works off years of history and a level check is only useful next to the
          one before it.
        </P>
        <P>
          Spending records are kept for the running year, since the caps they enforce are
          daily. Error logs are short-lived by nature and hold no name. There is no separate
          archive, and no backup that outlives a deletion by more than the hosting
          provider&rsquo;s own retention window.
        </P>
      </S>

      <S title="What you can demand">
        <P>
          These are your rights under the GDPR, and the two that people actually want are
          buttons rather than requests.
        </P>
        <P>
          <strong>A copy of everything (access, and portability).</strong> Settings has an{" "}
          <strong>Export</strong> button that gives you the whole thing as a JSON file: every
          card, review, task, setting, scanned page, level check, mock exam paper with your
          composition in it, tutor message, suggested fix, starred word, badge and class
          membership. It is a
          real backup, and the same file restores into a fresh installation. One thing is held
          back: the spending record described above, since that is this installation&rsquo;s
          accounting rather than your work. It is deleted with your account like everything
          else.
        </P>
        <P>
          <strong>Erasure.</strong> <strong>Settings → Deleting your data</strong> removes all
          of that immediately, in one go, along with your sign-in record. The shared
          dictionary stays, because other learners have cards built on it, but any entry you
          edited stops being attributed to you. Take an export first: this keeps no copy. If
          this installation is not set up to delete the sign-in record itself, the button
          says so plainly rather than pretending, and the address at the top of this page is
          who to ask.
        </P>
        <P>
          <strong>Correction.</strong> Anything you can see, you can change: your settings,
          your cards, your tasks, your goal. A dictionary entry can be corrected too, and
          because the dictionary is shared, that correction is attributed to you until you
          delete your account. Where you would rather somebody looked at it first, the same
          entry has a button to suggest the change instead of making it.
        </P>
        <P>
          <strong>Restriction and objection.</strong> You can ask for processing to be paused
          or object to it, in writing, at the address above. In practice almost everything
          here exists only to deliver the app to you, so the usual answer to an objection is
          to stop using the part you object to, and erasure is the stronger and faster
          version of the same thing. The one objection that is a button rather than a letter is{" "}
          <strong>Settings → Anonymous statistics</strong>, which takes your answers out of the
          counts described above.
        </P>
        <P>
          There is no charge for any of this and no need to give a reason. A request made in
          writing is answered within a month.
        </P>
      </S>

      <S title="Nothing here decides anything about you">
        <P>
          The app estimates a CEFR level from what you answered, and predicts your chance of
          passing a mock exam. Neither is a decision with any legal or similar effect: they
          are study advice, checked directly against the dictionary rather than judged by a
          model, and every figure says how thin the evidence behind it is. No qualification,
          no admission and no result depends on them. There is no automated decision-making in
          the sense the law means, and no profiling.
        </P>
      </S>

      <S title="If you are not satisfied">
        <P>
          Ask the operator first, at the address at the top of this page. If that gets you
          nowhere you have the right to complain to the{" "}
          <strong>{SUPERVISORY_AUTHORITY.name}</strong> ({SUPERVISORY_AUTHORITY.localName}),
          which is the supervisory authority for Estonia:{" "}
          {SUPERVISORY_AUTHORITY.address}, {SUPERVISORY_AUTHORITY.phone},{" "}
          <a
            href={`mailto:${SUPERVISORY_AUTHORITY.email}`}
            className="underline underline-offset-2"
          >
            {SUPERVISORY_AUTHORITY.email}
          </a>
          ,{" "}
          <a
            href={SUPERVISORY_AUTHORITY.web}
            className="underline underline-offset-2"
            rel="noreferrer"
          >
            {SUPERVISORY_AUTHORITY.web}
          </a>
          . If you live elsewhere in the Union you may go to your own country&rsquo;s
          authority instead. You can also take it to court.
        </P>
      </S>

      <S title="Children">
        <P>
          In Estonia a person can agree to a service like this one for themselves from the age
          of 13, which is the age the Personal Data Protection Act sets. Below that, a parent
          has to agree. Kodukeel is not aimed at younger children and does not knowingly hold
          their data; if you believe a child under 13 has an account here without a
          parent&rsquo;s agreement, write to the address above and it will be deleted.
        </P>
        <P>
          A school running this for a class is the controller of its pupils&rsquo; data and
          answers for that agreement. What a teacher can see is deliberately narrow: how much
          work each pupil did, which grammar the class as a whole is weakest at, and which
          grammar each pupil personally is weakest at as a rolled-up percentage, never an
          individual&rsquo;s deck, their searches or a specific answer.
        </P>
        <P>
          An employer sponsoring a workplace group is the controller of that group&rsquo;s
          membership in the same way, and sees a narrower set again: effort, and a band for the
          paper the group is working towards. The difference is a different query rather than a
          hidden column, so there is no setting that widens it.
        </P>
      </S>

      <S title="Getting in touch">
        <P>
          Questions about your data go to the operator named at the top. See also the{" "}
          <Link href="/terms" className="underline underline-offset-2">terms</Link>.
        </P>
      </S>
    </Legal>
  );
}
