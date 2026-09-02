import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Legal, P, S } from "@/components/Legal";
import { resolveOperator } from "@/lib/legal/operator";
import { AI_TAG } from "@/lib/copy/values";

export const metadata = { title: "Terms" };

/*
  Same reason as the privacy page: who provides this service is a fact about
  the deployment, so it is read when the page is requested rather than baked in
  by whichever machine ran the build.
*/
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const operator = resolveOperator();

  return (
    <Legal title="Terms" updated="30 August 2026">
      <P>
        Kodukeel is a study tool. These terms are short because the arrangement is
        simple: use it to learn Estonian, do not abuse the shared services behind it,
        and understand what it can and cannot promise you.
      </P>

      <S title="Who provides it">
        {operator.identified ? (
          <P>
            This installation of Kodukeel is provided by <strong>{operator.name}</strong>
            {operator.registryCode ? `, registry code ${operator.registryCode}` : ""}, at{" "}
            {operator.address}. Reach them directly at{" "}
            <a href={`mailto:${operator.email}`} className="underline underline-offset-2">
              {operator.email}
            </a>
            . Estonian law asks a provider of an online service for exactly that: a name, a
            place, and a way to get hold of them quickly without going through a form.
          </P>
        ) : (
          <P>
            <strong>Whoever runs this installation has not filled their name in</strong>, and
            they are supposed to. Kodukeel is software somebody installs, so the provider of
            the service you are using is the person or school running this copy, not the
            people who wrote it. Ask whoever gave you the link. If that is you, setting{" "}
            <code>OPERATOR_NAME</code>, <code>OPERATOR_ADDRESS</code> and{" "}
            <code>OPERATOR_EMAIL</code> puts your details here and on the{" "}
            <Link href="/privacy" className="underline underline-offset-2">privacy page</Link>.
          </P>
        )}
        <P>
          The service costs nothing and there is nothing to buy, so none of the usual consumer
          purchase rules apply: no right of withdrawal, no payment terms. If an installation
          ever starts charging, that is a different arrangement and these terms do not cover it.
          What it costs somebody to run, and who that is, is set out on the{" "}
          <Link href="/funding" className="underline underline-offset-2">funding page</Link>.
        </P>
      </S>

      <S title="What it promises">
        <P>
          Every Estonian word form here comes from Ekilex, the dictionary database run by the
          Institute of the Estonian Language. None of it is generated. Where a form is shown
          as derived from a stored genitive stem, it is labelled as derived.
        </P>
        <P>
          <strong>Anu is a machine, and says so on every screen she speaks from.</strong> You
          are talking to a language model, not to a teacher, and the app is required to make
          that unmistakable rather than merely true. Which model answered is printed under
          each reply, because a screen naming the wrong one would be worse than naming none.
        </P>
        <P>
          She is not the final word on anything. She can explain grammar and suggest an
          English translation, and she is built so she can never hand you an Estonian
          dictionary form, but her explanations can still be wrong. Anything she suggests is
          marked <em>{AI_TAG}</em> and needs your confirmation before it becomes a card. Do
          not rely on her for an exam answer without checking it yourself.
        </P>
        <P>
          The app is provided as it is, with no warranty. It is a learning aid, not a
          certified language qualification.
        </P>
      </S>

      <S title="What is asked of you">
        <P>
          Use one account, and use it yourself. Do not use the tutor to generate content
          unrelated to learning Estonian. It runs on a key that costs money per use, so
          there is a daily limit on every account, to stop one person using it all up for
          everyone else.
        </P>
        <P>
          Do not write scripts to hammer the dictionary, the speech service or the tutor
          with requests. Ekilex and TartuNLP are free academic services, and this whole
          project depends on nobody abusing them.
        </P>
      </S>

      <S title="What you own">
        <P>
          Your deck, your review history, your tasks and your notes are yours. Export them
          whenever you like from Settings, in a format that restores into any installation.
          The dictionary is two sources joined, and they carry different licences, so it is
          worth being exact rather than tidy. Every Estonian form and every example sentence
          comes from Ekilex and is licensed <strong>CC BY 4.0</strong> by the Institute of
          the Estonian Language. Every English gloss that was not written for this project
          comes from <a
            href="https://en.wiktionary.org"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >English Wiktionary</a> and is licensed <strong>CC BY-SA 4.0</strong> by its
          contributors, which is the stricter of the two: a work built on it has to be
          shared on the same terms. Both are credited on the sign-in page and in the
          footer, and the split between them is the whole design of the dictionary rather
          than an accident of it.
        </P>
        <P>
          The order the commonest words are listed in comes from <a
            href="https://github.com/hermitdave/FrequencyWords"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >FrequencyWords</a>, a published count over the OpenSubtitles corpus, also
          licensed <strong>CC BY-SA 4.0</strong>. It decides nothing but an order: every
          word shown is the dictionary&rsquo;s own.
        </P>
      </S>

      <S title="Ending it">
        <P>
          You can stop and delete your data at any time. An installation may withdraw
          access to an account that is abusing the shared services described above.
        </P>
      </S>

      <S title="Which law applies">
        <P>
          Estonian law governs these terms and anything arising from them, and the Estonian
          courts are where a dispute ends up. Nothing here takes away a right you have as a
          consumer where you live: if the law of your own country gives you something these
          terms do not, that law wins.
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
