import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Legal, P, S } from "@/components/Legal";
import { resolveOperator, SUPERVISORY_AUTHORITY } from "@/lib/legal/operator";

export const metadata = { title: "Accessibility" };

/*
  Force-dynamic for the reason the other public pages give: the feedback
  address on this page is the operator of this deployment, read from its own
  configuration, and a statement baked at build time would name whoever built
  it, which is usually nobody.
*/
export const dynamic = "force-dynamic";

const REPO = "https://github.com/martinaasa-dotcom/kodukeel/blob/main";

/**
 * The accessibility statement, in the shape the Web Accessibility Directive
 * asks for.
 *
 * Directive (EU) 2016/2102 wants a statement carrying the standard claimed, a
 * conformance status, the parts that do not conform and why, how the claim was
 * arrived at, when it was last reviewed, a way to complain, and the body a
 * complaint escalates to when the answer is unsatisfactory. Public funding in
 * Estonia checks for exactly that, and a project without one is answering a
 * procurement question with a shrug.
 *
 * EVERY CLAIM HERE IS GROUNDED IN SOMETHING THAT RUNS. The testing section
 * describes `scripts/a11y-check.mjs`, `scripts/test-design.mjs`,
 * `scripts/test-mobile.mjs` and `scripts/test-containment.mjs`, all four of
 * which run in CI on every change, and it names what those cannot see. The
 * gaps below were read off the code rather than copied from a template: the
 * mock examination really does close a part when its clock goes, and the
 * listening rounds really do withhold the text because the text is the answer.
 * When one of them is fixed it moves out of that list and into the paragraph
 * above it, which is what happened to the two practice clocks and then to the
 * viewport width.
 *
 * THE WIDTH IS THE ONE THAT MOVED, AND WHAT IT MAY NOW CLAIM IS EXACTLY WHAT
 * RUNS. This list said axe was swept at 1280 and nowhere else, which was true.
 * `scripts/a11y-check.mjs` sweeps 390 as well now, in both themes, plus the
 * sheet behind the phone bar's More button, which is a dialog no URL reaches
 * and which the desktop sweep never saw because the bar is `display: none`
 * above the breakpoint. So the claim here is two widths, one either side of the
 * breakpoint that swaps the navigation, and not "every width": the other three
 * that `test-mobile.mjs` drives are measured for targets and layout rather than
 * swept by axe, and the sentence below says so rather than rounding up.
 *
 * "Partially conformant" is the honest status and the only one worth writing.
 * A full conformance claim from a project that has never put this in front of
 * somebody using a screen reader every day is a claim a reviewer can dismiss
 * in one question.
 */
export default function AccessibilityPage() {
  const operator = resolveOperator();

  return (
    <Legal title="Accessibility statement" updated="5 September 2026">
      <P>
        Kodukeel is for people learning Estonian, and plenty of them are learning it because
        they have to. An app somebody cannot use is an app that has failed them at the point
        it mattered most. This page says what standard is being aimed at, what has been
        checked and how, where it falls short today, and how to tell us.
      </P>

      <S title="The standard">
        <P>
          The target is <strong>WCAG 2.2 level AA</strong>, and through it{" "}
          <strong>EN 301 549</strong>, which is the European harmonised standard that public
          bodies and their suppliers are measured against and which adopts WCAG for web
          content.
        </P>
      </S>

      <S title="Conformance status">
        <P>
          <strong>Partially conformant with WCAG 2.2 level AA.</strong> Partially conformant
          means most of the app meets the standard, and the parts named below do not.
        </P>
        <P>
          It is not fully conformant, and the reason is worth stating rather than leaving to
          be inferred: nobody who relies on assistive technology has yet been paid to sit down
          with this and try to use it. Everything below rests on automated checks and on the
          people who wrote the app testing their own work, which finds a great deal and is
          not the same as being told by somebody the app was failing.
        </P>
      </S>

      <S title="How the claim was tested">
        <P>
          Four suites run in the build on every change, against the real app in a real
          browser rather than against a component in isolation.
        </P>
        <ul className="space-y-2 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <li>
            <strong>axe over every route.</strong>{" "}
            <a
              href={`${REPO}/scripts/a11y-check.mjs`}
              className="underline underline-offset-2"
              rel="noreferrer"
            >
              a11y-check.mjs
            </a>{" "}
            loads every page the app has, not a chosen sample, and runs axe over each one,
            including its best-practice rules. It runs the whole sweep again in the dark
            theme, because light and dark are two palettes and a colour that clears the bar in
            one says nothing about the other. It runs it twice more at 390 pixels wide, which
            is a phone, because a phone here is different markup rather than the same markup
            narrower: the navigation rail is not drawn at all and a bar with a sheet behind it
            is drawn instead. That sheet is opened and swept too, since no address reaches it.
            It counts a one-character run of text as text,
            which is how a tick measured at 2.52 against a bar of 4.5 was found. Beyond axe it
            asserts exactly one main landmark and one heading per screen, a page title that is
            not the landing page&rsquo;s, and Estonian marked so a screen reader does not read
            it with English phonics.
          </li>
          <li>
            <strong>Contrast measured rather than reasoned about.</strong>{" "}
            <a
              href={`${REPO}/scripts/test-design.mjs`}
              className="underline underline-offset-2"
              rel="noreferrer"
            >
              test-design.mjs
            </a>{" "}
            reads the colours the browser actually painted and works out the ratio, in both
            themes, including states a page does not arrive in such as a row under a pointer.
            What a colour is worth depends on what it is sitting on, which no palette can tell
            you.
          </li>
          <li>
            <strong>Every target measured against 44px.</strong>{" "}
            <a
              href={`${REPO}/scripts/test-mobile.mjs`}
              className="underline underline-offset-2"
              rel="noreferrer"
            >
              test-mobile.mjs
            </a>{" "}
            drives the app at 360, 390, 430, 768 and 1280 pixels wide with a coarse pointer,
            which is the only condition under which that rule is real, and fails on a control
            below the floor.
          </li>
          <li>
            <strong>Text staying inside its box.</strong>{" "}
            <a
              href={`${REPO}/scripts/test-containment.mjs`}
              className="underline underline-offset-2"
              rel="noreferrer"
            >
              test-containment.mjs
            </a>{" "}
            walks every route at 360, 768 and 1280, in both themes, and asks whether anything
            is cut off, drawn outside its border or drawn on top of something else. Then it
            asks again with every run of text replaced by unbreakable text of the same length,
            which is the question Estonian actually poses.
          </li>
        </ul>
        <P>
          Alongside those, the app is built out of real buttons and links with a visible focus
          ring, animation is turned off for anybody whose system asks for reduced motion, no
          part of it uses a dragging movement, and colour is never the only thing carrying a
          distinction: a correct answer says so in words as well as in green.
        </P>
        <P>
          <strong>The two timed practice rounds can be set to run longer</strong> (WCAG 2.2.1,
          Timing Adjustable). The Case Sprint is a minute and the daily quest is two minutes,
          and both of those are now a starting point rather than the whole story: one setting
          stretches whichever round you open, up to ten times as long, which is the figure the
          criterion itself asks for. It is chosen before the round starts, in Settings, and
          both start screens link to it. The clock stays, because a speed round without one is
          a different round, and what was shutting people out was that the length was not
          theirs to set.
        </P>
        <P>
          <strong>No audit by a person with a disability using assistive technology has been
          commissioned.</strong> No screen reader user has been paid to test this, and there
          has been no third-party accessibility audit. Automated tools find perhaps a third of
          what is wrong with a page, and the third they find is the mechanical third.
        </P>
      </S>

      <S title="What is known not to conform">
        <P>
          These were found by reading the code rather than assumed from a template, and each
          one is a real screen.
        </P>
        <ul className="space-y-2 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <li>
            <strong>The mock examination parts run to a clock nobody can change</strong> (WCAG
            2.2.1, Timing Adjustable), and it closes the part when it goes. The paper is an
            imitation of a timed state examination and untimed practice of a timed paper
            measures something else, which is why it is the one clock left fixed, but a
            candidate who needs extra time in the real examination has no way to ask for it
            here.
          </li>
          <li>
            <strong>The listening, dictation and minimal-pair rounds require hearing</strong>{" "}
            (WCAG 1.2.1). There is no transcript before the answer, because the transcript is
            the answer, so a text alternative would remove the exercise. The text is shown as
            soon as the answer is in. Somebody who cannot use audio can use every other round,
            and the app does not require any of these three to make progress, but three
            rounds are closed to them.
          </li>
          <li>
            <strong>Speaking practice needs a microphone</strong> and asks the learner to
            judge their own attempt against a native rendering, because no recogniser
            available to this project is accurate enough on Estonian to mark one. Anybody who
            cannot record has no way through that round.
          </li>
          <li>
            <strong>axe is swept at two widths, not at every width.</strong> It runs at 1280
            and at 390, which is either side of the one breakpoint that swaps the navigation,
            so the phone bar and the sheet behind it are covered now. The widths between them,
            360, 430 and 768, are measured for targets, overflow and containment and are not
            swept by axe. A fault in markup that appears at one of those and at neither of
            these would be found by a person rather than by the build.
          </li>
          <li>
            <strong>Screens behind data are less covered.</strong> The automated sweep sees
            each page as it loads, plus one state a learner has to reach by doing something.
            A class roster with pupils in it, an examination part in progress and the puzzle
            grids in play are all reachable and all less tested than the pages around them.
          </li>
          <li>
            <strong>Reflow is checked at three widths rather than at 400% zoom.</strong> The
            widths are 360, 768 and 1280, which covers the cases the app was designed for.
            WCAG asks the question in terms of zoom, and that exact test has not been run.
          </li>
        </ul>
        <P>
          Where a limitation above is one of ours rather than one the exercise requires, it is
          something to fix rather than something to explain away. The practice clocks were the
          first of those and are adjustable now, and the phone sweep was the second: it used
          to be on this list and it runs in the build. The examination clock is the one that
          stays, for the reason beside it.
        </P>
      </S>

      <S title="When this was prepared">
        <P>
          Prepared on 5 September 2026 by the people who wrote the app, from the automated
          suites described above and from reading the source. It is reviewed whenever a screen
          changes enough to move one of the claims on it. There has been no external review.
        </P>
      </S>

      <S title="Telling us about a problem">
        {operator.identified && operator.email ? (
          <P>
            Write to{" "}
            <a href={`mailto:${operator.email}`} className="underline underline-offset-2">
              {operator.email}
            </a>
            . Say what you were trying to do, what happened, and what you were using to do it
            with, if you are able to. A message that says only &ldquo;this screen does not
            work with my screen reader&rdquo; is still worth sending: the person reading it
            can go and look.
          </P>
        ) : (
          <P>
            <strong>Whoever runs this installation has not filled their contact details
            in</strong>, so this statement has no address on it to write to. Ask whoever gave
            you the link. If you are running it, set <code>OPERATOR_NAME</code>,{" "}
            <code>OPERATOR_ADDRESS</code> and <code>OPERATOR_EMAIL</code>.
          </P>
        )}
        <P>
          Every screen in the app also has a way to report something that is wrong with it,
          beside the thing that went wrong, and those reports reach the same people.
        </P>
      </S>

      <S title="If that gets you nowhere">
        <P>
          The enforcement route for accessibility in Estonia runs through the state authority
          responsible for the Web Accessibility Directive, and a complaint about how personal
          data is handled goes to the <strong>{SUPERVISORY_AUTHORITY.name}</strong> (
          {SUPERVISORY_AUTHORITY.localName}), {SUPERVISORY_AUTHORITY.address},{" "}
          <a
            href={`mailto:${SUPERVISORY_AUTHORITY.email}`}
            className="underline underline-offset-2"
          >
            {SUPERVISORY_AUTHORITY.email}
          </a>
          . Write to us first, though. Somebody reads it, and the fix is usually faster than
          the complaint.
        </P>
        <P>
          See also{" "}
          <Link href="/trust" className="underline underline-offset-2">
            Trust and security
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          .
        </P>
      </S>
    </Legal>
  );
}
