import Link from "next/link";
import { Legal, P, S } from "@/components/Legal";

export const metadata = { title: "Terms · Kodukeel" };

export default function TermsPage() {
  return (
    <Legal title="Terms" updated="29 August 2026">
      <P>
        Kodukeel is a study tool. These terms are short because the arrangement is
        simple: use it to learn Estonian, do not abuse the shared services behind it,
        and understand what it can and cannot promise you.
      </P>

      <S title="What it promises">
        <P>
          Inflected Estonian forms come from Ekilex, the lexicographic database of the
          Institute of the Estonian Language. They are not generated. Where a form is
          shown as derived from a stored genitive stem, it is labelled as derived.
        </P>
        <P>
          Anu, the AI tutor, is not authoritative. It may explain grammar and suggest an
          English translation, and it is structurally prevented from supplying an
          Estonian dictionary form, but its explanations can still be wrong. Anything
          it suggests is marked <em>AI · verify</em> and needs your confirmation before
          it becomes a card. Do not rely on it for an exam answer without checking.
        </P>
        <P>
          The app is provided as it is, with no warranty. It is a learning aid, not a
          certified language qualification.
        </P>
      </S>

      <S title="What is asked of you">
        <P>
          Use one account, and use it yourself. Do not use the tutor to generate content
          unrelated to learning Estonian. It runs on a metered key, and a per-day quota
          applies to every account so that one person cannot exhaust it for everyone.
        </P>
        <P>
          Do not automate bulk requests against the dictionary, the speech service or the
          tutor. Ekilex and TartuNLP are free academic services; the whole project depends
          on them not being abused.
        </P>
      </S>

      <S title="What you own">
        <P>
          Your deck, your review history, your tasks and your notes are yours. Export them
          whenever you like from Settings, in a format that restores into any installation.
          The built-in dictionary and anything retrieved from Ekilex is licensed CC BY 4.0
          by the Institute of the Estonian Language and is credited accordingly.
        </P>
      </S>

      <S title="Ending it">
        <P>
          You can stop and delete your data at any time. An installation may withdraw
          access to an account that is abusing the shared services described above.
        </P>
      </S>

      <S title="Changes">
        <P>
          If these terms change in a way that affects what happens to your data, the{" "}
          <Link href="/privacy" className="underline underline-offset-2">privacy page</Link>{" "}
          changes with them and both carry the date of the change.
        </P>
      </S>
    </Legal>
  );
}
