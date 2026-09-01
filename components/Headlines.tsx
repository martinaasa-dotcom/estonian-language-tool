import { Newspaper } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import type { ReadableHeadline } from "@/lib/dict/headlines";

/**
 * Today's front page with a dictionary under it.
 *
 * Each headline is printed exactly as the feed spelled it, and every word the
 * dictionary vouches for is a link to that word's entry, dotted rather than
 * solid so a sentence still reads as a sentence. A word it will not vouch
 * for is left plain: a name, a compound the dictionary has not met, a form
 * no stored entry produces. The source is named because these are somebody
 * else's words and a reader deciding how much to trust a sentence wants to
 * know whose it is. See `lib/dict/headlines.ts`.
 */
export function Headlines({ headlines, host }: { headlines: ReadableHeadline[]; host: string | null }) {
  if (headlines.length === 0) return null;
  return (
    <section aria-labelledby="headlines-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="headlines-title" className="label-xs flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
          <Newspaper size={13} aria-hidden /> Read today&rsquo;s news
        </h2>
        {host && (
          <span className="text-2xs" style={{ color: "var(--ink-3)" }}>from {host}</span>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {headlines.map((headline, i) => (
          <li
            key={i}
            lang="et"
            className="rounded-[var(--r-lg)] border px-4 py-3 text-md leading-relaxed"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
          >
            {headline.tokens.map((token, j) =>
              token.lemma ? (
                <Link
                  key={j}
                  href={`/dictionary?q=${encodeURIComponent(token.lemma)}`}
                  className="rounded-sm underline decoration-dotted underline-offset-4 transition-ui hover:decoration-solid"
                  style={{ color: "var(--ink)", textDecorationColor: "var(--accent)" }}
                  title={token.lemma === token.text.toLocaleLowerCase("et") ? undefined : token.lemma}
                >
                  {token.text}
                </Link>
              ) : (
                <span key={j}>{token.text}</span>
              ),
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
        A dotted word opens its entry. The plain ones are names and words the dictionary cannot
        vouch for yet.
      </p>
    </section>
  );
}
