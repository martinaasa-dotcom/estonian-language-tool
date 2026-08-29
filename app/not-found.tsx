import { ButtonLink } from "@/components/Button";
import { Mascot } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <Mascot size={62} mood="thinking" className="float" />
      <h1 className="est text-2xl font-bold" style={{ color: "var(--ink)" }}>
        Seda lehte pole
      </h1>
      <p className="text-base" style={{ color: "var(--ink-2)" }}>
        There&rsquo;s no page here. If you were after a word, the dictionary takes Estonian or
        English, and inflected forms, which is usually what you actually have in front of you.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>
        <ButtonLink href="/">Back to Today</ButtonLink>
      </div>
    </main>
  );
}
