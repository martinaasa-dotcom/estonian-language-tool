import Link from "next/link";
import { Legal, P, S } from "@/components/Legal";

export const metadata = { title: "Privacy · Kodukeel" };

/**
 * Written from the schema, not from a template. Every claim here is one someone
 * could check against `prisma/schema.prisma`, and it stays accurate only if it
 * is updated when that file is.
 */
export default function PrivacyPage() {
  return (
    <Legal title="Privacy" updated="29 August 2026">
      <P>
        Kodukeel is a tool for learning Estonian. This page says exactly what it stores
        about you, why, and how to get rid of it. It describes the software; if you are
        using someone else&rsquo;s installation of it, they hold the database.
      </P>

      <S title="What is stored">
        <P>
          <strong>Your identity.</strong> Signing in with Google gives us your email address
          and a user id, held by Supabase Auth. We never see your Google password, and we do
          not request access to anything else in your Google account.
        </P>
        <P>
          <strong>Your learning.</strong> The cards in your deck, every review you have ever
          done (the grade, the moment, and how long you took), your tasks, your starred words,
          your badges and your settings. The review log is what makes the scheduling work.
          It is the app&rsquo;s memory of how well you know each word.
        </P>
        <P>
          <strong>Your level checks.</strong> Each sitting of the level check is kept: the levels it
          measured, how many questions it came from, and the rating you gave your own speaking.
          Nothing you record is uploaded, and no audio is stored anywhere.
        </P>
        <P>
          <strong>Your conversations with Anu.</strong> Messages you send the tutor and its
          replies are stored so the conversation survives a page reload.
        </P>
        <P>
          <strong>What is not stored.</strong> No analytics, no advertising identifiers, no
          third-party trackers, no cookies beyond the one that keeps you signed in.
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
      </S>

      <S title="What leaves this site">
        <P>
          <strong>Your tutor messages</strong> go to whichever AI provider this installation is
          configured with, to produce a reply. They are not used to train anything by us; the
          provider&rsquo;s own policy governs what they do with an API request.
        </P>
        <P>
          <strong>Dictionary lookups</strong> go to Ekilex, at the Institute of the Estonian
          Language, as a bare word with no account attached.
        </P>
        <P>
          <strong>Text you play aloud</strong> goes to the TartuNLP speech service, again as a
          bare phrase with no account attached.
        </P>
        <P>
          Your deck, your review history and your tasks are never sent anywhere.
        </P>
      </S>

      <S title="Your data, in your hands">
        <P>
          Settings has an <strong>Export</strong> button that gives you the whole thing as a
          JSON file: every card, review, task and setting. It is a real backup, and the same file
          restores into a fresh installation. Nothing is held back from it.
        </P>
        <P>
          <strong>Settings → Deleting your data</strong> removes your cards, reviews, tasks,
          messages, stars, badges, settings, level checks and usage records, in one transaction,
          immediately.
          The shared dictionary stays (other learners have cards built on it) but any entry you
          edited stops being attributed to you. Take an export first: this keeps no copy.
        </P>
      </S>

      <S title="How long it is kept">
        <P>
          For as long as you keep the account. There is no separate archive and no backup that
          outlives a deletion by more than the hosting provider&rsquo;s own retention window.
        </P>
      </S>

      <S title="Children">
        <P>
          Kodukeel is not aimed at children under 13 and does not knowingly hold their data.
        </P>
      </S>

      <S title="Getting in touch">
        <P>
          Questions about your data go to whoever runs this installation. See also the{" "}
          <Link href="/terms" className="underline underline-offset-2">terms</Link>.
        </P>
      </S>
    </Legal>
  );
}
